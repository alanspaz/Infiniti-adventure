import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

/** TABS-01: shared presentational bits for the ☰ info tabs (no state). */
export function Section({ children }: { children: React.ReactNode }) {
  return <Text style={kit.section}>{children}</Text>;
}

export function Card({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <View style={[kit.card, muted && kit.cardMuted]}>{children}</View>;
}

export function KV({ label, value }: { label: string; value: string }) {
  return (
    <View style={kit.kv}>
      <Text style={kit.kvLabel}>{label}</Text>
      <Text style={kit.kvValue}>{value}</Text>
    </View>
  );
}

export function Notes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <View style={kit.notes}>
      {notes.map((n, i) => (
        <Text key={`${i}-${n}`} style={kit.note}>
          · {n}
        </Text>
      ))}
    </View>
  );
}

export function Bar({ pct }: { pct: number }) {
  const w = `${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%` as const;
  return (
    <View style={kit.barTrack}>
      <View style={[kit.barFill, { width: w }]} />
    </View>
  );
}

export const kit = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: theme.colors.surface },
  root: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xl },
  hint: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: theme.spacing.md },
  section: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: '700',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  cardMuted: { opacity: 0.85 },
  title: { color: theme.colors.text, fontSize: 16, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: 13, marginTop: 2 },
  body: { color: theme.colors.text, fontSize: 14, lineHeight: 20, marginTop: theme.spacing.xs },
  muted: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 20 },
  badge: { color: theme.colors.accent, fontSize: 11, fontWeight: '700', marginTop: 4, textTransform: 'uppercase' },
  badgeMuted: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 4, textTransform: 'uppercase' },
  emptyTitle: { color: theme.colors.accent, fontSize: 16, fontWeight: '700', marginBottom: theme.spacing.xs },
  emptyBody: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 21 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, gap: theme.spacing.sm },
  kvLabel: { color: theme.colors.textMuted, fontSize: 14 },
  kvValue: { color: theme.colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  notes: { marginTop: theme.spacing.xs },
  note: { color: theme.colors.text, fontSize: 13, lineHeight: 19, marginTop: 2 },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    marginTop: theme.spacing.xs,
  },
  barFill: { height: '100%', backgroundColor: theme.colors.accent },
});
