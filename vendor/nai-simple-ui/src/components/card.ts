/**
 * @file SuiCard — a structured card component with icon, label, sublabel, actions, and toggle.
 * Composite component. Produces a UIPartRow.
 *
 * Layout:
 *   SuiRow (self)
 *     ├── SuiButton (icon?)
 *     └── SuiColumn (body)
 *           ├── SuiRow (title)
 *           │     ├── SuiButton (label)
 *           │     ├── SuiRow (actions?)
 *           │     └── SuiToggle (toggle?)
 *           └── SuiButton (sublabel?)
 *
 * state.disabled dims icon, label, and sublabel via resolveTheme(). Toggle is never dimmed.
 * onSync() pushes style updates to icon/label/sublabel on state change — no full rebuild.
 *
 * @example
 *   new SuiCard({
 *     id:               "my-card",
 *     label:            "My Card",
 *     sublabel:         "A description",
 *     icon:             "book",
 *     iconCallback:     () => {},
 *     labelCallback:    () => {},
 *     sublabelCallback: () => {},
 *     actions:          [myToggle],
 *     toggle:           myToggle,
 *     state:            { disabled: false },
 *     storageKey:       "sui.my-card",
 *     storageMode:      "memory",
 *     theme:            { ... },
 *   })
 */

import { SuiBase, SuiComponent, type AnySuiComponent, type SuiComponentOptions, type SuiFilterResult } from "../component.ts";
import * as Theme from "./theme/card.ts";
import { type SuiCardStateTheme, type SuiCardTheme } from "./theme/card.ts";
import { SuiButton } from "./button.ts";
import { SuiToggle } from "./toggle.ts";
import { SuiColumn } from "./column.ts";
import { SuiRow } from "./row.ts";

/** State shape for SuiCard. disabled and selected drive resolveTheme() and onSync(). */
export type SuiCardState = {
  disabled?: boolean;
  selected?: boolean;
};

/** options carries data only — all visual properties live in theme. */
export type SuiCardOptions = {
  icon?:                IconId;
  label:                string;
  sublabel?:            string;
  actions?:             AnySuiComponent[];
  toggle?:              SuiToggle;
  iconCallback?:        () => void;
  labelCallback?:       () => void;
  sublabelCallback?:    () => void;
} & SuiComponentOptions<SuiCardTheme, SuiCardState>;

/**
 * Structured card with icon, label, sublabel, actions, and toggle.
 * Stateful (disabled). Icon, label, sublabel dim when disabled — toggle is unaffected.
 */
export class SuiCard extends SuiComponent<SuiCardTheme, SuiCardState, SuiCardOptions, UIPartRow> {

  constructor(options: SuiCardOptions) {
    super(options, Theme.card);
  }

  /** Stable IDs for this component's owned children. */
  override get ids(): {
    self:     string;
    icon:     string;
    body:     string;
    title:    string;
    label:    string;
    actions:  string;
    sublabel: string;
  } {
    return {
      self:     this.id,
      icon:     `${this.id}.icon`,
      body:     `${this.id}.body`,
      title:    `${this.id}.title`,
      label:    `${this.id}.label`,
      actions:  `${this.id}.actions`,
      sublabel: `${this.id}.sublabel`,
    };
  }

  /**
   * Searchable text for this card — label, sublabel, and any action button text joined.
   * Used by SuiFilterableList.filter() to match against a query.
   */
  override get searchText(): string {
    const actionTexts = (this.options.actions ?? [])
      .filter((a): a is SuiButton => a instanceof SuiButton)
      .map((a) => a.resolveTheme().self.text)
      .filter(Boolean);
    return [this.options.label, this.options.sublabel, ...actionTexts].filter(Boolean).join(" ");
  }

  /**
   * SuiCard is a leaf for filtering — matches on its own searchText only.
   * Child fields (actions, toggle) are interactive controls, not filterable structure.
   */
  override filter(query: string): SuiFilterResult {
    const visible = query === "" || this.searchText.toLowerCase().includes(query);
    const full    = { ...this._baseStyle, ...this._composedStyle, ...this._variantStyle };
    return { visible, updates: [{ id: this.id, style: visible ? full : { ...full, display: "none" } }] };
  }

