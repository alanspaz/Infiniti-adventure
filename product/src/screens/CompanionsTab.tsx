import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CampaignSave } from '../../engine';
import { theme } from '../theme';

type Props = {
  campaign: CampaignSave;
};

/**
 * Companions panel — empty-party-friendly; never auto-spawns companions.
 * Party[0] is treated as the active PC; anyone after that is a companion.
 */
export function CompanionsTab({ campaign }: Props) {
  const companions = campaign.party.slice(1);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Companions</Text>
      <Text style={styles.hint}>
        Companions are never added for you. You travel alone unless you form a
        party.
      </Text>

      {companions.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>You travel alone</Text>
          <Text style={styles.emptyBody}>
            No companions walk beside you yet. When you invite someone to join,
            they will appear here.
          </Text>
        </View>
      ) : (
        companions.map((c) => (
          <View key={c.id} style={styles.card}>
            <Text style={styles.name}>{c.name}</Text>
            <Text style={styles.meta}>
              {c.className} · Level {c.level}
            </Text>
            {c.description ? (
              <Text style={styles.body}>{c.description}</Text>
            ) : null}
          </View>
        ))
      )}
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
    marginBottom: theme.spacing.sm,
  },
  hint: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: theme.spacing.md,
  },
  card: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
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
  name: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  body: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
    marginTop: theme.spacing.sm,
  },
});
