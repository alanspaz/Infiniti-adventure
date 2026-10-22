/**
 * NARR-04 — Offline stub narrator line banks (wording only; Coder wires it).
 * Paste target suggestion: product/engine/narration/lineBanks.ts
 *
 * HARD RULES (enforced by tests in wiring-notes.md):
 *  - No digits anywhere in these strings. Numbers live in the mechanics line only.
 *  - No "Nearby:" / "Exits:" lists. No raw node ids.
 *  - Every path has >= 3 variants (wait / look / arrival have more).
 *  - Only real places, NPCs (Hollis, Dagna, Fennick — engine/npcs.ts), foes and items from the 90524e0 engine
 *    (re-inventoried after TABS-01; prose banks unchanged from the 6308a8f pass, chronicle/tab banks added at the end).
 *  - No NSFW, no WotC / D&D / 5e names.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TOKEN MAP  ({token} → real CampaignState / engine source)
 * ─────────────────────────────────────────────────────────────────────────────
 *  {place}       placeRef(map.get(session.locationId).name)  e.g. "the Common Room", "Emberford", "The Copper Kettle"
 *  {name}        character.name  (party[0]; used only in level-up)
 *  {companions}  joined names of party.slice(1) (companions only)  e.g. "Rook" / "Rook and Mara"
 *                → only in lines with when.companions === true
 *  {keeper}      merchant first name: MERCHANTS[shop.activeMerchantId].keeper.split(' ')[0]  → Hollis | Dagna | Fennick
 *  {item}        item.name.toLowerCase()  (the item actually bought/sold/used/equipped/dropped)
 *  {foe}         'the ' + combat.foe.name.toLowerCase()  e.g. "the ash wolf"  (generic foe banks only)
 *  {Foe}         same as {foe}, sentence-initial capital: "The ash wolf"
 *  {weapon}      weaponPhrase(equipped weapon): "your shortsword" | "your dagger" | "your fists" (unarmed)
 *                → always used as an OBJECT ("You drive {weapon} …"), never as a verb subject
 *  {loot}        combat victory loot item name, lowercased ("straw charm") → only in lines with needs:['loot']
 *  {questTitle}  quest.title for SCRIPTED quests only (STARTER_QUEST "First steps"); never for player-typed quests
 *
 *  Numbers (XP, gold, prices, HP, dice, level, ability points) are NEVER tokens here.
 *  They go to formatMechanicsLine() (spec at bottom of file).
 *
 * CONDITION TAGS (all optional; untagged lines are always eligible)
 *  pack         campaign.playstylePackId
 *  hpLow        combat.hp / combat.maxHp <= 0.5   (combat.hp is the persistent player HP, in or out of combat)
 *  companions   true ⇔ party.length > 1 ; false ⇔ alone
 *  recentEvent  ENGINE GAP — derive from a new flag `narr.lastEvent` (+ `narr.lastEventTurn`, valid for 1 turn):
 *                 justArrived (travel arrived) · justFought (victory or fled) · justLost (defeat) ·
 *                 justTraded (buy/sell) · justRested (short/long rest) · justWaited (ambient wait)
 *  timeOfDay    ENGINE GAP — no clock exists at 90524e0 either. Lines tagged timeOfDay are INERT until the engine
 *               exposes one; the selector must treat "field absent" as "tag never matches".
 *  hearth       derived from flags ambient.hearthFuel (0..4) at interior.kettle-common: 'bright' (3-4) · 'low' (1-2) · 'out' (0)
 *  quest        quest id that must be status 'active' (e.g. 'quest-first-steps')
 *  needs        extra data that must be present: 'loot' (foe dropped an item) · 'goldLost' (defeat took coin) ·
 *               'goldGained' (victory paid coin)
 *
 * COMPOSITION BY VERBOSITY (see voice-guide.md)
 *  short    = lead + hook                 (1–2 sentences)
 *  standard = lead + body + hook          (2–4 sentences; body optional)
 *  lush     = lead + body + detail + hook (4–6; detail = one pick from LOCATION_DETAILS[locationId], plus
 *             HEARTH_STATE line at the Common Room)
 *  Missing hook → composition just ends after the last present part.
 */

export type PackKey = 'hearthlight' | 'ash-ledger';
export type RecentEvent = 'justArrived' | 'justFought' | 'justLost' | 'justTraded' | 'justRested' | 'justWaited';
export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';
export type HearthState = 'bright' | 'low' | 'out';
export type LineNeed = 'loot' | 'goldLost' | 'goldGained';

export type LineCond = {
  pack?: PackKey;
  hpLow?: boolean;
  companions?: boolean;
  recentEvent?: RecentEvent | RecentEvent[];
  timeOfDay?: TimeOfDay; // inert until the engine has a clock
  hearth?: HearthState;
  quest?: string;
  needs?: LineNeed[];
  /* ── added at 90524e0 for the chronicle / NPC-hint banks (TABS-01) ── */
  /** chronicle.places[placeId].status for the place a hint is ABOUT: absent → 'unknown'. */
  placeSeen?: PlaceSeen;
  /** true ⇔ chronicle.npcs[npcId] already existed before this beat (repeat visit). */
  metBefore?: boolean;
  /** true ⇔ a 'victory' deed was recorded at the place the hint is about (chronicle.places[id].notes has the victory note). */
  wonThere?: boolean;
  /** quest id that must be status 'done'. */
  questDone?: string;
};
export type PlaceSeen = 'unknown' | 'known' | 'visited';

export type Line = {
  /** Stable id — anti-repeat stores the last id per path. */
  id: string;
  lead: string;
  body?: string;
  hook?: string;
  when?: LineCond;
};

export type Bank = readonly Line[];
export type NodeId =
  | 'region.embervale'
  | 'locale.emberford'
  | 'locale.ashen-fields'
  | 'place.copper-kettle'
  | 'place.brightanvil'
  | 'place.mossglass'
  | 'interior.kettle-common'
  | 'interior.kettle-cellar'
  | 'interior.smith-forge'
  | 'interior.alchemist-counter';
export type MerchantId = 'merchant.kettle' | 'merchant.brightanvil' | 'merchant.mossglass';
export type FoeId = 'foe.ash-wolf' | 'foe.scarecrow-husk' | 'foe.road-bandit' | 'foe.cellar-rat' | 'foe.ruffian';

/* ═══════════════════════════ OPENING / CONTINUE ═══════════════════════════ */

/** Opening keeps each pack's existing openingBeat verbatim as variant 0. */
export const OPENING: Bank = [
  { id: 'open.hl.0', when: { pack: 'hearthlight' }, lead: `You wake to the smell of woodsmoke and bread. Someone left a place for you by the hearth.`, hook: `Hollis is already at the bar, and the morning hasn't asked anything of you yet.` },
  { id: 'open.hl.1', when: { pack: 'hearthlight' }, lead: `You wake on a bench in the Common Room with a blanket you don't remember pulling up.`, body: `The hearth is going and the benches smell of bread.`, hook: `Hollis glances over from the bar like he's been waiting to say good morning.` },
  { id: 'open.hl.2', when: { pack: 'hearthlight' }, lead: `Woodsmoke, bread, and a hearth big enough to dry a wet cloak: you've landed somewhere kind.`, hook: `The inn door opens onto Emberford, and the cellar stairs drop away behind the bar.` },
  { id: 'open.al.0', when: { pack: 'ash-ledger' }, lead: `The ledger is open. Your name is already there — ink still wet, account unsettled.`, hook: `Hollis chalks something on the board behind the bar and doesn't say what.` },
  { id: 'open.al.1', when: { pack: 'ash-ledger' }, lead: `You wake in the Common Room with cold ash on your boots and an empty cup by your hand.`, body: `Hollis has drawn a line on his chalk board. Your name is next to it.`, hook: `Emberford is through the inn door. Whatever you owe, it starts there.` },
  { id: 'open.al.2', when: { pack: 'ash-ledger' }, lead: `Bench, long bar, a hearth burning someone else's wood.`, body: `You've been here long enough to be noticed, not long enough to be trusted.`, hook: `Down the cellar stairs, something scratches at the casks.` },
];

/** beat === 'continue' (resume / "go on" with no action). */
export const CONTINUE: Bank = [
  { id: 'cont.hl.0', when: { pack: 'hearthlight' }, lead: `Embers settle.`, body: `Somewhere past the firelight the road is still out there.`, hook: `It'll keep for one more kindness, or one more stand.` },
  { id: 'cont.hl.1', when: { pack: 'hearthlight' }, lead: `You pick up where you left off at {place}.`, hook: `Nothing's been lost while you caught your breath.` },
  { id: 'cont.hl.2', when: { pack: 'hearthlight', companions: true }, lead: `You glance at {companions}. Everyone's ready when you are.`, hook: `You're still at {place}.` },
  { id: 'cont.al.0', when: { pack: 'ash-ledger' }, lead: `Ash drifts.`, body: `The debt doesn't shout. It waits like cold iron for whatever you risk next.`, hook: `You're still at {place}.` },
  { id: 'cont.al.1', when: { pack: 'ash-ledger' }, lead: `You're back at {place}, and nothing got cheaper while you were away.` },
  { id: 'cont.al.2', when: { pack: 'ash-ledger', companions: true }, lead: `You and {companions} count what's left. It isn't much.`, hook: `You're still at {place}.` },
  { id: 'cont.any.0', lead: `You take stock at {place}.`, hook: `Same exits, same faces, and you're a little steadier for the pause.` },
];

/* ═══════════════════════════════ LOCATIONS ═══════════════════════════════ */

/** Arrival (travelOutcome === 'arrived'). Replaces proseForArrival. ≥4 per node. */
export const ARRIVAL: Record<NodeId, Bank> = {
  'region.embervale': [
    { id: 'arr.vale.0', lead: `The hedgerows open and Embervale spreads out ahead: river light, mill towns, old watch-stones on the rises.`, hook: `The road runs on into Emberford, or out toward the Ashen Fields.` },
    { id: 'arr.vale.1', lead: `You come out onto the vale road.`, body: `Mill smoke drifts over the river and a watch-stone leans at the verge, older than anyone's memory.`, hook: `Wolves and road bandits both use this road. Keep moving, or keep your guard up.` },
    { id: 'arr.vale.2', lead: `Embervale, wide and green, with the river running through it.`, body: `Somebody built those watch-stones because the road needed watching.`, hook: `Emberford's chimneys are close. The Ashen Fields are the other way.` },
    { id: 'arr.vale.3', when: { pack: 'ash-ledger' }, lead: `You reach the open vale. It's a long way to cover with a thin purse.`, body: `The watch-stones stand empty. Nobody pays a watchman out here anymore.`, hook: `Bandits work this road. So do the wolves.` },
    { id: 'arr.vale.4', when: { companions: true }, lead: `You and {companions} come out onto the vale road, the river bright below.`, hook: `Emberford lies one way and the Ashen Fields the other. Someone has to pick.` },
  ],
  'locale.emberford': [
    { id: 'arr.ford.0', lead: `Emberford greets you with noise: market stalls, brick chimneys, a river slapping at the quay.`, hook: `The Copper Kettle's sign creaks over one door. Down the street, a hammer rings at Brightanvil and green lamps glow at Mossglass.` },
    { id: 'arr.ford.1', lead: `You walk into Emberford as the market's in full voice.`, body: `Someone's frying dough, and someone else is arguing about the price of it.`, hook: `Inn, smithy, alchemist, all within shouting distance. Or the road out to the vale or the Ashen Fields.` },
    { id: 'arr.ford.2', lead: `Brick chimneys, wet cobbles, friendly noise: Emberford.`, body: `A watchman nods at you like you've always been here.`, hook: `The Kettle for a meal, Brightanvil for steel, Mossglass for anything that needs mending.` },
    { id: 'arr.ford.3', when: { pack: 'ash-ledger' }, lead: `Emberford is loud and cheerful, which means everyone in it is selling something.`, hook: `Hollis at the Kettle, Dagna at Brightanvil, Fennick at Mossglass. Every one of them will want coin first.` },
    { id: 'arr.ford.4', when: { hpLow: true }, lead: `You limp into Emberford, and the market noise is almost too much.`, hook: `Mossglass is just down the street, its green lamps lit. So is the Kettle's hearth.` },
  ],
  'locale.ashen-fields': [
    { id: 'arr.ash.0', lead: `The road gives out onto open farmland dusted pale, and scarecrows lean into the wind.`, hook: `Not all of them are leaning the same way. Out here, ash wolves hunt the furrows.` },
    { id: 'arr.ash.1', lead: `You step into the Ashen Fields.`, body: `Pale soil lifts on the wind and settles on your boots. A scarecrow's sackcloth head turns as you pass. It's only the wind, probably.`, hook: `The road back to Emberford is clear behind you, if you want it.` },
    { id: 'arr.ash.2', lead: `Flat fields, pale dust, and a quiet that has a listening edge to it.`, body: `Somewhere out there a crow lifts off a fence post and doesn't come back.`, hook: `Trouble is easy to find here if you go looking for it.` },
    { id: 'arr.ash.3', when: { pack: 'hearthlight' }, lead: `The Ashen Fields open around you, wide and pale under a big sky.`, body: `Someone farmed this land with care once. The scarecrows remember.`, hook: `If something's troubling these fields, you're here now.` },
    { id: 'arr.ash.4', when: { pack: 'ash-ledger' }, lead: `Ash-pale furrows, and nobody working them.`, body: `What's left of the crop isn't worth stealing. Whatever hunts here isn't after the crop.`, hook: `The road to Emberford is at your back, and the vale road runs off the other way.` },
    { id: 'arr.ash.5', when: { companions: true }, lead: `You and {companions} walk out into the Ashen Fields, pale dust ghosting around your ankles.`, hook: `A scarecrow ahead turns its head. Nobody wants to be the first to mention it.` },
  ],
  'place.copper-kettle': [
    { id: 'arr.kettle.0', lead: `The Copper Kettle: timber walls, warm smoke, and the namesake kettle hanging over the door, ticking as it cools.`, hook: `The common room is through the door. The cellar is down the back stairs.` },
    { id: 'arr.kettle.1', lead: `You duck under the copper kettle and into the warmth of the inn.`, body: `A laugh rolls out from the common room. Hollis is somewhere close by. You can hear him.`, hook: `Benches and the hearth are inside, and the street is behind you.` },
    { id: 'arr.kettle.2', lead: `Hearth-smoke and bread on the air: you're at the Kettle.`, body: `Boots scrape the timber step as someone leaves full and happy.`, hook: `Hollis keeps a shelf for travellers, and the common room keeps a fire.` },
    { id: 'arr.kettle.3', when: { hpLow: true }, lead: `You make it to the Kettle's door, and the warmth hits you like a hand on your back.`, hook: `The common room hearth is right through there. So is Hollis.` },
    { id: 'arr.kettle.4', when: { pack: 'ash-ledger' }, lead: `The Copper Kettle. Warm enough inside, if you can pay to stay.`, hook: `Hollis's chalk board hangs by the common room door.` },
  ],
  'place.brightanvil': [
    { id: 'arr.smithy.0', lead: `Brightanvil's forge-yard rings with hammer blows, and sparks leap off the anvil in bright arcs.`, hook: `Dagna doesn't look up. Past her, the forge floor glows.` },
    { id: 'arr.smithy.1', lead: `Heat rolls out to meet you at Brightanvil Smithy.`, body: `An apprentice swaps tongs and keeps his eyes on the work.`, hook: `Dagna's rack of blades and shields is in plain view, and so is her look that says coin first.` },
    { id: 'arr.smithy.2', lead: `Three hammer falls, a breath, three more: Brightanvil keeps its own time.`, hook: `Dagna sets the rhythm. The forge floor is right behind her.` },
    { id: 'arr.smithy.3', when: { pack: 'ash-ledger' }, lead: `Brightanvil: honest iron at honest prices, which still means expensive.`, hook: `Dagna is already weighing your gear with one glance.` },
  ],
  'place.mossglass': [
    { id: 'arr.moss.0', lead: `Mossglass is narrow and green: bottles on every shelf, herbs drying on strings, lamps glowing through green glass.`, hook: `At the polished counter in back, Fennick turns a ledger page.` },
    { id: 'arr.moss.1', lead: `The door chime sounds once as you step into Mossglass Alchemist.`, body: `It smells of leaf and glass and something bitter that's probably good for you.`, hook: `The counter is a few steps in, and Fennick is already peering at you over it.` },
    { id: 'arr.moss.2', lead: `You step from the street into soft green light.`, body: `Every bottle here has a tidy label, and every label has a price.`, hook: `Fennick waits at the counter for you to come closer.` },
    { id: 'arr.moss.3', when: { hpLow: true }, lead: `You come into Mossglass bleeding, and Fennick notices before the door has finished swinging.`, hook: `The restoratives are at the counter.` },
  ],
  'interior.kettle-common': [
    { id: 'arr.common.0', lead: `The common room: benches, a long bar, and a hearth big enough to dry wet cloaks.`, hook: `Hollis is behind the bar, and the cellar stairs drop away in the corner.` },
    { id: 'arr.common.1', lead: `You step into the common room and the hearth's warmth finds you first.`, body: `Patrons murmur at the benches, and mugs stand in tidy rows on the bar.`, hook: `Hollis lifts his chin in greeting.` },
    { id: 'arr.common.2', lead: `Low voices, firelight, a long bar polished by years of elbows.`, hook: `The cellar stairs creak whenever someone walks past them. Hollis watches the room.` },
    { id: 'arr.common.3', when: { hearth: 'out' }, lead: `The common room is colder than it should be. The great hearth is only ash.`, hook: `Someone ought to feed it. Hollis is looking at you.` },
    { id: 'arr.common.4', when: { recentEvent: 'justLost' }, lead: `You're back in the common room, and every bench has gone quiet to look at you.`, hook: `Hollis is already pouring something.` },
  ],
  'interior.kettle-cellar': [
    { id: 'arr.cellar.0', lead: `You step down into the cellar: cool stone, casks of cider, and a locked chest that smells of old spice.`, hook: `Something scratches behind the casks, then stops.` },
    { id: 'arr.cellar.1', lead: `The cellar stairs creak you down into the dark.`, body: `Casks sweat in the cool, and the spice-chest's lock shines dully.`, hook: `In the far corner, something small and heavy moves.` },
    { id: 'arr.cellar.2', lead: `Cold stone underfoot, the smell of cider and oak.`, body: `Water drips somewhere, keeping its own time.`, hook: `Stairs lead back up to the inn and the common room. Something down here is breathing that isn't you.` },
    { id: 'arr.cellar.3', when: { pack: 'ash-ledger' }, lead: `Hollis's cellar: his cider, his spice-chest, his lock.`, hook: `And by the sound of it, his rats.` },
  ],
  'interior.smith-forge': [
    { id: 'arr.forge.0', lead: `The forge floor is all heat and bellows, with racks of unfinished blades and horseshoes along the walls.`, hook: `Dagna works the anvil. The yard door frames a cooler slice of Emberford.` },
    { id: 'arr.forge.1', lead: `You step onto the forge floor and the heat presses on your face.`, body: `The quench tub shivers as Dagna plunges something in. Steam boils up.`, hook: `She's selling, if you've got coin.` },
    { id: 'arr.forge.2', lead: `Coals settle, tongs scrape, and the hammer talks.`, hook: `Dagna's rack is in arm's reach, with the yard behind you.` },
  ],
  'interior.alchemist-counter': [
    { id: 'arr.counter.0', lead: `You step up to the polished counter, where labeled vials stand in careful ranks.`, hook: `Fennick's ledger lies open. The last line is still wet.` },
    { id: 'arr.counter.1', lead: `At the counter the green lamps hum and a pestle taps once in back.`, body: `Every price is written in the same exact hand.`, hook: `Fennick folds his hands and waits.` },
    { id: 'arr.counter.2', lead: `Close up, Mossglass smells of bitter herbs and clean glass.`, hook: `Fennick is ready to sell you a remedy. The shop front is behind you.` },
  ],
};

/** "Where am I" outside combat. Replaces proseForLocationHint. Exits woven in. */
export const WHERE_AM_I: Record<NodeId, Bank> = {
  'region.embervale': [
    { id: 'where.vale.0', lead: `You're in Embervale, the broad river vale, with mill towns and old watch-stones all around.`, hook: `The road runs into Emberford one way and out to the Ashen Fields the other.` },
    { id: 'where.vale.1', lead: `Embervale, out on the open road between hedgerows.`, hook: `Emberford is the nearest roof. Past it, the Ashen Fields.` },
    { id: 'where.vale.2', lead: `You're on the vale road with the river below you and a watch-stone leaning at the verge.`, hook: `Head into Emberford, or out toward the Ashen Fields.` },
  ],
  'locale.emberford': [
    { id: 'where.ford.0', lead: `You're in Emberford, a riverside town of brick chimneys and busy market stalls.`, hook: `The Copper Kettle, Brightanvil Smithy and Mossglass Alchemist are all on this street. The roads lead out to the vale and the Ashen Fields.` },
    { id: 'where.ford.1', lead: `Emberford's market street, loud and friendly.`, body: `The Kettle is for food and a bed, Brightanvil for steel, Mossglass for remedies.`, hook: `Or the road, toward the vale or the Ashen Fields.` },
    { id: 'where.ford.2', lead: `You're standing on Emberford's wet cobbles with the river at your back.`, hook: `Three doors you could knock on: the inn, the smithy, the alchemist. Two roads out of town.` },
  ],
  'locale.ashen-fields': [
    { id: 'where.ash.0', lead: `You're in the Ashen Fields: open farmland, pale soil, scarecrows leaning into the wind.`, hook: `The road to Emberford is one way, and the vale road the other.` },
    { id: 'where.ash.1', lead: `The Ashen Fields, out past the edge of town.`, body: `Ash wolves hunt here, and the scarecrows don't always stay still.`, hook: `Emberford or the vale road, whenever you're done here.` },
    { id: 'where.ash.2', lead: `Pale furrows in every direction: the Ashen Fields.`, hook: `Two roads lead out, back to Emberford or toward the vale.` },
  ],
  'place.copper-kettle': [
    { id: 'where.kettle.0', lead: `You're at the Copper Kettle's threshold, under the old kettle sign.`, hook: `The common room is inside, the cellar is down the back stairs, and Emberford's street is behind you.` },
    { id: 'where.kettle.1', lead: `The Copper Kettle, Emberford's timber inn.`, body: `Hollis keeps the bar and a shelf for travellers.`, hook: `Go in to the common room, down to the cellar, or back out to the street.` },
    { id: 'where.kettle.2', lead: `You're in the doorway of the Kettle with hearth-smoke at your back.`, hook: `Common room, cellar, or street. Your choice.` },
  ],
  'place.brightanvil': [
    { id: 'where.smithy.0', lead: `You're in Brightanvil Smithy's yard, where the hammers ring and sparks jump off the anvil.`, hook: `Dagna sells from her rack. The forge floor is behind her, and the Emberford streets are behind you.` },
    { id: 'where.smithy.1', lead: `Brightanvil, Dagna's forge-yard.`, hook: `Step onto the forge floor, or head back out to the streets.` },
    { id: 'where.smithy.2', lead: `You're standing in the heat of Brightanvil's open yard.`, hook: `Dagna is at the anvil. The forge floor and the street are each a few steps away.` },
  ],
  'place.mossglass': [
    { id: 'where.moss.0', lead: `You're in Mossglass Alchemist, a narrow shop of green bottles and drying herbs.`, hook: `Fennick's counter is in back, and the street door is behind you.` },
    { id: 'where.moss.1', lead: `Mossglass, Fennick's shop, all green glass and labelled vials.`, hook: `Approach the counter, or go back out to the streets.` },
    { id: 'where.moss.2', lead: `You're among the shelves at Mossglass, under the soft green lamps.`, hook: `The counter is ahead and the street is behind.` },
  ],
  'interior.kettle-common': [
    { id: 'where.common.0', lead: `You're in the Copper Kettle's common room: benches, a long bar, and a hearth big enough to dry a wet cloak.`, hook: `The inn threshold is one way out, and the cellar stairs are the other. Hollis keeps the bar.` },
    { id: 'where.common.1', lead: `The common room of the Copper Kettle, with Hollis behind the bar.`, hook: `Out through the threshold to the street, or down the cellar stairs.` },
    { id: 'where.common.2', lead: `You're by the hearth in the Kettle's common room.`, body: `Patrons murmur at the benches.`, hook: `The cellar stairs are in the corner. The front door leads back to the threshold.` },
  ],
  'interior.kettle-cellar': [
    { id: 'where.cellar.0', lead: `You're in the Kettle's cellar: cool stone, cider casks, a locked chest that smells of old spice.`, hook: `Stairs lead up to the inn threshold and the common room.` },
    { id: 'where.cellar.1', lead: `The inn cellar, under the Copper Kettle.`, body: `Something scratches behind the casks now and then.`, hook: `Two ways up: the inn, or straight to the common room.` },
    { id: 'where.cellar.2', lead: `You're underground among Hollis's casks.`, hook: `Up the stairs is the inn, and the common room is just beyond.` },
  ],
  'interior.smith-forge': [
    { id: 'where.forge.0', lead: `You're on Brightanvil's forge floor, among bellows and racks of unfinished blades and horseshoes.`, hook: `The only way out is back to the smithy yard.` },
    { id: 'where.forge.1', lead: `The forge floor, hot enough to make your eyes water.`, hook: `Dagna works here. The yard is behind you.` },
    { id: 'where.forge.2', lead: `You're deep in Brightanvil, where the heat lives.`, hook: `Step back out to the smithy yard whenever you like.` },
  ],
  'interior.alchemist-counter': [
    { id: 'where.counter.0', lead: `You're at the Mossglass shop counter, with labelled vials lined up and a ledger of careful prices.`, hook: `Fennick is right here. The shop front is behind you.` },
    { id: 'where.counter.1', lead: `Fennick's counter, polished and exact.`, hook: `Buy, sell, or head back into the shop front.` },
    { id: 'where.counter.2', lead: `You're leaning on the polished counter at Mossglass.`, hook: `The shop front and the street are behind you.` },
  ],
};

