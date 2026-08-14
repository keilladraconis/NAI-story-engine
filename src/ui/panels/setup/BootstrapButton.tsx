// Opening Scene / Continue Scene. Moved out of the header into Setup, which is
// where a story now begins.
//
// Continuing fires on the click — there is nothing to ask once the story has a
// first page. Opening asks first: the modal collects the writer's direction and
// dispatches on its own Generate, so a dismissed modal generates nothing.

import {
  store,
  bootstrapRequested,
  bootstrapContinueRequested,
} from "../../../core/store";
import { useTapGuard } from "../../tap-guard";
import { SP, T } from "../../style";
import { openOpeningSceneModal } from "../../header/opening-scene-modal";
import { Feather } from "nai:icons/feather";

const ICON_SIZE = 13;

function actionStyle(disabled: boolean): Record<string, string | number> {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: SP.sm,
    padding: "4px 8px",
    fontSize: "0.8em",
    background: "none",
    border: "none",
    cursor: disabled ? "default" : "pointer",
    color: T.textHeadings,
    whiteSpace: "nowrap",
    opacity: disabled ? 0.4 : 0.85,
  };
}

export function BootstrapButton(props: {
  hasDocumentContent: boolean;
  text: string;
  disabled: boolean;
}) {
  const onceTap = useTapGuard();
  const openingModalOpen = useRef(false);

  const onBootstrap = () => {
    if (props.hasDocumentContent) {
      store.dispatch(bootstrapContinueRequested());
      return;
    }
    // Nothing in the store dims the button while the modal is up (no request
    // exists yet), so this is what stops a second click stacking a second modal.
    if (openingModalOpen.current) return;
    openingModalOpen.current = true;
    const release = () => {
      openingModalOpen.current = false;
    };
    // Released on rejection too — a modal that failed to open must not leave
    // the button permanently dead.
    void openOpeningSceneModal((guidance: string) =>
      store.dispatch(bootstrapRequested({ guidance })),
    ).then(release, release);
  };

  return (
    <button
      disabled={props.disabled}
      // A tap can deliver click twice on mobile; bootstrap is not idempotent.
      onClick={() => onceTap(onBootstrap)}
      style={actionStyle(props.disabled)}
    >
      <Feather size={ICON_SIZE} />
      {props.text}
    </button>
  );
}
