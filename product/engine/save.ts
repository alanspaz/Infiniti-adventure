import { CharacterSheet, Party } from './types';
import {
  PersistStore,
  campaignSaveKey,
} from './persist';
import {
  STARTER_QUEST,
  createEmptyWorld,
  isCampaignWorldState,
  normalizeWorld,
  type CampaignWorldState,
} from './campaignState';

export const SAVE_SCHEMA_VERSION = 1 as const;

/** Player-facing story log entry persisted with the campaign. */
export type StoryBeatRecord = {
  id: string;
  prose: string;
  checkLine: string | null;
  /** Optional still cache key (URI resolved by UI cache). */
  stillCacheKey: string | null;
  /** Natural place line for Story (never Map path). */
  placeLine: string | null;
  /** Optional player action line for chat bubbles. */
  playerLine: string | null;
};

export type SessionState = {
  /** Non-negative turn counter. */
  turn: number;
  /** Current place id (map graph node). */
  locationId: string | null;
  /** Short offline-safe summary of recent events. */
  logSummary: string;
  /** Optional seed for reproducible dice. */
  rngSeed: number | null;
  /**
   * Player-facing story beats for Continue hydrate.
   * Optional for older saves; empty when omitted.
   */
  storyBeats?: StoryBeatRecord[];
};

export type CampaignFlagValue = boolean | number | string;

export type CampaignSave = {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** e.g. hearthlight | ash-ledger; null until chosen. */
  playstylePackId: string | null;
  /** Ordered party; empty is valid. */
  party: Party;
  session: SessionState;
  flags: Record<string, CampaignFlagValue>;
  /**
   * Optional world slice (inventory, quests, combat, storyMeta, playPrefs).
   * Omitted on older saves; normalized on load.
   */
  world?: CampaignWorldState;
};

export type CreateCampaignInput = {
  id: string;
  title?: string;
  createdAt?: string;
  playstylePackId?: string | null;
  party?: Party;
  session?: Partial<SessionState>;
  flags?: Record<string, CampaignFlagValue>;
  world?: Partial<CampaignWorldState>;
};

function isoNow(): string {
  return new Date().toISOString();
}

const MAX_STORY_BEATS = 40;

function normalizeStoryBeats(
  value: StoryBeatRecord[] | undefined,
): StoryBeatRecord[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_STORY_BEATS).map((b) => ({
    id: String(b.id),
    prose: String(b.prose ?? ''),
    checkLine: b.checkLine == null ? null : String(b.checkLine),
    stillCacheKey: b.stillCacheKey == null ? null : String(b.stillCacheKey),
    placeLine:
      b.placeLine === undefined || b.placeLine === null
        ? null
        : String(b.placeLine),
    playerLine:
      b.playerLine === undefined || b.playerLine === null
        ? null
        : String(b.playerLine),
  }));
}

export function createEmptySession(
  patch?: Partial<SessionState>,
): SessionState {
  const storyBeats = normalizeStoryBeats(patch?.storyBeats);
  return {
    turn: Math.max(0, Math.floor(patch?.turn ?? 0)),
    locationId: patch?.locationId ?? null,
    logSummary: patch?.logSummary ?? '',
    rngSeed: patch?.rngSeed === undefined ? null : patch.rngSeed,
    ...(storyBeats !== undefined ? { storyBeats } : {}),
  };
}

/** Create a new campaign save. Empty party is valid; never auto-spawns companions. */
export function createCampaign(input: CreateCampaignInput): CampaignSave {
  const now = input.createdAt ?? isoNow();
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    id: input.id,
    title: input.title ?? 'Untitled Adventure',
    createdAt: now,
    updatedAt: now,
    playstylePackId:
      input.playstylePackId === undefined ? null : input.playstylePackId,
    party: input.party ? [...input.party] : [],
    session: createEmptySession(input.session),
    flags: { ...(input.flags ?? {}) },
    world: createEmptyWorld({
      ...input.world,
      // Q-01: optional stub starter quest for new campaigns (explicit quests win).
      quests:
        input.world?.quests !== undefined
          ? input.world.quests
          : [STARTER_QUEST],
    }),
  };
}

export function touchCampaign(
  campaign: CampaignSave,
  updatedAt: string = isoNow(),
): CampaignSave {
  return { ...campaign, updatedAt };
}

export function withParty(
  campaign: CampaignSave,
  party: Party,
): CampaignSave {
  return touchCampaign({ ...campaign, party: [...party] });
}

export function withSession(
  campaign: CampaignSave,
  session: Partial<SessionState>,
): CampaignSave {
  return touchCampaign({
    ...campaign,
    session: createEmptySession({ ...campaign.session, ...session }),
  });
}

export function withWorld(
  campaign: CampaignSave,
  world: Partial<CampaignWorldState>,
): CampaignSave {
  return touchCampaign({
    ...campaign,
    world: createEmptyWorld({
      ...normalizeWorld(campaign.world),
      ...world,
      inventory: world.inventory
        ? world.inventory
        : normalizeWorld(campaign.world).inventory,
      quests: world.quests ?? normalizeWorld(campaign.world).quests,
      combat: world.combat
        ? { ...normalizeWorld(campaign.world).combat, ...world.combat }
        : normalizeWorld(campaign.world).combat,
      storyMeta: world.storyMeta
        ? { ...normalizeWorld(campaign.world).storyMeta, ...world.storyMeta }
        : normalizeWorld(campaign.world).storyMeta,
      playPrefs: world.playPrefs
        ? { ...normalizeWorld(campaign.world).playPrefs, ...world.playPrefs }
        : normalizeWorld(campaign.world).playPrefs,
    }),
  });
}

