// Pure filtering/highlighting logic for AutocompleteInput.tsx, pulled out
// so it's unit-testable via `npm run test:smoke` (that harness runs plain
// node:test against src/utils/**, it can't render a React/RN component tree
// - see the other *.smoke.test.ts files in this directory).

// Case-insensitive substring match against `suggestions`, deduped and
// capped at `maxSuggestions`. Empty/whitespace source entries are skipped,
// and an entry that already equals the query exactly is excluded (nothing
// useful to suggest for what's already fully typed).
export function filterSuggestions(suggestions: string[], rawQuery: string, maxSuggestions = 6): string[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of suggestions) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (lower === query || seen.has(lower)) continue;
    if (lower.includes(query)) {
      seen.add(lower);
      out.push(trimmed);
      if (out.length >= maxSuggestions) break;
    }
  }
  return out;
}

export interface HighlightSegment {
  text: string;
  matched: boolean;
}

// Splits `text` around the first case-insensitive occurrence of `query`, so
// the caller can render the matched portion bold/highlighted (the standard
// Google-style autocomplete treatment). No match (or an empty query) just
// returns the whole string as one unmatched segment.
export function splitHighlightMatch(text: string, rawQuery: string): HighlightSegment[] {
  const query = rawQuery.trim();
  if (!query) return [{ text, matched: false }];
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return [{ text, matched: false }];

  const segments: HighlightSegment[] = [];
  if (idx > 0) segments.push({ text: text.slice(0, idx), matched: false });
  segments.push({ text: text.slice(idx, idx + query.length), matched: true });
  if (idx + query.length < text.length) segments.push({ text: text.slice(idx + query.length), matched: false });
  return segments;
}
