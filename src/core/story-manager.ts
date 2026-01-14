import {
  FieldID,
  LIST_FIELD_IDS,
  TEXT_FIELD_IDS,
} from "../config/field-definitions";
import { StoryDataManager, StoryField, DULFSField, StoryData } from "./story-data-manager";
import { LorebookSyncService } from "./lorebook-sync-service";
import { BrainstormDataManager } from "./brainstorm-data-manager";
import { ContentParsingService } from "./content-parsing-service";
import { DulfsService } from "./dulfs-service";
import { Debouncer } from "./debouncer";
import { Store, Listener } from "./store";

export { StoryField, DULFSField };

export type PersistenceMode = "immediate" | "debounce" | "none";

export class StoryManager {
  public store: Store<StoryData>;
  private dataManager: StoryDataManager;
  private lorebookSyncService: LorebookSyncService;
  private brainstormDataManager: BrainstormDataManager;
  private parsingService: ContentParsingService;
  private dulfsService: DulfsService;
  private debouncer: Debouncer;

  constructor() {
    this.dataManager = new StoryDataManager();
    // Initialize with default data
    this.store = new Store(this.dataManager.createDefaultData());
    
    this.lorebookSyncService = new LorebookSyncService(this.store);
    this.brainstormDataManager = new BrainstormDataManager(this.store);
    this.parsingService = new ContentParsingService();
    this.debouncer = new Debouncer();
    this.dulfsService = new DulfsService(
      this.store,
      this.lorebookSyncService,
      this.parsingService,
    );

    // Persistence Reaction
    this.store.subscribe((state, diff) => {
        // Skip initial empty diff
        if (diff.changed.length === 0) return;

        // Debounce save
        this.debouncer.debounceAction(
            "global-save",
            async () => {
                this.dataManager.setData(state);
                await this.dataManager.save();
                api.v1.log("Auto-saved story data");
            },
            1000 
        );
    });
  }

  async initializeStory(): Promise<void> {
    const savedData = await api.v1.storyStorage.get(
      StoryDataManager.KEYS.STORY_DATA,
    );

    if (savedData) {
      // Validate and migrate using DataManager logic
      this.dataManager.setData(savedData); // Temporary set to use its validation logic if needed or just use validate method
      // Actually DataManager.setData does validation.
      // We can just grab the data back.
      const validData = this.dataManager.data;
      if (validData) {
          this.store.update(s => {
              Object.assign(s, validData);
          });
      }
    } else {
      // Already initialized with default, just save it once
      await this.saveStoryData(true);
    }
  }

  public subscribe(listener: () => void): () => void {
    // Adapter for legacy subscribers (UI)
    return this.store.subscribe(() => listener());
  }

  // Exposed for advanced usage
  public subscribeToStore(listener: Listener<StoryData>) {
      return this.store.subscribe(listener);
  }

  private async debounceAction(
    key: string,
    action: () => Promise<void>,
    delay: number,
  ): Promise<void> {
    await this.debouncer.debounceAction(key, action, delay);
  }

  public async parseAndUpdateDulfsItem(
    fieldId: string,
    itemId: string,
  ): Promise<void> {
    await this.dulfsService.parseAndUpdateDulfsItem(fieldId, itemId);
  }

  public getSetting(): string {
    return this.store.get().setting || "Original";
  }

  public async setSetting(value: string): Promise<void> {
    this.store.update(s => s.setting = value);
    // Persistence handled by store reaction
  }

  public getFieldContent(fieldId: string): string {
    // Handle lorebook item reference: fieldId:itemId OR lorebook:entryId
    if (fieldId.includes(":")) {
      const [prefix, id] = fieldId.split(":");

      let item: DULFSField | undefined;
      if (prefix === "lorebook") {
        const match = this.dulfsService.findDulfsByLorebookId(id);
        item = match ? match.item : undefined;
      } else {
        const list = this.dulfsService.getDulfsList(prefix);
        item = list.find((i) => i.id === id);
      }

      return item ? item.lorebookContent || "" : "";
    }

    const data = this.store.get();
    // Safety check
    const field = data[fieldId as keyof StoryData] as StoryField;
    return field ? field.content : "";
  }

