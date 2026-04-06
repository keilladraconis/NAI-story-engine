/**
 * @file SuiTabBar — tab bar + content pane switcher.
 * Composite component. Owns pane wrapper columns. Tab buttons are SuiButton instances supplied by the caller.
 * Active tab is tracked in state. Switching tabs updates only the affected button and pane styles
 * via onSync() + api.v1.ui.updateParts() — no full rebuild.
 *
 * options carries data: tabs (SuiButton[]), panes, actions (optional trailing components), initialTab.
 * All visual properties (tab bar style, active/inactive tab and pane styles) live in theme.
 *
 * @example
 *   new SuiTabBar({
 *     id:          "my-tab-bar",
 *     tabs:        [tabA, tabB],
 *     panes:       [paneA, paneB],
 *     actions:     [syncButton],
 *     initialTab:  0,
 *     state:       { activeTab: 0 },
 *     storageKey:  "sui.my-tab-bar",
 *     storageMode: "memory",
 *     theme:       { ... },
 *   })
 */

import {
  SuiComponent,
  type AnySuiComponent,
  type SuiComponentOptions,
} from "../component.ts";
import * as Theme from "./theme/tab-bar.ts";
import {
  type SuiTabBarStateTheme,
  type SuiTabBarTheme,
} from "./theme/tab-bar.ts";
import { SuiButton } from "./button.ts";
import { SuiColumn } from "./column.ts";
import { SuiRow } from "./row.ts";

/** State shape for SuiTabBar. activeTab drives onSync(). */
export type SuiTabBarState = {
  activeTab: number;
};

/** options carries data only — all visual properties live in theme. */
export type SuiTabBarOptions = {
  tabs: SuiButton[];
  panes: AnySuiComponent[];
  actions?: AnySuiComponent[];
  overlay?: AnySuiComponent;
  initialTab?: number;
  backCallback?: () => void;
} & SuiComponentOptions<SuiTabBarTheme, SuiTabBarState>;

/**
 * Tab bar + content pane switcher. Stateful (activeTab).
 * Tab buttons are SuiButton instances; active/inactive styles applied via updateParts() on state change.
 * Panes are wrapped in owned SuiColumn shells; inactive panes are hidden via display:none.
 * Optional actions are wrapped in a right-aligned row occupying remaining tab bar space.
 */
export class SuiTabBar extends SuiComponent<
  SuiTabBarTheme,
  SuiTabBarState,
  SuiTabBarOptions,
  UIPartColumn
