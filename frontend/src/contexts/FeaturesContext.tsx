import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { featuresAPI } from '../services/api';

/**
 * Server-controlled feature flags.
 *
 * Right now this carries a single flag — `payoutsEnabled`, the master switch
 * for the Increase payout feature. Every payout affordance in the UI reads it:
 * the Payout Accounts page and its sidebar entry, Pay Owner and bulk-pay
 * buttons, and the payout onboarding controls on listings and groups.
 *
 * `isLoading` matters: payout UI stays hidden until the first fetch resolves,
 * so a disabled feature never flashes on screen before disappearing. The flag
 * defaults to `false` while loading for that reason — the backend is the
 * authority either way, so a hidden button is only ever a cosmetic delay,
 * while a briefly visible Pay Owner button is a confusing one.
 */
interface FeaturesContextType {
  payoutsEnabled: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
  setPayoutsEnabled: (enabled: boolean) => Promise<void>;
}

const FeaturesContext = createContext<FeaturesContextType | undefined>(undefined);

export function FeaturesProvider({ children }: { children: React.ReactNode }) {
  const [payoutsEnabled, setPayoutsEnabledState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { payoutsEnabled: enabled } = await featuresAPI.get();
      setPayoutsEnabledState(enabled);
    } catch {
      // Unauthenticated or offline — leave the feature hidden. The backend
      // rejects payout calls independently, so this is fail-safe.
      setPayoutsEnabledState(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setPayoutsEnabled = useCallback(async (enabled: boolean) => {
    const result = await featuresAPI.setPayoutsEnabled(enabled);
    setPayoutsEnabledState(result.payoutsEnabled);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <FeaturesContext.Provider value={{ payoutsEnabled, isLoading, refresh, setPayoutsEnabled }}>
      {children}
    </FeaturesContext.Provider>
  );
}

/**
 * Unlike useTheme/useAuth, this deliberately does NOT throw when the provider is
 * missing. Two reasons, both specific to what this flag guards:
 *
 *  - Failing safe beats failing loudly. A missing provider should hide the
 *    payout controls, not white-screen the page that renders them. Throwing
 *    would turn a wiring mistake into an outage on the statements table.
 *  - It keeps the flag usable from components rendered in isolation (tests,
 *    storybook-style harnesses) without every one of them needing the provider.
 *
 * The fallback reports payouts as disabled and treats the state as still
 * loading, so nothing payout-related renders and no write path is offered. The
 * backend rejects payout calls independently, so this is a display concern only.
 */
const DISABLED_FALLBACK: FeaturesContextType = {
  payoutsEnabled: false,
  isLoading: true,
  refresh: async () => {},
  setPayoutsEnabled: async () => {
    throw new Error('Cannot change features: no FeaturesProvider in the tree');
  },
};

export function useFeatures() {
  return useContext(FeaturesContext) ?? DISABLED_FALLBACK;
}
