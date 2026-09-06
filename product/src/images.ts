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
} as const;

export function packCardImage(packId: string): ImageSourcePropType | null {
  if (packId === 'hearthlight') return appImages.packHearthlight;
  if (packId === 'ash-ledger') return appImages.packAshLedger;
  return null;
}

/** Offline still stub art by subject; described/npc/injury fall back sensibly. */
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
