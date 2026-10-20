import type { ImageSourcePropType } from 'react-native';
import type { StillSubjectKind } from '../engine/stills';

/** Static asset map for Metro `require` (paths relative to this file). */
export const appImages = {
  homeHero: require('../assets/home-hero.png') as ImageSourcePropType,
  packHearthlight: require('../assets/packs/pack-hearthlight.png') as ImageSourcePropType,
  packAshLedger: require('../assets/packs/pack-ash-ledger.png') as ImageSourcePropType,
  /** BG-01 Tale backdrops (assets/backdrops/*.jpg, Artist delivery). */
  bgHearth: require('../assets/backdrops/hearth-sm.jpg') as ImageSourcePropType,
  vistaEmbervale: require('../assets/backdrops/vista-embervale-sm.jpg') as ImageSourcePropType,
  bgEmberford: require('../assets/backdrops/emberford.jpg') as ImageSourcePropType,
  bgAshenFields: require('../assets/backdrops/ashen-fields.jpg') as ImageSourcePropType,
  bgBrightanvil: require('../assets/backdrops/brightanvil.jpg') as ImageSourcePropType,
  bgSmithForge: require('../assets/backdrops/smith-forge.jpg') as ImageSourcePropType,
  bgMossglass: require('../assets/backdrops/mossglass.jpg') as ImageSourcePropType,
  bgAlchemistCounter: require('../assets/backdrops/alchemist-counter.jpg') as ImageSourcePropType,
  bgKettleCellar: require('../assets/backdrops/kettle-cellar.jpg') as ImageSourcePropType,
  bgKettleCommon: require('../assets/backdrops/kettle-common.jpg') as ImageSourcePropType,
  bgMerchantHollis: require('../assets/backdrops/merchant-hollis.jpg') as ImageSourcePropType,
  bgMerchantDagna: require('../assets/backdrops/merchant-dagna.jpg') as ImageSourcePropType,
  bgMerchantFennick: require('../assets/backdrops/merchant-fennick.jpg') as ImageSourcePropType,
  bgFoeAshWolf: require('../assets/backdrops/foe-ash-wolf.jpg') as ImageSourcePropType,
  bgFoeScarecrowHusk: require('../assets/backdrops/foe-scarecrow-husk.jpg') as ImageSourcePropType,
  bgFoeRoadBandit: require('../assets/backdrops/foe-road-bandit.jpg') as ImageSourcePropType,
  bgFoeCellarRat: require('../assets/backdrops/foe-cellar-rat.jpg') as ImageSourcePropType,
  bgFoeRuffian: require('../assets/backdrops/foe-ruffian.jpg') as ImageSourcePropType,
  stillLocation: require('../assets/stills/still-stub-location.png') as ImageSourcePropType,
  stillPlayer: require('../assets/stills/still-stub-player.png') as ImageSourcePropType,
  stillItem: require('../assets/stills/still-stub-item.png') as ImageSourcePropType,
  /** Gold line-art narrator avatar (Sprint C). */
  avatarNarrator: require('../assets/icons/dm-avatar.png') as ImageSourcePropType,
  iconCharacter: require('../assets/icons/character.png') as ImageSourcePropType,
  iconItems: require('../assets/icons/items.png') as ImageSourcePropType,
  iconDice: require('../assets/icons/dice.png') as ImageSourcePropType,
  iconCombat: require('../assets/icons/combat.png') as ImageSourcePropType,
  iconQuest: require('../assets/icons/quest.png') as ImageSourcePropType,
  iconCompanions: require('../assets/icons/companions.png') as ImageSourcePropType,
  iconMap: require('../assets/icons/map.png') as ImageSourcePropType,
  iconSettings: require('../assets/icons/settings.png') as ImageSourcePropType,
  /** Combat rail action chips (UI-01 Artist). */
  combatAttack: require('../assets/icons/attack.png') as ImageSourcePropType,
  combatDefend: require('../assets/icons/defend.png') as ImageSourcePropType,
  combatDodge: require('../assets/icons/dodge.png') as ImageSourcePropType,
  combatCast: require('../assets/icons/cast.png') as ImageSourcePropType,
  combatUseItem: require('../assets/icons/use-item.png') as ImageSourcePropType,
} as const;

const PANEL_ICONS: Record<string, ImageSourcePropType> = {
  character: appImages.iconCharacter,
  items: appImages.iconItems,
  dice: appImages.iconDice,
  quest: appImages.iconQuest,
  companions: appImages.iconCompanions,
  map: appImages.iconMap,
  settings: appImages.iconSettings,
  stills: appImages.stillLocation,
};

export function playPanelIcon(id: string): ImageSourcePropType {
  return PANEL_ICONS[id] ?? appImages.iconSettings;
}

export function packCardImage(packId: string): ImageSourcePropType | null {
  if (packId === 'hearthlight') return appImages.packHearthlight;
  if (packId === 'ash-ledger') return appImages.packAshLedger;
  return null;
}

export function stillStubImage(
  subjectKind: StillSubjectKind | string,
): ImageSourcePropType {
  switch (subjectKind) {
    case 'player':
    case 'npc':
      return appImages.stillPlayer;
    case 'item':
    case 'injury':
      return appImages.stillItem;
    case 'location':
    case 'described':
    default:
      return appImages.stillLocation;
  }
}
