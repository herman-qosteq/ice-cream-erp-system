import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TextInputProps, Pressable, Animated, ActivityIndicator, NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';
import { X } from 'lucide-react-native';
import { filterSuggestions, splitHighlightMatch } from '../../utils/autocomplete';

interface AutocompleteInputProps extends TextInputProps {
  // Candidate pool to suggest from, e.g. data.stores.map(s => s.name) -
  // callers should useMemo this so it's not rebuilt every render (see the
  // call sites in AdminSales.tsx/AdminProducts.tsx/etc.). Raw and
  // unsorted/undeduped is fine, filtering below handles both.
  suggestions: string[];
  // Caps rendered rows, not comparisons - filtering still scans the whole
  // pool (cheap even at a few thousand rows: one lowercase + substring check
  // each), but capping what mounts keeps the panel itself instant to render
  // no matter how large the source list gets.
  maxSuggestions?: number;
  containerClassName?: string;
  // Caller-controlled - the suggestion pool here always comes from data
  // already loaded in the app (see call sites), so nothing in this
  // component itself ever sets this on its own. Exists so a caller whose
  // source list depends on something still being fetched can show the
  // "Searching..." state instead of silently rendering an empty panel.
  loading?: boolean;
  // How long to wait after the last keystroke before the panel reflects it
  // (matches typed value updates instantly either way - only the
  // suggestion list itself is debounced, so nothing ever flickers through a
  // stale intermediate match list while the user is still typing).
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 300;

// Renders the [before, match, after] split from splitHighlightMatch() (see
// utils/autocomplete.ts, where the actual matching logic lives so it's
// unit-testable) with the matched portion bold - the standard Google-style
// "highlighted match" treatment.
function HighlightedLabel({ text, query }: { text: string; query: string }) {
  const segments = splitHighlightMatch(text, query);
  return (
    <Text className="text-xs text-slate-700" numberOfLines={1}>
      {segments.map((seg, i) => (
        <Text key={i} className={seg.matched ? 'font-extrabold text-indigo-600' : undefined}>{seg.text}</Text>
      ))}
    </Text>
  );
}

// Drop-in replacement for <TextInput> that suggests from an in-memory pool
// as the user types - a Google-style autocomplete panel (debounced,
// keyboard-navigable, highlighted matches, clear button, loading/no-results
// states) built for the "name" fields (store/product/supplier/operator/
// truck route & area names) where retyping a near-duplicate of an existing
// value is the common case. The panel floats via position:'absolute' over
// whatever is below it (top:'100%' of this component's own wrapper) rather
// than pushing following fields down the page. This app's forms live inside
// ScrollViews and Modals across 5 RN targets (iOS/Android/Web/Windows/macOS),
// where absolute-positioned overlays are a known source of clipping/z-index
// bugs per-platform - if the panel ever gets clipped or hidden behind other
// content on a specific target, check that target's nearest scrollable/
// overflow-hidden ancestor first.
export default function AutocompleteInput({
  suggestions, maxSuggestions = 4, containerClassName, loading = false, debounceMs = DEFAULT_DEBOUNCE_MS,
  value, onChangeText, onFocus, onBlur, style, ...inputProps
}: AutocompleteInputProps) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  // Debounced separately from `value` - the input itself always reflects
  // what was just typed instantly (value/onChangeText below are never
  // delayed), only the panel's own recompute+render waits for typing to
  // pause, so nothing ever flashes through a stale intermediate match list.
  const [debouncedValue, setDebouncedValue] = useState(typeof value === 'string' ? value : '');
  // Selecting a suggestion (tap or Enter) needs to fire before the
  // TextInput's onBlur hides the panel - onBlur fires first on every RN
  // target when a Pressable inside the same tree is tapped, so hiding is
  // delayed a beat and cancelled if the input regains focus (tap actually
  // landed, or the clear button was pressed) in that window, rather than
  // hidden immediately.
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const raw = typeof value === 'string' ? value : '';
    const t = setTimeout(() => setDebouncedValue(raw), debounceMs);
    return () => clearTimeout(t);
  }, [value, debounceMs]);

  const query = debouncedValue.trim().toLowerCase();

  const filtered = useMemo(() => filterSuggestions(suggestions, query, maxSuggestions), [query, suggestions, maxSuggestions]);

  // A fresh query invalidates whatever row was keyboard-highlighted for the
  // previous one.
  useEffect(() => { setHighlightedIndex(-1); }, [query]);

  const showPanel = open && (loading || query.length > 0);

  useEffect(() => {
    if (showPanel) {
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    }
  }, [showPanel, anim]);

  const cancelBlur = () => { if (blurTimer.current) { clearTimeout(blurTimer.current); blurTimer.current = null; } };

  const selectSuggestion = (s: string) => {
    cancelBlur();
    onChangeText?.(s);
    setOpen(false);
    setHighlightedIndex(-1);
  };

  const clearValue = () => {
    cancelBlur();
    onChangeText?.('');
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const key = e.nativeEvent.key;
    if (key === 'ArrowDown') {
      if (filtered.length === 0) return;
      setOpen(true);
      setHighlightedIndex(i => (i + 1 >= filtered.length ? filtered.length - 1 : i + 1));
    } else if (key === 'ArrowUp') {
      if (filtered.length === 0) return;
      setHighlightedIndex(i => (i <= 0 ? -1 : i - 1));
    } else if (key === 'Enter') {
      if (highlightedIndex >= 0 && filtered[highlightedIndex]) {
        selectSuggestion(filtered[highlightedIndex]);
      }
    } else if (key === 'Escape') {
      setOpen(false);
      setHighlightedIndex(-1);
    }
  };

  const showClear = typeof value === 'string' && value.length > 0;

  return (
    <View className={containerClassName} style={{ position: 'relative', zIndex: showPanel ? 50 : undefined }}>
      <View style={{ position: 'relative' }}>
        <TextInput
          ref={inputRef}
          value={value}
          style={[style as any, showClear ? { paddingRight: 28 } : undefined]}
          // Typing forces the panel open on its own, rather than depending
          // solely on onFocus below - RN Web can lose/never-fire a focus
          // event on a TextInput nested inside this component's extra
          // wrapper View (vs. the caller's own View directly), which would
          // otherwise leave `open` stuck false and the panel permanently
          // hidden even though filtering itself works fine.
          onChangeText={(text) => { cancelBlur(); setOpen(true); onChangeText?.(text); }}
          onFocus={(e) => { cancelBlur(); setOpen(true); onFocus?.(e); }}
          onBlur={(e) => { blurTimer.current = setTimeout(() => setOpen(false), 150); onBlur?.(e); }}
          onKeyPress={handleKeyPress}
          accessibilityLabel={inputProps.accessibilityLabel ?? inputProps.placeholder}
          accessibilityHint="Type to search suggestions, use up and down arrow keys to navigate, Enter to select"
          {...inputProps}
        />
        {showClear && (
          <Pressable
            onPress={clearValue}
            hitSlop={8}
            className="absolute right-2 top-0 bottom-0 items-center justify-center active:opacity-60"
            accessibilityRole="button"
            accessibilityLabel="Clear input"
          >
            <X size={14} color="#94a3b8" />
          </Pressable>
        )}
      </View>

      {showPanel && (
        // The animated wrapper carries ONLY the animated inline style
        // (opacity/transform) - nativewind has no cssInterop registration
        // for Animated.View (it only wraps the plain RN core components),
        // so a className placed directly on it would silently do nothing on
        // native platforms while the wrapper itself still mounted, making
        // the whole panel invisible (no background/border/rounding/shadow)
        // even though everything inside it was rendering correctly. All the
        // actual visual styling below lives on a plain <View>, which
        // nativewind does process, nested one level in.
        <Animated.View
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, elevation: 8,
            opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
          }}
        >
          <View className="mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            {loading ? (
              <View className="px-3 py-2 flex-row items-center gap-2">
                <ActivityIndicator size="small" color="#6366f1" />
                <Text className="text-xs text-slate-400">Searching...</Text>
              </View>
            ) : filtered.length === 0 ? (
              <View className="px-3 py-2 items-center">
                <Text className="text-xs text-slate-400 italic">No matches found</Text>
              </View>
            ) : (
              filtered.map((s, idx) => (
                <Pressable
                  key={s}
                  onPress={() => selectSuggestion(s)}
                  accessibilityRole="button"
                  accessibilityLabel={s}
                  accessibilityState={{ selected: idx === highlightedIndex }}
                  className={`px-3 py-1.5 hover:bg-slate-50 active:bg-slate-100 ${idx < filtered.length - 1 ? 'border-b border-slate-100' : ''} ${idx === highlightedIndex ? 'bg-indigo-50' : ''}`}
                >
                  <HighlightedLabel text={s} query={query} />
                </Pressable>
              ))
            )}
          </View>
        </Animated.View>
      )}
    </View>
  );
}
