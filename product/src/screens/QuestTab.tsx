import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CampaignSave } from '../../engine';
import { theme } from '../theme';

type Props = {
  campaign: CampaignSave;
};

/**
 * Quest journal placeholder — no deep quest system yet.
 * Friendly empty state until objectives exist on the campaign.
 */
export function QuestTab({ campaign }: Props) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Quests</Text>
      <Text style={styles.subtitle}>{campaign.title}</Text>
      <View style={styles.card}>
        <Text style={styles.emptyTitle}>No active quests yet</Text>
        <Text style={styles.emptyBody}>
          Your journal is quiet for now. Objectives will appear here when the
          adventure gives you something to chase.
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
