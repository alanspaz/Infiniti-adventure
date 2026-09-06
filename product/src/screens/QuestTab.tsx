import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { partitionQuests } from '../../engine';
import { useCampaignState } from '../campaign';
import { theme } from '../theme';

/**
 * Quest journal — reads CampaignState.quests ONLY (Q-01).
 * Must never crash on open (Base44 anti-pattern). Empty list is valid.
 * Shows active + done (failed listed separately when present).
 */
export function QuestTab() {
  const { state } = useCampaignState();
  const { active, done, failed } = partitionQuests(state.quests);
  const total = active.length + done.length + failed.length;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.subtitle}>{state.title}</Text>

      {total === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>No quests yet</Text>
          <Text style={styles.emptyBody}>
            Your journal is quiet for now. Objectives will appear here when the
            adventure gives you something to chase.
          </Text>
        </View>
      ) : (
        <>
          {active.length > 0 ? (
            <Text style={styles.section}>Active ({active.length})</Text>
          ) : null}
          {active.map((q) => (
            <View key={q.id || q.title} style={styles.card}>
              <Text style={styles.questTitle}>{q.title || 'Quest'}</Text>
              <Text style={styles.badge}>Active</Text>
              {q.summary ? <Text style={styles.body}>{q.summary}</Text> : null}
              {q.progressNotes ? (
                <Text style={styles.notes}>Progress: {q.progressNotes}</Text>
              ) : null}
            </View>
          ))}

          {done.length > 0 ? (
            <Text style={styles.section}>Done ({done.length})</Text>
          ) : null}
          {done.map((q) => (
            <View key={q.id || q.title} style={styles.card}>
              <Text style={styles.questTitle}>{q.title || 'Quest'}</Text>
              <Text style={styles.badgeMuted}>Done</Text>
              {q.summary ? <Text style={styles.body}>{q.summary}</Text> : null}
              {q.progressNotes ? (
                <Text style={styles.notes}>Progress: {q.progressNotes}</Text>
              ) : null}
            </View>
          ))}

          {failed.length > 0 ? (
            <Text style={styles.section}>Failed ({failed.length})</Text>
          ) : null}
          {failed.map((q) => (
            <View key={q.id || q.title} style={styles.card}>
              <Text style={styles.questTitle}>{q.title || 'Quest'}</Text>
              <Text style={styles.badgeMuted}>Failed</Text>
              {q.summary ? <Text style={styles.body}>{q.summary}</Text> : null}
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
  notes: {
    color: theme.colors.text,
    fontSize: 13,
    lineHeight: 18,
    marginTop: theme.spacing.xs,
  },
});
