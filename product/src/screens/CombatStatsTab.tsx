import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CampaignSave } from '../../engine';
import { ABILITY_KEYS, deriveStats } from '../../engine';
import { theme } from '../theme';

type Props = {
  campaign: CampaignSave;
};

function formatMod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/**
 * Layout-only combat / stats panel (Base44). Uses engine derived stats.
 * No combat system yet — read-only snapshot of the active PC.
 */
export function CombatStatsTab({ campaign }: Props) {
  const pc = campaign.party.length > 0 ? campaign.party[0]! : null;
  const derived = useMemo(() => (pc ? deriveStats(pc) : null), [pc]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Combat</Text>
      <Text style={styles.hint}>
        Readiness at a glance. Full rules live in the engine — nothing invented here.
      </Text>

      {!pc || !derived ? (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>No champion yet</Text>
          <Text style={styles.emptyBody}>
            Create a character to see armor, hit points, and checks here.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.name}>{pc.name}</Text>
            <Text style={styles.meta}>
              {pc.className} · Level {pc.level}
            </Text>
          </View>
          <View style={styles.statRow}>
            <Stat label="Armor" value={String(derived.armorClass)} />
            <Stat label="Max HP" value={String(derived.maxHitPoints)} />
            <Stat label="Init" value={formatMod(derived.initiativeBonus)} />
            <Stat label="Prof" value={formatMod(derived.proficiencyBonus)} />
          </View>
          <Text style={styles.section}>Abilities</Text>
          <View style={styles.card}>
            {ABILITY_KEYS.map((key) => (
              <View key={key} style={styles.abilityRow}>
                <Text style={styles.abilityLabel}>
                  {key.slice(0, 3).toUpperCase()}
                </Text>
                <Text style={styles.abilityScore}>{pc.abilities[key]}</Text>
                <Text style={styles.abilityMod}>
                  {formatMod(derived.modifiers[key])}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
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
    marginBottom: theme.spacing.md,
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
    fontSize: 18,
    fontWeight: '700',
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  stat: {
    flexGrow: 1,
    minWidth: 70,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: 10,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
  },
  statValue: {
    color: theme.colors.accent,
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  section: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: theme.spacing.sm,
  },
  abilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  abilityLabel: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  abilityScore: {
    width: 36,
    textAlign: 'right',
    color: theme.colors.text,
    fontSize: 15,
  },
  abilityMod: {
    width: 44,
    textAlign: 'right',
    color: theme.colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
});
