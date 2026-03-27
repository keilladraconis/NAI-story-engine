/**
 * @file SuiSectionedList — a list of labeled sections, each containing a column of items.
 * Composite component. Owns SuiText headers and SuiColumn item containers per section.
 * Header is only rendered when section.label is defined.
 *
 * options carries data: sections (SuiSectionedListSection[]).
 * All visual properties (self style, section shell style, header, children layout) live in theme.
 *
 * @example
 *   new SuiSectionedList({
 *     id:       "my-list",
 *     sections: [{ label: "Characters", children: [child] }],
 *     state:    { ... },
 *     storageKey:  "sui.my-list",
 *     storageMode: "memory",
 *     theme:    { default: { header: { self: { style: { color: "red" } } } } },
 *   })
 */

import { SuiComponent, type AnySuiComponent, type SuiComponentOptions, type SuiFilterResult } from "../component.ts";
import * as Theme from "./theme/sectioned-list.ts";
import { type SuiSectionedListStateTheme, type SuiSectionedListTheme } from "./theme/sectioned-list.ts";
import { SuiColumn } from "./column.ts";
import { SuiText } from "./text.ts";

/** Data shape for one section in a SuiSectionedList. Label and children are caller data — all visual config lives in theme. */
export type SuiSectionedListSection = {
  label?:   string;
  children: AnySuiComponent[];
};

/** options carries data only — all visual properties live in theme. */
export type SuiSectionedListOptions = {
  sections: SuiSectionedListSection[];
} & SuiComponentOptions<SuiSectionedListTheme>;

/**
 * List of labeled sections. Stateless.
 * Each section composes to a SuiColumn shell containing an optional SuiText header
 * and a SuiColumn of items. Section shells receive positional styles from theme.section item* keys.
 */
export class SuiSectionedList extends SuiComponent<SuiSectionedListTheme, Record<string, unknown>, SuiSectionedListOptions, UIPartColumn> {

  /** Styles captured at compose time for each section header, keyed by header ID. */
  private _headerStyles: Map<string, object> = new Map();

  constructor(options: SuiSectionedListOptions) {
    super(options, Theme.sectionedList);
  }

  /** Stable IDs for this component's owned children, indexed by section position. */
  override get ids(): { self: string; shells: string[]; headers: string[]; children: string[] } {
    return {
      self:     this.id,
      shells:   this.options.sections.map((_, i) => `${this.id}.shell.${i}`),
      headers:  this.options.sections.map((_, i) => `${this.id}.header.${i}`),
      children: this.options.sections.map((_, i) => `${this.id}.children.${i}`),
    };
  }

  /** Returns the default state theme — SuiSectionedList is stateless. */
  resolveTheme(): SuiSectionedListStateTheme {
    return this.theme.default;
  }

  /**
   * Filters sections and their items against a query.
   * Each item is filtered individually. Section headers are hidden when all items in
   * that section are filtered out. The list itself is hidden when all sections are empty.
   */
  override filter(query: string): SuiFilterResult {
    const ids     = this.ids;
    const updates: { id: string; style: object }[] = [];
    let   anyVisible = false;

    this.options.sections.forEach((section, i) => {
      const results        = section.children.map(c => c.filter(query));
      const sectionVisible = query === "" || results.some(r => r.visible);
      updates.push(...results.flatMap(r => r.updates));

      if (section.label !== undefined) {
        const headerId    = ids.headers[i]!;
        const headerStyle = this._headerStyles.get(headerId) ?? {};
        updates.push({ id: headerId, style: sectionVisible ? headerStyle : { ...headerStyle, display: "none" } });
      }

      if (sectionVisible) anyVisible = true;
    });

    const full = { ...this._baseStyle, ...this._composedStyle, ...this._variantStyle };
    updates.push({ id: this.id, style: anyVisible ? full : { ...full, display: "none" } });
    return { visible: anyVisible, updates };
  }

  /**
   * Returns a UIPartColumn containing one shell column per section.
   * Each shell contains an optional header text and a children column.
   * @returns {UIPartColumn}
   */
  async compose(): Promise<UIPartColumn> {
    const t   = this.resolveTheme();
    const ids = this.ids;

    this._composedStyle = t.self.style ?? {};
    this._headerStyles  = new Map();

    const sections: AnySuiComponent[] = this.options.sections.map((section, i) => {
      const childrenCol = new SuiColumn({
        id:       ids.children[i],
        children: section.children,
        theme:    { default: { self: t.children } },
      });

      const shellChildren: AnySuiComponent[] = [];
      if (section.label !== undefined) {
        const headerId    = ids.headers[i]!;
        const headerStyle = t.header.style ?? {};
        this._headerStyles.set(headerId, headerStyle);
        shellChildren.push(new SuiText({ id: headerId, theme: { default: { self: { ...t.header, text: section.label } } } }));
      }
      shellChildren.push(childrenCol);

      return new SuiColumn({
        id:       ids.shells[i],
        children: shellChildren,
        theme:    { default: { self: t.section } },
      });
    });

    return await new SuiColumn({
      id:       this.id,
      children: sections,
      theme:    { default: { self: t.self } },
    }).build();
  }
}
