import React, { createContext, useContext, useRef, useCallback, useEffect, MutableRefObject } from 'react';
import { ScrollView } from 'react-native';

interface ScrollResetContextValue {
  scrollRef: MutableRefObject<ScrollView | null>;
  resetScroll: () => void;
}

// One shared instance covers the whole app: only one role's Flow component
// (Admin/Salesperson/Warehouse) is ever mounted at a time, and whichever one
// is active attaches its own <ScrollView> to this same ref - so there's never
// a conflict between roles, just whichever ScrollView currently exists.
const ScrollResetContext = createContext<ScrollResetContextValue | null>(null);

export function ScrollResetProvider({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<ScrollView>(null);

  const resetScroll = useCallback(() => {
    scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
  }, []);

  return (
    <ScrollResetContext.Provider value={{ scrollRef, resetScroll }}>
      {children}
    </ScrollResetContext.Provider>
  );
}

export function useScrollReset() {
  const ctx = useContext(ScrollResetContext);
  if (!ctx) throw new Error('useScrollReset must be used within a ScrollResetProvider');
  return ctx;
}

// Drop into any screen/tab component that owns its own "which page am I
// showing" state (a tab, a sub-tab, a list/form mode, etc.) - whenever any of
// the given values changes, the shared ScrollView jumps back to the top
// instead of leaving the user wherever the previous view was scrolled to.
export function useResetScrollOnChange(...deps: unknown[]) {
  const { resetScroll } = useScrollReset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    resetScroll();
  }, deps);
}
