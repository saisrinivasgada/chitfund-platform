const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// react-native-reanimated 4.x reorganised its logger from src/logger/ to src/common/logger.ts
// but react-native-worklets 0.5.1 (Expo SDK 54 pinned version) still resolves the old path.
// Redirect it to the actual file so Metro doesn't fail with ENOENT.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native-reanimated/src/logger' ||
      moduleName.endsWith('react-native-reanimated/src/logger/index')) {
    return {
      filePath: path.resolve(
        __dirname,
        'node_modules/react-native-reanimated/src/common/logger.ts'
      ),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
