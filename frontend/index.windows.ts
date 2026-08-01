// Windows-only entry point. index.ts's `import { registerRootComponent } from
// 'expo'` pulls in Expo.fx.tsx as a side effect, which eventually loads
// expo-modules-core - whose top-level init reads globalThis.expo, installed
// by Expo's native JSI bridge. Expo has no Windows support, so that global is
// never installed, and the import crashes the whole bundle before anything
// renders ("Cannot read property 'EventEmitter' of undefined"). All
// registerRootComponent actually does beyond this (on native platforms) is
// call AppRegistry.registerComponent, so we do that directly here instead.
import { AppRegistry } from 'react-native';
import App from './App';

AppRegistry.registerComponent('main', () => App);
