import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSettings } from '../settings/SettingsContext';
import { ProviderKind, Verbosity } from '../settings/types';
import { theme } from '../theme';

type Props = {
  onBack: () => void;
};

const VERBOSITY_OPTIONS: Verbosity[] = ['short', 'standard', 'lush'];
const PROVIDER_OPTIONS: ProviderKind[] = ['stub', 'remote', 'on-device'];

export function SettingsScreen({ onBack }: Props) {
  const {
    ready,
    verbosity,
    providerKind,
    apiKey,
    setVerbosity,
    setProviderKind,
    setApiKey,
  } = useSettings();
  const [draftKey, setDraftKey] = useState(apiKey);

  React.useEffect(() => {
    setDraftKey(apiKey);
  }, [apiKey]);

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
      >
        <Text style={styles.backLabel}>Back</Text>
      </Pressable>

      <Text style={styles.title}>Settings</Text>
      {!ready ? <Text style={styles.hint}>Loading…</Text> : null}

      <Text style={styles.section}>Narrator verbosity</Text>
      <View style={styles.row}>
        {VERBOSITY_OPTIONS.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="button"
            onPress={() => {
              void setVerbosity(option);
            }}
            style={[
              styles.chip,
              verbosity === option && styles.chipActive,
            ]}
          >
            <Text
              style={[
                styles.chipLabel,
                verbosity === option && styles.chipLabelActive,
              ]}
            >
              {option}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.section}>AI provider</Text>
      <View style={styles.row}>
        {PROVIDER_OPTIONS.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="button"
            onPress={() => {
              void setProviderKind(option);
            }}
            style={[
              styles.chip,
              providerKind === option && styles.chipActive,
            ]}
          >
            <Text
              style={[
                styles.chipLabel,
                providerKind === option && styles.chipLabelActive,
              ]}
            >
              {option}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>
        On-device LLM is stubbed in v1. Remote needs an API key; the key is never logged.
      </Text>

      <Text style={styles.section}>API key</Text>
      <TextInput
        value={draftKey}
        onChangeText={setDraftKey}
        onBlur={() => {
          void setApiKey(draftKey);
        }}
        placeholder="Paste key for remote provider"
        placeholderTextColor={theme.colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        style={styles.input}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void setApiKey(draftKey);
        }}
        style={({ pressed }) => [styles.save, pressed && styles.pressed]}
      >
        <Text style={styles.saveLabel}>Save key</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
  },
  back: {
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  backLabel: {
    color: theme.colors.accent,
    fontSize: 16,
  },
  title: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: theme.spacing.lg,
  },
  section: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '600',
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipActive: {
    borderColor: theme.colors.accent,
  },
  chipLabel: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  chipLabelActive: {
    color: theme.colors.accent,
    fontWeight: '600',
  },
  hint: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: theme.spacing.sm,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  save: {
    alignSelf: 'flex-start',
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  saveLabel: {
    color: theme.colors.background,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
});
