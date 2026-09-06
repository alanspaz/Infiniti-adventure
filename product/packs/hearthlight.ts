import type { PlaystylePack } from './types';

/** Warm heroic fantasy; medium crunch. */
export const hearthlightPack: PlaystylePack = {
  id: 'hearthlight',
  displayName: 'Hearthlight',
  description:
    'Warm heroic fantasy — courage, camaraderie, and hope at the fireside. Medium rules crunch with generous rests and heroic inspiration.',
  allowCustomClasses: true,
  classes: [
    {
      id: 'warden',
      name: 'Warden',
      hitDie: 10,
      summary: 'Shield and spear for the people who cannot fight.',
    },
    {
      id: 'hearth-mage',
      name: 'Hearth-Mage',
      hitDie: 6,
      summary: 'Hearthfire cantrips and protective wards.',
    },
    {
      id: 'pathfinder',
      name: 'Pathfinder',
      hitDie: 8,
      summary: 'Trailcraft, keen senses, and a ready bow.',
    },
    {
      id: 'oath-singer',
      name: 'Oath-Singer',
      hitDie: 8,
      summary: 'Songs that steel allies and soften foes.',
    },
    {
      id: 'remedy',
      name: 'Remedy',
      hitDie: 8,
      summary: 'Herbs, stitches, and quiet courage in the dark.',
    },
  ],
  tone: {
    summary:
      'Warm heroic: earnest stakes, found family, light in the gloom without denying danger.',
    imageStyle:
      'soft golden firelight, hopeful faces, hand-painted fantasy illustration, warm amber palette',
  },
  resources: {
    crunch: 'medium',
    trackSupplies: false,
    trackWounds: false,
    heroicInspiration: true,
    restHarshness: 'generous',
  },
  contentStubs: {
    openingBeat:
      'You wake to the smell of woodsmoke and bread. Someone left a place for you by the hearth.',
    continueBeat:
      'Embers settle. Beyond the firelight, the road and the quiet still wait for your next kindness — or your next stand.',
    customBeatPrefix: 'You act.',
    customBeatFallback:
      'The world answers in small mercies and clearer edges. What you chose leaves a mark the hearth will remember.',
    narratorSystemHint:
      'Narrate with warmth and agency. Celebrate small kindnesses. Danger is real but hope is earned.',
    aloneClause:
      'For now, you walk alone — and that is enough to begin.',
    partyReadyOne: '{name} stands ready beside you.',
    partyReadyMany: 'With you: {names}.',
  },
};
