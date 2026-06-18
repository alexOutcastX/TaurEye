// Wallet data hook — serves the cloud (Supabase) balance/ledger when the user is
// signed into a configured project, and falls back to the local economy engine
// otherwise (guest / no Supabase). Components don't need to know which is active.
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  claimDaily as cloudClaim,
  creditsCloud,
  listLedger,
  myBalance,
  onCreditsChange,
  spendCredits,
  type LedgerRow,
} from "./credits";
import {
  ECONOMY_ENABLED,
  REWARDS,
  claimDaily as localClaim,
  dailyClaimAvailable,
  getBalance as localBalance,
  getLedger as localLedger,
  onEconomyChange,
  spend as localSpend,
} from "./economy";

function localRows(): LedgerRow[] {
  return localLedger().map((t) => ({ id: t.id, ts: t.ts, delta: t.delta, reason: t.reason }));
}

export function useCredits() {
  const { user } = useAuth();
  const cloud = creditsCloud && !!user?.id;

  const [balance, setBalance] = useState<number | null>(cloud ? null : localBalance());
  const [ledger, setLedger] = useState<LedgerRow[]>(cloud ? [] : localRows());

  const reload = useCallback(async () => {
    if (cloud) {
      const [b, l] = await Promise.all([myBalance(), listLedger()]);
      setBalance(b);
      setLedger(l);
    } else {
      setBalance(localBalance());
      setLedger(localRows());
    }
  }, [cloud]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => (cloud ? onCreditsChange(reload) : onEconomyChange(reload)), [cloud, reload]);

  // Charge credits for a premium action. Cloud users hit the secure spend_credits
  // RPC; guests use the local economy. Returns {ok}, with error:"insufficient"
  // when the balance is short. cost<=0 is always free.
  const spend = useCallback(
    async (reason: string, cost: number): Promise<{ ok: boolean; error?: string }> => {
      if (cost <= 0) return { ok: true };
      if (cloud) {
        const r = await spendCredits(reason, cost);
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      }
      return localSpend(reason, cost) ? { ok: true } : { ok: false, error: "insufficient" };
    },
    [cloud],
  );

  // Returns null on success, or a user-facing message on failure.
  const claim = useCallback(async (): Promise<string | null> => {
    if (cloud) {
      const r = await cloudClaim(REWARDS.dailyClaim);
      if (r.ok) return null;
      return r.error === "already_claimed" ? "Already claimed today." : (r.error ?? "Claim failed.");
    }
    return localClaim() ? null : "Already claimed today.";
  }, [cloud]);

  return {
    cloud,
    balance,
    ledger,
    claim,
    spend,
    // Show a number when on the cloud wallet, or locally once the economy is on.
    showBalance: cloud || ECONOMY_ENABLED,
    // Cloud claimability is enforced server-side; we let the click report it.
    claimable: cloud ? true : dailyClaimAvailable(),
  };
}
