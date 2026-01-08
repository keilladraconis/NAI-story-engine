import { StoryDataManager } from "./story-data-manager";
import { FIELD_CONFIGS } from "../config/field-definitions";
import { hyperGenerate } from "../../lib/hyper-generator";

export class LorebookSyncService {
  constructor(private dataManager: StoryDataManager) {}

  public async ensureDulfsCategory(fieldId: string, enabled: boolean = true): Promise<string> {
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
    const categoryName = config ? `SE: ${config.label}` : "SE: DULFS";

    const catId = api.v1.uuid();
    try {
      await api.v1.lorebook.createCategory({
        id: catId,
        name: categoryName,
        enabled: enabled,
        settings: { entryHeader: "---" },
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
        .map((item) => (item.name ? `- **${item.name}**: ${item.content}` : `- ${item.content}`))
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
        await this.createDulfsLorebookEntry(fieldId, label, textContent, categoryId, isEnabled);
      }
    } else {
      await this.createDulfsLorebookEntry(fieldId, label, textContent, categoryId, isEnabled);
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

  public async syncIndividualLorebook(fieldId: string, itemId: string): Promise<void> {
    const data = this.dataManager.data;
    if (!data) return;

    const list = this.dataManager.getDulfsList(fieldId);
    const item = list?.find((i) => i.id === itemId);
    if (!item) return;

    const isEnabled = data.dulfsEnabled[fieldId] !== false;
    const categoryId = await this.ensureDulfsCategory(fieldId, isEnabled);

    let entryId = item.linkedLorebooks.length > 0 ? item.linkedLorebooks[0] : null;

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
        api.v1.log(`Failed to update individual lorebook ${entryId}, recreating...`, e);
      }
    }

    const textContent = item.lorebookContent || "";
    await this.createIndividualLorebookEntry(fieldId, itemId, item.name, textContent, categoryId, isEnabled);
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

  public async generateAndSyncKeys(entryId: string, content: string): Promise<void> {
    const promptTemplate = (await api.v1.config.get("lorebook_keys_prompt")) as string;
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
        "background"
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
    const current = await getter();
    const lines = current.split("\n");

    if (lines.length > 0 && regex.test(lines[0])) {
      lines[0] = content;
    } else {
      lines.unshift(content);
    }
    await setter(lines.join("\n"));
  }

  public async syncAttgToMemory(content: string): Promise<void> {
    const attgRegex = /^\s*\[\s*Author:.*\]\s*$/i;
    await this.syncToHeader(
      content,
      attgRegex,
      () => api.v1.memory.get(),
      (text) => api.v1.memory.set(text),
    );
  }

  public async syncStyleToAN(content: string): Promise<void> {
    const styleRegex = /^\s*\[\s*Style:.*\]\s*$/i;
    await this.syncToHeader(
      content,
      styleRegex,
      () => api.v1.an.get(),
      (text) => api.v1.an.set(text),
    );
  }
}
