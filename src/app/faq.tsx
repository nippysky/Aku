/**
 * faq.tsx — In-app FAQ / Help Centre
 *
 * Accordion-style, fully searchable, premium look.
 * Grouped into categories. Tapping a question expands/collapses the answer.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  ChevronLeft,
  ChevronDown,
  Search,
  MessageSquare,
} from 'lucide-react-native';
import * as Linking from 'expo-linking';
import { useTheme } from '../theme';
import { useUIStore } from '../store/ui.store';

// ─── FAQ data ─────────────────────────────────────────────────────────────────

interface FAQItem {
  q: string;
  a: string;
}

interface FAQCategory {
  title: string;
  emoji: string;
  items: FAQItem[];
}

/* eslint-disable quotes */
const FAQ_DATA: FAQCategory[] = [
  {
    title: "Getting Started",
    emoji: "🚀",
    items: [
      {
        q: "What is Aku?",
        a: "Aku is a personal finance app that helps you track expenses, manage bills, set savings goals, and understand your money. Everything syncs securely across your devices.",
      },
      {
        q: "How do I log my first expense?",
        a: "Tap the Expenses tab at the bottom, then tap the + button in the top-right corner. Fill in the amount, category, date, and an optional note — then tap Save. Your expense is instantly recorded.",
      },
      {
        q: "Is my data secure?",
        a: "Yes. All your financial data is encrypted end-to-end using a unique key that only you hold. Even Aku servers cannot read your data. Your key is protected by your device security and stored encrypted on our servers.",
      },
      {
        q: "How does sync work?",
        a: "Aku uses end-to-end encrypted sync over the internet. When you save anything, it is encrypted on your device and pushed to the server. Other devices pull it down instantly via a real-time connection.",
      },
    ],
  },
  {
    title: "Expenses & Income",
    emoji: "💸",
    items: [
      {
        q: "What is the difference between expenses and bills?",
        a: "Expenses are one-off purchases (coffee, groceries, fuel). Bills are recurring fixed obligations (Netflix, rent, electricity). Bills have a due date and a status — pending, paid, or overdue.",
      },
      {
        q: "Can I track income in Aku?",
        a: "Yes. Tap the Expenses tab and switch to the Income segment. Tap + to log income with an amount, category, and date. You can also see income vs expenses on the Analytics screen.",
      },
      {
        q: "What are recurring expenses and income?",
        a: "Recurring items are auto-logged on their schedule (daily, weekly, monthly, etc.). Go to More then Recurring to set them up. Aku will log them automatically so you never miss an entry.",
      },
      {
        q: "How do I edit or delete an expense?",
        a: "On the Expenses screen, tap any expense to open its detail view. From there you can edit the amount, date, category, and note, or delete it entirely.",
      },
    ],
  },
  {
    title: "Budgets & Goals",
    emoji: "🎯",
    items: [
      {
        q: "How do budgets work?",
        a: "You set a monthly spending limit for a category (e.g. Food). Aku tracks your actual spending in that category and shows you how much is left. You will get a push notification when you are near or over the limit.",
      },
      {
        q: "How do savings goals work?",
        a: "Create a goal with a target amount and optional deadline. Manually add contributions, or auto-allocate a percentage of recurring income. Aku tracks your progress and shows a completion percentage.",
      },
      {
        q: "Can I contribute to a goal automatically?",
        a: "Yes. When setting up a recurring income (e.g. monthly salary), enable Auto-allocate to goal and choose a percentage. Each time the income is auto-logged, that percentage is contributed to your chosen goal.",
      },
    ],
  },
  {
    title: "Security & App Lock",
    emoji: "🔒",
    items: [
      {
        q: "How does Aku lock the app?",
        a: "Aku uses your device's own security — Face ID, fingerprint, or your phone's PIN/pattern as backup. There is no separate app passcode to create or remember. The app locks on launch and after 5 minutes in the background.",
      },
      {
        q: "What if my phone has no screen lock?",
        a: "Aku will still open, and your data remains encrypted end-to-end on our servers. For local protection we recommend adding a screen lock in your device settings — Aku will then lock automatically too.",
      },
      {
        q: "Can I turn the app lock off?",
        a: "Yes. Go to More > Security and toggle App Lock off. Your data stays encrypted either way.",
      },
    ],
  },
  {
    title: "Notifications",
    emoji: "🔔",
    items: [
      {
        q: "What kinds of notifications does Aku send?",
        a: "Aku sends bill due date reminders, budget threshold alerts, savings goal milestones, hourly logging nudges through the day, and personalised financial insights.",
      },
      {
        q: "How do I turn off certain notifications?",
        a: "Go to More > Notification Settings. You can toggle each category on or off independently — bills, budgets, goals, and daily reminders each have their own switch.",
      },
    ],
  },
  {
    title: "Statements & Export",
    emoji: "📄",
    items: [
      {
        q: "How do I download a financial statement?",
        a: "Go to More > Download Statement. Choose a date range (this month, last 3 months, all time, or custom), then tap Generate Statement. A premium PDF will be created and shared via your device's share sheet.",
      },
      {
        q: "What does the statement include?",
        a: "The PDF includes income, expenses, bills, budgets, and savings goals for the selected period. It also shows a net cash flow summary (earned minus spent equals surplus or deficit).",
      },
    ],
  },
  {
    title: "Account & Data",
    emoji: "👤",
    items: [
      {
        q: "How do I update my profile photo?",
        a: "On the Profile / More tab, tap your avatar at the top. You can take a new photo or pick one from your library. The photo is cropped to a square and synced to all your devices.",
      },
      {
        q: "What happens if I sign out?",
        a: "Signing out removes your session from this device. Your data stays safely on the server. When you sign back in with the same email, everything is restored.",
      },
      {
        q: "Can I delete my account?",
        a: "Yes. Scroll to the bottom of the More tab and tap Delete Account. After two confirmation steps, your account and all associated data are permanently deleted. This cannot be undone.",
      },
    ],
  },
];
/* eslint-enable quotes */

