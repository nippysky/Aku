/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: 'Akù',
  slug: 'aku',
  owner: 'nippysky',
  version: '1.0.0',
  orientation: 'portrait',
  updates: {
    url: 'https://u.expo.dev/14785830-cdce-4dfe-8ea3-aac56faeb62a',
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  icon: './assets/images/icon.png',
  scheme: 'aku',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.nippysky.aku',
    googleServicesFile: './GoogleService-Info.plist',
    supportsTablet: false,
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
    googleServicesFile: './google-services.json',
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
      // NOTE: SCHEDULE_EXACT_ALARM deliberately NOT requested — Google Play
      // restricts it to alarm/calendar apps. Inexact scheduling is fine for
      // bill reminders and costs nothing in review.
    ],
    predictiveBackGestureEnabled: false,
    // "pan" lets react-native-keyboard-controller own keyboard avoidance.
    // Without this, Android's native adjustResize fights the library and
    // covers inputs on Samsung and other OEM keyboards.
    softwareKeyboardLayoutMode: 'pan',
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-updates',
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
      projectId: '14785830-cdce-4dfe-8ea3-aac56faeb62a',
    },
  },
};
