/**
 * @file SuiCollapsible — a collapsible container with a header and expandable content.
 * Composite component. Owns a chevron SuiButton, a header row, and a content wrapper column.
 * Collapsed state is tracked in state. Toggling updates only the chevron and content wrapper
 * styles via onSync() + api.v1.ui.updateParts() — no full rebuild.
 *
 * options carries data: header (any SuiComponent), children (AnySuiComponent[]),
 * initialCollapsed, onToggle callback.
 * All visual properties (chevron appearance, content visibility, header row style) live in theme.
 *
 * If header is a SuiCard, its icon, label, and sublabel buttons are automatically wired to
 * toggle the collapsible — the caller does not need to set iconCallback/labelCallback/sublabelCallback.
 *
 * state.disabled locks the collapsible open: onChevronClick is a no-op, the chevron button is
 * disabled at the platform level (no click events), and the chevron renders using the
 * theme.disabled.chevronDisabled part. SuiFilterPanel uses expandForSearch() / restoreFromSearch()
 * to drive this state while a search query is active.
 *
 * @example
 *   new SuiCollapsible({
 *     id:               "my-collapsible",
 *     header:           myHeaderComponent,
 *     children:         [childA, childB],
 *     initialCollapsed: true,
 *     onToggle:         (collapsed) => {},
 *     state:            { collapsed: true },
 *     storageKey:       "sui.my-collapsible",
 *     storageMode:      "memory",
 *     theme:            { ... },
 *   })
 */

import {
  SuiBase,
  SuiComponent,
  type AnySuiComponent,
  type SuiComponentOptions,
  type SuiFilterResult,
} from "../component.ts";
import * as Theme from "./theme/collapsible.ts";
import {
  type SuiCollapsibleStateTheme,
  type SuiCollapsibleTheme,
} from "./theme/collapsible.ts";
import { SuiButton } from "./button.ts";
import { SuiCard } from "./card.ts";
import { SuiColumn } from "./column.ts";
import { SuiRow } from "./row.ts";

/** State shape for SuiCollapsible. collapsed and disabled drive resolveTheme() and onSync(). */
export type SuiCollapsibleState = {
  collapsed: boolean;
  disabled?: boolean;
};

/** options carries data only — all visual properties live in theme. */
export type SuiCollapsibleOptions = {
  header: AnySuiComponent;
  children: AnySuiComponent[];
  initialCollapsed?: boolean;
  onToggle?: (collapsed: boolean) => void;
} & SuiComponentOptions<SuiCollapsibleTheme, SuiCollapsibleState>;

/**
 * Collapsible container. Stateful (collapsed, disabled).
 * Chevron SuiButton is owned and wired internally. Header is any SuiComponent.
 * If header is a SuiCard, icon/label/sublabel callbacks are injected to also trigger collapse.
 * Children are AnySuiComponent[] — composed via buildContent() for positional style support.
 * Toggling updates chevron icon/style and content wrapper visibility via updateParts().
 * When state.disabled is true, onChevronClick is a no-op and the chevron button is platform-disabled.
 */
export class SuiCollapsible extends SuiComponent<
  SuiCollapsibleTheme,
  SuiCollapsibleState,
  SuiCollapsibleOptions,
  UIPartColumn
