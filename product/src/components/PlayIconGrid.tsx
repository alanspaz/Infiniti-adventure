import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { playPanelIcon } from '../images';
import { theme } from '../theme';

/** Panels reachable from the header icon grid (Story is the default chat surface). */
export type PlayPanelId =
  | 'character'
  | 'items'
  | 'dice'
  | 'combat'
  | 'quest'
  | 'companions'
  | 'map'
  | 'settings'
  | 'stills';

export type PlaySurfaceId = 'story' | PlayPanelId;

export const PLAY_ICONS: { id: Exclude<PlayPanelId, 'stills'>; label: string }[] = [
  { id: 'character', label: 'Character' },
  { id: 'items', label: 'Items' },
  { id: 'dice', label: 'Dice' },
  { id: 'combat', label: 'Combat' },
  { id: 'quest', label: 'Quest' },
  { id: 'companions', label: 'Party' },
  { id: 'map', label: 'Map' },
  { id: 'settings', label: 'Settings' },
];

type Props = {
  active: PlaySurfaceId;
  onChange: (id: Exclude<PlayPanelId, 'stills'>) => void;
  onStory: () => void;
};

/**
 * Base44 layout / IA theme: 2×4 header icon grid + Tale control.
 * Icons from Artist sprite slice (`assets/ui/icons`).
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
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  cellActive: {
    borderColor: theme.colors.accent,
    backgroundColor: '#241c16',
  },
  icon: {
    width: 28,
    height: 28,
    marginBottom: 2,
    opacity: 0.85,
  },
  iconActive: {
    opacity: 1,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 9,
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
