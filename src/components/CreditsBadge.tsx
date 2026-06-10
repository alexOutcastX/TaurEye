import { Link } from "react-router-dom";
import { useCredits } from "../lib/useCredits";
import "./CreditsBadge.css";

/** Topbar credits pill → links to the wallet. Shows the live server balance when
 *  signed into the cloud wallet, "Free" while the economy is off locally. */
export default function CreditsBadge() {
  const { showBalance, balance } = useCredits();
  return (
    <Link to="/app/wallet" className="credits-badge" title="Credits & wallet">
      <span className="credits-coin">◆</span>
      <span className="credits-val">{showBalance ? (balance ?? "…") : "Free"}</span>
    </Link>
  );
}
