import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CampaignSave } from '../../engine';
import {
  PlayIconGrid,
  type PlayPanelId,
  type PlaySurfaceId,
} from '../components/PlayIconGrid';
import { theme } from '../theme';
import { SceneScreen } from './SceneScreen';
import { QuestTab } from './QuestTab';
import { CharacterSheetScreen } from './CharacterSheetScreen';
import { CompanionsTab } from './CompanionsTab';
import { ItemsTab } from './ItemsTab';
import { MapScreen } from './MapScreen';
import { DiceScreen } from './DiceScreen';
import { CombatStatsTab } from './CombatStatsTab';
import { StillsScreen } from './StillsScreen';
import { SettingsScreen } from './SettingsScreen';

type Props = {
  campaign: CampaignSave;
  onCampaignChange: (campaign: CampaignSave) => void;
  onLeave: () => void;
};

/**
 * Base44-inspired play shell: Story chat is the default surface;
 * header icon grid opens secondary panels. Story stays mounted (T-017).
 */
export function PlayShell({ campaign, onCampaignChange, onLeave }: Props) {
  const [surface, setSurface] = useState<PlaySurfaceId>('story');
  const pc = campaign.party.length > 0 ? campaign.party[0]! : null;
  const subtitle = pc
    ? `${pc.name} · Level ${pc.level}`
    : 'Solo · ready when you are';

  const openPanel = (id: PlayPanelId) => setSurface(id);
  const openStory = () => setSurface('story');

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>Adventure</Text>
          <Text style={styles.title} numberOfLines={1}>
            {campaign.title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to home"
          onPress={onLeave}
          style={({ pressed }) => [styles.leave, pressed && styles.pressed]}
        >
          <Text style={styles.leaveLabel}>‹</Text>
        </Pressable>
      </View>

      <PlayIconGrid
        active={surface}
        onChange={openPanel}
        onStory={openStory}
      />

      <View style={styles.body}>
        <View
          style={[styles.panel, surface !== 'story' && styles.panelHidden]}
          pointerEvents={surface === 'story' ? 'auto' : 'none'}
        >
          <SceneScreen
            campaign={campaign}
            onCampaignChange={onCampaignChange}
            embedded
            onOpenStills={() => setSurface('stills')}
          />
        </View>
        {surface === 'quest' ? <QuestTab campaign={campaign} /> : null}
        {surface === 'character' ? (
          <CharacterSheetScreen campaign={campaign} embedded />
        ) : null}
        {surface === 'companions' ? (
          <CompanionsTab campaign={campaign} />
        ) : null}
        {surface === 'items' ? <ItemsTab campaign={campaign} /> : null}
        {surface === 'map' ? (
          <MapScreen
            campaign={campaign}
            onCampaignChange={onCampaignChange}
            embedded
          />
        ) : null}
        {surface === 'dice' ? (
          <DiceScreen campaign={campaign} embedded />
        ) : null}
        {surface === 'combat' ? (
          <CombatStatsTab campaign={campaign} />
        ) : null}
        {surface === 'stills' ? (
          <StillsScreen campaign={campaign} embedded />
        ) : null}
        {surface === 'settings' ? <SettingsScreen embedded /> : null}
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
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 2,
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
