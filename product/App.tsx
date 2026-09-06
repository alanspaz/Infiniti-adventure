import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import type { CampaignSave } from './engine';
import { SettingsProvider } from './src/settings/SettingsContext';
import { HomeScreen } from './src/screens/HomeScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { PackSelectScreen } from './src/screens/PackSelectScreen';
import { IdentityScreen } from './src/screens/IdentityScreen';
import { PlayShell } from './src/screens/PlayShell';
import {
  loadActiveCampaign,
  persistCampaign,
} from './src/persist';

type Screen = 'home' | 'settings' | 'pack-select' | 'identity' | 'play';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [draftPackId, setDraftPackId] = useState<string | null>(null);
  const [lastCampaign, setLastCampaign] = useState<CampaignSave | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  // Best-effort restore after reload.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const camp = await loadActiveCampaign();
        if (!cancelled && camp) {
          setLastCampaign(camp);
          setStatusNote('Ready to continue');
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
      // Quiet success — no tech chrome on Home.
      setStatusNote(null);
    } catch {
      setStatusNote('Progress is held for this session only');
    }
  }, []);

  return (
    <SettingsProvider>
      {screen === 'home' ? (
        <HomeScreen
          lastCampaign={lastCampaign}
          statusNote={statusNote}
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
      <StatusBar style="light" />
    </SettingsProvider>
  );
}
