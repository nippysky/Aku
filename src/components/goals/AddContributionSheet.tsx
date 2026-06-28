import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SheetModal } from '../ui/SheetModal';
import { AmountInput } from '../ui/AmountInput';
import { Button } from '../ui/Button';
import { useGoalsStore } from '../../store/goals.store';
import { useAuthStore } from '../../store/auth.store';
import { useUIStore } from '../../store/ui.store';
import { useTheme } from '../../theme';
import { useCurrencyFormat } from '../../hooks/useCurrencyFormat';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AddContributionSheetProps {
  goalId:    string;
  goalName:  string;
  isOpen:    boolean;
  onClose:   () => void;
  onSuccess?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddContributionSheet({
  goalId,
  goalName,
  isOpen,
  onClose,
  onSuccess,
}: AddContributionSheetProps) {
  const { colors, text, font, fontSize } = useTheme();
  const { fmt } = useCurrencyFormat();

  const { addContribution } = useGoalsStore();
  const { user }            = useAuthStore();
  const { showToast }       = useUIStore();

  const [amount,    setAmount]    = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const handleClose = useCallback(() => {
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
      showToast('success', `Added ${fmt(amount)} to ${goalName}`);
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
    <SheetModal visible={isOpen} onClose={handleClose}>
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
        label={amount > 0 ? `Add ${fmt(amount)} to goal` : 'Add to goal'}
        onPress={handleAdd}
        loading={isLoading}
        disabled={amount <= 0}
        size="lg"
      />
    </SheetModal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  title: {
    marginBottom: 24,
  },
  input: {
    marginBottom: 20,
  },
});
