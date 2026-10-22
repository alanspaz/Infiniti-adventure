/**
 * Map ↔ save glue (moving the campaign). The graph itself lives in mapGraph.ts.
 */
import { normalizeChronicle, recordArrival } from './chronicle';
import { recordCtxFor } from './narration/voice';
import { assertNode, createStarterMap, travel, type MapGraph } from './mapGraph';
import {
  touchCampaign,
  type CampaignSave,
  type SessionState,
} from './save';

export * from './mapGraph';

/** Update campaign session.locationId (touches updatedAt). */
export function setCampaignLocation(
  campaign: CampaignSave,
  locationId: string | null,
): CampaignSave {
  const session: SessionState = {
    ...campaign.session,
    locationId,
  };
  // TABS-01: every arrival is recorded (visited place, people here, what they mention).
  const world =
    campaign.world && locationId
      ? {
          ...campaign.world,
          chronicle: recordArrival(
            normalizeChronicle(campaign.world.chronicle),
            locationId,
            session.turn,
            recordCtxFor(campaign.id, campaign.playstylePackId),
          ),
        }
      : campaign.world;
  return touchCampaign({ ...campaign, session, ...(world ? { world } : {}) });
}

/** Place campaign at a graph's start node. */
export function placeCampaignAtMapStart(
  campaign: CampaignSave,
  graph: MapGraph = createStarterMap(),
): CampaignSave {
  assertNode(graph, graph.startNodeId);
  return setCampaignLocation(campaign, graph.startNodeId);
}

/** Travel and update campaign location in one step. */
export function travelCampaign(
  campaign: CampaignSave,
  graph: MapGraph,
  exitId: string,
): CampaignSave {
  const from = campaign.session.locationId;
  if (!from) {
    throw new Error('Campaign has no locationId');
  }
  const to = travel(graph, from, exitId);
  return setCampaignLocation(campaign, to);
}

