import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {
  AbilityKey,
  AdvantageMode,
  CampaignSave,
  CharacterSheet,
  CheckResult,
  DieSides,
  NotationRollResult,
} from '../../engine';
import {
  ABILITY_KEYS,
  SUPPORTED_SIDES,
  checkModifier,
  deriveStats,
  resolveCheck,
  rollNotation,
} from '../../engine';
import { theme } from '../theme';

type Props = {
  /** Optional campaign for ability checks (uses first party PC). */
  campaign: CampaignSave | null;
  onBack: () => void;
};

const ABILITY_LABELS: Record<AbilityKey, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Wisdom',
  charisma: 'Charisma',
};

const QUICK_SIDES: DieSides[] = [4, 6, 8, 10, 12, 20, 100];

function formatMod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/**
 * Dice screen: NdM rolls + ability checks via engine dice + character modifiers.
 * Plain rolls work without a campaign; checks need an active PC.
 */
export function DiceScreen({ campaign, onBack }: Props) {
  const pc: CharacterSheet | null =
    campaign && campaign.party.length > 0 ? campaign.party[0]! : null;

  const derived = useMemo(() => (pc ? deriveStats(pc) : null), [pc]);

  const [notation, setNotation] = useState('1d20');
  const [lastRoll, setLastRoll] = useState<NotationRollResult | null>(null);
  const [rollError, setRollError] = useState<string | null>(null);

  const [ability, setAbility] = useState<AbilityKey>('strength');
  const [dcText, setDcText] = useState('15');
  const [proficient, setProficient] = useState(false);
  const [mode, setMode] = useState<AdvantageMode>('normal');
  const [lastCheck, setLastCheck] = useState<CheckResult | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  const doNotation = (expr: string) => {
    try {
      setRollError(null);
      const result = rollNotation(expr);
      setLastRoll(result);
      setNotation(result.notation);
    } catch (err) {
      setLastRoll(null);
      setRollError(err instanceof Error ? err.message : String(err));
    }
  };

  const doCheck = () => {
    if (!pc || !derived) {
      setCheckError('No character — create a campaign PC first.');
      setLastCheck(null);
      return;
    }
    try {
      setCheckError(null);
      const dc = Math.floor(Number(dcText));
      if (!Number.isFinite(dc)) {
        throw new Error('DC must be a number');
      }
      const modifier = checkModifier(
        pc.abilities,
        ability,
        proficient,
        derived.proficiencyBonus,
      );
      const result = resolveCheck(modifier, dc, { mode });
      setLastCheck(result);
    } catch (err) {
      setLastCheck(null);
      setCheckError(err instanceof Error ? err.message : String(err));
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

      <Text style={styles.title}>Dice</Text>
      <Text style={styles.hint}>
        On-device rolls using the engine. Ability checks add your PC modifiers —
        no invented math outside the engine.
      </Text>

      <Text style={styles.section}>Roll NdM</Text>
      <View style={styles.quickRow}>
        {QUICK_SIDES.map((sides) => (
          <Pressable
            key={sides}
            accessibilityRole="button"
            onPress={() => doNotation(`1d${sides}`)}
            style={({ pressed }) => [
              styles.chip,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.chipLabel}>d{sides}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.row}>
        <TextInput
          value={notation}
          onChangeText={setNotation}
          placeholder="2d6+3"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => doNotation(notation)}
          style={({ pressed }) => [
            styles.primary,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.primaryLabel}>Roll</Text>
        </Pressable>
      </View>
      <Text style={styles.metaMuted}>
        Supported sides: {SUPPORTED_SIDES.join(', ')}
      </Text>

      {rollError ? <Text style={styles.error}>{rollError}</Text> : null}
      {lastRoll ? (
        <View style={styles.card}>
          <Text style={styles.resultTitle}>{lastRoll.notation}</Text>
          <Text style={styles.resultLine}>
            Faces: [{lastRoll.faces.join(', ')}]
            {lastRoll.modifier !== 0
              ? ` · mod ${formatMod(lastRoll.modifier)}`
              : ''}
          </Text>
          <Text style={styles.resultTotal}>Total {lastRoll.total}</Text>
        </View>
      ) : null}

      <Text style={styles.section}>Ability check</Text>
      {!pc ? (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>No character for checks</Text>
          <Text style={styles.emptyBody}>
            {campaign
              ? 'This campaign has an empty party. Plain dice still work above.'
              : 'No active campaign. Start one from Home to use ability checks.'}
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.meta}>
            Using {pc.name} ({pc.className}
            {derived
              ? ` · prof ${formatMod(derived.proficiencyBonus)}`
              : ''}
            )
          </Text>
          <View style={styles.quickRow}>
            {ABILITY_KEYS.map((key) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                onPress={() => setAbility(key)}
                style={({ pressed }) => [
                  styles.chip,
                  ability === key && styles.chipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    ability === key && styles.chipLabelActive,
                  ]}
                >
                  {ABILITY_LABELS[key].slice(0, 3)}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.row}>
            <Text style={styles.fieldLabel}>DC</Text>
            <TextInput
              value={dcText}
              onChangeText={setDcText}
              keyboardType="number-pad"
              style={[styles.input, styles.dcInput]}
            />
          </View>

          <View style={styles.quickRow}>
            {(
              [
                ['normal', 'Normal'],
                ['advantage', 'Advantage'],
                ['disadvantage', 'Disadv.'],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                onPress={() => setMode(value)}
                style={({ pressed }) => [
                  styles.chip,
                  mode === value && styles.chipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    mode === value && styles.chipLabelActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => setProficient((p) => !p)}
              style={({ pressed }) => [
                styles.chip,
                proficient && styles.chipActive,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  proficient && styles.chipLabelActive,
                ]}
              >
                {proficient ? 'Proficient' : 'Not prof.'}
              </Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={doCheck}
            style={({ pressed }) => [
              styles.primaryWide,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.primaryLabel}>
              Roll {ABILITY_LABELS[ability]} check
            </Text>
          </Pressable>

          {checkError ? <Text style={styles.error}>{checkError}</Text> : null}
          {lastCheck ? (
            <View style={styles.card}>
              <Text style={styles.resultTitle}>
                {ABILITY_LABELS[ability]} vs DC {lastCheck.dc}
              </Text>
              <Text style={styles.resultLine}>
                d20 [{lastCheck.d20Faces.join(', ')}] → {lastCheck.d20}{' '}
                {formatMod(lastCheck.modifier)} = {lastCheck.total}
                {lastCheck.mode !== 'normal' ? ` (${lastCheck.mode})` : ''}
              </Text>
              <Text
                style={[
                  styles.resultTotal,
                  lastCheck.success ? styles.success : styles.fail,
                ]}
              >
                {lastCheck.success ? 'Success' : 'Failure'}
                {lastCheck.natural20 ? ' · natural 20' : ''}
                {lastCheck.natural1 ? ' · natural 1' : ''}
              </Text>
            </View>
          ) : null}
        </>
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
  section: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '700',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: theme.spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  chipActive: {
    borderColor: theme.colors.accent,
    backgroundColor: '#2a2118',
  },
  chipLabel: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  chipLabelActive: {
    color: theme.colors.accent,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: theme.spacing.sm,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    color: theme.colors.text,
    fontSize: 16,
  },
  dcInput: {
    flex: 0,
    width: 72,
  },
  fieldLabel: {
    color: theme.colors.textMuted,
    fontSize: 14,
    marginRight: 4,
  },
  primary: {
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  primaryWide: {
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  primaryLabel: {
    color: theme.colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginBottom: theme.spacing.sm,
  },
  metaMuted: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginBottom: theme.spacing.sm,
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
  resultTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  resultLine: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  resultTotal: {
    color: theme.colors.accent,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 6,
  },
  success: {
    color: theme.colors.accent,
  },
  fail: {
    color: theme.colors.danger,
  },
  error: {
    color: theme.colors.danger,
    marginBottom: theme.spacing.sm,
  },
  pressed: {
    opacity: 0.85,
  },
});
