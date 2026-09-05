import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SettingsProvider } from './src/settings/SettingsContext';
import { HomeScreen } from './src/screens/HomeScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

type Screen = 'home' | 'settings';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  return (
    <SettingsProvider>
      {screen === 'home' ? (
        <HomeScreen onOpenSettings={() => setScreen('settings')} />
      ) : (
        <SettingsScreen onBack={() => setScreen('home')} />
      )}
      <StatusBar style="light" />
    </SettingsProvider>
  );
}
