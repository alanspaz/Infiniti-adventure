import React from 'react';
import { TAB_COPY } from '../../engine/narration/lineBanks';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AbilityKey, CampaignSave } from '../../engine';
import { deriveStats, selectCharacterTab, selectGearTab } from '../../engine';
import { useCampaignState } from '../campaign';
import { theme } from '../theme';
import { CombatStatsTab } from './CombatStatsTab';
import { ProgressionSection } from './ProgressionSection';
import { Bar } from './infoTabKit';

/** CHAR-01: stub mana/focus by class flavor — "—" when the class has none. */
function resourceSlotsFor(className: string): { mana: string; focus: string } {
  const c = className.toLowerCase();
  const caster = /mage|wizard|sorcer|warlock|bard|singer|cleric|druid|alchem/.test(
    c,
  );
  const focusUser = /monk|ranger|pathfinder|rogue|psion/.test(c);
  return {
    mana: caster ? '—' : '—',
    focus: focusUser || caster ? '—' : '—',
  };
}


type Props = {
  /** Kept for API compatibility; the sheet reads CampaignState (TABS-01). */
  campaign?: CampaignSave | null;
  onBack?: () => void;
  /** Hide back chrome when inside PlayShell. */
  embedded?: boolean;
};

const ABILITY_LABELS: Record<AbilityKey, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Wisdom',
  charisma: 'Charisma',
};

function formatMod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/**
 * Character tab (TABS-01): a pure read of CampaignState via
 * selectCharacterTab — vitals first, then conditions, the story so far
 * (recorded events only), XP / level-up (ProgressionSection), AC breakdown,
 * gear, abilities, derived stats and combat readiness.
 * Empty-state when the party is empty (empty party is valid).
 */
