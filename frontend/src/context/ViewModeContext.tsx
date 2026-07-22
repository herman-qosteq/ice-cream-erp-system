import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import AsyncStorage from '../utils/asyncStorage';

export type ViewMode = 'table' | 'card';

interface ViewModeContextValue {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

// Desktop-class platforms (native Windows/macOS builds, or a web session wide
// enough to count as a desktop browser) default to Table; native iOS/Android
// and narrow web viewports default to Card. This is only ever the STARTING
// point - the moment a user picks a view manually it's persisted below and
// wins from then on, on that device, regardless of platform/width.
const DESKTOP_BREAKPOINT = 768; // matches Tailwind's `md:` used elsewhere for the same table/card split

function getAutoViewMode(width: number): ViewMode {
  if (Platform.OS === 'ios' || Platform.OS === 'android') return 'card';
  if (Platform.OS === 'windows' || Platform.OS === 'macos') return 'table';
  return width >= DESKTOP_BREAKPOINT ? 'table' : 'card';
}

const ViewModeContext = createContext<ViewModeContextValue>({ viewMode: 'table', setViewMode: () => {} });

export function useViewMode() {
  return useContext(ViewModeContext);
}

const STORAGE_KEY = 'erp_view_mode';

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const [viewMode, setViewModeState] = useState<ViewMode>(() => getAutoViewMode(width));
  // Becomes true once a saved preference is loaded or the user manually
  // switches - from that point on we stop re-deriving the mode from
  // width/platform so the explicit choice sticks.
  const [hasManualPreference, setHasManualPreference] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(saved => {
      if (saved === 'table' || saved === 'card') {
        setViewModeState(saved);
        setHasManualPreference(true);
      }
      setHydrated(true);
    });
  }, []);

  // Keeps the auto-picked mode in sync with viewport resizes (e.g. a web
  // window dragged across the desktop/mobile breakpoint) as long as the user
  // hasn't overridden it yet.
  useEffect(() => {
    if (hydrated && !hasManualPreference) {
      setViewModeState(getAutoViewMode(width));
    }
  }, [width, hydrated, hasManualPreference]);

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    setHasManualPreference(true);
    AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {});
  }, []);

  return (
    <ViewModeContext.Provider value={{ viewMode, setViewMode }}>
      {children}
    </ViewModeContext.Provider>
  );
}
