import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import type { CampaignSave } from './engine';
import { SettingsProvider } from './src/settings/SettingsContext';
import { HomeScreen } from './src/screens/HomeScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { PackSelectScreen } from './src/screens/PackSelectScreen';
import { IdentityScreen } from './src/screens/IdentityScreen';
import { PlayShell } from './src/screens/PlayShell';
import { DiceScreen } from './src/screens/DiceScreen';
import { StillsScreen } from './src/screens/StillsScreen';
import {
  loadActiveCampaign,
  persistCampaign,
} from './src/persist';

type Screen = 'home' | 'settings' | 'pack-select' | 'identity' | 'play' | 'dice' | 'stills';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [draftPackId, setDraftPackId] = useState<string | null>(null);
  const [lastCampaign, setLastCampaign] = useState<CampaignSave | null>(null);
  const [persistNote, setPersistNote] = useState<string | null>(null);

  // Best-effort restore after reload (AsyncStorage or memory fallback).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const camp = await loadActiveCampaign();
        if (!cancelled && camp) {
          setLastCampaign(camp);
          setPersistNote('Restored from device storage');
        }
      } catch {
        // ignore — continue with empty session
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const commitCampaign = useCallback(async (campaign: CampaignSave) => {
    setLastCampaign(campaign);
    try {
      const saved = await persistCampaign(campaign);
      setLastCampaign(saved);
      setPersistNote('Saved on device');
    } catch {
      setPersistNote('In memory only (storage unavailable)');
    }
  }, []);

  return (
    <SettingsProvider>
      {screen === 'home' ? (
        <HomeScreen
          lastCampaign={lastCampaign}
          persistNote={persistNote}
          onOpenSettings={() => setScreen('settings')}
          onNewCampaign={() => {
            setDraftPackId(null);
            setScreen('pack-select');
          }}
          onContinue={
            lastCampaign
              ? () => {
                  setScreen('play');
                }
              : undefined
          }
          onOpenDice={() => setScreen('dice')}
          onOpenStills={() => setScreen('stills')}
        />
      ) : null}
      {screen === 'settings' ? (
        <SettingsScreen onBack={() => setScreen('home')} />
      ) : null}
      {screen === 'pack-select' ? (
        <PackSelectScreen
          onBack={() => setScreen('home')}
          onSelectPack={(packId) => {
            setDraftPackId(packId);
            setScreen('identity');
          }}
        />
      ) : null}
      {screen === 'identity' && draftPackId ? (
        <IdentityScreen
          packId={draftPackId}
          onBack={() => setScreen('pack-select')}
          onCreated={(campaign) => {
            void commitCampaign(campaign).then(() => {
              setDraftPackId(null);
              setScreen('play');
            });
          }}
        />
      ) : null}
      {screen === 'play' && lastCampaign ? (
        <PlayShell
          campaign={lastCampaign}
          onCampaignChange={(next) => {
            void commitCampaign(next);
          }}
          onLeave={() => setScreen('home')}
        />
      ) : null}
      {screen === 'dice' ? (
        <DiceScreen
          campaign={lastCampaign}
          onBack={() => setScreen('home')}
        />
      ) : null}
      {screen === 'stills' ? (
        <StillsScreen
          campaign={lastCampaign}
          onBack={() => setScreen('home')}
        />
      ) : null}
      <StatusBar style="light" />
    </SettingsProvider>
  );
}
