import React, { useCallback, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LucideIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

type LucideIcon = React.ComponentType<LucideIconProps>;

interface InputProps
  extends Pick<
    TextInputProps,
    | 'keyboardType'
    | 'autoCapitalize'
    | 'autoCorrect'
    | 'autoComplete'
    | 'secureTextEntry'
    | 'multiline'
    | 'numberOfLines'
    | 'editable'
    | 'maxLength'
    | 'returnKeyType'
    | 'onSubmitEditing'
    | 'onBlur'
    | 'onFocus'
    | 'blurOnSubmit'
    | 'textContentType'
    | 'value'
    | 'onChangeText'
    | 'placeholder'
    | 'testID'
  > {
  label: string;
  error?: string;
  iconLeft?: LucideIcon;
  rightElement?: React.ReactNode;
  style?: ViewStyle;
  inputRef?: React.RefObject<TextInput>;
  /** Pass true when this Input is rendered inside a BottomSheetModal so the
   *  keyboard properly pushes the sheet up instead of covering the field. */
  asBottomSheetInput?: boolean;
}

// ─── Animated border wrapper ──────────────────────────────────────────────────

const AnimatedView = Animated.createAnimatedComponent(View);

// ─── Platform-specific background ────────────────────────────────────────────

function inputBackground(
  isDark: boolean,
  editable: boolean,
  colors: { inputBackground: string; backgroundSecondary: string },
): string {
  if (!editable) return colors.backgroundSecondary;
  if (Platform.OS === 'ios') {
    return isDark
      ? 'rgba(40,50,45,0.6)'
      : 'rgba(245,245,243,0.85)';
  }
  return colors.backgroundSecondary;
}

function defaultBorderColor(isDark: boolean, colors: { inputBorder: string }): string {
  if (Platform.OS === 'ios') {
    return isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
  }
  return colors.inputBorder;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Input({
  label,
  error,
  iconLeft: IconLeft,
  rightElement,
  style,
  inputRef,
  asBottomSheetInput = false,
  editable = true,
  multiline = false,
  numberOfLines,
  ...textInputProps
}: InputProps) {
  // Use gorhom's BottomSheetTextInput when inside a sheet so the sheet moves
  // up with the keyboard instead of the keyboard covering the input.
  const ActiveTextInput = asBottomSheetInput
    ? (BottomSheetTextInput as unknown as typeof TextInput)
    : TextInput;
  const { colors, layout, text, font, fontSize, spacing, radius, isDark } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const internalRef = useRef<TextInput>(null);
  const ref = inputRef ?? internalRef;

  const focusProgress = useSharedValue(0);
  const errorProgress = useSharedValue(error ? 1 : 0);

  const hasError = Boolean(error);

  // Update error animation when error prop changes
  React.useEffect(() => {
    errorProgress.value = withTiming(hasError ? 1 : 0, { duration: 200 });
  }, [hasError, errorProgress]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    focusProgress.value = withTiming(1, { duration: 200 });
  }, [focusProgress]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    focusProgress.value = withTiming(0, { duration: 200 });
  }, [focusProgress]);

  const defaultBorder = defaultBorderColor(isDark, colors);

  const borderAnimatedStyle = useAnimatedStyle(() => {
    const borderColor = hasError
      ? colors.danger
      : interpolateColor(
          focusProgress.value,
          [0, 1],
          [defaultBorder, colors.inputFocusBorder],
        );

    return {
      borderColor,
      borderWidth: isFocused || hasError ? 1.5 : Platform.OS === 'ios' ? 0.5 : 1,
    };
  });

  const iconSize = layout.iconMd;

  const inputHeight = multiline
    ? Math.max(layout.inputHeight, (numberOfLines ?? 3) * 22)
    : layout.inputHeight;

  const horizontalPadding = spacing[4];
  const iconPaddingLeft = IconLeft ? horizontalPadding + iconSize + spacing[2] : horizontalPadding;
  const iconPaddingRight = rightElement ? horizontalPadding + 40 : horizontalPadding;

  // Platform-specific border radius
  const inputBorderRadius = Platform.OS === 'ios' ? 14 : 10;

  const bg = inputBackground(isDark, editable, colors);

  return (
    <View style={[styles.wrapper, style]}>
      {/* Label */}
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

      {/* Input container */}
      <AnimatedView
        style={[
          styles.inputContainer,
          borderAnimatedStyle,
          {
            height: inputHeight,
            borderRadius: inputBorderRadius,
            backgroundColor: bg,
          },
        ]}
      >
        {/* Left icon */}
        {IconLeft && (
          <View style={[styles.iconLeft, { left: horizontalPadding }]}>
            <IconLeft
              size={iconSize}
              color={
                hasError
                  ? colors.danger
                  : isFocused
                  ? colors.primary
                  : colors.textTertiary
              }
              strokeWidth={1.8}
            />
          </View>
        )}

        <ActiveTextInput
          ref={ref as React.RefObject<TextInput>}
          style={[
            text.body,
            styles.input,
            {
              color: colors.text,
              paddingLeft: iconPaddingLeft,
              paddingRight: iconPaddingRight,
              height: inputHeight,
              textAlignVertical: multiline ? 'top' : 'center',
              paddingTop: multiline ? spacing[3] : 0,
            },
          ]}
          placeholderTextColor={colors.inputPlaceholder}
          onFocus={handleFocus}
          onBlur={handleBlur}
          editable={editable}
          multiline={multiline}
          numberOfLines={numberOfLines}
          {...textInputProps}
        />

        {/* Right element */}
        {rightElement && (
          <View style={styles.rightElement}>
            {rightElement}
          </View>
        )}
      </AnimatedView>

      {/* Error text */}
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
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  label: {
    marginBottom: 6,
    marginLeft: 2,
  },
  inputContainer: {
    overflow: 'hidden',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    includeFontPadding: false,
  },
  iconLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 1,
  },
  rightElement: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  error: {
    marginTop: 5,
    marginLeft: 2,
  },
});
