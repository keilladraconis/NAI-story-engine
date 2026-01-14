import { Store, Action } from "./store";
import { StoryData } from "./story-data-manager";
import { FIELD_CONFIGS, FieldID } from "../config/field-definitions";
import { hyperGenerate } from "../../lib/hyper-generator";

export class LorebookSyncService {
  constructor(
    private store: Store<StoryData>,
    private dispatch: (action: Action<StoryData>) => void,
  ) {}

  public async ensureDulfsCategory(
    fieldId: string,
    enabled: boolean = true,
    overrideName?: string,
  ): Promise<string> {
    const data = this.store.get();

    const categoryId = data.dulfsCategoryIds[fieldId];
    if (categoryId) {
      const existing = await api.v1.lorebook.category(categoryId);
      if (existing) {
        // Update category enabled state if it changed
        if (existing.enabled !== enabled) {
          await api.v1.lorebook.updateCategory(categoryId, { enabled });
        }
        return categoryId;
      }
    }

    const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
    const categoryName = overrideName
      ? overrideName
      : config
        ? `SE: ${config.label}`
        : "SE: DULFS";

    const catId = api.v1.uuid();
    try {
      await api.v1.lorebook.createCategory({
        id: catId,
        name: categoryName,
        enabled: enabled,
        settings: { entryHeader: "----" },
      });
      this.dispatch((store) =>
        store.update((s) => {
          s.dulfsCategoryIds = { ...s.dulfsCategoryIds, [fieldId]: catId };
        }),
      );
    } catch (e) {
      api.v1.log(`Error creating DULFS category for ${fieldId}:`, e);
    }
    return catId;
  }

  public async syncDulfsLorebook(fieldId: string): Promise<void> {
    const data = this.store.get();

    // Use isDulfsField check or direct access safely
    const list = data[fieldId as keyof StoryData] as any[];
    if (!Array.isArray(list)) return; // Safety check

    const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
    const label = config ? config.label : fieldId;
    const isEnabled = data.dulfsEnabled[fieldId] !== false;

    // Format content
    let textContent = `${label}\n`;
    if (list && list.length > 0) {
      textContent += list
        .map((item) => (item.name ? `- **${item.name}**` : `- Unnamed`))
        .join("\n");
    } else {
      textContent += "(Empty)";
    }

    const categoryId = await this.ensureDulfsCategory(fieldId, isEnabled);

    // Check for existing entry
    const entryId = data.dulfsEntryIds[fieldId];

    let entryExists = false;
    if (entryId) {
      const existing = await api.v1.lorebook.entry(entryId);
      if (existing) {
        entryExists = true;
      }
    }

    if (entryExists && entryId) {
      try {
        await api.v1.lorebook.updateEntry(entryId, {
          text: textContent,
          category: categoryId,
          enabled: isEnabled,
        });
      } catch (e) {
        api.v1.log(`Failed to update DULFS entry ${entryId}, recreating...`, e);
        await this.createDulfsLorebookEntry(
          fieldId,
          label,
          textContent,
          categoryId,
          isEnabled,
        );
      }
    } else {
      await this.createDulfsLorebookEntry(
        fieldId,
        label,
        textContent,
        categoryId,
        isEnabled,
      );
    }
  }

  private async createDulfsLorebookEntry(
    fieldId: string,
    label: string,
    text: string,
    categoryId: string,
    enabled: boolean,
  ): Promise<void> {
    try {
      const newId = api.v1.uuid();
      await api.v1.lorebook.createEntry({
        id: newId,
        displayName: label,
        text: text,
        category: categoryId,
        advancedConditions: [{ type: "random", chance: 0.1 }],
        enabled: enabled,
        forceActivation: false,
      });
      this.dispatch((store) =>
        store.update((s) => {
          s.dulfsEntryIds = { ...s.dulfsEntryIds, [fieldId]: newId };
        }),
      );
    } catch (e) {
      api.v1.log("Error creating DULFS entry:", e);
    }
  }

