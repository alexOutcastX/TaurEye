import { Link } from "react-router-dom";
import { LEGAL_DOCS } from "../config/legal";
import "./LegalLinks.css";

/** Compact row of links to the legal documents — for page footers. */
export default function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <span className={`legal-links ${className}`.trim()}>
      {LEGAL_DOCS.map((d, i) => (
        <span key={d.key}>
          {i > 0 && <span className="sep">·</span>} <Link to={`/legal/${d.key}`}>{d.title}</Link>
        </span>
      ))}
    </span>
  );
}
