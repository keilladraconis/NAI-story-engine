import { FieldHistory } from "./field-history";
import { FieldID, FIELD_CONFIGS } from "../config/field-definitions";

interface StoryData {
  id: string;
  version: string;

  // Workflow stages
  [FieldID.StoryPrompt]: StoryField;
  [FieldID.Brainstorm]: StoryField;
  [FieldID.WorldSnapshot]: StoryField;
  [FieldID.ATTG]: StoryField;
  [FieldID.Style]: StoryField;

  // DULFS components
  [FieldID.DramatisPersonae]: DULFSField[];
  [FieldID.UniverseSystems]: DULFSField[];
  [FieldID.Locations]: DULFSField[];
  [FieldID.Factions]: DULFSField[];
  [FieldID.SituationalDynamics]: DULFSField[];

  // Lorebook Integration
  dulfsCategoryId?: string;
  dulfsEntryIds: Record<string, string>; // FieldID -> EntryID
  dulfsEnabled: Record<string, boolean>; // FieldID -> boolean

  // Generator Sync
  attgEnabled: boolean;
  styleEnabled: boolean;

  // History and metadata
  lastModified: Date;
}

interface StoryField {
  id: string;
  type: "prompt" | "brainstorm" | "worldSnapshot" | "dulfs" | "attg" | "style";
  content: string;
  version: number;
  history: FieldHistory[];
  linkedEntities: string[]; // References to DULFS entities
  data?: any; // Generic container for field-specific structured data (e.g. Brainstorm cards)
}

export interface DULFSField {
  id: string;
  category:
    | "dramatisPersonae"
    | "universeSystems"
    | "locations"
    | "factions"
    | "situationalDynamics";
  content: string;
  name: string;
  description: string;
  attributes: Record<string, any>;
  linkedLorebooks: string[];
}

export class StoryManager {
  private static readonly KEYS = {
    STORY_DATA: "kse-story-data",
  };

  private currentStory?: StoryData;
  private listeners: (() => void)[] = [];

  constructor() {
    this.initializeStory();
  }

  async initializeStory(): Promise<void> {
    const savedData = await api.v1.storyStorage.get(
      StoryManager.KEYS.STORY_DATA,
    );

    if (savedData) {
      this.currentStory = savedData;
      // Migration: Ensure dulfsEntryIds exists
      if (this.currentStory && !this.currentStory.dulfsEntryIds) {
        this.currentStory.dulfsEntryIds = {};
      }
      // Migration: Ensure dulfsEnabled exists
      if (this.currentStory && !this.currentStory.dulfsEnabled) {
        this.currentStory.dulfsEnabled = {};
      }

      // Migration: Ensure ATTG and Style fields exist
      if (this.currentStory && !this.currentStory[FieldID.ATTG]) {
        this.currentStory[FieldID.ATTG] = {
          id: FieldID.ATTG,
          type: "attg",
          content: "",
          version: 0,
          history: [],
          linkedEntities: [],
        };
      }
      if (this.currentStory && !this.currentStory[FieldID.Style]) {
        this.currentStory[FieldID.Style] = {
          id: FieldID.Style,
          type: "style",
          content: "",
          version: 0,
          history: [],
          linkedEntities: [],
        };
      }

      // Migration: Generator Sync
      if (
        this.currentStory &&
        typeof this.currentStory.attgEnabled === "undefined"
      ) {
        this.currentStory.attgEnabled = false;
      }
      if (
        this.currentStory &&
        typeof this.currentStory.styleEnabled === "undefined"
      ) {
        this.currentStory.styleEnabled = false;
      }
    } else {
      this.currentStory = this.createDefaultStoryData();
      await this.saveStoryData();
    }
    this.notifyListeners();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }

  public getFieldContent(fieldId: string): string {
    if (!this.currentStory) return "";

    // Cast to any to allow dynamic access by string ID
    const field = (this.currentStory as any)[fieldId];

    // If it's a StoryField, return content
    if (field && typeof field === "object" && "content" in field) {
      return field.content;
    }

    return "";
  }

