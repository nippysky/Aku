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

export default function TermsScreen() {
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
        title="Terms of Service"
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
            Welcome to Akù. These Terms of Service ("Terms") govern your use of the Akù mobile application and related services operated by NIPPYSKY ("we", "us", or "our"). By downloading, installing, or using Akù, you agree to these Terms. Please read them carefully.
          </P>
          <P>
            If you do not agree to these Terms, do not use Akù. You can delete your account at any time in Settings → Account → Delete Account.
          </P>
        </View>

        <Section title="1. Eligibility">
          <P>
            You must be at least 16 years old to use Akù. By using the app you represent that you meet this age requirement and that the information you provide is accurate and complete.
          </P>
          <P>
            Akù is currently available to users in Nigeria and select other countries. We may restrict availability in additional regions at any time.
          </P>
        </Section>

        <Section title="2. Your Account">
          <P>You are responsible for maintaining the confidentiality of your account and for all activity that occurs under it. You agree to:</P>
          <Li>Provide a valid email address and keep it up to date</Li>
          <Li>Keep your PIN and biometric credentials secure and not share them</Li>
          <Li>Notify us immediately at contact@nippysky.com if you suspect unauthorised access</Li>
          <Li>Not create more than one personal account</Li>
          <View style={{ height: 6 }} />
          <P>We reserve the right to terminate or suspend your account if we reasonably believe it is being used fraudulently, in violation of these Terms, or in a way that harms other users.</P>
        </Section>

        <Section title="3. The Service">
          <P>Akù is a personal finance management tool. It allows you to:</P>
          <Li>Track income and expenses manually</Li>
          <Li>Set and monitor budgets per spending category</Li>
          <Li>Create savings goals and log contributions</Li>
          <Li>Set up recurring income and expense reminders</Li>
          <Li>Receive personalised financial insights and push notifications</Li>
          <View style={{ height: 6 }} />
          <P>
            Akù is a manual tracking tool only. We do not connect to your bank account, card, or any payment system. We do not move money on your behalf. We are not a financial institution, a payment service provider, or an investment advisor.
          </P>
        </Section>

        <Section title="4. Not Financial Advice">
          <P>
            Nothing in Akù — including budgets, spending insights, goal projections, push notification messages, or in-app tips — constitutes financial, legal, tax, or investment advice. The app provides informational tools only.
          </P>
          <P>Always consult a qualified financial professional for decisions that may materially affect your finances.</P>
        </Section>

        <Section title="5. Acceptable Use">
          <P>You agree not to use Akù to:</P>
          <Li>Enter false, misleading, or fraudulent financial data</Li>
          <Li>Attempt to reverse-engineer, decompile, or tamper with the app</Li>
          <Li>Circumvent security measures such as PIN lock or encryption</Li>
          <Li>Use automated means to access or scrape the app or its API</Li>
          <Li>Violate any applicable Nigerian law or international law</Li>
          <View style={{ height: 6 }} />
          <P>Violation of these rules may result in immediate account suspension and, where required by law, reporting to the appropriate authorities.</P>
        </Section>

        <Section title="6. Push Notifications">
          <P>
            With your permission, Akù sends push notifications including budget alerts, goal milestones, spending insights, and bill reminders. You can control which notifications you receive in Settings → Notifications, and you can revoke permission entirely through your device's system settings.
          </P>
          <P>
            Notification messages are generated by our server based on anonymised signals from your usage patterns. They do not include the actual amounts or descriptions of your individual transactions.
          </P>
        </Section>

        <Section title="7. Intellectual Property">
          <P>
            Akù, the NIPPYSKY name and logo, and all app content, design, code, and features are the intellectual property of NIPPYSKY. You may not copy, distribute, modify, or create derivative works without our express written permission.
          </P>
          <P>Your financial data belongs to you. We claim no ownership over the information you enter into Akù. You can export and delete your data at any time.</P>
        </Section>

        <Section title="8. Privacy">
          <P>
            Your use of Akù is also governed by our Privacy Policy, which is incorporated into these Terms by reference. By using Akù, you consent to the data practices described in that policy.
          </P>
        </Section>

        <Section title="9. Disclaimer of Warranties">
          <P>
            Akù is provided "as is" and "as available" without warranty of any kind, express or implied. We do not warrant that the app will be uninterrupted, error-free, or free from viruses or other harmful components.
          </P>
          <P>
            To the maximum extent permitted by applicable law, NIPPYSKY disclaims all warranties, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement.
          </P>
        </Section>

        <Section title="10. Limitation of Liability">
          <P>
            To the fullest extent permitted by law, NIPPYSKY shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of data, profits, or goodwill, arising out of or in connection with your use of Akù.
          </P>
          <P>
            Our total liability to you for any claim arising out of these Terms or your use of the app shall not exceed the amount you paid us in the twelve months preceding the claim. Since Akù is currently free to use, this amount is zero (₦0).
          </P>
        </Section>

        <Section title="11. Indemnification">
          <P>
            You agree to indemnify and hold harmless NIPPYSKY and its officers, directors, employees, and agents from any claims, damages, losses, or expenses (including legal fees) arising out of your violation of these Terms or your use of Akù.
          </P>
        </Section>

        <Section title="12. Termination">
          <P>
            You may stop using Akù and delete your account at any time in Settings → Account → Delete Account. Upon deletion, your data will be permanently removed within 30 days.
          </P>
          <P>
            We may suspend or terminate your access to Akù at any time if you breach these Terms, if we are required to by law, or if we discontinue the service. We will give you reasonable notice where possible.
          </P>
        </Section>

        <Section title="13. Changes to These Terms">
          <P>
            We may update these Terms from time to time. When we make material changes, we will notify you via the app or by email at least 7 days before the changes take effect. Continued use of Akù after the effective date constitutes acceptance of the updated Terms.
          </P>
        </Section>

        <Section title="14. Governing Law">
          <P>
            These Terms are governed by the laws of the Federal Republic of Nigeria. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts of Nigeria.
          </P>
        </Section>

        <Section title="15. Contact Us">
          <P>Questions about these Terms? Get in touch.</P>
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
