import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Platform,
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
  campaignToState,
  createSeededRng,
  createStarterMap,
  clampPlayerInput,
  MAX_INPUT_CHARS,
  routePlayerInput,
  patchesFromSceneBeat,
  resolveSceneBeat,
  whereAmI,
  withSession,
  type SceneBeatResult,
  type StillResult,
} from '../../engine';
import { createPlayNarrator } from '../ai';
import { STUB_SAFE_PROSE } from '../../engine/narrator';
import { StillFrame } from '../components/StillFrame';
import { COMPOSER_NATIVE_PROPS, isComposerSubmitKey } from '../components/composerKeys';
import { TaleBackdrop } from '../components/TaleBackdrop';
import { appImages } from '../images';
import { createAppStillProvider } from '../persist/stillCache';
import { useSettings } from '../settings/SettingsContext';
import { theme } from '../theme';

type Props = {
  campaign: CampaignSave;
  onCampaignChange: (campaign: CampaignSave) => void;
  embedded?: boolean;
  onBack?: () => void;
  /** UX-01b: extra composer clearance (PlayShell may own outer nav pad). */
  bottomInset?: number;
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
  /** NARR-04: compact numbers under the prose (never inside it). */
  mechanicsLine: string | null;
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
  const cleaned = raw
    .replace(/\s*Recently:\s*[^\n]*/gi, '')
    .replace(/\s*Place mark:\s*[^\n.]+\.?/gi, '')
    .replace(/\s*Turn\s+\d+\.?/gi, '')
    .replace(/\bsource\s*=\s*\w+/gi, '')
    .replace(/\boffline\s*=\s*(yes|no)/gi, '')
    .replace(/\s*\[[^\]]*DC[^\]]*\]/gi, '')
    .replace(/\s*\(You make your way:[^)]*\)\.?/gi, '')
    .replace(/\s*You intended:\s*[^\n.]+\.?/gi, '')
    // NARR-04: keep paragraph breaks (offer / completion paragraphs), collapse the rest.
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
  // NARR-01: never emit an empty narrator bubble after cleanup.
  return cleaned.length > 0 ? cleaned : STUB_SAFE_PROSE;
}