export function CharacterSheetScreen({ onBack, embedded = false }: Props) {
  const insets = useSafeAreaInsets();
  const { state } = useCampaignState();
  const pc = state.character;
  const tab = selectCharacterTab(state);
  const gear = selectGearTab(state);
  const derived = pc ? deriveStats(pc) : null;

  // UX-01b: character / derived sections clear Android nav (outer pad + scroll pad).
  const bottomClear = Math.max(insets.bottom, 48) + 24;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.root, { paddingBottom: bottomClear }]}
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

      <Text style={styles.title}>Character</Text>
      {!embedded ? (
        <Text style={styles.hint}>
          Identity and derived stats. Companions are never added for you.
        </Text>
      ) : null}

      {!pc || !tab || !derived ? (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>Empty party</Text>
          <Text style={styles.emptyBody}>
            Campaign “{state.title}” has no characters yet. Empty party is
            valid — add a PC when you are ready (solo by default).
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.name}>{tab.name}</Text>
            <Text style={styles.meta}>
              {tab.packName} · {tab.className} · Level {tab.level}
            </Text>
            {(() => {
              const slots = resourceSlotsFor(pc.className);
              return (
                <View style={styles.vitalsRow}>
                  <Text style={styles.vitalPrimary}>
                    HP{' '}
                    <Text style={styles.vitalValue}>
                      {tab.hp}/{tab.maxHp}
                    </Text>
                  </Text>
                  <Text style={styles.vitalSlot}>
                    Mana <Text style={styles.vitalValue}>{slots.mana}</Text>
                  </Text>
                  <Text style={styles.vitalSlot}>
                    Focus <Text style={styles.vitalValue}>{slots.focus}</Text>
                  </Text>
                  <Text style={styles.vitalSlot}>
                    AC <Text style={styles.vitalValue}>{tab.ac.total}</Text>
                  </Text>
                </View>
              );
            })()}
            <Bar pct={tab.maxHp > 0 ? tab.hp / tab.maxHp : 0} />
            <Text style={styles.metaSmall}>
              {tab.conditions.length ? tab.conditions.join(' · ') : TAB_COPY.character.noConditions}
            </Text>
          </View>

          <Text style={styles.section}>{TAB_COPY.character.storyHeading}</Text>
          <View style={styles.card}>
            <Text style={styles.storyLine}>{tab.storySoFar}</Text>
          </View>

          {/* P-INT-03: XP / level-up / ability points (directly under HP header). */}
          {embedded ? <ProgressionSection /> : null}

          <Text style={styles.section}>Armor class</Text>
          <View style={styles.card}>
            <StatRow label={tab.ac.baseLabel} value={String(tab.ac.base)} />
            <StatRow label="Dexterity" value={formatMod(tab.ac.dex)} />
            {tab.ac.shieldLabel ? (
              <StatRow label={tab.ac.shieldLabel} value={formatMod(tab.ac.shield)} />
            ) : null}
            {tab.ac.stance ? <StatRow label="Stance" value={formatMod(tab.ac.stance)} /> : null}
            <StatRow label="Total AC" value={String(tab.ac.total)} />
          </View>

          <Text style={styles.section}>Equipped</Text>
          <View style={styles.card}>
            {gear.slots
              .filter((sl) => sl.slot !== 'shield' || sl.item)
              .map((sl) => (
                <StatRow
                  key={sl.slot}
                  label={sl.label}
                  value={sl.item ? `${sl.item.name}${sl.detail ? ` (${sl.detail})` : ''}` : sl.detail}
                />
              ))}
          </View>

          <Text style={styles.section}>Abilities</Text>
          <View style={styles.card}>
            {tab.abilities.map((a) => (
              <View key={a.key} style={styles.abilityRow}>
                <Text style={styles.abilityLabel}>{ABILITY_LABELS[a.key]}</Text>
                <Text style={styles.abilityScore}>{a.score}</Text>
                <Text style={styles.abilityMod}>{formatMod(a.mod)}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.section}>Derived</Text>
          <View style={styles.card}>
            <StatRow
              label="Proficiency bonus"
              value={formatMod(derived.proficiencyBonus)}
            />
            <StatRow label="Armor class" value={String(tab.ac.total)} />
            <StatRow
              label="Max hit points"
              value={String(derived.maxHitPoints)}
            />
            <StatRow
              label="Initiative"
              value={formatMod(derived.initiativeBonus)}
            />
            <StatRow
              label="Passive perception"
              value={String(derived.passivePerception)}
            />
          </View>

          <Text style={styles.section}>Identity</Text>
          <View style={styles.card}>
            <Text style={styles.metaSmall}>Hit die d{pc.hitDie}</Text>
            {pc.age !== null ? (
              <Text style={styles.meta}>Age: {pc.age}</Text>
            ) : null}
            <Text style={styles.meta}>
              Origin:{' '}
              {pc.originMode === 'memory-loss' ? 'memory loss' : 'backstory'}
            </Text>
            {pc.description ? (
              <Text style={styles.body}>{pc.description}</Text>
            ) : null}
            {pc.sealedBackstorySeed ? (
              <Text style={styles.sealed}>
                Sealed backstory seed on file (not revealed here).
              </Text>
            ) : null}
            <Text style={styles.metaMuted}>Campaign: {state.title}</Text>
          </View>

          {embedded ? <CombatStatsTab asSection /> : null}
        </>
      )}

      {/* Empty party: still show combat slice when embedded. */}
      {embedded && !pc ? <CombatStatsTab asSection /> : null}
    </ScrollView>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  root: {
    padding: theme.spacing.lg,
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
  card: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
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
    lineHeight: 20,
  },
  bannerLabel: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  name: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  metaSmall: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
    marginBottom: 2,
  },
  vitalsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
    marginBottom: 8,
  },
  vitalPrimary: {
    color: theme.colors.textMuted,
    fontSize: 16,
    fontWeight: '600',
  },
  vitalSlot: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  vitalValue: {
    color: theme.colors.accent,
    fontWeight: '700',
  },
  metaMuted: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: theme.spacing.sm,
  },
  body: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
    marginTop: theme.spacing.sm,
  },
  storyLine: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 21,
    fontStyle: 'italic',
  },
  sealed: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: theme.spacing.xs,
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
    fontSize: 15,
  },
  abilityScore: {
    width: 36,
    textAlign: 'right',
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  abilityMod: {
    width: 44,
    textAlign: 'right',
    color: theme.colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  statLabel: {
    color: theme.colors.text,
    fontSize: 15,
  },
  statValue: {
    color: theme.colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
});
