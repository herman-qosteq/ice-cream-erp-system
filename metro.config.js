const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const fs = require('fs');
const path = require('path');

const rnwPath = fs.realpathSync(
  path.resolve(require.resolve('react-native-windows/package.json'), '..'),
);

const config = getDefaultConfig(__dirname);

// Windows/macOS join iOS/Android/Web as resolvable platforms.
config.resolver.platforms = ['ios', 'android', 'windows', 'macos', 'web'];

// react-native-windows needs these blocked so `run-windows` doesn't crash an
// already-running Metro server or trip over MSBuild's lock files.
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : config.resolver.blockList
      ? [config.resolver.blockList]
      : []),
  new RegExp(`${path.resolve(__dirname, 'windows').replace(/[/\\]/g, '/')}.*`),
  new RegExp(`${rnwPath}/build/.*`),
  new RegExp(`${rnwPath}/target/.*`),
  /.*\.ProjectImports\.zip/,
];

// react-native-windows requires these transform options; layered on top of
// Expo's defaults rather than replacing them outright.
const baseGetTransformOptions = config.transformer.getTransformOptions;
config.transformer.getTransformOptions = async (...args) => {
  const options = baseGetTransformOptions ? await baseGetTransformOptions(...args) : {};
  return {
    ...options,
    transform: {
      ...(options.transform || {}),
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  };
};

module.exports = withNativeWind(config, { input: './global.css' });
