import React from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { CampaignSave } from '../../engine';
import { appImages } from '../images';
import { theme } from '../theme';

type Props = {
  onOpenSettings: () => void;
  onNewCampaign: () => void;
  /** Resume active campaign in the play shell. */
  onContinue?: () => void;
  lastCampaign?: CampaignSave | null;
  /**
   * Soft status under the campaign banner (player-facing).
   * Prefer quiet labels — no storage/tech chrome.
   */
  statusNote?: string | null;
};

export function HomeScreen({
  onOpenSettings,
  onNewCampaign,
  onContinue,
  lastCampaign = null,
  statusNote = null,
}: Props) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
    >
      <Image
        source={appImages.homeHero}
        style={styles.hero}
        resizeMode="cover"
        accessibilityLabel="Infinite Adventure"
      />

      <Text style={styles.title}>Infinite Adventure</Text>
      <Text style={styles.subtitle}>
        A solo phone RPG. You travel alone unless you form a party — companions
        are never added for you.
      </Text>
      <Text style={styles.placeholder}>
        Start a campaign, then play in Story. Map, Dice, Stills, and the rest
        live in the adventure tabs.
      </Text>

      {lastCampaign ? (
        <View style={styles.banner}>
          <Text style={styles.bannerLabel}>
            {statusNote ?? 'Ready to continue'}
          </Text>
          <Text style={styles.bannerTitle}>{lastCampaign.title}</Text>
          <Text style={styles.bannerMeta}>
            {lastCampaign.party.length === 0
              ? 'Traveling alone'
              : lastCampaign.party
                  .map((c) => `${c.name} (${c.className})`)
                  .join(', ')}
          </Text>
        </View>
      ) : null}

      {lastCampaign && onContinue ? (
        <Pressable
          accessibilityRole="button"
          onPress={onContinue}
          style={({ pressed }) => [
            styles.primary,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.primaryLabel}>Continue</Text>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={onNewCampaign}
        style={({ pressed }) => [
          lastCampaign ? styles.button : styles.primary,
          lastCampaign ? styles.buttonSpaced : null,
          !lastCampaign ? { marginBottom: theme.spacing.sm } : null,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text
          style={lastCampaign ? styles.buttonLabel : styles.primaryLabel}
        >
          New campaign
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={onOpenSettings}
        style={({ pressed }) => [
          styles.button,
          styles.buttonSpaced,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.buttonLabel}>Settings</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  root: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    justifyContent: 'center',
    flexGrow: 1,
  },
  hero: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  title: {
    color: theme.colors.accent,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 22,
    marginBottom: theme.spacing.md,
  },
  placeholder: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: theme.spacing.lg,
  },
  banner: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  bannerLabel: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  bannerTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  bannerMeta: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  primary: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.accent,
    borderRadius: 10,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  primaryLabel: {
    color: theme.colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  button: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.accent,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  buttonSpaced: {
    marginTop: theme.spacing.sm,
  },
  buttonLabel: {
    color: theme.colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.85,
  },
});
