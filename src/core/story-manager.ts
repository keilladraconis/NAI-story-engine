import { FieldID, LIST_FIELD_IDS, TEXT_FIELD_IDS, FIELD_CONFIGS } from "../config/field-definitions";
import { StoryDataManager, StoryField, DULFSField } from "./story-data-manager";
import { LorebookSyncService } from "./lorebook-sync-service";
import { BrainstormDataManager } from "./brainstorm-data-manager";

export { StoryField, DULFSField };

export class StoryManager {
  private dataManager: StoryDataManager;
  private lorebookSyncService: LorebookSyncService;
  private brainstormDataManager: BrainstormDataManager;

  private debounceMap: Map<string, number> = new Map();

  constructor() {
    this.dataManager = new StoryDataManager();
    this.lorebookSyncService = new LorebookSyncService(this.dataManager);
    this.brainstormDataManager = new BrainstormDataManager(this.dataManager);
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
    if (this.debounceMap.has(key)) {
      await api.v1.timers.clearTimeout(this.debounceMap.get(key)!);
    }
    const id = await api.v1.timers.setTimeout(async () => {
      await action();
      this.debounceMap.delete(key);
    }, delay);
    this.debounceMap.set(key, id);
  }

  public parseListLine(
    line: string,
    fieldId: string,
  ): { name: string; description: string; content: string } | null {
    let clean = line.trim();

    // Still strip list markers because models are stubborn
    clean = clean.replace(/^[-*+]\s+/, "");
    clean = clean.replace(/^\d+[\.)]\s+/, "");

    const config = FIELD_CONFIGS.find((c) => c.id === fieldId);

    if (fieldId === FieldID.DramatisPersonae) {
      const dpRegex =
        config?.parsingRegex ||
        /^([^:(]+)\s*\(([^,]+),\s*([^,]+),\s*([^)]+)\):\s*(.+)$/;
      const match = clean.match(dpRegex);
      if (match) {
        return {
          name: match[1].trim(),
          description: match[5].trim(),
          content: clean,
        };
      }
    } else {
      const genericRegex = config?.parsingRegex || /^([^:]+):\s*(.+)$/;
      const match = clean.match(genericRegex);
      if (match) {
        return {
          name: match[1].trim(),
          description: match[2].trim(),
          content: clean,
        };
      }
    }

    return null;
  }

  public async parseAndUpdateDulfsItem(
    fieldId: string,
    itemId: string,
  ): Promise<void> {
    const list = this.getDulfsList(fieldId);
    const item = list.find((i) => i.id === itemId);
    if (!item) return;

    const parsed = this.parseListLine(item.content, fieldId);
    if (parsed) {
      await this.updateDulfsItem(
        fieldId,
        itemId,
        {
          name: parsed.name,
          description: parsed.description,
        },
        false,
        true,
      );
    } else {
      // Fallback sync
      await this.updateDulfsItem(fieldId, itemId, {}, false, true);
    }
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

  public async setDulfsEnabled(
    fieldId: string,
    enabled: boolean,
  ): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;
    data.dulfsEnabled[fieldId] = enabled;
    await this.saveStoryData(true);
    await this.lorebookSyncService.syncDulfsLorebook(fieldId);

    // Also sync all individual items to update their enabled status
    const list = this.getDulfsList(fieldId);
    for (const item of list) {
      await this.lorebookSyncService.syncIndividualLorebook(fieldId, item.id);
    }
  }

  public async addDulfsItem(fieldId: string, item: DULFSField): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;
    const list = this.getDulfsList(fieldId);
    list.push(item);
    this.dataManager.setDulfsList(fieldId, list);
    await this.saveStoryData(true);
    await this.lorebookSyncService.syncDulfsLorebook(fieldId);
    await this.lorebookSyncService.syncIndividualLorebook(fieldId, item.id);
  }

  public async updateDulfsItem(
    fieldId: string,
    itemId: string,
    updates: Partial<DULFSField>,
    notify: boolean = false,
    syncToLorebook: boolean = true,
  ): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;
    const list = this.getDulfsList(fieldId);
    const index = list.findIndex((i) => i.id === itemId);
    if (index !== -1) {
      list[index] = { ...list[index], ...updates };
      this.dataManager.setDulfsList(fieldId, list);

      if (notify) {
        await this.dataManager.save();
        this.dataManager.notifyListeners();
      } else {
        await this.debounceAction(
          `save-${fieldId}`,
          async () => {
            await this.dataManager.save();
          },
          250,
        );
      }

      if (syncToLorebook) {
        await this.debounceAction(
          `sync-${fieldId}`,
          async () => {
            await this.lorebookSyncService.syncDulfsLorebook(fieldId);
            if (
              updates.lorebookContent !== undefined ||
              updates.name !== undefined ||
              updates.content !== undefined
            ) {
              await this.lorebookSyncService.syncIndividualLorebook(
                fieldId,
                itemId,
              );
            }
          },
          500,
        );
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
    this.dataManager.setDulfsList(fieldId, newList);
    await this.saveStoryData(true);
    await this.lorebookSyncService.syncDulfsLorebook(fieldId);
  }

  public async clearDulfsList(fieldId: string): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;
    await this.lorebookSyncService.removeDulfsLorebook(fieldId);
    this.dataManager.setDulfsList(fieldId, []);
    await this.saveStoryData(true);
  }

  public findDulfsByLorebookId(
    entryId: string,
  ): { fieldId: string; item: DULFSField } | null {
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
          await this.updateDulfsItem(
            match.fieldId,
            match.item.id,
            { lorebookContent: content },
            save,
          );
        }
      } else {
        await this.updateDulfsItem(
          prefix,
          id,
          { lorebookContent: content },
          save,
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
        await this.dataManager.save();
      } else {
        await this.debounceAction(
          `save-global-${fieldId}`,
          async () => {
            await this.dataManager.save();
            api.v1.log(`Auto-saved global story data (${fieldId})`);
          },
          250,
        );
      }
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
          await this.setFieldContent(fieldId, "", false, true);
          await this.setAttgEnabled(false);
        } else {
          await this.setFieldContent(fieldId, "", false, false);
        }
      } else if (fieldId === FieldID.Style) {
        if (this.isStyleEnabled()) {
          // Sync empty string to memory first to clear it
          await this.setFieldContent(fieldId, "", false, true);
          await this.setStyleEnabled(false);
        } else {
          await this.setFieldContent(fieldId, "", false, false);
        }
      } else {
        await this.setFieldContent(fieldId, "", false, true);
      }
    }

    await this.saveStoryData(true);
  }

  public async generateLorebookKeys(entryId: string, content: string): Promise<void> {
    await this.lorebookSyncService.generateAndSyncKeys(entryId, content);
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