  public getDulfsList(fieldId: string): DULFSField[] {
    if (!this.currentStory) return [];
    const field = (this.currentStory as any)[fieldId];
    if (Array.isArray(field)) {
      return field as DULFSField[];
    }
    return [];
  }

  public isDulfsEnabled(fieldId: string): boolean {
    if (!this.currentStory) return false;
    // Default to true if not set (or if undefined during migration transition for known fields)
    return this.currentStory.dulfsEnabled[fieldId] !== false;
  }

  public async setDulfsEnabled(
    fieldId: string,
    enabled: boolean,
  ): Promise<void> {
    if (!this.currentStory) return;
    this.currentStory.dulfsEnabled[fieldId] = enabled;
    this.currentStory.lastModified = new Date();
    await this.saveStoryData();
    await this.syncDulfsLorebook(fieldId);
  }

  public async addDulfsItem(fieldId: string, item: DULFSField): Promise<void> {
    if (!this.currentStory) return;
    const list = this.getDulfsList(fieldId);
    list.push(item);
    // Explicitly re-assign to ensure it updates if it was a copy (though it's ref)
    (this.currentStory as any)[fieldId] = list;
    this.currentStory.lastModified = new Date();
    await this.saveStoryData();
    await this.syncDulfsLorebook(fieldId);
  }

  public async updateDulfsItem(
    fieldId: string,
    itemId: string,
    updates: Partial<DULFSField>,
    notify: boolean = false,
  ): Promise<void> {
    if (!this.currentStory) return;
    const list = this.getDulfsList(fieldId);
    const index = list.findIndex((i) => i.id === itemId);
    if (index !== -1) {
      list[index] = { ...list[index], ...updates };
      this.currentStory.lastModified = new Date();
      await this.saveStoryData(notify);
      await this.syncDulfsLorebook(fieldId);
    }
  }

  public async removeDulfsItem(fieldId: string, itemId: string): Promise<void> {
    if (!this.currentStory) return;
    const list = this.getDulfsList(fieldId);
    const newList = list.filter((i) => i.id !== itemId);
    (this.currentStory as any)[fieldId] = newList;
    this.currentStory.lastModified = new Date();
    await this.saveStoryData();
    await this.syncDulfsLorebook(fieldId);
  }

  public async clearDulfsList(fieldId: string): Promise<void> {
    if (!this.currentStory) return;
    (this.currentStory as any)[fieldId] = [];
    this.currentStory.lastModified = new Date();
    await this.saveStoryData();
    await this.syncDulfsLorebook(fieldId);
  }

  // --- Lorebook Integration ---

  private async ensureDulfsCategory(): Promise<string> {
    if (!this.currentStory) throw new Error("No story data");

    if (this.currentStory.dulfsCategoryId) {
      const existing = await api.v1.lorebook.category(
        this.currentStory.dulfsCategoryId,
      );
      if (existing) {
        return this.currentStory.dulfsCategoryId;
      }
    }

    const catId = api.v1.uuid();
    try {
      await api.v1.lorebook.createCategory({
        id: catId,
        name: "Story-Engine: DULFS",
        enabled: true,
      });
      this.currentStory.dulfsCategoryId = catId;
      await this.saveStoryData();
    } catch (e) {
      api.v1.log("Error creating DULFS category:", e);
    }
    return catId;
  }

  private async syncDulfsLorebook(fieldId: string): Promise<void> {
    if (!this.currentStory) return;

    const list = this.getDulfsList(fieldId);
    const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
    const label = config ? config.label : fieldId;
    const isEnabled = this.isDulfsEnabled(fieldId);

    // Format content
    let textContent = `${label}\n`;
    if (list.length > 0) {
      textContent += list.map((item) => `- ${item.content}`).join("\n");
    } else {
      textContent += "(Empty)";
    }

    const categoryId = await this.ensureDulfsCategory();

    // Check for existing entry
    const entryId = this.currentStory.dulfsEntryIds[fieldId];

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
        // Redundancy: if update fails, recreate
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
    if (!this.currentStory) return;
    try {
      const newId = api.v1.uuid();
      await api.v1.lorebook.createEntry({
        id: newId,
        displayName: label,
        text: text,
        category: categoryId,
        keys: [], // No keys, relying on random chance
        advancedConditions: [
          {
            type: "random",
            chance: 0.1,
          },
        ],
        enabled: enabled,
        forceActivation: false,
      });
      this.currentStory.dulfsEntryIds[fieldId] = newId;
      await this.saveStoryData();
    } catch (e) {
      api.v1.log("Error creating DULFS entry:", e);
    }
  }