  /** Merges active state partials onto default. selected stacks first, disabled stacks on top. */
  resolveTheme(): SuiCardStateTheme {
    return SuiBase.mergePartTheme(
      this.theme.default,
      this.state.selected ? this.theme.selected : undefined,
      this.state.disabled ? this.theme.disabled : undefined,
    );
  }

  /**
   * Pushes style updates to icon, label, and sublabel on disabled state change.
   * Toggle is excluded — never dimmed.
   */
  override async onSync(): Promise<void> {
    const t   = this.resolveTheme();
    const ids = this.ids;

    const updates: { id: string; iconId?: IconId; style?: object }[] = [
      { id: ids.label, style: t.label.style },
    ];
    if (this.options.icon !== undefined) {
      updates.push({ id: ids.icon, iconId: this.options.icon, style: t.icon.style });
    }
    if (this.options.sublabel !== undefined) {
      updates.push({ id: ids.sublabel, style: t.sublabel.style });
    }

    await api.v1.ui.updateParts(updates);
  }

  /**
   * Returns a UIPartRow containing icon and body column.
   * @returns {UIPartRow}
   */
  async compose(): Promise<UIPartRow> {
    const t   = this.resolveTheme();
    const ids = this.ids;
    const { icon, label, sublabel, actions, toggle, iconCallback, labelCallback, sublabelCallback } = this.options;

    // ── Icon ─────────────────────────────────────────────────
    const iconBtn = icon !== undefined
      ? new SuiButton({
          id:       ids.icon,
          callback: iconCallback,
          state:    { disabled: !iconCallback },
          theme: {
            default:  { self: { ...t.icon, iconId: icon } },
            disabled: { self: { ...t.icon, iconId: icon } },
          },
        })
      : undefined;

    // ── Label ─────────────────────────────────────────────────
    const labelBtn = new SuiButton({
      id:       ids.label,
      callback: labelCallback,
      theme: {
        default:  { self: { ...t.label, text: label } },
        disabled: { self: { ...t.label, text: label } },
      },
    });

    // ── Actions row ───────────────────────────────────────────
    const actionsRow = actions?.length
      ? new SuiRow({
          id:       ids.actions,
          children: actions,
          theme:    { default: { self: t.actions } },
        })
      : undefined;

    // ── Title row ─────────────────────────────────────────────
    const titleChildren: AnySuiComponent[] = [labelBtn];
    if (actionsRow) titleChildren.push(actionsRow);
    if (toggle)     titleChildren.push(toggle);

    const titleRow = new SuiRow({
      id:       ids.title,
      children: titleChildren,
      theme:    { default: { self: t.title } },
    });

    // ── Sublabel ──────────────────────────────────────────────
    const sublabelBtn = sublabel !== undefined
      ? new SuiButton({
          id:       ids.sublabel,
          callback: sublabelCallback,
          theme: {
            default:  { self: { ...t.sublabel, text: sublabel } },
            disabled: { self: { ...t.sublabel, text: sublabel } },
          },
        })
      : undefined;

    // ── Body column ───────────────────────────────────────────
    const bodyChildren: AnySuiComponent[] = [titleRow];
    if (sublabelBtn) bodyChildren.push(sublabelBtn);

    const bodyCol = new SuiColumn({
      id:       ids.body,
      children: bodyChildren,
      theme:    { default: { self: t.body } },
    });

    // ── Self row ──────────────────────────────────────────────
    const rowChildren: AnySuiComponent[] = [];
    if (iconBtn) rowChildren.push(iconBtn);
    rowChildren.push(bodyCol);

    // Bake initial filter visibility into emitted style (from compose context)
    const query   = this.composeContext?.initialQuery ?? "";
    const visible = query === "" || this.searchText.toLowerCase().includes(query);
    this._composedStyle = t.self.style ?? {};
    const selfStyle = visible ? this._composedStyle : { ...this._composedStyle, display: "none" };

    return await new SuiRow({
      id:       this.id,
      children: rowChildren,
      theme:    { default: { self: { ...t.self, style: selfStyle } } },
    }).build(this.composeContext);
  }
}