// ─── Accordion item ───────────────────────────────────────────────────────────

function AccordionItem({ item, isFirst, isLast }: { item: FAQItem; isFirst: boolean; isLast: boolean }) {
  const { colors, text, radius, font, fontSize } = useTheme();
  const [open, setOpen] = useState(false);
  const rotation = useSharedValue(0);

  const toggle = useCallback(() => {
    setOpen((v) => {
      const next = !v;
      rotation.value = withTiming(next ? 1 : 0, { duration: 200 });
      return next;
    });
  }, [rotation]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 180}deg` }],
  }));

  return (
    <>
      <Pressable
        onPress={toggle}
        style={[
          styles.row,
          {
            backgroundColor: colors.card,
            borderTopLeftRadius:     isFirst ? radius.lg : 0,
            borderTopRightRadius:    isFirst ? radius.lg : 0,
            borderBottomLeftRadius:  isLast && !open ? radius.lg : 0,
            borderBottomRightRadius: isLast && !open ? radius.lg : 0,
          },
        ]}
        android_ripple={{ color: colors.borderLight }}
      >
        <Text
          style={[styles.question, { color: colors.text, fontFamily: font.sansMedium, fontSize: fontSize.sm }]}
          numberOfLines={3}
        >
          {item.q}
        </Text>
        <Animated.View style={chevronStyle}>
          <ChevronDown size={18} color={colors.textTertiary} strokeWidth={1.8} />
        </Animated.View>
      </Pressable>

      {open && (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[
            styles.answer,
            {
              backgroundColor: colors.backgroundSecondary,
              borderBottomLeftRadius:  isLast ? radius.lg : 0,
              borderBottomRightRadius: isLast ? radius.lg : 0,
            },
          ]}
        >
          <Text style={[text.body, { color: colors.textSecondary, lineHeight: 22 }]}>
            {item.a}
          </Text>
        </Animated.View>
      )}

      {!isLast && (
        <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 16 }} />
      )}
    </>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function FAQScreen() {
  const { colors, font, fontSize, text, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showToast } = useUIStore();

  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInput>(null);

  const filtered = useMemo<FAQCategory[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ_DATA;
    return FAQ_DATA
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q),
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [query]);

  const handleContact = useCallback(() => {
    Linking.openURL('mailto:contact@nippysky.com?subject=Aku Help').catch(() => {
      showToast('info', 'Email contact@nippysky.com for support');
    });
  }, [showToast]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 12, borderBottomColor: colors.borderLight },
        ]}
      >
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <ChevronLeft size={22} color={colors.text} strokeWidth={1.8} />
        </Pressable>
        <Text
          style={[
            styles.headerTitle,
            {
              fontFamily:    font.displayLight,
              fontSize:      fontSize['2xl'],
              color:         colors.text,
              letterSpacing: -0.5,
            },
          ]}
        >
          Help & FAQ
        </Text>
        <View style={styles.headerBtn} />
      </View>

      {/* ── Search bar ── */}
      <View
        style={[
          styles.searchWrap,
          {
            backgroundColor: colors.inputBackground,
            borderRadius:    radius.lg,
            borderColor:     colors.border,
            marginHorizontal: 16,
            marginTop:       16,
            marginBottom:    4,
          },
        ]}
      >
        <Search size={17} color={colors.textTertiary} strokeWidth={1.8} />
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={setQuery}
          placeholder="Search questions…"
          placeholderTextColor={colors.textTertiary}
          style={[
            styles.searchInput,
            { color: colors.text, fontFamily: font.sansRegular, fontSize: fontSize.md },
          ]}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      {/* ── Content ── */}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Empty search state */}
        {filtered.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={[text.bodyMedium, { color: colors.textSecondary }]}>
              No results for "{query}"
            </Text>
            <Text style={[text.bodySm, { color: colors.textTertiary, marginTop: 4 }]}>
              Try a different keyword, or contact us below.
            </Text>
          </View>
        )}

        {/* Category sections */}
        {filtered.map((cat) => (
          <View key={cat.title} style={styles.section}>
            <Text
              style={[
                styles.catLabel,
                {
                  fontFamily:    font.sansMedium,
                  fontSize:      fontSize.xs,
                  color:         colors.textTertiary,
                  letterSpacing: 1.2,
                },
              ]}
            >
              {cat.emoji}{'  '}{cat.title.toUpperCase()}
            </Text>

            <View
              style={[
                styles.group,
                { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
              ]}
            >
              {cat.items.map((item, i) => (
                <AccordionItem
                  key={item.q}
                  item={item}
                  isFirst={i === 0}
                  isLast={i === cat.items.length - 1}
                />
              ))}
            </View>
          </View>
        ))}

        {/* ── Contact card ── */}
        <Pressable
          onPress={handleContact}
          style={({ pressed }) => [
            styles.contactCard,
            {
              backgroundColor: colors.primary,
              borderRadius:    radius.xl,
              opacity:         pressed ? 0.85 : 1,
              marginTop:       8,
            },
          ]}
        >
          <View style={[styles.contactIcon, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
            <MessageSquare size={20} color="#fff" strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: '#fff' }}>
              Still need help?
            </Text>
            <Text style={{ fontFamily: font.sansRegular, fontSize: fontSize.xs, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
              Email us at contact@nippysky.com
            </Text>
          </View>
        </Pressable>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 16,
    paddingBottom:     12,
    borderBottomWidth: 1,
  },
  headerTitle: { flex: 1, textAlign: 'center' },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },

  searchWrap: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    paddingHorizontal: 14,
    height:            46,
    borderWidth:       1,
  },
  searchInput: { flex: 1, height: 46 },

  content: {
    paddingHorizontal: 16,
    paddingTop:        20,
    gap:               24,
  },

  section: { gap: 10 },
  catLabel: { marginLeft: 4 },
  group: {},

  row: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   15,
    paddingHorizontal: 16,
    gap:               12,
  },
  question: { flex: 1, lineHeight: 20 },

  answer: {
    paddingHorizontal: 16,
    paddingVertical:   14,
  },

  emptyState: {
    alignItems: 'center',
    paddingTop: 48,
    gap:        4,
  },

  contactCard: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               14,
    paddingVertical:   18,
    paddingHorizontal: 20,
  },
  contactIcon: {
    width:          40,
    height:         40,
    borderRadius:   20,
    alignItems:     'center',
    justifyContent: 'center',
  },
});
