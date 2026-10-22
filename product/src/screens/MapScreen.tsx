import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CampaignSave } from '../../engine';
import { selectMapTab } from '../../engine';
import { useCampaignState } from '../campaign';
import { theme } from '../theme';
import { Notes } from './infoTabKit';

type Props = {
  /** Kept for PlayShell API compatibility; the tab reads CampaignState (TABS-01). */
  campaign?: CampaignSave;
  /** Kept for API compatibility; Map never mutates location (MAP-01). */
  onCampaignChange?: (campaign: CampaignSave) => void;
  embedded?: boolean;
  onBack?: () => void;
};

/**
 * Map tab (MAP-01 / TABS-01): info only — where you are (region → town →
 * building → floor → room), what is nearby, places you've been and places
 * you've only heard of. Pure read of CampaignState via selectMapTab.
 * Travel is Story/Tale text → narration + CampaignState location patches — not Map buttons.
 */
export function MapScreen({ embedded = false, onBack }: Props) {
  const { state } = useCampaignState();
  const map = selectMapTab(state);

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

      {!map.hereName ? (
        <Text style={styles.muted}>Your whereabouts aren't on the map yet.</Text>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.pathLabel}>Here</Text>
            {map.chain.map((link, i) => (
              <View key={link.id} style={[styles.chainRow, { paddingLeft: i * 10 }]}>
                <Text style={styles.chainLevel}>{link.level}</Text>
                <Text style={i === map.chain.length - 1 ? styles.chainHere : styles.chainName}>
                  {link.name}
                </Text>
              </View>
            ))}
            {map.description ? <Text style={styles.body}>{map.description}</Text> : null}
          </View>

          <Text style={styles.section}>Nearby</Text>
          {map.exits.length === 0 ? (
            <Text style={styles.muted}>Nothing obvious nearby from here.</Text>
          ) : (
            map.exits.map((ex) => (
              <View key={`${ex.label}-${ex.toName}`} style={styles.nearby}>
                <Text style={styles.exitLabel}>{ex.toName}</Text>
                <Text style={styles.exitMeta}>{ex.label}</Text>
              </View>
            ))
          )}
        </>
      )}

      <Text style={styles.section}>Places you've been ({map.visited.length})</Text>
      {map.visited.length === 0 ? (
        <Text style={styles.muted}>Nowhere yet.</Text>
      ) : (
        map.visited.map((p) => (
          <View key={p.id} style={styles.nearby}>
            <Text style={styles.exitLabel}>
              {p.name}
              {p.here ? '  · you are here' : ''}
            </Text>
            {p.within ? <Text style={styles.exitMeta}>{p.within}</Text> : null}
            <Notes notes={p.notes} />
          </View>
        ))
      )}

      <Text style={styles.section}>Heard of, not yet visited ({map.known.length})</Text>
      {map.known.length === 0 ? (
        <Text style={styles.muted}>No one has told you of anywhere else yet.</Text>
      ) : (
        map.known.map((p) => (
          <View key={p.id} style={styles.nearby}>
            <Text style={styles.exitLabel}>{p.name}</Text>
            {p.within ? <Text style={styles.exitMeta}>{p.within}</Text> : null}
            <Notes notes={p.notes} />
          </View>
        ))
      )}
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
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  muted: {
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.md,
  },
  chainRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.spacing.sm,
    paddingVertical: 2,
  },
  chainLevel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    width: 64,
  },
  chainName: {
    color: theme.colors.text,
    fontSize: 14,
  },
  chainHere: {
    color: theme.colors.accent,
    fontSize: 17,
    fontWeight: '700',
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
