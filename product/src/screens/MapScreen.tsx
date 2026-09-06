import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CampaignSave } from '../../engine';
import {
  createStarterMap,
  setCampaignLocation,
  travel,
  whereAmI,
  type WhereAmIResult,
} from '../../engine';
import { theme } from '../theme';

type Props = {
  campaign: CampaignSave;
  /** Persist location changes (app shell writes AsyncStorage). */
  onCampaignChange: (campaign: CampaignSave) => void;
  embedded?: boolean;
  onBack?: () => void;
};

/**
 * Map tab: natural whereAmI, path hierarchy, actionable exits.
 */
export function MapScreen({
  campaign,
  onCampaignChange,
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

  const [status, setStatus] = useState<string | null>(null);

  const go = (exitId: string) => {
    try {
      const nextId = travel(graph, locationId, exitId);
      const next = setCampaignLocation(campaign, nextId);
      onCampaignChange(next);
      setStatus(null);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

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

      {loadError ? (
        <Text style={styles.error}>{loadError}</Text>
      ) : here ? (
        <>
          <View style={styles.card}>
            <Text style={styles.pathLabel}>Path</Text>
            <Text style={styles.path}>{here.path}</Text>
            <Text style={styles.name}>{here.name}</Text>
            <Text style={styles.kind}>{here.kind}</Text>
            <Text style={styles.body}>{here.description}</Text>
            <Text style={styles.line}>You are at {here.name}.</Text>
          </View>

          <Text style={styles.section}>Exits</Text>
          {here.exits.length === 0 ? (
            <Text style={styles.muted}>No clear exits from here.</Text>
          ) : (
            here.exits.map((ex) => (
              <Pressable
                key={ex.id}
                accessibilityRole="button"
                onPress={() => go(ex.id)}
                style={({ pressed }) => [styles.exit, pressed && styles.pressed]}
              >
                <Text style={styles.exitLabel}>{ex.label}</Text>
                <Text style={styles.exitMeta}>→ {ex.toName}</Text>
              </Pressable>
            ))
          )}
        </>
      ) : null}

      {status ? <Text style={styles.error}>{status}</Text> : null}
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
  exit: {
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
