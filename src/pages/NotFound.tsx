import { Link } from "react-router-dom";
import Logo from "../components/Logo";
import "./NotFound.css";

export default function NotFound() {
  return (
    <div className="nf">
      <Link to="/" className="nf-brand" aria-label="Home">
        <Logo />
      </Link>
      <h1>404</h1>
      <p>That page doesn’t exist or has moved.</p>
      <div className="nf-actions">
        <Link to="/app/dashboard" className="nf-btn">
          Go to Dashboard
        </Link>
        <Link to="/" className="nf-link">
          Home
        </Link>
      </div>
    </div>
  );
}
