import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

type Props = {
  onOpenSettings: () => void;
};

export function HomeScreen({ onOpenSettings }: Props) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Infinite Adventure</Text>
      <Text style={styles.subtitle}>
        You travel alone unless you form a party. Companions are never added for you.
      </Text>
      <Text style={styles.placeholder}>
        Adventure play UI arrives in later tickets. For now, tune narrator style in Settings.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onOpenSettings}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonLabel}>Settings</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
    justifyContent: 'center',
  },
  title: {
    color: theme.colors.accent,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 22,
    marginBottom: theme.spacing.md,
  },
  placeholder: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: theme.spacing.xl,
  },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonLabel: {
    color: theme.colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
});
