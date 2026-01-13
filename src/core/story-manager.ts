import {
  FieldID,
  LIST_FIELD_IDS,
  TEXT_FIELD_IDS,
} from "../config/field-definitions";
import { StoryDataManager, StoryField, DULFSField } from "./story-data-manager";
import { LorebookSyncService } from "./lorebook-sync-service";
import { BrainstormDataManager } from "./brainstorm-data-manager";
import { ContentParsingService } from "./content-parsing-service";
import { DulfsService } from "./dulfs-service";
import { Debouncer } from "./debouncer";

export { StoryField, DULFSField };

export type PersistenceMode = "immediate" | "debounce" | "none";

export class StoryManager {
  private dataManager: StoryDataManager;
  private lorebookSyncService: LorebookSyncService;
  private brainstormDataManager: BrainstormDataManager;
  private parsingService: ContentParsingService;
  private dulfsService: DulfsService;
  private debouncer: Debouncer;

  constructor() {
    this.dataManager = new StoryDataManager();
    this.lorebookSyncService = new LorebookSyncService(this.dataManager);
    this.brainstormDataManager = new BrainstormDataManager(this.dataManager);
    this.parsingService = new ContentParsingService();
    this.debouncer = new Debouncer();
    this.dulfsService = new DulfsService(
      this.dataManager,
      this.lorebookSyncService,
      this.parsingService,
    );
  }

  async initializeStory(): Promise<void> {
    const savedData = await api.v1.storyStorage.get(
      StoryDataManager.KEYS.STORY_DATA,
    );

    if (savedData) {
      this.dataManager.setData(savedData);
    } else {
      this.dataManager.setData(this.dataManager.createDefaultData());
      await this.dataManager.save();
    }
  }

  public subscribe(listener: () => void): () => void {
    return this.dataManager.subscribe(listener);
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
    return this.dataManager.data?.setting || "Original";
  }

  public async setSetting(value: string): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;
    if (data.setting !== value) {
      data.setting = value;
      await this.dataManager.save();
    }
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

    const field = this.dataManager.getStoryField(fieldId);
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
    return this.dataManager.getDulfsSummary(fieldId);
  }

  public async setDulfsSummary(
    fieldId: string,
    summary: string,
    persistence: PersistenceMode = "debounce",
  ): Promise<void> {
    const current = this.getDulfsSummary(fieldId);
    if (current !== summary) {
      this.dataManager.setDulfsSummary(fieldId, summary);
      
      if (persistence === "immediate") {
        await this.dataManager.save();
        this.dataManager.notify();
      } else if (persistence === "debounce") {
        await this.debounceAction(
          `save-summary-${fieldId}`,
          async () => {
            await this.dataManager.save();
            this.dataManager.notify();
          },
          1000,
        );
      }
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
      // Direct add without full save yet
      await this.dulfsService.addDulfsItem(fieldId, newItem);
      added = true;
    }

    if (added) {
      await this.saveStoryData(true);
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
    return this.dataManager.data?.attgEnabled || false;
  }

  public async setAttgEnabled(enabled: boolean): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;
    data.attgEnabled = enabled;
    await this.dataManager.save();
    if (enabled) {
      await this.lorebookSyncService.syncAttgToMemory(
        this.getFieldContent(FieldID.ATTG),
      );
    }
  }

  public isStyleEnabled(): boolean {
    return this.dataManager.data?.styleEnabled || false;
  }

  public async setStyleEnabled(enabled: boolean): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;
    data.styleEnabled = enabled;
    await this.dataManager.save();
    if (enabled) {
      await this.lorebookSyncService.syncStyleToAN(
        this.getFieldContent(FieldID.Style),
      );
    }
  }

  public isTextFieldLorebookEnabled(fieldId: string): boolean {
    const data = this.dataManager.data;
    if (!data || !data.textFieldEnabled) return false;
    return data.textFieldEnabled[fieldId] === true;
  }

  public async setTextFieldLorebookEnabled(
    fieldId: string,
    enabled: boolean,
  ): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;

    if (!data.textFieldEnabled) {
      data.textFieldEnabled = {};
    }

    data.textFieldEnabled[fieldId] = enabled;
    await this.dataManager.save();
    await this.lorebookSyncService.syncTextField(fieldId);
  }

  public async setFieldContent(
    fieldId: string,
    content: string,
    persistence: PersistenceMode = "debounce",
    sync: boolean = true,
  ): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;

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

    const field = this.dataManager.getStoryField(fieldId);
    let changed = false;

    if (field) {
      if (field.content !== content) {
        field.content = content;
        changed = true;
      }
    }

    // Force sync if explicitly requested with immediate persistence (end of generation),
    // or if content changed and sync is requested.
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

    if (changed || persistence === "immediate") {
      if (persistence === "immediate") {
        await this.dataManager.save();
        this.dataManager.notify();
      } else if (changed && persistence === "debounce") {
        await this.debounceAction(
          `save-global-${fieldId}`,
          async () => {
            await this.dataManager.save();
            this.dataManager.notify();
            api.v1.log(`Auto-saved global story data (${fieldId})`);
          },
          250,
        );
      }
      // If persistence === "none", do nothing (content is updated in memory)
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
    const data = this.dataManager.data;
    if (!data) return;

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

    // 3. Delete Text Field Lorebook Entries (Prevent orphans)
    // We must manually delete them because we are about to lose their IDs by resetting the state.
    for (const fieldId of TEXT_FIELD_IDS) {
      const entryId = data.textFieldEntryIds[fieldId];
      if (entryId) {
        try {
          await api.v1.lorebook.removeEntry(entryId);
        } catch (e) {
          // Ignore if already gone
        }
      }
    }

    // 4. Create Fresh State
    const defaultData = this.dataManager.createDefaultData();

    // 5. Preserve Brainstorm Data
    // We want to keep the chat history even if we clear the structured data
    const oldBrainstorm = this.dataManager.getStoryField(FieldID.Brainstorm);
    if (oldBrainstorm) {
      defaultData[FieldID.Brainstorm] = oldBrainstorm;
    }

    // 6. Apply Fresh State
    this.dataManager.setData(defaultData);
    await this.saveStoryData(true);
  }

  public async generateLorebookKeys(
    entryId: string,
    content: string,
  ): Promise<void> {
    await this.lorebookSyncService.generateAndSyncKeys(entryId, content);
  }

  public async saveStoryData(notify: boolean = true): Promise<void> {
    await this.dataManager.save();
    if (notify) {
      this.dataManager.notify();
    }
  }

  public async saveFieldDraft(fieldId: string, content: string): Promise<void> {
    await this.setFieldContent(fieldId, content, "none", false);
  }
}
