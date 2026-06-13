import { useEffect, useState } from "react";
import {
  COSTS,
  REWARDS,
  adsDisabled,
  buyNoAdPack,
  onEconomyChange,
  watchRewardedAd,
} from "../lib/economy";
import { useCredits } from "../lib/useCredits";
import { PRO_BENEFITS, PRO_ENABLED, PRO_PRICING } from "../lib/pro";
import AdSlot from "../components/AdSlot";
import "./Wallet.css";

// Draft credit packs (purchase wiring comes later: Razorpay on web, IAP in apps).
const PACKS = [
  { price: "₹99", credits: 100, bonus: "" },
  { price: "₹299", credits: 350, bonus: "+17%" },
  { price: "₹599", credits: 750, bonus: "+25%" },
];

export default function Wallet() {
  const { cloud, balance, ledger, claim, showBalance, claimable } = useCredits();
  const [busy, setBusy] = useState(false);
  const [noAds, setNoAds] = useState(adsDisabled());
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => onEconomyChange(() => setNoAds(adsDisabled())), []);

  const onClaim = async () => {
    setMsg(null);
    const err = await claim();
    setMsg(err ?? `+${REWARDS.dailyClaim} credits claimed.`);
  };
  const onWatchAd = async () => {
    setBusy(true);
    await watchRewardedAd();
    setBusy(false);
  };
  const onBuyNoAds = () => buyNoAdPack();

  return (
    <section className="wallet">
      <header className="wallet-head">
        <h1>Wallet</h1>
        <div className="wallet-balance">
          <span className="wallet-coin">◆</span>
          <span className="wallet-bal-val">{showBalance ? (balance ?? "…") : "—"}</span>
          <span className="wallet-bal-cap">credits</span>
        </div>
      </header>

      {cloud ? (
        <div className="wallet-note">
          Credits are <strong>live</strong> — earning is on (signup bonus, daily
          claim). Premium <strong>AI actions</strong> (analysis &amp; reports) are
          metered by credits and charged server-side.
        </div>
      ) : (
        <div className="wallet-note">
          You’re browsing as a <strong>guest</strong> — screening and charts are
          free. Sign in to use the live cloud wallet and run premium AI actions.
        </div>
      )}

      <div className="wallet-grid">
        <button className="wallet-card" onClick={onClaim} disabled={!cloud && !claimable}>
          <span className="wc-title">Daily claim</span>
          <span className="wc-sub">{claimable ? "Claim today's free credits" : "Claimed today ✓"}</span>
          <span className="wc-amt">+{REWARDS.dailyClaim}</span>
        </button>

        <button className="wallet-card" onClick={onWatchAd} disabled={busy || cloud}>
          <span className="wc-title">Watch a rewarded ad</span>
          <span className="wc-sub">{cloud ? "Coming soon" : busy ? "Loading ad…" : "One per day (placeholder)"}</span>
          <span className="wc-amt">+{REWARDS.rewardedAd}</span>
        </button>

        <button className="wallet-card" onClick={onBuyNoAds} disabled={noAds || cloud}>
          <span className="wc-title">No-ad pack</span>
          <span className="wc-sub">{cloud ? "Coming soon" : noAds ? "Active — ads removed ✓" : "Remove display ads"}</span>
          <span className="wc-amt">{COSTS.noAdPack}◆</span>
        </button>
      </div>

      {msg && <p className="wallet-note">{msg}</p>}

      <h2 className="wallet-subhead">Buy credits</h2>
      <div className="wallet-packs">
        {PACKS.map((p) => (
          <div className="pack" key={p.price}>
            <span className="pack-credits">{p.credits}◆</span>
            <span className="pack-price">{p.price}</span>
            {p.bonus && <span className="pack-bonus">{p.bonus}</span>}
            <button className="pack-buy" disabled title="Purchases coming soon">
              Coming soon
            </button>
          </div>
        ))}
      </div>

      <h2 className="wallet-subhead">TaurEye Pro</h2>
      <div className="pro-card">
        <div className="pro-head">
          <span className="pro-title">Pro</span>
          <span className="pro-price">
            ₹{PRO_PRICING.yearlyInr}/yr <em>or ₹{PRO_PRICING.monthlyInr}/mo</em>
          </span>
        </div>
        <ul className="pro-benefits">
          {PRO_BENEFITS.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <button className="pack-buy" disabled={!PRO_ENABLED} title={PRO_ENABLED ? "Subscribe" : "Subscriptions coming soon"}>
          {PRO_ENABLED ? "Subscribe" : "Coming soon"}
        </button>
      </div>

      <AdSlot label="Wallet banner" height={80} name="wallet" />

      <h2 className="wallet-subhead">Transaction history</h2>
      {ledger.length === 0 ? (
        <p className="wallet-empty">No transactions yet.</p>
      ) : (
        <ul className="wallet-ledger">
          {ledger.map((t) => (
            <li key={t.id}>
              <span className="lg-reason">{t.reason.replace(/_/g, " ")}</span>
              <span className="lg-date">{new Date(t.ts).toLocaleString("en-IN")}</span>
              <span className={`lg-delta ${t.delta >= 0 ? "up" : "down"}`}>
                {t.delta >= 0 ? "+" : ""}
                {t.delta}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