/** Generic where-am-I for any node not listed above. {place} only — no desc lists. */
export const WHERE_AM_I_FALLBACK: Bank = [
  { id: 'where.any.0', lead: `You're at {place}.`, hook: `The map shows the ways on from here.` },
  { id: 'where.any.1', lead: `This is {place}.`, hook: `Pick a direction you know and the road will show itself.` },
  { id: 'where.any.2', lead: `{place}, as far as you can tell.`, hook: `Name a place nearby and you can head for it.` },
];

/** In combat, "where am I" (input.ts WHERE_RE path). */
export const WHERE_AM_I_COMBAT: Bank = [
  { id: 'where.fight.0', lead: `You're at {place}, and {foe} is between you and every way out.`, hook: `Win, or flee.` },
  { id: 'where.fight.1', lead: `{place}. Not that it matters while {foe} is on you.`, hook: `You won't get to leave unless you flee.` },
  { id: 'where.fight.2', lead: `You're still at {place}, with {foe} closing in.`, hook: `There's no walking away from this. You can only break away.` },
];

/** Look / search the scene. Per node ≥4; generic fallback below. Replaces FLAVOR_POOLS.look. */
export const LOOK: Record<NodeId, Bank> = {
  'region.embervale': [
    { id: 'look.vale.0', lead: `You scan the vale. River, hedgerows, a mill wheel turning far off.`, hook: `A watch-stone on the nearest rise has a clear view of the road. Whoever kept it isn't there now.` },
    { id: 'look.vale.1', lead: `Hedgerows crowd the road on both sides, thick enough to hide a person.`, hook: `Bandits like that sort of cover.` },
    { id: 'look.vale.2', lead: `A heron lifts from the river shallows, unhurried.`, body: `Down the road, Emberford's chimney smoke gives the town away.`, hook: `In the other direction the land goes pale: the Ashen Fields.` },
    { id: 'look.vale.3', lead: `You crouch by the verge. There are cart ruts, and paw prints too big for a farm dog.`, hook: `Wolf, and recent.` },
  ],
  'locale.emberford': [
    { id: 'look.ford.0', lead: `Market stalls, brick chimneys, and a crowd that knows where it's going.`, hook: `A hammer rings three times from Brightanvil, as if answering you.` },
    { id: 'look.ford.1', lead: `The river slaps at the quay, and gulls argue over something best not examined.`, hook: `Green lamps glow at Mossglass across the street. The Kettle's door swings open on warm light.` },
    { id: 'look.ford.2', lead: `A watchman makes his slow round and nods as he passes.`, body: `Nobody here looks worried, which is its own kind of information.`, hook: `Whatever trouble there is, it's out on the roads, not in town.` },
    { id: 'look.ford.3', lead: `Puddles hold the chimneys upside down.`, hook: `The road out of town forks: the vale one way, the Ashen Fields the other.` },
  ],
  'locale.ashen-fields': [
    { id: 'look.ash.0', lead: `You study the furrows. The pale soil is scuffed with tracks, some of them not human.`, hook: `They lead toward the scarecrows.` },
    { id: 'look.ash.1', lead: `The nearest scarecrow's coat flaps once, though the wind has dropped.`, hook: `You watch it a beat too long.` },
    { id: 'look.ash.2', lead: `Clouds drag their shadows across the fields, and in the gap between two of them something grey slips along the hedge.`, hook: `Ash wolves hunt these fields. Go looking and you'll find one.` },
    { id: 'look.ash.3', lead: `A farm dog barks two fields over, then stops in the middle of a bark.`, body: `The road back to Emberford is empty and clear.`, hook: `It's quiet out here, too quiet for farmland.` },
  ],
  'place.copper-kettle': [
    { id: 'look.kettle.0', lead: `You look up at the copper kettle over the door. It's dented and green at the seams, and well loved.`, hook: `Warm noise leaks out from the common room.` },
    { id: 'look.kettle.1', lead: `Timber walls, a cloak hook, and a doorway worn smooth by boots.`, hook: `The back stairs creak down to the cellar. Something down there creaks back.` },
    { id: 'look.kettle.2', lead: `Hollis calls a name you don't know, and somebody laughs.`, body: `The place smells of bread and hearth-smoke.`, hook: `The common room is right through the door.` },
    { id: 'look.kettle.3', lead: `Rain-spotted copper, warm timber, the street noise at your back.`, hook: `Inside is warmth and Hollis's shelf of supplies for travellers.` },
  ],
  'place.brightanvil': [
    { id: 'look.smithy.0', lead: `Sparks leap off the anvil and die in the dirt of the yard.`, hook: `Dagna's rack hangs where you can't miss it: blades, a chain shirt, a sturdy shield.` },
    { id: 'look.smithy.1', lead: `An apprentice stacks cooled horseshoes and pretends not to watch you.`, hook: `Dagna watches you openly.` },
    { id: 'look.smithy.2', lead: `Quench steam hisses up and the coal glow paints the racks orange.`, hook: `The forge floor is through the back.` },
    { id: 'look.smithy.3', lead: `You look over the yard: heat, iron, honest work.`, hook: `Nothing here is decorative, and nothing here is cheap.` },
  ],
  'place.mossglass': [
    { id: 'look.moss.0', lead: `Green bottles catch the lamplight and herbs sway on their strings.`, hook: `In back, Fennick turns a ledger page without looking up.` },
    { id: 'look.moss.1', lead: `You read a few labels, all written in the same tidy hand.`, body: `There are restoratives, salves, and a hooded lantern hung by the door.`, hook: `The counter is where the buying happens.` },
    { id: 'look.moss.2', lead: `A cork sighs softly somewhere in back.`, hook: `The shop is narrow enough that Fennick can see every shelf from the counter, and you, too.` },
    { id: 'look.moss.3', lead: `The light here is soft and green, like being underwater in a pond.`, hook: `It's calming, until you read the prices.` },
  ],
  'interior.kettle-common': [
    { id: 'look.common.0', lead: `Patrons murmur at the benches, and the bar keeps its quiet inventory of mugs.`, hook: `Hollis catches your eye and tips his head toward the shelf behind him.` },
    { id: 'look.common.1', lead: `The hearth is big enough to roast a whole pig, or dry a dozen cloaks.`, hook: `Someone has left a few scraps of firewood stacked beside it.` },
    { id: 'look.common.2', lead: `You take in the long bar, the worn benches, the smoke-dark beams.`, body: `In the corner, the cellar door stands half open.`, hook: `A faint scratching comes up the stairs.` },
    { id: 'look.common.3', lead: `A cloak steams by the fire, and its owner snores at the nearest bench.`, hook: `Hollis is wiping the same patch of bar he wiped a minute ago. He's got time to talk.` },
    { id: 'look.common.4', when: { hearth: 'out' }, lead: `The hearth is grey ash and the room has gone cold around it.`, hook: `Feed it, and the room might warm to you too.` },
    { id: 'look.common.5', when: { companions: true }, lead: `You and {companions} claim the bench nearest the fire.`, body: `The room is warm and the bar is busy.`, hook: `Hollis is free, if anyone wants to ask him anything.` },
  ],
  'interior.kettle-cellar': [
    { id: 'look.cellar.0', lead: `Cider casks line the cool stone wall, sweating a little in the dark.`, hook: `Behind the third one something scratches, then goes still.` },
    { id: 'look.cellar.1', lead: `The spice-chest is locked tight, and its brass is worn bright from hands that tried it.`, hook: `Hollis keeps the key, presumably.` },
    { id: 'look.cellar.2', lead: `You let your eyes adjust. Drips, dust, oak and old spice.`, body: `There are droppings by the casks, and they're large.`, hook: `Whatever left them is bigger than a mouse.` },
    { id: 'look.cellar.3', lead: `The stairs up to the inn creak under nobody's weight.`, hook: `The cellar is listening back.` },
  ],
  'interior.smith-forge': [
    { id: 'look.forge.0', lead: `Racks of unfinished blades and horseshoes stand in honest rows.`, hook: `Dagna's finished work hangs nearer the anvil, priced and ready.` },
    { id: 'look.forge.1', lead: `The bellows breathe and the coals answer, white at the heart.`, hook: `The heat makes it hard to stay long. Buy, or step back out to the yard.` },
    { id: 'look.forge.2', lead: `Scale flakes from a billet as Dagna turns it on the anvil.`, hook: `She hasn't told you to leave, which counts as a welcome.` },
    { id: 'look.forge.3', lead: `The quench tub shivers with every hammer blow.`, hook: `Through the yard door, Emberford looks cool and far away.` },
  ],
  'interior.alchemist-counter': [
    { id: 'look.counter.0', lead: `Labelled vials stand in careful ranks: healing potion, greater healing potion, herbal salve.`, hook: `Fennick follows your gaze as if he's noting which one you look at longest.` },
    { id: 'look.counter.1', lead: `The ledger is open to a page of careful prices, and the ink of the last line is still damp.`, hook: `Fennick doesn't haggle. It says so in his posture.` },
    { id: 'look.counter.2', lead: `A pestle rests mid-task, and the green-glass lamps hum.`, hook: `Every bottle has a name. Fennick will tell you all of them, if you ask.` },
    { id: 'look.counter.3', lead: `The counter is polished so well you can see your face in it.`, body: `It's a tired face.`, hook: `There's a remedy for that, priced in the ledger.` },
  ],
};

export const LOOK_FALLBACK: Bank = [
  { id: 'look.any.0', lead: `You take your time and look properly at {place}.`, hook: `The way you came in is still there, and so are the ways on.` },
  { id: 'look.any.1', lead: `You stop and let {place} come into focus, one detail at a time.`, hook: `Nothing jumps at you. Nothing gets missed, either.` },
  { id: 'look.any.2', lead: `You study {place} the way a scout would: exits first, then cover, then people.`, hook: `Pick a direction you like.` },
  { id: 'look.any.3', when: { companions: true }, lead: `You and {companions} take stock of {place} together.`, hook: `Two sets of eyes and no surprises yet.` },
];

/** Lush-only extra sensory beat, one per beat, from the location's own description. ≥4 per node. */
export const LOCATION_DETAILS: Record<NodeId, readonly string[]> = {
  'region.embervale': [
    `Wind combs the hedgerows flat, then lets them go.`,
    `A cart's bell fades somewhere down the road.`,
    `Mill smoke drifts low over the river.`,
    `An old watch-stone leans at the verge, furred with moss on its north face.`,
  ],
  'locale.emberford': [
    `The river breeze carries wet brick and fried dough.`,
    `Market shutters clap open and shut down the row.`,
    `Lantern-hooks sway over the street.`,
    `Somewhere a smithy answers with three bright hammer falls.`,
  ],
  'locale.ashen-fields': [
    `Pale soil lifts on the wind and settles in the ruts.`,
    `Hedgerows tick with insects.`,
    `A crow lands on a fence post, looks at you, and decides against it.`,
    `Far off, the vale's watch-stones catch the light.`,
  ],
  'place.copper-kettle': [
    `The copper kettle over the door ticks as it cools.`,
    `Hearth-smoke thins into the street air.`,
    `Boot soles scrape the timber step.`,
    `The doorway smells of bread, ale and rain on copper.`,
  ],
  'place.brightanvil': [
    `The anvil rings a clean note.`,
    `Unfinished blades tick on the rack as they cool.`,
    `Heat rolls off the open forge in waves you can see.`,
    `Iron and coal smoke cling to your clothes.`,
  ],
  'place.mossglass': [
    `Drying herbs rustle on their strings.`,
    `A soft green lamp paints the narrow shelves.`,
    `Dust floats in a shaft of green light.`,
    `The air smells of leaf and glass.`,
  ],
  'interior.kettle-common': [
    `A log shifts in the hearth and sends a spray of sparks up the flue.`,
    `Mugs clink at the far end of the bar.`,
    `Wet cloaks steam on the hooks by the fire.`,
    `The benches are warm from the last people who sat on them.`,
  ],
  'interior.kettle-cellar': [
    `Casks tick as they settle.`,
    `A drip in the corner keeps slow time.`,
    `The air tastes of oak and old spice.`,
    `Your breath fogs, just barely.`,
  ],
  'interior.smith-forge': [
    `The bellows breathe in, and out.`,
    `Sweat runs into your collar.`,
    `Tongs scrape across the anvil's face.`,
    `Water in the quench tub shivers.`,
  ],
  'interior.alchemist-counter': [
    `Wax seals glint along the shelf.`,
    `A bitter herb note rises, then fades.`,
    `The green lamps hum faintly.`,
    `A pestle taps once in the back room.`,
  ],
};

/** Lush add-on at the Common Room, from ambient.hearthFuel. */
export const HEARTH_STATE: Record<HearthState, readonly string[]> = {
  bright: [`The hearth burns tall and steady.`, `Firelight reaches every bench.`, `Sparks climb the flue in a lazy stream.`],
  low: [`The hearth burns low, its glow pulled tight to the coals.`, `The fire has shrunk to a red murmur.`, `The room's edges have gone cool.`],
  out: [`The hearth is cold ash.`, `No fire, just the smell of one.`, `The chill has settled in where the fire used to be.`],
};

/* ═══════════════════════════════════ WAIT ═══════════════════════════════════ */
/*
 * Hearth (interior.kettle-common) keyed by the state hearthWaitProse() already computes.
 * Each state keeps the keyword the current ambient.test.ts regexes look for
 * (flicker / weaker / almost out / goes out|ash / stranger|scrap of wood|Flames catch).
 */
export const HEARTH_WAIT: Record<'steady' | 'fuel3' | 'fuel2' | 'fuel1' | 'out' | 'dead' | 'fedByStranger', Bank> = {
  steady: [
    { id: 'hw.steady.0', lead: `You wait by the hearth. The fire burns steady and warm, and sparks climb the flue.`, hook: `Hollis tops up a mug down the bar without being asked.` },
    { id: 'hw.steady.1', lead: `You sit with the fire a while. It's tall and generous, and your boots start to steam.`, hook: `Nobody's in a hurry here. That might be the point.` },
    { id: 'hw.steady.2', lead: `The hearth roars and the common room settles into its warmth.`, hook: `It's a good moment to ask Hollis what the town needs.` },
  ],
  fuel3: [
    { id: 'hw.f3.0', lead: `You wait. The fire flickers, bright one breath and shy the next, still holding the cold back.`, hook: `The wood stacked beside it won't feed itself.` },
    { id: 'hw.f3.1', lead: `The flames flicker and lean as the door opens and shuts.`, body: `Someone stamps in out of the weather.`, hook: `The fire will hold for a while, though not forever.` },
    { id: 'hw.f3.2', lead: `You let time pass. The fire flickers lower on one side, where the logs have burned through.`, hook: `A poke and a fresh log would fix it.` },
  ],
  fuel2: [
    { id: 'hw.f2.0', lead: `You wait again. The fire is weaker now, its glow shrinking toward the coals, and the room feels cooler.`, hook: `A patron pulls their cloak tighter and looks at the woodpile, then at you.` },
    { id: 'hw.f2.1', lead: `The hearth is weaker, and the shadows have crept in from the corners.`, hook: `Hollis glances at the fire and then at the bar. He's busy.` },
    { id: 'hw.f2.2', lead: `Time goes by and the fire grows weaker with it.`, body: `The benches nearest the hearth fill up.`, hook: `Someone should feed it.` },
  ],
  fuel1: [
    { id: 'hw.f1.0', lead: `You wait. The hearth is almost out, a few orange eyes in the ash and more smoke than flame.`, hook: `There's wood right there.` },
    { id: 'hw.f1.1', lead: `The fire is almost out. The common room is down to murmurs and cold hands.`, hook: `One more wait and it dies.` },
    { id: 'hw.f1.2', lead: `It's almost out now, just a red line under grey ash.`, hook: `Feed it, and the room might thank you.` },
  ],
  out: [
    { id: 'hw.out.0', lead: `You wait. The fire goes out. Only ash and the memory of warmth remain.`, hook: `Unless someone feeds it soon, the room stays cold.` },
    { id: 'hw.out.1', lead: `The last coal winks out, and the fire goes out with a soft tick of ash.`, hook: `A few patrons leave. The ones who stay are looking at the woodpile.` },
    { id: 'hw.out.2', lead: `The hearth goes out.`, body: `Cold creeps across the floorboards.`, hook: `There's still wood stacked beside it.` },
  ],
  dead: [
    { id: 'hw.dead.0', lead: `You wait beside a dead hearth. Ash ticks, and nobody comes to feed it.`, hook: `The cold has settled in for good, unless you do something about it.` },
    { id: 'hw.dead.1', lead: `The dead hearth stares back, all ash and cold.`, hook: `Even Hollis has stopped looking at it.` },
    { id: 'hw.dead.2', lead: `Cold ash, cold benches, a dead hearth.`, hook: `The common room has given up on the fire. Have you?` },
  ],
  fedByStranger: [
    { id: 'hw.fed.0', lead: `The hearth almost dies, and then a stranger leans in with a scrap of wood. Flames catch again, thin but alive.`, hook: `They nod at you and go back to their bench.` },
    { id: 'hw.fed.1', lead: `A stranger crouches by the dying fire and feeds it a scrap of wood, then another.`, body: `Flames catch and crawl up the bark.`, hook: `They don't say a word, but the room warms by a little.` },
    { id: 'hw.fed.2', lead: `Just before it dies, a stranger tosses a scrap of wood on the coals. Flames catch.`, hook: `The stranger doesn't do it twice. Next time it's on you.` },
  ],
};

/** Fuel / stoke at the hearth (hearthFuelProse). Keeps /feed|hearth|fire|coals/. */
export const HEARTH_FEED: Record<'full' | 'mid' | 'low', Bank> = {
  full: [
    { id: 'hf.full.0', lead: `You feed the hearth. The wood catches and heat rolls back into the common room as the fire stands tall again.`, hook: `Somebody at the benches raises a mug to you.` },
    { id: 'hf.full.1', lead: `You build the fire up properly, log on log, until it roars.`, hook: `Hollis nods once. From him that counts for a lot.` },
    { id: 'hf.full.2', lead: `The hearth takes the wood greedily and the whole room brightens.`, hook: `Cloaks come off and conversations start up again.` },
  ],
  mid: [
    { id: 'hf.mid.0', lead: `You poke the fire and feed it. Flames climb and the chill loosens its grip.`, hook: `Another log or two and it'll roar.` },
    { id: 'hf.mid.1', lead: `You feed the hearth a log and it catches with a crackle.`, hook: `It's better, if not yet good.` },
    { id: 'hf.mid.2', lead: `Fresh wood on hot coals. The fire takes heart.`, hook: `The nearest bench lets out a grateful sigh.` },
  ],
  low: [
    { id: 'hf.low.0', lead: `You coax the coals with fresh wood. Life comes back to the hearth, if only a little.`, hook: `It needs more than one log to really catch.` },
    { id: 'hf.low.1', lead: `You kneel and blow on the coals until a flame stands up.`, hook: `It's small, but it's a fire again.` },
    { id: 'hf.low.2', lead: `The hearth was nearly gone, but your wood takes, slowly.`, hook: `Keep it fed and the common room will warm to you.` },
  ],
};

/**
 * Per-location wait arcs. Engine already indexes by ambient.locWait.<id> step (1-based);
 * keep that ordering — progression doubles as anti-repeat. Cycle after the end.
 */
export const WAIT_ARCS: Record<Exclude<NodeId, 'interior.kettle-common'>, Bank> = {
  'place.copper-kettle': [
    { id: 'wait.kettle.0', lead: `You take a moment on the inn threshold. The copper kettle over the door ticks as it cools.`, hook: `A laugh rolls out of the common room.` },
    { id: 'wait.kettle.1', lead: `You wait at the Copper Kettle while boot soles scrape the timber step and someone pours another round inside.`, hook: `The cellar stairs creak, though nobody is on them.` },
    { id: 'wait.kettle.2', lead: `A cart rattles past on Emberford stone, and the kettle sign creaks over the inn door.`, hook: `The street is busy. The inn is warm. Pick one.` },
    { id: 'wait.kettle.3', lead: `You linger at the inn. Hollis calls a name you don't know, and a cloak goes up on a hook.`, hook: `He'll have a moment for you if you go in.` },
  ],
  'locale.emberford': [
    { id: 'wait.ford.0', lead: `You take a moment on Emberford's street. Chimneys breathe, and market shutters clap open.`, hook: `The Kettle's door swings and lets out a gust of warm bread.` },
    { id: 'wait.ford.1', lead: `You wait among the riverside noise while a hawker changes his pitch.`, hook: `Gulls fight over the quay, and lantern-hooks sway as the light goes.` },
    { id: 'wait.ford.2', lead: `A watchman nods past you on the cobbles.`, body: `Somewhere, Brightanvil answers with three bright hammer falls.`, hook: `Dagna's still working, if you need steel.` },
    { id: 'wait.ford.3', lead: `You linger in Emberford while the crowd thins and the puddles hold the chimneys upside down.`, hook: `The road out to the vale is there if you want it.` },
  ],
  'locale.ashen-fields': [
    { id: 'wait.ash.0', lead: `You take a moment in the Ashen Fields. Pale soil lifts on the wind, and the scarecrows lean.`, hook: `Insects in the hedgerow go quiet all at once.` },
    { id: 'wait.ash.1', lead: `You wait under the open sky while cloud shadows drag across the furrows.`, hook: `A crow lands near you, then thinks better of it.` },
    { id: 'wait.ash.2', lead: `Dust settles on your boots. Far off, a mill turns.`, hook: `The road back to Emberford is still clear, for now.` },
    { id: 'wait.ash.3', lead: `You linger as a scarecrow's coat flaps once and the soil cools underfoot.`, hook: `The vale's watch-stones glint in the distance, a long way from help.` },
    { id: 'wait.ash.4', lead: `Wind runs low over the stubble.`, body: `Out in the pale furrows, something small bolts for cover.`, hook: `Something bigger must be out there for it to run from.` },
    { id: 'wait.ash.5', lead: `You hold still in the open. A farm dog barks two fields over, then stops.`, hook: `Whatever shut it up hasn't made a sound.` },
    { id: 'wait.ash.6', lead: `The light shifts, and ash-dust drifts along the track and settles in the ruts.`, hook: `There are tracks in it now that weren't there before.` },
    { id: 'wait.ash.7', lead: `You wait. A scarecrow's sackcloth head turns in the wind.`, body: `Just the wind, you tell yourself.`, hook: `It's still facing you.` },
  ],
  'region.embervale': [
    { id: 'wait.vale.0', lead: `You take a moment at the edge of Embervale, with river light, mill towns and watch-stones all holding still.`, hook: `Down the road, Emberford's smoke rises.` },
    { id: 'wait.vale.1', lead: `You wait on the vale road. The wind combs the hedgerows and a cart's bell fades away.`, hook: `The hedge on your left rustles longer than the wind does.` },
    { id: 'wait.vale.2', lead: `A heron lifts from the water. Distant chimney smoke drifts sideways.`, hook: `Two roads, and no hurry on either of them, yet.` },
    { id: 'wait.vale.3', lead: `You linger in the open vale, and a long breath stretches into a longer one.`, hook: `Bandits use this road, and they're patient too.` },
  ],
  'interior.kettle-cellar': [
    { id: 'wait.cellar.0', lead: `You take a moment in the inn cellar while the cool stone sweats and the cider casks tick.`, hook: `The locked spice-chest keeps its secret.` },
    { id: 'wait.cellar.1', lead: `You wait below. Drips count the time in the dark corner.`, body: `A rat the size of a cat looks at you, then goes back behind the casks.`, hook: `It didn't seem afraid.` },
    { id: 'wait.cellar.2', lead: `Time pools in the cider chill. The cask labels blur in the low light.`, hook: `The stairs up to the common room creak once.` },
    { id: 'wait.cellar.3', lead: `You linger among the casks. A cork sighs, and dust motes drift.`, hook: `The chest's lock gleams, still shut and still waiting.` },
  ],
  'place.brightanvil': [
    { id: 'wait.smithy.0', lead: `You take a moment in the smithy yard while sparks leap and the anvil rings a clean note.`, hook: `Dagna doesn't miss a stroke.` },
    { id: 'wait.smithy.1', lead: `You wait by Brightanvil. Quench steam hisses and the apprentice swaps tongs.`, hook: `The rack of finished steel catches the forge light.` },
    { id: 'wait.smithy.2', lead: `Three hammer falls, a breath, then three again.`, body: `Horseshoes stack up by the wall.`, hook: `Dagna glances at you as if to ask whether you're buying or watching.` },
    { id: 'wait.smithy.3', lead: `You linger in the yard while the coal glow paints the racks.`, hook: `The smith nods without stopping. The forge floor is open.` },
  ],
  'interior.smith-forge': [
    { id: 'wait.forge.0', lead: `You take a moment on the forge floor. The bellows breathe and the heat presses on your cheeks.`, hook: `Dagna holds out the tongs. Hold them or move.` },
    { id: 'wait.forge.1', lead: `You wait in the forge as the hammer speaks and scale flakes from a billet.`, hook: `The finished blades hang close enough to touch.` },
    { id: 'wait.forge.2', lead: `Time is measured in heats here. Coals settle, tongs scrape.`, hook: `Unfinished work waits in rows, and so does Dagna's patience.` },
    { id: 'wait.forge.3', lead: `You linger by the bellows in a haze of sweat and iron.`, hook: `The yard door frames a cooler slice of Emberford.` },
  ],
  'place.mossglass': [
    { id: 'wait.moss.0', lead: `You take a moment at Mossglass. Green bottles catch the light and the drying herbs tick.`, hook: `In back, Fennick clears his throat.` },
    { id: 'wait.moss.1', lead: `You wait among the vials. A cork pops softly somewhere in back.`, hook: `The street door's chime stays still. You're the only customer.` },
    { id: 'wait.moss.2', lead: `Dust floats in a shaft of green lamplight.`, body: `A ledger page turns out of sight.`, hook: `Fennick knows exactly how long you've been standing there.` },
    { id: 'wait.moss.3', lead: `You linger in the shop front while herbs sway on their strings.`, hook: `The counter is still there, if you step closer.` },
  ],
  'interior.alchemist-counter': [
    { id: 'wait.counter.0', lead: `You take a moment at the counter while the labelled vials stand in their careful ranks.`, hook: `The ink on the ledger's last line is still damp.` },
    { id: 'wait.counter.1', lead: `You wait by the polished wood, and a pestle taps once in back.`, hook: `Fennick looks up. Prices don't change for waiting.` },
    { id: 'wait.counter.2', lead: `A bitter herb note rises and fades.`, body: `The wax seals glint.`, hook: `The street door feels a long way off.` },
    { id: 'wait.counter.3', lead: `You linger at the counter. Fennick's tools rest mid-task.`, hook: `He'll go back to them the moment you decide.` },
  ],
};

