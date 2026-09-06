import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { CampaignSave, StoryBeatRecord } from '../../engine';
import {
  applyCampaignPatch,
  createSeededRng,
  createStarterMap,
  patchesFromSceneBeat,
  resolveSceneBeat,
  whereAmI,
  withSession,
  type SceneBeatResult,
  type StillResult,
} from '../../engine';
import { createPlayNarrator } from '../ai';
import { StillFrame } from '../components/StillFrame';
import { appImages } from '../images';
import { createAppStillProvider } from '../persist/stillCache';
import { useSettings } from '../settings/SettingsContext';
import { theme } from '../theme';

type Props = {
  campaign: CampaignSave;
  onCampaignChange: (campaign: CampaignSave) => void;
  embedded?: boolean;
  onBack?: () => void;
  /** Optional: open Stills gallery from Story (preserves T-019 access). */
  onOpenStills?: () => void;
};

type StoryBeat = {
  id: string;
  prose: string;
  checkLine: string | null;
  still: StillResult | null;
  placeLine: string | null;
  playerLine: string | null;
};

const MAX_STORY_BEATS = 40;

function firstSentence(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  const sentence = trimmed.split(/(?<=[.!?])\s+/)[0] ?? trimmed;
  return sentence.trim();
}

function naturalPlaceLine(
  where: { name: string; description?: string } | null | undefined,
): string | null {
  if (!where?.name?.trim()) return null;
  const name = where.name.trim();
  const desc = where.description ? firstSentence(where.description) : '';
  if (desc) return `At ${name}. ${desc}`;
  return `At ${name}.`;
}

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
    playerLine: r.playerLine ?? null,
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
      playerLine: null,
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
    playerLine: beat.playerLine,
  };
}

function previewLine(prose: string): string {
  const one = firstSentence(prose) || prose.trim();
  return one.length > 72 ? `${one.slice(0, 69)}…` : one;
}

/**
 * Story surface — Base44-style chat: DM avatar + narrator bubbles,
 * player action bubbles, compose row. Preserves T-017–019 engine wiring.
 */
