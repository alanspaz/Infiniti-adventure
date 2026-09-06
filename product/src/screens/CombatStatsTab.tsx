import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ABILITY_KEYS, deriveStats } from '../../engine';
import { useCampaignState } from '../campaign';
import { theme } from '../theme';

function formatMod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/**
 * Combat / stats panel — views of CampaignState.combat + character.
 * HP matches CombatRail (same slice).
 */
export function CombatStatsTab() {
  const { state } = useCampaignState();
  const pc = state.character;
  const derived = useMemo(() => (pc ? deriveStats(pc) : null), [pc]);
  const hp = state.combat.hp;
  const maxHp = state.combat.maxHp ?? derived?.maxHitPoints ?? null;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.hint}>
        Readiness at a glance. Actions on the combat rail write this same slice.
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
            {state.combat.lastAction ? (
              <Text style={styles.last}>Stance: {state.combat.lastAction}</Text>
            ) : null}
          </View>
          <View style={styles.statRow}>
            <Stat
              label="HP"
              value={
                hp == null || maxHp == null ? '—' : `${hp}/${maxHp}`
              }
            />
            <Stat label="Armor" value={String(derived.armorClass)} />
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
  scroll: { flex: 1, backgroundColor: theme.colors.surface },
  root: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
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
    backgroundColor: theme.colors.background,
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
  last: {
    color: theme.colors.accent,
    fontSize: 12,
    marginTop: 6,
    fontWeight: '600',
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
    backgroundColor: theme.colors.background,
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
