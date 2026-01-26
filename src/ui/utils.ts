export const calculateTextAreaHeight = (content: string): string => {
  const LINE_HEIGHT = 20; // Approx px
  const PADDING = 24;
  const MIN_HEIGHT = 60;
  
  if (!content) return `${MIN_HEIGHT}px`;
  
  // Simple heuristic: 60 chars per line wrap
  const wrappedLines = content.split("\n").reduce((acc, line) => {
      return acc + Math.max(1, Math.ceil(line.length / 60));
  }, 0);

  const height = Math.max(MIN_HEIGHT, wrappedLines * LINE_HEIGHT + PADDING);
  return `${height}px`;
};

