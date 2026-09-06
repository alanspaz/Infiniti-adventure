import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
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
    baseUrl,
    model,
    remoteError,
    setVerbosity,
    setProviderKind,
    setApiKey,
    setBaseUrl,
    setModel,
  } = useSettings();
  const [draftKey, setDraftKey] = useState(apiKey);
  const [draftBaseUrl, setDraftBaseUrl] = useState(baseUrl);
  const [draftModel, setDraftModel] = useState(model);

  React.useEffect(() => {
    setDraftKey(apiKey);
  }, [apiKey]);
  React.useEffect(() => {
    setDraftBaseUrl(baseUrl);
  }, [baseUrl]);
  React.useEffect(() => {
    setDraftModel(model);
  }, [model]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
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
      {providerKind === 'on-device' ? (
        <Text style={styles.hint}>
          On-device LLM is reserved in v1 — play uses the offline stub.
        </Text>
      ) : (
        <Text style={styles.hint}>
          Stub works offline. Remote uses an OpenAI-compatible chat URL + API
          key (never logged). Play falls back to stub if remote is incomplete
          or fails.
        </Text>
      )}
      {remoteError ? <Text style={styles.error}>{remoteError}</Text> : null}

      <Text style={styles.section}>Base URL</Text>
      <TextInput
        value={draftBaseUrl}
        onChangeText={setDraftBaseUrl}
        onBlur={() => {
          void setBaseUrl(draftBaseUrl.trim());
        }}
        placeholder="https://api.openai.com/v1"
        placeholderTextColor={theme.colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={styles.input}
      />
      <Text style={styles.hint}>
        OpenAI-compatible endpoint (OpenRouter / xAI / etc. also fine). Trailing
        slash optional.
      </Text>

      <Text style={styles.section}>Model (optional)</Text>
      <TextInput
        value={draftModel}
        onChangeText={setDraftModel}
        onBlur={() => {
          void setModel(draftModel.trim());
        }}
        placeholder="e.g. gpt-4o-mini"
        placeholderTextColor={theme.colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />

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
          void setBaseUrl(draftBaseUrl.trim());
          void setModel(draftModel.trim());
          void setApiKey(draftKey);
        }}
        style={({ pressed }) => [styles.save, pressed && styles.pressed]}
      >
        <Text style={styles.saveLabel}>Save remote settings</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xl * 2,
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
  error: {
    color: '#e08060',
    fontSize: 13,
    marginTop: theme.spacing.sm,
    lineHeight: 18,
    fontWeight: '600',
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
