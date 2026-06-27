import { Platform, PlatformIOSStatic } from 'react-native';

export const IS_IOS     = Platform.OS === 'ios';
export const IS_ANDROID = Platform.OS === 'android';

/** iOS version as a number, e.g. 17.0, 18.2 etc. 0 on Android. */
export const IOS_VERSION: number = IS_IOS
  ? parseFloat((Platform as PlatformIOSStatic).Version as string)
  : 0;

/** True if the device supports Live Activities / Dynamic Island (iPhone 14 Pro+). */
export const HAS_DYNAMIC_ISLAND = IS_IOS && IOS_VERSION >= 17;

/** Returns a platform-specific value. */
export function platformValue<T>(ios: T, android: T): T {
  return IS_IOS ? ios : android;
}

/** Android ripple config to pass to Pressable's android_ripple prop. */
export function androidRipple(color?: string): { color: string; borderless: boolean } | undefined {
  if (Platform.OS !== 'android') return undefined;
  return { color: color ?? 'rgba(0,0,0,0.08)', borderless: false };
}
