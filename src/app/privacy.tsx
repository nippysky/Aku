import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useTheme } from '../theme';
import { ScreenHeader } from '../components/ui/ScreenHeader';

const LAST_UPDATED = 'July 2025';

export default function PrivacyScreen() {
  const { colors, text, font } = useTheme();
  const insets = useSafeAreaInsets();
  const router  = useRouter();

  const sectionTitleStyle = [text.bodySm, { fontFamily: font.sansSemiBold, color: colors.primary, marginBottom: 8 }] as const;
  const paraStyle         = [text.bodySm, { color: colors.textSecondary, lineHeight: 22, marginBottom: 10 }] as const;
  const liStyle           = [text.bodySm, { color: colors.textSecondary, lineHeight: 22, marginBottom: 4 }] as const;

  function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <View style={{ marginBottom: 24 }}>
        <Text style={sectionTitleStyle as any}>{title}</Text>
        {children}
      </View>
    );
  }

  function P({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
    return (
      <Text style={[...paraStyle, bold ? { fontFamily: font.sansSemiBold, color: colors.text } : {}] as any}>
        {children}
      </Text>
    );
  }

  function Li({ children }: { children: React.ReactNode }) {
    return <Text style={liStyle as any}>{'• '}{children}</Text>;
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Privacy Policy"
        leftAction={{
          icon: ArrowLeft,
          onPress: () => router.back(),
          accessibilityLabel: 'Back',
        }}
        style={{ paddingTop: insets.top }}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[text.caption, { color: colors.textTertiary, marginBottom: 24 }]}>
          Last updated: {LAST_UPDATED}
        </Text>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <P>
            Akù is a personal finance app built by NIPPYSKY. We believe your financial data is deeply personal, and we designed Akù from the ground up to protect it. This Privacy Policy explains what data we collect, why we collect it, how we store and secure it, and your rights over it.
          </P>
          <P>
            By using Akù, you agree to this policy. If you do not agree, please stop using the app and contact us to delete your account and data.
          </P>
        </View>

        <Section title="1. Who We Are">
          <P>Akù is a product of NIPPYSKY, a technology company based in Nigeria. References to "we", "us", or "our" in this policy mean NIPPYSKY. You can reach us at contact@nippysky.com.</P>
        </Section>

        <Section title="2. Data We Collect">
          <P>We collect only what is necessary to provide and improve Akù:</P>
          <P bold>Account data</P>
          <Li>Email address — used to authenticate your account via magic link</Li>
          <Li>Display name (optional) — shown on your profile</Li>
          <P bold>Financial data you enter</P>
          <Li>Expense and income entries (amount, category, description, date)</Li>
          <Li>Budget limits per category</Li>
          <Li>Savings goals (name, target amount, contributions)</Li>
          <Li>Recurring expenses and income templates</Li>
          <P bold>Device and usage data</P>
          <Li>Expo push token — for delivering push notifications (stored server-side, linked to your account)</Li>
          <Li>Device platform (iOS or Android) — to send the correct notification format</Li>
          <Li>Aggregated, anonymised usage signals used by our notification worker to send contextually relevant nudges</Li>
          <View style={{ height: 6 }} />
          <P>
            We do not collect your bank login credentials, card numbers, BVN, NIN, or any payment instrument data. Akù does not connect to your bank. All financial data in the app is entered manually by you.
          </P>
        </Section>

        <Section title="3. End-to-End Encryption">
          <P>
            All financial data you enter in Akù — expenses, income, goals, budgets, and recurring items — is encrypted on your device before it leaves. We use AES-256-GCM encryption with a Data Encryption Key (DEK) derived from your authentication credentials. The DEK never leaves your device in an unencrypted form.
          </P>
          <P>
            Our servers store only ciphertext. Even NIPPYSKY employees cannot read your financial entries. Decryption happens exclusively on your device using your DEK.
          </P>
          <P>
            Your account email and display name are stored in plaintext because they are needed for authentication and account management.
          </P>
        </Section>

        <Section title="4. How We Use Your Data">
          <Li>To authenticate you and maintain your session</Li>
          <Li>To sync your encrypted data across your devices</Li>
          <Li>To send push notifications based on your in-app preferences (you can turn off all notifications in Settings)</Li>
          <Li>To improve the app — using anonymised, aggregated analytics only</Li>
          <View style={{ height: 6 }} />
          <P>We do not sell your data. We do not use your data for advertising. We do not share your data with third parties except as described in Section 5.</P>
        </Section>

        <Section title="5. Data Sharing">
          <P>Your data is shared only in the following circumstances:</P>
          <Li>Infrastructure providers — we use cloud hosting providers to run our servers. Your encrypted data is stored on their infrastructure. These providers are contractually prohibited from accessing or processing your data beyond what is necessary to provide the hosting service.</Li>
          <Li>Legal requirements — we may disclose data if required by Nigerian law, a court order, or to protect the safety of users.</Li>
        </Section>

        <Section title="6. Data Retention">
          <P>Your data is retained for as long as your account is active. When you delete your account (via Settings → Account → Delete Account), we permanently delete all your data — including encrypted financial records, push tokens, and account information — within 30 days.</P>
          <P>Anonymised, aggregated analytics data (not linked to any individual) may be retained indefinitely.</P>
        </Section>

        <Section title="7. Security Measures">
          <Li>AES-256-GCM encryption for all financial data (client-side before transmission)</Li>
          <Li>TLS 1.3 for all data in transit</Li>
          <Li>JWT-based session tokens with short expiry</Li>
          <Li>Biometric / PIN lock with automatic timeout on app background</Li>
          <Li>Push tokens stored server-side only; never included in notification payloads</Li>
          <View style={{ height: 6 }} />
          <P>No system is 100% secure. If you suspect your account has been compromised, please contact us immediately at contact@nippysky.com.</P>
        </Section>

        <Section title="8. Children's Privacy">
          <P>Akù is not directed at children under 16. We do not knowingly collect personal data from anyone under 16. If you believe a child has created an account, please contact us and we will delete the account immediately.</P>
        </Section>

        <Section title="9. Your Rights">
          <P>You have the right to:</P>
          <Li>Access — request a copy of your data at any time</Li>
          <Li>Correction — update inaccurate account information in-app or by contacting us</Li>
          <Li>Deletion — delete your account and all associated data permanently</Li>
          <Li>Portability — export your financial data as a PDF report (Settings → Export)</Li>
          <Li>Withdraw consent — turn off push notifications at any time in Settings</Li>
          <View style={{ height: 6 }} />
          <P>To exercise any of these rights, use the in-app controls or email us at contact@nippysky.com. We will respond within 14 business days.</P>
        </Section>

        <Section title="10. Cookies and Tracking">
          <P>Akù is a mobile app and does not use cookies. We do not use any third-party tracking or advertising SDKs.</P>
        </Section>

        <Section title="11. Changes to This Policy">
          <P>We may update this policy from time to time. When we make material changes, we will notify you via the app or by email at least 7 days before the changes take effect. Continued use of Akù after the effective date constitutes acceptance of the updated policy.</P>
        </Section>

        <Section title="12. Contact Us">
          <P>Questions about this policy or your data? We'd love to hear from you.</P>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 8 }]}>
            <Text style={[text.bodySm, { fontFamily: font.sansSemiBold, color: colors.text, marginBottom: 4 }]}>NIPPYSKY</Text>
            <Text style={[text.bodySm, { color: colors.primary }]}>contact@nippysky.com</Text>
            <Text style={[text.caption, { color: colors.textSecondary, marginTop: 2 }]}>Nigeria</Text>
          </View>
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
});