function recordsToBeats(records: StoryBeatRecord[]): StoryBeat[] {
  return records.map((r) => ({
    id: r.id,
    prose: playerFacingProse(r.prose),
    checkLine: r.checkLine,
    still: null,
    placeLine: r.placeLine ?? null,
    playerLine: r.playerLine ?? null,
    mechanicsLine: r.mechanicsLine ?? null,
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
      mechanicsLine: null,
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
    ...(beat.mechanicsLine ? { mechanicsLine: beat.mechanicsLine } : {}),
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
  bottomInset = 0,
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
      // NARR-04: no duplicate padding — the narr.last.* anti-repeat flags already
      // keep the same line from landing twice in a row.
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
        mechanicsLine: beat.mechanicsLine ?? null,
      };
      // Replace optimistic pending narrator bubble if present (NARR-01).
      const base =
        beatsRef.current.length > 0 &&
        beatsRef.current[beatsRef.current.length - 1]!.id.startsWith('pending-')
          ? beatsRef.current.slice(0, -1)
          : beatsRef.current;
      const next = [...base, entry].slice(-MAX_STORY_BEATS);
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
        quests: beat.campaign.world?.quests,
        locationId: beat.campaign.session.locationId,
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
      const seed =
        campaign.session.rngSeed ??
        (Math.floor(Date.now() / 1000) % 1_000_000);
      const beatInput = {
        campaign,
        playerAction: opts.playerAction,
        beat: opts.beat,
        verbosity,
        map,
        stills: stillProvider,
        showMe: opts.showMe,
        forceCheck: opts.forceCheck,
        skipTravel: opts.skipTravel,
        rng: createSeededRng(seed + campaign.session.turn),
      };

      const pushEmergencyNarrator = () => {
        // Last-resort local bubble so Tale submit is never silent.
        const playerLine = pendingPlayerLine.current ?? opts.playerAction ?? null;
        pendingPlayerLine.current = null;
        const entry: StoryBeat = {
          id: `local-${Date.now()}`,
          prose: STUB_SAFE_PROSE,
          checkLine: null,
          still: null,
          placeLine: null,
          playerLine,
          mechanicsLine: null,
        };
        const base =
          beatsRef.current.length > 0 &&
          beatsRef.current[beatsRef.current.length - 1]!.id.startsWith(
            'pending-',
          )
            ? beatsRef.current.slice(0, -1)
            : beatsRef.current;
        const next = [...base, entry].slice(-MAX_STORY_BEATS);
        beatsRef.current = next;
        setBeats(next);
        setEarlierOpen(false);
      };

      try {
        const { provider } = playNarrator();
        let result: SceneBeatResult;
        try {
          result = await resolveSceneBeat({
            ...beatInput,
            narrator: provider,
          });
        } catch (err) {
          // Remote/on-device failure → improved stub (never block Tale).
          if (provider.kind !== 'stub') {
            const stub = createPlayNarrator({
              providerKind: 'stub',
            }).provider;
            result = await resolveSceneBeat({
              ...beatInput,
              narrator: stub,
            });
          } else {
            throw err;
          }
        }

        applyBeat(result);
        if (opts.playerAction) setAction('');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        if (opts.playerAction || pendingPlayerLine.current) {
          try {
            const stub = createPlayNarrator({
              providerKind: 'stub',
            }).provider;
            const result = await resolveSceneBeat({
              ...beatInput,
              narrator: stub,
            });
            applyBeat(result);
            if (opts.playerAction) setAction('');
          } catch {
            pushEmergencyNarrator();
            if (opts.playerAction) setAction('');
          }
        } else {
          pendingPlayerLine.current = null;
        }
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

  // P-INT-01: beats appended outside the Tale (Items use/equip/drop) live on
  // CampaignState.session.storyBeats — adopt them so the chat shows them and
  // the next narrator turn doesn't overwrite them.
  const savedBeats = campaign.session.storyBeats;
  useEffect(() => {
    if (bootstrappedFor.current !== campaign.id) return;
    if (busy) return;
    const saved = savedBeats ?? [];
    if (saved.length === 0) return;
    const local = beatsRef.current.filter((b) => !b.id.startsWith('pending-'));
    const savedLast = saved[saved.length - 1]!.id;
    if (local.some((b) => b.id === savedLast)) return;
    const byId = new Map(local.map((b) => [b.id, b] as const));
    const merged = recordsToBeats(saved).map((b) => {
      const prev = byId.get(b.id);
      return prev ? { ...b, still: prev.still } : b;
    });
    beatsRef.current = merged;
    setBeats(merged);
    setEarlierOpen(false);
    requestAnimationFrame(() => {
      logRef.current?.scrollToEnd({ animated: false });
    });
  }, [savedBeats, campaign.id, busy]);

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
    const text = clampPlayerInput(action);
    if (!text || busy) return;
    // QA-01: rules-first routing (combat, rest, items, progression, trade,
    // honest refusals) before the narrator. Pure engine call — see engine/input.ts.
    const routed = routePlayerInput(campaign, text, { map });
    if (routed) {
      setAction('');
      onCampaignChange(routed.campaign);
      return;
    }
    pendingPlayerLine.current = text;
    setAction('');
    // Optimistic player + narrator bubble so submit is never visually silent.
    const pending: StoryBeat = {
      id: `pending-${Date.now()}`,
      prose: 'The tale gathers around your choice…',
      checkLine: null,
      still: null,
      placeLine: null,
      playerLine: text,
      mechanicsLine: null,
    };
    const next = [...beatsRef.current, pending].slice(-MAX_STORY_BEATS);
    beatsRef.current = next;
    setBeats(next);
    setEarlierOpen(false);
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

  const backdropState = useMemo(() => campaignToState(campaign), [campaign]);

  // UI-04: keep 4–5 most recent beats as full bubbles; older collapse into Earlier.
  const RECENT_VISIBLE = 5;
  const older =
    beats.length > RECENT_VISIBLE ? beats.slice(0, -RECENT_VISIBLE) : [];
  const recent = beats.slice(-RECENT_VISIBLE);
  const headerPlace =
    recent.length > 0
      ? ([...recent].reverse().find((b) => b.placeLine)?.placeLine ?? null)
      : null;

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
          {b.mechanicsLine ? (
            <Text style={styles.mechanicsLine} accessibilityLabel={`Mechanics: ${b.mechanicsLine}`}>
              {b.mechanicsLine}
            </Text>
          ) : null}
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
      {/* BG-01: dim location/speaker backdrop behind the story log. */}
      <TaleBackdrop state={backdropState} />
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

        {headerPlace || !embedded ? (
          <View style={styles.storyHeader}>
            {!embedded ? (
              <Text style={styles.storyTitle}>Story</Text>
            ) : null}
            {headerPlace ? (
              <Text style={styles.placeLine}>{headerPlace}</Text>
            ) : null}
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {beats.length === 0 ? (
          <View style={styles.loadingCard}>
            <Text style={styles.loadingText}>
              {busy ? 'The tale begins…' : 'Waiting for the next beat.'}
            </Text>
          </View>
        ) : (
          <>
            {older.length > 0 ? (
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
                    {earlierOpen ? 'Hide earlier' : 'Earlier'} ({older.length})
                  </Text>
                </Pressable>
                {earlierOpen
                  ? older.map((b) => (
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

            {recent.map((b) => (
              <React.Fragment key={b.id}>
                {b.playerLine ? (
                  <View style={styles.playerRow}>
                    <View style={styles.playerBubble}>
                      <Text style={styles.playerProse}>{b.playerLine}</Text>
                    </View>
                  </View>
                ) : null}
                {renderNarratorBubble(b, b.id)}
              </React.Fragment>
            ))}
          </>
        )}

      </ScrollView>

      {/* UX-01: Tale composer pinned to bottom of play story column */}
      <View
        style={[
          styles.composerDock,
          bottomInset > 0 ? { paddingBottom: theme.spacing.sm + bottomInset } : null,
        ]}
      >
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
            maxLength={MAX_INPUT_CHARS}
            // QA-02: Enter sends. Native: Return key = send (no newline).
            {...COMPOSER_NATIVE_PROPS}
            onSubmitEditing={submitAction}
            // Web: Enter sends, Shift+Enter inserts a newline.
            onKeyPress={(e) => {
              if (Platform.OS !== 'web') return;
              const ne = e.nativeEvent as unknown as { key?: string; shiftKey?: boolean; isComposing?: boolean };
              if (isComposerSubmitKey(ne)) {
                (e as unknown as { preventDefault?: () => void }).preventDefault?.();
                submitAction();
              }
            }}
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  scroll: {
    flex: 1,
    // BG-01: transparent so TaleBackdrop shows through (parent keeps #140f0c).
    backgroundColor: 'transparent',
  },
  root: {
    padding: theme.spacing.md,
    // QA-02: tighter gap between the last beat and the composer / rail.
    paddingBottom: theme.spacing.xs,
    flexGrow: 1,
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
    // UX-02: larger DM/narrator bubble text for phone readability
    fontSize: 18,
    lineHeight: 28,
  },
  mechanicsLine: {
    marginTop: theme.spacing.xs,
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.2,
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
  composerDock: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  composeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
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
    marginBottom: theme.spacing.sm,
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
