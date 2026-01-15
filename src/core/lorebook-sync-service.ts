import { Store, Action, StateDiff } from "./store";
import { StoryData, DULFSField } from "./story-data-manager";
import {
  FIELD_CONFIGS,
  FieldID,
  LIST_FIELD_IDS,
  TEXT_FIELD_IDS,
} from "../config/field-definitions";
import { APP_CONFIG } from "../config/app-config";
import { GenX } from "../../lib/gen-x";

export class LorebookSyncService {
  private isSubscribed = false;
  private genX = new GenX();

  constructor(
    private store: Store<StoryData>,
    private dispatch: (action: Action<StoryData>) => void,
  ) {}

  public start() {
    if (this.isSubscribed) return;
    this.isSubscribed = true;

    this.store.subscribe((state, diff) => {
      // 1. Global Syncs (ATTG, Style)
      this.handleGlobalSync(state, diff);

      // 2. Text Fields Sync
      this.handleTextFieldsSync(state, diff);

      // 3. DULFS Lists Sync
      this.handleDulfsListsSync(state, diff);
    });
  }

  // --- 1. Global Syncs ---

  private handleGlobalSync(state: StoryData, diff: StateDiff<StoryData>) {
    // ATTG
    if (
      diff.changed.includes("attgEnabled") ||
      (state.attgEnabled && diff.changed.includes(FieldID.ATTG))
    ) {
      this.syncAttgToMemory(state.attg.content);
    }

    // Style
    if (
      diff.changed.includes("styleEnabled") ||
      (state.styleEnabled && diff.changed.includes(FieldID.Style))
    ) {
      this.syncStyleToAN(state.style.content);
    }
  }

  // --- 2. Text Fields Sync ---

  private handleTextFieldsSync(state: StoryData, diff: StateDiff<StoryData>) {
    // Detect removed text fields (cleanup)
    if (diff.changed.includes("textFieldEntryIds")) {
      const prevIds = diff.previous.textFieldEntryIds || {};
      const currIds = state.textFieldEntryIds;

      for (const [fieldId, entryId] of Object.entries(prevIds)) {
        if (!currIds[fieldId as keyof typeof currIds]) {
          // Entry ID was removed from state -> Delete from Lorebook
          this.safeRemoveEntry(entryId);
        }
      }
    }

    // Detect updates/creation
    for (const fieldId of TEXT_FIELD_IDS) {
      const isEnabledChanged =
        diff.changed.includes("textFieldEnabled") &&
        state.textFieldEnabled?.[fieldId] !==
          diff.previous.textFieldEnabled?.[fieldId];

      const isContentChanged = diff.changed.includes(
        fieldId as keyof StoryData,
      );

      if (isEnabledChanged || isContentChanged) {
        this.syncTextField(fieldId);
      }
    }
  }

  // --- 3. DULFS Lists Sync ---

  private handleDulfsListsSync(state: StoryData, diff: StateDiff<StoryData>) {
    // Detect removed lists (cleanup categories/summaries)
    // This happens if dulfsCategoryIds or dulfsEntryIds changes
    if (diff.changed.includes("dulfsEntryIds")) {
      const prevIds = diff.previous.dulfsEntryIds || {};
      const currIds = state.dulfsEntryIds;
      for (const [fieldId, entryId] of Object.entries(prevIds)) {
        if (!currIds[fieldId]) {
          this.safeRemoveEntry(entryId);
        }
      }
    }
    if (diff.changed.includes("dulfsCategoryIds")) {
      const prevIds = diff.previous.dulfsCategoryIds || {};
      const currIds = state.dulfsCategoryIds;
      for (const [fieldId, catId] of Object.entries(prevIds)) {
        if (!currIds[fieldId]) {
          this.safeRemoveCategory(catId);
        }
      }
    }

    for (const fieldId of LIST_FIELD_IDS) {
      const isEnabledChanged =
        diff.changed.includes("dulfsEnabled") &&
        state.dulfsEnabled[fieldId] !== diff.previous.dulfsEnabled?.[fieldId];

      const isListChanged = diff.changed.includes(fieldId as keyof StoryData);
      const isSummaryChanged =
        diff.changed.includes("dulfsSummaries") &&
        state.dulfsSummaries[fieldId] !==
          diff.previous.dulfsSummaries?.[fieldId];

      // Sync Summary/Category Entry
      if (isEnabledChanged || isListChanged || isSummaryChanged) {
        this.syncDulfsLorebook(fieldId);
      }

      // Sync Individual Items
      if (isListChanged || isEnabledChanged) {
        const prevList = (diff.previous[fieldId as keyof StoryData] ||
          []) as DULFSField[];
        const currList = (state[fieldId as keyof StoryData] ||
          []) as DULFSField[];

        this.diffAndSyncListItems(
          fieldId,
          prevList,
          currList,
          isEnabledChanged,
        );
      }
    }
  }