/** Wait anywhere without an arc (GENERIC_WAIT_LINES replacement). */
export const WAIT_FALLBACK: Bank = [
  { id: 'wait.any.0', lead: `You wait at {place}. The light shifts a little.`, hook: `Nothing comes for you, which is its own kind of answer.` },
  { id: 'wait.any.1', lead: `You let a little time go by at {place}.`, hook: `Your breath steadies, and the way on is still there.` },
  { id: 'wait.any.2', lead: `You hold still at {place} and listen.`, hook: `Footsteps somewhere, and then nothing.` },
  { id: 'wait.any.3', lead: `A quiet stretch at {place}.`, hook: `It won't last. Quiet never does.` },
];

/**
 * Context waits — used INSTEAD of the arc line when a tag matches (then the arc resumes next wait;
 * the arc step still advances so progression isn't lost).
 */
export const WAIT_CONTEXT: Bank = [
  { id: 'waitc.hurt.0', when: { hpLow: true }, lead: `You wait and let your heartbeat slow. It doesn't help the wound much.`, hook: `A proper rest would.` },
  { id: 'waitc.hurt.1', when: { hpLow: true }, lead: `You lean on the nearest wall and wait for the dizziness to pass.`, hook: `It mostly does. A rest, or a potion, would do the rest.` },
  { id: 'waitc.hurt.2', when: { hpLow: true, pack: 'ash-ledger' }, lead: `You wait, and the pain keeps its own count.`, hook: `It's patient, and so is the bill for fixing it.` },
  { id: 'waitc.fight.0', when: { recentEvent: 'justFought' }, lead: `You wait for your hands to stop shaking.`, hook: `They do, eventually.` },
  { id: 'waitc.fight.1', when: { recentEvent: 'justFought' }, lead: `You stand over the place where the fight was and let the quiet come back.`, hook: `It comes back slowly.` },
  { id: 'waitc.fight.2', when: { recentEvent: 'justFought', companions: true }, lead: `You and {companions} catch your breath without saying much.`, hook: `There'll be time to talk about it later.` },
  { id: 'waitc.party.0', when: { companions: true }, lead: `You wait with {companions}, and nobody says much.`, hook: `Someone will have to decide what's next.` },
  { id: 'waitc.party.1', when: { companions: true, pack: 'hearthlight' }, lead: `You wait a while with {companions}, and somebody hums under their breath.`, hook: `It's a good sort of quiet.` },
];

/* ═══════════════════════════════ MERCHANTS (talk) ═══════════════════════════════ */
/*
 * ENGINE GAP: there is no "talk to <npc>" route today — "talk to Hollis" falls into the
 * generic custom beat ("You act. Your voice shapes the beat…"). Wiring adds a talk route:
 * talk verb + (keeper name | "innkeeper"/"smith"/"alchemist") AND a merchant whose
 * locationIds include session.locationId. Pick greet on first talk at this node this visit,
 * hurt if hpLow, afterFight if recentEvent justFought|justLost, else smallTalk;
 * "bye"/"farewell"/"thanks" → farewell.
 */
export type TalkPath = 'greet' | 'smallTalk' | 'hurt' | 'afterFight' | 'farewell';
export type TradePath = 'open' | 'close' | 'buy' | 'sell' | 'tooDear' | 'soldOut' | 'keeperBroke';

export const MERCHANT_TALK: Record<MerchantId, Record<TalkPath, Bank>> = {
  'merchant.kettle': {
    greet: [
      { id: 'hollis.greet.0', lead: `Hollis sets down the mug he's polishing. "Morning, friend. You look like you've come a ways."`, hook: `He tips his head at the shelf behind him: rations, rope, a couple of potions kept for travellers.` },
      { id: 'hollis.greet.1', lead: `"There you are," Hollis says, as if he'd been expecting you. "Sit. Eat something, if you've the coin."`, hook: `The hearth is going and there's room on the benches.` },
      { id: 'hollis.greet.2', when: { pack: 'ash-ledger' }, lead: `Hollis looks at you, then at the chalk board, then back. "Friend. What'll it be?"`, hook: `There's no tally by your name yet. He seems to be keeping the space for one.` },
      { id: 'hollis.greet.3', when: { pack: 'hearthlight' }, lead: `Hollis lights up. "Ah, the one who slept by my fire. Sleep well?"`, hook: `He's already reaching for a clean cup.` },
    ],
    smallTalk: [
      { id: 'hollis.talk.0', when: { quest: 'quest-first-steps' }, lead: `"New in Embervale?" Hollis wipes the bar in slow circles. "Get yourself into Emberford proper. Folk there will tell you what the town needs."`, hook: `He nods at the door. "It's just out past the threshold."` },
      { id: 'hollis.talk.1', lead: `"Cellar's got rats again," Hollis says, not looking up. "Big ones. Cider doesn't drink itself, but they're trying."`, hook: `The cellar stairs are right there in the corner.` },
      { id: 'hollis.talk.2', lead: `Hollis leans on the bar. "Road out to the Ashen Fields isn't what it was. Wolves, and worse. Scarecrows that don't stay put."`, hook: `"If you're headed that way, take a potion with you."` },
      { id: 'hollis.talk.3', lead: `"Dagna at Brightanvil makes honest steel," Hollis says. "Fennick at Mossglass makes honest medicine. Neither one makes it cheap."`, hook: `He shrugs. "I make soup."` },
      { id: 'hollis.talk.4', when: { pack: 'ash-ledger' }, lead: `"Everyone settles up," Hollis says, and taps the chalk board. "Sooner is friendlier than later."`, hook: `He means it kindly. Mostly.` },
      { id: 'hollis.talk.5', when: { hearth: 'out' }, lead: `Hollis eyes the cold hearth. "Wood's stacked right there, if you're of a mind. Room's no good to anyone cold."`, hook: `He goes back to his mugs, but he's watching.` },
    ],
    hurt: [
      { id: 'hollis.hurt.0', when: { hpLow: true }, lead: `Hollis takes one look at you and pushes a stool out with his foot. "Sit before you fall."`, hook: `"There's a potion on the shelf, and a bed upstairs, if you need either."` },
      { id: 'hollis.hurt.1', when: { hpLow: true }, lead: `"You're bleeding on my floor, friend." Hollis says it gently. "Rest by the fire. That's free."`, hook: `A proper room costs, but he doesn't say so yet.` },
      { id: 'hollis.hurt.2', when: { hpLow: true, pack: 'ash-ledger' }, lead: `Hollis sees the wound and doesn't flinch. He's seen worse come through that door, and seen it carried back out.`, hook: `"Potion's on the shelf. Bed's upstairs. Neither's free."` },
      { id: 'hollis.hurt.3', when: { hpLow: true, pack: 'hearthlight' }, lead: `Hollis is round the bar before you can say anything, a hand under your elbow. "Easy now. Hearth's this way."`, hook: `"Sit by the fire a while. The potion on the shelf is there if you need it."` },
    ],
    afterFight: [
      { id: 'hollis.fight.0', when: { recentEvent: ['justFought', 'justLost'] }, lead: `"Heard you ran into trouble." Hollis slides a cup of water across. "Drink that first. Talk after."`, hook: `He waits until you've finished it.` },
      { id: 'hollis.fight.1', when: { recentEvent: 'justLost' }, lead: `"Somebody carried you in," Hollis says. "I didn't ask who, and they didn't say."`, hook: `"You're welcome by my fire till you're steady."` },
      { id: 'hollis.fight.2', when: { recentEvent: 'justFought' }, lead: `Hollis studies the dust and scrapes on you. "Fields, road, or my cellar?" He doesn't wait for an answer. "Either way, you came back."`, hook: `"That's the part that counts."` },
    ],
    farewell: [
      { id: 'hollis.bye.0', lead: `"Mind the road," Hollis says, and goes back to his mugs.`, hook: `The door to the threshold creaks as you go.` },
      { id: 'hollis.bye.1', lead: `Hollis raises a hand. "Fire'll be here when you get back."`, hook: `The street is just outside.` },
      { id: 'hollis.bye.2', when: { pack: 'ash-ledger' }, lead: `Hollis nods once and wipes the space where your elbows were.`, hook: `Your name stays on the chalk board behind him.` },
      { id: 'hollis.bye.3', when: { pack: 'hearthlight' }, lead: `"Come back in one piece," Hollis says. "There'll be soup."`, hook: `The threshold, then the street.` },
    ],
  },
  'merchant.brightanvil': {
    greet: [
      { id: 'dagna.greet.0', lead: `Dagna sets down her hammer and jerks a thumb at the rack: blades, a chain shirt, a sturdy shield. "Coin first."`, hook: `She picks the hammer back up while she waits.` },
      { id: 'dagna.greet.1', lead: `Dagna looks at your gear before your face. "Hm." It isn't a compliment.`, hook: `"Rack's there. Buy something that'll keep you alive."` },
      { id: 'dagna.greet.2', lead: `"Talk while I work," Dagna says, and doesn't stop hammering.`, hook: `Her rack of finished steel is within reach.` },
    ],
    smallTalk: [
      { id: 'dagna.talk.0', lead: `"Shortsword's quick. Dagger's quicker and worse. Shield's the thing people forget." Three hammer blows. "Don't forget."`, hook: `She nods at the wooden shield on the rack.` },
      { id: 'dagna.talk.1', lead: `"Wolves on the Ashen Fields go for the legs," Dagna says. "Chain won't stop teeth, but it'll slow them."`, hook: `She lets that sit, and the chain shirt glints on its hook.` },
      { id: 'dagna.talk.2', lead: `Dagna plunges a blade into the quench tub. Steam boils up between you. "I don't do credit."`, hook: `"Coin or nothing. Hollis will tell you the same."` },
      { id: 'dagna.talk.3', when: { pack: 'ash-ledger' }, lead: `"Everything on that rack cost me coal, iron and sweat," Dagna says. "So it'll cost you."`, hook: `She doesn't say it unkindly. It's just arithmetic.` },
    ],
    hurt: [
      { id: 'dagna.hurt.0', when: { hpLow: true }, lead: `Dagna looks at the wound. "Bad gear, or bad luck?" She doesn't wait for an answer. "Fennick's down the street."`, hook: `"Come back when you can stand up straight and buy armour."` },
      { id: 'dagna.hurt.1', when: { hpLow: true }, lead: `"You're leaking," Dagna says flatly. "Not on my floor."`, hook: `She pulls a stool away from the forge for you all the same.` },
      { id: 'dagna.hurt.2', when: { hpLow: true }, lead: `Dagna's hammer stops mid-swing. "Sit." It's the closest thing to kindness she's offered.`, hook: `"Then go see Fennick. Then come back here."` },
    ],
    afterFight: [
      { id: 'dagna.fight.0', when: { recentEvent: 'justFought' }, lead: `Dagna takes your weapon without asking, sights down it, and gives it back. "Still straight. You're lucky."`, hook: `"Next time, buy better."` },
      { id: 'dagna.fight.1', when: { recentEvent: ['justFought', 'justLost'] }, lead: `"Lost a fight?" Dagna asks. "Or won one ugly?"`, hook: `Either way, she points at the shield.` },
      { id: 'dagna.fight.2', when: { recentEvent: 'justFought' }, lead: `Dagna grunts at the scrapes on you. "Something bit you. Next time, let it bite steel."`, hook: `Her eyes go to the rack. So do yours.` },
    ],
    farewell: [
      { id: 'dagna.bye.0', lead: `Dagna is already back at the anvil before you turn.`, hook: `The hammer rings you out into the street.` },
      { id: 'dagna.bye.1', lead: `"Don't die in anything I made," Dagna says. "Bad for business."`, hook: `The yard noise swallows you on the way out.` },
      { id: 'dagna.bye.2', lead: `A grunt from Dagna, and three hammer blows that might mean goodbye.`, hook: `The streets of Emberford are cooler.` },
    ],
  },
  'merchant.mossglass': {
    greet: [
      { id: 'fennick.greet.0', lead: `Fennick peers over the ledger and gestures at the labelled vials. "Restoratives, mostly. Prices are fair and final."`, hook: `He dips his pen and waits.` },
      { id: 'fennick.greet.1', lead: `"Welcome to Mossglass." Fennick doesn't look up from the ledger until he's finished the line. "Now. What ails you?"`, hook: `The vials stand behind him in labelled rows.` },
      { id: 'fennick.greet.2', lead: `Fennick straightens a bottle that didn't need straightening. "Healing potions, a greater draught, salve, and a lantern. That's what's on offer."`, hook: `"I don't haggle," he adds, before you can ask.` },
    ],
    smallTalk: [
      { id: 'fennick.talk.0', lead: `"Herbal salve for scrapes, the potion for anything worse," Fennick says. "The greater draught for anything you'd rather not describe."`, hook: `He taps the ledger. "All priced."` },
      { id: 'fennick.talk.1', lead: `"A hooded lantern," Fennick says when you look at it. "It shutters down to a slit. Useful in cellars, I'm told."`, hook: `He glances, very briefly, in the direction of the Kettle.` },
      { id: 'fennick.talk.2', lead: `Fennick blots the ledger. "People come in after the Ashen Fields looking pale. Then they buy two of everything."`, hook: `"Buying one before you go is cheaper."` },
      { id: 'fennick.talk.3', when: { pack: 'ash-ledger' }, lead: `"Everything here is measured," Fennick says. "The dose, the price, the outcome. I find it soothing."`, hook: `His pen hovers over the ledger, waiting for your line.` },
    ],
    hurt: [
      { id: 'fennick.hurt.0', when: { hpLow: true }, lead: `Fennick's eyes go to the wound and stay there, measuring. "That needs more than salve."`, hook: `He slides a healing potion half an inch toward you.` },
      { id: 'fennick.hurt.1', when: { hpLow: true }, lead: `"Sit," Fennick says. "No, not there. That's clean." He points you to a stool.`, hook: `"Then let's discuss what you can afford."` },
      { id: 'fennick.hurt.2', when: { hpLow: true, pack: 'hearthlight' }, lead: `Fennick's fussiness drops away for a moment. "You should have come here first."`, hook: `He reaches for a vial before you've even asked.` },
      { id: 'fennick.hurt.3', when: { hpLow: true, pack: 'ash-ledger' }, lead: `Fennick notes the wound the way he'd note a sum. "That will cost more to fix the longer you wait."`, hook: `He slides the price list a little closer.` },
    ],
    afterFight: [
      { id: 'fennick.fight.0', when: { recentEvent: 'justFought' }, lead: `Fennick sniffs. "You've been fighting. It's on your boots."`, hook: `"I'd recommend restocking before you go back."` },
      { id: 'fennick.fight.1', when: { recentEvent: ['justFought', 'justLost'] }, lead: `"An encounter," Fennick says, the way someone else might say "weather".`, hook: `He opens the ledger to a fresh line.` },
      { id: 'fennick.fight.2', when: { recentEvent: 'justLost' }, lead: `Fennick studies your face. "Unconscious recently. The pupils say so."`, hook: `"A greater draught would set you right, if your purse can bear it."` },
    ],
    farewell: [
      { id: 'fennick.bye.0', lead: `Fennick inclines his head and goes back to his ledger.`, hook: `The door chime marks your exit.` },
      { id: 'fennick.bye.1', lead: `"Measured doses," Fennick reminds you. "Don't gulp."`, hook: `Green light follows you to the street.` },
      { id: 'fennick.bye.2', lead: `"Come back intact," Fennick says. "It's easier to treat."`, hook: `The shop front, then the street.` },
    ],
  },
};

/* ═══════════════════════════════ TRADE ═══════════════════════════════ */
/* Prose never states prices or gold. Mechanics line: `−1 gold · Trail rations` / `+6 gold · −Ash wolf pelt`. */
export const MERCHANT_TRADE: Record<MerchantId, Record<TradePath, Bank>> = {
  'merchant.kettle': {
    open: [
      { id: 'hollis.open.0', lead: `Hollis wipes down the bar and nods at the shelf behind it: rations, rope, a couple of potions kept for travellers.`, hook: `"Take your time."` },
      { id: 'hollis.open.1', lead: `"Supplies?" Hollis turns to the shelf. "Bread and cheese for the road, good rope, healing for the bad days."`, hook: `He lays them out on the bar one by one.` },
      { id: 'hollis.open.2', when: { pack: 'ash-ledger' }, lead: `Hollis sets out what he has: rations, rope, two potions, and he counts them as he does it.`, hook: `"Prices are on the board."` },
      { id: 'hollis.open.3', when: { pack: 'hearthlight' }, lead: `"For the road?" Hollis brightens and sets out rations, rope and a potion like a man packing a lunch for family.`, hook: `"Take what you need."` },
    ],
    close: [
      { id: 'hollis.close.0', lead: `Hollis puts the rest back on the shelf.`, hook: `"Shelf's here when you need it."` },
      { id: 'hollis.close.1', lead: `"Safe travels, then." Hollis is already wiping the bar again.`, hook: `The common room noise comes back up around you.` },
      { id: 'hollis.close.2', when: { recentEvent: 'justTraded' }, lead: `Hollis tucks your coin away and gives the bar a satisfied pat.`, hook: `"Pleasure, friend."` },
    ],
    buy: [
      { id: 'hollis.buy.0', lead: `Hollis takes your coin and hands over the {item}.`, hook: `"That'll see you right."` },
      { id: 'hollis.buy.1', lead: `Hollis slides the {item} across the bar and sweeps your coin into the till.`, hook: `"Anything else?"` },
      { id: 'hollis.buy.2', lead: `"Good choice." Hollis wraps the {item} in a clean cloth before handing it over.`, hook: `He chalks the sale on the board.` },
    ],
    sell: [
      { id: 'hollis.sell.0', lead: `Hollis turns the {item} over once, then counts coin into your palm.`, hook: `"Fair?" It's fair.` },
      { id: 'hollis.sell.1', lead: `Hollis weighs the {item} in his hand and nods. "I can use that."`, hook: `Coin changes hands across the bar.` },
      { id: 'hollis.sell.2', lead: `"Hm. Someone'll want it." Hollis sets the {item} under the bar and pays you.`, hook: `He doesn't ask where it came from.` },
    ],
    tooDear: [
      { id: 'hollis.dear.0', lead: `Hollis looks at your coins, then at the {item}, and shakes his head gently.`, hook: `"Not today, friend. Maybe after a job or two."` },
      { id: 'hollis.dear.1', lead: `"Short," Hollis says, not unkindly, and puts the {item} back on the shelf.`, hook: `"A rest by the hearth costs nothing, mind."` },
      { id: 'hollis.dear.2', when: { pack: 'ash-ledger' }, lead: `Hollis counts your coin twice. It doesn't get bigger.`, hook: `The {item} goes back on the shelf.` },
      { id: 'hollis.dear.3', when: { pack: 'hearthlight' }, lead: `Hollis winces on your behalf and sets the {item} back on the shelf.`, hook: `"Soon, friend. It'll keep."` },
    ],
    soldOut: [
      { id: 'hollis.out.0', lead: `Hollis checks the shelf. "Out of that, I'm afraid."`, hook: `"Fennick might have something like it."` },
      { id: 'hollis.out.1', lead: `"Last one went yesterday," Hollis says.`, hook: `He shows you what's left instead.` },
      { id: 'hollis.out.2', lead: `There's an empty space on the shelf where it used to be.`, hook: `Hollis shrugs. "Busy week."` },
    ],
    keeperBroke: [
      { id: 'hollis.broke.0', lead: `Hollis opens the till and shows you how little is in it.`, hook: `"Can't pay what that's worth. Not today."` },
      { id: 'hollis.broke.1', lead: `"I'd buy it if I could," Hollis says. "Till's light."`, hook: `"Try Dagna, or Fennick."` },
      { id: 'hollis.broke.2', lead: `Hollis shakes his head over the {item}. "Can't afford to take it off you."`, hook: `He sounds sorry about it.` },
    ],
  },
  'merchant.brightanvil': {
    open: [
      { id: 'dagna.open.0', lead: `Dagna jerks a thumb at the rack: dagger, shortsword, chain shirt, wooden shield. "Coin first."`, hook: `She doesn't put the hammer down.` },
      { id: 'dagna.open.1', lead: `"Buying?" Dagna wipes her hands on her apron. "Good. Look, don't touch, then point."`, hook: `The rack gleams in the forge light.` },
      { id: 'dagna.open.2', lead: `Dagna steps away from the anvil long enough to nod at her wares.`, hook: `"Everything on there will hold."` },
    ],
    close: [
      { id: 'dagna.close.0', lead: `Dagna is back at the anvil before you've finished turning away.`, hook: `Three hammer falls. Done.` },
      { id: 'dagna.close.1', lead: `"That it?" Dagna doesn't wait for the answer.`, hook: `The rack stays where it is, with fewer gaps than she'd like.` },
      { id: 'dagna.close.2', when: { recentEvent: 'justTraded' }, lead: `Dagna pockets the coin with something close to approval.`, hook: `"Keep it oiled."` },
    ],
    buy: [
      { id: 'dagna.buy.0', lead: `Dagna takes your coin, counts it once, and hands over the {item}.`, hook: `"Keep it oiled."` },
      { id: 'dagna.buy.1', lead: `Dagna lifts the {item} off the rack and checks it one last time before she hands it over.`, hook: `"Don't make me regret selling it."` },
      { id: 'dagna.buy.2', lead: `The coin goes into Dagna's apron, and the {item} goes into your hands.`, hook: `She's already looking at the gap on the rack, planning what to forge next.` },
    ],
    sell: [
      { id: 'dagna.sell.0', lead: `Dagna turns the {item} over once, then counts coin into your palm.`, hook: `"Scrap value. Mostly."` },
      { id: 'dagna.sell.1', lead: `Dagna checks the {item} and gives a short nod.`, hook: `Coin, then the {item} goes into a bin by the forge.` },
      { id: 'dagna.sell.2', lead: `"I've seen worse," Dagna says of the {item}, and pays you for it.`, hook: `It's the nicest thing she's said all day.` },
    ],
    tooDear: [
      { id: 'dagna.dear.0', lead: `Dagna looks at your coin and then at you. "No."`, hook: `The {item} stays on the rack.` },
      { id: 'dagna.dear.1', lead: `"Come back with more," Dagna says, and goes back to hammering.`, hook: `The Ashen Fields pay, if you survive them.` },
      { id: 'dagna.dear.2', lead: `Dagna doesn't even reach for the {item}. "You can't afford it."`, hook: `She's not wrong.` },
    ],
    soldOut: [
      { id: 'dagna.out.0', lead: `"Sold the last one," Dagna says. "I'll forge another when I have the iron."`, hook: `She points at what's left.` },
      { id: 'dagna.out.1', lead: `There's an empty hook on the rack.`, hook: `Dagna shrugs. "Busy."` },
      { id: 'dagna.out.2', lead: `"Gone," Dagna says, and that's the end of it.`, hook: `There's other steel on the rack.` },
    ],
    keeperBroke: [
      { id: 'dagna.broke.0', lead: `"Iron costs," Dagna says. "So does buying it back off you. Not today."`, hook: `She pushes the {item} back across.` },
      { id: 'dagna.broke.1', lead: `Dagna pats an empty apron pocket. "No coin to spare."`, hook: `"Try Hollis."` },
      { id: 'dagna.broke.2', lead: `Dagna shakes her head at the {item}. "Can't pay what it's worth."`, hook: `She gets back to work.` },
    ],
  },
  'merchant.mossglass': {
    open: [
      { id: 'fennick.open.0', lead: `Fennick peers over the ledger and gestures at the labelled vials. "Restoratives, mostly. Prices are fair and final."`, hook: `His pen hovers over a fresh line.` },
      { id: 'fennick.open.1', lead: `Fennick sets out the stock in order of strength: salve, potion, greater draught, and the lantern off to one side.`, hook: `"Choose."` },
      { id: 'fennick.open.2', lead: `"Shopping," Fennick says, pleased, and opens the ledger to a new page.`, hook: `The green lamps make every vial glow.` },
    ],
    close: [
      { id: 'fennick.close.0', lead: `Fennick blots the ledger and closes it.`, hook: `"Measured doses. Always."` },
      { id: 'fennick.close.1', lead: `Fennick lines the vials back up so their labels face out.`, hook: `He'll be here when you're hurt again.` },
      { id: 'fennick.close.2', when: { recentEvent: 'justTraded' }, lead: `Fennick finishes writing the sale in the ledger.`, hook: `"A pleasure doing exact business."` },
    ],
    buy: [
      { id: 'fennick.buy.0', lead: `Fennick takes your coin and hands over the {item}, label facing you.`, hook: `He writes the sale in the ledger before you've put it away.` },
      { id: 'fennick.buy.1', lead: `"The {item}," Fennick says, sliding it across. "Use as directed."`, hook: `There are no directions on the label. You decide not to ask.` },
      { id: 'fennick.buy.2', lead: `Fennick wraps the {item} in paper, tight and square.`, hook: `Your coin disappears into a drawer that closes with a click.` },
    ],
    sell: [
      { id: 'fennick.sell.0', lead: `Fennick turns the {item} over once, then counts coin into your palm.`, hook: `He writes it down.` },
      { id: 'fennick.sell.1', lead: `Fennick examines the {item} through a lens. "Acceptable."`, hook: `Coin, counted exactly.` },
      { id: 'fennick.sell.2', lead: `"I'll take it," Fennick says of the {item}, and pays without ceremony.`, hook: `It goes on a shelf with a new label.` },
    ],
    tooDear: [
      { id: 'fennick.dear.0', lead: `Fennick looks at your coin. "That is not the price."`, hook: `The {item} stays where it is.` },
      { id: 'fennick.dear.1', lead: `"Fair and final," Fennick reminds you, gently, and puts the {item} back.`, hook: `"Herbal salve is the cheapest thing I sell."` },
      { id: 'fennick.dear.2', lead: `Fennick shakes his head over your purse.`, hook: `"Come back when the ledger and your purse agree."` },
    ],
    soldOut: [
      { id: 'fennick.out.0', lead: `Fennick checks the shelf, then the ledger. "Out. I'll brew more."`, hook: `"Not today, though."` },
      { id: 'fennick.out.1', lead: `There's an empty, neatly labelled gap on the shelf.`, hook: `Fennick looks pained about it.` },
      { id: 'fennick.out.2', lead: `"Sold through," Fennick says. "Popular after the Ashen Fields."`, hook: `He offers you something else.` },
    ],
    keeperBroke: [
      { id: 'fennick.broke.0', lead: `Fennick consults the ledger. "My accounts can't absorb that today."`, hook: `He pushes the {item} back across.` },
      { id: 'fennick.broke.1', lead: `"Not at a fair price," Fennick says, "and I don't do the other kind."`, hook: `The {item} stays yours.` },
      { id: 'fennick.broke.2', lead: `Fennick closes the cash drawer. It sounds empty.`, hook: `"Another day."` },
    ],
  },
};

