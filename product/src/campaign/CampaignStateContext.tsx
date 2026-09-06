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
  campaignToState,
  combatActionPatch,
  type CampaignState,
  type CampaignStatePatch,
  type CombatMode,
} from '../../engine';
import { useSettings } from '../settings/SettingsContext';

type CampaignStateContextValue = {
  /** Unified read model — panels MUST use this, not local copies. */
  state: CampaignState;
  /** Underlying save blob (for engine calls that still take CampaignSave). */
  campaign: CampaignSave;
  applyPatch: (patch: CampaignStatePatch) => void;
  replaceCampaign: (next: CampaignSave) => void;
  runCombatAction: (mode: Exclude<CombatMode, 'idle'>) => void;
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
    (mode: Exclude<CombatMode, 'idle'>) => {
      const patch = combatActionPatch(mode, campaignToState(campaign).combat);
      onCampaignChange(applyCampaignPatch(campaign, patch));
    },
    [campaign, onCampaignChange],
  );

  const value = useMemo(
    () => ({
      state,
      campaign,
      applyPatch,
      replaceCampaign,
      runCombatAction,
    }),
    [state, campaign, applyPatch, replaceCampaign, runCombatAction],
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