  // --- Logic Implementations ---

  private diffAndSyncListItems(
    fieldId: string,
    prev: DULFSField[],
    curr: DULFSField[],
    forceSync: boolean,
  ) {
    const prevMap = new Map(prev.map((i) => [i.id, i]));
    const currMap = new Map(curr.map((i) => [i.id, i]));

    // 1. Removed Items
    for (const oldItem of prev) {
      if (!currMap.has(oldItem.id)) {
        // Removed
        if (oldItem.linkedLorebooks) {
          for (const entryId of oldItem.linkedLorebooks) {
            this.safeRemoveEntry(entryId);
          }
        }
      }
    }

    // 2. New or Updated Items
    for (const item of curr) {
      const oldItem = prevMap.get(item.id);

      const isNew = !oldItem;
      const isChanged =
        oldItem &&
        (item.name !== oldItem.name ||
          item.content !== oldItem.content ||
          item.lorebookContent !== oldItem.lorebookContent);

      if (isNew || isChanged || forceSync) {
        this.syncIndividualLorebook(fieldId, item.id);
      }
    }
  }

  private async safeRemoveEntry(entryId: string) {
    try {
      await api.v1.lorebook.removeEntry(entryId);
    } catch (e) {
      // Ignore if already gone
    }
  }

  private async safeRemoveCategory(catId: string) {
    try {
      await api.v1.lorebook.removeCategory(catId);
    } catch (e) {
      // Ignore
    }
  }

  // --- Sync Executors ---

  public async syncAttgToMemory(content: string): Promise<void> {
    const attgRegex = /[[\\\]*Author:[[\\s\\S]*?]/gi;
    const current = await api.v1.memory.get();
    const clean = current.replace(attgRegex, "").trim();
    const newText = content + (clean ? "\n" : "") + clean;
    await api.v1.memory.set(newText);
  }

  public async syncStyleToAN(content: string): Promise<void> {
    const styleRegex = /[[\\\]*Style:[[\\s\\S]*?]/gi;
    const current = await api.v1.an.get();
    const clean = current.replace(styleRegex, "").trim();
    const newText = content + (clean ? "\n" : "") + clean;
    await api.v1.an.set(newText);
  }

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
        if (existing.enabled !== enabled) {
          await api.v1.lorebook.updateCategory(categoryId, { enabled });
        }
        return categoryId;
      }
    }

    // Create new
    const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
    const categoryName = overrideName
      ? overrideName
      : config
        ? `${APP_CONFIG.LOREBOOK.CATEGORY_PREFIX}${config.label}`
        : `${APP_CONFIG.LOREBOOK.CATEGORY_PREFIX}DULFS`;

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
    const list = data[fieldId as keyof StoryData];
    if (!Array.isArray(list)) return;

    const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
    const label = config ? config.label : fieldId;
    const isEnabled = data.dulfsEnabled[fieldId] !== false;
    const summary = data.dulfsSummaries[fieldId];

    let textContent = `${label}\n`;

    if (summary) {
      textContent += `\n${summary}\n\n`;
    }

