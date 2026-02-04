import { FIELD_CONFIGS, FieldConfig } from "../../config/field-definitions";

type FilterType = NonNullable<FieldConfig["filters"]>[number];

/**
 * Removes bracket placeholders like [text] from content.
 */
function scrubBrackets(text: string): string {
  return text.replace(/\[[^\]]*\]/g, "").trim();
}

/**
 * Removes markdown formatting: bold (**), italic (*_), headers (#), etc.
 */
function scrubMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold **text**
    .replace(/\*([^*]+)\*/g, "$1") // italic *text*
    .replace(/__([^_]+)__/g, "$1") // bold __text__
    .replace(/_([^_]+)_/g, "$1") // italic _text_
    .replace(/^#+\s*/gm, "") // headers
    .replace(/^[-*]\s+/gm, "- ") // normalize list markers
    .trim();
}

/**
 * Normalizes quote characters to standard ASCII quotes.
 */
function normalizeQuotes(text: string): string {
  return text
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'");
}

const FILTER_FUNCTIONS: Record<FilterType, (text: string) => string> = {
  scrubBrackets,
  scrubMarkdown,
  normalizeQuotes,
};

/**
 * Applies configured filters to text based on field configuration.
 */
export function applyFieldFilters(fieldId: string, text: string): string {
  const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
  if (!config?.filters || config.filters.length === 0) {
    return text;
  }

  let result = text;
  for (const filterName of config.filters) {
    const filterFn = FILTER_FUNCTIONS[filterName];
    if (filterFn) {
      result = filterFn(result);
    }
  }
  return result;
}

/**
 * Applies a specific filter to text.
 */
export function applyFilter(filterName: FilterType, text: string): string {
  const filterFn = FILTER_FUNCTIONS[filterName];
  return filterFn ? filterFn(text) : text;
}
