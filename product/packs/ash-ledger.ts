import type { PlaystylePack } from './types';

/** Grittier resources; hard-edged fantasy. */
export const ashLedgerPack: PlaystylePack = {
  id: 'ash-ledger',
  displayName: 'Ash Ledger',
  description:
    'Gritty fantasy of debts, scars, and scarce mercies. Medium crunch with supply tracking, lingering wounds, and harsh rests.',
  allowCustomClasses: true,
  classes: [
    {
      id: 'debt-blade',
      name: 'Debt-Blade',
      hitDie: 10,
      summary: 'Steel bought on credit; every swing adds interest.',
    },
    {
      id: 'cinder-adept',
      name: 'Cinder-Adept',
      hitDie: 6,
      summary: 'Ash-mark rituals that cost flesh or favor.',
    },
    {
      id: 'scrounger',
      name: 'Scrounger',
      hitDie: 8,
      summary: 'Salvage, stealth, and knowing what others discard.',
    },
    {
      id: 'ledger-keeper',
      name: 'Ledger-Keeper',
      hitDie: 6,
      summary: 'Contracts, blackmail, and names written in soot.',
    },
    {
      id: 'ash-walker',
      name: 'Ash-Walker',
      hitDie: 8,
      summary: 'Endurance on poisoned roads and grey marches.',
    },
  ],
  tone: {
    summary:
      'Gritty and hard-edged: scarce resources, moral debts, survival without glorifying cruelty.',
    imageStyle:
      'desaturated ash and ember, worn gear, charcoal sketch fantasy, muted grey-orange palette',
  },
  resources: {
    crunch: 'medium',
    trackSupplies: true,
    trackWounds: true,
    heroicInspiration: false,
    restHarshness: 'harsh',
  },
  contentStubs: {
    openingBeat:
      'The ledger is open. Your name is already there — ink still wet, account unsettled.',
    continueBeat:
      'Ash drifts. The debt does not shout — it waits, patient as cold iron, for whatever you risk next.',
    customBeatPrefix: 'You press the moment.',
    customBeatFallback:
      'Scarce mercies rearrange themselves around what you did. Something is owed, or collected, before the dust settles.',
    narratorSystemHint:
      'Narrate scarcity and consequence. Victories cost something. Never gratuitous gore or NSFW.',
    aloneClause:
      'No one else claims your side of the ledger — not yet.',
    partyReadyOne: '{name} keeps pace, eyes on the cost.',
    partyReadyMany: 'Beside you: {names}.',
  },
};
