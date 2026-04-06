// Story Engine brand colors (mirrors src/ui/colors.ts for the SUI layer)
export const colors = {
  header: "rgb(245, 243, 194)",
  paragraph: "rgb(255, 255, 255)",
  warning: "rgb(255, 147, 147)",
  foreground: "rgb(34, 37, 63)",
  background: "rgb(25, 27, 49)",
  darkBackground: "rgb(19, 21, 44)",
  input: "rgb(14, 15, 33)",

  // Text roles
  prompt: "rgb(245, 243, 194)",
  aiText: "rgb(255, 255, 255)",
  editText: "rgb(244, 199, 255)",
  userText: "rgb(156, 220, 255)",

  // Status indicators
  statusEmpty: "rgba(128,128,128,0.3)",
  statusGenerating: "#ff9800",
  statusQueued: "rgb(245,243,194)",
  statusComplete: "rgba(255,255,255,0.8)",
} as const;
