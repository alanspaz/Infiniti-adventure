/**
 * Best-effort campaign save/load for the app shell.
 * Uses AsyncPersistStore; failures are swallowed by callers that choose to.
 */
import {
  ACTIVE_CAMPAIGN_KEY,
  type CampaignSave,
  deleteCampaign,
  loadCampaign,
  saveCampaign,
  type PersistStore,
} from '../../engine';
import { getAppPersistStore } from './appPersistStore';

export async function getActiveCampaignId(
  store: PersistStore = getAppPersistStore(),
): Promise<string | null> {
  return store.get(ACTIVE_CAMPAIGN_KEY);
}

export async function setActiveCampaignId(
  campaignId: string | null,
  store: PersistStore = getAppPersistStore(),
): Promise<void> {
  if (campaignId === null) {
    await store.remove(ACTIVE_CAMPAIGN_KEY);
  } else {
    await store.set(ACTIVE_CAMPAIGN_KEY, campaignId);
  }
}

/** Persist campaign blob and mark it as the active continue target. */
export async function persistCampaign(
  campaign: CampaignSave,
  store: PersistStore = getAppPersistStore(),
): Promise<CampaignSave> {
  await saveCampaign(store, campaign);
  await setActiveCampaignId(campaign.id, store);
  // saveCampaign touches updatedAt — reload so caller has durable shape
  const loaded = await loadCampaign(store, campaign.id);
  return loaded ?? campaign;
}

/** Load the active campaign for Home continue, or null. */
export async function loadActiveCampaign(
  store: PersistStore = getAppPersistStore(),
): Promise<CampaignSave | null> {
  const id = await getActiveCampaignId(store);
  if (!id) return null;
  return loadCampaign(store, id);
}

export async function clearActiveCampaign(
  store: PersistStore = getAppPersistStore(),
): Promise<void> {
  const id = await getActiveCampaignId(store);
  if (id) {
    await deleteCampaign(store, id);
  }
  await setActiveCampaignId(null, store);
}