    if (list && list.length > 0) {
      textContent += (list as DULFSField[])
        .map((item) => (item.name ? `- **${item.name}**` : `- Unnamed`))
        .join("\n");
    } else {
      textContent += "(Empty)";
    }

    const categoryId = await this.ensureDulfsCategory(fieldId, isEnabled);
    const entryId = data.dulfsEntryIds[fieldId];

    if (entryId) {
      try {
        await api.v1.lorebook.updateEntry(entryId, {
          text: textContent,
          category: categoryId,
          enabled: isEnabled,
        });
        return;
      } catch (e) {}
    }

    try {
      const newId = api.v1.uuid();
      await api.v1.lorebook.createEntry({
        id: newId,
        displayName: label,
        text: textContent,
        category: categoryId,
        advancedConditions: [
          { type: "random", chance: APP_CONFIG.LOREBOOK.RANDOM_CHANCE_SUMMARY },
        ],
        enabled: isEnabled,
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
    const list = data[fieldId as keyof StoryData] as DULFSField[];
    if (!Array.isArray(list)) return;

    const item = list.find((i) => i.id === itemId);
    if (!item) return;

    const isEnabled = data.dulfsEnabled[fieldId] !== false;
    const categoryId = await this.ensureDulfsCategory(fieldId, isEnabled);
    const textContent = item.lorebookContent || "";

    const entryId = item.linkedLorebooks?.[0];

    if (entryId) {
      try {
        await api.v1.lorebook.updateEntry(entryId, {
          displayName: item.name,
          text: textContent,
          category: categoryId,
          enabled: isEnabled,
        });
        return;
      } catch (e) {}
    }

    try {
      const newId = api.v1.uuid();
      await api.v1.lorebook.createEntry({
        id: newId,
        displayName: item.name,
        text: textContent,
        category: categoryId,
        enabled: isEnabled,
      });

      this.dispatch((store) =>
        store.update((s) => {
          const list = s[fieldId as keyof StoryData] as DULFSField[];
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

  public async syncTextField(fieldId: string): Promise<void> {
    const data = this.store.get();
    const field = data[fieldId as keyof StoryData] as any;
    if (!field || typeof field.content !== "string") return;

    const isEnabled = data.textFieldEnabled?.[fieldId] === true;
    const content = field.content;

    let categoryKey = fieldId;
    let categoryName: string | undefined;

    if (fieldId === FieldID.StoryPrompt || fieldId === FieldID.WorldSnapshot) {
      categoryKey = "se_basics";
      categoryName = `${APP_CONFIG.LOREBOOK.CATEGORY_PREFIX}Basics`;
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

    const freshData = this.store.get();
    const categoryId = freshData.dulfsCategoryIds[categoryKey];
    const entryId =
      freshData.textFieldEntryIds[
        fieldId as keyof typeof freshData.textFieldEntryIds
      ];

    if (entryId) {
      try {
        await api.v1.lorebook.updateEntry(entryId, {
          text: content,
          category: categoryId,
          enabled: isEnabled,
          forceActivation: isEnabled,
        });
        return;
      } catch (e) {}
    }

    if (isEnabled) {
      const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
      const label = config ? config.label : fieldId;

      try {
        const newId = api.v1.uuid();
        await api.v1.lorebook.createEntry({
          id: newId,
          displayName: label,
          text: content,
          category: categoryId,
          enabled: isEnabled,
          forceActivation: isEnabled,
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

  public async generateAndSyncKeys(
    entryId: string,
    content: string,
  ): Promise<void> {
    const promptTemplate = (await api.v1.config.get(
      "lorebook_keys_prompt",
    )) as string;
    if (!promptTemplate) return;

    const prompt = `${promptTemplate}\n\nENTRY:\n${content}`;
    const model = await api.v1.config.get("model");
    const messages = [{ role: "user" as const, content: prompt }];
    let buffer = "";

    try {
      await this.genX.generate(
        messages,
        { model, max_tokens: 100, minTokens: 1 },
        (choices) => {
          const text = choices[0]?.text;
          if (text) buffer += text;
        },
        "background",
      );

      const keys = buffer
        .trim()
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
}
