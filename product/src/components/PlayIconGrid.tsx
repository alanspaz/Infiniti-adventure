import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { playPanelIcon } from '../images';
import { theme } from '../theme';

/** Panels reachable from the header icon grid (Story is the default chat surface). */
export type PlayPanelId =
  | 'character'
  | 'items'
  | 'dice'
  | 'quest'
  | 'companions'
  | 'map'
  | 'settings'
  | 'stills';

/** 'shop' opens from the Tale / Items (P-INT-04); it has no grid icon. */
export type PlaySurfaceId = 'story' | PlayPanelId | 'shop';

/** Icon grid panels — Character includes combat readiness (UI-02); no separate Combat tab. */
export const PLAY_ICONS: { id: Exclude<PlayPanelId, 'stills'>; label: string }[] = [
  { id: 'character', label: 'Character' },
  { id: 'items', label: 'Items' },
  { id: 'dice', label: 'Dice' },
  { id: 'quest', label: 'Quest' },
  { id: 'companions', label: 'Party' },
  { id: 'map', label: 'Map' },
  { id: 'settings', label: 'Settings' },
];

/**
 * QA-02: tile metrics. Content (padding + icon + gap + one label line) must fit
 * inside CELL_MIN_HEIGHT so labels never clip (smoke checks the sum).
 */
export const ICON_GRID_METRICS = {
  cellMinHeight: 60,
  paddingVertical: 6,
  icon: 26,
  iconGap: 3,
  labelFontSize: 9,
  labelLineHeight: 13,
} as const;
const M = ICON_GRID_METRICS;

type Props = {
  active: PlaySurfaceId;
  onChange: (id: Exclude<PlayPanelId, 'stills'>) => void;
  onStory: () => void;
};

/**
 * Panel picker revealed from PlayShell more menu (UI-04). Tale + icon grid.
 * Character merges combat readiness (UI-02). Icons: Artist square 64px set.
 */
export function PlayIconGrid({ active, onChange, onStory }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: active === 'story' }}
          onPress={onStory}
          style={({ pressed }) => [
            styles.tale,
            active === 'story' && styles.taleActive,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.taleGlyph, active === 'story' && styles.taleGlyphActive]}>
            ✦
          </Text>
          <Text style={[styles.taleLabel, active === 'story' && styles.taleLabelActive]}>
            Tale
          </Text>
        </Pressable>
        <View style={styles.grid}>
          {PLAY_ICONS.map((icon) => {
            const selected = active === icon.id;
            return (
              <Pressable
                key={icon.id}
                accessibilityRole="button"
                accessibilityLabel={icon.label}
                accessibilityState={{ selected }}
                onPress={() => onChange(icon.id)}
                style={({ pressed }) => [
                  styles.cell,
                  selected && styles.cellActive,
                  pressed && styles.pressed,
                ]}
              >
                <Image
                  source={playPanelIcon(icon.id)}
                  style={[styles.icon, selected && styles.iconActive]}
                  resizeMode="contain"
                />
                <Text
                  style={[styles.label, selected && styles.labelActive]}
                  numberOfLines={1}
                >
                  {icon.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: theme.spacing.sm,
  },
  tale: {
    width: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: theme.colors.background,
  },
  taleActive: {
    borderColor: theme.colors.accent,
    backgroundColor: '#241c16',
  },
  taleGlyph: {
    color: theme.colors.textMuted,
    fontSize: 18,
    marginBottom: 2,
  },
  taleGlyphActive: {
    color: theme.colors.accent,
  },
  taleLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  taleLabelActive: {
    color: theme.colors.accent,
  },
  grid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cell: {
    width: '22%',
    flexGrow: 1,
    minWidth: 64,
    minHeight: M.cellMinHeight,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: M.paddingVertical,
    paddingHorizontal: 2,
  },
  cellActive: {
    borderColor: theme.colors.accent,
    backgroundColor: '#241c16',
  },
  icon: {
    width: M.icon,
    height: M.icon,
    marginBottom: M.iconGap,
    opacity: 0.85,
  },
  iconActive: {
    opacity: 1,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: M.labelFontSize,
    lineHeight: M.labelLineHeight,
    includeFontPadding: false,
    fontWeight: '600',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  labelActive: {
    color: theme.colors.accent,
  },
  pressed: {
    opacity: 0.85,
  },
});
