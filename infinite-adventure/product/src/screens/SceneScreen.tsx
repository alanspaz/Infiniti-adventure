import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { CampaignSave } from '../../engine';
import {
  createSeededRng,
  createStarterMap,
  resolveSceneBeat,
  type SceneBeatResult,
} from '../../engine';
import { createPlayNarrator } from '../ai';
import { useSettings } from '../settings/SettingsContext';
import { theme } from '../theme';

type Props = {
  campaign: CampaignSave;
  onBack: () => void;
  /** Persist after each beat (app shell → AsyncStorage). */
  onCampaignChange: (campaign: CampaignSave) => void;
};

/**
 * Full scene / adventure play loop (v1):
 * narrator beat → player action → optional check → travel → optional still → save.
 * Stub works offline; remote is optional and falls back to stub.
 */
export function SceneScreen({ campaign, onBack, onCampaignChange }: Props) {
  const { verbosity, providerKind, apiKey } = useSettings();
  const map = useMemo(() => createStarterMap(), []);

  const [prose, setProse] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [checkLine, setCheckLine] = useState<string | null>(null);
  const [whereLine, setWhereLine] = useState<string | null>(null);
  const [stillLine, setStillLine] = useState<string | null>(null);
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState('');
  const [started, setStarted] = useState(false);

  const playNarrator = useCallback(() => {
    return createPlayNarrator({
      providerKind,
      apiKey,
      // baseUrl not in settings yet — remote falls back to stub until configured
    });
  }, [providerKind, apiKey]);

  const applyBeat = useCallback(
    (beat: SceneBeatResult, note: string | null) => {
      setProse(beat.prose);
      setCheckLine(beat.check?.line ?? null);
      setWhereLine(beat.where ? beat.where.line : null);
      setStillLine(
        beat.still
          ? `${beat.still.message} · ${beat.still.cacheKey}`
          : null,
      );
      setFallbackNote(note);
      setMeta(
        `source=${beat.narrator.source} · offline=${beat.narrator.offline ? 'yes' : 'no'} · turn=${beat.campaign.session.turn} · settings=${providerKind}`,
      );
      onCampaignChange(beat.campaign);
    },
    [onCampaignChange, providerKind],
  );

  const runBeat = useCallback(
    async (opts: {
      playerAction?: string;
      beat?: 'opening' | 'continue' | 'custom';
      showMe?: boolean;
      forceCheck?: null;
    }) => {
      setBusy(true);
      setError(null);
      try {
        const { provider, fallbackNote: note } = playNarrator();
        let narrator = provider;
        let usedNote = note;

        const seed =
          campaign.session.rngSeed ??
          (Math.floor(Date.now() / 1000) % 1_000_000);

        let result: SceneBeatResult;
        try {
          result = await resolveSceneBeat({
            campaign,
            playerAction: opts.playerAction,
            beat: opts.beat,
            verbosity,
            narrator,
            map,
            showMe: opts.showMe,
            forceCheck: opts.forceCheck,
            rng: createSeededRng(seed + campaign.session.turn),
          });
        } catch (err) {
          // Remote/on-device failure → offline stub (never block play)
          if (provider.kind !== 'stub') {
            const msg = err instanceof Error ? err.message : String(err);
            usedNote = `Provider failed (${msg}) — using offline stub`;
            narrator = createPlayNarrator({
              providerKind: 'stub',
            }).provider;
            result = await resolveSceneBeat({
              campaign,
              playerAction: opts.playerAction,
              beat: opts.beat,
              verbosity,
              narrator,
              map,
              showMe: opts.showMe,
              forceCheck: opts.forceCheck,
              rng: createSeededRng(seed + campaign.session.turn),
            });
          } else {
            throw err;
          }
        }

        applyBeat(result, usedNote);
        setStarted(true);
        if (opts.playerAction) setAction('');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [campaign, verbosity, map, playNarrator, applyBeat],
  );

  // Auto-load opening/continue when entering the screen once.
  useEffect(() => {
    if (started || busy) return;
    const beat =
      campaign.session.turn > 0 || campaign.session.logSummary
        ? 'continue'
        : 'opening';
    void runBeat({ beat });
    // intentionally once on mount / campaign id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id]);

  const submitAction = () => {
    const text = action.trim();
    if (!text || busy) return;
    void runBeat({ playerAction: text, beat: 'custom' });
  };

  const showMe = () => {
    if (busy) return;
    void runBeat({
      beat: campaign.session.turn > 0 ? 'continue' : 'opening',
      showMe: true,
      forceCheck: null,
    });
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

      <Text style={styles.title}>Scene</Text>
      <Text style={styles.hint}>
        Offline adventure loop for “{campaign.title}”. Stub narrator always
        works; remote is optional when configured. Empty party is valid.
      </Text>

      {whereLine ? <Text style={styles.where}>{whereLine}</Text> : null}
      {fallbackNote ? <Text style={styles.note}>{fallbackNote}</Text> : null}
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {prose ? (
        <View style={styles.card}>
          <Text style={styles.prose}>{prose}</Text>
        </View>
      ) : (
        <Text style={styles.meta}>{busy ? 'Loading beat…' : 'No beat yet.'}</Text>
      )}

      {checkLine ? (
        <View style={styles.checkCard}>
          <Text style={styles.checkLabel}>Check</Text>
          <Text style={styles.checkLine}>{checkLine}</Text>
        </View>
      ) : null}

      {stillLine ? (
        <View style={styles.stillCard}>
          <Text style={styles.checkLabel}>Show me</Text>
          <Text style={styles.stillLine}>{stillLine}</Text>
        </View>
      ) : null}

      <Text style={styles.section}>Your action</Text>
      <TextInput
        value={action}
        onChangeText={setAction}
        placeholder="What do you do?"
        placeholderTextColor={theme.colors.textMuted}
        style={styles.input}
        editable={!busy}
        multiline
        accessibilityLabel="Player action"
      />

      <Pressable
        accessibilityRole="button"
        onPress={submitAction}
        disabled={busy || !action.trim()}
        style={({ pressed }) => [
          styles.primary,
          pressed && styles.pressed,
          (busy || !action.trim()) && styles.disabled,
        ]}
      >
        <Text style={styles.primaryLabel}>
          {busy ? 'Resolving…' : 'Submit action'}
        </Text>
      </Pressable>

      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void runBeat({
              beat: campaign.session.turn > 0 ? 'continue' : 'opening',
            });
          }}
          disabled={busy}
          style={({ pressed }) => [
            styles.secondary,
            pressed && styles.pressed,
            busy && styles.disabled,
          ]}
        >
          <Text style={styles.secondaryLabel}>New beat</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={showMe}
          disabled={busy}
          style={({ pressed }) => [
            styles.secondary,
            pressed && styles.pressed,
            busy && styles.disabled,
          ]}
        >
          <Text style={styles.secondaryLabel}>Show me</Text>
        </Pressable>
      </View>

      <Text style={styles.footer}>
        Party:{' '}
        {campaign.party.length === 0
          ? 'empty (solo)'
          : campaign.party.map((c) => c.name).join(', ')}{' '}
        · Verbosity: {verbosity}
      </Text>
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
    paddingVertical: theme.spacing.xs,
  },
  backLabel: {
    color: theme.colors.accent,
    fontSize: 16,
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
  where: {
    color: theme.colors.text,
    fontSize: 14,
    marginBottom: theme.spacing.sm,
  },
  note: {
    color: theme.colors.accent,
    fontSize: 12,
    marginBottom: theme.spacing.xs,
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginBottom: theme.spacing.sm,
  },
  error: {
    color: theme.colors.danger,
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
  prose: {
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 24,
  },
  checkCard: {
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: 10,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  stillCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  checkLabel: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  checkLine: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  stillLine: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  section: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: theme.spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    color: theme.colors.text,
    padding: theme.spacing.md,
    minHeight: 72,
    textAlignVertical: 'top',
    marginBottom: theme.spacing.md,
  },
  primary: {
    backgroundColor: theme.colors.accent,
    borderRadius: 10,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  primaryLabel: {
    color: theme.colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  secondary: {
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: 8,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  secondaryLabel: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.85 },
  footer: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: theme.spacing.sm,
  },
});
