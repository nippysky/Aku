import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  ViewStyle,
} from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KeyboardWrapperProps {
  children: React.ReactNode;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  scrollable?: boolean;
  /** Extra padding at bottom when keyboard is visible */
  keyboardVerticalOffset?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function KeyboardWrapper({
  children,
  style,
  contentContainerStyle,
  scrollable = false,
  keyboardVerticalOffset = 0,
}: KeyboardWrapperProps) {
  const behavior = Platform.OS === 'ios' ? 'padding' : 'height';

  if (scrollable) {
    return (
      <KeyboardAvoidingView
        style={[styles.flex, style]}
        behavior={behavior}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={behavior}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});