  public isAttgEnabled(): boolean {
    return this.currentStory?.attgEnabled || false;
  }

  public async setAttgEnabled(enabled: boolean): Promise<void> {
    if (!this.currentStory) return;
    this.currentStory.attgEnabled = enabled;
    await this.saveStoryData();
    if (enabled) {
      await this.syncAttgToMemory(this.getFieldContent(FieldID.ATTG));
    }
  }

  public isStyleEnabled(): boolean {
    return this.currentStory?.styleEnabled || false;
  }

  public async setStyleEnabled(enabled: boolean): Promise<void> {
    if (!this.currentStory) return;
    this.currentStory.styleEnabled = enabled;
    await this.saveStoryData();
    if (enabled) {
      await this.syncStyleToAN(this.getFieldContent(FieldID.Style));
    }
  }

  private async syncAttgToMemory(content: string): Promise<void> {
    const currentMemory = await api.v1.memory.get();
    let lines = currentMemory.split("\n");

    // Regex: Starts with [, contains Author:, ends with ] (loosely)
    const attgRegex = /^\s*\[\s*Author:.*\]\s*$/i;

    if (lines.length > 0 && attgRegex.test(lines[0])) {
      lines[0] = content;
    } else {
      lines.unshift(content);
    }
    await api.v1.memory.set(lines.join("\n"));
  }

  private async syncStyleToAN(content: string): Promise<void> {
    const currentAN = await api.v1.an.get();
    let lines = currentAN.split("\n");

    const styleRegex = /^\s*\[\s*Style:.*\]\s*$/i;

    if (lines.length > 0 && styleRegex.test(lines[0])) {
      lines[0] = content;
    } else {
      lines.unshift(content);
    }
    await api.v1.an.set(lines.join("\n"));
  }

  public async setFieldContent(
    fieldId: string,
    content: string,
    save: boolean = false,
    sync: boolean = true,
  ): Promise<void> {
    if (!this.currentStory) return;

    const storyAny = this.currentStory as any;
    const field = storyAny[fieldId];
    let changed = false;

    if (field && typeof field === "object" && "content" in field) {
      if (field.content !== content) {
        field.content = content;
        changed = true;
      }
    }

    if (changed && sync) {
      // Trigger Syncs
      if (fieldId === FieldID.ATTG && this.currentStory.attgEnabled) {
        await this.syncAttgToMemory(content);
      }
      if (fieldId === FieldID.Style && this.currentStory.styleEnabled) {
        await this.syncStyleToAN(content);
      }
    }

    if (changed && save) {
      this.currentStory.lastModified = new Date();
      await this.saveStoryData();
    }
  }

  public async commit(): Promise<void> {
    if (!this.currentStory) return;

    let changed = false;

    // Iterate over known text fields
    const textFields = [
      this.currentStory[FieldID.StoryPrompt],
      this.currentStory[FieldID.Brainstorm],
      this.currentStory[FieldID.WorldSnapshot],
      this.currentStory[FieldID.ATTG],
      this.currentStory[FieldID.Style],
    ];

    for (const field of textFields) {
      const lastEntry =
        field.history.length > 0
          ? field.history[field.history.length - 1]
          : null;

      // Only commit if content is different from last commit
      if (
        (!lastEntry && field.content.trim() !== "") ||
        (lastEntry && lastEntry.content !== field.content)
      ) {
        const newVersion = field.version + 1;
        const historyEntry: FieldHistory = {
          id: api.v1.uuid(),
          timestamp: new Date(),
          version: newVersion,
          content: field.content,
          source: "commit",
        };

        field.history.push(historyEntry);
        field.version = newVersion;
        changed = true;
      }
    }

    if (changed) {
      this.currentStory.lastModified = new Date();
      await this.saveStoryData(true); // Save and notify
      api.v1.log("Story state committed to history.");
    } else {
      api.v1.log("No changes to commit.");
    }
  }

