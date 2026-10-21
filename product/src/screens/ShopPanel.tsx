import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  getMerchantDef,
  shopRows,
  tradeLedger,
  type ShopRow,
  type ShopRowMemory,
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
  // QA-02: remember rows seen while this shop is open so nothing jumps.
  const memory = useRef<{ merchantId: string | null; rows: ShopRowMemory }>({
    merchantId: null,
    rows: { player: [], merchant: [] },
  });
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
  if (memory.current.merchantId !== merchantId) {
    memory.current = { merchantId, rows: { player: [], merchant: [] } };
  }
  const rows = shopRows(state, merchantId, memory.current.rows);
  memory.current.rows = rows.memory;
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
        <LedgerLine label="You" gold={ledger.playerGold} units={ledger.playerUnits} />
        <LedgerLine label="Merchant" gold={ledger.merchantGold} units={ledger.merchantUnits} />
        <LedgerLine label="Total" gold={ledger.totalGold} units={ledger.totalUnits} muted />
      </View>

      {/* Fixed-height feedback slot: always present so rows never shift. */}
      <Text
        style={[styles.feedback, feedback && !feedback.ok && styles.feedbackMuted]}
        accessibilityLiveRegion="polite"
        numberOfLines={2}
      >
        {feedback?.text ?? ' '}
      </Text>

      <View style={styles.columns}>
        <View style={styles.col}>
          <Text style={styles.colTitle}>Your bag</Text>
          {rows.player.length === 0 ? (
            <Text style={styles.none}>Nothing to sell.</Text>
          ) : (
            rows.player.map((r) => (
              <TradeRow key={r.id} row={r} action="Sell" onPress={() => trade('sell', r.id)} />
            ))
          )}
        </View>
        <View style={styles.col}>
          <Text style={styles.colTitle}>For sale</Text>
          {rows.merchant.map((r) => (
            <TradeRow key={r.id} row={r} action="Buy" onPress={() => trade('buy', r.id)} />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

/** QA-02: fixed-width columns (tabular digits) so the ledger never reflows. */
function LedgerLine({ label, gold, units, muted }: { label: string; gold: number; units: number; muted?: boolean }) {
  return (
    <View style={styles.ledgerRow}>
      <Text style={[styles.ledgerLabel, muted && styles.ledgerMuted]}>{label}</Text>
      <Text style={[styles.ledgerNum, styles.gold, muted && styles.ledgerMuted]}>{gold}g</Text>
      <Text style={[styles.ledgerNum, muted && styles.ledgerMuted]}>{units} items</Text>
    </View>
  );
}

/** Exported for smoke: every trade row renders at this exact height. */
export const SHOP_ROW_HEIGHT = 92;

function TradeRow({
  row,
  action,
  onPress,
}: {
  row: ShopRow;
  action: 'Buy' | 'Sell';
  onPress: () => void;
}) {
  const dim = row.disabled || row.muted;
  return (
    <View style={[styles.row, row.disabled && styles.rowEmpty]}>
      <Text style={styles.itemName} numberOfLines={1}>
        {row.item.name}
      </Text>
      <Text style={styles.itemMeta} numberOfLines={1}>
        ×{row.qty} · {row.price}g{row.tag ? ` · ${row.tag}` : ''}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${action} ${row.item.name} for ${row.price} gold`}
        accessibilityState={{ disabled: row.disabled }}
        disabled={row.disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.btn,
          dim && styles.btnMuted,
          pressed && !row.disabled && styles.pressed,
        ]}
      >
        <Text style={[styles.btnLabel, dim && styles.btnLabelMuted]}>{action}</Text>
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
  ledgerRow: { flexDirection: 'row', alignItems: 'center', height: 20 },
  ledgerLabel: { width: 76, color: theme.colors.text, fontSize: 13 },
  ledgerNum: {
    width: 72,
    textAlign: 'right',
    color: theme.colors.text,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  ledgerMuted: { color: theme.colors.textMuted, fontWeight: '600' },
  gold: { color: theme.colors.accent, fontWeight: '700' },
  feedback: {
    color: theme.colors.accent,
    fontSize: 13,
    lineHeight: 18,
    height: 36,
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
    height: SHOP_ROW_HEIGHT,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  rowEmpty: { opacity: 0.55 },
  itemName: { color: theme.colors.text, fontSize: 14, fontWeight: '700' },
  itemMeta: { color: theme.colors.textMuted, fontSize: 12, marginTop: 2 },
  btn: {
    height: 30,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: 6,
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
