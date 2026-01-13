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
  ): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;
    data.dulfsEnabled[fieldId] = enabled;
    await this.dataManager.save();
    this.dataManager.notify();
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
    await this.dataManager.save();
    this.dataManager.notify();
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
      const oldItem = list[index];
      let newItem = { ...oldItem, ...updates };

      // Sync name into content if name changed
      if (updates.name !== undefined && updates.name !== oldItem.name) {
        if (!newItem.content || newItem.content.trim() === "") {
          // Initialize content if empty
          newItem.content =
            fieldId === "dramatisPersonae"
              ? `${updates.name} (Gender, Age, Role): `
              : `${updates.name}: `;
        } else {
          // Replace name part in existing content
          if (fieldId === "dramatisPersonae") {
            newItem.content = newItem.content.replace(/^[^:(]+/, updates.name);
          } else {
            newItem.content = newItem.content.replace(/^[^:]+/, updates.name);
          }
        }
      }

      list[index] = newItem;
      this.dataManager.setDulfsList(fieldId, list);

      if (persistence === "immediate") {
        await this.dataManager.save();
        this.dataManager.notify();
      } else if (persistence === "debounce") {
        await this.debouncer.debounceAction(
          `save-${fieldId}`,
          async () => {
            await this.dataManager.save();
            this.dataManager.notify();
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

    // Try parsing the content directly
    let parsed = this.parsingService.parseListLine(item.content, fieldId);

    // If it fails, try prepending the name (common in the new two-phase workflow)
    if (!parsed && item.name) {
      let fullLine = "";
      if (fieldId === "dramatisPersonae") {
        // Name (Gender, Age, Role): ...
        fullLine = `${item.name}${item.content.startsWith(" ") ? "" : " "}${item.content}`;
      } else {
        // Name: Description
        fullLine = `${item.name}${item.content.startsWith(":") ? "" : ": "}${item.content}`;
      }
      parsed = this.parsingService.parseListLine(fullLine, fieldId);
    }

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
    await this.dataManager.save();
    this.dataManager.notify();
    await this.lorebookSyncService.syncDulfsLorebook(fieldId);
  }

  public async clearDulfsList(fieldId: string): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;
    await this.lorebookSyncService.removeDulfsLorebook(fieldId);
    this.dataManager.setDulfsList(fieldId, []);
    await this.dataManager.save();
    this.dataManager.notify();
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
