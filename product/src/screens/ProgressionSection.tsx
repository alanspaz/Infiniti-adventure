import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ABILITY_KEYS,
  ABILITY_SCORE_CAP,
  QUEST_COMPLETE_XP,
  progressionSummary,
  type AbilityKey,
} from '../../engine';
import { useCampaignState } from '../campaign';
import { theme } from '../theme';

const SHORT: Record<AbilityKey, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
};

/**
 * P-INT-03: XP / level-up / ability point spend on the merged Character tab.
 * Reads CampaignState; every change goes through runProgressionAction.
 */
export function ProgressionSection() {
  const { state, runProgressionAction } = useCampaignState();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const pc = state.character;
  if (!pc) return null;
  const sum = progressionSummary(state);
  const inCombat = state.combat.inCombat;

  const span =
    sum.nextLevelXp === null ? 1 : Math.max(1, sum.nextLevelXp - sum.currentLevelXp);
  const into = sum.nextLevelXp === null ? 1 : Math.min(span, sum.xp - sum.currentLevelXp);
  const pct = Math.max(0, Math.min(1, into / span));

  const levelUp = () => {
    const r = runProgressionAction({ kind: 'level-up' });
    setFeedback({ ok: r.ok, text: r.message });
  };
  const spend = (ability: AbilityKey) => {
    const r = runProgressionAction({ kind: 'spend-point', ability });
    setFeedback({ ok: r.ok, text: r.message });
  };

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.label}>Level {sum.level}</Text>
        <Text style={styles.xp}>
          XP {sum.xp}
          {sum.nextLevelXp !== null ? ` / ${sum.nextLevelXp}` : ' (max level)'}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%` }]} />
      </View>

      {sum.canLevelUp ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: inCombat }}
          disabled={inCombat}
          onPress={levelUp}
          style={({ pressed }) => [
            styles.levelBtn,
            inCombat && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.levelBtnLabel}>
            Level up → {sum.level + 1}
          </Text>
        </Pressable>
      ) : sum.nextLevelXp !== null ? (
        <Text style={styles.hint}>
          {sum.nextLevelXp - sum.xp} XP to level {sum.level + 1}. Earn XP by
          winning fights and finishing quests (First steps: {QUEST_COMPLETE_XP} XP).
        </Text>
      ) : null}

      {sum.unspentPoints > 0 ? (
        <>
          <Text style={styles.points}>
            {sum.unspentPoints} ability point{sum.unspentPoints === 1 ? '' : 's'} to
            spend
          </Text>
          <View style={styles.spendRow}>
            {ABILITY_KEYS.map((k) => {
              const capped = pc.abilities[k] >= ABILITY_SCORE_CAP;
              const off = capped || inCombat;
              return (
                <Pressable
                  key={k}
                  accessibilityRole="button"
                  accessibilityLabel={`Spend a point on ${k}`}
                  accessibilityState={{ disabled: off }}
                  onPress={() => spend(k)}
                  style={({ pressed }) => [
                    styles.spendBtn,
                    off && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.spendLabel}>+{SHORT[k]}</Text>
                  <Text style={styles.spendScore}>{pc.abilities[k]}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {inCombat && (sum.canLevelUp || sum.unspentPoints > 0) ? (
        <Text style={styles.hint}>Upgrades wait until the fight is over.</Text>
      ) : null}

      {feedback ? (
        <Text style={[styles.feedback, !feedback.ok && styles.feedbackMuted]}>
          {feedback.text}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  label: { color: theme.colors.accent, fontSize: 15, fontWeight: '700' },
  xp: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '600' },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.background,
    marginTop: 6,
    marginBottom: theme.spacing.sm,
    overflow: 'hidden',
  },
  barFill: { height: 6, backgroundColor: theme.colors.accent },
  hint: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 17 },
  levelBtn: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: theme.spacing.xs,
  },
  levelBtnLabel: { color: theme.colors.background, fontSize: 14, fontWeight: '700' },
  points: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  spendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  spendBtn: {
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
    minWidth: 52,
  },
  spendLabel: { color: theme.colors.accent, fontSize: 13, fontWeight: '700' },
  spendScore: { color: theme.colors.textMuted, fontSize: 11 },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.85 },
  feedback: {
    color: theme.colors.accent,
    fontSize: 13,
    lineHeight: 18,
    marginTop: theme.spacing.sm,
  },
  feedbackMuted: { color: theme.colors.textMuted },
});
