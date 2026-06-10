import { enabledBrokers } from "../config/brokers";
import "./BrokerCTA.css";

/**
 * Broker affiliate CTA — invites the user to open a demat account with a partner.
 * Renders only when at least one broker has a link set (see config/brokers.ts),
 * so it's invisible until you go live. Factual + disclosed; never tied to a
 * specific buy/sell action, to stay SEBI-safe.
 */
export default function BrokerCTA() {
  const brokers = enabledBrokers();
  if (brokers.length === 0) return null;

  return (
    <section className="broker-cta" aria-label="brokerage partners">
      <div className="broker-cta-head">
        <h2 className="broker-cta-title">Don’t have a demat account?</h2>
        <span className="broker-cta-tag">Partner</span>
      </div>
      <p className="broker-cta-sub">
        Open one with a SEBI-registered broker to start investing.
      </p>
      <div className="broker-cta-list">
        {brokers.map((b) => (
          <a
            key={b.id}
            className="broker-card"
            href={b.url}
            target="_blank"
            rel="noopener noreferrer sponsored"
          >
            <span className="broker-name">{b.name}</span>
            <span className="broker-blurb">{b.blurb}</span>
            <span className="broker-go">Open account →</span>
          </a>
        ))}
      </div>
      <p className="broker-cta-note">
        TaurEye may earn a referral commission if you open an account through
        these links, at no extra cost to you. This is not a recommendation of any
        broker or security, and not investment advice.
      </p>
    </section>
  );
}
