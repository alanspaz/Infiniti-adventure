import type { ImageSourcePropType } from 'react-native';
import type { StillSubjectKind } from '../engine/stills';

/** Static asset map for Metro `require` (paths relative to this file). */
export const appImages = {
  homeHero: require('../assets/home-hero.png') as ImageSourcePropType,
  packHearthlight: require('../assets/packs/pack-hearthlight.png') as ImageSourcePropType,
  packAshLedger: require('../assets/packs/pack-ash-ledger.png') as ImageSourcePropType,
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
  combat: appImages.iconCombat,
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
