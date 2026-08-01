import { useEffect, useState } from 'react';

// Same debounce pattern as usePaginatedList's server-search debounce, for
// in-memory list filters: the input itself still updates every keystroke
// (never delayed), only the value fed into an expensive .filter()/useMemo
// lags a beat behind typing, so a fast typist or someone holding backspace
// doesn't re-filter (and re-render every row of) a large list on every
// single keystroke.
export function useDebouncedValue<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