  public async syncIndividualLorebook(
    fieldId: string,
    itemId: string,
  ): Promise<void> {
    const data = this.store.get();

    const list = data[fieldId as keyof StoryData] as any[];
    if (!Array.isArray(list)) return;

    const item = list.find((i) => i.id === itemId);
    if (!item) return;

    const isEnabled = data.dulfsEnabled[fieldId] !== false;
    const categoryId = await this.ensureDulfsCategory(fieldId, isEnabled);

    let entryId =
      item.linkedLorebooks.length > 0 ? item.linkedLorebooks[0] : null;

    if (entryId) {
      try {
        const existing = await api.v1.lorebook.entry(entryId);
        if (existing) {
          const update: any = {
            displayName: item.name,
            category: categoryId,
            enabled: isEnabled,
          };

          // Only update text if lorebookContent is explicitly set.
          if (item.lorebookContent !== undefined) {
            update.text = item.lorebookContent;
          }

          await api.v1.lorebook.updateEntry(entryId, update);
          return;
        }
      } catch (e) {
        api.v1.log(
          `Failed to update individual lorebook ${entryId}, recreating...`,
          e,
        );
      }
    }

    const textContent = item.lorebookContent || "";
    await this.createIndividualLorebookEntry(
      fieldId,
      itemId,
      item.name,
      textContent,
      categoryId,
      isEnabled,
    );
  }

  private async createIndividualLorebookEntry(
    fieldId: string,
    itemId: string,
    name: string,
    text: string,
    categoryId: string,
    enabled: boolean,
  ): Promise<void> {
    try {
      const newId = api.v1.uuid();
      await api.v1.lorebook.createEntry({
        id: newId,
        displayName: name,
        text: text,
        category: categoryId,
        enabled: enabled,
      });

      this.dispatch((store) =>
        store.update((s) => {
          const list = s[fieldId as keyof StoryData] as any[];
          if (Array.isArray(list)) {
            const index = list.findIndex((i) => i.id === itemId);
            if (index !== -1) {
              const newList = [...list];
              newList[index] = { ...list[index], linkedLorebooks: [newId] };
              (s as any)[fieldId] = newList;
            }
          }
        }),
      );
    } catch (e) {
      api.v1.log("Error creating individual lorebook entry:", e);
    }
  }

  public async generateAndSyncKeys(
    entryId: string,
    content: string,
  ): Promise<void> {
    const promptTemplate = (await api.v1.config.get(
      "lorebook_keys_prompt",
    )) as string;
    if (!promptTemplate) return;

    const prompt = `${promptTemplate}\n\nENTRY:\n${content}`;
    const model = (await api.v1.config.get("model")) || "glm-4-6";

    const messages = [{ role: "user" as const, content: prompt }];
    let buffer = "";

    try {
      await hyperGenerate(
        messages,
        {
          model,
          maxTokens: 100,
          minTokens: 1,
        },
        (text) => {
          buffer += text;
        },
        "background",
      );

      const cleanBuffer = buffer.trim();
      const keys = cleanBuffer
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

      if (keys.length > 0) {
        await api.v1.lorebook.updateEntry(entryId, { keys });
      }
    } catch (e) {
      api.v1.log("Error generating lorebook keys:", e);
    }
  }

  public async removeDulfsLorebook(fieldId: string): Promise<void> {
    // 1. Remove individual item entries (Needs read before write)
    const data = this.store.get();
    const list = data[fieldId as keyof StoryData] as any[];

    if (Array.isArray(list)) {
      for (const item of list) {
        if (item.linkedLorebooks && item.linkedLorebooks.length > 0) {
          for (const entryId of item.linkedLorebooks) {
            try {
              await api.v1.lorebook.removeEntry(entryId);
            } catch (e) {
              // Ignore if entry already gone
            }
          }
        }
      }
    }

    // 2. Remove summary entry
    const summaryEntryId = data.dulfsEntryIds[fieldId];
    if (summaryEntryId) {
      try {
        await api.v1.lorebook.removeEntry(summaryEntryId);
      } catch (e) {
        // Ignore
      }
    }

    // 3. Remove category
    const categoryId = data.dulfsCategoryIds[fieldId];
    if (categoryId) {
      try {
        await api.v1.lorebook.removeCategory(categoryId);
      } catch (e) {
        // Ignore
      }
    }

    this.dispatch((store) =>
      store.update((s) => {
        // Remove keys immutably
        const { [fieldId]: removedEntry, ...restEntries } = s.dulfsEntryIds;
        s.dulfsEntryIds = restEntries;

        const { [fieldId]: removedCat, ...restCats } = s.dulfsCategoryIds;
        s.dulfsCategoryIds = restCats;
      }),
    );
  }

