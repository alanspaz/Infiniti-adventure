import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCampaignState } from '../campaign';
import { theme } from '../theme';

/** Inventory — CampaignState.inventory only; gold always ≥ 0. */
export function ItemsTab() {
  const { state } = useCampaignState();
  const gold = Math.max(0, Math.floor(Number(state.inventory?.gold) || 0));
  const items = Array.isArray(state.inventory?.items) ? state.inventory.items : [];
  const pcName = state.character?.name ?? 'your pack';

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.subtitle}>Belongings of {pcName}</Text>
      <View style={styles.goldCard}>
        <Text style={styles.goldLabel}>Gold</Text>
        <Text style={styles.goldValue}>{gold}</Text>
      </View>

      {items.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>Pack is empty</Text>
          <Text style={styles.emptyBody}>
            Nothing rattles in your satchel yet. Gear and finds will show up here
            when the adventure hands them to you.
          </Text>
        </View>
      ) : (
        items.map((it) => (
          <View key={it.id || it.name} style={styles.card}>
            <Text style={styles.itemName}>{it.name || 'Item'}</Text>
            <Text style={styles.itemMeta}>
              ×{Math.max(1, Math.floor(Number(it.qty) || 1))}
              {it.kind ? ` · ${it.kind}` : ''}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: theme.colors.surface },
  root: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginBottom: theme.spacing.md,
  },
  goldCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  goldLabel: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  goldValue: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  card: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  emptyTitle: {
    color: theme.colors.accent,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: theme.spacing.xs,
  },
  emptyBody: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  itemName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  itemMeta: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
});
