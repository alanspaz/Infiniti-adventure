import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { CampaignSave, StoryBeatRecord } from '../../engine';
import {
  createSeededRng,
  createStarterMap,
  resolveSceneBeat,
  withSession,
  type SceneBeatResult,
  type StillResult,
} from '../../engine';
import { createPlayNarrator } from '../ai';
import { StillFrame } from '../components/StillFrame';
import { createAppStillProvider } from '../persist/stillCache';
import { useSettings } from '../settings/SettingsContext';
import { theme } from '../theme';

type Props = {
  campaign: CampaignSave;
  /** Persist after each beat (app shell → AsyncStorage). */
  onCampaignChange: (campaign: CampaignSave) => void;
  /** When true, hide stand-alone chrome (used inside PlayShell). */
  embedded?: boolean;
  /** Stand-alone back (ignored when embedded). */
  onBack?: () => void;
};

type StoryBeat = {
  id: string;
  prose: string;
  checkLine: string | null;
  still: StillResult | null;
  placeLine: string | null;
};

const MAX_STORY_BEATS = 40;

/** First sentence only, trimmed — never path separators. */
function firstSentence(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  const sentence = trimmed.split(/(?<=[.!?])\s+/)[0] ?? trimmed;
  return sentence.trim();
}

/** Natural Story place line from whereAmI — never Map path / kind. */
function naturalPlaceLine(
  where: { name: string; description?: string } | null | undefined,
): string | null {
  if (!where?.name?.trim()) return null;
  const name = where.name.trim();
  const desc = where.description ? firstSentence(where.description) : '';
  if (desc) return `At ${name}. ${desc}`;
  return `At ${name}.`;
}

/** Strip leftover engine/debug crumbs if any older saves/providers leak them. */
function playerFacingProse(raw: string): string {
  return raw
    .replace(/\s*Recently:\s*[^\n]*/gi, '')
    .replace(/\s*Place mark:\s*[^\n.]+\.?/gi, '')
    .replace(/\s*Turn\s+\d+\.?/gi, '')
    .replace(/\bsource\s*=\s*\w+/gi, '')
    .replace(/\boffline\s*=\s*(yes|no)/gi, '')
    .replace(/\s*\[[^\]]*DC[^\]]*\]/gi, '')
    .replace(/\s*\(You make your way:[^)]*\)\.?/gi, '')
    .replace(/\s*You intended:\s*[^\n.]+\.?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function recordsToBeats(records: StoryBeatRecord[]): StoryBeat[] {
  return records.map((r) => ({
    id: r.id,
    prose: playerFacingProse(r.prose),
    checkLine: r.checkLine,
    still: null,
    placeLine: r.placeLine ?? null,
  }));
}

function hydrateFromLogSummary(logSummary: string): StoryBeat[] {
  return logSummary
    .split(/\s*\|\s*/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i) => ({
      id: `log-${i}-${line.slice(0, 24)}`,
      prose: playerFacingProse(line.replace(/^T\d+:\s*/i, '')),
      checkLine: null,
      still: null,
      placeLine: null,
    }))
    .filter((b) => b.prose.length > 0);
}

function toRecord(beat: StoryBeat): StoryBeatRecord {
  return {
    id: beat.id,
    prose: beat.prose,
    checkLine: beat.checkLine,
    stillCacheKey: beat.still?.cacheKey ?? null,
    placeLine: beat.placeLine,
  };
}

function previewLine(prose: string): string {
  const one = firstSentence(prose) || prose.trim();
  return one.length > 72 ? `${one.slice(0, 69)}…` : one;
}

/**
 * Story tab — player-facing narration + action input.
 * Latest-focus journal; Map owns technical path/exits.
 */
