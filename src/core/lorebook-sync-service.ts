import { StoryDataManager } from "./story-data-manager";
import { FIELD_CONFIGS, FieldID } from "../config/field-definitions";
import { hyperGenerate } from "../../lib/hyper-generator";

export class LorebookSyncService {
  constructor(private dataManager: StoryDataManager) {}

  public async ensureDulfsCategory(
    fieldId: string,
    enabled: boolean = true,
    overrideName?: string,
  ): Promise<string> {
    const data = this.dataManager.data;
    if (!data) throw new Error("No story data");

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
      data.dulfsCategoryIds[fieldId] = catId;
      await this.dataManager.save();
    } catch (e) {
      api.v1.log(`Error creating DULFS category for ${fieldId}:`, e);
    }
    return catId;
  }

  public async syncDulfsLorebook(fieldId: string): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;

    const list = this.dataManager.getDulfsList(fieldId);
    const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
    const label = config ? config.label : fieldId;
    const isEnabled = data.dulfsEnabled[fieldId] !== false;

    // Format content
    let textContent = `${label}\n`;
    if (list && list.length > 0) {
      textContent += list
        .map((item) =>
          item.name
            ? `- **${item.name}**: ${item.content}`
            : `- ${item.content}`,
        )
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
    const data = this.dataManager.data;
    if (!data) return;
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
      data.dulfsEntryIds[fieldId] = newId;
      await this.dataManager.save();
    } catch (e) {
      api.v1.log("Error creating DULFS entry:", e);
    }
  }

  public async syncIndividualLorebook(
    fieldId: string,
    itemId: string,
  ): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;

    const list = this.dataManager.getDulfsList(fieldId);
    const item = list?.find((i) => i.id === itemId);
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
          // This prevents overwriting manual user edits in NAI UI with the DULFS description.
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
    const data = this.dataManager.data;
    if (!data) return;
    try {
      const newId = api.v1.uuid();
      await api.v1.lorebook.createEntry({
        id: newId,
        displayName: name,
        text: text,
        category: categoryId,
        enabled: enabled,
      });

      const list = this.dataManager.getDulfsList(fieldId);
      const index = list?.findIndex((i) => i.id === itemId);
      if (index !== -1 && list) {
        list[index].linkedLorebooks = [newId];
        await this.dataManager.save();
      }
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
    const data = this.dataManager.data;
    if (!data) return;

    // 1. Remove individual item entries
    const list = this.dataManager.getDulfsList(fieldId);
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

    // 2. Remove summary entry
    const summaryEntryId = data.dulfsEntryIds[fieldId];
    if (summaryEntryId) {
      try {
        await api.v1.lorebook.removeEntry(summaryEntryId);
      } catch (e) {
        // Ignore
      }
      delete data.dulfsEntryIds[fieldId];
    }

    // 3. Remove category
    const categoryId = data.dulfsCategoryIds[fieldId];
    if (categoryId) {
      try {
        await api.v1.lorebook.removeCategory(categoryId);
      } catch (e) {
        // Ignore
      }
      delete data.dulfsCategoryIds[fieldId];
    }

    await this.dataManager.save();
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
    const attgRegex = /\[\s*Author:[\s\S]*?\]/gi;
    await this.syncToHeader(
      content,
      attgRegex,
      () => api.v1.memory.get(),
      (text) => api.v1.memory.set(text),
    );
  }

  public async syncStyleToAN(content: string): Promise<void> {
    const styleRegex = /\[\s*Style:[\s\S]*?\]/gi;
    await this.syncToHeader(
      content,
      styleRegex,
      () => api.v1.an.get(),
      (text) => api.v1.an.set(text),
    );
  }

  public async syncTextField(fieldId: string): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;

    const field = this.dataManager.getStoryField(fieldId);
    if (!field) return;

    if (!data.textFieldEnabled) data.textFieldEnabled = {};
    if (!data.textFieldEntryIds) data.textFieldEntryIds = {};

    let isEnabled = data.textFieldEnabled[fieldId] === true;
    const content = field.content;

    // Determine Category Logic
    let categoryKey = fieldId;
    let categoryName: string | undefined;

    if (fieldId === FieldID.StoryPrompt || fieldId === FieldID.WorldSnapshot) {
      categoryKey = "se_basics";
      categoryName = "SE: Basics";
      // Category is enabled if EITHER is enabled
      const promptEnabled = data.textFieldEnabled[FieldID.StoryPrompt] === true;
      const snapshotEnabled =
        data.textFieldEnabled[FieldID.WorldSnapshot] === true;
      const categoryEnabled = promptEnabled || snapshotEnabled;

      // We ensure the category with the combined enabled state
      // but passed isEnabled (param 2) is used for the entry logic if we didn't override it.
      // Actually ensureDulfsCategory uses param 2 to set category.enabled.
      // So we must pass the combined state.
      await this.ensureDulfsCategory(
        categoryKey,
        categoryEnabled,
        categoryName,
      );
    } else {
      await this.ensureDulfsCategory(fieldId, isEnabled);
    }

    // Retrieve the category ID (it might have been just created)
    const categoryId = data.dulfsCategoryIds[categoryKey];

    const entryId = data.textFieldEntryIds[fieldId];
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
    const data = this.dataManager.data;
    if (!data) return;
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
      if (!data.textFieldEntryIds) data.textFieldEntryIds = {};
      data.textFieldEntryIds[fieldId] = newId;
      await this.dataManager.save();
    } catch (e) {
      api.v1.log("Error creating text field lorebook entry:", e);
    }
  }
}
