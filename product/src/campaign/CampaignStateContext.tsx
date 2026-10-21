import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from 'react';
import type { CampaignSave } from '../../engine';
import {
  applyCampaignPatch,
  applyItemActionWithTurn,
  applyOpenShop,
  applyProgressionAction,
  applyTrade,
  closeShopPatch,
  campaignToState,
  applyCombatTurn,
  type ItemActionRequest,
  type ItemActionResult,
  type ProgressionRequest,
  type ProgressionResult,
  type TradeRequest,
  type TradeResult,
  type CampaignState,
  type CampaignStatePatch,
  type CombatActionKind,
} from '../../engine';
import { useSettings } from '../settings/SettingsContext';

type CampaignStateContextValue = {
  /** Unified read model — panels MUST use this, not local copies. */
  state: CampaignState;
  /** Underlying save blob (for engine calls that still take CampaignSave). */
  campaign: CampaignSave;
  applyPatch: (patch: CampaignStatePatch) => void;
  replaceCampaign: (next: CampaignSave) => void;
  runCombatAction: (mode: CombatActionKind) => void;
  /** P-INT-01: Items panel action → CampaignState patch (+ Tale beat when meaningful). */
  runItemAction: (req: ItemActionRequest) => ItemActionResult;
  /** P-INT-03: level-up / ability point spend → CampaignState patch. */
  runProgressionAction: (req: ProgressionRequest) => ProgressionResult;
  /** P-INT-04: buy/sell one unit with the open merchant. */
  runTrade: (req: TradeRequest) => TradeResult;
  /** P-INT-04: open the shop here (Tale beat either way). */
  openShop: (playerLine?: string) => boolean;
  closeShop: () => void;
};

const CampaignStateContext = createContext<CampaignStateContextValue | null>(
  null,
);

type ProviderProps = {
  campaign: CampaignSave;
  onCampaignChange: (campaign: CampaignSave) => void;
  children: React.ReactNode;
};

/**
 * Owns CampaignState for PlayShell. Hydrates from save, writes back through
 * existing persist path (onCampaignChange → persistCampaign).
 */
export function CampaignStateProvider({
  campaign,
  onCampaignChange,
  children,
}: ProviderProps) {
  const { verbosity } = useSettings();

  // Keep playPrefs slice aligned with Settings (Settings remains edit authority).
  useEffect(() => {
    const current = campaign.world?.playPrefs?.verbosity;
    if (current === verbosity) return;
    onCampaignChange(
      applyCampaignPatch(campaign, { playPrefs: { verbosity } }),
    );
    // Only when verbosity drifts — avoid loops on every campaign touch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verbosity, campaign.id]);

  const state = useMemo(() => campaignToState(campaign), [campaign]);


  const applyPatch = useCallback(
    (patch: CampaignStatePatch) => {
      onCampaignChange(applyCampaignPatch(campaign, patch));
    },
    [campaign, onCampaignChange],
  );

  const replaceCampaign = useCallback(
    (next: CampaignSave) => {
      // Ensure world exists when engine returns a save without it.
      const withWorld =
        next.world === undefined
          ? applyCampaignPatch(next, {})
          : next;
      onCampaignChange(withWorld);
    },
    [onCampaignChange],
  );

  const runCombatAction = useCallback(
    (mode: CombatActionKind) => {
      // COMBAT-02: full dice-backed round (player then foe), logged to Tale.
      const { campaign: next } = applyCombatTurn(campaign, mode, {
        logRejection: true,
      });
      if (next !== campaign) onCampaignChange(next);
    },
    [campaign, onCampaignChange],
  );

  const runItemAction = useCallback(
    (req: ItemActionRequest): ItemActionResult => {
      // QA-01: use/equip/drop mid-fight costs the round (foe acts); free otherwise.
      const { campaign: next, result } = applyItemActionWithTurn(campaign, req);
      if (next !== campaign) onCampaignChange(next);
      return result;
    },
    [campaign, onCampaignChange],
  );

  const runProgressionAction = useCallback(
    (req: ProgressionRequest): ProgressionResult => {
      const { campaign: next, result } = applyProgressionAction(campaign, req);
      if (next !== campaign) onCampaignChange(next);
      return result;
    },
    [campaign, onCampaignChange],
  );

  const runTrade = useCallback(
    (req: TradeRequest): TradeResult => {
      const { campaign: next, result } = applyTrade(campaign, req);
      if (next !== campaign) onCampaignChange(next);
      return result;
    },
    [campaign, onCampaignChange],
  );

  const openShop = useCallback(
    (playerLine = 'Trade'): boolean => {
      const res = applyOpenShop(campaign, playerLine);
      onCampaignChange(res.campaign);
      return res.ok;
    },
    [campaign, onCampaignChange],
  );

  const closeShop = useCallback(() => {
    if (!campaign.world?.shop?.activeMerchantId) return;
    onCampaignChange(applyCampaignPatch(campaign, closeShopPatch()));
  }, [campaign, onCampaignChange]);

  const value = useMemo(
    () => ({
      state,
      campaign,
      applyPatch,
      replaceCampaign,
      runCombatAction,
      runItemAction,
      runProgressionAction,
      runTrade,
      openShop,
      closeShop,
    }),
    [
      state,
      campaign,
      applyPatch,
      replaceCampaign,
      runCombatAction,
      runItemAction,
      runProgressionAction,
      runTrade,
      openShop,
      closeShop,
    ],
  );

  return (
    <CampaignStateContext.Provider value={value}>
      {children}
    </CampaignStateContext.Provider>
  );
}

export function useCampaignState(): CampaignStateContextValue {
  const ctx = useContext(CampaignStateContext);
  if (!ctx) {
    throw new Error('useCampaignState must be used within CampaignStateProvider');
  }
  return ctx;
}
