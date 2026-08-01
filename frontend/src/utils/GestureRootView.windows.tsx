// react-native-gesture-handler ships no Windows native module. Its spec file
// resolves the native module via TurboModuleRegistry.getEnforcing() at
// *import time*, which throws synchronously the moment anything imports
// GestureHandlerRootView - crashing bundle evaluation before any component
// renders (a blank window, with no red-box since the crash happens before
// React even starts). Nothing in this app actually uses gesture-handler's
// pan/swipe handlers (only App.tsx wraps the tree in its root view), so on
// Windows we swap in a plain View with the same flex:1 default - it's a
// no-op replacement, not a feature loss.
import React from 'react';
import { View, ViewProps } from 'react-native';

export default function GestureRootView(props: ViewProps) {
  return <View style={{ flex: 1 }} {...props} />;
}