/** No merchant at this node ("No one here is selling anything…"). */
export const TRADE_NOBODY: Bank = [
  { id: 'trade.none.0', lead: `Nobody here is selling.`, hook: `In Emberford, the Copper Kettle, Brightanvil Smithy and Mossglass Alchemist all are.` },
  { id: 'trade.none.1', lead: `There's no counter, no shelf, and no one to haggle with at {place}.`, hook: `Emberford's shops are where the buying happens.` },
  { id: 'trade.none.2', lead: `You look around for a merchant. There isn't one.`, hook: `Hollis, Dagna and Fennick are all in Emberford.` },
];

/** Trade attempted mid-combat. */
export const TRADE_IN_COMBAT: Bank = [
  { id: 'trade.fight.0', lead: `No haggling with {foe} in front of you.`, hook: `Deal with it first.` },
  { id: 'trade.fight.1', lead: `This isn't the time for shopping.`, hook: `{Foe} is still coming.` },
  { id: 'trade.fight.2', lead: `The shop can wait.`, hook: `{Foe} can't.` },
];

/* ═══════════════════════════════ ITEMS ═══════════════════════════════ */
/*
 * Keyed by item.name.toLowerCase() (stable across starter-* and shop ids).
 * Prose never states HP restored / qty left — mechanics line does: `+4 HP · HP 9/10 · 1 Healing potion left`.
 */
export type ItemNameKey =
  | 'shortsword' | 'dagger' | 'leather armor' | 'chain shirt' | 'wooden shield'
  | 'healing potion' | 'greater healing potion' | 'herbal salve'
  | 'torch' | 'trail rations' | 'hemp rope (50 ft)' | 'hooded lantern'
  | 'ash wolf pelt' | 'straw charm';

export const ITEM_USE_HEAL: { generic: Bank } & Partial<Record<ItemNameKey, Bank>> = {
  generic: [
    { id: 'use.heal.0', lead: `You uncork the {item} and drink. Warmth spreads through your chest.`, hook: `Your hands stop shaking.` },
    { id: 'use.heal.1', lead: `The {item} goes down bitter and bright, and the ache in your limbs eases.`, hook: `You can stand straighter.` },
    { id: 'use.heal.2', lead: `You knock back the {item}. Heat blooms behind your ribs and your breath steadies.`, hook: `Better. Not perfect, but better.` },
  ],
  'healing potion': [
    { id: 'use.hp.0', lead: `You uncork the healing potion. It's red and faintly warm through the glass, and it goes down like summer.`, hook: `The worst of the pain loosens its grip.` },
    { id: 'use.hp.1', lead: `You drink the healing potion in two swallows.`, body: `Warmth runs out along your arms and the cuts stop stinging.`, hook: `It's enough to get you moving again.` },
    { id: 'use.hp.2', when: { pack: 'ash-ledger' }, lead: `You drink the healing potion and feel the warmth do its work.`, hook: `That's one fewer for the bad day still ahead.` },
    { id: 'use.hp.3', when: { companions: true }, lead: `You knock back the healing potion with {companions} watching your back.`, hook: `The warmth spreads, and the ache backs off.` },
  ],
  'greater healing potion': [
    { id: 'use.ghp.0', lead: `You break the seal on the greater healing potion. It hits like a hearth fire in your chest.`, hook: `Wounds close that you'd stopped counting.` },
    { id: 'use.ghp.1', lead: `The greater draught tastes of iron and honey.`, body: `For a moment you can hear your own heartbeat, steady and strong.`, hook: `You feel ready for the next thing.` },
    { id: 'use.ghp.2', when: { pack: 'ash-ledger' }, lead: `You spend the greater healing potion. It was worth what it cost. This time.`, hook: `The pain draws back.` },
    { id: 'use.ghp.3', when: { pack: 'hearthlight' }, lead: `The greater healing potion tastes like a good morning.`, hook: `Strength floods back, and with it, hope.` },
  ],
  'herbal salve': [
    { id: 'use.salve.0', lead: `You open the tin of herbal salve, green-smelling and cool, and work it into the worst scrape.`, hook: `The sting fades to a dull itch.` },
    { id: 'use.salve.1', lead: `The herbal salve goes on cold and then turns warm.`, hook: `It isn't magic, just good work, and you'll take it.` },
    { id: 'use.salve.2', lead: `You smear herbal salve over the cuts. Fennick would approve of the dose.`, hook: `Your skin settles.` },
  ],
};

export const ITEM_USE_FULL_HP: Bank = [
  { id: 'use.full.0', lead: `You're already whole. The {item} goes back in your pack for a worse day.`, hook: `You'll be glad of it later.` },
  { id: 'use.full.1', lead: `You weigh the {item} in your hand. There's nothing to heal.`, hook: `Save it.` },
  { id: 'use.full.2', when: { pack: 'ash-ledger' }, lead: `Drinking the {item} now would just be pouring coin on the floor.`, hook: `You keep it.` },
    { id: 'use.full.3', when: { pack: 'hearthlight' }, lead: `You're hale and whole. The {item} can wait for someone who needs it more, maybe you, later.`, hook: `Back in the pack it goes.` },
];

export const ITEM_USE_NOTHING: Bank = [
  { id: 'use.none.0', lead: `The {item} has no use on its own right now.`, hook: `Keep it handy. Something will need it.` },
  { id: 'use.none.1', lead: `You turn the {item} over. Not here, and not like this.`, hook: `Maybe somewhere else.` },
  { id: 'use.none.2', lead: `There's nothing at {place} that needs the {item}.`, hook: `Yet.` },
];

/** Equip, keyed by slot, with item-specific overrides. Swap: prefix EQUIP_SWAP lead. */
export const ITEM_EQUIP: {
  weapon: Bank; armor: Bank; shield: Bank;
} & Partial<Record<ItemNameKey, Bank>> = {
  weapon: [
    { id: 'eq.wpn.0', lead: `You draw the {item} and test its weight. It settles into your grip.`, hook: `Ready.` },
    { id: 'eq.wpn.1', lead: `The {item} comes up in your hand.`, hook: `Whatever's next, you'll meet it armed.` },
    { id: 'eq.wpn.2', lead: `You buckle the {item} where you can reach it fast.`, hook: `One less thing to think about.` },
  ],
  armor: [
    { id: 'eq.arm.0', lead: `You shrug into the {item} and cinch the straps tight.`, hook: `It'll turn a blow or two.` },
    { id: 'eq.arm.1', lead: `The {item} settles over your shoulders, snug and familiar.`, hook: `You roll your shoulders. It moves with you.` },
    { id: 'eq.arm.2', lead: `Buckle by buckle, you put on the {item}.`, hook: `Now you're dressed for the road.` },
  ],
  shield: [
    { id: 'eq.shd.0', lead: `You sling the {item} onto your arm.`, hook: `It's heavier than it looks, which is the point.` },
    { id: 'eq.shd.1', lead: `The {item} locks onto your forearm with a solid thunk.`, hook: `Let them come.` },
    { id: 'eq.shd.2', lead: `You heft the {item} and set your feet behind it.`, hook: `Dagna would nod.` },
  ],
  shortsword: [
    { id: 'eq.ss.0', lead: `You draw the shortsword: plain, well kept, balanced for quick cuts.`, hook: `It feels like it wants to be used.` },
    { id: 'eq.ss.1', lead: `The shortsword slides free with a clean whisper of steel.`, hook: `You give it a test swing. Good.` },
    { id: 'eq.ss.2', lead: `You settle the shortsword at your hip, hand resting on the grip.`, hook: `Ready for the road.` },
  ],
  dagger: [
    { id: 'eq.dg.0', lead: `You flip the dagger once and catch it by the grip.`, hook: `Small, quick, and easy to hide.` },
    { id: 'eq.dg.1', lead: `The dagger fits your hand like it was made for it.`, hook: `It'll do for close work.` },
    { id: 'eq.dg.2', lead: `You tuck the dagger where you can draw it in a heartbeat.`, hook: `It isn't much, but it's sharp.` },
  ],
  'leather armor': [
    { id: 'eq.la.0', lead: `You pull on the leather armor. It's worn soft at the elbows.`, hook: `It'll keep the scratches off, mostly.` },
    { id: 'eq.la.1', lead: `The leather armor creaks as you buckle it.`, hook: `Light enough to run in.` },
    { id: 'eq.la.2', lead: `You lace the leather armor tight across your chest.`, hook: `It smells of oil and old roads.` },
  ],
  'chain shirt': [
    { id: 'eq.cs.0', lead: `The chain shirt pours over your head like cold water and settles with a rattle.`, hook: `You feel heavier, and safer.` },
    { id: 'eq.cs.1', lead: `You shrug into the chain shirt, rings chiming.`, hook: `Teeth will have a harder time of it now.` },
    { id: 'eq.cs.2', when: { pack: 'ash-ledger' }, lead: `The chain shirt cost what it cost. You buckle it on and stop thinking about the price.`, hook: `It's worth it the first time it holds.` },
    { id: 'eq.cs.3', when: { pack: 'hearthlight' }, lead: `The chain shirt settles over you, cold at first and then warm.`, hook: `Dagna's work. It'll hold.` },
  ],
  'wooden shield': [
    { id: 'eq.ws.0', lead: `You strap on the wooden shield, iron-rimmed oak, solid as a door.`, hook: `It'll take a hit so you don't have to.` },
    { id: 'eq.ws.1', lead: `The wooden shield thunks onto your arm.`, hook: `Dagna's rim work is flawless.` },
    { id: 'eq.ws.2', lead: `You raise the wooden shield and peer over its iron rim.`, hook: `Better.` },
  ],
};

/** Prepended when equip replaced something. {item} here = the item put away. */
export const EQUIP_SWAP_PREFIX: readonly string[] = [
  `You put away the {item}.`,
  `The {item} goes back in your pack.`,
  `You trade the {item} for something better.`,
];

export const ITEM_UNEQUIP: Bank = [
  { id: 'uneq.0', lead: `You set the {item} aside and stow it in your pack.`, hook: `Lighter, if less ready.` },
  { id: 'uneq.1', lead: `The {item} comes off, and you pack it away with care.` , hook: `It'll be there when you need it.` },
  { id: 'uneq.2', lead: `You take off the {item} and tuck it into your gear.`, hook: `It's out of the way, for now.` },
];

export const ITEM_DROP: { generic: Bank } & Partial<Record<ItemNameKey, Bank>> = {
  generic: [
    { id: 'drop.0', lead: `You leave the {item} behind.`, hook: `Your pack is a little lighter.` },
    { id: 'drop.1', lead: `You set the {item} down and walk on without it.`, hook: `No looking back.` },
    { id: 'drop.2', lead: `The {item} stays where you drop it.`, hook: `Someone else's problem now.` },
  ],
  torch: [
    { id: 'drop.torch.0', lead: `You leave the torch on the ground, pitch-soaked and unlit.`, hook: `Hope you don't need light later.` },
    { id: 'drop.torch.1', lead: `The torch rolls once and comes to rest.`, hook: `It's one less thing to carry.` },
    { id: 'drop.torch.2', lead: `You set the torch aside.`, hook: `The cellar is dark, mind.` },
  ],
  'straw charm': [
    { id: 'drop.charm.0', lead: `You drop the straw charm. Its red thread twitches once in the dirt.`, hook: `You don't wait to see if it twitches again.` },
    { id: 'drop.charm.1', lead: `The straw charm lands softly, still faintly moving.`, hook: `Good riddance, probably.` },
    { id: 'drop.charm.2', lead: `You let go of the straw charm and wipe your hand on your leg.`, hook: `It doesn't feel any cleaner.` },
  ],
  'ash wolf pelt': [
    { id: 'drop.pelt.0', lead: `You drop the ash wolf pelt. A puff of cinder smell rises from it.`, hook: `A trader would have paid for that.` },
    { id: 'drop.pelt.1', lead: `The grey pelt slumps to the ground.`, hook: `It's lighter going without it.` },
    { id: 'drop.pelt.2', when: { pack: 'ash-ledger' }, lead: `You leave the ash wolf pelt behind, along with what it would have fetched.`, hook: `Some weights aren't worth carrying.` },
    { id: 'drop.pelt.3', when: { pack: 'hearthlight' }, lead: `You lay the ash wolf pelt down, almost respectfully.`, hook: `It fought hard. Let it rest.` },
  ],
  'trail rations': [
    { id: 'drop.rations.0', lead: `You leave the trail rations behind: hard bread, cheese, dried apple.`, hook: `Something will eat well tonight.` },
    { id: 'drop.rations.1', lead: `You set the rations down.`, hook: `Your stomach disagrees.` },
    { id: 'drop.rations.2', lead: `The trail rations stay behind.`, hook: `Hope the next town has a kitchen.` },
  ],
};

/** Quest items can't be dropped / sold. */
export const ITEM_QUEST_LOCKED: Bank = [
  { id: 'qlock.0', lead: `Your hand closes on the {item} and won't let go.`, hook: `It matters to a quest. You keep it.` },
  { id: 'qlock.1', lead: `You think better of it. The {item} is part of something unfinished.`, hook: `It stays.` },
  { id: 'qlock.2', lead: `Not the {item}.`, hook: `Someone's counting on you bringing it back.` },
];

/* ═══════════════════════════════ REST ═══════════════════════════════ */
/* Mechanics: short `+3 HP · HP 8/10` ; full `HP 10/10` ; long `−5 gold · HP 16/16` ; limit `Room · 5 gold at the Copper Kettle`. */
export const REST_SHORT: Record<'healed' | 'alreadyFull' | 'limit' | 'inCombat', Bank> = {
  healed: [
    { id: 'rs.heal.0', lead: `You sit a while, catch your breath and bind your scrapes.`, hook: `It isn't a night's sleep, but you can move again.` },
    { id: 'rs.heal.1', lead: `You find a quiet spot and let your body do its slow work.`, hook: `The aches dull to something you can carry.` },
    { id: 'rs.heal.2', when: { hpLow: true }, lead: `You lower yourself down carefully and press a cloth to the worst of it.`, hook: `Slowly, the world stops tilting.` },
    { id: 'rs.heal.hl.0', when: { pack: 'hearthlight' }, lead: `You rest a while and let warmth find its way back into your hands.`, hook: `The road can wait an hour.` },
    { id: 'rs.heal.hl.1', when: { pack: 'hearthlight', companions: true }, lead: `You rest beside {companions}, sharing water and small jokes.`, hook: `It helps more than it should.` },
    { id: 'rs.heal.al.0', when: { pack: 'ash-ledger' }, lead: `You rest, bind what you can, and count what's left of you.`, hook: `Enough to go on. Barely enough.` },
    { id: 'rs.heal.al.1', when: { pack: 'ash-ledger' }, lead: `A short rest, a tight bandage, a long breath.`, hook: `The ledger of your body is a little less red.` },
  ],
  alreadyFull: [
    { id: 'rs.full.0', lead: `You sit a while. You were already at full strength, but time passes all the same.`, hook: `Restless, you look at the way on.` },
    { id: 'rs.full.1', lead: `You rest out of habit more than need.`, hook: `Your legs want to be moving.` },
    { id: 'rs.full.2', lead: `There's nothing to mend. You take the quiet anyway.`, hook: `It doesn't last.` },
  ],
  limit: [
    { id: 'rs.limit.0', lead: `You've rested as much as a short break allows.`, hook: `You need a proper night's sleep, and Hollis has rooms at the Copper Kettle.` },
    { id: 'rs.limit.1', lead: `Another sit-down won't fix this. Your body wants a bed.`, hook: `The Kettle has beds.` },
    { id: 'rs.limit.2', when: { pack: 'ash-ledger' }, lead: `You can't rest your way out of this one for free any more.`, hook: `A room at the Copper Kettle will cost you, but it's the only real fix.` },
      { id: 'rs.limit.3', when: { pack: 'hearthlight' }, lead: `Sitting won't mend this any more. You need a real bed.`, hook: `The Kettle's beds are soft, and Hollis keeps them clean.` },
  ],
  inCombat: [
    { id: 'rs.fight.0', lead: `No resting with {foe} in front of you.`, hook: `End it, or run.` },
    { id: 'rs.fight.1', lead: `You'd love to sit down.`, hook: `{Foe} has other plans.` },
    { id: 'rs.fight.2', lead: `This is no time to rest.`, hook: `{Foe} is still on you.` },
  ],
};

export const REST_LONG: Record<'slept' | 'notInn' | 'cantAfford', Bank> = {
  slept: [
    { id: 'rl.hl.0', when: { pack: 'hearthlight' }, lead: `You pay Hollis and sleep the night through upstairs, under a quilt that smells of lavender.`, hook: `You wake rested, with bread waiting downstairs.` },
    { id: 'rl.hl.1', when: { pack: 'hearthlight' }, lead: `Hollis shows you up himself. The bed is narrow and clean and the hearth's warmth comes up through the floor.`, hook: `Morning finds you whole.` },
    { id: 'rl.hl.2', when: { pack: 'hearthlight', companions: true }, lead: `You and {companions} bed down upstairs and sleep like stones.`, hook: `Morning finds the whole lot of you whole and hungry.` },
    { id: 'rl.al.0', when: { pack: 'ash-ledger' }, lead: `You pay Hollis, and he chalks it on the board. The bed upstairs is narrow, and you sleep like you've earned it.`, hook: `You wake whole. The coin doesn't come back.` },
    { id: 'rl.al.1', when: { pack: 'ash-ledger' }, lead: `A night's sleep, bought and paid for.`, body: `The room is cold, the blanket thin, the mattress honest.`, hook: `You wake rested, and a little poorer for it.` },
    { id: 'rl.al.2', when: { pack: 'ash-ledger' }, lead: `Hollis takes your coin without comment and hands you a key.`, hook: `You wake at first light, mended, with the day already asking what you'll spend next.` },
    { id: 'rl.any.0', lead: `You pay Hollis and sleep upstairs at the Kettle.`, hook: `You wake rested and ready.` },
  ],
  notInn: [
    { id: 'rl.away.0', lead: `There's no bed here, just ground and sky.`, hook: `For a real night's sleep, it's the Copper Kettle.` },
    { id: 'rl.away.1', lead: `You'd sleep, but not at {place}.`, hook: `Hollis rents rooms at the Kettle. A short rest is all you'll get here.` },
    { id: 'rl.away.2', lead: `Nobody sleeps well at {place}.`, hook: `Get back to the Copper Kettle for a proper night.` },
  ],
  cantAfford: [
    { id: 'rl.poor.0', lead: `Hollis shakes his head over your coins. A room costs more than that.`, hook: `"A short rest by the hearth costs nothing, friend."` },
    { id: 'rl.poor.1', lead: `"Can't do it for that," Hollis says gently.`, hook: `He nods at the hearth. "Fire's free."` },
    { id: 'rl.poor.2', when: { pack: 'ash-ledger' }, lead: `Hollis looks at your purse and doesn't bother counting.`, hook: `"Fire's free. Beds aren't."` },
      { id: 'rl.poor.3', when: { pack: 'hearthlight' }, lead: `Hollis looks sorry. "I'd give it you if I could, but rooms keep the lights on."`, hook: `"Sleep by the hearth tonight. It's warm, and it's free."` },
  ],
};

/* ═══════════════════════════════ QUESTS ═══════════════════════════════ */
/*
 * ENGINE GAP: quest accept/update/complete currently produce NO Tale prose (regex patch only),
 * and STARTER_QUEST completes silently on arrival in Emberford (+XP). Use these banks;
 * mechanics line: `Quest noted` · `Quest updated` · `Quest complete: First steps · +100 XP` · `Quest failed`.
 * Player-typed quest titles are NOT echoed in prose (contract: never echo raw playerAction).
 */
