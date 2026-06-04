import { useState } from "react";
import {
  copyToClipboard,
  getReferralProgram,
  referralStats,
  shareReferral,
} from "../lib/referral";
import "./Refer.css";

// "28 May 2026" — short, readable date for the invited-friends list.
function fmtDate(iso: string | null): string {
  if (!iso) return "Invite pending";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function Refer() {
  const program = getReferralProgram();
  const stats = referralStats(program);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  };

  const onCopyCode = async () => {
    const r = await copyToClipboard(program.code);
    flash(r === "copied" ? "Code copied" : "Copy failed");
  };
  const onCopyLink = async () => {
    const r = await copyToClipboard(program.link);
    flash(r === "copied" ? "Link copied" : "Copy failed");
  };
  const onShare = async () => {
    const r = await shareReferral(program);
    if (r === "shared") flash("Opening share…");
    else if (r === "copied") flash("Invite copied to clipboard");
    else flash("Couldn't share");
  };

  return (
    <section className="refer">
      <header className="refer-head">
        <h1>Refer &amp; Earn</h1>
        <p className="refer-tag">
          Invite friends to TaurEye. You earn{" "}
          <strong>{program.rewardPerReferral} credits</strong> for every friend who
          joins, and they get <strong>{program.rewardForFriend} credits</strong> to
          start.
        </p>
      </header>

      <div className="refer-note">
        Preview with <strong>sample data</strong> — the code, link, and invited
        friends below are placeholders for review. Real codes and reward tracking
        come once the backend is connected.
      </div>

      {/* Summary cards */}
      <div className="refer-stats">
        <div className="refer-stat">
          <span className="rs-val">{stats.joinedCount}</span>
          <span className="rs-cap">Friends joined</span>
        </div>
        <div className="refer-stat">
          <span className="rs-val">{stats.pendingCount}</span>
          <span className="rs-cap">Invites pending</span>
        </div>
        <div className="refer-stat">
          <span className="rs-val accent">{stats.creditsEarned}◆</span>
          <span className="rs-cap">Credits earned</span>
        </div>
      </div>

      {/* Code + link sharing */}
      <div className="refer-share">
        <span className="rsh-label">Your referral code</span>
        <div className="rsh-row">
          <code className="rsh-code">{program.code}</code>
          <button className="rsh-btn" onClick={onCopyCode}>
            Copy code
          </button>
        </div>

        <span className="rsh-label">Your invite link</span>
        <div className="rsh-row">
          <span className="rsh-link" title={program.link}>
            {program.link}
          </span>
          <button className="rsh-btn" onClick={onCopyLink}>
            Copy link
          </button>
        </div>

        <button className="rsh-share" onClick={onShare}>
          <ShareIcon />
          Share invite
        </button>
      </div>

      {/* How it works */}
      <h2 className="refer-subhead">How it works</h2>
      <ol className="refer-steps">
        <li>
          <span className="step-n">1</span>
          <span>Share your code or invite link with a friend.</span>
        </li>
        <li>
          <span className="step-n">2</span>
          <span>They sign up and enter your code — they get {program.rewardForFriend} credits.</span>
        </li>
        <li>
          <span className="step-n">3</span>
          <span>Once they join, {program.rewardPerReferral} credits land in your wallet.</span>
        </li>
      </ol>

      {/* Invited friends */}
      <h2 className="refer-subhead">Invited friends</h2>
      {program.invited.length === 0 ? (
        <p className="refer-empty">No invites yet — share your code to get started.</p>
      ) : (
        <ul className="refer-list">
          {program.invited.map((r) => (
            <li key={r.id}>
              <span className="rl-avatar">{r.name[0].toUpperCase()}</span>
              <span className="rl-name">
                {r.name}
                <span className="rl-date">{fmtDate(r.joinedAt)}</span>
              </span>
              <span className={`rl-status ${r.status}`}>
                {r.status === "joined" ? "Joined" : "Pending"}
              </span>
              <span className="rl-reward">
                {r.reward > 0 ? `+${r.reward}◆` : "—"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {toast && <div className="refer-toast">{toast}</div>}
    </section>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="rsh-ico" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" strokeLinecap="round" />
    </svg>
  );
}