  public getDulfsList(fieldId: string): DULFSField[] {
    return this.dulfsService.getDulfsList(fieldId);
  }

  public isDulfsEnabled(fieldId: string): boolean {
    return this.dulfsService.isDulfsEnabled(fieldId);
  }

  public async setDulfsEnabled(
    fieldId: string,
    enabled: boolean,
  ): Promise<void> {
    await this.dulfsService.setDulfsEnabled(fieldId, enabled);
  }

  public async addDulfsItem(fieldId: string, item: DULFSField): Promise<void> {
    await this.dulfsService.addDulfsItem(fieldId, item);
  }

  public getDulfsSummary(fieldId: string): string {
    return this.store.get().dulfsSummaries[fieldId] || "";
  }

  public async setDulfsSummary(
    fieldId: string,
    summary: string,
    persistence: PersistenceMode = "debounce",
  ): Promise<void> {
    this.store.update(
      (s) => (s.dulfsSummaries = { ...s.dulfsSummaries, [fieldId]: summary }),
    );
    if (persistence === "immediate") {
      await this.saveStoryData(true);
    }
  }

  public async mergeDulfsNames(
    fieldId: string,
    names: string[],
  ): Promise<void> {
    const list = this.getDulfsList(fieldId);
    const existingNames = new Set(list.map((i) => i.name.toLowerCase().trim()));
    let added = false;

    for (const rawName of names) {
      const name = rawName.trim();
      if (!name) continue;
      if (existingNames.has(name.toLowerCase())) continue;

      const newItem: DULFSField = {
        id: api.v1.uuid(),
        category: fieldId as any,
        content: "",
        name: name,
        description: "",
        attributes: {},
        linkedLorebooks: [],
      };
      // Direct add
      await this.dulfsService.addDulfsItem(fieldId, newItem);
      added = true;
    }
  }

  public async updateDulfsItem(
    fieldId: string,
    itemId: string,
    updates: Partial<DULFSField>,
    persistence: PersistenceMode = "debounce",
    syncToLorebook: boolean = true,
  ): Promise<void> {
    await this.dulfsService.updateDulfsItem(
      fieldId,
      itemId,
      updates,
      persistence,
      syncToLorebook,
    );
    if (persistence === "immediate") {
        await this.saveStoryData(true);
    }
  }

  public async removeDulfsItem(fieldId: string, itemId: string): Promise<void> {
    await this.dulfsService.removeDulfsItem(fieldId, itemId);
  }

  public async clearDulfsList(fieldId: string): Promise<void> {
    await this.dulfsService.clearDulfsList(fieldId);
  }

  public findDulfsByLorebookId(
    entryId: string,
  ): { fieldId: string; item: DULFSField } | null {
    return this.dulfsService.findDulfsByLorebookId(entryId);
  }

  public isAttgEnabled(): boolean {
    return this.store.get().attgEnabled || false;
  }

  public async setAttgEnabled(enabled: boolean): Promise<void> {
    this.store.update(s => s.attgEnabled = enabled);
    if (enabled) {
      await this.lorebookSyncService.syncAttgToMemory(
        this.getFieldContent(FieldID.ATTG),
      );
    }
  }

  public isStyleEnabled(): boolean {
    return this.store.get().styleEnabled || false;
  }

  public async setStyleEnabled(enabled: boolean): Promise<void> {
    this.store.update(s => s.styleEnabled = enabled);
    if (enabled) {
      await this.lorebookSyncService.syncStyleToAN(
        this.getFieldContent(FieldID.Style),
      );
    }
  }

  public isTextFieldLorebookEnabled(fieldId: string): boolean {
    const data = this.store.get();
    if (!data.textFieldEnabled) return false;
    return data.textFieldEnabled[fieldId] === true;
  }

  public async setTextFieldLorebookEnabled(
    fieldId: string,
    enabled: boolean,
  ): Promise<void> {
    this.store.update((s) => {
      s.textFieldEnabled = { ...s.textFieldEnabled, [fieldId]: enabled };
    });
    await this.lorebookSyncService.syncTextField(fieldId);
  }