export const QUEST: Record<'offer' | 'accept' | 'progress' | 'complete' | 'fail', Bank> = {
  offer: [
    { id: 'q.offer.0', lead: `Someone here needs help. They don't say it straight out, but they mean it.`, hook: `Say you'll take it on, and it's yours.` },
    { id: 'q.offer.1', lead: `There's a job in the way they look at you.`, hook: `Accept it, or let it pass.` },
    { id: 'q.offer.2', when: { pack: 'ash-ledger' }, lead: `It's an offer, and offers always have a price on the back.`, hook: `Take it, or don't.` },
    { id: 'q.offer.3', when: { pack: 'hearthlight' }, lead: `Someone here could use a hand, and they're looking at yours.`, hook: `Say yes, and you'll have made a friend.` },
  ],
  accept: [
    { id: 'q.accept.0', when: { pack: 'hearthlight' }, lead: `You give your word. It feels good to say it out loud.`, hook: `The Quests tab holds the details. The road holds the rest.` },
    { id: 'q.accept.1', when: { pack: 'ash-ledger' }, lead: `You take the job. Another line in the ledger with your name on it.`, hook: `Now you owe it an ending.` },
    { id: 'q.accept.2', lead: `You commit to it.`, hook: `Somewhere, someone's counting on you to follow through.` },
    { id: 'q.accept.3', when: { companions: true }, lead: `You and {companions} shake on it.`, hook: `It's a shared promise now.` },
  ],
  progress: [
    { id: 'q.prog.0', lead: `A piece of it falls into place.`, hook: `Not done, but closer.` },
    { id: 'q.prog.1', lead: `You make a note of what you've learned.`, hook: `The next step is clearer than the last.` },
    { id: 'q.prog.2', when: { pack: 'ash-ledger' }, lead: `Progress, paid for in time and boot leather.`, hook: `The rest is still owing.` },
    { id: 'q.prog.3', when: { pack: 'hearthlight' }, lead: `It's coming together, step by honest step.`, hook: `Keep going.` },
  ],
  complete: [
    { id: 'q.done.0', when: { pack: 'hearthlight' }, lead: `It's done, and done well.`, hook: `Somebody will sleep easier tonight because of you.` },
    { id: 'q.done.1', when: { pack: 'ash-ledger' }, lead: `Paid in full. One line in the ledger finally balances.`, hook: `There are always more lines.` },
    { id: 'q.done.2', lead: `You see it through to the end.`, hook: `That's worth something, and you can feel it.` },
    { id: 'q.done.3', when: { pack: 'hearthlight' }, lead: `You kept your word.`, hook: `In Embervale, that still means something.` },
    { id: 'q.done.4', when: { pack: 'ash-ledger' }, lead: `Done. Nobody thanks you, but the account is closed.`, hook: `On to the next one.` },
  ],
  fail: [
    { id: 'q.fail.0', lead: `It slips away from you.`, hook: `Some things can't be undone. You'll carry this one.` },
    { id: 'q.fail.1', when: { pack: 'ash-ledger' }, lead: `Failed. The debt doesn't go away just because the chance did.`, hook: `It just changes shape.` },
    { id: 'q.fail.2', when: { pack: 'hearthlight' }, lead: `It didn't go the way you hoped.`, hook: `There'll be other chances to do right. There always are.` },
    { id: 'q.fail.3', when: { pack: 'hearthlight' }, lead: `You couldn't save this one.`, hook: `It hurts because you cared. Carry that forward.` },
    { id: 'q.fail.4', when: { pack: 'ash-ledger' }, lead: `It's lost, written off.`, hook: `The ledger remembers, even if nobody else does.` },
  ],
};

/** STARTER_QUEST 'quest-first-steps' ("First steps") — completes on arrival at locale.emberford. Append after ARRIVAL line. */
export const QUEST_FIRST_STEPS: Record<'offer' | 'complete', Bank> = {
  offer: [
    { id: 'qfs.offer.0', lead: `Hollis leans on the bar. "First time in Embervale? Find your footing in Emberford. Folk there will tell you what the town needs."`, hook: `The door to the street is just past the threshold.` },
    { id: 'qfs.offer.1', lead: `"Ask around in town," Hollis says. "Emberford's small enough that someone always needs something."`, hook: `He points you toward the door.` },
    { id: 'qfs.offer.2', when: { pack: 'ash-ledger' }, lead: `"You'll want to earn your keep," Hollis says. "Emberford's where the work is."`, hook: `"Door's that way."` },
    { id: 'qfs.offer.3', when: { pack: 'hearthlight' }, lead: `"Go on into town," Hollis says warmly. "Find your feet. Emberford's kinder than it looks."`, hook: `The street is just past the threshold.` },
  ],
  complete: [
    { id: 'qfs.done.0', when: { pack: 'hearthlight' }, lead: `You've found your feet. Emberford feels less like a stranger's town already.`, hook: `Three doors on this street are open to you: the inn, the smithy, the alchemist.` },
    { id: 'qfs.done.1', when: { pack: 'ash-ledger' }, lead: `First steps taken. Emberford knows your face now, for better or worse.`, hook: `Every shop on this street will want your coin.` },
    { id: 'qfs.done.2', lead: `The town's noise closes around you, and you're part of it now.`, hook: `Time to learn what Emberford needs.` },
    { id: 'qfs.done.3', when: { pack: 'hearthlight' }, lead: `A stallholder nods as you pass, as if you belong here. You've found your footing.`, hook: `Hollis was right: Emberford has room for you.` },
    { id: 'qfs.done.4', when: { pack: 'ash-ledger' }, lead: `You know the streets now, and the streets know you.`, hook: `That's the first step. The rest will cost more.` },
  ],
};

/* ═══════════════════════════════ LEVEL UP ═══════════════════════════════ */
/* Mechanics: `Level 2 · Max HP 16 (+6) · +2 ability points` — never in prose. */
export const LEVEL_UP: Bank = [
  { id: 'lv.hl.0', when: { pack: 'hearthlight' }, lead: `Something settles in you. Every road walked and every close call adds up, and {name} stands a little taller for it.`, hook: `There's more you could become. The Character sheet is waiting.` },
  { id: 'lv.hl.1', when: { pack: 'hearthlight' }, lead: `You notice it in the way you stand: steadier, surer, harder to knock down.`, hook: `{name} has grown, and there's room to grow more.` },
  { id: 'lv.hl.2', when: { pack: 'hearthlight', companions: true }, lead: `You catch it in the faces of {companions}: {name} stands differently now.`, hook: `Whatever's next, you'll meet it stronger.` },
  { id: 'lv.al.0', when: { pack: 'ash-ledger' }, lead: `Every scar has paid out. {name} is harder now, and harder to kill.`, hook: `Spend what you've earned before the road spends it for you.` },
  { id: 'lv.al.1', when: { pack: 'ash-ledger' }, lead: `The lessons were expensive. You learned them anyway.`, hook: `{name} has grown tougher. Decide what to make of it.` },
  { id: 'lv.al.2', when: { pack: 'ash-ledger' }, lead: `You've survived enough to know how.`, body: `It shows in your hands, and in how you keep your back to walls.`, hook: `The Character sheet has room for what you've earned.` },
  { id: 'lv.any.0', lead: `{name} feels the change settle in: tougher, quicker, readier.`, hook: `Open the Character sheet to decide what comes next.` },
];

/** Shown with combat victory when XP crosses the next threshold (today: " You feel ready to level up (see Character)."). */
export const LEVEL_READY: Bank = [
  { id: 'lvr.0', lead: `You feel something shift, a readiness you didn't have this morning.` },
  { id: 'lvr.1', lead: `This fight taught you something. You can feel it waiting to be used.` },
  { id: 'lvr.2', lead: `You're ready to grow. The Character sheet will tell you how.` },
];

/* ═══════════════════════════════ COMBAT ═══════════════════════════════ */
/*
 * Dice stay in the existing rollLine / checkLine (`🎲 20+2=22 vs AC 11 — CRIT, 7 dmg`).
 * Foe stats move out of prose into the mechanics line: intro → `Scarecrow husk · HP 11 · AC 11`;
 * foe hits → `−5 HP · HP 5/10`; victory → `+50 XP · +4 gold · Straw charm`;
 * defeat → `Knocked out · HP 5/10 · −4 gold`.
 * One beat = player half (hit/miss/crit/fumble or stance) + foe half (foeHit/foeMiss/foeCrit), each picked separately,
 * then victory/defeat replaces the foe half when the fight ends.
 */
export type CombatPath =
  | 'intro' | 'hit' | 'miss' | 'crit' | 'fumble'
  | 'foeHit' | 'foeMiss' | 'foeCrit'
  | 'victory' | 'defeat' | 'fleeOk' | 'fleeFail';

export const COMBAT_FOE: Record<FoeId | 'generic', Record<CombatPath, Bank>> = {
  generic: {
    intro: [
      { id: 'c.gen.intro.0', lead: `{Foe} squares up to you.`, hook: `There's no talking your way out of this one.` },
      { id: 'c.gen.intro.1', lead: `{Foe} steps into your path and stays there.`, hook: `Fight, or find a way past.` },
      { id: 'c.gen.intro.2', lead: `Trouble finds you: {foe}, and it's spoiling for it.`, hook: `Steel yourself.` },
    ],
    hit: [
      { id: 'c.gen.hit.0', lead: `You drive {weapon} into {foe}, and it reels.` },
      { id: 'c.gen.hit.1', lead: `A clean strike with {weapon}. {Foe} staggers.` },
      { id: 'c.gen.hit.2', lead: `You catch {foe} with {weapon}, and it feels the blow.` },
    ],
    miss: [
      { id: 'c.gen.miss.0', lead: `{Foe} twists aside, and you cut only air.` },
      { id: 'c.gen.miss.1', lead: `You swing {weapon}, and {foe} isn't there anymore.` },
      { id: 'c.gen.miss.2', lead: `You bring {weapon} around, and it glances off without finding purchase.` },
    ],
    crit: [
      { id: 'c.gen.crit.0', lead: `You find the perfect opening and bring {weapon} down on {foe}, hard.` },
      { id: 'c.gen.crit.1', lead: `Everything lines up at once: footing, timing, {weapon}. {Foe} takes the full weight of it.` },
      { id: 'c.gen.crit.2', lead: `You see the gap and put {weapon} straight through it.` },
    ],
    fumble: [
      { id: 'c.gen.fumble.0', lead: `Your footing goes and you swing wide, nearly losing {weapon}.` },
      { id: 'c.gen.fumble.1', lead: `You overreach badly, and {foe} sees it.` },
      { id: 'c.gen.fumble.2', lead: `A clumsy swing of {weapon} hits nothing but your own balance.` },
    ],
    foeHit: [
      { id: 'c.gen.fh.0', lead: `{Foe} strikes back and catches you.` },
      { id: 'c.gen.fh.1', lead: `{Foe} lunges, and it connects.` },
      { id: 'c.gen.fh.2', when: { hpLow: true }, lead: `{Foe} lands another one. You can feel it now, every breath.` },
    ],
    foeMiss: [
      { id: 'c.gen.fm.0', lead: `{Foe} lashes out and misses.` },
      { id: 'c.gen.fm.1', lead: `{Foe} attacks, but your guard holds.` },
      { id: 'c.gen.fm.2', lead: `{Foe} comes at you and your footwork carries you clear.` },
    ],
    foeCrit: [
      { id: 'c.gen.fc.0', lead: `{Foe} lands a savage hit that knocks the wind out of you.` },
      { id: 'c.gen.fc.1', lead: `{Foe} finds the gap in your guard, and it hurts.` },
      { id: 'c.gen.fc.2', lead: `{Foe} hits you hard enough that the world rings.` },
    ],
    victory: [
      { id: 'c.gen.win.0', lead: `{Foe} falls and doesn't get up.`, hook: `You stand there a moment and wait for your heart to slow.` },
      { id: 'c.gen.win.1', lead: `One last exchange, and {foe} goes down for good.`, hook: `You're still standing.` },
      { id: 'c.gen.win.2', when: { hpLow: true }, lead: `{Foe} drops. You almost do too.`, hook: `You'll want a rest before the next one.` },
      { id: 'c.gen.win.hl', when: { pack: 'hearthlight' }, lead: `{Foe} falls, and the fight goes out of the air.`, hook: `You did it. Breathe.` },
      { id: 'c.gen.win.al', when: { pack: 'ash-ledger' }, lead: `{Foe} is down.`, hook: `Now count what it cost you.` },
    ],
    defeat: [
      { id: 'c.gen.lose.0', lead: `{Foe}'s blow lands and the ground comes up to meet you.` },
      { id: 'c.gen.lose.1', lead: `Your legs go. The last thing you see is {foe} standing over you.` },
      { id: 'c.gen.lose.2', lead: `One hit too many. Everything goes dark.` },
    ],
    fleeOk: [
      { id: 'c.gen.flee.0', lead: `You break away and run until {foe} gives up the chase.`, hook: `You're safe, for now.` },
      { id: 'c.gen.flee.1', lead: `You turn and go. {Foe} follows for a while, then lets you go.`, hook: `Live to fight another day.` },
      { id: 'c.gen.flee.2', lead: `You slip clear of {foe} and keep moving.`, hook: `Your heart doesn't slow for a long time.` },
    ],
    fleeFail: [
      { id: 'c.gen.flf.0', lead: `You try to break away, but {foe} cuts you off.` },
      { id: 'c.gen.flf.1', lead: `You turn to run, and {foe} is right there.` },
      { id: 'c.gen.flf.2', lead: `No gap. {Foe} won't let you leave.` },
    ],
  },
  'foe.ash-wolf': {
    intro: [
      { id: 'c.wolf.intro.0', lead: `An ash wolf slinks out of the furrows, grey as cinders, head low.`, hook: `It's decided you're food.` },
      { id: 'c.wolf.intro.1', lead: `The smell reaches you first, burnt fur and cold smoke. Then the ash wolf steps into view.`, hook: `It doesn't growl. It just comes.` },
      { id: 'c.wolf.intro.2', lead: `Grey shape, yellow eyes. An ash wolf circles you once, unhurried.`, hook: `Then it stops circling.` },
    ],
    hit: [
      { id: 'c.wolf.hit.0', lead: `You catch the ash wolf across the shoulder with {weapon}, and cinders puff from its fur.` },
      { id: 'c.wolf.hit.1', lead: `You catch the wolf's flank with {weapon}, and it yelps and skitters back.` },
      { id: 'c.wolf.hit.2', lead: `You drive {weapon} at the ash wolf as it lunges, and it pays for the lunge.` },
    ],
    miss: [
      { id: 'c.wolf.miss.0', lead: `The ash wolf flows around {weapon} like smoke.` },
      { id: 'c.wolf.miss.1', lead: `You swing. The wolf is already somewhere else.` },
      { id: 'c.wolf.miss.2', lead: `You hit dirt with {weapon}, and the wolf's teeth flash where your arm just was.` },
    ],
    crit: [
      { id: 'c.wolf.crit.0', lead: `The wolf leaps, and you meet it with {weapon} square in the chest.` },
      { id: 'c.wolf.crit.1', lead: `You read the lunge before it comes and put {weapon} right where the wolf is going to be.` },
      { id: 'c.wolf.crit.2', lead: `A perfect strike. The ash wolf goes tumbling in a burst of grey ash.` },
    ],
    fumble: [
      { id: 'c.wolf.fum.0', lead: `You stumble in the soft furrow and swing {weapon} at nothing.` },
      { id: 'c.wolf.fum.1', lead: `Pale dust kicks into your eyes mid-swing.` },
      { id: 'c.wolf.fum.2', lead: `You overcommit, and the wolf watches you do it.` },
    ],
    foeHit: [
      { id: 'c.wolf.fh.0', lead: `The ash wolf darts in and its teeth find your leg.` },
      { id: 'c.wolf.fh.1', lead: `Claws rake your forearm, hot as embers.` },
      { id: 'c.wolf.fh.2', lead: `The wolf snaps, and connects.` },
    ],
    foeMiss: [
      { id: 'c.wolf.fm.0', lead: `Jaws close on air an inch from your knee.` },
      { id: 'c.wolf.fm.1', lead: `The wolf lunges and you twist away.` },
      { id: 'c.wolf.fm.2', lead: `It feints, then strikes, and your guard holds.` },
    ],
    foeCrit: [
      { id: 'c.wolf.fc.0', lead: `The ash wolf hits you full force and you go down to one knee.` },
      { id: 'c.wolf.fc.1', lead: `Teeth sink in deep before you can shake it off.` },
      { id: 'c.wolf.fc.2', lead: `The wolf drags you half off your feet.` },
    ],
    victory: [
      { id: 'c.wolf.win.0', lead: `The ash wolf falls and doesn't rise. Cinder dust settles over it.`, hook: `The fields go quiet again, as if they'd been holding their breath.` },
      { id: 'c.wolf.win.1', when: { needs: ['loot'] }, lead: `The wolf goes still. Its grey pelt smells of cinders, and a trader might want it.`, hook: `You take it. Somebody in Emberford will pay.` },
      { id: 'c.wolf.win.2', when: { hpLow: true }, lead: `The wolf drops, and you sit down hard beside it.`, hook: `The bites burn. Mossglass, or the Kettle's hearth. Soon.` },
      { id: 'c.wolf.win.al', when: { pack: 'ash-ledger' }, lead: `The ash wolf is dead. You're bleeding.`, hook: `The account is roughly even.` },
    ],
    defeat: [
      { id: 'c.wolf.lose.0', lead: `The ash wolf's weight bears you down into the pale dirt.` },
      { id: 'c.wolf.lose.1', lead: `Teeth, dust, and then nothing at all.` },
      { id: 'c.wolf.lose.2', lead: `You fall. The last thing you hear is the wolf's breath.` },
    ],
    fleeOk: [
      { id: 'c.wolf.flee.0', lead: `You run, and the ash wolf follows to the edge of the furrows, then stops.`, hook: `It watches you go.` },
      { id: 'c.wolf.flee.1', lead: `You back off fast, then turn and run.`, hook: `The wolf decides you aren't worth the chase.` },
      { id: 'c.wolf.flee.2', lead: `You put distance between you, and the grey shape fades into the fields.`, hook: `For now.` },
    ],
    fleeFail: [
      { id: 'c.wolf.flf.0', lead: `You turn to run, and the ash wolf is faster.` },
      { id: 'c.wolf.flf.1', lead: `The wolf cuts across your path, low and quick.` },
      { id: 'c.wolf.flf.2', lead: `You can't outrun a wolf, and this one knows it.` },
    ],
  },
  'foe.scarecrow-husk': {
    intro: [
      { id: 'c.husk.intro.0', lead: `The scarecrow isn't leaning on the wind. It's leaning toward you.`, body: `It pulls free of its post with a dry crackle and steps down.`, hook: `It has nothing where its face should be, and it's coming anyway.` },
      { id: 'c.husk.intro.1', lead: `A scarecrow husk lurches out of the furrows, straw spilling from its sleeves.`, hook: `Red thread glints at its chest, twitching.` },
      { id: 'c.husk.intro.2', lead: `Sackcloth head, straw hands, a coat that flaps with no wind. The husk turns toward you.`, hook: `It's no longer just the wind.` },
    ],
    hit: [
      { id: 'c.husk.hit.0', lead: `You tear through sackcloth with {weapon}, and straw sprays across the furrow.` },
      { id: 'c.husk.hit.1', lead: `You drive {weapon} into the husk's chest and it rocks back, rustling.` },
      { id: 'c.husk.hit.2', lead: `You land a clean strike with {weapon}, and the husk sheds an armful of straw.` },
    ],
    miss: [
      { id: 'c.husk.miss.0', lead: `The husk folds away from {weapon} at an angle nothing with bones could manage.` },
      { id: 'c.husk.miss.1', lead: `You swing and catch only the flapping hem of its coat.` },
      { id: 'c.husk.miss.2', lead: `You drive {weapon} through loose straw and find nothing solid.` },
    ],
    crit: [
      { id: 'c.husk.crit.0', lead: `You find the perfect opening and use {weapon} to rip the husk half apart.` },
      { id: 'c.husk.crit.1', lead: `One clean blow, and the husk's sackcloth head spins off into the furrows.` },
      { id: 'c.husk.crit.2', lead: `You put everything into it. Straw explodes into the air.` },
    ],
    fumble: [
      { id: 'c.husk.fum.0', lead: `Your foot catches a furrow and you go stumbling past the husk.` },
      { id: 'c.husk.fum.1', lead: `Straw in your eyes. You swing {weapon} at nothing.` },
      { id: 'c.husk.fum.2', lead: `You swing too hard and spin half around.` },
    ],
    foeHit: [
      { id: 'c.husk.fh.0', lead: `A straw fist cracks across your jaw, much harder than straw should hit.` },
      { id: 'c.husk.fh.1', lead: `The husk lunges and its fingers rake you, sharp as stubble.` },
      { id: 'c.husk.fh.2', lead: `It swings an arm like a flail, and connects.` },
    ],
    foeMiss: [
      { id: 'c.husk.fm.0', lead: `The husk lashes out and misses, and its coat snaps like a flag.` },
      { id: 'c.husk.fm.1', lead: `It grabs for you and closes on air.` },
      { id: 'c.husk.fm.2', lead: `A wild straw swing goes over your head.` },
    ],
    foeCrit: [
      { id: 'c.husk.fc.0', lead: `The husk catches you full in the chest and you go sprawling.` },
      { id: 'c.husk.fc.1', lead: `Straw hands clamp around your arm and twist.` },
      { id: 'c.husk.fc.2', lead: `It hits you with its whole weight, and it weighs far more than straw.` },
    ],
    victory: [
      { id: 'c.husk.win.0', lead: `The husk folds in on itself and collapses into a heap of straw and sackcloth.`, hook: `The other scarecrows lean in the wind. They're only scarecrows, you hope.` },
      { id: 'c.husk.win.1', when: { needs: ['loot'] }, lead: `The husk falls and doesn't rise. Tangled in the straw is a knot of red thread, still twitching faintly.`, hook: `You pocket it before you can think better of it.` },
      { id: 'c.husk.win.2', when: { hpLow: true }, lead: `The husk comes apart in a last dry rustle. You stand over it, breathing hard and bleeding a little.`, hook: `Mossglass sells remedies, and the Kettle has a hearth. Either would do.` },
      { id: 'c.husk.win.al', when: { pack: 'ash-ledger', needs: ['goldGained'] }, lead: `The husk is straw again, and there's a little coin caught in its coat.`, hook: `It's not much, but it's yours now.` },
    ],
    defeat: [
      { id: 'c.husk.lose.0', lead: `Straw hands close over you, and the furrows tilt up to meet your face.` },
      { id: 'c.husk.lose.1', lead: `The husk's blow lands, and the sky goes out.` },
      { id: 'c.husk.lose.2', lead: `You go down among the pale dust and the rustling.` },
    ],
    fleeOk: [
      { id: 'c.husk.flee.0', lead: `You break away and run. The husk takes three steps after you, then stands still in the furrow.`, hook: `When you look back, it's on its post again.` },
      { id: 'c.husk.flee.1', lead: `You run until the rustling stops.`, hook: `Behind you, the scarecrows are only scarecrows again.` },
      { id: 'c.husk.flee.2', lead: `You outpace it easily. It was never built for running.`, hook: `It watches you go without eyes.` },
    ],
    fleeFail: [
      { id: 'c.husk.flf.0', lead: `You turn to run and a straw hand snags your cloak.` },
      { id: 'c.husk.flf.1', lead: `The husk lurches sideways into your path.` },
      { id: 'c.husk.flf.2', lead: `You stumble in the furrows, and the husk is on you again.` },
    ],
  },
  'foe.road-bandit': {
    intro: [
      { id: 'c.bandit.intro.0', lead: `A road bandit steps out of the hedgerow with a blade in hand. "Purse. Now."`, hook: `They don't look like they'll ask twice.` },
      { id: 'c.bandit.intro.1', lead: `"Long road," says a voice behind the watch-stone. A road bandit comes around it, smiling.`, hook: `"Shorter if you pay the toll."` },
      { id: 'c.bandit.intro.2', lead: `A road bandit blocks the vale road, dagger loose in one hand.`, hook: `They're sizing up your boots, your pack, your purse.` },
    ],
    hit: [
      { id: 'c.bandit.hit.0', lead: `You drive {weapon} past the bandit's guard, and they curse.` },
      { id: 'c.bandit.hit.1', lead: `You catch the bandit with {weapon}, and they stagger back into the hedge.` },
      { id: 'c.bandit.hit.2', lead: `A clean strike with {weapon}. The bandit's grin slips.` },
    ],
    miss: [
      { id: 'c.bandit.miss.0', lead: `The bandit sidesteps {weapon} with a road-fighter's ease.` },
      { id: 'c.bandit.miss.1', lead: `You swing. The bandit laughs and steps back.` },
      { id: 'c.bandit.miss.2', lead: `You bring {weapon} in, and the bandit's dagger turns it aside.` },
    ],
    crit: [
      { id: 'c.bandit.crit.0', lead: `The bandit lunges, and you're ready for it. You land {weapon} hard.` },
      { id: 'c.bandit.crit.1', lead: `You see the gap in their guard and put {weapon} right through it.` },
      { id: 'c.bandit.crit.2', lead: `A perfect blow, and the bandit's knees buckle.` },
    ],
    fumble: [
      { id: 'c.bandit.fum.0', lead: `You slip on the cart ruts and send {weapon} wide.` },
      { id: 'c.bandit.fum.1', lead: `You overreach, and the bandit grins.` },
      { id: 'c.bandit.fum.2', lead: `A bad swing leaves you wide open.` },
    ],
    foeHit: [
      { id: 'c.bandit.fh.0', lead: `The bandit's dagger slices a hot line across your arm.` },
      { id: 'c.bandit.fh.1', lead: `They feint high and stab low, and it lands.` },
      { id: 'c.bandit.fh.2', lead: `A dirty elbow catches your ribs.` },
    ],
    foeMiss: [
      { id: 'c.bandit.fm.0', lead: `The bandit's dagger flicks out and misses.` },
      { id: 'c.bandit.fm.1', lead: `They try the same feint twice. It doesn't work twice.` },
      { id: 'c.bandit.fm.2', lead: `The bandit lunges, and your guard holds.` },
    ],
    foeCrit: [
      { id: 'c.bandit.fc.0', lead: `The bandit gets inside your guard and the dagger goes in.` },
      { id: 'c.bandit.fc.1', lead: `A vicious, practised cut.` },
      { id: 'c.bandit.fc.2', lead: `The bandit's knee finds your gut and folds you over.` },
    ],
    victory: [
      { id: 'c.bandit.win.0', lead: `The bandit goes down in the road and stays down.`, hook: `The hedgerow is quiet. Nobody else steps out.` },
      { id: 'c.bandit.win.1', when: { needs: ['loot'] }, lead: `The bandit drops, and their dagger skitters across the ruts.`, hook: `It's yours now, along with whatever was in their purse.` },
      { id: 'c.bandit.win.2', when: { hpLow: true }, lead: `The bandit falls. You lean on your knees and try to remember how breathing works.`, hook: `Emberford isn't far.` },
      { id: 'c.bandit.win.al', when: { pack: 'ash-ledger', needs: ['goldGained'] }, lead: `The bandit's purse is heavier than yours was.`, hook: `It isn't now.` },
    ],
    defeat: [
      { id: 'c.bandit.lose.0', lead: `The bandit's dagger finds you one last time and the road tilts away.` },
      { id: 'c.bandit.lose.1', lead: `You hit the cart ruts. The last thing you hear is the bandit laughing.` },
      { id: 'c.bandit.lose.2', lead: `Hands at your belt, and then nothing.` },
    ],
    fleeOk: [
      { id: 'c.bandit.flee.0', lead: `You break off and run, and the bandit doesn't bother chasing.`, hook: `"Next time," they call after you.` },
      { id: 'c.bandit.flee.1', lead: `You push through the hedgerow and keep going.`, hook: `The road behind you is empty when you finally look.` },
      { id: 'c.bandit.flee.2', lead: `You outrun them. Bandits are lazy about chasing.`, hook: `You'll come back to this road when you're ready.` },
    ],
    fleeFail: [
      { id: 'c.bandit.flf.0', lead: `You turn to run and the bandit cuts you off.` },
      { id: 'c.bandit.flf.1', lead: `"Not so fast." The bandit steps into your path.` },
      { id: 'c.bandit.flf.2', lead: `The hedgerow is too thick to break through.` },
    ],
  },
  'foe.cellar-rat': {
    intro: [
      { id: 'c.rat.intro.0', lead: `The scratching stops. A giant cellar rat climbs out from behind the casks, nearly the size of a dog.`, hook: `It isn't afraid of you at all.` },
      { id: 'c.rat.intro.1', lead: `Two red eyes in the dark between the casks, then a long pale tail. The cellar rat squeals.`, hook: `It's coming for you.` },
      { id: 'c.rat.intro.2', lead: `Something heavy drops off the spice-chest. A giant cellar rat, bristling.`, hook: `So that's what's been in Hollis's cider.` },
    ],
    hit: [
      { id: 'c.rat.hit.0', lead: `You catch the rat with {weapon}, and it squeals and tumbles into a cask.` },
      { id: 'c.rat.hit.1', lead: `You connect with {weapon}, and the rat skids across the stone.` },
      { id: 'c.rat.hit.2', lead: `You land a solid blow with {weapon}. The rat hisses.` },
    ],
    miss: [
      { id: 'c.rat.miss.0', lead: `The rat darts between the casks, and you put {weapon} into oak instead.` },
      { id: 'c.rat.miss.1', lead: `You swing low and miss. It's quicker than it looks.` },
      { id: 'c.rat.miss.2', lead: `You hit the cellar floor with {weapon}, and the rat is gone.` },
    ],
    crit: [
      { id: 'c.rat.crit.0', lead: `You pin the rat against a cask with one perfect blow.` },
      { id: 'c.rat.crit.1', lead: `You catch the rat mid-leap with {weapon}.` },
      { id: 'c.rat.crit.2', lead: `One clean strike and the rat flips over.` },
    ],
    fumble: [
      { id: 'c.rat.fum.0', lead: `You slip on the damp stone.` },
      { id: 'c.rat.fum.1', lead: `You crack {weapon} against a cask hoop.` },
      { id: 'c.rat.fum.2', lead: `You swing at a shadow. It wasn't the rat.` },
    ],
    foeHit: [
      { id: 'c.rat.fh.0', lead: `The rat's teeth sink into your ankle.` },
      { id: 'c.rat.fh.1', lead: `It scrambles up your leg, clawing.` },
      { id: 'c.rat.fh.2', lead: `A quick, nasty bite.` },
    ],
    foeMiss: [
      { id: 'c.rat.fm.0', lead: `The rat snaps at your boot and misses.` },
      { id: 'c.rat.fm.1', lead: `It lunges and you kick it away.` },
      { id: 'c.rat.fm.2', lead: `The rat darts in, then thinks better of it.` },
    ],
    foeCrit: [
      { id: 'c.rat.fc.0', lead: `The rat leaps for your face, and its teeth find your cheek.` },
      { id: 'c.rat.fc.1', lead: `It bites deep and hangs on.` },
      { id: 'c.rat.fc.2', lead: `The rat finds your hand and won't let go.` },
    ],
    victory: [
      { id: 'c.rat.win.0', lead: `The cellar rat goes still among the casks.`, hook: `Hollis will be glad to hear it.` },
      { id: 'c.rat.win.1', lead: `One last squeal, and the cellar is quiet. Just drips and cider again.`, hook: `The spice-chest is still locked, but at least nothing's chewing on it.` },
      { id: 'c.rat.win.2', when: { needs: ['goldGained'] }, lead: `The rat's down. In its nest behind the casks, a coin glints.`, hook: `Finders keepers.` },
      { id: 'c.rat.win.hl', when: { pack: 'hearthlight' }, lead: `The rat's done for. Hollis's cider is safe.`, hook: `He'll probably stand you a mug for it.` },
    ],
    defeat: [
      { id: 'c.rat.lose.0', lead: `You go down on the cold stone, and the casks spin.` },
      { id: 'c.rat.lose.1', lead: `Bested by a rat. The dark of the cellar closes in.` },
      { id: 'c.rat.lose.2', lead: `Teeth, cold stone, and then nothing.` },
    ],
    fleeOk: [
      { id: 'c.rat.flee.0', lead: `You scramble up the cellar stairs and the rat doesn't follow.`, hook: `It squeals at you from the dark.` },
      { id: 'c.rat.flee.1', lead: `You back up the stairs, and the rat retreats behind the casks.`, hook: `It's still down there.` },
      { id: 'c.rat.flee.2', lead: `You get clear and slam the cellar door.`, hook: `Scratching, from the other side.` },
    ],
    fleeFail: [
      { id: 'c.rat.flf.0', lead: `The rat darts between you and the stairs.` },
      { id: 'c.rat.flf.1', lead: `You turn to go and it latches onto your boot.` },
      { id: 'c.rat.flf.2', lead: `You slip on the bottom step.` },
    ],
  },
  'foe.ruffian': {
    intro: [
      { id: 'c.ruff.intro.0', lead: `A rowdy ruffian shoves up off a bench and squares up to you, knuckles cracking.`, hook: `"Want something?"` },
      { id: 'c.ruff.intro.1', lead: `A rowdy ruffian takes your move as an invitation.`, hook: `They're grinning, and they're bigger than you'd like.` },
      { id: 'c.ruff.intro.2', lead: `"You looking for trouble?" A rowdy ruffian steps in close. "Found it."`, hook: `Nobody else gets involved.` },
    ],
    hit: [
      { id: 'c.ruff.hit.0', lead: `You catch the ruffian with {weapon}, and they stagger.` },
      { id: 'c.ruff.hit.1', lead: `You land {weapon}, and the ruffian's grin disappears.` },
      { id: 'c.ruff.hit.2', lead: `You drive {weapon} into the ruffian's ribs.` },
    ],
    miss: [
      { id: 'c.ruff.miss.0', lead: `The ruffian ducks {weapon} with a brawler's instinct.` },
      { id: 'c.ruff.miss.1', lead: `You swing, and they're not there.` },
      { id: 'c.ruff.miss.2', lead: `You swing {weapon} wide. The ruffian laughs.` },
    ],
    crit: [
      { id: 'c.ruff.crit.0', lead: `You catch the ruffian right on the jaw with {weapon}.` },
      { id: 'c.ruff.crit.1', lead: `One perfect blow, and the ruffian's eyes cross.` },
      { id: 'c.ruff.crit.2', lead: `You find the opening and use it.` },
    ],
    fumble: [
      { id: 'c.ruff.fum.0', lead: `You trip over your own feet.` },
      { id: 'c.ruff.fum.1', lead: `A wild swing, and you nearly fall over.` },
      { id: 'c.ruff.fum.2', lead: `You overreach, and the ruffian grins wider.` },
    ],
    foeHit: [
      { id: 'c.ruff.fh.0', lead: `A meaty fist catches you in the ribs.` },
      { id: 'c.ruff.fh.1', lead: `The ruffian clips you on the ear, and it rings.` },
      { id: 'c.ruff.fh.2', lead: `They shove you hard and follow it with a punch.` },
    ],
    foeMiss: [
      { id: 'c.ruff.fm.0', lead: `The ruffian swings wild and misses.` },
      { id: 'c.ruff.fm.1', lead: `You duck a haymaker.` },
      { id: 'c.ruff.fm.2', lead: `Their fist whistles past your nose.` },
    ],
    foeCrit: [
      { id: 'c.ruff.fc.0', lead: `The ruffian's fist lands square, and stars burst behind your eyes.` },
      { id: 'c.ruff.fc.1', lead: `A headbutt you never saw coming.` },
      { id: 'c.ruff.fc.2', lead: `They grab your collar and hit you twice.` },
    ],
    victory: [
      { id: 'c.ruff.win.0', lead: `The ruffian goes down and decides to stay down.`, hook: `"Fine," they mumble. "Fine."` },
      { id: 'c.ruff.win.1', when: { needs: ['goldGained'] }, lead: `The ruffian sprawls, and a few coins spill from their pocket.`, hook: `Call it payment for the trouble.` },
      { id: 'c.ruff.win.2', when: { hpLow: true }, lead: `The ruffian drops. You're not in much better shape.`, hook: `Maybe pick your fights more carefully.` },
    ],
    defeat: [
      { id: 'c.ruff.lose.0', lead: `The ruffian's fist is the last thing you see.` },
      { id: 'c.ruff.lose.1', lead: `You hit the floor hard, and someone laughs.` },
      { id: 'c.ruff.lose.2', lead: `Lights out.` },
    ],
    fleeOk: [
      { id: 'c.ruff.flee.0', lead: `You back off, hands up, and the ruffian lets you go.`, hook: `"Thought so," they say.` },
      { id: 'c.ruff.flee.1', lead: `You slip away and the ruffian loses interest.`, hook: `There'll be other fights.` },
      { id: 'c.ruff.flee.2', lead: `You walk away fast.`, hook: `Pride heals, eventually.` },
    ],
    fleeFail: [
      { id: 'c.ruff.flf.0', lead: `The ruffian grabs your collar before you can go.` },
      { id: 'c.ruff.flf.1', lead: `"Where you going?" They step in your way.` },
      { id: 'c.ruff.flf.2', lead: `You try to slip away and get shoved back.` },
    ],
  },
};

