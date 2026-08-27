// Opening Scene — the last step on the Setup tab, and the point of everything
// above it. Sized and shaped like the brainstorm prompt: at this stage it is the
// primary action, and a small text button read as an afterthought.
//
// There is no Continue Scene. Once the story has prose the card is gone
// entirely (Setup owns that condition), because continuing belongs in the story
// editor rather than behind a setup control.
//
// The modal asks first: it collects the writer's direction and dispatches on its
// own Generate, so a dismissed modal generates nothing.

import { store, bootstrapRequested } from "../../../core/store";
import { SP, T } from "../../style";
import { openOpeningSceneModal } from "../../header/opening-scene-modal";
import { Feather } from "nai:icons/feather";

export function BootstrapButton(props: { disabled: boolean }) {
  const openingModalOpen = useRef(false);

  const onBootstrap = () => {
    if (props.disabled) return;
    // Nothing in the store dims the card while the modal is up (no request
    // exists yet), so this is what stops a second click stacking a second modal.
    if (openingModalOpen.current) return;
    openingModalOpen.current = true;
    const release = () => {
      openingModalOpen.current = false;
    };
    // Released on rejection too — a modal that failed to open must not leave
    // the card permanently dead.
    void openOpeningSceneModal((guidance: string) =>
      store.dispatch(bootstrapRequested({ guidance })),
    ).then(release, release);
  };

  return (
    <button
      onClick={onBootstrap}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: SP.sm,
        width: "100%",
        textAlign: "left",
        background: T.bg2,
        border: `1px solid ${T.textHeadings}`,
        cursor: props.disabled ? "default" : "pointer",
        color: T.text,
        fontFamily: T.fontDefault,
        padding: SP.md,
        opacity: 1,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: SP.sm,
          color: T.textHeadings,
          fontWeight: "bold",
        }}
      >
        <Feather size={16} />
        {props.disabled
          ? "Writing the opening scene…"
          : "Write the opening scene"}
      </span>
      <span style={{ fontSize: "0.85em", opacity: 0.8 }}>
        The Foundation is set. Start the story from it — you will be asked for
        any direction you want to give first.
      </span>
    </button>
  );
}