export function setFlag(
  campaign: CampaignSave,
  key: string,
  value: CampaignFlagValue,
): CampaignSave {
  return touchCampaign({
    ...campaign,
    flags: { ...campaign.flags, [key]: value },
  });
}

/** JSON-friendly serialize (round-trips with parseCampaign). */
export function serializeCampaign(campaign: CampaignSave): string {
  return JSON.stringify(campaign);
}

function isCharacterSheet(value: unknown): value is CharacterSheet {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    typeof c.description === 'string' &&
    typeof c.className === 'string' &&
    (c.age === null || typeof c.age === 'number') &&
    (c.originMode === 'backstory' || c.originMode === 'memory-loss') &&
    (c.sealedBackstorySeed === null ||
      typeof c.sealedBackstorySeed === 'string') &&
    typeof c.level === 'number' &&
    typeof c.hitDie === 'number' &&
    c.abilities !== null &&
    typeof c.abilities === 'object'
  );
}

function isStoryBeatRecord(value: unknown): value is StoryBeatRecord {
  if (!value || typeof value !== 'object') return false;
  const b = value as Record<string, unknown>;
  return (
    typeof b.id === 'string' &&
    typeof b.prose === 'string' &&
    (b.checkLine === null || typeof b.checkLine === 'string') &&
    (b.stillCacheKey === null || typeof b.stillCacheKey === 'string') &&
    (b.placeLine === undefined ||
      b.placeLine === null ||
      typeof b.placeLine === 'string') &&
    (b.playerLine === undefined ||
      b.playerLine === null ||
      typeof b.playerLine === 'string')
  );
}

function isSessionState(value: unknown): value is SessionState {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  if (
    !(
      typeof s.turn === 'number' &&
      (s.locationId === null || typeof s.locationId === 'string') &&
      typeof s.logSummary === 'string' &&
      (s.rngSeed === null || typeof s.rngSeed === 'number')
    )
  ) {
    return false;
  }
  if (s.storyBeats !== undefined) {
    if (!Array.isArray(s.storyBeats) || !s.storyBeats.every(isStoryBeatRecord)) {
      return false;
    }
  }
  return true;
}

/** Parse and validate a campaign JSON string. */
export function parseCampaign(json: string): CampaignSave {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('Invalid campaign JSON');
  }
  if (!raw || typeof raw !== 'object') {
    throw new Error('Campaign must be an object');
  }
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== SAVE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported save schemaVersion: ${String(o.schemaVersion)} (expected ${SAVE_SCHEMA_VERSION})`,
    );
  }
  if (typeof o.id !== 'string' || typeof o.title !== 'string') {
    throw new Error('Campaign missing id/title');
  }
  if (typeof o.createdAt !== 'string' || typeof o.updatedAt !== 'string') {
    throw new Error('Campaign missing timestamps');
  }
  if (!(o.playstylePackId === null || typeof o.playstylePackId === 'string')) {
    throw new Error('Invalid playstylePackId');
  }
  if (!Array.isArray(o.party) || !o.party.every(isCharacterSheet)) {
    throw new Error('Invalid party');
  }
  if (!isSessionState(o.session)) {
    throw new Error('Invalid session');
  }
  if (!o.flags || typeof o.flags !== 'object' || Array.isArray(o.flags)) {
    throw new Error('Invalid flags');
  }
  for (const v of Object.values(o.flags as Record<string, unknown>)) {
    const t = typeof v;
    if (t !== 'boolean' && t !== 'number' && t !== 'string') {
      throw new Error('Invalid flag value type');
    }
  }
  if (o.world !== undefined && o.world !== null) {
    if (!isCampaignWorldState(o.world)) {
      throw new Error('Invalid world');
    }
  }

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    id: o.id,
    title: o.title,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    playstylePackId: o.playstylePackId as string | null,
    party: o.party as CharacterSheet[],
    session: createEmptySession(o.session as SessionState),
    flags: { ...(o.flags as Record<string, CampaignFlagValue>) },
    world: normalizeWorld(
      o.world === undefined || o.world === null
        ? undefined
        : (o.world as CampaignWorldState),
    ),
  };
}

export async function saveCampaign(
  store: PersistStore,
  campaign: CampaignSave,
): Promise<void> {
  const touched = touchCampaign(campaign);
  await store.set(campaignSaveKey(touched.id), serializeCampaign(touched));
}

export async function loadCampaign(
  store: PersistStore,
  campaignId: string,
): Promise<CampaignSave | null> {
  const raw = await store.get(campaignSaveKey(campaignId));
  if (raw === null) return null;
  return parseCampaign(raw);
}

export async function deleteCampaign(
  store: PersistStore,
  campaignId: string,
): Promise<void> {
  await store.remove(campaignSaveKey(campaignId));
}
