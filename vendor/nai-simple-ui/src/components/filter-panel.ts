/**
 * @file SuiFilterPanel — two-zone layout: search input, scrollable list.
 * Composite component. Owns a SuiTextInput wired as a search field and manages all filtering logic.
 * Callers supply children (the list items). For an action bar below the list, pair this component
 * with SuiActionBar in a wrapping SuiColumn.
 *
 * The stored search query is pre-hydrated before building children so that initial filter
 * visibility is baked into every child UIPart at compose time via the SuiComposeContext
 * mechanism. No manual initialQuery threading is required from callers.
 *
 * Any SuiCollapsible instances in children are automatically expanded while a search query
 * is active (and locked so the user cannot collapse them mid-search). When the query is
 * cleared they are restored to their pre-search collapsed states. Expand/restore updates
 * are co-batched with the filter visibility updates into a single updateParts() call.
 *
 * Layout:
 *   SuiColumn (self)
 *     ├── SuiTextInput    (.search)           — persisted query, drives filter on change
 *     └── SuiColumn       (.list)             — flex:1 scrollable; filter target
 *           └── children[]
 *
 * @example
 *   new SuiFilterPanel({
 *     id:                "my-panel",
 *     children:          collapsibles,
 *     searchStorageKey:  "my-panel.query",
 *     searchStorageMode: "global",
 *     debounceDelay:     300,
 *     theme: {
 *       default: {
 *         searchInput: { placeholder: "Search groups..." },
 *       },
 *     },
 *   })
 */

import { SuiComponent, type AnySuiComponent, type SuiComponentOptions, type SuiStorageMode } from "../component.ts";

/** Debounce using the NAI timer API (api.v1.timers) instead of setTimeout. */
function naiDebounce<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => Promise<void> {
  let timer: number | undefined;
  return async (...args: Parameters<T>) => {
    if (timer !== undefined) await api.v1.timers.clearTimeout(timer);
    timer = await api.v1.timers.setTimeout(() => fn(...args), delay);
  };
}
import * as Theme from "./theme/filter-panel.ts";
import { type SuiFilterPanelStateTheme, type SuiFilterPanelTheme } from "./theme/filter-panel.ts";
import { SuiCollapsible } from "./collapsible.ts";
import { SuiTextInput } from "./text-input.ts";
import { SuiColumn } from "./column.ts";

/** State shape for SuiFilterPanel. query drives the search input and is persisted. */
export type SuiFilterPanelState = {
  query: string;
};

/** options carries data only — all visual properties live in theme. */
export type SuiFilterPanelOptions = {
  children:            AnySuiComponent[];
  searchStorageKey?:   string;
  searchStorageMode?:  SuiStorageMode;
  /** Debounce delay in ms for the search onChange handler. Omit to disable debouncing. */
  debounceDelay?:      number;
} & SuiComponentOptions<SuiFilterPanelTheme, SuiFilterPanelState>;

/**
 * Walks a built UIPart tree and patches the `style` property on any node whose `id`
 * appears in the updates map. Used to bake filter visibility into the UIPart tree at
 * compose time, before it is registered with the host — eliminating post-registration
 * updateParts() calls and the flicker they would cause.
 */
function applyStyleUpdates(root: UIPart, updates: { id: string; style?: object }[]): void {
  if (updates.length === 0) return;
  const map = new Map(updates.map(u => [u.id, u.style]));
  function walk(part: UIPart): void {
    const p = part as Record<string, unknown>;
    if (typeof p["id"] === "string" && map.has(p["id"] as string)) {
      p["style"] = map.get(p["id"] as string);
    }
    const content = p["content"];
    if (Array.isArray(content)) (content as UIPart[]).forEach(walk);
  }
  walk(root);
}

/**
 * Two-zone panel: search input → scrollable list.
 * Stateful (query) — the search query is persisted via searchStorageKey/searchStorageMode.
 * Pre-hydrates the stored query and injects it as SuiComposeContext so all children
 * (SuiCard, SuiCollapsible, etc.) bake initial visibility at compose time.
 */
export class SuiFilterPanel extends SuiComponent<SuiFilterPanelTheme, SuiFilterPanelState, SuiFilterPanelOptions, UIPartColumn> {

  constructor(options: SuiFilterPanelOptions) {
    super(
      { ...options, state: { query: "", ...options.state } },
      Theme.filterPanel,
    );
  }

  /** Stable IDs for this component's owned children. */
  override get ids(): { self: string; search: string; list: string } {
    return {
      self:   this.id,
      search: `${this.id}.search`,
      list:   `${this.id}.list`,
    };
  }

  /** Returns the default state theme — SuiFilterPanel theme is stateless. */
  resolveTheme(): SuiFilterPanelStateTheme {
    return this.theme.default;
  }

