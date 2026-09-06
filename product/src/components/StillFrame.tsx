import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { StillResult } from '../../engine/stills';
import { theme } from '../theme';

type Props = {
  still: StillResult;
  /** Optional short caption under the frame. */
  caption?: string | null;
  compact?: boolean;
};

const SUBJECT_LABEL: Record<string, string> = {
  player: 'Player',
  npc: 'NPC',
  location: 'Location',
  item: 'Item',
  injury: 'Injury',
  described: 'Described',
};

/**
 * Themed still display: real Image when uri exists, else offline placeholder frame.
 * Colors: background #140f0c / accent #d4a054.
 */
export function StillFrame({ still, caption = null, compact = false }: Props) {
  const label = SUBJECT_LABEL[still.subjectKind] ?? still.subjectKind;
  const showImage = Boolean(still.uri && !still.placeholder);

  return (
    <View
      style={[styles.card, compact && styles.cardCompact]}
      accessibilityRole="image"
      accessibilityLabel={`Still: ${label}. ${still.message}`}
    >
      <View style={styles.header}>
        <Text style={styles.kind}>{label}</Text>
        <Text style={styles.badge}>
          {still.offline ? 'Offline' : 'Online'}
          {still.placeholder ? ' · Placeholder' : ''}
        </Text>
      </View>

      <View style={[styles.frame, compact && styles.frameCompact]}>
        {showImage && still.uri ? (
          <Image
            source={{ uri: still.uri }}
            style={styles.image}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={styles.placeholder}>
            <View style={styles.ornamentOuter}>
              <View style={styles.ornamentInner}>
                <Text style={styles.glyph}>◈</Text>
                <Text style={styles.placeholderTitle}>{label}</Text>
                <Text style={styles.placeholderHint}>No image bytes · stub</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      <Text style={styles.message}>{still.message}</Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      <Text style={styles.cacheKey} numberOfLines={2}>
        {still.cacheKey}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  cardCompact: {
    padding: theme.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  kind: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  badge: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },
  frame: {
    height: 180,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    marginBottom: theme.spacing.sm,
  },
  frameCompact: {
    height: 120,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
  },
  ornamentOuter: {
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: 8,
    padding: 3,
    width: '88%',
  },
  ornamentInner: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    alignItems: 'center',
    backgroundColor: '#1a1410',
  },
  glyph: {
    color: theme.colors.accent,
    fontSize: 28,
    marginBottom: 4,
  },
  placeholderTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  placeholderHint: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  message: {
    color: theme.colors.text,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  caption: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginBottom: 4,
  },
  cacheKey: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontFamily: 'monospace',
  },
});