/** Appended after any foe's defeat line. Today's wake rules: Copper Kettle common room, half HP, half gold lost. */
export const DEFEAT_WAKE: Bank = [
  { id: 'wake.hl.0', when: { pack: 'hearthlight' }, lead: `You wake to hearth-warmth in the Copper Kettle's common room. Someone carried you back.`, hook: `Hollis sets a cup of water by your hand and doesn't ask.` },
  { id: 'wake.hl.1', when: { pack: 'hearthlight', needs: ['goldLost'] }, lead: `You come to on a bench by the Kettle's hearth, wrapped in someone's spare cloak.`, body: `Your purse is lighter, but you're alive, and someone cared enough to bring you here.`, hook: `That's worth more than coin.` },
  { id: 'wake.al.0', when: { pack: 'ash-ledger', needs: ['goldLost'] }, lead: `You wake on a bench in the Kettle's common room. Whoever dragged you here didn't leave a name.`, hook: `They left your purse, though, lighter than it was.` },
  { id: 'wake.al.1', when: { pack: 'ash-ledger' }, lead: `Cold ash, a hard bench, the Kettle's common room.`, body: `You're alive. That's the good news.`, hook: `Hollis glances over from the bar, then back at his chalk board.` },
  { id: 'wake.any.0', lead: `You wake in the Copper Kettle's common room, aching all over.`, hook: `Somebody hauled you back. You'll find out who, maybe.` },
  { id: 'wake.any.1', when: { needs: ['goldLost'] }, lead: `You wake by the Kettle's hearth with a splitting head and a lighter purse.`, hook: `At least you woke.` },
];

/** Player stance / spell halves (generic; per-foe flavour is not needed). */
export const COMBAT_ACTION: Record<'defend' | 'dodge' | 'castHit' | 'castMiss' | 'castCrit' | 'noCaster', Bank> = {
  defend: [
    { id: 'ca.def.0', lead: `You set your feet and raise your guard.` },
    { id: 'ca.def.1', lead: `You hunker down behind your guard and wait for {foe} to commit.` },
    { id: 'ca.def.2', lead: `You plant yourself and let {foe} come to you.` },
  ],
  dodge: [
    { id: 'ca.dod.0', lead: `You stay light and moving, making yourself hard to pin down.` },
    { id: 'ca.dod.1', lead: `You weave and sidestep, never where {foe} expects.` },
    { id: 'ca.dod.2', lead: `You keep your weight on your toes and your eyes on {foe}.` },
  ],
  castHit: [
    { id: 'ca.ch.0', lead: `A spark bolt cracks from your fingers and scorches {foe}.` },
    { id: 'ca.ch.1', lead: `You snap your hand forward and the spark lands with a hiss.` },
    { id: 'ca.ch.2', lead: `Light jumps from your palm to {foe}, and it flinches back.` },
  ],
  castMiss: [
    { id: 'ca.cm.0', lead: `The spark bolt sputters wide of {foe}.` },
    { id: 'ca.cm.1', lead: `Your spell fizzles into the dirt.` },
    { id: 'ca.cm.2', lead: `The spark flies past {foe} and dies.` },
  ],
  castCrit: [
    { id: 'ca.cc.0', lead: `Your spark bolt detonates against {foe} in a blinding flash.` },
    { id: 'ca.cc.1', lead: `The spell lands perfectly and {foe} is wreathed in light.` },
    { id: 'ca.cc.2', lead: `Everything you have goes into it. {Foe} takes the full blast.` },
  ],
  noCaster: [
    { id: 'ca.nc.0', lead: `You're no spellcaster, but you scrape up a feeble spark anyway.` },
    { id: 'ca.nc.1', lead: `You try a trick you saw once. A tiny spark answers.` },
    { id: 'ca.nc.2', lead: `Magic isn't your trade. You manage a flicker.` },
  ],
};

/** "look for trouble" where FOES_BY_LOCATION has nothing (not the ruffian-on-attack fallback). */
export const SEEK_NO_FOES: Bank = [
  { id: 'seek.none.0', lead: `Nothing here wants a fight.`, hook: `Trouble roams the Ashen Fields and the vale road, and something scratches in the Kettle cellar.` },
  { id: 'seek.none.1', lead: `You look for trouble at {place}. It isn't here.`, hook: `Try the Ashen Fields, or the vale road. Or Hollis's cellar, if you don't mind rats.` },
  { id: 'seek.none.2', when: { pack: 'ash-ledger' }, lead: `Nobody at {place} is worth the risk of a fight.`, hook: `Out on the Ashen Fields and the vale road, things are less polite.` },
  { id: 'seek.none.3', when: { pack: 'hearthlight' }, lead: `{place} is peaceful, and that's worth protecting.`, hook: `If you want a fight, the Ashen Fields and the vale road have one waiting.` },
];

/** Blocked by combat (travel / wait / trade / rest) — {foe} required. */
export const COMBAT_BLOCKED: Bank = [
  { id: 'cb.0', lead: `Not with {foe} on you.`, hook: `Fight, or flee.` },
  { id: 'cb.1', lead: `{Foe} isn't going to let you do that.`, hook: `Deal with it first.` },
  { id: 'cb.2', lead: `There's no time. {Foe} is right there.`, hook: `Act, or break away.` },
];

/* ═══════════════════════════ TRAVEL EDGE CASES ═══════════════════════════ */
export const TRAVEL_REFUSED: Bank = [
  { id: 'tr.ref.0', lead: `You can't get there from {place}, not directly.`, hook: `The Map shows which ways lead on from here.` },
  { id: 'tr.ref.1', lead: `That's not a road you can take from here.`, hook: `Name somewhere closer and start from there.` },
  { id: 'tr.ref.2', lead: `You'd have to go the long way round.`, hook: `Pick one of the ways out of {place} first.` },
];
export const TRAVEL_AT_BOUNDARY: Bank = [
  { id: 'tr.edge.0', lead: `You're already at {place}, at the open edge of the map.`, hook: `There's nowhere further to go from here. Name a nearby place instead.` },
  { id: 'tr.edge.1', lead: `This is as far as the known roads go.`, hook: `Turn back toward somewhere with a name.` },
  { id: 'tr.edge.2', lead: `Past {place}, the map runs out.`, hook: `For now, the roads lead back the way you came.` },
];

/* ═══════════════════ CUSTOM BEAT FALLBACKS (unmatched free text) ═══════════════════ */
/*
 * Replaces FLAVOR_POOLS + FILLER_ENDINGS + customBeatPrefix/customBeatFallback for the stub.
 * The stub doesn't know the outcome, so lines are honest: you tried something, here's one real detail,
 * here's a real next step. Compose: lead [+ LOCATION_DETAILS pick at standard/lush] + hook.
 */
export const CUSTOM: Record<'talk' | 'search' | 'take' | 'travel' | 'fight' | 'rest' | 'general', Bank> = {
  talk: [
    { id: 'cu.talk.0', lead: `You speak up. Heads turn at {place}, but nobody answers you outright.`, hook: `If you want an answer, find someone by name.` },
    { id: 'cu.talk.1', lead: `Your words hang in the air at {place}.`, hook: `Hollis, Dagna and Fennick are the ones in Emberford who'll talk back.` },
    { id: 'cu.talk.2', when: { companions: true }, lead: `You talk it through with {companions}.`, hook: `It's something to think about on the road.` },
  ],
  search: [
    { id: 'cu.search.0', lead: `You search carefully, corners first.`, hook: `Nothing you can take, but you know {place} better now.` },
    { id: 'cu.search.1', lead: `You poke around {place} and turn up dust, and not much else.`, hook: `If there's something here, it's well hidden.` },
    { id: 'cu.search.2', when: { pack: 'ash-ledger' }, lead: `You search {place} for anything worth having. Someone got here first.`, hook: `There's nothing free here, as usual.` },
    { id: 'cu.search.3', when: { pack: 'hearthlight' }, lead: `You search {place} carefully and find nothing but a forgotten button.`, hook: `Someone will miss it. Not you, though.` },
  ],
  take: [
    { id: 'cu.take.0', lead: `You reach for it, and think better of it. It isn't yours.`, hook: `Things worth having are bought, earned or won.` },
    { id: 'cu.take.1', lead: `There's nothing here you can just pick up.`, hook: `The shops in Emberford sell what you need.` },
    { id: 'cu.take.2', lead: `Your hands come away empty.`, hook: `Fights pay out, and so do shops. Floors don't.` },
  ],
  travel: [
    { id: 'cu.trav.0', lead: `You look for the way, but no road by that name leads out of {place}.`, hook: `Try one of the exits you know.` },
    { id: 'cu.trav.1', lead: `You start walking, and come back to where you started.`, hook: `Name a place nearby to head for it.` },
    { id: 'cu.trav.2', lead: `There's no path like that from {place}.`, hook: `The Map shows the ones there are.` },
  ],
  fight: [
    { id: 'cu.fight.0', lead: `You ready yourself, but there's nothing to swing at.`, hook: `Look for trouble where trouble lives.` },
    { id: 'cu.fight.1', lead: `Your hand goes to your weapon, but nobody here is a threat.`, hook: `The Ashen Fields have teeth. The Kettle cellar has rats.` },
    { id: 'cu.fight.2', lead: `You square up to empty air.`, hook: `Save it for something that's earned it.` },
  ],
  rest: [
    { id: 'cu.rest.0', lead: `You slow down and let your shoulders drop.`, hook: `For real healing, take a short rest, or a room at the Kettle.` },
    { id: 'cu.rest.1', lead: `You take a breath.`, hook: `A proper rest would do more.` },
    { id: 'cu.rest.2', lead: `You lean back and close your eyes for a moment.`, hook: `It's a start.` },
  ],
  general: [
    { id: 'cu.gen.0', lead: `You do it, and {place} carries on around you.`, hook: `Nothing's changed that you can see. Maybe that's the answer.` },
    { id: 'cu.gen.1', lead: `You try it.`, body: `Nothing breaks and nobody objects.`, hook: `What next?` },
    { id: 'cu.gen.2', when: { pack: 'hearthlight' }, lead: `You give it your best, and somebody at {place} smiles at the effort.`, hook: `It's a small thing, but small things add up.` },
    { id: 'cu.gen.3', when: { pack: 'ash-ledger' }, lead: `You do it. It costs you nothing, this time.`, hook: `Most things at {place} aren't so cheap.` },
    { id: 'cu.gen.4', when: { companions: true }, lead: `You go for it, and {companions} follows your lead.`, hook: `Whatever comes of it, you're in it together.` },
  ],
};

/* ═════════════════════════ COMPOSITION + SELECTION (reference impl) ═════════════════════════ */

export type Verbosity = 'short' | 'standard' | 'lush';

export type LineContext = {
  pack: PackKey;
  hpLow: boolean;
  companions: boolean;
  recentEvent: RecentEvent | null;
  timeOfDay: TimeOfDay | null; // null at 90524e0 — tagged lines never match
  hearth: HearthState | null;
  activeQuestIds: readonly string[];
  has: { loot: boolean; goldLost: boolean; goldGained: boolean };
  /* optional chronicle context (90524e0). Absent → lines tagged with it never match. */
  placeSeen?: PlaceSeen;
  metBefore?: boolean;
  wonThere?: boolean;
  doneQuestIds?: readonly string[];
};

/** True when every tag on the line matches ctx. Untagged = always. */
export function lineMatches(line: Line, ctx: LineContext): boolean {
  const w = line.when;
  if (!w) return true;
  if (w.pack && w.pack !== ctx.pack) return false;
  if (w.hpLow !== undefined && w.hpLow !== ctx.hpLow) return false;
  if (w.companions !== undefined && w.companions !== ctx.companions) return false;
  if (w.recentEvent) {
    const want = Array.isArray(w.recentEvent) ? w.recentEvent : [w.recentEvent];
    if (!ctx.recentEvent || !want.includes(ctx.recentEvent)) return false;
  }
  if (w.timeOfDay && w.timeOfDay !== ctx.timeOfDay) return false;
  if (w.hearth && w.hearth !== ctx.hearth) return false;
  if (w.quest && !ctx.activeQuestIds.includes(w.quest)) return false;
  if (w.needs) for (const n of w.needs) if (!ctx.has[n]) return false;
  if (w.placeSeen && w.placeSeen !== ctx.placeSeen) return false;
  if (w.metBefore !== undefined && w.metBefore !== ctx.metBefore) return false;
  if (w.wonThere !== undefined && w.wonThere !== ctx.wonThere) return false;
  if (w.questDone && !(ctx.doneQuestIds ?? []).includes(w.questDone)) return false;
  return true;
}

