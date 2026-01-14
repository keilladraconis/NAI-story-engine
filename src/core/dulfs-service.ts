import { LIST_FIELD_IDS } from "../config/field-definitions";
import { DULFSField, StoryData } from "./story-data-manager";
import { ContentParsingService } from "./content-parsing-service";
import { Store, Action } from "./store";

export class DulfsService {
  constructor(
    private store: Store<StoryData>,
    private dispatch: (action: Action<StoryData>) => void,
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
    this.dispatch((store) =>
      store.update((s) => {
        s.dulfsEnabled = { ...s.dulfsEnabled, [fieldId]: enabled };
      }),
    );
  }

  public async addDulfsItem(fieldId: string, item: DULFSField): Promise<void> {
    this.dispatch((store) =>
      store.update((s) => {
        const list = s[fieldId as keyof StoryData] as DULFSField[];
        if (Array.isArray(list)) {
          (s as any)[fieldId] = [...list, item];
        }
      }),
    );
  }

  public async updateDulfsItem(
    fieldId: string,
    itemId: string,
    updates: Partial<DULFSField>,
  ): Promise<void> {
    this.dispatch((store) =>
      store.update((s) => {
        const list = s[fieldId as keyof StoryData] as DULFSField[];
        if (Array.isArray(list)) {
          const index = list.findIndex((i) => i.id === itemId);
          if (index !== -1) {
            const newList = [...list];
            newList[index] = { ...list[index], ...updates };
            (s as any)[fieldId] = newList;
          }
        }
      }),
    );
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
      );
    } else {
      // Fallback update to trigger sync via state change if needed (though empty update won't change state)
      // If nothing changed, we don't need to do anything.
    }
  }

  public async removeDulfsItem(fieldId: string, itemId: string): Promise<void> {
    this.dispatch((store) =>
      store.update((s) => {
        const list = s[fieldId as keyof StoryData] as DULFSField[];
        if (Array.isArray(list)) {
          (s as any)[fieldId] = list.filter(
            (i) => i.id !== itemId,
          ) as any;
        }
      }),
    );
  }

  public async clearDulfsList(fieldId: string): Promise<void> {
    this.dispatch((store) =>
      store.update((s) => {
        (s as any)[fieldId] = [] as any;
      }),
    );
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