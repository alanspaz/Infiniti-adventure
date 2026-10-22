import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  STARTER_KIT_FLAG,
  describeItem,
  itemTraits,
  merchantForLocation,
  safeInventory,
  selectGearTab,
  starterKitPatch,
  type GearOrigin,
  type InventoryItem,
  type ItemActionRequest,
} from '../../engine';
import { useCampaignState } from '../campaign';
import { theme } from '../theme';

/**
 * Inventory — CampaignState.inventory only (I-01); gold always ≥ 0.
 * P-INT-01: inspect / use / equip / move / drop — every change is a
 * CampaignState patch via runItemAction (no panel-local copies).
 * Use / equip / drop also append a narrator beat to the Tale.
 * TABS-01: equipped slots + where/how each item was obtained and its
 * inspected lore, all read from CampaignState via selectGearTab.
 */
export function ItemsTab() {
  const { state, runItemAction, applyPatch, openShop } = useCampaignState();
  // P-INT-04: secondary entry point to trade where a merchant works.
  const merchantHere = merchantForLocation(state.locationId);
  const inv = safeInventory(state.inventory);
  const gold = inv.gold;
  const items = inv.items;
  const gear = selectGearTab(state);
  const originOf = (id: string): GearOrigin | null =>
    [...gear.equipped, ...gear.pack].find((i) => i.id === id)?.origin ?? null;
  const pcName = state.character?.name ?? 'your pack';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDropId, setConfirmDropId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const run = (req: ItemActionRequest) => {
    const res = runItemAction(req);
    setFeedback({
      ok: res.ok,
      text: res.narration && res.ok ? `${res.message} (told in the Tale)` : res.message,
    });
    if (req.kind === 'drop' && res.ok) setSelectedId(null);
    setConfirmDropId(null);
  };

  const unpackKit = () => {
    const patch = starterKitPatch(state);
    if (!patch) return;
    applyPatch(patch);
    setFeedback({ ok: true, text: 'Starter kit unpacked.' });
  };

  const hp = state.combat.hp;
  const maxHp = state.combat.maxHp;

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
        {hp != null && maxHp != null ? (
          <Text style={styles.hpMini}>
            HP {hp}/{maxHp}
          </Text>
        ) : null}
      </View>

      {merchantHere && !state.combat.inCombat ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Trade with ${merchantHere.keeper}`}
          onPress={() => openShop(`Trade with ${merchantHere.keeper}`)}
          style={({ pressed }) => [styles.btn, styles.tradeBtn, pressed && styles.pressed]}
        >
          <Text style={styles.btnLabel}>Trade with {merchantHere.keeper}</Text>
        </Pressable>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.slotsTitle}>Equipped</Text>
        {gear.slots.map((sl) => (
          <View key={sl.slot} style={styles.slotRow}>
            <Text style={styles.slotLabel}>{sl.label}</Text>
            <Text style={styles.slotValue}>
              {sl.item ? `${sl.item.name}${sl.detail ? ` · ${sl.detail}` : ''}` : sl.detail}
            </Text>
          </View>
        ))}
      </View>

      {feedback ? (
        <Text
          style={[styles.feedback, !feedback.ok && styles.feedbackMuted]}
          accessibilityLiveRegion="polite"
        >
          {feedback.text}
        </Text>
      ) : null}

      {items.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>Pack is empty</Text>
          <Text style={styles.emptyBody}>
            Nothing rattles in your satchel yet. Gear and finds will show up here
            when the adventure hands them to you.
          </Text>
          {state.flags[STARTER_KIT_FLAG] !== true ? (
            <Pressable
              accessibilityRole="button"
              onPress={unpackKit}
              style={({ pressed }) => [styles.btn, styles.kitBtn, pressed && styles.pressed]}
            >
              <Text style={styles.btnLabel}>Unpack starter kit</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        items.map((it, idx) => (
          <ItemRow
            key={it.id || it.name}
            item={it}
            index={idx}
            count={items.length}
            origin={originOf(it.id)}
            selected={selectedId === it.id}
            confirmDrop={confirmDropId === it.id}
            onToggle={() => {
              setConfirmDropId(null);
              const opening = selectedId !== it.id;
              setSelectedId(opening ? it.id : null);
              // TABS-01: inspecting records the item's lore (no turn, no beat).
              if (opening) runItemAction({ kind: 'inspect', itemId: it.id });
            }}
            onRun={run}
            onAskDrop={() => setConfirmDropId(it.id)}
          />
        ))
      )}
    </ScrollView>
  );
}

function ItemRow({
  item,
  origin,
  index,
  count,
  selected,
  confirmDrop,
  onToggle,
  onRun,
  onAskDrop,
}: {
  item: InventoryItem;
  origin: GearOrigin | null;
  index: number;
  count: number;
  selected: boolean;
  confirmDrop: boolean;
  onToggle: () => void;
  onRun: (req: ItemActionRequest) => void;
  onAskDrop: () => void;
}) {
  const traits = itemTraits(item);
  const qty = Math.max(1, Math.floor(Number(item.qty) || 1));
  const meta = [
    `×${qty}`,
    item.kind ?? null,
    traits.slot ?? null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={[styles.card, item.equipped && styles.cardEquipped]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${selected ? 'collapse' : 'inspect'}`}
        accessibilityState={{ expanded: selected }}
        onPress={onToggle}
        style={({ pressed }) => [styles.rowHead, pressed && styles.pressed]}
      >
        <View style={styles.rowText}>
          <Text style={styles.itemName}>{item.name || 'Item'}</Text>
          <Text style={styles.itemMeta}>{meta}</Text>
          {origin ? <Text style={styles.itemOrigin}>{origin.line}</Text> : null}
          {origin && origin.earlier.length ? (
            <Text style={styles.itemOrigin}>Before that: {origin.earlier.join('; ')}</Text>
          ) : null}
        </View>
        {item.equipped ? <Text style={styles.badge}>Equipped</Text> : null}
      </Pressable>

      {selected ? (
        <View style={styles.detail}>
          {/* Inspect: describe from state (lore recorded once in the chronicle). */}
          <Text style={styles.detailBody}>{origin?.lore ?? describeItem(item)}</Text>
          <View style={styles.actions}>
            {traits.effect ? (
              <ActionBtn label="Use" onPress={() => onRun({ kind: 'use', itemId: item.id })} />
            ) : null}
            {traits.slot ? (
              <ActionBtn
                label={item.equipped ? 'Unequip' : 'Equip'}
                onPress={() => onRun({ kind: 'equip', itemId: item.id })}
              />
            ) : null}
            {!traits.effect && !traits.slot ? (
              <ActionBtn
                label="Use"
                muted
                onPress={() => onRun({ kind: 'use', itemId: item.id })}
              />
            ) : null}
            <ActionBtn
              label="▲"
              accessibilityLabel="Move up"
              disabled={index === 0}
              onPress={() => onRun({ kind: 'move', itemId: item.id, delta: -1 })}
            />
            <ActionBtn
              label="▼"
              accessibilityLabel="Move down"
              disabled={index >= count - 1}
              onPress={() => onRun({ kind: 'move', itemId: item.id, delta: 1 })}
            />
            {confirmDrop ? (
              <ActionBtn
                label="Confirm drop"
                danger
                onPress={() => onRun({ kind: 'drop', itemId: item.id })}
              />
            ) : (
              <ActionBtn label="Drop" muted onPress={onAskDrop} />
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ActionBtn({
  label,
  onPress,
  disabled,
  muted,
  danger,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  muted?: boolean;
  danger?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        muted && styles.btnMuted,
        danger && styles.btnDanger,
        disabled && styles.btnDisabled,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.btnLabel,
          muted && styles.btnLabelMuted,
          danger && styles.btnLabelDanger,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slotsTitle: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  slotRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, gap: 8 },
  slotLabel: { color: theme.colors.textMuted, fontSize: 14 },
  slotValue: { color: theme.colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  itemOrigin: { color: theme.colors.textMuted, fontSize: 12, fontStyle: 'italic', marginTop: 2 },
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
    gap: theme.spacing.sm,
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
    flex: 1,
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  hpMini: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  feedback: {
    color: theme.colors.accent,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: theme.spacing.sm,
  },
  feedbackMuted: {
    color: theme.colors.textMuted,
  },
  card: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  cardEquipped: {
    borderColor: theme.colors.accent,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowText: { flex: 1 },
  badge: {
    color: theme.colors.background,
    backgroundColor: theme.colors.accent,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  detail: {
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  detailBody: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: theme.spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  btn: {
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minWidth: 44,
    alignItems: 'center',
  },
  tradeBtn: {
    alignSelf: 'stretch',
    marginBottom: theme.spacing.md,
  },
  kitBtn: {
    alignSelf: 'flex-start',
    marginTop: theme.spacing.md,
  },
  btnMuted: { borderColor: theme.colors.border },
  btnDanger: { borderColor: theme.colors.danger },
  btnDisabled: { opacity: 0.35 },
  btnLabel: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  btnLabelMuted: { color: theme.colors.textMuted },
  btnLabelDanger: { color: theme.colors.danger },
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
  pressed: {
    opacity: 0.85,
  },
});