function specificity(line: Line): number {
  const w = line.when;
  if (!w) return 0;
  return (['pack', 'hpLow', 'companions', 'recentEvent', 'timeOfDay', 'hearth', 'quest', 'needs', 'placeSeen', 'metBefore', 'wonThere', 'questDone'] as const)
    .filter((k) => w[k] !== undefined).length;
}

/**
 * ANTI-REPEAT + SELECTION
 *  1. eligible = bank.filter(lineMatches)  (if empty → caller uses that path's generic bank).
 *  2. Situational lines (hpLow / recentEvent / hearth / quest / needs / companions) get a weight bonus
 *     but don't monopolise: weight = 1 + 2 * (number of non-pack tags).
 *     Pack-tagged lines get +1 so pack voice shows up more often than neutral lines.
 *  3. Drop the line whose id === lastId for this path (only if something else stays eligible).
 *  4. Weighted pick with the seeded rng (rng() in [0,1)). The engine supplies
 *     rng = createSeededRng(hashSeed(campaign.id, rngSeed, session.turn, beatCount, pathKey)).
 *  5. Persist the chosen id as flags[`narr.last.${pathKey}`] in the same patch as the beat.
 *  Same campaign + same inputs → same line (deterministic, testable). Never the same id twice in a row per path.
 */
export function pickLine(bank: Bank, ctx: LineContext, lastId: string | null, rng: () => number): Line | null {
  let eligible = bank.filter((l) => lineMatches(l, ctx));
  if (eligible.length === 0) return null;
  if (eligible.length > 1 && lastId) eligible = eligible.filter((l) => l.id !== lastId);
  const weights = eligible.map((l) => {
    const s = specificity(l);
    const packBonus = l.when?.pack ? 1 : 0;
    return 1 + 2 * (s - packBonus) + packBonus;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < eligible.length; i++) {
    r -= weights[i]!;
    if (r < 0) return eligible[i]!;
  }
  return eligible[eligible.length - 1]!;
}

export type TokenValues = Partial<Record<
  | 'place' | 'name' | 'companions' | 'keeper' | 'item' | 'foe' | 'Foe' | 'weapon' | 'loot' | 'questTitle'
  // chronicle / tab tokens (90524e0) — see CHRONICLE TOKEN MAP below
  | 'npc' | 'where' | 'foeA' | 'fightCount' | 'levelWord' | 'titles' | 'quests' | 'people',
  string
>>;

/** Fill {tokens}; a missing token is a bug — returns null so the caller falls back to a generic line. */
export function fillTokens(text: string, values: TokenValues): string | null {
  let missing = false;
  const out = text.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = (values as Record<string, string | undefined>)[k];
    if (v === undefined || v === '') { missing = true; return ''; }
    return v;
  });
  return missing ? null : out;
}

const capFirst = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Compose by verbosity. `detail` = one LOCATION_DETAILS / HEARTH_STATE pick (lush only). */
export function composeLine(line: Line, verbosity: Verbosity, values: TokenValues, detail?: string | null): string | null {
  const parts: (string | undefined | null)[] =
    verbosity === 'short' ? [line.lead, line.hook]
    : verbosity === 'lush' ? [line.lead, line.body, detail, line.hook]
    : [line.lead, line.body, line.hook];
  const filled: string[] = [];
  for (const p of parts) {
    if (!p) continue;
    const f = fillTokens(p, values);
    if (f === null) return null;
    filled.push(capFirst(f.trim()));
  }
  return filled.join(' ');
}

/* ═════════════════════════ MECHANICS LINE (spec + reference impl) ═════════════════════════ */
/*
 * Rendered UNDER the prose, never inside it. Built ONLY from the engine's computed delta for this beat
 * (the same numbers the patch applies) — never parsed from prose, never estimated.
 * Order: foe stats · Knocked out · level · max HP · ability points · quest · XP · gold · items gained · items lost · HP change · HP now · qty left · notes
 * (on defeat, gold moves after HP). Separator " · ".
 * Signs: "+" for gains, "−" (U+2212) for losses. Omit zero / absent fields. Empty delta → no line.
 * Examples:
 *   victory       +50 XP · +4 gold · Straw charm
 *   victory+ready +50 XP · Ash wolf pelt · Level up ready
 *   foe hits      −5 HP · HP 5/10
 *   buy           −1 gold · Trail rations
 *   sell          +6 gold · −Ash wolf pelt
 *   potion        +4 HP · HP 9/10 · 1 Healing potion left
 *   short rest    +3 HP · HP 8/10
 *   long rest     −5 gold · HP 16/16
 *   level up      Level 2 · Max HP 16 (+6) · +2 ability points
 *   defeat        Knocked out · HP 5/10 · −4 gold
 *   quest         Quest complete: First steps · +100 XP
 *   combat intro  Scarecrow husk · HP 11 · AC 11
 * Dice keep their own checkLine (rollLine) — do not merge dice into this line.
 */
export type MechanicsDelta = {
  level?: number;
  maxHp?: number;
  maxHpGain?: number;
  abilityPoints?: number;
  xp?: number;
  gold?: number; // signed
  itemsGained?: readonly string[];
  itemsLost?: readonly string[];
  hpChange?: number; // signed
  hp?: number;
  hpMax?: number;
  qtyLeft?: { name: string; qty: number };
  quest?: { status: 'noted' | 'updated' | 'complete' | 'failed'; title?: string };
  foeStats?: { name: string; hp: number; ac: number };
  notes?: readonly string[]; // fixed labels only: 'Knocked out', 'Level up ready', 'Room · 5 gold at the Copper Kettle'
};

const MINUS = '\u2212';
const signed = (n: number) => (n >= 0 ? `+${n}` : `${MINUS}${Math.abs(n)}`);

