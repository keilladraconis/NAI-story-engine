/**
 * ForgePane — SUI orchestrator for the Story Engine sidebar content.
 *
 * Holds persistent SeFoundationSection and SeForgeSection instances.
 * Passes editHost through to children for panel-modal editing.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { SeFoundationSection } from "./SeFoundationSection";
import { SeForgeSection } from "./SeForgeSection";
import { SeWorldSection } from "./SeWorldSection";
import type { EditPaneHost } from "./SeContentWithTitlePane";

type ForgePaneTheme = { default: { self: { style: object } } };
type ForgePaneState = Record<string, never>;

export type ForgePaneOptions = {
  editHost: EditPaneHost;
} & SuiComponentOptions<ForgePaneTheme, ForgePaneState>;

export class ForgePane extends SuiComponent<
  ForgePaneTheme,
  ForgePaneState,
  ForgePaneOptions,
  UIPartColumn
> {
  private readonly _foundation: SeFoundationSection;
  private readonly _forge: SeForgeSection;
  private readonly _world: SeWorldSection;

  constructor(options: ForgePaneOptions) {
    super(
      { state: {} as ForgePaneState, ...options },
      { default: { self: { style: {} } } },
    );

    this._foundation = new SeFoundationSection({
      id: "se-fn-section",
      editHost: options.editHost,
    });

    this._forge = new SeForgeSection({
      id: "se-forge-section",
      editHost: options.editHost,
    });

    this._world = new SeWorldSection({
      id: "se-world-section",
      editHost: options.editHost,
    });
  }

  async compose(): Promise<UIPartColumn> {
    const [foundationPart, forgePart, worldPart] = await Promise.all([
      this._foundation.build(),
      this._forge.build(),
      this._world.build(),
    ]);

    const { column } = api.v1.ui.part;

    return column({
      id: this.id,
      style: {},
      content: [foundationPart, forgePart, worldPart],
    });
  }
}
