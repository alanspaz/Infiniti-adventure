import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

export type PlayTabId =
  | 'story'
  | 'quest'
  | 'character'
  | 'companions'
  | 'items'
  | 'map'
  | 'dice'
  | 'stills'
  | 'settings';

export const PLAY_TABS: { id: PlayTabId; label: string }[] = [
  { id: 'story', label: 'Story' },
  { id: 'quest', label: 'Quest' },
  { id: 'character', label: 'Character' },
  { id: 'companions', label: 'Companions' },
  { id: 'items', label: 'Items' },
  { id: 'map', label: 'Map' },
  { id: 'dice', label: 'Dice' },
  { id: 'stills', label: 'Stills' },
  { id: 'settings', label: 'Settings' },
];

type Props = {
  active: PlayTabId;
  onChange: (tab: PlayTabId) => void;
};

/** Top tab bar for the in-campaign play shell (portrait mobile). */
export function PlayTabBar({ active, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {PLAY_TABS.map((tab) => {
          const selected = tab.id === active;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onChange(tab.id)}
              style={({ pressed }) => [
                styles.tab,
                selected && styles.tabActive,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[styles.label, selected && styles.labelActive]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  row: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.xs,
    alignItems: 'center',
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabActive: {
    borderColor: theme.colors.accent,
    backgroundColor: '#241c16',
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  labelActive: {
    color: theme.colors.accent,
  },
  pressed: {
    opacity: 0.85,
  },
});
