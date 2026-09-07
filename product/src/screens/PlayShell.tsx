import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { StillsScreen } from './StillsScreen';
import { SettingsScreen } from './SettingsScreen';

type Props = {
  campaign: CampaignSave;
  onCampaignChange: (campaign: CampaignSave) => void;
  onLeave: () => void;
};

const SIDE_PANEL_BREAKPOINT = 768;

/**
 * Immersive Tale chrome (UI-04): chat-first story; icon grid behind more menu.
 * Character tab merges combat readiness (UI-02); no separate Combat panel.
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
  const [menuOpen, setMenuOpen] = useState(false);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sideBySide = width >= SIDE_PANEL_BREAKPOINT && surface !== 'story';

  const openPanel = (id: PlayPanelId) => {
    setSurface(id);
    setMenuOpen(false);
  };
  const openStory = () => {
    setSurface('story');
    setMenuOpen(false);
  };
  const panelOpen = surface !== 'story';

  const panel = renderPanel(surface, campaign, replaceCampaign, state.title);

  // UX-01b: assume Android 3-button nav visible — aggressive clearance.
  // Keep inset on the OUTER wrapper so KeyboardAvoidingView cannot cancel it.
  const ANDROID_NAV_ASSUME = 48;
  const bottomPad = Math.max(insets.bottom, ANDROID_NAV_ASSUME) + 16;

  return (
    <View style={[styles.root, { paddingBottom: bottomPad }]}>
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View style={[styles.root, { paddingTop: Math.max(insets.top, 0) }]}>
      {/* UI-04: immersive Tale — no TALE/back chrome; tabs behind more menu */}
      <View style={styles.chromeBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={menuOpen ? 'Close menu' : 'More menu'}
          accessibilityState={{ expanded: menuOpen }}
          onPress={() => setMenuOpen((o) => !o)}
          style={({ pressed }) => [
            styles.moreBtn,
            menuOpen && styles.moreBtnOpen,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.moreGlyph, menuOpen && styles.moreGlyphOpen]}>
            ☰
          </Text>
        </Pressable>
        {menuOpen ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to home"
            onPress={onLeave}
            style={({ pressed }) => [styles.homeBtn, pressed && styles.pressed]}
          >
            <Text style={styles.homeLabel}>Home</Text>
          </Pressable>
        ) : null}
      </View>

      {menuOpen ? (
        <PlayIconGrid
          active={surface}
          onChange={openPanel}
          onStory={openStory}
        />
      ) : null}

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
            bottomInset={0}
            onOpenStills={() => { setSurface('stills'); setMenuOpen(false); }}
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

      <CombatRail bottomInset={0} />
      </View>
    </KeyboardAvoidingView>
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
  adventureTitle: string,
): React.ReactNode {
  switch (surface) {
    case 'quest':
      return <QuestTab />;
    case 'character':
      // UI-02: Character sheet includes combat readiness; CombatRail stays separate.
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
    case 'stills':
      return <StillsScreen campaign={campaign} embedded />;
    case 'settings':
      return <SettingsScreen embedded adventureLabel={adventureTitle} />;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  chromeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
    backgroundColor: theme.colors.background,
  },
  moreBtn: {
    width: 40,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  moreBtnOpen: {
    borderColor: theme.colors.accent,
    backgroundColor: '#241c16',
  },
  moreGlyph: {
    color: theme.colors.textMuted,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
  },
  moreGlyphOpen: {
    color: theme.colors.accent,
  },
  homeBtn: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  homeLabel: {
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