  private createDefaultStoryData(): StoryData {
    return {
      id: "current-story",
      version: "0.1.0",

      // Primary components
      [FieldID.StoryPrompt]: {
        id: FieldID.StoryPrompt,
        type: "prompt",
        content: "",
        version: 0,
        history: [],
        linkedEntities: [],
      },
      [FieldID.ATTG]: {
        id: FieldID.ATTG,
        type: "attg",
        content: "",
        version: 0,
        history: [],
        linkedEntities: [],
      },
      [FieldID.Style]: {
        id: FieldID.Style,
        type: "style",
        content: "",
        version: 0,
        history: [],
        linkedEntities: [],
      },
      [FieldID.Brainstorm]: {
        id: FieldID.Brainstorm,
        type: "brainstorm",
        content: "",
        version: 0,
        history: [],
        linkedEntities: [],
        data: { messages: [] }, // Initialize with empty chat history
      },
      [FieldID.WorldSnapshot]: {
        id: FieldID.WorldSnapshot,
        type: "worldSnapshot",
        content: "",
        version: 0,
        history: [],
        linkedEntities: [],
      },

      // DULFS components (start empty)
      [FieldID.DramatisPersonae]: [],
      [FieldID.UniverseSystems]: [],
      [FieldID.Locations]: [],
      [FieldID.Factions]: [],
      [FieldID.SituationalDynamics]: [],

      // Lorebook
      dulfsEntryIds: {},
      dulfsEnabled: {},

      // Sync
      attgEnabled: false,
      styleEnabled: false,

      lastModified: new Date(),
    };
  }

  public getBrainstormMessages(): { role: string; content: string }[] {
    if (!this.currentStory) return [];

    const brainstorm = this.currentStory[FieldID.Brainstorm];

    // Ensure data object exists
    if (!brainstorm.data) {
      brainstorm.data = { messages: [] };
    }
    // Migration check: if 'cards' exists but 'messages' doesn't, reset to empty messages
    if (!brainstorm.data.messages && brainstorm.data.cards) {
      brainstorm.data = { messages: [] };
    }
    return brainstorm.data.messages || [];
  }

  public addBrainstormMessage(role: string, content: string): void {
    if (!this.currentStory) return;
    const brainstorm = this.currentStory[FieldID.Brainstorm];

    if (!brainstorm.data) {
      brainstorm.data = { messages: [] };
    }
    if (!brainstorm.data.messages) {
      brainstorm.data.messages = [];
    }
    brainstorm.data.messages.push({ role, content });
  }

  public setBrainstormMessages(
    messages: { role: string; content: string }[],
  ): void {
    if (!this.currentStory) return;
    const brainstorm = this.currentStory[FieldID.Brainstorm];

    if (!brainstorm.data) {
      brainstorm.data = { messages: [] };
    }
    brainstorm.data.messages = messages;
  }

  public getConsolidatedBrainstorm(): string {
    const messages = this.getBrainstormMessages();
    if (messages.length === 0) return "";

    return messages
      .map((msg) => {
        const role = msg.role === "user" ? "User" : "Assistant";
        return `${role}: ${msg.content}`;
      })
      .join("\n\n");
  }

  public async saveStoryData(notify: boolean = true): Promise<void> {
    await api.v1.storyStorage.set(
      StoryManager.KEYS.STORY_DATA,
      this.currentStory,
    );
    if (notify) {
      this.notifyListeners();
    }
  }

  public async saveFieldDraft(fieldId: string, content: string): Promise<void> {
    // Update internal memory without triggering full save or sync
    await this.setFieldContent(fieldId, content, false, false);
    // Save to the draft storage key used by the UI
    await api.v1.storyStorage.set(`kse-field-${fieldId}`, content);
  }
}
