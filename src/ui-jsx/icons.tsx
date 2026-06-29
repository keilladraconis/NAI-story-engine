// Hand-authored Feather icons (the NAI native iconId set is unavailable inside
// the shadow DOM). Only the icons this slice needs. Add more as panels port.

type IconProps = { size?: number; color?: string };

function Svg(props: IconProps & { children: preact.ComponentChildren }) {
  const { size = 18, color = "currentColor", children } = props;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {children}
    </svg>
  );
}

export function Zap(p: IconProps) {
  return (
    <Svg {...p}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </Svg>
  );
}

export function Edit(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </Svg>
  );
}

export function ToggleLeft(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="1" y="5" width="22" height="14" rx="7" ry="7" />
      <circle cx="8" cy="12" r="3" />
    </Svg>
  );
}

export function ToggleRight(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="1" y="5" width="22" height="14" rx="7" ry="7" />
      <circle cx="16" cy="12" r="3" />
    </Svg>
  );
}
