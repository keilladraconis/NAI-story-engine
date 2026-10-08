// src/ui/panels/chat/BuildPills.tsx
import { T, SP } from "../../style";
import { useSlice } from "../../bridge";
import { EntityCard } from "../world/EntityCard";
import { ThreadItem } from "../world/ThreadItem";
import type { Pill } from "../../../core/chat-types/pills";

const TONE = {
  thinking: {
    color: T.text,
    opacity: 0.55,
    borderColor: "rgba(255,255,255,0.18)",
  },
  applied: { color: T.text, opacity: 1, borderColor: "rgba(255,255,255,0.3)" },
  rejected: { color: T.warning, opacity: 1, borderColor: T.warning },
} as const;

const NONE: Record<number, boolean> = {};

/** Body parts that are about the command, not a copy of the thing. */
const NOTE_LABELS = new Set(["Replaced", "Not undone", "Undo failed"]);

/** What an opened pill shows. A pill with a target shows the live card while
 *  the thing exists, and what was written once it does not. Both are mounted
 *  and one is hidden: swapping them would leave the old one behind. */
function PillBody(props: { pill: Pill; mounted: boolean }) {
  const { pill, mounted } = props;
  const target = pill.target;
  const exists = useSlice((s) =>
    !target
      ? false
      : target.kind === "entity"
        ? !!s.world.entitiesById[target.id]
        : s.world.threads.some((t) => t.id === target.id),
  );
  return (
    <div>
      <div style={{ display: exists ? "block" : "none", marginTop: SP.xs }}>
        {mounted && target?.kind === "entity" ? (
          <EntityCard entityId={target.id} />
        ) : null}
        {mounted && target?.kind === "thread" ? (
          <ThreadItem threadId={target.id} />
        ) : null}
      </div>
      <div
        style={{
          display:
            target && !exists && pill.body.length === 0 ? "block" : "none",
          marginTop: SP.xs,
          opacity: 0.6,
        }}
      >
        No longer in the World.
      </div>
      {pill.body.map((part, j) => (
        <div
          key={j}
          style={{
            // With a live card, only the notes about this command are shown
            // beside it; the card itself is the content.
            display: !exists || NOTE_LABELS.has(part.label) ? "block" : "none",
            marginTop: SP.xs,
          }}
        >
          <span
            style={{ display: part.label ? "inline" : "none", opacity: 0.6 }}
          >
            {part.label}:{" "}
          </span>
          {part.text}
          <div
            style={{
              display: part.unseen ? "block" : "none",
              fontSize: "0.8em",
              opacity: 0.5,
            }}
          >
            Never shown to the story model.
          </div>
        </div>
      ))}
    </div>
  );
}

/** A Build reply as a wrapping row of pills. A pill opens in place: it widens
 *  to the full row and shows its body inside its own border. A pill that made
 *  or changed something opens into the World's own card for it. The card is
 *  mounted the first time its pill is opened (`seen`) and only hidden after:
 *  swapping elements leaves stale ones behind in this renderer. The open and
 *  seen sets are held by pill position with the `resetKey` they belong to.
 *  The key changes when the message does (the message list is keyed by index
 *  and pages) and when the list's shape does (provisional pills settling, a
 *  different count), so everything collapses and unmounts in that same render,
 *  without an effect to reset it. */
export function BuildPills(props: {
  pills: Pill[];
  resetKey: string;
  hidden: boolean;
}) {
  const [held, setHeld] = useState({
    key: props.resetKey,
    open: NONE,
    seen: NONE,
  });
  const open = held.key === props.resetKey ? held.open : NONE;
  const seen = held.key === props.resetKey ? held.seen : NONE;

  return (
    <div
      style={{
        display: props.hidden ? "none" : "flex",
        flexWrap: "wrap",
        alignItems: "flex-start",
        gap: SP.xs,
      }}
    >
      {props.pills.map((pill, i) => {
        const opens = pill.body.length > 0 || !!pill.target;
        const isOpen = opens && !!open[i];
        return (
          <div
            key={i}
            style={{
              width: isOpen ? "100%" : "auto",
              border: `1px solid ${TONE[pill.tone].borderColor}`,
              borderRadius: "10px",
              background: isOpen ? "rgba(255,255,255,0.05)" : "none",
              opacity: isOpen ? 1 : TONE[pill.tone].opacity,
            }}
          >
            <button
              title={opens ? "Show what it said" : undefined}
              onClick={() => {
                if (!opens) return;
                setHeld((h) => {
                  const same = h.key === props.resetKey;
                  const was = same ? h.open : NONE;
                  return {
                    key: props.resetKey,
                    open: { ...was, [i]: !was[i] },
                    seen: { ...(same ? h.seen : NONE), [i]: true },
                  };
                });
              }}
              style={{
                background: "none",
                border: "none",
                color: TONE[pill.tone].color,
                cursor: opens ? "pointer" : "default",
                fontFamily: T.fontDefault,
                fontSize: "0.75em",
                padding: "1px 7px",
                textAlign: "left",
                textDecoration:
                  pill.tone === "rejected" ? "line-through" : "none",
              }}
            >
              [{pill.label}]
            </button>
            <div
              style={{
                display: isOpen ? "block" : "none",
                padding: `0 7px ${SP.xs}`,
                fontSize: "0.85em",
                whiteSpace: "pre-wrap",
              }}
            >
              <PillBody pill={pill} mounted={!!seen[i]} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
