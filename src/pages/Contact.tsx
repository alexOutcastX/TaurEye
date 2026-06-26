import { useState, type FormEvent } from "react";
import PublicLayout from "../components/PublicLayout";
import { LEGAL } from "../config/legal";

/**
 * Contact page. The site is statically hosted (no form backend), so the form
 * composes a pre-filled email via the visitor's mail client (mailto). The
 * support address is also shown directly.
 */
export default function Contact() {
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [message, setMessage] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent(`TaurEye enquiry from ${name || "a visitor"}`);
    const body = encodeURIComponent(`${message}\n\n— ${name}${from ? ` (${from})` : ""}`);
    window.location.href = `mailto:${LEGAL.email}?subject=${subject}&body=${body}`;
  };

  return (
    <PublicLayout>
      <h1>Contact Us</h1>
      <p className="pub-lead">
        Questions, feedback or a data correction? We’d like to hear from you.
      </p>

      <p>
        Email us directly at <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. For
        grievances, please include your account email and a clear description so we
        can help quickly. We aim to respond within a few business days.
      </p>

      <form className="contact-form" onSubmit={submit}>
        <label className="contact-field">
          <span>Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        </label>
        <label className="contact-field">
          <span>Your email</span>
          <input
            type="email"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label className="contact-field">
          <span>Message</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="How can we help?"
            rows={5}
          />
        </label>
        <button type="submit" className="contact-send" disabled={!message.trim()}>
          Compose email
        </button>
        <p className="pub-meta">
          This opens your email app with the message pre-filled — nothing is sent until you hit send there.
        </p>
      </form>

      <h2>Company</h2>
      <p>
        {LEGAL.entity} · {LEGAL.jurisdiction}. TaurEye is an information and education
        tool, not investment advice. See our <a href="/legal/terms">Terms</a> and{" "}
        <a href="/legal/privacy">Privacy Policy</a>.
      </p>
    </PublicLayout>
  );
}
