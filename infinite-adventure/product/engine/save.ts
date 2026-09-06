import { CharacterSheet, Party } from './types';
import {
  PersistStore,
  campaignSaveKey,
} from './persist';

export const SAVE_SCHEMA_VERSION = 1 as const;

export type SessionState = {
  /** Non-negative turn counter. */
  turn: number;
  /** Current place id (map graph node). */
  locationId: string | null;
  /** Short offline-safe summary of recent events. */
  logSummary: string;
  /** Optional seed for reproducible dice. */
  rngSeed: number | null;
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
};

export type CreateCampaignInput = {
  id: string;
  title?: string;
  createdAt?: string;
  playstylePackId?: string | null;
  party?: Party;
  session?: Partial<SessionState>;
  flags?: Record<string, CampaignFlagValue>;
};

function isoNow(): string {
  return new Date().toISOString();
}

export function createEmptySession(
  patch?: Partial<SessionState>,
): SessionState {
  return {
    turn: Math.max(0, Math.floor(patch?.turn ?? 0)),
    locationId: patch?.locationId ?? null,
    logSummary: patch?.logSummary ?? '',
    rngSeed: patch?.rngSeed === undefined ? null : patch.rngSeed,
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

function isSessionState(value: unknown): value is SessionState {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.turn === 'number' &&
    (s.locationId === null || typeof s.locationId === 'string') &&
    typeof s.logSummary === 'string' &&
    (s.rngSeed === null || typeof s.rngSeed === 'number')
  );
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

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    id: o.id,
    title: o.title,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    playstylePackId: o.playstylePackId as string | null,
    party: o.party as CharacterSheet[],
    session: o.session,
    flags: { ...(o.flags as Record<string, CampaignFlagValue>) },
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
