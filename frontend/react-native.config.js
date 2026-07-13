// Expo's core native module (ExpoModulesCore) doesn't build cleanly under
// react-native-macos (microsoft/react-native-macos#2076, closed upstream as
// "not planned" — the iOS-specific AppDelegate loader in the "expo" pod
// doesn't translate to macOS's build setup). Every Expo-dependent feature in
// this app (PDF export, sharing, image picker) is already gated off on
// macOS at the JS level (Platform.OS checks in src/utils/), so the macOS
// target doesn't need any of these native modules linked at all.
const macosExcludedFromAutolinking = ['expo', 'expo-file-system', 'expo-print', 'expo-sharing', 'expo-image-picker'];

// @react-native-async-storage/async-storage ships no Windows native module,
// so autolinking it breaks the RNW build. src/utils/asyncStorage.windows.ts
// already swaps in an in-memory replacement at the JS level for windows, so
// the native module isn't needed there either.
const windowsExcludedFromAutolinking = ['@react-native-async-storage/async-storage'];

module.exports = {
  dependencies: {
    ...Object.fromEntries(
      macosExcludedFromAutolinking.map(name => [name, { platforms: { macos: null } }])
    ),
    ...Object.fromEntries(
      windowsExcludedFromAutolinking.map(name => [name, { platforms: { windows: null } }])
    ),
  },
};
