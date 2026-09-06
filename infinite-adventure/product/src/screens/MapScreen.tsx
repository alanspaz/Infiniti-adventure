import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
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
  onBack: () => void;
  /** Persist location changes (app shell writes AsyncStorage). */
  onCampaignChange: (campaign: CampaignSave) => void;
};

/**
 * Thin map / whereAmI screen: on-device path, description, exits.
 * Not a full overworld UI.
 */
export function MapScreen({ campaign, onBack, onCampaignChange }: Props) {
  const graph = useMemo(() => createStarterMap(), []);
  const locationId =
    campaign.session.locationId ?? graph.startNodeId;

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
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
      >
        <Text style={styles.backLabel}>Back</Text>
      </Pressable>

      <Text style={styles.title}>Where am I</Text>
      <Text style={styles.hint}>
        On-device map path and exits. Narrator coloring comes later when online.
      </Text>

      {loadError ? (
        <Text style={styles.error}>{loadError}</Text>
      ) : here ? (
        <>
          <Text style={styles.path}>{here.path}</Text>
          <Text style={styles.name}>{here.name}</Text>
          <Text style={styles.kind}>{here.kind}</Text>
          <Text style={styles.body}>{here.description}</Text>
          <Text style={styles.line}>{here.line}</Text>

          <Text style={styles.section}>Exits</Text>
          {here.exits.length === 0 ? (
            <Text style={styles.muted}>None</Text>
          ) : (
            here.exits.map((ex) => (
              <Pressable
                key={ex.id}
                accessibilityRole="button"
                onPress={() => go(ex.id)}
                style={({ pressed }) => [
                  styles.exit,
                  pressed && styles.pressed,
                ]}
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
    fontSize: 24,
    fontWeight: '700',
    marginBottom: theme.spacing.sm,
  },
  hint: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: theme.spacing.md,
  },
  path: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginBottom: theme.spacing.xs,
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
    lineHeight: 18,
    marginBottom: theme.spacing.lg,
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
    borderRadius: 8,
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