  private async syncToHeader(
    content: string,
    regex: RegExp,
    getter: () => Promise<string>,
    setter: (content: string) => Promise<void>,
  ): Promise<void> {
    let current = await getter();

    // Remove all existing occurrences
    current = current.replace(regex, "").trim();

    // Prepend new content
    const newText = content + (current ? "\n" : "") + current;

    await setter(newText);
  }

  public async syncAttgToMemory(content: string): Promise<void> {
    const attgRegex = /[\[\s*Author:[\s\S]*?\]/gi;
    await this.syncToHeader(
      content,
      attgRegex,
      () => api.v1.memory.get(),
      (text) => api.v1.memory.set(text),
    );
  }

  public async syncStyleToAN(content: string): Promise<void> {
    const styleRegex = /[\[\s*Style:[\s\S]*?\]/gi;
    await this.syncToHeader(
      content,
      styleRegex,
      () => api.v1.an.get(),
      (text) => api.v1.an.set(text),
    );
  }

  public async syncTextField(fieldId: string): Promise<void> {
    const data = this.store.get();

    // Access field safely
    // Note: getStoryField logic from DataManager needs to be replicated or simplified
    const field = data[fieldId as keyof StoryData];
    if (!field || typeof field !== "object" || !("content" in field)) return;

    // Type guard/cast
    const textField = field as any;

    if (!data.textFieldEnabled) {
      // Should be initialized, but just in case
      this.dispatch((store) => store.update((s) => (s.textFieldEnabled = {})));
    }

    let isEnabled = data.textFieldEnabled?.[fieldId] === true;
    const content = textField.content;

    // Determine Category Logic
    let categoryKey = fieldId;
    let categoryName: string | undefined;

    if (fieldId === FieldID.StoryPrompt || fieldId === FieldID.WorldSnapshot) {
      categoryKey = "se_basics";
      categoryName = "SE: Basics";
      // Category is enabled if EITHER is enabled
      const promptEnabled =
        data.textFieldEnabled?.[FieldID.StoryPrompt] === true;
      const snapshotEnabled =
        data.textFieldEnabled?.[FieldID.WorldSnapshot] === true;
      const categoryEnabled = promptEnabled || snapshotEnabled;

      await this.ensureDulfsCategory(
        categoryKey,
        categoryEnabled,
        categoryName,
      );
    } else {
      await this.ensureDulfsCategory(fieldId, isEnabled);
    }

    // Retrieve the category ID (it might have been just created/updated in store)
    // We need to fetch fresh state because ensureDulfsCategory might have updated it
    const freshData = this.store.get();
    const categoryId = freshData.dulfsCategoryIds[categoryKey];

    const entryId = freshData.textFieldEntryIds[fieldId];
    let entryExists = false;

    if (entryId) {
      const existing = await api.v1.lorebook.entry(entryId);
      if (existing) {
        entryExists = true;
        try {
          // If enabled/content changed, update
          await api.v1.lorebook.updateEntry(entryId, {
            text: content,
            category: categoryId,
            enabled: isEnabled,
            forceActivation: isEnabled, // Always on if enabled
          });
        } catch (e) {
          api.v1.log(
            `Failed to update text field entry ${entryId}, recreating...`,
            e,
          );
          entryExists = false; // Trigger recreation
        }
      }
    }

    if (!entryExists && isEnabled) {
      // Only create if enabled. If disabled and missing, do nothing.
      const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
      const label = config ? config.label : fieldId;
      await this.createTextFieldEntry(
        fieldId,
        label,
        content,
        categoryId,
        isEnabled,
      );
    }
  }

  private async createTextFieldEntry(
    fieldId: string,
    label: string,
    text: string,
    categoryId: string,
    enabled: boolean,
  ): Promise<void> {
    try {
      const newId = api.v1.uuid();
      await api.v1.lorebook.createEntry({
        id: newId,
        displayName: label,
        text: text,
        category: categoryId,
        enabled: enabled,
        forceActivation: enabled,
      });

      this.dispatch((store) =>
        store.update((s) => {
          s.textFieldEntryIds = { ...s.textFieldEntryIds, [fieldId]: newId };
        }),
      );
    } catch (e) {
      api.v1.log("Error creating text field lorebook entry:", e);
    }
  }
}
