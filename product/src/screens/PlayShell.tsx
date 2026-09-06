import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { CampaignSave } from '../../engine';
import { CampaignStateProvider, useCampaignState } from '../campaign';
import { CombatRail } from '../components/CombatRail';
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

const SIDE_PANEL_BREAKPOINT = 768;

/**
 * Base44-inspired hybrid: Story + icon header + combat rail.
 * Desktop-ish: story main + side panel; mobile: full-screen panel overlay.
 * All panels read CampaignState only (CS-01).
 */
export function PlayShell({ campaign, onCampaignChange, onLeave }: Props) {
  return (
    <CampaignStateProvider
      campaign={campaign}
      onCampaignChange={onCampaignChange}
    >
      <PlayShellInner onLeave={onLeave} />
    </CampaignStateProvider>
  );
}

function PlayShellInner({ onLeave }: { onLeave: () => void }) {
  const { state, campaign, replaceCampaign } = useCampaignState();
  const [surface, setSurface] = useState<PlaySurfaceId>('story');
  const { width } = useWindowDimensions();
  const sideBySide = width >= SIDE_PANEL_BREAKPOINT && surface !== 'story';

  const subtitle = state.character
    ? `${state.character.name} · Level ${state.character.level}`
    : 'Solo · ready when you are';

  const openPanel = (id: PlayPanelId) => setSurface(id);
  const openStory = () => setSurface('story');
  const panelOpen = surface !== 'story';

  const panel = renderPanel(surface, campaign, replaceCampaign);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>Adventure</Text>
          <Text style={styles.title} numberOfLines={1}>
            {state.title}
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

      <View style={[styles.body, sideBySide && styles.bodyRow]}>
        <View
          style={[
            styles.storyCol,
            !sideBySide && panelOpen && styles.panelHidden,
          ]}
          pointerEvents={!panelOpen || sideBySide ? 'auto' : 'none'}
        >
          <SceneScreen
            campaign={campaign}
            onCampaignChange={replaceCampaign}
            embedded
            onOpenStills={() => setSurface('stills')}
          />
        </View>

        {panelOpen ? (
          <View
            style={[
              styles.sidePanel,
              sideBySide ? styles.sidePanelDesktop : styles.sidePanelMobile,
            ]}
          >
            <View style={styles.sideHeader}>
              <Text style={styles.sideTitle}>{panelTitle(surface)}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close panel"
                onPress={openStory}
                style={({ pressed }) => [
                  styles.sideClose,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.sideCloseLabel}>Close</Text>
              </Pressable>
            </View>
            <View style={styles.sideBody}>{panel}</View>
          </View>
        ) : null}
      </View>

      <CombatRail />
    </View>
  );
}

function panelTitle(surface: PlaySurfaceId): string {
  switch (surface) {
    case 'character':
      return 'Character';
    case 'items':
      return 'Items';
    case 'dice':
      return 'Dice';
    case 'combat':
      return 'Combat';
    case 'quest':
      return 'Quests';
    case 'companions':
      return 'Companions';
    case 'map':
      return 'Map';
    case 'settings':
      return 'Settings';
    case 'stills':
      return 'Visions';
    default:
      return 'Panel';
  }
}

function renderPanel(
  surface: PlaySurfaceId,
  campaign: CampaignSave,
  replaceCampaign: (c: CampaignSave) => void,
): React.ReactNode {
  switch (surface) {
    case 'quest':
      return <QuestTab />;
    case 'character':
      return <CharacterSheetScreen campaign={campaign} embedded />;
    case 'companions':
      return <CompanionsTab />;
    case 'items':
      return <ItemsTab />;
    case 'map':
      return (
        <MapScreen
          campaign={campaign}
          onCampaignChange={replaceCampaign}
          embedded
        />
      );
    case 'dice':
      return <DiceScreen campaign={campaign} embedded />;
    case 'combat':
      return <CombatStatsTab />;
    case 'stills':
      return <StillsScreen campaign={campaign} embedded />;
    case 'settings':
      return <SettingsScreen embedded />;
    default:
      return null;
  }
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
    minHeight: 0,
  },
  bodyRow: {
    flexDirection: 'row',
  },
  storyCol: {
    flex: 1,
    minWidth: 0,
  },
  panelHidden: {
    display: 'none',
  },
  sidePanel: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  sidePanelDesktop: {
    width: 360,
    maxWidth: '42%',
    margin: theme.spacing.sm,
    marginLeft: 0,
  },
  sidePanelMobile: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    margin: 0,
    borderRadius: 0,
    borderWidth: 0,
    borderTopWidth: 1,
  },
  sideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  sideTitle: {
    color: theme.colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  sideClose: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  sideCloseLabel: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  sideBody: {
    flex: 1,
    minHeight: 0,
  },
  pressed: {
    opacity: 0.85,
  },
});