> {
  /** Collapsed state saved at the moment expandForSearch() was called. undefined = not in search mode. */
  private _savedCollapsed: boolean | undefined = undefined;

  constructor(options: SuiCollapsibleOptions) {
    super(
      {
        ...options,
        state: {
          collapsed: options.initialCollapsed ?? true,
          ...options.state,
        },
      },
      Theme.collapsible,
    );
  }

  /** Stable IDs for this component's owned children. */
  override get ids(): {
    self: string;
    header: string;
    headerContent: string;
    chevron: string;
    content: string;
  } {
    return {
      self: this.id,
      header: `${this.id}.header`,
      headerContent: `${this.id}.header.content`,
      chevron: `${this.id}.chevron`,
      content: `${this.id}.content`,
    };
  }

  /**
   * Merges the disabled partial on top of default when state.disabled is true.
   * Same merge pattern as SuiCard and SuiToggle.
   */
  override resolveTheme(): SuiCollapsibleStateTheme {
    return SuiBase.mergePartTheme(
      this.theme.default,
      this.state.disabled ? this.theme.disabled : undefined,
    );
  }

  /**
   * Fires when the chevron is clicked. Flips collapsed state and notifies onToggle.
   * setState() triggers onSync() automatically.
   * No-op while state.disabled (i.e. during an active search).
   */
  protected async onChevronClick(): Promise<void> {
    if (this.state.disabled) return;
    const newCollapsed = !this.state.collapsed;
    await this.setState({ ...this.state, collapsed: newCollapsed });
    this.options.onToggle?.(newCollapsed);
  }

  /**
   * Called by SuiFilterPanel when a search query becomes non-empty.
   * Saves current collapsed state, expands, and disables the collapsible.
   * Mutates state silently (applySync: false) and returns the updateParts payload
   * so the caller can merge it into a single batched updateParts call.
   * Idempotent — returns an empty array if already disabled.
   */
  async expandForSearch(): Promise<(Partial<UIPart> & { id: string })[]> {
    if (this.state.disabled) return [];
    this._savedCollapsed = this.state.collapsed;
    await this.setState({ collapsed: false, disabled: true }, false);
    return this._buildSyncUpdates();
  }

  /**
   * Called by SuiFilterPanel when the search query is cleared.
   * Restores the pre-search collapsed state and re-enables the collapsible.
   * Mutates state silently (applySync: false) and returns the updateParts payload
   * so the caller can merge it into a single batched updateParts call.
   * Idempotent — returns an empty array if not currently disabled.
   */
  async restoreFromSearch(): Promise<(Partial<UIPart> & { id: string })[]> {
    if (!this.state.disabled) return [];
    const restore = this._savedCollapsed ?? true;
    this._savedCollapsed = undefined;
    await this.setState({ collapsed: restore, disabled: false }, false);
    return this._buildSyncUpdates();
  }

  /**
   * Computes the updateParts payload for the current state without emitting it.
   * Used by expandForSearch() and restoreFromSearch() to contribute to a batched call.
   */
  private _buildSyncUpdates(): (Partial<UIPart> & { id: string })[] {
    const t = this.resolveTheme();
    const ids = this.ids;
    const collapsed = this.state.collapsed;
    const disabled = this.state.disabled ?? false;
    const chevronPart = disabled
      ? t.chevronDisabled
      : collapsed
        ? t.chevron
        : t.chevronOpen;
    return [
      {
        id: ids.content,
        style: collapsed ? t.content.style : t.contentVisible.style,
      },
      {
        id: ids.chevron,
        iconId: chevronPart.iconId,
        style: chevronPart.style,
        disabled: disabled || undefined,
      },
    ];
  }

  /**
   * Pushes chevron visual and content wrapper visibility updates via updateParts().
   * Fired automatically by setState() on every state change.
   * Delegates to _buildSyncUpdates() — same payload used by expandForSearch/restoreFromSearch
   * when contributing to a batched call.
   */
  override async onSync(): Promise<void> {
    await api.v1.ui.updateParts(this._buildSyncUpdates());
  }

  /**
   * Searchable text for this collapsible — delegates to the header component.
   * If the header is a SuiCard, returns the card's label + sublabel.
   */
  override get searchText(): string {
    return this.options.header.searchText;
  }

  /**
   * Filters this collapsible and its children against a query.
   * Visible if own searchText matches OR any child is visible.
   * Header is not recursed — its searchText is already captured by this.searchText.
   */
  override filter(query: string): SuiFilterResult {
    const childResults = this.options.children.map((c) => c.filter(query));
    const anyChildVisible = childResults.some((r) => r.visible);
    const selfMatch =
      query === "" || this.searchText.toLowerCase().includes(query);
    const visible = selfMatch || anyChildVisible;
    const updates = childResults.flatMap((r) => r.updates);
    const full = {
      ...this._baseStyle,
      ...this._composedStyle,
      ...this._variantStyle,
    };
    updates.push({
      id: this.id,
      style: visible ? full : { ...full, display: "none" },
    });
    return { visible, updates };
  }

  /** Whether the collapsible is currently collapsed. */
  get collapsed(): boolean {
    return this.state.collapsed;
  }

  /**
   * Returns a UIPartColumn containing the header row and content wrapper column.
   * @returns {UIPartColumn}
   */
  async compose(): Promise<UIPartColumn> {
    const t = this.resolveTheme();
    const ids = this.ids;
    const collapsed = this.state.collapsed;
    const disabled = this.state.disabled ?? false;

    const chevron = new SuiButton({
      id: ids.chevron,
      callback: this.onChevronClick.bind(this),
      state: { disabled },
      theme: {
        default: { self: collapsed ? t.chevron : t.chevronOpen },
        disabled: { self: t.chevronDisabled },
      },
    });
    const header =
      this.options.header instanceof SuiCard
        ? new SuiCard({
            iconCallback: this.onChevronClick.bind(this),
            labelCallback: this.onChevronClick.bind(this),
            sublabelCallback: this.onChevronClick.bind(this),
            ...this.options.header.options,
          })
        : this.options.header;

    const headerContentCol = new SuiColumn({
      id: ids.headerContent,
      children: [header],
      theme: { default: { self: t.headerContent } },
    });

    const headerRow = new SuiRow({
      id: ids.header,
      children: [chevron, headerContentCol],
      theme: { default: { self: t.header } },
    });

    const contentColumn = new SuiColumn({
      id: ids.content,
      children: this.options.children,
      theme: { default: { self: collapsed ? t.content : t.contentVisible } },
    });

    // Build headerRow without context — the header is structural and must never be hidden by filtering.
    // Context is forwarded only to contentColumn so leaf cards bake initial visibility correctly.
    const builtHeader = await headerRow.build();
    const builtContent = await contentColumn.build(this.composeContext);

    // Bake initial filter visibility into emitted style (from compose context).
    const query = this.composeContext?.initialQuery ?? "";
    const visible = query === "" || this.filter(query).visible;
    this._composedStyle = t.self.style ?? {};
    const selfStyle = visible
      ? this._composedStyle
      : { ...this._composedStyle, display: "none" };

    return {
      type: "column",
      id: this.id,
      content: [builtHeader, builtContent],
      style: selfStyle,
    } as UIPartColumn;
  }
}
