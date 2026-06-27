import { Tabs } from 'expo-router';
import { Platform, View, StyleSheet, type ColorValue } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Receipt, Wallet, Target, User } from 'lucide-react-native';
import { useTheme } from '../../theme';
import { Layout } from '../../theme/spacing';
import { FontFamily, FontSize } from '../../theme/typography';

type TabIconProps = {
  color:   ColorValue;
  focused: boolean;
  size:    number;
};

function TabIcon({
  Icon,
  color,
  focused,
  size,
}: TabIconProps & { Icon: React.ElementType }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Icon
        size={size}
        color={color as string}
        strokeWidth={focused ? 2 : 1.5}
      />
    </View>
  );
}

export default function TabsLayout() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const isIOS = Platform.OS === 'ios';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        // ── iOS: transparent + glass background ──────────────────────────────
        ...(isIOS
          ? {
              tabBarBackground: () => (
                <BlurView
                  intensity={isDark ? 80 : 60}
                  tint={isDark ? 'dark' : 'light'}
                  style={StyleSheet.absoluteFill}
                />
              ),
              tabBarStyle: {
                backgroundColor: 'transparent',
                borderTopColor:  isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                borderTopWidth:  0.5,
                height:          Layout.tabBarHeight + insets.bottom,
                paddingBottom:   insets.bottom,
                paddingTop:      8,
                elevation:       0,
                shadowOpacity:   0,
              },
            }
          : {
              // ── Android: solid Material 3 elevation ───────────────────────
              tabBarStyle: {
                backgroundColor: colors.tabBar,
                borderTopWidth:  0,
                elevation:       8,
                height:          Layout.tabBarHeight + insets.bottom,
                paddingBottom:   insets.bottom,
                paddingTop:      8,
              },
            }),

        tabBarActiveTintColor:   colors.tabActive   as string,
        tabBarInactiveTintColor: colors.tabInactive as string,
        tabBarLabelStyle: {
          fontFamily:    FontFamily.sansMedium,
          fontSize:      FontSize.xs,
          marginTop:     2,
          letterSpacing: 0.1,
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused, size }) => (
            <TabIcon Icon={Home} color={color} focused={focused} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="bills"
        options={{
          title: 'Bills',
          tabBarIcon: ({ color, focused, size }) => (
            <TabIcon Icon={Receipt} color={color} focused={focused} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: 'Expenses',
          tabBarIcon: ({ color, focused, size }) => (
            <TabIcon Icon={Wallet} color={color} focused={focused} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="goals"
        options={{
          title: 'Goals',
          tabBarIcon: ({ color, focused, size }) => (
            <TabIcon Icon={Target} color={color} focused={focused} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused, size }) => (
            <TabIcon Icon={User} color={color} focused={focused} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width:           32,
    height:          32,
    alignItems:      'center',
    justifyContent:  'center',
    borderRadius:    10,
  },
  iconWrapActive: {
    // subtle active indicator — optionally add background
  },
});