  /**
   * Hydrates query state from the search storage key before the standard hydrateState() path.
   * Called by build() automatically. Reads from searchStorageKey/searchStorageMode if configured.
   */
  override async hydrateState(): Promise<void> {
    const { searchStorageKey, searchStorageMode } = this.options;
    if (!searchStorageKey) return;
    let stored: unknown;
    switch (searchStorageMode ?? "memory") {
      case "story":   stored = await api.v1.storyStorage.get(searchStorageKey);   break;
      case "global":  stored = await api.v1.storage.get(searchStorageKey);        break;
      case "history": stored = await api.v1.historyStorage.get(searchStorageKey); break;
      case "temp":    stored = await api.v1.tempStorage.get(searchStorageKey);    break;
      default: return;
    }
    if (typeof stored === "string") {
      await this.setState({ query: stored }, false);
    }
  }

  /**
   * Persists the current query to the configured search storage key.
   */
  private async _persistQuery(query: string): Promise<void> {
    const { searchStorageKey, searchStorageMode } = this.options;
    if (!searchStorageKey) return;
    switch (searchStorageMode ?? "memory") {
      case "story":   await api.v1.storyStorage.set(searchStorageKey, query);   break;
      case "global":  await api.v1.storage.set(searchStorageKey, query);        break;
      case "history": await api.v1.historyStorage.set(searchStorageKey, query); break;
      case "temp":    await api.v1.tempStorage.set(searchStorageKey, query);    break;
    }
  }

  /**
   * Builds the two-zone layout. Pre-hydrates the stored search query and injects it
   * as SuiComposeContext so children bake initial filter visibility at compose time.
   *
   * Any SuiCollapsible instances in children are expanded immediately when the stored
   * query is non-empty at build time. On each keystroke, expand/restore updates from
   * collapsibles are co-batched with filter visibility updates into a single updateParts() call.
   *
   * @returns {UIPartColumn}
   */
  async compose(): Promise<UIPartColumn> {
    const t   = this.resolveTheme();
    const ids = this.ids;
    const { children, debounceDelay } = this.options;

    // ── Stored query ──────────────────────────────────────
    // hydrateState() has already been called by build() — query is in this.state.query.

    const initialQuery = this.state.query.toLowerCase();

    // ── Collect SuiCollapsible children ───────────────────
    // Flat scan — only direct children. SuiFilterPanel only manages the collapsibles it owns.

    const collapsibles = children.filter((c): c is SuiCollapsible => c instanceof SuiCollapsible);

    // ── Expand collapsibles if a query is already active ──
    // expandForSearch() is idempotent, so calling it here is always safe.

    if (initialQuery) {
      await Promise.all(collapsibles.map(c => c.expandForSearch()));
    }

    // ── List column (filter target) ───────────────────────
    // Build children with context so initialQuery propagates to all descendants.

    const listCol = new SuiColumn({
      id:       ids.list,
      children,
      theme:    { default: { self: t.list } },
    });

    // ── Search text input ─────────────────────────────────
    // onChange: persist query, co-batch expand/restore and filter updates into one updateParts call.
    // Wrapped with naiDebounce when options.debounceDelay is set.

    const onSearchChange = async (value: string) => {
      const prev = this.state.query;
      await this.setState({ query: value }, false);
      await this._persistQuery(value);

      const query        = value.toLowerCase();
      const prevQuery    = prev.toLowerCase();
      const wasSearching = prevQuery !== "";
      const isSearching  = query    !== "";

      let extraUpdates: (Partial<UIPart> & { id: string })[] = [];
      if (!wasSearching && isSearching) {
        extraUpdates = (await Promise.all(collapsibles.map(c => c.expandForSearch()))).flat();
      } else if (wasSearching && !isSearching) {
        extraUpdates = (await Promise.all(collapsibles.map(c => c.restoreFromSearch()))).flat();
      }

      const filterResult = listCol.filter(query);
      const allUpdates   = [...extraUpdates, ...filterResult.updates];
      if (allUpdates.length > 0) {
        await api.v1.ui.updateParts(allUpdates);
      }
    };

    const searchInput = new SuiTextInput({
      id:           ids.search,
      initialValue: this.state.query,
      theme:        { default: { self: t.searchInput } },
      onChange: debounceDelay !== undefined
        ? naiDebounce(onSearchChange, debounceDelay)
        : onSearchChange,
    });

    // ── Outer column ──────────────────────────────────────
    // Pass initialQuery as context so all children descendants receive it during build.

    const ctx = initialQuery ? { initialQuery } : undefined;

    const result = await new SuiColumn({
      id:       this.id,
      children: [searchInput, listCol],
      theme:    { default: { self: t.self } },
    }).build(ctx);

    // ── Bake initial filter visibility into the built UIPart tree ──
    // If a query was active at build time, apply filter() results directly to the
    // already-built UIPart objects before they are registered with the host. This
    // avoids a post-registration updateParts() call (which would cause flicker) while
    // still producing the correct initial visibility for every card and section header.
    // The reactive filter path (onSearchChange) is unaffected — _composedStyle on each
    // card was captured during compose() before this patch, so restore still works.
    if (initialQuery) {
      const filterResult = listCol.filter(initialQuery);
      if (filterResult.updates.length > 0) {
        applyStyleUpdates(result, filterResult.updates);
      }
    }

    return result;
  }
}
