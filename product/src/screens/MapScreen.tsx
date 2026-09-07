import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CampaignSave } from '../../engine';
import { createStarterMap, whereAmI, type WhereAmIResult } from '../../engine';
import { theme } from '../theme';

type Props = {
  campaign: CampaignSave;
  /** Kept for PlayShell API compatibility; Map no longer mutates location (MAP-01). */
  onCampaignChange?: (campaign: CampaignSave) => void;
  embedded?: boolean;
  onBack?: () => void;
};

/**
 * Map tab (MAP-01): current location + nearby only.
 * Travel is Story/Tale text → narration + CampaignState location patches — not Map buttons.
 */
export function MapScreen({
  campaign,
  embedded = false,
  onBack,
}: Props) {
  const graph = useMemo(() => createStarterMap(), []);
  const locationId = campaign.session.locationId ?? graph.startNodeId;

  let here: WhereAmIResult | null = null;
  let loadError: string | null = null;
  try {
    here = whereAmI(graph, locationId);
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
    >
      {!embedded && onBack ? (
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
      ) : null}

      <Text style={styles.title}>Map</Text>
      <Text style={styles.hint}>
        You see where you are and what is nearby. To travel, write it in the Tale
        — the narrator and campaign state move you.
      </Text>

      {loadError ? (
        <Text style={styles.error}>{loadError}</Text>
      ) : here ? (
        <>
          <View style={styles.card}>
            <Text style={styles.pathLabel}>Here</Text>
            <Text style={styles.path}>{here.path}</Text>
            <Text style={styles.name}>{here.name}</Text>
            <Text style={styles.kind}>{here.kind}</Text>
            <Text style={styles.body}>{here.description}</Text>
            <Text style={styles.line}>You are at {here.name}.</Text>
          </View>

          <Text style={styles.section}>Nearby</Text>
          {here.exits.length === 0 ? (
            <Text style={styles.muted}>Nothing obvious nearby from here.</Text>
          ) : (
            here.exits.map((ex) => (
              <View key={ex.id} style={styles.nearby}>
                <Text style={styles.exitLabel}>{ex.toName}</Text>
                <Text style={styles.exitMeta}>{ex.label}</Text>
              </View>
            ))
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  root: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  back: {
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  backLabel: {
    color: theme.colors.accent,
    fontSize: 16,
    fontWeight: '600',
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
    marginBottom: theme.spacing.lg,
  },
  pathLabel: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  path: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginBottom: theme.spacing.sm,
  },
  name: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  kind: {
    color: theme.colors.accent,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: theme.spacing.sm,
  },
  body: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: theme.spacing.sm,
  },
  line: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
  },
  section: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: theme.spacing.sm,
  },
  muted: {
    color: theme.colors.textMuted,
  },
  nearby: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  exitLabel: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  exitMeta: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  error: {
    color: theme.colors.danger,
    marginTop: theme.spacing.md,
  },
  pressed: {
    opacity: 0.85,
  },
});
