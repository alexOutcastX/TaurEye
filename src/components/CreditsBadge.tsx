import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ECONOMY_ENABLED, getBalance, onEconomyChange } from "../lib/economy";
import "./CreditsBadge.css";

/** Topbar credits pill → links to the wallet. Shows "Free" while the economy
 *  is disabled (everything unlocked), otherwise the live balance. */
export default function CreditsBadge() {
  const [bal, setBal] = useState(getBalance());
  useEffect(() => onEconomyChange(() => setBal(getBalance())), []);
  return (
    <Link to="/app/wallet" className="credits-badge" title="Credits & wallet">
      <span className="credits-coin">◆</span>
      <span className="credits-val">{ECONOMY_ENABLED ? bal : "Free"}</span>
    </Link>
  );
}
