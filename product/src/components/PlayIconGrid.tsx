import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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

export const PLAY_ICONS: {
  id: PlayPanelId;
  label: string;
  glyph: string;
}[] = [
  { id: 'character', label: 'Character', glyph: '👤' },
  { id: 'items', label: 'Items', glyph: '🎒' },
  { id: 'dice', label: 'Dice', glyph: '🎲' },
  { id: 'combat', label: 'Combat', glyph: '⚔️' },
  { id: 'quest', label: 'Quest', glyph: '📜' },
  { id: 'companions', label: 'Companions', glyph: '🤝' },
  { id: 'map', label: 'Map', glyph: '🗺️' },
  { id: 'settings', label: 'Settings', glyph: '⚙️' },
];

type Props = {
  active: PlaySurfaceId;
  onChange: (id: PlayPanelId) => void;
  /** Return to Story chat. */
  onStory: () => void;
};

/**
 * Base44-style header icon grid (2×4). Story is not an icon — use Tale / onStory.
 * Glyphs are placeholders until Artist ships PNG icons.
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
                <Text style={styles.glyph}>{icon.glyph}</Text>
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
    width: 56,
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
    gap: 6,
  },
  cell: {
    width: '23%',
    flexGrow: 1,
    minWidth: 64,
    maxWidth: '25%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  cellActive: {
    borderColor: theme.colors.accent,
    backgroundColor: '#241c16',
  },
  glyph: {
    fontSize: 18,
    marginBottom: 2,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
  },
  labelActive: {
    color: theme.colors.accent,
  },
  pressed: {
    opacity: 0.85,
  },
});
