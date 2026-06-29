// Root of the JSX/Preact Story Engine UI. Rendered into the sidebar jsx part.
// h/Fragment are NAI-runtime globals (see external/jsx-typings.d.ts) — no import.

import { Foundation } from "./panels/Foundation";
import { T, SP } from "./style";

export function App() {
  return (
    <div
      style={{
        padding: SP.md,
        background: T.bg,
        color: T.text,
        fontFamily: T.fontDefault,
      }}
    >
      <Foundation />
    </div>
  );
}
