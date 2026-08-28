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
      // Akù only uses standard, publicly-available encryption (AES-256-GCM for
      // on-device data protection, TLS in transit) — not a custom/proprietary
      // cryptographic implementation. This qualifies for App Store Connect's
      // export-compliance exemption, so setting this to `false` skips the
      // "Does your app use encryption?" prompt on every future submission.
      ITSAppUsesNonExemptEncryption: false,
      NSFaceIDUsageDescription:
        'Akù uses Face ID to keep your financial data secure and unlock the app instantly.',
      UIBackgroundModes: ['fetch', 'remote-notification'],
    },
  },
  android: {
    package: 'com.nippysky.aku',
    // versionCode is intentionally NOT set here — eas.json's
    // "appVersionSource": "remote" + the production profile's
    // "autoIncrement": true mean EAS tracks and bumps it automatically
    // on every `eas build --profile production`. No manual edits needed.
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
    'expo-web-browser',
    'expo-image',
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
