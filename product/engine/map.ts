import {
  touchCampaign,
  type CampaignSave,
  type SessionState,
} from './save';

/** Hierarchy kinds: region → locale → place → interior. */
export type MapNodeKind = 'region' | 'locale' | 'place' | 'interior';

export const MAP_KIND_ORDER: MapNodeKind[] = [
  'region',
  'locale',
  'place',
  'interior',
];

export type MapExit = {
  id: string;
  /** Player-facing exit label (e.g. "north", "down to the cellar"). */
  label: string;
  toNodeId: string;
};

export type MapNode = {
  id: string;
  kind: MapNodeKind;
  name: string;
  description: string;
  /** Parent in hierarchy; null only for the root region. */
  parentId: string | null;
  exits: MapExit[];
};

export type MapGraph = {
  id: string;
  title: string;
  startNodeId: string;
  nodes: Record<string, MapNode>;
};

export type MapPathPart = {
  id: string;
  name: string;
  kind: MapNodeKind;
};

export type WhereAmIExit = {
  id: string;
  label: string;
  toNodeId: string;
  toName: string;
};

export type WhereAmIResult = {
  nodeId: string;
  pathParts: MapPathPart[];
  /** Region › … › current */
  path: string;
  name: string;
  description: string;
  kind: MapNodeKind;
  exits: WhereAmIExit[];
  /**
   * Plain on-device line. Narrator may color this only when online;
   * the engine never invents colored prose here.
   */
  line: string;
};

export const STARTER_MAP_ID = 'starter-embervale';
export const PATH_SEPARATOR = ' › ';

const KIND_RANK: Record<MapNodeKind, number> = {
  region: 0,
  locale: 1,
  place: 2,
  interior: 3,
};

function assertNode(graph: MapGraph, nodeId: string): MapNode {
  const node = graph.nodes[nodeId];
  if (!node) {
    throw new Error(`Unknown map node: ${nodeId}`);
  }
  return node;
}

/** Look up a node or return null. */
export function getMapNode(
  graph: MapGraph,
  nodeId: string,
): MapNode | null {
  return graph.nodes[nodeId] ?? null;
}

/**
 * Walk parent chain from node → root, then reverse to region → leaf.
 */
export function buildMapPath(
  graph: MapGraph,
  nodeId: string,
): MapPathPart[] {
  const chain: MapPathPart[] = [];
  let current: string | null = nodeId;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current)) {
      throw new Error(`Cycle in map parent chain at ${current}`);
    }
    seen.add(current);
    const node = assertNode(graph, current);
    chain.push({ id: node.id, name: node.name, kind: node.kind });
    current = node.parentId;
  }
  return chain.reverse();
}

export function formatMapPath(parts: MapPathPart[]): string {
  return parts.map((p) => p.name).join(PATH_SEPARATOR);
}

export function listExits(
  graph: MapGraph,
  locationId: string,
): WhereAmIExit[] {
  const node = assertNode(graph, locationId);
  return node.exits.map((ex) => {
    const dest = assertNode(graph, ex.toNodeId);
    return {
      id: ex.id,
      label: ex.label,
      toNodeId: ex.toNodeId,
      toName: dest.name,
    };
  });
}

function buildWhereAmILine(
  name: string,
  path: string,
  exits: WhereAmIExit[],
): string {
  const exitBit =
    exits.length === 0
      ? 'No obvious exits.'
      : `Exits: ${exits.map((e) => e.label).join('; ')}.`;
  return `You are at ${name} (${path}). ${exitBit}`;
}

/**
 * On-device whereAmI: path + description + exits + plain line.
 * Does not call the narrator.
 */
export function whereAmI(
  graph: MapGraph,
  locationId: string,
): WhereAmIResult {
  const node = assertNode(graph, locationId);
  const pathParts = buildMapPath(graph, locationId);
  const path = formatMapPath(pathParts);
  const exits = listExits(graph, locationId);
  return {
    nodeId: node.id,
    pathParts,
    path,
    name: node.name,
    description: node.description,
    kind: node.kind,
    exits,
    line: buildWhereAmILine(node.name, path, exits),
  };
}

/** Travel via exit id from the current node. Returns destination id. */
export function travel(
  graph: MapGraph,
  fromId: string,
  exitId: string,
): string {
  const node = assertNode(graph, fromId);
  const exit = node.exits.find((e) => e.id === exitId);
  if (!exit) {
    throw new Error(`No exit "${exitId}" from ${fromId}`);
  }
  assertNode(graph, exit.toNodeId);
  return exit.toNodeId;
}

/** Travel via exit label (case-insensitive, trimmed). */
export function travelByLabel(
  graph: MapGraph,
  fromId: string,
  label: string,
): string {
  const node = assertNode(graph, fromId);
  const needle = label.trim().toLowerCase();
  const exit = node.exits.find((e) => e.label.trim().toLowerCase() === needle);
  if (!exit) {
    throw new Error(`No exit labeled "${label}" from ${fromId}`);
  }
  assertNode(graph, exit.toNodeId);
  return exit.toNodeId;
}

