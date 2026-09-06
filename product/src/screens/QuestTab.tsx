import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCampaignState } from '../campaign';
import { theme } from '../theme';

/**
 * Quest journal — reads CampaignState.quests ONLY.
 * Must never crash on open (Base44 anti-pattern: blank/crash with “active” quests).
 * Empty list is valid.
 */
export function QuestTab() {
  const { state } = useCampaignState();
  let quests = state.quests;
  try {
    if (!Array.isArray(quests)) quests = [];
  } catch {
    quests = [];
  }

  const active = quests.filter((q) => q && q.status === 'active');
  const other = quests.filter((q) => q && q.status !== 'active');

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.subtitle}>{state.title}</Text>

      {quests.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>No active quests yet</Text>
          <Text style={styles.emptyBody}>
            Your journal is quiet for now. Objectives will appear here when the
            adventure gives you something to chase.
          </Text>
        </View>
      ) : (
        <>
          {active.length > 0 ? (
            <Text style={styles.section}>
              Active ({active.length})
            </Text>
          ) : null}
          {active.map((q) => (
            <View key={q.id || q.title} style={styles.card}>
              <Text style={styles.questTitle}>{q.title || 'Quest'}</Text>
              <Text style={styles.badge}>Active</Text>
              {q.summary ? (
                <Text style={styles.body}>{q.summary}</Text>
              ) : null}
            </View>
          ))}
          {other.length > 0 ? (
            <Text style={styles.section}>Other</Text>
          ) : null}
          {other.map((q) => (
            <View key={q.id || q.title} style={styles.card}>
              <Text style={styles.questTitle}>{q.title || 'Quest'}</Text>
              <Text style={styles.badgeMuted}>{q.status}</Text>
              {q.summary ? (
                <Text style={styles.body}>{q.summary}</Text>
              ) : null}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: theme.colors.surface },
  root: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginBottom: theme.spacing.md,
  },
  section: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: theme.spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: theme.spacing.lg,
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
  questTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  badge: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  badgeMuted: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  body: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: theme.spacing.sm,
  },
});
