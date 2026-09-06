import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CampaignSave } from '../../engine';
import { theme } from '../theme';

type Props = {
  campaign: CampaignSave;
};

/** Inventory placeholder — no deep item system yet. */
export function ItemsTab({ campaign }: Props) {
  const pcName =
    campaign.party.length > 0 ? campaign.party[0]!.name : 'your pack';

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Items</Text>
      <Text style={styles.subtitle}>Belongings of {pcName}</Text>
      <View style={styles.card}>
        <Text style={styles.emptyTitle}>Pack is empty</Text>
        <Text style={styles.emptyBody}>
          Nothing rattles in your satchel yet. Gear and finds will show up here
          when the adventure hands them to you.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: theme.colors.background },
  root: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  title: {
    color: theme.colors.accent,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginBottom: theme.spacing.md,
  },
  card: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: theme.spacing.lg,
  },
  emptyTitle: {
    color: theme.colors.accent,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: theme.spacing.xs,
  },
  emptyBody: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
});