> {
  private _overlayVisible = false;

  constructor(options: SuiTabBarOptions) {
    super(
      {
        ...options,
        state: { activeTab: options.initialTab ?? 0, ...options.state },
      },
      Theme.tabBar,
    );
  }

  /** Stable IDs for this component's owned children. */
  override get ids(): {
    self: string;
    tabBar: string;
    back: string;
    tabs: string;
    actions: string;
    content: string;
    panes: string[];
    overlay: string;
  } {
    return {
      self: this.id,
      tabBar: `${this.id}.tabBar`,
      back: `${this.id}.back`,
      tabs: `${this.id}.tabs`,
      actions: `${this.id}.actions`,
      content: `${this.id}.content`,
      panes: this.options.panes.map((_, i) => `${this.id}.pane.${i}`),
      overlay: `${this.id}.overlay`,
    };
  }

  /** Returns the default state theme — SuiTabBar theme is stateless; active/inactive handled via part pairs. */
  resolveTheme(): SuiTabBarStateTheme {
    return this.theme.default;
  }

  /**
   * Pushes active/inactive style updates to tab buttons and pane wrappers via updateParts().
   * Fired automatically by setState() on every tab switch.
   * When the overlay is active, all panes stay hidden regardless of activeTab.
   */
  override async onSync(): Promise<void> {
    const t = this.resolveTheme();
    const ids = this.ids;
    const activeTab = this.state.activeTab;
    const overlayOn = this._overlayVisible;

    const activeStyle = { ...t.tab.style, ...t.tabActive.style };

    const updates: { id: string; style?: object }[] = [
      ...this.options.tabs.map((tab, i) => ({
        id: tab.id,
        style: i === activeTab ? activeStyle : t.tab.style,
      })),
      ...ids.panes.map((id, i) => ({
        id,
        style: overlayOn || i !== activeTab ? t.pane.style : t.paneActive.style,
      })),
    ];

    await api.v1.ui.updateParts(updates);
  }

  /**
   * Switches to the given zero-based tab index.
   * No-op if already active or index is out of range.
   */
  async switchTo(index: number): Promise<void> {
    if (index < 0 || index >= this.options.panes.length) return;
    if (index === this.state.activeTab) return;
    await this.setState({ activeTab: index });
  }

  /** Zero-based index of the currently active tab. */
  get activeTab(): number {
    return this.state.activeTab;
  }

  /**
   * Shows or hides the overlay component inside the content area.
   * When visible, all panes are hidden and the overlay fills the content area.
   * When hidden, panes revert to their normal active/inactive display.
   * No-op if no overlay was provided at construction time.
   */
  async setOverlay(visible: boolean): Promise<void> {
    if (!this.options.overlay) return;
    this._overlayVisible = visible;

    const t = this.resolveTheme();
    const ids = this.ids;
    const activeTab = this.state.activeTab;

    const updates: { id: string; style?: object }[] = [
      {
        id: ids.overlay,
        style: visible ? t.overlayActive.style : t.overlay.style,
      },
      ...ids.panes.map((id, i) => ({
        id,
        style: visible || i !== activeTab ? t.pane.style : t.paneActive.style,
      })),
    ];

    await api.v1.ui.updateParts(updates);
  }

  /**
   * Returns a UIPartColumn containing the tab bar row and content area column.
   * @returns {UIPartColumn}
   */
  async compose(): Promise<UIPartColumn> {
    const t = this.resolveTheme();
    const ids = this.ids;
    const activeTab = this.state.activeTab;

    // Tab buttons — reconstruct each with active/inactive style baked in at compose time.
    // SuiButton has no self-toggling state; active appearance is fully owned by SuiTabBar.
    const tabButtons = this.options.tabs.map((tab, i) => {
      const isActive = i === activeTab;
      return new SuiButton({
        id: tab.id,
        callback: tab.options.callback,
        theme: {
          default: {
            self: {
              ...tab.theme.default.self,
              style: isActive
                ? { ...t.tab.style, ...t.tabActive.style }
                : t.tab.style,
            },
          },
          disabled: {
            self: {
              ...tab.theme.default.self,
              style: isActive
                ? { ...t.tab.style, ...t.tabActive.style }
                : t.tab.style,
            },
          },
        },
      });
    });

    // Tab buttons row — wraps only the tab buttons; item positional styles from t.tabs.
    const tabsRow = new SuiRow({
      id: ids.tabs,
      children: tabButtons,
      theme: { default: { self: t.tabs } },
    });

    const tabBarChildren: AnySuiComponent[] = [];

    // Back button — prepended before tabs if backCallback is provided.
    if (this.options.backCallback) {
      const backCallback = this.options.backCallback;
      tabBarChildren.push(
        new SuiButton({
          id: ids.back,
          callback: backCallback,
          theme: {
            default: { self: { iconId: t.back.iconId, style: t.back.style } },
          },
        }),
      );
    }

    tabBarChildren.push(tabsRow);
    if (this.options.actions?.length) {
      tabBarChildren.push(
        new SuiRow({
          id: ids.actions,
          children: this.options.actions,
          theme: { default: { self: t.actions } },
        }),
      );
    }

    const tabBarRow = new SuiRow({
      id: ids.tabBar,
      children: tabBarChildren,
      theme: { default: { self: t.tabBar } },
    });

    // Content area — each pane wrapped in an owned column shell.
    // When overlay is present, all panes start hidden; the overlay column is appended last.
    const overlayOn = this._overlayVisible;
    const paneColumns = this.options.panes.map((pane, i) => {
      const isActive = !overlayOn && i === activeTab;
      return new SuiColumn({
        id: ids.panes[i],
        children: [pane],
        theme: { default: { self: isActive ? t.paneActive : t.pane } },
      });
    });

    const contentChildren: AnySuiComponent[] = [...paneColumns];
    if (this.options.overlay) {
      contentChildren.push(
        new SuiColumn({
          id: ids.overlay,
          children: [this.options.overlay],
          theme: { default: { self: overlayOn ? t.overlayActive : t.overlay } },
        }),
      );
    }

    const content = new SuiColumn({
      id: ids.content,
      children: contentChildren,
      theme: { default: { self: t.content } },
    });

    const result = await new SuiColumn({
      id: this.id,
      children: [tabBarRow, content],
      theme: { default: { self: t.self } },
    }).build();
    this._composedStyle = t.self.style ?? {};
    return result;
  }
}
