import { LIST_FIELD_IDS } from "../config/field-definitions";
import { StoryDataManager, DULFSField, StoryData } from "./story-data-manager";
import { LorebookSyncService } from "./lorebook-sync-service";
import { ContentParsingService } from "./content-parsing-service";
import { Debouncer } from "./debouncer";
import { PersistenceMode } from "./story-manager";
import { Store } from "./store";

export class DulfsService {
  private debouncer: Debouncer = new Debouncer();

  constructor(
    private store: Store<StoryData>,
    private lorebookSyncService: LorebookSyncService,
    private parsingService: ContentParsingService,
  ) {}

  public getDulfsList(fieldId: string): DULFSField[] {
    const data = this.store.get();
    const list = data[fieldId as keyof StoryData];
    if (Array.isArray(list)) return list as DULFSField[];
    return [];
  }

  public isDulfsEnabled(fieldId: string): boolean {
    const data = this.store.get();
    return data.dulfsEnabled[fieldId] !== false;
  }

  public async setDulfsEnabled(
    fieldId: string,
    enabled: boolean,
  ): Promise<void> {
    this.store.update((s) => {
      s.dulfsEnabled = { ...s.dulfsEnabled, [fieldId]: enabled };
    });
    
    // Trigger sync
    await this.lorebookSyncService.syncDulfsLorebook(fieldId);

    // Also sync all individual items to update their enabled status
    const list = this.getDulfsList(fieldId);
    for (const item of list) {
      await this.lorebookSyncService.syncIndividualLorebook(fieldId, item.id);
    }
  }

  public async addDulfsItem(fieldId: string, item: DULFSField): Promise<void> {
    this.store.update((s) => {
      const list = s[fieldId as keyof StoryData] as DULFSField[];
      if (Array.isArray(list)) {
        (s as any)[fieldId] = [...list, item];
      }
    });

    await this.lorebookSyncService.syncDulfsLorebook(fieldId);
    await this.lorebookSyncService.syncIndividualLorebook(fieldId, item.id);
  }

  public async updateDulfsItem(
    fieldId: string,
    itemId: string,
    updates: Partial<DULFSField>,
    persistence: PersistenceMode = "debounce", // Kept for interface compatibility but largely ignored for save
    syncToLorebook: boolean = true,
  ): Promise<void> {
    
    this.store.update((s) => {
      const list = s[fieldId as keyof StoryData] as DULFSField[];
      if (Array.isArray(list)) {
        const index = list.findIndex((i) => i.id === itemId);
        if (index !== -1) {
          const newList = [...list];
          newList[index] = { ...list[index], ...updates };
          (s as any)[fieldId] = newList;
        }
      }
    });

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
    // Read state before mutation to get linked lorebooks
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

    this.store.update((s) => {
      const list = s[fieldId as keyof StoryData] as DULFSField[];
      if (Array.isArray(list)) {
        s[fieldId as keyof StoryData] = list.filter((i) => i.id !== itemId) as any;
      }
    });

    await this.lorebookSyncService.syncDulfsLorebook(fieldId);
  }

  public async clearDulfsList(fieldId: string): Promise<void> {
    await this.lorebookSyncService.removeDulfsLorebook(fieldId);
    
    this.store.update((s) => {
      s[fieldId as keyof StoryData] = [] as any;
    });
  }

  public findDulfsByLorebookId(
    entryId: string,
  ): { fieldId: string; item: DULFSField } | null {
    const data = this.store.get();
    for (const fid of LIST_FIELD_IDS) {
      const list = data[fid as keyof StoryData] as DULFSField[];
      if (Array.isArray(list)) {
        const item = list.find((i) => i.linkedLorebooks.includes(entryId));
        if (item) {
          return { fieldId: fid, item };
        }
      }
    }
    return null;
  }
}