export function SceneScreen({
  campaign,
  onCampaignChange,
  embedded = false,
  onBack,
  onOpenStills,
}: Props) {
  const { verbosity, providerKind, apiKey, baseUrl, model } = useSettings();
  const map = useMemo(() => createStarterMap(), []);
  const stillProvider = useMemo(() => createAppStillProvider(), []);
  const logRef = useRef<ScrollView>(null);
  const bootstrappedFor = useRef<string | null>(null);
  const beatsRef = useRef<StoryBeat[]>([]);
  const lastLocRef = useRef<string | null>(null);
  const mapSyncBusy = useRef(false);

  const [beats, setBeats] = useState<StoryBeat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState('');
  const [earlierOpen, setEarlierOpen] = useState(false);
  const pendingPlayerLine = useRef<string | null>(null);

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
      const playerLine = pendingPlayerLine.current;
      pendingPlayerLine.current = null;
      const placeLine = naturalPlaceLine(beat.where);
      const entry: StoryBeat = {
        id: `${beat.campaign.session.turn}-${Date.now()}`,
        prose,
        checkLine: beat.check?.line ?? null,
        still: beat.still,
        placeLine,
        playerLine,
      };
      const next = [...beatsRef.current, entry].slice(-MAX_STORY_BEATS);
      beatsRef.current = next;
      lastLocRef.current = beat.campaign.session.locationId ?? null;
      setBeats(next);
      setEarlierOpen(false);

      // CS-02: structured patches into CampaignState (no panel-local copies).
      // Check/travel stay out of narrator prose — only world/session fields.
      const records = next.map(toRecord);
      const stub = patchesFromSceneBeat({
        playerAction: playerLine,
        travelToId: beat.travel?.toNodeId ?? null,
        checkLine: beat.check?.line ?? null,
        checkSuccess: beat.check ? beat.check.result.success : null,
        placeLine,
        storyBeats: records,
      });
      // Prefer engine campaign (turn/location/log) then overlay patches.
      let saved = withSession(beat.campaign, { storyBeats: records });
      saved = applyCampaignPatch(saved, {
        ...stub,
        // storyBeats already on session via withSession; keep meta/inventory/quests
        storyBeats: records,
        locationId: beat.campaign.session.locationId,
      });
      onCampaignChange(saved);
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
      skipTravel?: boolean;
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
            skipTravel: opts.skipTravel,
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
              skipTravel: opts.skipTravel,
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
        pendingPlayerLine.current = null;
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
      lastLocRef.current = campaign.session.locationId ?? null;
      bootstrappedFor.current = campaign.id;
      return;
    }

    if (campaign.session.turn > 0 || campaign.session.logSummary.trim()) {
      const fromLog = hydrateFromLogSummary(campaign.session.logSummary);
      if (fromLog.length > 0) {
        beatsRef.current = fromLog;
        setBeats(fromLog);
        lastLocRef.current = campaign.session.locationId ?? null;
        bootstrappedFor.current = campaign.id;
        return;
      }
      lastLocRef.current = campaign.session.locationId ?? null;
      bootstrappedFor.current = campaign.id;
      return;
    }

    lastLocRef.current = campaign.session.locationId ?? null;
    bootstrappedFor.current = campaign.id;
    void runBeat({ beat: 'opening' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id]);

  useEffect(() => {
    if (bootstrappedFor.current !== campaign.id) return;
    const loc = campaign.session.locationId ?? null;
    if (loc === lastLocRef.current) return;
    if (busy || mapSyncBusy.current) return;

    lastLocRef.current = loc;

    let where: ReturnType<typeof whereAmI> | null = null;
    try {
      if (loc) where = whereAmI(map, loc);
    } catch {
      where = null;
    }
    const place = naturalPlaceLine(where);
    if (place && beatsRef.current.length > 0) {
      const updated = beatsRef.current.map((b, i, arr) =>
        i === arr.length - 1 ? { ...b, placeLine: place } : b,
      );
      beatsRef.current = updated;
      setBeats(updated);
    }

    mapSyncBusy.current = true;
    void (async () => {
      try {
        await runBeat({
          beat: 'continue',
          skipTravel: true,
          forceCheck: null,
        });
      } finally {
        mapSyncBusy.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.session.locationId, campaign.id, busy]);

  const submitAction = () => {
    const text = action.trim();
    if (!text || busy) return;
    pendingPlayerLine.current = text;
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

  const renderNarratorBubble = (b: StoryBeat, key: string) => (
    <View key={key} style={styles.dmRow}>
      <Image
        source={appImages.avatarNarrator}
        style={styles.dmAvatar}
        resizeMode="cover"
        accessibilityLabel="Narrator"
      />
      <View style={styles.dmCol}>
        <Text style={styles.dmName}>Narrator</Text>
        <View style={styles.dmBubble}>
          <Text style={styles.prose}>{b.prose}</Text>
          {b.checkLine ? (
            <View style={styles.checkCard}>
              <Text style={styles.checkLabel}>Check</Text>
              <Text style={styles.checkLine}>{b.checkLine}</Text>
            </View>
          ) : null}
          {b.still ? (
            <StillFrame still={b.still} playerFacing caption="A vision" />
          ) : null}
        </View>
      </View>
    </View>
  );

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
                      <View key={b.id}>
                        {b.playerLine ? (
                          <View style={styles.playerRowCompact}>
                            <Text style={styles.earlierPreview} numberOfLines={1}>
                              You: {previewLine(b.playerLine)}
                            </Text>
                          </View>
                        ) : null}
                        <View style={styles.earlierRow}>
                          <Text style={styles.earlierPreview} numberOfLines={1}>
                            {previewLine(b.prose)}
                          </Text>
                        </View>
                      </View>
                    ))
                  : null}
              </View>
            ) : null}

            {latest ? (
              <>
                {latest.playerLine ? (
                  <View style={styles.playerRow}>
                    <View style={styles.playerBubble}>
                      <Text style={styles.playerProse}>{latest.playerLine}</Text>
                    </View>
                  </View>
                ) : null}
                {renderNarratorBubble(latest, latest.id)}
              </>
            ) : null}
          </>
        )}

        <View style={styles.composeRow}>
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
            accessibilityLabel="Send action"
            onPress={submitAction}
            disabled={busy || !action.trim()}
            style={({ pressed }) => [
              styles.send,
              pressed && styles.pressed,
              (busy || !action.trim()) && styles.disabled,
            ]}
          >
            <Text style={styles.sendLabel}>{busy ? '…' : '➤'}</Text>
          </Pressable>
        </View>

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

          {onOpenStills ? (
            <Pressable
              accessibilityRole="button"
              onPress={onOpenStills}
              style={({ pressed }) => [
                styles.secondary,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryLabel}>Visions</Text>
            </Pressable>
          ) : null}
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
  playerRowCompact: {
    paddingTop: 6,
    paddingHorizontal: 4,
  },
  earlierPreview: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  dmRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  dmAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: '#241c16',
  },
  dmCol: {
    flex: 1,
  },
  dmName: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  dmBubble: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderTopLeftRadius: 4,
    padding: theme.spacing.md,
  },
  playerRow: {
    alignItems: 'flex-end',
    marginBottom: theme.spacing.sm,
  },
  playerBubble: {
    maxWidth: '88%',
    backgroundColor: theme.colors.accent,
    borderRadius: 14,
    borderTopRightRadius: 4,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  playerProse: {
    color: theme.colors.background,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
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
  composeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    color: theme.colors.text,
    padding: theme.spacing.md,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendLabel: {
    color: theme.colors.background,
    fontSize: 18,
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
