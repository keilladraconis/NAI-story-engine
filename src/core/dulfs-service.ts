import { LIST_FIELD_IDS } from "../config/field-definitions";
import { StoryDataManager, DULFSField } from "./story-data-manager";
import { LorebookSyncService } from "./lorebook-sync-service";
import { ContentParsingService } from "./content-parsing-service";
import { Debouncer } from "./debouncer";
import { PersistenceMode } from "./story-manager";

export class DulfsService {
  private debouncer: Debouncer = new Debouncer();

  constructor(
    private dataManager: StoryDataManager,
    private lorebookSyncService: LorebookSyncService,
    private parsingService: ContentParsingService,
  ) {}

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
    saveCallback: (notify: boolean) => Promise<void>,
  ): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;
    data.dulfsEnabled[fieldId] = enabled;
    await saveCallback(true);
    await this.lorebookSyncService.syncDulfsLorebook(fieldId);

    // Also sync all individual items to update their enabled status
    const list = this.getDulfsList(fieldId);
    for (const item of list) {
      await this.lorebookSyncService.syncIndividualLorebook(fieldId, item.id);
    }
  }

  public async addDulfsItem(
    fieldId: string,
    item: DULFSField,
    saveCallback: (notify: boolean) => Promise<void>,
  ): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;
    const list = this.getDulfsList(fieldId);
    list.push(item);
    this.dataManager.setDulfsList(fieldId, list);
    await saveCallback(true);
    await this.lorebookSyncService.syncDulfsLorebook(fieldId);
    await this.lorebookSyncService.syncIndividualLorebook(fieldId, item.id);
  }

  public async updateDulfsItem(
    fieldId: string,
    itemId: string,
    updates: Partial<DULFSField>,
    persistence: PersistenceMode = "debounce",
    syncToLorebook: boolean = true,
  ): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;
    const list = this.getDulfsList(fieldId);
    const index = list.findIndex((i) => i.id === itemId);
    if (index !== -1) {
      list[index] = { ...list[index], ...updates };
      this.dataManager.setDulfsList(fieldId, list);

      if (persistence === "immediate") {
        await this.dataManager.save();
        this.dataManager.notifyListeners();
      } else if (persistence === "debounce") {
        await this.debouncer.debounceAction(
          `save-${fieldId}`,
          async () => {
            await this.dataManager.save();
          },
          250,
        );
      }
      // If persistence === "none", skip save/debounce

      if (syncToLorebook) {
        await this.debouncer.debounceAction(
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

  public async parseAndUpdateDulfsItem(
    fieldId: string,
    itemId: string,
  ): Promise<void> {
    const list = this.getDulfsList(fieldId);
    const item = list.find((i) => i.id === itemId);
    if (!item) return;

    const parsed = this.parsingService.parseListLine(item.content, fieldId);
    if (parsed) {
      await this.updateDulfsItem(
        fieldId,
        itemId,
        {
          name: parsed.name,
          description: parsed.description,
        },
        "debounce",
        true,
      );
    } else {
      // Fallback sync
      await this.updateDulfsItem(fieldId, itemId, {}, "debounce", true);
    }
  }

  public async removeDulfsItem(
    fieldId: string,
    itemId: string,
    saveCallback: (notify: boolean) => Promise<void>,
  ): Promise<void> {
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
    await saveCallback(true);
    await this.lorebookSyncService.syncDulfsLorebook(fieldId);
  }

  public async clearDulfsList(
    fieldId: string,
    saveCallback: (notify: boolean) => Promise<void>,
  ): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;
    await this.lorebookSyncService.removeDulfsLorebook(fieldId);
    this.dataManager.setDulfsList(fieldId, []);
    await saveCallback(true);
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
}
