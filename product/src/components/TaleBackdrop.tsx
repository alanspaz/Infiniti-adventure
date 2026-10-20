import React from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import {
  resolveBackdrop,
  type BackdropArtId,
  type BackdropTint,
  type CampaignState,
} from '../../engine';
import { appImages } from '../images';
import { theme } from '../theme';

/** BG-01: art id → bundled static asset (no remote fetches). */
export const BACKDROP_IMAGES: Record<BackdropArtId, ImageSourcePropType> = {
  'art.hearth': appImages.bgHearth,
  'art.vista': appImages.vistaEmbervale,
  'art.emberford': appImages.bgEmberford,
  'art.ashen-fields': appImages.bgAshenFields,
  'art.brightanvil': appImages.bgBrightanvil,
  'art.smith-forge': appImages.bgSmithForge,
  'art.mossglass': appImages.bgMossglass,
  'art.alchemist-counter': appImages.bgAlchemistCounter,
  'art.kettle-cellar': appImages.bgKettleCellar,
  'art.kettle-common': appImages.bgKettleCommon,
  'art.merchant.hollis': appImages.bgMerchantHollis,
  'art.merchant.dagna': appImages.bgMerchantDagna,
  'art.merchant.fennick': appImages.bgMerchantFennick,
  'art.foe.ash-wolf': appImages.bgFoeAshWolf,
  'art.foe.scarecrow-husk': appImages.bgFoeScarecrowHusk,
  'art.foe.road-bandit': appImages.bgFoeRoadBandit,
  'art.foe.cellar-rat': appImages.bgFoeCellarRat,
  'art.foe.ruffian': appImages.bgFoeRuffian,
};

/** Placeholder glow colours per region tint (theme-derived). */
const TINT_COLOR: Record<BackdropTint, string> = {
  hearth: '#d4a054',
  town: '#b8864a',
  ash: '#8a8378',
  cellar: '#4a5a66',
  forge: '#c4622d',
  alchemy: '#6f9a5a',
  default: '#d4a054',
};

const BANDS = 10;

/**
 * Dim, readable Tale backdrop resolved from CampaignState
 * (combat foe > open shop > location chain > placeholder).
 * Purely decorative: pointerEvents none, sits behind the story log.
 */
export function TaleBackdrop({
  state,
}: {
  state: Pick<CampaignState, 'combat' | 'shop' | 'locationId'>;
}) {
  const bd = resolveBackdrop(state);
  const glow = TINT_COLOR[bd.tint];
  const source = bd.art ? BACKDROP_IMAGES[bd.art] : null;

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`tale-backdrop-${bd.sourceKey}`}
    >
      {source ? (
        <Image
          source={source}
          style={styles.art}
          resizeMode="cover"
          fadeDuration={0}
        />
      ) : (
        // Placeholder: soft top glow fading into the theme background.
        <View style={StyleSheet.absoluteFill}>
          {Array.from({ length: BANDS }, (_, i) => (
            <View
              key={i}
              style={[
                styles.band,
                {
                  top: `${(i * 55) / BANDS}%`,
                  height: `${55 / BANDS + 1}%`,
                  backgroundColor: glow,
                  opacity: 0.16 * (1 - i / BANDS) ** 2,
                },
              ]}
            />
          ))}
        </View>
      )}
      {/* Contrast scrim (heavier in combat) + vignette edges. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.background, opacity: source ? bd.scrimOpacity : 0.2 }]} />
      {bd.mood === 'combat' ? (
        <View style={[styles.combatGlow, { backgroundColor: theme.colors.danger }]} />
      ) : null}
      <View style={styles.vignetteTop} />
      <View style={styles.vignetteBottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  art: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  combatGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '30%',
    opacity: 0.08,
  },
  vignetteTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 48,
    backgroundColor: theme.colors.background,
    opacity: 0.55,
  },
  vignetteBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 72,
    backgroundColor: theme.colors.background,
    opacity: 0.6,
  },
});
