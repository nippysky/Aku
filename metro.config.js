// metro.config.js
// expo-sqlite ships a wa-sqlite.wasm file that doesn't exist on disk during
// EAS Update's web static-render pass. Stub it out so the web bundle succeeds.
// (expo-sqlite is only used on iOS/Android; the stub is never called at runtime.)

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const { resolver } = config;
config.resolver = {
  ...resolver,
  resolveRequest: (context, moduleName, platform) => {
    if (platform === 'web' && moduleName.endsWith('.wasm')) {
      // Return an empty module — wasm is unreachable on web anyway
      return { type: 'empty' };
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
