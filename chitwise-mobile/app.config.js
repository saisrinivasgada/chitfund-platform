module.exports = ({ config }) => {
  const hub = process.env.EXPO_PUBLIC_APP_VARIANT === 'hub';
  const nativeQa = process.env.CHITWISE_NATIVE_QA === '1';
  if (nativeQa && !/^http:\/\/(127\.0\.0\.1|localhost|10\.0\.2\.2):\d+\/api$/.test(process.env.EXPO_PUBLIC_API_URL ?? '')) throw new Error('Native QA requires a localhost fixture');
  if (!hub) return { ...config, updates: nativeQa ? { ...config.updates, enabled: false } : config.updates, plugins: [...config.plugins, 'expo-background-task'] };

  return {
    ...config,
    name: 'ChitWise Hub',
    slug: 'chitwise-hub-mobile',
    scheme: 'chitwise-hub',
    icon: './assets/hub-icon.png',
    splash: {
      ...config.splash,
      image: './assets/hub-splash-icon.png',
    },
    ios: {
      ...config.ios,
      bundleIdentifier: 'com.chitwise.hub',
    },
    android: {
      ...config.android,
      adaptiveIcon: {
        foregroundImage: './assets/hub-adaptive-icon.png',
        backgroundColor: '#1E3A5F',
      },
      package: 'com.chitwise.hub',
      versionCode: 1,
    },
    plugins: config.plugins.map((plugin) => {
      if (!Array.isArray(plugin) || plugin[0] !== 'expo-notifications') return plugin;
      return ['expo-notifications', { ...plugin[1], icon: './assets/hub-icon.png' }];
    }),
    // A separate EAS project/channel must be created before OTA updates are
    // enabled for Hub. Never publish Hub code to the customer app channel.
    updates: { enabled: false },
    extra: { router: {}, appVariant: 'hub' },
  };
};
