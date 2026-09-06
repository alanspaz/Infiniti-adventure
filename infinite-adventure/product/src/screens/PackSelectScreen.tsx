import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { listPlaystylePacks, type PlaystylePack } from '../../engine';
import { theme } from '../theme';

type Props = {
  onBack: () => void;
  onSelectPack: (packId: string) => void;
};

export function PackSelectScreen({ onBack, onSelectPack }: Props) {
  const packs: PlaystylePack[] = listPlaystylePacks();

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
      >
        <Text style={styles.backLabel}>Back</Text>
      </Pressable>

      <Text style={styles.title}>Choose playstyle</Text>
      <Text style={styles.subtitle}>
        Pick a pack before identity. Class lists come from the pack. Companions
        are never added for you.
      </Text>

      <ScrollView contentContainerStyle={styles.list}>
        {packs.map((pack) => (
          <Pressable
            key={pack.id}
            accessibilityRole="button"
            onPress={() => onSelectPack(pack.id)}
            style={({ pressed }) => [
              styles.card,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.cardTitle}>{pack.displayName}</Text>
            <Text style={styles.cardMeta}>
              {pack.resources.crunch} crunch
              {pack.resources.trackSupplies ? ' · supplies' : ''}
              {pack.resources.heroicInspiration ? ' · inspiration' : ''}
              {pack.resources.trackWounds ? ' · wounds' : ''}
            </Text>
            <Text style={styles.cardBody}>{pack.description}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
  },
  back: {
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  backLabel: {
    color: theme.colors.accent,
    fontSize: 16,
  },
  title: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: theme.spacing.lg,
  },
  list: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  card: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    padding: theme.spacing.md,
  },
  cardTitle: {
    color: theme.colors.accent,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginBottom: theme.spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardBody: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.85,
  },
});