export function formatMechanicsLine(d: MechanicsDelta): string | null {
  const out: string[] = [];
  if (d.foeStats) out.push(`${d.foeStats.name} · HP ${d.foeStats.hp} · AC ${d.foeStats.ac}`);
  const notes = d.notes ?? [];
  if (notes.includes('Knocked out')) out.push('Knocked out');
  if (d.level !== undefined) out.push(`Level ${d.level}`);
  if (d.maxHp !== undefined) out.push(`Max HP ${d.maxHp}${d.maxHpGain ? ` (${signed(d.maxHpGain)})` : ''}`);
  if (d.abilityPoints) out.push(`+${d.abilityPoints} ability point${d.abilityPoints === 1 ? '' : 's'}`);
  if (d.quest) {
    const label = { noted: 'Quest noted', updated: 'Quest updated', complete: 'Quest complete', failed: 'Quest failed' }[d.quest.status];
    out.push(d.quest.title ? `${label}: ${d.quest.title}` : label);
  }
  if (d.xp) out.push(`${signed(d.xp)} XP`);
  // Defeat ordering is `Knocked out · HP x/y · −gold`, so gold moves after HP when knocked out.
  const goldFirst = !notes.includes('Knocked out');
  if (goldFirst && d.gold) out.push(`${signed(d.gold)} gold`);
  for (const n of d.itemsGained ?? []) out.push(n);
  for (const n of d.itemsLost ?? []) out.push(`${MINUS}${n}`);
  if (d.hpChange) out.push(`${signed(d.hpChange)} HP`);
  if (d.hp !== undefined && d.hpMax !== undefined) out.push(`HP ${d.hp}/${d.hpMax}`);
  if (!goldFirst && d.gold) out.push(`${signed(d.gold)} gold`);
  if (d.qtyLeft) out.push(d.qtyLeft.qty > 0 ? `${d.qtyLeft.qty} ${d.qtyLeft.name} left` : `No ${d.qtyLeft.name} left`);
  for (const n of notes) if (n !== 'Knocked out') out.push(n);
  return out.length ? out.join(' · ') : null;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CHRONICLE, TABS AND NPC HINTS  (added at ref 90524e0, after TABS-01 / 7311d1e)
 * Replaces Coder's placeholder copy in engine/npcs.ts, engine/chronicle.ts, engine/tabs.ts,
 * engine/combat.ts, engine/shop.ts, engine/input.ts, engine/campaignState.ts (STARTER_QUEST)
 * and the Character / Quest / Map / Companions tab screens. Exact mapping: wiring-notes.md §7.
 *
 * Two kinds of copy live here:
 *  - RECORDS: text written into the chronicle when an event happens (place notes, NPC notes,
 *    quest journal). Picked ONCE at write time with the seeded pick (pathKey = bank name),
 *    then persisted. Re-renders never re-roll them.
 *  - RENDERED: text the tabs build on every render (story so far, labels). Must be STABLE:
 *    pick with stablePick(bank, ctx, key) below (hash of campaign.id + key), never the turn rng,
 *    so the Character tab doesn't flicker between variants.
 *
 * CHRONICLE TOKEN MAP
 *  {npc}        NpcDef short name: 'Hollis' | 'Dagna' | 'Fennick'  (first word of NpcDef.name)
 *  {where}      LOCATION_LABELS[id].ref  e.g. "the Ashen Fields", "Emberford", "the common room"
 *               (replaces placePhrase(), which today prints "in Ashen Fields")
 *  {foeA}       articled lowercase foe name: "a scarecrow husk", "an ash wolf"  (articledFoe() in combat.ts)
 *  {fightCount} number WORD for victory deeds: "two" … "twelve", then "many"  (numberWord() below)
 *  {levelWord}  number word for the PC level: "two", "three" …
 *  {titles}     listJoin(chronicle.titles)
 *  {quests}     listJoin of quoted done-quest titles: “First steps” and “…”  (UI record, not Tale prose)
 *  {people}     listJoin of NPC short names in chronicle.npcs, most recently seen first
 *  {item}       lowercase item name (as above)  ·  {companions} as above
 *  Rule unchanged: no digits. Prices, XP and levels-as-numbers stay in the mechanics line or the
 *  existing numeric UI rows (Reward/Earned line, Level header, XP bar).
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

export type NpcId = 'npc.hollis' | 'npc.dagna' | 'npc.fennick';

/* ─────────────── NPC MENTIONS / HINTS ───────────────
 * note    → RECORD. Replaces NpcDef.mentions[].note (engine/npcs.ts). Stored once in
 *           chronicle.places[placeId].notes on first meeting; shown on the Map tab under the place.
 *           Keep the `Name: "…"` prefix: the Map card shows it without saying who spoke.
 * spoken  → Tale line when the NPC brings the place up: talk route, smallTalk, or the first-meet
 *           arrival beat. State-aware: placeSeen / wonThere / hpLow / companions / quest / pack.
 *           Context for placeSeen + wonThere is the place the hint is ABOUT, read BEFORE the patch.
 */
export const NPC_MENTIONS: Record<NpcId, Partial<Record<NodeId, { note: Bank; spoken: Bank }>>> = {
  'npc.hollis': {
    'locale.ashen-fields': {
      note: [
        { id: 'men.hol.fields.n.0', lead: `Hollis: "Trouble roams the Ashen Fields past town. Go armed, or don't go."` },
        { id: 'men.hol.fields.n.1', lead: `Hollis: "Past town the road runs out to the Ashen Fields. Scarecrows out there don't stay put."` },
        { id: 'men.hol.fields.n.2', when: { pack: 'hearthlight' }, lead: `Hollis: "Wolves on the Ashen Fields, and worse. I'd rather you came back."` },
        { id: 'men.hol.fields.n.3', when: { pack: 'ash-ledger' }, lead: `Hollis: "The Ashen Fields pay in pelts and charms, if you live to sell them."` },
      ],
      spoken: [
        { id: 'men.hol.fields.s.0', lead: `Hollis sets a mug down and lowers his voice. "Past town, the road runs out to the Ashen Fields. Trouble roams there, friend."`, hook: `"Take something sharper than good intentions."` },
        { id: 'men.hol.fields.s.1', lead: `"You'll hear folk talk about the Ashen Fields," Hollis says, wiping the bar. "Wolves. Scarecrows that don't stay put."`, hook: `"Believe them."` },
        { id: 'men.hol.fields.s.2', when: { placeSeen: 'visited', wonThere: true }, lead: `"Back from the Ashen Fields in one piece," Hollis says, and looks you over twice to be sure.`, hook: `"Good. I'll stop worrying. A little."` },
        { id: 'men.hol.fields.s.3', when: { placeSeen: 'visited', wonThere: false }, lead: `"You've seen the Fields, then," Hollis says. "Pale dirt in your boots for a week."`, hook: `"The scarecrows look worse up close, don't they?"` },
        { id: 'men.hol.fields.s.4', when: { hpLow: true }, lead: `Hollis eyes your scrapes. "The Ashen Fields will still be there tomorrow. Sit. Rest first."`, hook: `"The hearth costs nothing."` },
        { id: 'men.hol.fields.s.5', when: { companions: true }, lead: `Hollis nods at {companions}. "Good. Nobody should walk the Ashen Fields alone."`, hook: `"Watch each other's backs out there."` },
        { id: 'men.hol.fields.s.6', when: { quest: 'quest-first-steps' }, lead: `"Find your feet in town first," Hollis says. "The Ashen Fields can wait until you know the way back."`, hook: `"Emberford's right outside the door."` },
        { id: 'men.hol.fields.s.7', when: { pack: 'ash-ledger' }, lead: `Hollis taps the chalk board. "Ash wolf pelts sell. So do straw charms. The Ashen Fields are where you find both."`, hook: `"And where you find out what they cost."` },
        { id: 'men.hol.fields.s.8', when: { pack: 'hearthlight' }, lead: `"If you go out to the Ashen Fields," Hollis says, "come back by dark. There's always a seat by the fire."`, hook: `He doesn't say what's out there after dark.` },
      ],
    },
    'place.brightanvil': {
      note: [
        { id: 'men.hol.smith.n.0', lead: `Hollis: "Dagna's forge, if you need a blade or mail."` },
        { id: 'men.hol.smith.n.1', lead: `Hollis: "Brightanvil Smithy, along the street. Dagna sells blades and mail."` },
        { id: 'men.hol.smith.n.2', when: { pack: 'ash-ledger' }, lead: `Hollis: "Need steel? Dagna Brightanvil. Don't haggle. She won't."` },
        { id: 'men.hol.smith.n.3', when: { pack: 'hearthlight' }, lead: `Hollis: "Dagna at Brightanvil. Gruff, but her steel holds."` },
      ],
      spoken: [
        { id: 'men.hol.smith.s.0', lead: `"If you're heading out of town, see Dagna first," Hollis says. "Brightanvil Smithy, just along the street."`, hook: `"Blades, mail, whatever keeps you standing."` },
        { id: 'men.hol.smith.s.1', lead: `Hollis jerks a thumb toward the street. "You can hear Dagna's hammer from the door. Brightanvil Smithy."`, hook: `"Bring coin. She'll ask for it first."` },
        { id: 'men.hol.smith.s.2', when: { placeSeen: 'visited' }, lead: `"Dagna sort you out?" Hollis asks, glancing at your belt.`, hook: `"She doesn't talk much, but she doesn't sell junk."` },
        { id: 'men.hol.smith.s.3', when: { hpLow: true }, lead: `"Mail would've turned some of that," Hollis says, nodding at your wounds.`, hook: `"Dagna sells it. Brightanvil Smithy."` },
        { id: 'men.hol.smith.s.4', when: { pack: 'ash-ledger' }, lead: `"Dagna doesn't bargain," Hollis says. "Bring the full price or don't bother her."`, hook: `"Brightanvil, along the street."` },
        { id: 'men.hol.smith.s.5', when: { pack: 'hearthlight' }, lead: `"Dagna's gruff," Hollis says, smiling, "but she'd never sell you a blade that breaks."`, hook: `"Brightanvil Smithy. Follow the hammering."` },
      ],
    },
    'place.mossglass': {
      note: [
        { id: 'men.hol.moss.n.0', lead: `Hollis: "Fennick sells the potions I can't keep in stock."` },
        { id: 'men.hol.moss.n.1', lead: `Hollis: "Mossglass Alchemist, for anything I can't brew. Fennick's careful with a measure."` },
        { id: 'men.hol.moss.n.2', when: { pack: 'ash-ledger' }, lead: `Hollis: "Fennick at Mossglass. Exact prices, no favours."` },
        { id: 'men.hol.moss.n.3', when: { pack: 'hearthlight' }, lead: `Hollis: "Fennick at Mossglass keeps the good potions. Mind his counter, he polishes it."` },
      ],
      spoken: [
        { id: 'men.hol.moss.s.0', lead: `"Potions?" Hollis nods at the shelf. "I keep a couple. Fennick at Mossglass Alchemist keeps the rest."`, hook: `"He'll weigh your coin to the grain."` },
        { id: 'men.hol.moss.s.1', lead: `"Fennick's shop is the one with the labelled vials," Hollis says. "Mossglass Alchemist."`, hook: `"Don't touch the counter. He's just polished it."` },
        { id: 'men.hol.moss.s.2', when: { hpLow: true }, lead: `Hollis glances at your wounds. "I've only a potion or two on the shelf. Fennick at Mossglass has more."`, hook: `"Go before you need it worse."` },
        { id: 'men.hol.moss.s.3', when: { placeSeen: 'visited' }, lead: `"Fennick weigh out your coin to the last grain?" Hollis smiles. "He does that."`, hook: `"Fair man, though. Fair and final, he'd say."` },
        { id: 'men.hol.moss.s.4', when: { pack: 'ash-ledger' }, lead: `"Fennick prices everything to the copper," Hollis says. "Fair and final, he calls it."`, hook: `"Mossglass Alchemist, in town."` },
        { id: 'men.hol.moss.s.5', when: { pack: 'hearthlight' }, lead: `"If my shelf's bare, try Fennick," Hollis says. "Mossglass Alchemist. He fusses, but he's good."`, hook: `"Tell him Hollis sent you. He'll pretend not to care."` },
      ],
    },
  },
  'npc.dagna': {
    'locale.ashen-fields': {
      note: [
        { id: 'men.dag.fields.n.0', lead: `Dagna: "Ash wolves on the Fields. Bring something sharp."` },
        { id: 'men.dag.fields.n.1', lead: `Dagna: "Ashen Fields. Wolves. Take steel."` },
        { id: 'men.dag.fields.n.2', when: { pack: 'ash-ledger' }, lead: `Dagna: "The Fields eat the unarmed. Buy first."` },
        { id: 'men.dag.fields.n.3', when: { pack: 'hearthlight' }, lead: `Dagna: "Scarecrows on the Fields. Straw's no match for a good edge."` },
      ],
      spoken: [
        { id: 'men.dag.fields.s.0', lead: `Dagna doesn't look up from the anvil. "Going out to the Ashen Fields? Ash wolves. Bring something sharp."`, hook: `"I sell sharp."` },
        { id: 'men.dag.fields.s.1', lead: `"The Fields," Dagna says, as if that settles it. "Wolves and walking straw."`, hook: `"Steel handles both."` },
        { id: 'men.dag.fields.s.2', when: { placeSeen: 'visited', wonThere: true }, lead: `Dagna looks you over once. "Back from the Fields. Then the steel held."`, hook: `"Good."` },
        { id: 'men.dag.fields.s.3', when: { placeSeen: 'visited', wonThere: false }, lead: `"You've walked the Fields," Dagna says. "Now you know what to buy."`, hook: `She sets the hammer down and waits.` },
        { id: 'men.dag.fields.s.4', when: { hpLow: true }, lead: `Dagna eyes the blood on you. "Mail's cheaper than a grave. Coin first, though."`, hook: `"The Fields will still be there."` },
        { id: 'men.dag.fields.s.5', when: { companions: true }, lead: `Dagna counts heads: you and {companions}. "More blades. Good."`, hook: `"The Fields won't care how many of you there are. Arm all of you."` },
        { id: 'men.dag.fields.s.6', when: { pack: 'ash-ledger' }, lead: `"Wolves on the Fields. Coin on the counter," Dagna says. "One deals with the other."`, hook: `"Coin first."` },
        { id: 'men.dag.fields.s.7', when: { pack: 'hearthlight' }, lead: `"Ashen Fields?" Dagna grunts. "Go armed. Come back. Tell Hollis I said so."`, hook: `It's the most she's said all day.` },
      ],
    },
    'region.embervale': {
      note: [
        { id: 'men.dag.vale.n.0', lead: `Dagna: "Bandits work the vale road outside town."` },
        { id: 'men.dag.vale.n.1', lead: `Dagna: "Vale road's got bandits. They want what you carry."` },
        { id: 'men.dag.vale.n.2', when: { pack: 'ash-ledger' }, lead: `Dagna: "Watch the vale road. Bandits, and they're armed."` },
        { id: 'men.dag.vale.n.3', when: { pack: 'hearthlight' }, lead: `Dagna: "Keep your hand near your blade on the vale road."` },
      ],
      spoken: [
        { id: 'men.dag.vale.s.0', lead: `"Leaving town by the vale road?" Dagna says. "Bandits work it."`, hook: `"Keep your hand near your weapon."` },
        { id: 'men.dag.vale.s.1', lead: `Dagna quenches a blade; steam hides her face for a moment. "Road bandits on the vale. They pick the slow ones."`, hook: `"Don't be slow."` },
        { id: 'men.dag.vale.s.2', when: { placeSeen: 'visited', wonThere: true }, lead: `Dagna nods once. "You've had a bandit's measure on the vale road."`, hook: `"Keep your edge. They don't learn."` },
        { id: 'men.dag.vale.s.3', when: { placeSeen: 'visited', wonThere: false }, lead: `"You've walked the vale road," Dagna says. "Bandits see you?"`, hook: `She doesn't wait for an answer.` },
        { id: 'men.dag.vale.s.4', when: { hpLow: true }, lead: `"Patch up before the vale road," Dagna says. "Bandits pick the slow ones."`, hook: `"You look slow."` },
        { id: 'men.dag.vale.s.5', when: { pack: 'ash-ledger' }, lead: `"Bandits on the vale road take purses," Dagna says. "Spend yours here first."`, hook: `"Coin first."` },
        { id: 'men.dag.vale.s.6', when: { pack: 'hearthlight' }, lead: `"The vale road's pretty," Dagna says. "Bandits think so too."`, hook: `"Go armed."` },
      ],
    },
  },
  'npc.fennick': {
    'place.copper-kettle': {
      note: [
        { id: 'men.fen.kettle.n.0', lead: `Fennick: "Hollis at the Copper Kettle keeps a potion or two for travellers."` },
        { id: 'men.fen.kettle.n.1', lead: `Fennick: "For a bed, the Copper Kettle. For a cure, here."` },
        { id: 'men.fen.kettle.n.2', when: { pack: 'ash-ledger' }, lead: `Fennick: "The Copper Kettle rents beds. My prices are better measured."` },
        { id: 'men.fen.kettle.n.3', when: { pack: 'hearthlight' }, lead: `Fennick: "The Copper Kettle. Hollis keeps a warm fire and a potion or two."` },
      ],
      spoken: [
        { id: 'men.fen.kettle.s.0', lead: `Fennick sets a vial straight on its shelf. "If you need a bed, the Copper Kettle. Hollis keeps a potion or two for travellers as well."`, hook: `"Not as many as I do, of course."` },
        { id: 'men.fen.kettle.s.1', lead: `"Hollis," Fennick says, as though naming a rival. "Copper Kettle. Good fire. Small shelf."`, hook: `"For anything more, you come here."` },
        { id: 'men.fen.kettle.s.2', when: { placeSeen: 'visited' }, lead: `"You've been to the Copper Kettle," Fennick says. "Then you know Hollis keeps only a couple of potions."`, hook: `"I keep the rest."` },
        { id: 'men.fen.kettle.s.3', when: { hpLow: true }, lead: `Fennick studies your wounds with professional interest. "A night at the Copper Kettle would help."`, hook: `"So would something from this counter."` },
        { id: 'men.fen.kettle.s.4', when: { pack: 'ash-ledger' }, lead: `"A bed at the Copper Kettle costs coin. So does a potion here," Fennick says.`, hook: `"Both prices are fair and final."` },
        { id: 'men.fen.kettle.s.5', when: { pack: 'hearthlight' }, lead: `"Hollis will feed you and let you sleep," Fennick says. "I'll see you don't need to sleep as long."`, hook: `He seems pleased with that.` },
      ],
    },
  },
};

/* ─────────────── NPC RECORD NOTES (Companions tab → People you've met) ─────────────── */

/** RECORD. Replaces `First met at ${placePhrase(locationId)}.` in chronicle.ts arrivalEvents(). */
export const NPC_FIRST_MET: Record<NpcId, Bank> = {
  'npc.hollis': [
    { id: 'met.hol.0', lead: `First met at {where}, behind the bar.` },
    { id: 'met.hol.1', lead: `Met at {where}. He called you friend before he knew your name.` },
    { id: 'met.hol.2', when: { pack: 'hearthlight' }, lead: `Met at {where}. He'd kept you a place by the hearth.` },
    { id: 'met.hol.3', when: { pack: 'ash-ledger' }, lead: `Met at {where}, under the chalk board of prices.` },
  ],
  'npc.dagna': [
    { id: 'met.dag.0', lead: `First met at {where}. She didn't stop working.` },
    { id: 'met.dag.1', lead: `Met at {where}. She looked you over like steel she might buy.` },
    { id: 'met.dag.2', when: { pack: 'ash-ledger' }, lead: `Met at {where}. "Coin first," before hello.` },
    { id: 'met.dag.3', when: { pack: 'hearthlight' }, lead: `Met at {where}, over the sound of the hammer.` },
  ],
  'npc.fennick': [
    { id: 'met.fen.0', lead: `First met at {where}, across a polished counter.` },
    { id: 'met.fen.1', lead: `Met at {where}. He straightened a vial before he greeted you.` },
    { id: 'met.fen.2', when: { pack: 'ash-ledger' }, lead: `Met at {where}, beside a ledger of careful prices.` },
    { id: 'met.fen.3', when: { pack: 'hearthlight' }, lead: `Met at {where}. He was fussy and, in his way, glad of you.` },
  ],
};

/**
 * RECORD. Replaces shop.ts keeperNote() texts (`Sold you ${articled(name)} for ${price} gold.` /
 * `Bought your ${name} for ${price} gold.`) and input.ts long rest (`Rented you a room for ${LONG_REST_COST} gold.`).
 * Prices leave the note (they were also the "a trail rations" grammar bug); the price is in the beat's mechanics line.
 * NOTE addNote() dedupes exact text, so buying the same item twice may record one note; that's fine.
 */
export const NPC_KEEPER_NOTES: Record<NpcId, Record<'sold' | 'bought', Bank>> & { 'npc.hollis': { rented: Bank } } = {
  'npc.hollis': {
    sold: [
      { id: 'kn.hol.sold.0', lead: `Sold you the {item} across the bar.` },
      { id: 'kn.hol.sold.1', lead: `Sold you the {item}. "Safe roads, friend."` },
      { id: 'kn.hol.sold.2', when: { pack: 'hearthlight' }, lead: `Sold you the {item} and wished you luck with it.` },
      { id: 'kn.hol.sold.3', when: { pack: 'ash-ledger' }, lead: `Sold you the {item} and chalked it off the board.` },
    ],
    bought: [
      { id: 'kn.hol.bought.0', lead: `Took the {item} off your hands.` },
      { id: 'kn.hol.bought.1', lead: `Bought your {item} and found it a place on the shelf.` },
      { id: 'kn.hol.bought.2', when: { pack: 'ash-ledger' }, lead: `Bought your {item}. Wrote the price on the board.` },
      { id: 'kn.hol.bought.3', when: { pack: 'hearthlight' }, lead: `Bought your {item} kindly, and didn't argue.` },
    ],
    rented: [
      { id: 'kn.hol.room.0', lead: `Gave you a room upstairs for the night.` },
      { id: 'kn.hol.room.1', lead: `Put you up for the night upstairs.` },
      { id: 'kn.hol.room.2', when: { pack: 'hearthlight' }, lead: `Rented you a bed upstairs and banked the fire for you.` },
      { id: 'kn.hol.room.3', when: { pack: 'ash-ledger' }, lead: `Rented you a bed upstairs. Paid up front.` },
    ],
  },
  'npc.dagna': {
    sold: [
      { id: 'kn.dag.sold.0', lead: `Sold you the {item}. Coin first, as always.` },
      { id: 'kn.dag.sold.1', lead: `Sold you the {item} and went back to the anvil.` },
      { id: 'kn.dag.sold.2', when: { pack: 'hearthlight' }, lead: `Sold you the {item}. Almost smiled.` },
      { id: 'kn.dag.sold.3', when: { pack: 'ash-ledger' }, lead: `Sold you the {item} without a word of small talk.` },
    ],
    bought: [
      { id: 'kn.dag.bought.0', lead: `Bought the {item} after one hard look.` },
      { id: 'kn.dag.bought.1', lead: `Took your {item} and hung it on the rack.` },
      { id: 'kn.dag.bought.2', when: { pack: 'ash-ledger' }, lead: `Bought your {item}. Didn't say what she thought of it.` },
      { id: 'kn.dag.bought.3', when: { pack: 'hearthlight' }, lead: `Bought your {item}. Grunted, which might be approval.` },
    ],
  },
  'npc.fennick': {
    sold: [
      { id: 'kn.fen.sold.0', lead: `Sold you the {item}, measured exactly.` },
      { id: 'kn.fen.sold.1', lead: `Sold you the {item} and wrote it in the ledger.` },
      { id: 'kn.fen.sold.2', when: { pack: 'ash-ledger' }, lead: `Sold you the {item}. "Fair and final."` },
      { id: 'kn.fen.sold.3', when: { pack: 'hearthlight' }, lead: `Sold you the {item} with careful instructions.` },
    ],
    bought: [
      { id: 'kn.fen.bought.0', lead: `Bought your {item} and noted it in the ledger.` },
      { id: 'kn.fen.bought.1', lead: `Took the {item} at a careful price.` },
      { id: 'kn.fen.bought.2', when: { pack: 'ash-ledger' }, lead: `Bought your {item}, after turning it over twice.` },
      { id: 'kn.fen.bought.3', when: { pack: 'hearthlight' }, lead: `Bought your {item} and thanked you, precisely.` },
    ],
  },
};

/* ─────────────── PLACE RECORD NOTES (Map tab) ─────────────── */

/** RECORD. Replaces combat.ts victory placeLearned note `You defeated ${articledFoe(foe.name)} here.` */
export const PLACE_VICTORY_NOTE: Bank = [
  { id: 'pvn.0', lead: `You put down {foeA} here.` },
  { id: 'pvn.1', lead: `Where you stood your ground against {foeA}, and won.` },
  { id: 'pvn.2', lead: `You beat {foeA} here.` },
  { id: 'pvn.3', when: { pack: 'ash-ledger' }, lead: `You beat {foeA} here and took what it had.` },
  { id: 'pvn.4', when: { pack: 'hearthlight' }, lead: `You faced {foeA} here and walked away.` },
];

/* ─────────────── STORY SO FAR (Character tab) ───────────────
 * RENDERED. Replaces tabs.ts storySoFar() phrasing. Each part is one sentence; parts are joined with
 * a space. Order: titles, then deeds by turn (quests and victories interleaved as they happened),
 * then level, then people. Use stablePick() per part so the text only changes when the facts do.
 */
export const STORY_SO_FAR: Record<
  'empty' | 'titles' | 'victoryOne' | 'victoryMany' | 'quests' | 'level' | 'knownOne' | 'knownMany',
  Bank
> = {
  empty: [
    { id: 'ssf.empty.0', lead: `Your story is just beginning.` },
    { id: 'ssf.empty.1', lead: `Nothing written yet. The first page is yours.` },
    { id: 'ssf.empty.2', when: { pack: 'hearthlight' }, lead: `Nothing to tell yet, but the hearth is a good place to start.` },
    { id: 'ssf.empty.3', when: { pack: 'ash-ledger' }, lead: `Nothing to your name yet. The ledger's still blank.` },
  ],
  titles: [
    { id: 'ssf.titles.0', lead: `Folk call you {titles}.` },
    { id: 'ssf.titles.1', lead: `They call you {titles} now.` },
    { id: 'ssf.titles.2', lead: `Known as {titles}.` },
  ],
  victoryOne: [
    { id: 'ssf.v1.0', lead: `You put down {foeA} in {where}.` },
    { id: 'ssf.v1.1', lead: `You beat {foeA} in {where}.` },
    { id: 'ssf.v1.2', when: { pack: 'hearthlight' }, lead: `You faced {foeA} in {where} and came home.` },
    { id: 'ssf.v1.3', when: { pack: 'ash-ledger' }, lead: `You beat {foeA} in {where} and took what it had.` },
  ],
  victoryMany: [
    { id: 'ssf.vn.0', lead: `You've come through {fightCount} fights, the last against {foeA} in {where}.` },
    { id: 'ssf.vn.1', lead: `{fightCount} fights won so far. The latest was {foeA} in {where}.` },
    { id: 'ssf.vn.2', when: { pack: 'ash-ledger' }, lead: `{fightCount} fights, {fightCount} wins. Most recently {foeA} in {where}.` },
    { id: 'ssf.vn.3', when: { pack: 'hearthlight' }, lead: `{fightCount} fights behind you now. The last was {foeA} in {where}.` },
  ],
  quests: [
    { id: 'ssf.q.0', lead: `You saw {quests} through.` },
    { id: 'ssf.q.1', lead: `You finished {quests}.` },
    { id: 'ssf.q.2', when: { pack: 'ash-ledger' }, lead: `Paid in full: {quests}.` },
    { id: 'ssf.q.3', when: { pack: 'hearthlight' }, lead: `You kept your word on {quests}.` },
  ],
  level: [
    { id: 'ssf.lv.0', lead: `You've reached level {levelWord}.` },
    { id: 'ssf.lv.1', lead: `You're level {levelWord} now, and tougher for it.` },
    { id: 'ssf.lv.2', lead: `You've grown into level {levelWord}.` },
  ],
  knownOne: [
    { id: 'ssf.k1.0', lead: `{people} knows your face.` },
    { id: 'ssf.k1.1', lead: `{people} knows you by name.` },
    { id: 'ssf.k1.2', when: { pack: 'hearthlight' }, lead: `{people} would greet you by name.` },
    { id: 'ssf.k1.3', when: { pack: 'ash-ledger' }, lead: `{people} knows your face, and your purse.` },
  ],
  knownMany: [
    { id: 'ssf.kn.0', lead: `{people} know your face.` },
    { id: 'ssf.kn.1', lead: `In Emberford, {people} know who you are.` },
    { id: 'ssf.kn.2', when: { pack: 'hearthlight' }, lead: `{people} would greet you by name.` },
    { id: 'ssf.kn.3', when: { pack: 'ash-ledger' }, lead: `{people} know your face, and your purse.` },
  ],
};

/* ─────────────── QUEST JOURNAL (Quest tab) ───────────────
 * RECORDS. Replace the texts in chronicle.ts questOpeningBeats() / deriveChronicleEvents() /
 * backfillChronicle(). Journal rows render as `<KIND_LABEL> <text>` on the quest card, and the
 * newest `lead` is also the card's "Next: …" line, so leads must read as an instruction.
 * XP stays on the card's existing Reward/Earned row; it leaves the journal text.
 */
export const QUEST_JOURNAL: {
  given: Record<NpcId, Bank> & { self: Bank };
  leadArrival: Bank;
  done: Bank;
  failed: Bank;
  backfillDone: Bank;
  backfillFailed: Bank;
} = {
  /** replaces `Given by ${giver.name} (${giver.role}).` and 'Taken up on your own word in the Tale.' */
  given: {
    'npc.hollis': [
      { id: 'qj.given.hol.0', lead: `Hollis asked it of you, over the bar at the Copper Kettle.` },
      { id: 'qj.given.hol.1', lead: `Hollis set you on your way from the Copper Kettle.` },
      { id: 'qj.given.hol.2', when: { pack: 'hearthlight' }, lead: `Hollis put it to you kindly, the way he puts everything.` },
      { id: 'qj.given.hol.3', when: { pack: 'ash-ledger' }, lead: `Hollis's idea. He says it'll earn you your keep.` },
    ],
    'npc.dagna': [
      { id: 'qj.given.dag.0', lead: `Dagna asked it of you, between hammer strokes.` },
      { id: 'qj.given.dag.1', lead: `Dagna's job. She doesn't ask twice.` },
      { id: 'qj.given.dag.2', lead: `From Dagna at Brightanvil Smithy.` },
    ],
    'npc.fennick': [
      { id: 'qj.given.fen.0', lead: `Fennick asked it of you, very precisely.` },
      { id: 'qj.given.fen.1', lead: `Fennick's request, set out like a recipe.` },
      { id: 'qj.given.fen.2', lead: `From Fennick at Mossglass Alchemist.` },
    ],
    self: [
      { id: 'qj.given.self.0', lead: `Your own idea. Nobody asked you to.` },
      { id: 'qj.given.self.1', lead: `You took this on yourself, in the Tale.` },
      { id: 'qj.given.self.2', when: { pack: 'hearthlight' }, lead: `You chose this one. That counts for something.` },
      { id: 'qj.given.self.3', when: { pack: 'ash-ledger' }, lead: `Nobody's paying you for this. You're doing it anyway.` },
    ],
  },
  /** replaces `Step out into ${where} to see it through.` (chronicle.ts) and the tabs.ts nextLead fallback `Step out into ${name}`. {where} = the trigger place ref. */
  leadArrival: [
    { id: 'qj.lead.arr.0', lead: `Step out into {where}.` },
    { id: 'qj.lead.arr.1', lead: `Head for {where}. The rest will follow.` },
    { id: 'qj.lead.arr.2', when: { pack: 'hearthlight' }, lead: `Go out into {where} and let it have a look at you.` },
    { id: 'qj.lead.arr.3', when: { pack: 'ash-ledger' }, lead: `Get to {where}. That's where the work is.` },
  ],
  /** replaces `Completed${where}${xp > 0 ? ` — ${xp} XP` : ''}.` — XP is on the Earned row. */
  done: [
    { id: 'qj.done.0', lead: `Done, in {where}.` },
    { id: 'qj.done.1', lead: `Seen through in {where}.` },
    { id: 'qj.done.2', when: { pack: 'hearthlight' }, lead: `Finished in {where}. Well done.` },
    { id: 'qj.done.3', when: { pack: 'ash-ledger' }, lead: `Settled in {where}. Paid.` },
  ],
  /** replaces 'The trail went cold — quest failed.' (the card badge already says Failed). */
  failed: [
    { id: 'qj.fail.0', lead: `The trail went cold.` },
    { id: 'qj.fail.1', lead: `It slipped away from you.` },
    { id: 'qj.fail.2', when: { pack: 'hearthlight' }, lead: `Not this time. Some doors close.` },
    { id: 'qj.fail.3', when: { pack: 'ash-ledger' }, lead: `Lost. Write it off and keep walking.` },
  ],
  /** save migration v1 → v2 (backfillChronicle): replaces 'Completed.' / 'Quest failed.' */
  backfillDone: [
    { id: 'qj.bfd.0', lead: `Done, before this journal was kept.` },
    { id: 'qj.bfd.1', lead: `Finished on an earlier page.` },
    { id: 'qj.bfd.2', lead: `Already behind you.` },
  ],
  backfillFailed: [
    { id: 'qj.bff.0', lead: `Lost, before this journal was kept.` },
    { id: 'qj.bff.1', lead: `It slipped away on an earlier page.` },
    { id: 'qj.bff.2', lead: `Already behind you, unfinished.` },
  ],
};

/**
 * FIRST STEPS (quest-first-steps, giver npc.hollis, trigger locale.emberford).
 * Tale beats extend QUEST_FIRST_STEPS above (offer / complete); these are the extra beats + records.
 *  summary       → single string, replaces STARTER_QUEST.summary in campaignState.ts (shown on the card + 'known' row)
 *  progressNotes → single string, replaces STARTER_QUEST.progressNotes ("Start at the Copper Kettle and ask around." is
 *                  stale: you start inside the Kettle). Shown as the first 'lead' row.
 *  journalGiven  → RECORD, use instead of QUEST_JOURNAL.given['npc.hollis'] for this quest
 *  leadDoor      → RECORD, NEW optional lead written when you reach place.copper-kettle (the inn threshold) while active
 *  progress      → Tale line for that same moment (appended as the hook of the arrival beat)
 *  remind        → Tale line when you talk to Hollis while it's active
 *  journalDone   → RECORD, use instead of QUEST_JOURNAL.done for this quest
 */
export const FIRST_STEPS_COPY = {
  summary: `Find your footing in Emberford and learn what the town needs.`,
  progressNotes: `Hollis says the town starts just past the Kettle's door.`,
} as const;

export const FIRST_STEPS_JOURNAL: Record<'journalGiven' | 'leadDoor' | 'journalDone', Bank> = {
  journalGiven: [
    { id: 'fsj.given.0', lead: `Hollis's advice, the day you woke at the Copper Kettle: get out and see the town.` },
    { id: 'fsj.given.1', lead: `Hollis, over the bar: find your feet in Emberford first.` },
    { id: 'fsj.given.2', when: { pack: 'hearthlight' }, lead: `Hollis kept you a place by the hearth, then told you to go and see the town.` },
    { id: 'fsj.given.3', when: { pack: 'ash-ledger' }, lead: `Hollis, tapping the chalk board: earn your keep, and Emberford's where the work is.` },
  ],
  leadDoor: [
    { id: 'fsj.door.0', lead: `Out through the door into Emberford.` },
    { id: 'fsj.door.1', lead: `The street's right there. Step out into Emberford.` },
    { id: 'fsj.door.2', when: { pack: 'hearthlight' }, lead: `One more step. Emberford's just outside.` },
    { id: 'fsj.door.3', when: { pack: 'ash-ledger' }, lead: `Through the door. Emberford won't come to you.` },
  ],
  journalDone: [
    { id: 'fsj.done.0', lead: `You stepped out into Emberford and found your footing.` },
    { id: 'fsj.done.1', lead: `Emberford knows your face now.` },
    { id: 'fsj.done.2', when: { pack: 'hearthlight' }, lead: `You found your feet in Emberford. Hollis was right about the town.` },
    { id: 'fsj.done.3', when: { pack: 'ash-ledger' }, lead: `You're on Emberford's streets now. The work starts here.` },
  ],
};

export const QUEST_FIRST_STEPS_MORE: Record<'progress' | 'remind', Bank> = {
  progress: [
    { id: 'qfs.prog.0', lead: `The street noise is right outside the door now.`, hook: `One step and you're in Emberford.` },
    { id: 'qfs.prog.1', lead: `Through the door, Emberford is waking up loud.`, hook: `Hollis said to go and look.` },
    { id: 'qfs.prog.2', when: { pack: 'hearthlight' }, lead: `Behind you, the fire. Ahead, Emberford's chimneys.`, hook: `Go on. Find your feet.` },
    { id: 'qfs.prog.3', when: { pack: 'ash-ledger' }, lead: `Past this door, everything in Emberford has a price.`, hook: `Time to learn them.` },
  ],
  remind: [
    { id: 'qfs.rem.0', lead: `"Still here?" Hollis says. "Go and see Emberford. It's right outside."`, hook: `He nods at the door.` },
    { id: 'qfs.rem.1', lead: `"The town won't bite," Hollis says. "Most of it."`, hook: `"Step out and have a look."` },
    { id: 'qfs.rem.2', when: { pack: 'hearthlight' }, lead: `"Your seat'll keep," Hollis says warmly. "Go and find your feet in town."`, hook: `"Come back and tell me what you found."` },
    { id: 'qfs.rem.3', when: { pack: 'ash-ledger' }, lead: `"Nobody's paying you to sit by my fire," Hollis says, not unkindly.`, hook: `"Emberford. Go."` },
  ],
};

/* ─────────────── LOCATION + FLOOR LABELS (Map tab, header) ───────────────
 * Single strings, not banks: labels must be stable.
 *  name  → unchanged world name (map.ts); listed so the table is complete
 *  ref   → in-sentence reference, used for {where}. Fixes placePhrase() "in Ashen Fields".
 *  tag   → two-to-four word evocative tagline for Map tab rows / scene header under the name
 */
export const LOCATION_LABELS: Record<NodeId, { name: string; ref: string; tag: string }> = {
  'region.embervale':           { name: 'Embervale',          ref: 'Embervale',            tag: 'River vale, old watch-stones' },
  'locale.emberford':           { name: 'Emberford',          ref: 'Emberford',            tag: 'Chimneys and market noise' },
  'locale.ashen-fields':        { name: 'Ashen Fields',       ref: 'the Ashen Fields',     tag: 'Pale soil, restless scarecrows' },
  'place.copper-kettle':        { name: 'The Copper Kettle',  ref: 'the Copper Kettle',    tag: 'Inn door, kettle sign' },
  'place.brightanvil':          { name: 'Brightanvil Smithy', ref: 'Brightanvil Smithy',   tag: 'Smithy yard, ringing iron' },
  'place.mossglass':            { name: 'Mossglass Alchemist', ref: 'Mossglass Alchemist', tag: 'Shop front, labelled vials' },
  'interior.kettle-common':     { name: 'Common Room',        ref: 'the common room',      tag: 'Hearth and long bar' },
  'interior.kettle-cellar':     { name: 'Inn Cellar',         ref: 'the inn cellar',       tag: 'Casks, cider, cool dark' },
  'interior.smith-forge':       { name: 'Forge Floor',        ref: 'the forge floor',      tag: 'Bellows and hot iron' },
  'interior.alchemist-counter': { name: 'Shop Counter',       ref: "Fennick's counter",    tag: 'Vials and careful prices' },
};

/** Replaces INTERIOR_FLOORS in engine/npcs.ts (Map tab chain: Building › Floor › Room). */
export const FLOOR_LABELS: Record<'interior.kettle-common' | 'interior.kettle-cellar' | 'interior.smith-forge' | 'interior.alchemist-counter', string> = {
  'interior.kettle-common': 'Street level',
  'interior.kettle-cellar': 'Below stairs',
  'interior.smith-forge': 'Street level', // recommend: hide the Floor row for one-floor buildings
  'interior.alchemist-counter': 'Street level', // same
};

/** Display labels for MapChainLink.level (tabs.ts KIND_LEVEL / levelFor). Keys are the existing type values. */
export const CHAIN_LEVEL_LABELS: Record<'Region' | 'Town' | 'Area' | 'Building' | 'Floor' | 'Room', string> = {
  Region: 'Region',
  Town: 'Town',
  Area: 'Open country',
  Building: 'Building',
  Floor: 'Floor',
  Room: 'Room',
};

/* ─────────────── TAB COPY (single strings; replaces literals in the screens) ─────────────── */
export const TAB_COPY = {
  character: {
    storyHeading: 'The tale so far', // CharacterSheetScreen.tsx  <Text style={styles.section}>Story so far</Text>
    noConditions: 'Hale and steady', // CharacterSheetScreen.tsx  'No conditions'
  },
  quests: {
    emptyTitle: 'Nothing to chase yet', // QuestTab.tsx 'No quests yet'
    emptyBody: "When someone asks something of you, or you set yourself a task in the Tale, it's written here.",
    kindLabel: { given: 'Begun', known: 'Known', lead: 'Lead', done: 'Done', failed: 'Failed' }, // QuestTab.tsx KIND_LABEL
    from: 'From', // keep: `From {giver}`
    next: 'Next:', // keep
  },
  map: {
    hint: 'Where you stand, and the ways on. To go somewhere, say so in the Tale.',
    here: 'You are here',
    nearby: 'Ways on',
    nearbyEmpty: 'No obvious way on from here.',
    unmapped: "You're somewhere the map doesn't show.",
    visited: "Places you've been",
    visitedEmpty: 'Nowhere yet. The road starts at the door.',
    known: 'Heard of, not yet seen',
    knownEmpty: 'No one has pointed you anywhere yet.',
    youAreHere: '· you are here',
  },
  companions: {
    people: "People you've met",
    peopleEmpty: 'No one yet. Faces you meet in the Tale are noted here.',
    relationshipFallback: 'Knows your face.', // tabs.ts selectCompanionsTab 'Met.'
    lastSeen: 'Last seen:',
  },
} as const;

/** Gear tab origin lines (tabs.ts HOW_LABEL / itemOriginLine). Single templates; {npc} is the short name, not "Hollis the innkeeper". */
export const ITEM_ORIGIN = {
  starter: 'From your starting kit',
  bought: 'Bought from {npc}', // the keeper names the shop; no {where} ("in the forge floor" reads wrong)
  loot: 'Taken from {foeA} in {where}',
  lootNoWhere: 'Taken from a fallen foe',
  reward: 'A reward from {npc}',
  found: 'Found in {where}',
  foundNoWhere: 'Found along the way',
  carried: 'With you from before the tale began',
} as const;

/* ─────────────── helpers for RENDERED copy ─────────────── */

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
/** {fightCount} / {levelWord}: spelled out up to twelve, then `overflow` ("many" for fights). */
export function numberWord(n: number, overflow = 'many'): string {
  const i = Math.floor(n);
  return i >= 0 && i < NUMBER_WORDS.length ? NUMBER_WORDS[i]! : overflow;
}

/** "Hollis", "Hollis and Dagna", "Hollis, Dagna and Fennick" — same rule as tabs.ts listJoin. */
export function listJoinWords(xs: readonly string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/**
 * Stable pick for RENDERED copy: same campaign + same key → same line, every render.
 * key = part name + the facts it shows (e.g. 'victoryMany:' + deeds.length) so the text
 * changes only when the facts change.
 */
export function stablePick(bank: Bank, ctx: LineContext, campaignId: string, key: string): Line | null {
  const eligible = bank.filter((l) => lineMatches(l, ctx));
  if (!eligible.length) return null;
  let h = 2166136261;
  for (const ch of `${campaignId}|${key}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return eligible[h % eligible.length]!;
}