/** Update campaign session.locationId (touches updatedAt). */
export function setCampaignLocation(
  campaign: CampaignSave,
  locationId: string | null,
): CampaignSave {
  const session: SessionState = {
    ...campaign.session,
    locationId,
  };
  return touchCampaign({ ...campaign, session });
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

/** Lightweight structural validation for tests / loaders. */
export function validateMapGraph(graph: MapGraph): string[] {
  const errors: string[] = [];
  if (!graph.nodes[graph.startNodeId]) {
    errors.push(`startNodeId missing: ${graph.startNodeId}`);
  }
  for (const node of Object.values(graph.nodes)) {
    if (node.parentId === null) {
      if (node.kind !== 'region') {
        errors.push(`Root node ${node.id} must be region`);
      }
    } else if (!graph.nodes[node.parentId]) {
      errors.push(`Node ${node.id} parent missing: ${node.parentId}`);
    } else {
      const parent = graph.nodes[node.parentId]!;
      if (KIND_RANK[node.kind] !== KIND_RANK[parent.kind] + 1) {
        errors.push(
          `Node ${node.id} kind ${node.kind} cannot parent under ${parent.kind}`,
        );
      }
    }
    for (const ex of node.exits) {
      if (!graph.nodes[ex.toNodeId]) {
        errors.push(`Exit ${ex.id} on ${node.id} → missing ${ex.toNodeId}`);
      }
    }
  }
  return errors;
}

function node(
  id: string,
  kind: MapNodeKind,
  name: string,
  description: string,
  parentId: string | null,
  exits: MapExit[],
): MapNode {
  return { id, kind, name, description, parentId, exits };
}

function exit(id: string, label: string, toNodeId: string): MapExit {
  return { id, label, toNodeId };
}

/**
 * Sample starter map — original generic fantasy (no WotC IP).
 * Hierarchy: Embervale → Emberford / Ashen Fields → places → interiors.
 */
export function createStarterMap(): MapGraph {
  const nodes: Record<string, MapNode> = {
    'region.embervale': node(
      'region.embervale',
      'region',
      'Embervale',
      'A broad river vale of mill towns, hedgerows, and old watch-stones.',
      null,
      [
        exit('to-emberford', 'into Emberford', 'locale.emberford'),
        exit('to-ashen', 'out to the Ashen Fields', 'locale.ashen-fields'),
      ],
    ),
    'locale.emberford': node(
      'locale.emberford',
      'locale',
      'Emberford',
      'A riverside town of brick chimneys, market stalls, and friendly noise.',
      'region.embervale',
      [
        exit('to-region', 'leave town for the vale', 'region.embervale'),
        exit('to-kettle', 'enter The Copper Kettle', 'place.copper-kettle'),
        exit('to-smith', 'visit Brightanvil Smithy', 'place.brightanvil'),
        exit('to-alchemist', 'visit Mossglass Alchemist', 'place.mossglass'),
        exit('to-fields', 'road to Ashen Fields', 'locale.ashen-fields'),
      ],
    ),
    'locale.ashen-fields': node(
      'locale.ashen-fields',
      'locale',
      'Ashen Fields',
      'Open farmland dusted with pale soil; scarecrows lean against the wind.',
      'region.embervale',
      [
        exit('to-region', 'back toward the vale road', 'region.embervale'),
        exit('to-emberford', 'road to Emberford', 'locale.emberford'),
      ],
    ),
    'place.copper-kettle': node(
      'place.copper-kettle',
      'place',
      'The Copper Kettle',
      'A timber inn with a copper kettle over the door and warm hearth-smoke.',
      'locale.emberford',
      [
        exit('to-street', 'step out to Emberford', 'locale.emberford'),
        exit('to-common', 'into the common room', 'interior.kettle-common'),
        exit('to-cellar', 'down to the cellar', 'interior.kettle-cellar'),
      ],
    ),
    'place.brightanvil': node(
      'place.brightanvil',
      'place',
      'Brightanvil Smithy',
      'An open forge-yard where hammers ring and sparks leap from the anvil.',
      'locale.emberford',
      [
        exit('to-street', 'return to Emberford streets', 'locale.emberford'),
        exit('to-forge', 'onto the forge floor', 'interior.smith-forge'),
      ],
    ),
    'place.mossglass': node(
      'place.mossglass',
      'place',
      'Mossglass Alchemist',
      'A narrow shop of green bottles, drying herbs, and soft green-glass lamps.',
      'locale.emberford',
      [
        exit('to-street', 'return to Emberford streets', 'locale.emberford'),
        exit('to-counter', 'approach the counter', 'interior.alchemist-counter'),
      ],
    ),
    'interior.kettle-common': node(
      'interior.kettle-common',
      'interior',
      'Common Room',
      'Benches, a long bar, and a hearth big enough to dry wet cloaks.',
      'place.copper-kettle',
      [
        exit('to-inn', 'back to the inn threshold', 'place.copper-kettle'),
        exit('to-cellar', 'cellar stairs', 'interior.kettle-cellar'),
      ],
    ),
    'interior.kettle-cellar': node(
      'interior.kettle-cellar',
      'interior',
      'Inn Cellar',
      'Cool stone, casks of cider, and a locked chest that smells of old spice.',
      'place.copper-kettle',
      [
        exit('to-inn', 'up to the inn', 'place.copper-kettle'),
        exit('to-common', 'up to the common room', 'interior.kettle-common'),
      ],
    ),
    'interior.smith-forge': node(
      'interior.smith-forge',
      'interior',
      'Forge Floor',
      'Heat, bellows, and racks of unfinished blades and horseshoes.',
      'place.brightanvil',
      [exit('to-smith', 'out to the smithy yard', 'place.brightanvil')],
    ),
    'interior.alchemist-counter': node(
      'interior.alchemist-counter',
      'interior',
      'Shop Counter',
      'A polished counter with labeled vials and a ledger of careful prices.',
      'place.mossglass',
      [exit('to-shop', 'back into the shop front', 'place.mossglass')],
    ),
  };

  return {
    id: STARTER_MAP_ID,
    title: 'Embervale Starter',
    startNodeId: 'interior.kettle-common',
    nodes,
  };
}
