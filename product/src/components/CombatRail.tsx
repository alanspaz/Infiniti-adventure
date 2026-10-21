import React, { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  armorClassWithGear,
  deriveStats,
  isSpellcasterClass,
  type CombatActionKind,
} from '../../engine';
import { useCampaignState } from '../campaign';
import { appImages } from '../images';
import { theme } from '../theme';

/** Rail actions. Flee (QA-02) has no art yet — a gold glyph stands in. */
export const COMBAT_RAIL_ACTIONS: {
  mode: CombatActionKind;
  label: string;
  icon?: keyof typeof appImages;
  glyph?: string;
}[] = [
  { mode: 'attack', label: 'Attack', icon: 'combatAttack' },
  { mode: 'defend', label: 'Defend', icon: 'combatDefend' },
  { mode: 'dodge', label: 'Dodge', icon: 'combatDodge' },
  { mode: 'cast', label: 'Cast', icon: 'combatCast' },
  { mode: 'use-item', label: 'Use Item', icon: 'combatUseItem' },
  { mode: 'flee', label: 'Flee', glyph: '↩' },
];

/**
 * Base44-style combat rail: HP readout + action chips.
 * Layout-only resolution stubs — writes combat slice of CampaignState.
 */
type CombatRailProps = {
  /** UX-01: Android/iOS system nav inset so rail is never covered. */
  bottomInset?: number;
};

export function CombatRail({ bottomInset = 0 }: CombatRailProps) {
  const { state, runCombatAction } = useCampaignState();
  const derived = useMemo(
    () => (state.character ? deriveStats(state.character) : null),
    [state.character],
  );

  // COMBAT-01: whole rail hidden until combat.active (inCombat).
  if (!state.combat.inCombat) {
    return null;
  }

  const hp = state.combat.hp;
  const maxHp = state.combat.maxHp ?? derived?.maxHitPoints ?? null;
  const baseAc = state.character
    ? armorClassWithGear(state.character.abilities.dexterity, state.inventory)
    : (derived?.armorClass ?? null);
  const tempAc = state.combat.tempAcBonus ?? 0;
  const ac = baseAc == null ? null : baseAc + tempAc;
  const active = state.combat.mode;
  // QA-02: non-casters keep Cast, relabelled so the weak spark isn't a surprise.
  const caster = state.character ? isSpellcasterClass(state.character.className) : true;

  return (
    <View
      style={[styles.rail, bottomInset > 0 ? { paddingBottom: bottomInset } : null]}
      accessibilityRole="summary"
    >
      <View style={styles.readout}>
        <Text style={styles.readoutKicker}>Combat</Text>
        <Text style={styles.hpLine}>
          HP{' '}
          <Text style={styles.hpValue}>
            {hp == null || maxHp == null ? '—' : `${hp}/${maxHp}`}
          </Text>
          {ac != null ? (
            <Text style={styles.ac}>
              {' '}
              · AC {ac}
              {tempAc > 0 ? ` (+${tempAc} guard)` : ''}
              {state.combat.stance === 'dodge' ? ' (dodging)' : ''}
            </Text>
          ) : null}
        </Text>
        {state.combat.foe ? (
          <Text style={styles.foeLine} numberOfLines={1}>
            {state.combat.foe.name}{' '}
            <Text style={styles.hpValue}>
              {state.combat.foe.hp}/{state.combat.foe.maxHp}
            </Text>
            <Text style={styles.ac}> · AC {state.combat.foe.ac}</Text>
          </Text>
        ) : null}
        {state.combat.lastAction ? (
          <Text style={styles.last} numberOfLines={1}>
            Last: {state.combat.lastAction}
          </Text>
        ) : (
          <Text style={styles.lastMuted}>Ready</Text>
        )}
      </View>
      <View style={styles.chips}>
        {COMBAT_RAIL_ACTIONS.map((a) => {
          const selected = active === a.mode;
          const label = a.mode === 'cast' && !caster ? 'Spark' : a.label;
          return (
            <Pressable
              key={a.mode}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityHint={
                a.mode === 'cast' && !caster
                  ? "You're no spellcaster: a feeble spark (best of INT/WIS/CHA to hit)."
                  : a.mode === 'flee'
                    ? 'DEX check vs DC 10 to escape; if it fails, the foe attacks.'
                    : undefined
              }
              accessibilityState={{ selected }}
              onPress={() => runCombatAction(a.mode)}
              style={({ pressed }) => [
                styles.chip,
                selected && styles.chipActive,
                pressed && styles.chipPressed,
              ]}
            >
              {a.icon ? (
                <Image
                  source={appImages[a.icon]}
                  style={[styles.icon, selected && styles.iconActive]}
                  resizeMode="contain"
                />
              ) : (
                <Text style={[styles.glyph, selected && styles.chipLabelActive]}>{a.glyph}</Text>
              )}
              <Text
                style={[styles.chipLabel, selected && styles.chipLabelActive]}
                numberOfLines={1}
              >
                {label}
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
  foeLine: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 1,
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
  // QA-02: six actions (incl. Flee) on one row on small phones.
  chips: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 6,
  },
  chip: {
    flex: 1,
    minWidth: 0,
    maxWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 2,
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
  glyph: {
    width: 28,
    height: 28,
    marginBottom: 4,
    color: theme.colors.accent,
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
    fontWeight: '700',
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
    letterSpacing: 0,
    textAlign: 'center',
  },
  chipLabelActive: {
    color: theme.colors.background,
  },
});
