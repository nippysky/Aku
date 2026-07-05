/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: 'Akù',
  slug: 'aku',
  owner: 'nippysky',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'aku',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.nippysky.aku',
    supportsTablet: false,
    alternateIcons: {
      'aku-midnight': { image: './assets/images/icons/icon-midnight.png' },
      'aku-gold':     { image: './assets/images/icons/icon-gold.png' },
      'aku-linen':    { image: './assets/images/icons/icon-linen.png' },
      'aku-graphite': { image: './assets/images/icons/icon-graphite.png' },
      'aku-coral':    { image: './assets/images/icons/icon-coral.png' },
    },
    infoPlist: {
      NSFaceIDUsageDescription:
        'Akù uses Face ID to keep your financial data secure and unlock the app instantly.',
      NSCameraUsageDescription:
        'Akù uses the camera so you can take a profile photo.',
      NSPhotoLibraryUsageDescription:
        'Akù needs access to your photo library so you can set a profile photo.',
      NSPhotoLibraryAddUsageDescription:
        'Akù saves your profile photo to your library.',
      UIBackgroundModes: ['fetch', 'remote-notification'],
    },
  },
  android: {
    package: 'com.nippysky.aku',
    adaptiveIcon: {
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
      backgroundColor: '#163A2F',
    },
    permissions: [
      'android.permission.USE_BIOMETRIC',
      'android.permission.USE_FINGERPRINT',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.VIBRATE',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.CAMERA',
      'android.permission.SCHEDULE_EXACT_ALARM',
    ],
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-local-authentication',
    'expo-secure-store',
    'expo-sqlite',
    [
      'expo-notifications',
      {
        icon: './assets/images/notification-icon.png',
        color: '#163A2F',
        sounds: [],
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#163A2F',
        image: './assets/images/splash-icon.png',
        imageWidth: 120,
        android: {
          image: './assets/images/splash-icon.png',
          imageWidth: 120,
          backgroundColor: '#163A2F',
        },
      },
    ],
    'expo-sharing',
    [
      'expo-image-picker',
      {
        photosPermission:
          'Akù needs access to your photo library so you can set a profile photo.',
        cameraPermission:
          'Akù needs access to your camera so you can take a profile photo.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  // EAS project ID — auto-injected by EAS cloud builds via Constants.easConfig.projectId.
  // Set explicitly here so local device builds can also register push tokens.
  // Get yours: npx eas project:info  (then paste the ID below)
  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? '',
    },
  },
};
