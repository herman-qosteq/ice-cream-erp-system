// Thin re-export so callers don't import '@react-native-async-storage/async-storage'
// directly. Metro picks asyncStorage.windows.ts over this file when bundling
// for the windows platform, so the native module (unsupported on RNW) is
// swapped out there without touching android/ios/macos/web.
export { default } from '@react-native-async-storage/async-storage';
