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

/**
 * Floating center action — the Finance tab.
 * Everything in Akù is ultimately an expense or an income, so this tab is
 * the visual anchor of the app: a raised, icon-only accent button.
 */
function FinanceTabIcon({ focused }: { focused: boolean }) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={[
        styles.financeFab,
        {
          backgroundColor: colors.primary,
          shadowColor:     colors.primary,
          borderColor:     isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.65)',
        },
        focused && styles.financeFabFocused,
      ]}
    >
      <Wallet size={26} color="#F5F2EC" strokeWidth={focused ? 2.2 : 1.9} />
    </View>
  );
}

export default function TabsLayout() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const isIOS  = Platform.OS === 'ios';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        // ── iOS ──────────────────────────────────────────────────────────────
        ...(isIOS
          ? isDark
            ? {
                // Dark mode iOS: clean solid surface — no blur artefacts
                tabBarStyle: {
                  backgroundColor: colors.tabBar,
                  borderTopColor:  'rgba(255,255,255,0.07)',
                  borderTopWidth:  0.5,
                  height:          Layout.tabBarHeight + insets.bottom,
                  paddingBottom:   insets.bottom,
                  paddingTop:      8,
                  elevation:       0,
                  shadowOpacity:   0,
                },
              }
            : {
                // Light mode iOS: frosted glass
                tabBarBackground: () => (
                  <BlurView
                    intensity={60}
                    tint="light"
                    style={StyleSheet.absoluteFill}
                  />
                ),
                tabBarStyle: {
                  backgroundColor: 'transparent',
                  borderTopColor:  'rgba(0,0,0,0.06)',
                  borderTopWidth:  0.5,
                  height:          Layout.tabBarHeight + insets.bottom,
                  paddingBottom:   insets.bottom,
                  paddingTop:      8,
                  elevation:       0,
                  shadowOpacity:   0,
                },
              }
          : {
              // ── Android: solid Material 3 ────────────────────────────────
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
          title:       'Finance',
          // Icon-only floating accent button — no label, ever.
          tabBarLabel: () => null,
          tabBarIcon:  ({ focused }) => <FinanceTabIcon focused={focused} />,
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
          title: 'More',
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

  // ── Floating Finance action button ─────────────────────────────────────
  financeFab: {
    width:          58,
    height:         58,
    borderRadius:   29,
    marginTop:      -26,          // raise above the tab bar edge
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    2,
    // soft elevated shadow
    shadowOffset:   { width: 0, height: 6 },
    shadowOpacity:  0.32,
    shadowRadius:   10,
    elevation:      10,
  },
  financeFabFocused: {
    transform:     [{ scale: 1.06 }],
    shadowOpacity: 0.45,
  },
});
