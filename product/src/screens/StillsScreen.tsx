import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { CampaignSave } from '../../engine';
import type { StillCacheEntry, StillSubjectKind } from '../../engine/stills';
import { StillFrame } from '../components/StillFrame';
import {
  createAppStillProvider,
  loadStillGallery,
} from '../persist/stillCache';
import { theme } from '../theme';

type Props = {
  campaign: CampaignSave | null;
  onBack: () => void;
};

const QUICK_SUBJECTS: StillSubjectKind[] = [
  'described',
  'location',
  'player',
  'item',
];

/**
 * Dedicated stills gallery: request stub placeholders + browse device cache.
 * Offline-first; remote image gen not required.
 */
export function StillsScreen({ campaign, onBack }: Props) {
  const [entries, setEntries] = useState<StillCacheEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await loadStillGallery();
      setEntries(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const requestSubject = async (subjectKind: StillSubjectKind) => {
    setBusy(true);
    setError(null);
    try {
      const provider = createAppStillProvider();
      const result = await provider.requestStill({
        subjectKind,
        subjectId:
          subjectKind === 'player' && campaign?.party[0]
            ? campaign.party[0].id
            : null,
        locationId: campaign?.session.locationId ?? null,
        playstylePackId: campaign?.playstylePackId ?? null,
        prompt:
          subjectKind === 'described'
            ? campaign?.session.logSummary?.slice(0, 80) ||
              'Show me what was described'
            : null,
      });
      setNote(
        result.message.includes('(cached)')
          ? 'Loaded from device cache'
          : 'Placeholder saved to device cache',
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
      >
        <Text style={styles.backLabel}>Back</Text>
      </Pressable>

      <Text style={styles.title}>Stills</Text>
      <Text style={styles.hint}>
        Ask to see what was described. Offline stub returns themed placeholders;
        results persist on device so they survive reload. Remote image gen is
        not configured. Empty party is valid.
      </Text>

      {note ? <Text style={styles.note}>{note}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.section}>Request</Text>
      <View style={styles.row}>
        {QUICK_SUBJECTS.map((kind) => (
          <Pressable
            key={kind}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              void requestSubject(kind);
            }}
            style={({ pressed }) => [
              styles.chip,
              pressed && styles.pressed,
              busy && styles.disabled,
            ]}
          >
            <Text style={styles.chipLabel}>{kind}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.section}>
        Device cache ({entries.length})
      </Text>
      {entries.length === 0 ? (
        <Text style={styles.meta}>
          No cached stills yet. Request one above or use Scene → Show me.
        </Text>
      ) : (
        entries.map((entry) => (
          <StillFrame
            key={entry.cacheKey}
            still={entry}
            caption={`Cached ${entry.cachedAt}`}
            compact
          />
        ))
      )}

      <Text style={styles.footer}>
        Campaign:{' '}
        {campaign
          ? `${campaign.title} · party ${
              campaign.party.length === 0
                ? 'empty'
                : campaign.party.map((c) => c.name).join(', ')
            }`
          : 'none (still requests work)'}
      </Text>
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
  },
  back: {
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  backLabel: {
    color: theme.colors.accent,
    fontSize: 16,
  },
  title: {
    color: theme.colors.accent,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: theme.spacing.sm,
  },
  hint: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: theme.spacing.md,
  },
  note: {
    color: theme.colors.accent,
    fontSize: 12,
    marginBottom: theme.spacing.xs,
  },
  error: {
    color: theme.colors.danger,
    marginBottom: theme.spacing.sm,
  },
  section: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  chip: {
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: 8,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  chipLabel: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  meta: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginBottom: theme.spacing.md,
  },
  footer: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: theme.spacing.md,
  },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.85 },
});
