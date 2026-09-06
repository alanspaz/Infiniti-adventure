import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CampaignSave } from '../../engine';
import { theme } from '../theme';

type Props = {
  onOpenSettings: () => void;
  onNewCampaign: () => void;
  /** Resume active campaign at Scene adventure loop. */
  onContinue?: () => void;
  /** Open Scene play (new / refresh beat). */
  onNewScene?: () => void;
  /** Thin whereAmI / map exits when a campaign exists. */
  onOpenMap?: () => void;
  /** Character sheet (empty-state OK without campaign). */
  onOpenSheet: () => void;
  /** Dice / ability checks (NdM always; checks need PC). */
  onOpenDice: () => void;
  lastCampaign?: CampaignSave | null;
  /** Best-effort persist status (saved / restored / memory-only). */
  persistNote?: string | null;
};

export function HomeScreen({
  onOpenSettings,
  onNewCampaign,
  onContinue,
  onNewScene,
  onOpenMap,
  onOpenSheet,
  onOpenDice,
  lastCampaign = null,
  persistNote = null,
}: Props) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Infinite Adventure</Text>
      <Text style={styles.subtitle}>
        You travel alone unless you form a party. Companions are never added for
        you.
      </Text>
      <Text style={styles.placeholder}>
        Start a new campaign: choose a playstyle pack, then set your identity.
        Campaigns save on-device so you can continue after reload.
      </Text>

      {lastCampaign ? (
        <View style={styles.banner}>
          <Text style={styles.bannerLabel}>
            {persistNote ?? 'Campaign ready'}
          </Text>
          <Text style={styles.bannerTitle}>{lastCampaign.title}</Text>
          <Text style={styles.bannerMeta}>
            Pack: {lastCampaign.playstylePackId ?? 'none'} · Party:{' '}
            {lastCampaign.party.length === 0
              ? 'empty'
              : lastCampaign.party
                  .map((c) => `${c.name} (${c.className})`)
                  .join(', ')}
          </Text>
          {lastCampaign.session.locationId ? (
            <Text style={styles.bannerMeta}>
              Location: {lastCampaign.session.locationId}
            </Text>
          ) : null}
          {lastCampaign.session.turn > 0 ? (
            <Text style={styles.bannerMeta}>
              Turn: {lastCampaign.session.turn}
            </Text>
          ) : null}
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

      {lastCampaign && onNewScene ? (
        <Pressable
          accessibilityRole="button"
          onPress={onNewScene}
          style={({ pressed }) => [
            styles.button,
            styles.buttonSpaced,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonLabel}>New scene</Text>
        </Pressable>
      ) : null}

      {lastCampaign && onOpenMap ? (
        <Pressable
          accessibilityRole="button"
          onPress={onOpenMap}
          style={({ pressed }) => [
            styles.button,
            styles.buttonSpaced,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonLabel}>Where am I (map)</Text>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={onOpenSheet}
        style={({ pressed }) => [
          styles.button,
          styles.buttonSpaced,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.buttonLabel}>Character sheet</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={onOpenDice}
        style={({ pressed }) => [
          styles.button,
          styles.buttonSpaced,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.buttonLabel}>Dice</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
    justifyContent: 'center',
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
    borderRadius: 10,
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
    borderRadius: 8,
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
    borderRadius: 8,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  buttonSpaced: {
    marginTop: theme.spacing.sm,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonLabel: {
    color: theme.colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
});
