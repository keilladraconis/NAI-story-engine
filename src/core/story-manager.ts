import {
  FieldID,
  LIST_FIELD_IDS,
} from "../config/field-definitions";
import { StoryDataManager, StoryField, DULFSField } from "./story-data-manager";
import { LorebookSyncService } from "./lorebook-sync-service";
import { BrainstormDataManager } from "./brainstorm-data-manager";

export { StoryField, DULFSField };

export class StoryManager {
  private dataManager: StoryDataManager;
  private lorebookSyncService: LorebookSyncService;
  private brainstormDataManager: BrainstormDataManager;

  private saveTimeout?: any;

  constructor() {
    this.dataManager = new StoryDataManager();
    this.lorebookSyncService = new LorebookSyncService(this.dataManager);
    this.brainstormDataManager = new BrainstormDataManager(this.dataManager);
  }

  async initializeStory(): Promise<void> {
    const savedData = await api.v1.storyStorage.get(StoryDataManager.KEYS.STORY_DATA);

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

  public getFieldContent(fieldId: string): string {
    // Handle lorebook item reference: fieldId:itemId OR lorebook:entryId
    if (fieldId.includes(":")) {
      const [prefix, id] = fieldId.split(":");
      
      let item: DULFSField | undefined;
      if (prefix === "lorebook") {
        const match = this.findDulfsByLorebookId(id);
        item = match ? match.item : undefined;
      } else {
        const list = this.getDulfsList(prefix);
        item = list.find((i) => i.id === id);
      }
      
      return item ? item.lorebookContent || "" : "";
    }

    const field = this.dataManager.getStoryField(fieldId);
    return field ? field.content : "";
  }

  public getDulfsList(fieldId: string): DULFSField[] {
    return this.dataManager.getDulfsList(fieldId);
  }

  public isDulfsEnabled(fieldId: string): boolean {
    const data = this.dataManager.data;
    if (!data) return false;
    return data.dulfsEnabled[fieldId] !== false;
  }

  public async setDulfsEnabled(fieldId: string, enabled: boolean): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;
    data.dulfsEnabled[fieldId] = enabled;
    data.lastModified = new Date();
    await this.dataManager.save();
    await this.lorebookSyncService.syncDulfsLorebook(fieldId);
  }

  public async addDulfsItem(fieldId: string, item: DULFSField): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;
    const list = this.getDulfsList(fieldId);
    list.push(item);
    (data as any)[fieldId] = list; // Still need cast for dynamic assignment by ID
    data.lastModified = new Date();
    await this.dataManager.save();
    await this.lorebookSyncService.syncDulfsLorebook(fieldId);
    await this.lorebookSyncService.syncIndividualLorebook(fieldId, item.id);
  }

  public async updateDulfsItem(
    fieldId: string,
    itemId: string,
    updates: Partial<DULFSField>,
    notify: boolean = false,
  ): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;
    const list = this.getDulfsList(fieldId);
    const index = list.findIndex((i) => i.id === itemId);
    if (index !== -1) {
      list[index] = { ...list[index], ...updates };
      data.lastModified = new Date();
      await this.saveStoryData(notify);

      if (notify && (updates.lorebookContent !== undefined || updates.name !== undefined)) {
        await this.lorebookSyncService.syncIndividualLorebook(fieldId, itemId);
      } else if (notify) {
        await this.lorebookSyncService.syncDulfsLorebook(fieldId);
      }
    }
  }

  public async removeDulfsItem(fieldId: string, itemId: string): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;

    const list = this.getDulfsList(fieldId);
    const item = list.find((i) => i.id === itemId);
    if (item && item.linkedLorebooks.length > 0) {
      for (const entryId of item.linkedLorebooks) {
        try {
          await api.v1.lorebook.removeEntry(entryId);
        } catch (e) {
          // Ignore
        }
      }
    }

    const newList = list.filter((i) => i.id !== itemId);
    (data as any)[fieldId] = newList;
    data.lastModified = new Date();
    await this.dataManager.save();
    await this.lorebookSyncService.syncDulfsLorebook(fieldId);
  }

  public async clearDulfsList(fieldId: string): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;
    (data as any)[fieldId] = [];
    data.lastModified = new Date();
    await this.dataManager.save();
    await this.lorebookSyncService.syncDulfsLorebook(fieldId);
  }

  public findDulfsByLorebookId(entryId: string): { fieldId: string; item: DULFSField } | null {
    for (const fid of LIST_FIELD_IDS) {
      const list = this.getDulfsList(fid);
      const item = list.find((i) => i.linkedLorebooks.includes(entryId));
      if (item) {
        return { fieldId: fid, item };
      }
    }
    return null;
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
      await this.lorebookSyncService.syncAttgToMemory(this.getFieldContent(FieldID.ATTG));
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
      await this.lorebookSyncService.syncStyleToAN(this.getFieldContent(FieldID.Style));
    }
  }

  public async setFieldContent(
    fieldId: string,
    content: string,
    save: boolean = false,
    sync: boolean = true,
  ): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;

    if (fieldId.includes(":")) {
      const [prefix, id] = fieldId.split(":");
      if (prefix === "lorebook") {
        const match = this.findDulfsByLorebookId(id);
        if (match) {
          await this.updateDulfsItem(match.fieldId, match.item.id, { lorebookContent: content }, save);
        }
      } else {
        await this.updateDulfsItem(prefix, id, { lorebookContent: content }, save);
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

    if (changed && sync) {
      if (fieldId === FieldID.ATTG && data.attgEnabled) {
        await this.lorebookSyncService.syncAttgToMemory(content);
      }
      if (fieldId === FieldID.Style && data.styleEnabled) {
        await this.lorebookSyncService.syncStyleToAN(content);
      }
    }

    if (changed) {
      if (save) {
        data.lastModified = new Date();
        await this.dataManager.save();
      } else {
        // Debounced auto-save of the global blob
        if (this.saveTimeout !== undefined) {
          await api.v1.timers.clearTimeout(this.saveTimeout);
        }
        
        this.saveTimeout = await api.v1.timers.setTimeout(async () => {
          data.lastModified = new Date();
          await this.dataManager.save();
          api.v1.log(`Auto-saved global story data (${fieldId})`);
          this.saveTimeout = undefined;
        }, 5000); // 5 second debounce
      }
    }
  }

  public getBrainstormMessages(): { role: string; content: string }[] {
    return this.brainstormDataManager.getMessages();
  }

  public addBrainstormMessage(role: string, content: string): void {
    this.brainstormDataManager.addMessage(role, content);
  }

  public setBrainstormMessages(messages: { role: string; content: string }[]): void {
    this.brainstormDataManager.setMessages(messages);
  }

  public getConsolidatedBrainstorm(): string {
    return this.brainstormDataManager.getConsolidated();
  }

  public async saveStoryData(notify: boolean = true): Promise<void> {
    await this.dataManager.save();
    if (notify) {
      this.dataManager.notifyListeners();
    }
  }

  public async saveFieldDraft(fieldId: string, content: string): Promise<void> {
    await this.setFieldContent(fieldId, content, false, false);
  }
}
