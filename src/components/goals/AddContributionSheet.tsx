import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { GlassSheetBackground } from '../ui/GlassSheetBackground';
import { useTheme } from '../../theme';
import { AmountInput } from '../ui/AmountInput';
import { Button } from '../ui/Button';
import { useGoalsStore } from '../../store/goals.store';
import { useAuthStore } from '../../store/auth.store';
import { useUIStore } from '../../store/ui.store';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AddContributionSheetProps {
  goalId:    string;
  goalName:  string;
  isOpen:    boolean;
  onClose:   () => void;
  onSuccess?: () => void;
}

const SNAP_POINTS = ['40%', '55%'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNGN(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG')}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddContributionSheet({
  goalId,
  goalName,
  isOpen,
  onClose,
  onSuccess,
}: AddContributionSheetProps) {
  const { colors, text, font, fontSize, spacing } = useTheme();
  const sheetRef = useRef<BottomSheetModal>(null);

  const { addContribution } = useGoalsStore();
  const { user }            = useAuthStore();
  const { showToast }       = useUIStore();

  const [amount,    setAmount]    = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    sheetRef.current?.dismiss();
    setAmount(0);
    onClose();
  }, [onClose]);

  const handleAdd = useCallback(async () => {
    if (!user || amount <= 0) return;
    setIsLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0] ?? new Date().toISOString();
      await addContribution(
        { goalId, amount, note: null, date: today },
        user.id,
      );
      showToast('success', `Added ${formatNGN(amount)} to ${goalName}`);
      setAmount(0);
      handleClose();
      onSuccess?.();
    } catch {
      showToast('error', 'Failed to add savings');
    } finally {
      setIsLoading(false);
    }
  }, [user, amount, goalId, goalName, addContribution, showToast, handleClose, onSuccess]);

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
      enablePanDownToClose
      onDismiss={onClose}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      backgroundComponent={Platform.OS === 'ios' ? GlassSheetBackground : undefined}
      backgroundStyle={Platform.OS !== 'ios' ? { backgroundColor: colors.card } : undefined}
      handleIndicatorStyle={{ backgroundColor: colors.border, width: 36 }}
    >
      <BottomSheetView style={styles.content}>
        {/* Title */}
        <Text
          style={[
            styles.title,
            {
              fontFamily:    font.displayLight,
              fontSize:      fontSize.xl,
              color:         colors.text,
              letterSpacing: -0.4,
            },
          ]}
          numberOfLines={2}
        >
          Add savings to {goalName}
        </Text>

        {/* Amount input */}
        <AmountInput
          value={amount}
          onChange={setAmount}
          label="Amount"
          size="lg"
          style={styles.input}
        />

        {/* Add button */}
        <Button
          label={amount > 0 ? `Add ${formatNGN(amount)} to goal` : 'Add to goal'}
          onPress={handleAdd}
          loading={isLoading}
          disabled={amount <= 0}
          size="lg"
        />
      </BottomSheetView>
    </BottomSheetModal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop:        16,
    paddingBottom:     40,
    flex:              1,
  },
  title: {
    marginBottom: 24,
  },
  input: {
    marginBottom: 20,
  },
});
