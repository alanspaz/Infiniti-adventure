import React, { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { deriveStats, type CombatMode } from '../../engine';
import { useCampaignState } from '../campaign';
import { appImages } from '../images';
import { theme } from '../theme';

const ACTIONS: {
  mode: Exclude<CombatMode, 'idle'>;
  label: string;
  icon: keyof typeof appImages;
}[] = [
  { mode: 'attack', label: 'Attack', icon: 'combatAttack' },
  { mode: 'defend', label: 'Defend', icon: 'combatDefend' },
  { mode: 'dodge', label: 'Dodge', icon: 'combatDodge' },
  { mode: 'cast', label: 'Cast', icon: 'combatCast' },
  { mode: 'use-item', label: 'Use Item', icon: 'combatUseItem' },
];

/**
 * Base44-style combat rail: HP readout + action chips.
 * Layout-only resolution stubs — writes combat slice of CampaignState.
 */
export function CombatRail() {
  const { state, runCombatAction } = useCampaignState();
  const derived = useMemo(
    () => (state.character ? deriveStats(state.character) : null),
    [state.character],
  );

  const hp = state.combat.hp;
  const maxHp = state.combat.maxHp ?? derived?.maxHitPoints ?? null;
  const ac = derived?.armorClass ?? null;
  const active = state.combat.mode;

  return (
    <View style={styles.rail} accessibilityRole="summary">
      <View style={styles.readout}>
        <Text style={styles.readoutKicker}>Combat</Text>
        <Text style={styles.hpLine}>
          HP{' '}
          <Text style={styles.hpValue}>
            {hp == null || maxHp == null ? '—' : `${hp}/${maxHp}`}
          </Text>
          {ac != null ? (
            <Text style={styles.ac}> · AC {ac}</Text>
          ) : null}
        </Text>
        {state.combat.lastAction ? (
          <Text style={styles.last} numberOfLines={1}>
            Last: {state.combat.lastAction}
          </Text>
        ) : (
          <Text style={styles.lastMuted}>Ready</Text>
        )}
      </View>
      <View style={styles.chips}>
        {ACTIONS.map((a) => {
          const selected = active === a.mode;
          return (
            <Pressable
              key={a.mode}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              accessibilityState={{ selected }}
              onPress={() => runCombatAction(a.mode)}
              style={({ pressed }) => [
                styles.chip,
                selected && styles.chipActive,
                pressed && styles.chipPressed,
              ]}
            >
              <Image
                source={appImages[a.icon]}
                style={[styles.icon, selected && styles.iconActive]}
                resizeMode="contain"
              />
              <Text
                style={[styles.chipLabel, selected && styles.chipLabelActive]}
                numberOfLines={1}
              >
                {a.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  readout: {
    paddingHorizontal: theme.spacing.xs,
  },
  readoutKicker: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  hpLine: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  hpValue: {
    color: theme.colors.text,
    fontWeight: '700',
  },
  ac: {
    color: theme.colors.textMuted,
  },
  last: {
    color: theme.colors.accent,
    fontSize: 12,
    marginTop: 2,
  },
  lastMuted: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexGrow: 1,
    minWidth: 56,
    maxWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.background,
    opacity: 0.92,
  },
  chipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
    opacity: 1,
  },
  chipPressed: {
    opacity: 0.85,
  },
  icon: {
    width: 28,
    height: 28,
    marginBottom: 4,
    // gold line-art on dark; invert feel when filled
    tintColor: undefined,
  },
  iconActive: {
    // pressed: accent fill + dark glyph feel via opacity on gold art
    opacity: 0.95,
  },
  chipLabel: {
    color: theme.colors.accent,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  chipLabelActive: {
    color: theme.colors.background,
  },
});
