import React, { useCallback, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
  Pressable,
} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../theme';
import { useUIStore } from '../../store/ui.store';

// ─── Types ────────────────────────────────────────────────────────────────────

type AmountSize = 'lg' | 'md';

interface AmountInputProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  error?: string;
  size?: AmountSize;
  style?: ViewStyle;
  editable?: boolean;
  placeholder?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatWithCommas(raw: string): string {
  // Remove any non-digit characters
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('en-US');
}

function stripCommas(formatted: string): string {
  return formatted.replace(/,/g, '');
}

const AnimatedView = Animated.createAnimatedComponent(View);

// ─── Component ────────────────────────────────────────────────────────────────

export function AmountInput({
  value,
  onChange,
  label,
  error,
  size = 'md',
  style,
  editable = true,
  placeholder = '0',
}: AmountInputProps) {
  const { colors, text, font, fontSize, spacing, radius, layout } = useTheme();
  const currencySymbol = useUIStore((s) => s.currency.symbol);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const focusProgress = useSharedValue(0);
  const hasError = Boolean(error);

  // value is in kobo — display in naira (÷100)
  const toNaira = (kobo: number) => (kobo > 0 ? Math.round(kobo / 100) : 0);

  const [displayValue, setDisplayValue] = useState<string>(
    value > 0 ? formatWithCommas(String(toNaira(value))) : '',
  );

  // Keep display in sync if value changes from outside
  React.useEffect(() => {
    const formatted = value > 0 ? formatWithCommas(String(toNaira(value))) : '';
    setDisplayValue(formatted);
  }, [value]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    focusProgress.value = withTiming(1, { duration: 200 });
  }, [focusProgress]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    focusProgress.value = withTiming(0, { duration: 200 });
  }, [focusProgress]);

  const handleChangeText = useCallback(
    (text: string) => {
      // Strip commas to get raw digit string
      const raw = stripCommas(text);
      // Only allow digits
      const digitsOnly = raw.replace(/\D/g, '');
      const formatted = formatWithCommas(digitsOnly);
      setDisplayValue(formatted);
      // User types naira → store as kobo (×100)
      const numeric = digitsOnly ? Number(digitsOnly) : 0;
      onChange(numeric * 100);
    },
    [onChange],
  );

  const borderAnimatedStyle = useAnimatedStyle(() => {
    const borderColor = hasError
      ? colors.danger
      : interpolateColor(
          focusProgress.value,
          [0, 1],
          [colors.inputBorder, colors.inputFocusBorder],
        );

    return {
      borderColor,
      borderWidth: isFocused || hasError ? 1.5 : 1,
    };
  });

  // Font sizes
  const amountFontSize = size === 'lg' ? 40 : 28;
  const prefixFontSize = size === 'lg' ? 32 : 22;

  const containerHeight = size === 'lg' ? 80 : 64;

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      accessibilityRole="none"
      style={style}
    >
      {label && (
        <Text
          style={[
            text.label,
            styles.label,
            {
              color: hasError
                ? colors.danger
                : isFocused
                ? colors.primary
                : colors.textSecondary,
            },
          ]}
        >
          {label}
        </Text>
      )}

      <AnimatedView
        style={[
          styles.container,
          borderAnimatedStyle,
          {
            height: containerHeight,
            borderRadius: radius.md,
            backgroundColor: editable
              ? colors.inputBackground
              : colors.backgroundSecondary,
          },
        ]}
      >
        {/* Currency symbol prefix */}
        <Text
          style={[
            styles.prefix,
            {
              fontSize: prefixFontSize,
              fontFamily: font.displayLight,
              color: isFocused
                ? colors.accent
                : colors.textTertiary,
              lineHeight: prefixFontSize * 1.1,
            },
          ]}
        >
          {currencySymbol}
        </Text>

        {/* Amount input */}
        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            {
              fontSize: amountFontSize,
              fontFamily: font.displayLight,
              color: colors.text,
              lineHeight: amountFontSize * 1.1,
            },
          ]}
          value={displayValue}
          onChangeText={handleChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          keyboardType="numeric"
          placeholder={placeholder}
          placeholderTextColor={colors.inputPlaceholder}
          editable={editable}
          selectTextOnFocus
          // @ts-ignore — includeFontPadding is a valid Android prop not in RN types
          includeFontPadding={false}
          textAlignVertical="center"
        />
      </AnimatedView>

      {hasError && (
        <Text
          style={[
            text.caption,
            styles.error,
            { color: colors.danger },
          ]}
        >
          {error}
        </Text>
      )}
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  label: {
    marginBottom: 6,
    marginLeft: 2,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  prefix: {
    marginRight: 4,
    includeFontPadding: false,
  } as object,
  input: {
    flex: 1,
    includeFontPadding: false,
  } as object,
  error: {
    marginTop: 5,
    marginLeft: 2,
  },
});
