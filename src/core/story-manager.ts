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
    await this.dulfsService.setDulfsEnabled(
      fieldId,
      enabled,
      this.saveStoryData.bind(this),
    );
  }

  public async addDulfsItem(fieldId: string, item: DULFSField): Promise<void> {
    await this.dulfsService.addDulfsItem(
      fieldId,
      item,
      this.saveStoryData.bind(this),
    );
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
    await this.dulfsService.removeDulfsItem(
      fieldId,
      itemId,
      this.saveStoryData.bind(this),
    );
  }

  public async clearDulfsList(fieldId: string): Promise<void> {
    await this.dulfsService.clearDulfsList(
      fieldId,
      this.saveStoryData.bind(this),
    );
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
    return this.dataManager.data?.textFieldEnabled?.[fieldId] === true;
  }

  public async setTextFieldLorebookEnabled(
    fieldId: string,
    enabled: boolean,
  ): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;

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
      } else if (changed && persistence === "debounce") {
        await this.debounceAction(
          `save-global-${fieldId}`,
          async () => {
            await this.dataManager.save();
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
    // 1. Clear DULFS fields (handles lorebook cleanup)
    for (const fieldId of LIST_FIELD_IDS) {
      await this.clearDulfsList(fieldId);
    }

    // 2. Clear Text fields (excluding Brainstorm)
    for (const fieldId of TEXT_FIELD_IDS) {
      if (fieldId === FieldID.Brainstorm) continue; // Do not clear brainstorm

      // Handle ATTG/Style special cases for cleanup
      if (fieldId === FieldID.ATTG) {
        if (this.isAttgEnabled()) {
          // Sync empty string to memory first to clear it
          await this.setFieldContent(fieldId, "", "none", true);
          await this.setAttgEnabled(false);
        } else {
          await this.setFieldContent(fieldId, "", "none", false);
        }
      } else if (fieldId === FieldID.Style) {
        if (this.isStyleEnabled()) {
          // Sync empty string to memory first to clear it
          await this.setFieldContent(fieldId, "", "none", true);
          await this.setStyleEnabled(false);
        } else {
          await this.setFieldContent(fieldId, "", "none", false);
        }
      } else {
        await this.setFieldContent(fieldId, "", "none", true);
      }
    }

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
      this.dataManager.notifyListeners();
    }
  }

  public async saveFieldDraft(fieldId: string, content: string): Promise<void> {
    await this.setFieldContent(fieldId, content, "none", false);
  }
}
