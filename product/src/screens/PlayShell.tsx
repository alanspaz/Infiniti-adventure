import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CampaignSave } from '../../engine';
import { PlayTabBar, type PlayTabId } from '../components/PlayTabBar';
import { theme } from '../theme';
import { SceneScreen } from './SceneScreen';
import { QuestTab } from './QuestTab';
import { CharacterSheetScreen } from './CharacterSheetScreen';
import { CompanionsTab } from './CompanionsTab';
import { ItemsTab } from './ItemsTab';
import { MapScreen } from './MapScreen';
import { DiceScreen } from './DiceScreen';
import { StillsScreen } from './StillsScreen';
import { SettingsScreen } from './SettingsScreen';

type Props = {
  campaign: CampaignSave;
  onCampaignChange: (campaign: CampaignSave) => void;
  /** Leave play shell back to Home. */
  onLeave: () => void;
};

/**
 * In-campaign play shell. Story stays mounted across tab switches.
 * Dice + Stills live here (T-019); Map travel syncs Story (T-018).
 */
export function PlayShell({ campaign, onCampaignChange, onLeave }: Props) {
  const [tab, setTab] = useState<PlayTabId>('story');

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>Adventure</Text>
          <Text style={styles.title} numberOfLines={1}>
            {campaign.title}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leave to home"
          onPress={onLeave}
          style={({ pressed }) => [styles.leave, pressed && styles.pressed]}
        >
          <Text style={styles.leaveLabel}>Home</Text>
        </Pressable>
      </View>

      <PlayTabBar active={tab} onChange={setTab} />

      <View style={styles.body}>
        <View
          style={[styles.panel, tab !== 'story' && styles.panelHidden]}
          pointerEvents={tab === 'story' ? 'auto' : 'none'}
        >
          <SceneScreen
            campaign={campaign}
            onCampaignChange={onCampaignChange}
            embedded
          />
        </View>
        {tab === 'quest' ? <QuestTab campaign={campaign} /> : null}
        {tab === 'character' ? (
          <CharacterSheetScreen campaign={campaign} embedded />
        ) : null}
        {tab === 'companions' ? <CompanionsTab campaign={campaign} /> : null}
        {tab === 'items' ? <ItemsTab campaign={campaign} /> : null}
        {tab === 'map' ? (
          <MapScreen
            campaign={campaign}
            onCampaignChange={onCampaignChange}
            embedded
          />
        ) : null}
        {tab === 'dice' ? (
          <DiceScreen campaign={campaign} embedded />
        ) : null}
        {tab === 'stills' ? (
          <StillsScreen campaign={campaign} embedded />
        ) : null}
        {tab === 'settings' ? <SettingsScreen embedded /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
    backgroundColor: theme.colors.background,
  },
  headerText: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  kicker: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  leave: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  leaveLabel: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  body: {
    flex: 1,
  },
  panel: {
    flex: 1,
  },
  panelHidden: {
    display: 'none',
  },
  pressed: {
    opacity: 0.85,
  },
});