  public async setFieldContent(
    fieldId: string,
    content: string,
    persistence: PersistenceMode = "debounce",
    sync: boolean = true,
  ): Promise<void> {
    const data = this.store.get();

    if (fieldId.includes(":")) {
      const [prefix, id] = fieldId.split(":");
      if (prefix === "lorebook") {
        const match = this.findDulfsByLorebookId(id);
        if (match) {
          await this.updateDulfsItem(
            match.fieldId,
            match.item.id,
            { lorebookContent: content },
            persistence,
          );
        }
      } else {
        await this.updateDulfsItem(
          prefix,
          id,
          { lorebookContent: content },
          persistence,
        );
      }
      return;
    }

    // Direct field update
    let changed = false;
    this.store.update((s) => {
      const field = s[fieldId as keyof StoryData] as StoryField;
      if (field && field.content !== content) {
        // Replace object to trigger store change detection
        (s as any)[fieldId] = { ...field, content };
        changed = true;
      }
    });

    // Sync logic (side effects)
    if ((changed || persistence === "immediate") && sync) {
      if (fieldId === FieldID.ATTG && data.attgEnabled) {
        await this.lorebookSyncService.syncAttgToMemory(content);
      }
      if (fieldId === FieldID.Style && data.styleEnabled) {
        await this.lorebookSyncService.syncStyleToAN(content);
      }
      if (this.isTextFieldLorebookEnabled(fieldId)) {
        await this.lorebookSyncService.syncTextField(fieldId);
      }
    }

    if (persistence === "immediate") {
        await this.saveStoryData(true);
    }
  }

  public getBrainstormMessages(): { role: string; content: string }[] {
    return this.brainstormDataManager.getMessages();
  }

  public addBrainstormMessage(role: string, content: string): void {
    this.brainstormDataManager.addMessage(role, content);
  }

  public setBrainstormMessages(
    messages: { role: string; content: string }[],
  ): void {
    this.brainstormDataManager.setMessages(messages);
  }

  public getConsolidatedBrainstorm(): string {
    return this.brainstormDataManager.getConsolidated();
  }

  public async clearAllStoryData(): Promise<void> {
    const data = this.store.get();

    // 1. Clear DULFS fields (Deletes all DULFS Lorebook content and categories)
    for (const fieldId of LIST_FIELD_IDS) {
      await this.clearDulfsList(fieldId);
    }

    // 2. Clear External Memory (ATTG / Style)
    if (data.attgEnabled) {
      await this.lorebookSyncService.syncAttgToMemory("");
    }
    if (data.styleEnabled) {
      await this.lorebookSyncService.syncStyleToAN("");
    }

    // 3. Delete Text Field Lorebook Entries
    for (const fieldId of TEXT_FIELD_IDS) {
      const entryId = data.textFieldEntryIds[fieldId];
      if (entryId) {
        try {
          await api.v1.lorebook.removeEntry(entryId);
        } catch (e) {
          // Ignore
        }
      }
    }

    // 4. Create Fresh State
    const defaultData = this.dataManager.createDefaultData();

    // 5. Preserve Brainstorm Data
    const oldBrainstorm = data[FieldID.Brainstorm];
    if (oldBrainstorm) {
      defaultData[FieldID.Brainstorm] = oldBrainstorm;
    }

    // 6. Apply Fresh State
    this.store.update(s => {
        Object.assign(s, defaultData);
    });
    
    await this.saveStoryData(true);
  }

  public async generateLorebookKeys(
    entryId: string,
    content: string,
  ): Promise<void> {
    await this.lorebookSyncService.generateAndSyncKeys(entryId, content);
  }

  public async saveStoryData(notify: boolean = true): Promise<void> {
    this.dataManager.setData(this.store.get());
    await this.dataManager.save();
    // Notification handled by store listeners
  }

  public async saveFieldDraft(fieldId: string, content: string): Promise<void> {
    await this.setFieldContent(fieldId, content, "none", false);
  }
}
