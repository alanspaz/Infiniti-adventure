import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  buyPrice,
  getMerchantDef,
  merchantState,
  sellPrice,
  tradeLedger,
  type InventoryItem,
} from '../../engine';
import { useCampaignState } from '../campaign';
import { theme } from '../theme';

/**
 * P-INT-04 shop / barter: player bag vs merchant stock side by side.
 * Reads CampaignState only; every trade goes through runTrade.
 * Ledger totals (gold + units across both sides) are conserved per trade.
 */
export function ShopPanel() {
  const { state, runTrade } = useCampaignState();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const merchantId = state.shop.activeMerchantId;
  const def = merchantId ? getMerchantDef(merchantId) : null;
  if (!merchantId || !def) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No shop open</Text>
        <Text style={styles.emptyBody}>
          Ask to trade in the Tale where a merchant works — the Copper Kettle,
          Brightanvil Smithy, or Mossglass Alchemist.
        </Text>
      </View>
    );
  }
  const m = merchantState(state, merchantId);
  const ledger = tradeLedger(state, merchantId);

  const trade = (kind: 'buy' | 'sell', itemId: string) => {
    const r = runTrade({ kind, merchantId, itemId });
    setFeedback({ ok: r.ok, text: r.message });
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>{def.name}</Text>
      <Text style={styles.keeper}>{def.keeper}</Text>

      <View style={styles.ledger} accessibilityLabel="Trade ledger">
        <Text style={styles.ledgerLine}>
          You <Text style={styles.gold}>{ledger.playerGold}g</Text> ·{' '}
          {ledger.playerUnits} items
        </Text>
        <Text style={styles.ledgerLine}>
          Merchant <Text style={styles.gold}>{ledger.merchantGold}g</Text> ·{' '}
          {ledger.merchantUnits} items
        </Text>
        <Text style={styles.ledgerTotal}>
          Total {ledger.totalGold}g · {ledger.totalUnits} items
        </Text>
      </View>

      {feedback ? (
        <Text
          style={[styles.feedback, !feedback.ok && styles.feedbackMuted]}
          accessibilityLiveRegion="polite"
        >
          {feedback.text}
        </Text>
      ) : null}

      <View style={styles.columns}>
        <View style={styles.col}>
          <Text style={styles.colTitle}>Your bag</Text>
          {state.inventory.items.length === 0 ? (
            <Text style={styles.none}>Nothing to sell.</Text>
          ) : (
            state.inventory.items.map((it) => (
              <TradeRow
                key={it.id}
                item={it}
                price={sellPrice(state, merchantId, it)}
                action="Sell"
                tag={it.kind === 'quest' ? 'quest' : it.equipped ? 'equipped' : null}
                onPress={() => trade('sell', it.id)}
              />
            ))
          )}
        </View>
        <View style={styles.col}>
          <Text style={styles.colTitle}>For sale</Text>
          {m.stock.length === 0 ? (
            <Text style={styles.none}>Sold out.</Text>
          ) : (
            m.stock.map((it) => {
              const price = buyPrice(state, merchantId, it);
              return (
                <TradeRow
                  key={it.id}
                  item={it}
                  price={price}
                  action="Buy"
                  tag={price > state.inventory.gold ? 'too dear' : null}
                  onPress={() => trade('buy', it.id)}
                />
              );
            })
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function TradeRow({
  item,
  price,
  action,
  tag,
  onPress,
}: {
  item: InventoryItem;
  price: number;
  action: 'Buy' | 'Sell';
  tag: string | null;
  onPress: () => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.itemName} numberOfLines={2}>
        {item.name}
      </Text>
      <Text style={styles.itemMeta}>
        ×{item.qty} · {price}g{tag ? ` · ${tag}` : ''}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${action} ${item.name} for ${price} gold`}
        onPress={onPress}
        style={({ pressed }) => [
          styles.btn,
          tag && styles.btnMuted,
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.btnLabel, tag && styles.btnLabelMuted]}>{action}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: theme.colors.surface },
  root: { padding: theme.spacing.md, paddingBottom: theme.spacing.xl },
  title: { color: theme.colors.accent, fontSize: 18, fontWeight: '700' },
  keeper: { color: theme.colors.textMuted, fontSize: 13, marginBottom: theme.spacing.sm },
  ledger: {
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.background,
    borderRadius: 10,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  ledgerLine: { color: theme.colors.text, fontSize: 13, lineHeight: 19 },
  ledgerTotal: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  gold: { color: theme.colors.accent, fontWeight: '700' },
  feedback: {
    color: theme.colors.accent,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: theme.spacing.sm,
  },
  feedbackMuted: { color: theme.colors.textMuted },
  columns: { flexDirection: 'row', gap: theme.spacing.sm },
  col: { flex: 1, minWidth: 0 },
  colTitle: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: theme.spacing.xs,
  },
  none: { color: theme.colors.textMuted, fontSize: 13 },
  row: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  itemName: { color: theme.colors.text, fontSize: 14, fontWeight: '700' },
  itemMeta: { color: theme.colors.textMuted, fontSize: 12, marginTop: 2 },
  btn: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: 6,
    paddingVertical: 5,
    alignItems: 'center',
  },
  btnMuted: { borderColor: theme.colors.border },
  btnLabel: { color: theme.colors.accent, fontSize: 13, fontWeight: '700' },
  btnLabelMuted: { color: theme.colors.textMuted },
  pressed: { opacity: 0.85 },
  empty: { padding: theme.spacing.lg },
  emptyTitle: { color: theme.colors.accent, fontSize: 16, fontWeight: '700' },
  emptyBody: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 4 },
});
