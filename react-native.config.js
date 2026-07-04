// Expo's core native module (ExpoModulesCore) doesn't build cleanly under
// react-native-macos (microsoft/react-native-macos#2076, closed upstream as
// "not planned" — the iOS-specific AppDelegate loader in the "expo" pod
// doesn't translate to macOS's build setup). Every Expo-dependent feature in
// this app (PDF export, sharing, image picker) is already gated off on
// macOS at the JS level (Platform.OS checks in src/utils/), so the macOS
// target doesn't need any of these native modules linked at all.
const macosExcludedFromAutolinking = ['expo', 'expo-file-system', 'expo-print', 'expo-sharing', 'expo-image-picker'];

module.exports = {
  dependencies: Object.fromEntries(
    macosExcludedFromAutolinking.map(name => [name, { platforms: { macos: null } }])
  ),
};