export function SceneScreen({
  campaign,
  onCampaignChange,
  embedded = false,
  onBack,
}: Props) {
  const { verbosity, providerKind, apiKey, baseUrl, model } = useSettings();
  const map = useMemo(() => createStarterMap(), []);
  const stillProvider = useMemo(() => createAppStillProvider(), []);
  const logRef = useRef<ScrollView>(null);
  const bootstrappedFor = useRef<string | null>(null);
  const beatsRef = useRef<StoryBeat[]>([]);

  const [beats, setBeats] = useState<StoryBeat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState('');
  const [earlierOpen, setEarlierOpen] = useState(false);

  const playNarrator = useCallback(() => {
    return createPlayNarrator({
      providerKind,
      apiKey,
      baseUrl,
      model: model.trim() || undefined,
    });
  }, [providerKind, apiKey, baseUrl, model]);

  const applyBeat = useCallback(
    (beat: SceneBeatResult) => {
      const prose = playerFacingProse(beat.prose);
      const entry: StoryBeat = {
        id: `${beat.campaign.session.turn}-${Date.now()}`,
        prose,
        checkLine: beat.check?.line ?? null,
        still: beat.still,
        placeLine: naturalPlaceLine(beat.where),
      };
      const next = [...beatsRef.current, entry].slice(-MAX_STORY_BEATS);
      beatsRef.current = next;
      setBeats(next);
      setEarlierOpen(false);
      onCampaignChange(
        withSession(beat.campaign, {
          storyBeats: next.map(toRecord),
        }),
      );
      requestAnimationFrame(() => {
        logRef.current?.scrollToEnd({ animated: true });
      });
    },
    [onCampaignChange],
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
        const { provider } = playNarrator();
        let narrator = provider;

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
            stills: stillProvider,
            showMe: opts.showMe,
            forceCheck: opts.forceCheck,
            rng: createSeededRng(seed + campaign.session.turn),
          });
        } catch (err) {
          if (provider.kind !== 'stub') {
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
              stills: stillProvider,
              showMe: opts.showMe,
              forceCheck: opts.forceCheck,
              rng: createSeededRng(seed + campaign.session.turn),
            });
          } else {
            throw err;
          }
        }

        applyBeat(result);
        if (opts.playerAction) setAction('');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [campaign, verbosity, map, playNarrator, applyBeat, stillProvider],
  );

  useEffect(() => {
    if (bootstrappedFor.current === campaign.id) return;
    if (busy) return;

    const saved = campaign.session.storyBeats ?? [];
    if (saved.length > 0) {
      const hydrated = recordsToBeats(saved);
      beatsRef.current = hydrated;
      setBeats(hydrated);
      bootstrappedFor.current = campaign.id;
      return;
    }

    if (campaign.session.turn > 0 || campaign.session.logSummary.trim()) {
      const fromLog = hydrateFromLogSummary(campaign.session.logSummary);
      if (fromLog.length > 0) {
        beatsRef.current = fromLog;
        setBeats(fromLog);
        bootstrappedFor.current = campaign.id;
        return;
      }
      bootstrappedFor.current = campaign.id;
      return;
    }

    bootstrappedFor.current = campaign.id;
    void runBeat({ beat: 'opening' });
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

  const prior = beats.length > 1 ? beats.slice(0, -1) : [];
  const latest = beats.length > 0 ? beats[beats.length - 1]! : null;
  const headerPlace = latest?.placeLine ?? null;

  return (
    <View style={styles.flex}>
      <ScrollView
        ref={logRef}
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

        <View style={styles.storyHeader}>
          <Text style={styles.storyTitle}>Story</Text>
          {headerPlace ? (
            <Text style={styles.placeLine}>{headerPlace}</Text>
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {beats.length === 0 ? (
          <View style={styles.loadingCard}>
            <Text style={styles.loadingText}>
              {busy ? 'The tale begins…' : 'Waiting for the next beat.'}
            </Text>
          </View>
        ) : (
          <>
            {prior.length > 0 ? (
              <View style={styles.earlierWrap}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: earlierOpen }}
                  onPress={() => setEarlierOpen((o) => !o)}
                  style={({ pressed }) => [
                    styles.earlierToggle,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.earlierLabel}>
                    {earlierOpen ? 'Hide earlier' : 'Earlier'} ({prior.length})
                  </Text>
                </Pressable>
                {earlierOpen
                  ? prior.map((b) => (
                      <View key={b.id} style={styles.earlierRow}>
                        <Text style={styles.earlierPreview} numberOfLines={1}>
                          {previewLine(b.prose)}
                        </Text>
                      </View>
                    ))
                  : null}
              </View>
            ) : null}

            {latest ? (
              <View style={styles.beatCard}>
                <Text style={styles.prose}>{latest.prose}</Text>
                {latest.checkLine ? (
                  <View style={styles.checkCard}>
                    <Text style={styles.checkLabel}>Check</Text>
                    <Text style={styles.checkLine}>{latest.checkLine}</Text>
                  </View>
                ) : null}
                {latest.still ? (
                  <StillFrame
                    still={latest.still}
                    playerFacing
                    caption="A vision"
                  />
                ) : null}
              </View>
            ) : null}
          </>
        )}

        <Text style={styles.section}>What do you do?</Text>
        <TextInput
          value={action}
          onChangeText={setAction}
          placeholder="Speak, look, move, or act…"
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
            {busy ? 'Resolving…' : 'Submit'}
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
            <Text style={styles.secondaryLabel}>Continue the tale</Text>
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  root: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  back: {
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  backLabel: {
    color: theme.colors.accent,
    fontSize: 16,
  },
  storyHeader: {
    marginBottom: theme.spacing.md,
  },
  storyTitle: {
    color: theme.colors.accent,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  placeLine: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  error: {
    color: theme.colors.danger,
    marginBottom: theme.spacing.sm,
  },
  loadingCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  loadingText: {
    color: theme.colors.textMuted,
    fontSize: 15,
    fontStyle: 'italic',
  },
  earlierWrap: {
    marginBottom: theme.spacing.sm,
  },
  earlierToggle: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    marginBottom: theme.spacing.xs,
  },
  earlierLabel: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  earlierRow: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  earlierPreview: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  beatCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  prose: {
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 25,
  },
  checkCard: {
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: 10,
    padding: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  checkLabel: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  checkLine: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    color: theme.colors.text,
    padding: theme.spacing.md,
    minHeight: 72,
    textAlignVertical: 'top',
    marginBottom: theme.spacing.md,
  },
  primary: {
    backgroundColor: theme.colors.accent,
    borderRadius: 12,
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
    borderRadius: 10,
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
});
