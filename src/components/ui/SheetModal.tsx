/**
 * SheetModal — bottom sheet wrapper built on @gorhom/bottom-sheet BottomSheetModal.
 *
 * Why NOT React Native Modal:
 *  - RN Modal is a UIModalPresentationStyle on iOS. Only one Modal can be active at
 *    a time, so AkuDatePicker (which uses RN Modal) gets blocked behind the sheet.
 *
 * Why BottomSheetModal works:
 *  - BottomSheetModal renders via the BottomSheetModalProvider portal — a plain View
 *    on the root window, NOT a UIModal. So RN Modals (AkuDatePicker) can still
 *    appear on top of it normally.
 *
 * Requirements (already satisfied in _layout.tsx):
 *  - <BottomSheetModalProvider> wraps the app.
 *  - <GestureHandlerRootView> wraps the app.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';

// ─── Root cause documentation ─────────────────────────────────────────────────
//
// BottomSheetModal tracks state via an internal statusRef:
//   INITIAL → (present) → ANIMATING → PRESENTED → (dismiss) → DISMISSING → DISMISSED
//
// handlePortalRender (the function that actually draws the sheet) does:
//   if (statusRef === DISMISSING) return;   ← skips render entirely, no error
//
// BUG A — initial mount (visible=false):
//   Our useEffect calls dismiss() → handleDismiss sees statusRef=INITIAL (not
//   in early-exit list [CLOSED, MINIMIZED]) → falls through → statusRef=DISMISSING.
//   Every subsequent present() silently bails in handlePortalRender. Sheet never opens.
//
// BUG B — reopen after close (swipe-down or backdrop):
//   Gorhom internally dismisses the sheet → resetVariables() → statusRef=INITIAL
//   → then fires _providedOnDismiss (our onClose) → parent sets visible=false
//   → our useEffect fires → dismiss() called again → statusRef=DISMISSING again
//   → sheet can never reopen until the component remounts.
//
// FIX:
//   Guard 1 (hasPresented): never call dismiss() before present() has been called once.
//   Guard 2 (isGorhomDismissing): never call dismiss() when gorhom already dismissed
//     the sheet itself. We intercept onDismiss before it reaches the parent so the
//     flag is set before the resulting visible=false useEffect fires.

// ─── Types ────────────────────────────────────────────────────────────────────

interface SheetModalProps {
  visible:  boolean;
  onClose:  () => void;
  children: React.ReactNode;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SheetModal({ visible, onClose, children }: SheetModalProps) {
  const ref          = useRef<BottomSheetModal>(null);
  const { colors }   = useTheme();
  const insets       = useSafeAreaInsets();

  // Guard 1: never call dismiss() before present() has been called at least once.
  const hasPresented       = useRef(false);

  // Guard 2: gorhom already dismissed the sheet (swipe / backdrop). Set BEFORE
  // calling onClose so the flag is true by the time visible=false useEffect fires.
  const isGorhomDismissing = useRef(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (visible) {
        // Opening — reset both guards to a clean slate.
        hasPresented.current       = true;
        isGorhomDismissing.current = false;
        ref.current?.present();
      } else if (hasPresented.current && !isGorhomDismissing.current) {
        // Parent closed us programmatically — ask gorhom to animate out.
        ref.current?.dismiss();
      }
      // Safety-reset the gorhom flag after every visible=false handling.
      if (!visible) {
        isGorhomDismissing.current = false;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  /**
   * Gorhom fires this after it finishes its own internal dismiss animation
   * (swipe-down or backdrop press). We must mark isGorhomDismissing=true
   * BEFORE calling onClose so the flag is already set when the resulting
   * visible=false triggers our useEffect — preventing a second dismiss() call
   * that would re-poison statusRef=DISMISSING.
   */
  const handleGorhomDismiss = useCallback(() => {
    isGorhomDismissing.current = true;
    onClose();
  }, [onClose]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        pressBehavior="close"
      />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={['80%']}
      enablePanDownToClose
      onDismiss={handleGorhomDismiss}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.card }}
      handleIndicatorStyle={{ backgroundColor: colors.border, width: 36 }}
      keyboardBehavior="fillParent"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      <BottomSheetScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 24) },
        ]}
      >
        {/* Close / cancel button */}
        <View style={styles.closeRow}>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X size={18} color={colors.textSecondary} strokeWidth={2} />
          </Pressable>
        </View>

        {children}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop:        4,
  },
  closeRow: {
    flexDirection:  'row',
    justifyContent: 'flex-end',
    marginBottom:   4,
  },
  closeBtn: {
    width:          32,
    height:         32,
    alignItems:     'center',
    justifyContent: 'center',
  },
});
