import { useEffect, useState } from "react";
import {
  COSTS,
  ECONOMY_ENABLED,
  REWARDS,
  adsDisabled,
  buyNoAdPack,
  claimDaily,
  dailyClaimAvailable,
  getBalance,
  getLedger,
  onEconomyChange,
  watchRewardedAd,
} from "../lib/economy";
import AdSlot from "../components/AdSlot";
import "./Wallet.css";

// Draft credit packs (purchase wiring comes later: Razorpay/Stripe on web, IAP in apps).
const PACKS = [
  { price: "₹99", credits: 100, bonus: "" },
  { price: "₹299", credits: 350, bonus: "+17%" },
  { price: "₹599", credits: 750, bonus: "+25%" },
];

export default function Wallet() {
  const [, tick] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => onEconomyChange(() => tick((t) => t + 1)), []);

  const balance = getBalance();
  const ledger = getLedger();
  const claimable = dailyClaimAvailable();
  const noAds = adsDisabled();

  const onClaim = () => claimDaily();
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
          <span className="wallet-bal-val">{ECONOMY_ENABLED ? balance : "—"}</span>
          <span className="wallet-bal-cap">credits</span>
        </div>
      </header>

      {!ECONOMY_ENABLED && (
        <div className="wallet-note">
          Credits are currently <strong>off (preview)</strong> — every feature is
          free and nothing is charged. Pricing and rewards will be enabled later.
        </div>
      )}

      <div className="wallet-grid">
        <button className="wallet-card" onClick={onClaim} disabled={!claimable}>
          <span className="wc-title">Daily claim</span>
          <span className="wc-sub">{claimable ? "Claim today's free credits" : "Claimed today ✓"}</span>
          <span className="wc-amt">+{REWARDS.dailyClaim}</span>
        </button>

        <button className="wallet-card" onClick={onWatchAd} disabled={busy}>
          <span className="wc-title">Watch a rewarded ad</span>
          <span className="wc-sub">{busy ? "Loading ad…" : "One per day (placeholder)"}</span>
          <span className="wc-amt">+{REWARDS.rewardedAd}</span>
        </button>

        <button className="wallet-card" onClick={onBuyNoAds} disabled={noAds}>
          <span className="wc-title">No-ad pack</span>
          <span className="wc-sub">{noAds ? "Active — ads removed ✓" : "Remove display ads, permanently"}</span>
          <span className="wc-amt">{COSTS.noAdPack}◆</span>
        </button>
      </div>

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

      <AdSlot label="Wallet banner" height={80} />

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
