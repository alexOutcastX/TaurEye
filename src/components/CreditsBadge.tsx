import { Link } from "react-router-dom";
import { useCredits } from "../lib/useCredits";
import { CREDIT_SYMBOL } from "../lib/economy";
import "./CreditsBadge.css";

/** Topbar credits pill → links to the wallet. Shows the live server balance when
 *  signed into the cloud wallet, "Free" while the economy is off locally. The
 *  diamond glows softly; a placeholder currency symbol sits before the number. */
export default function CreditsBadge() {
  const { showBalance, balance } = useCredits();
  return (
    <Link to="/app/wallet" className="credits-badge" title="Credits & wallet">
      <span className="credits-coin">◆</span>
      {showBalance ? (
        <span className="credits-val">
          <span className="credits-cur">{CREDIT_SYMBOL}</span>
          {balance ?? "…"}
        </span>
      ) : (
        <span className="credits-val">Free</span>
      )}
    </Link>
  );
}
