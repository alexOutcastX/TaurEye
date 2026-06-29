// Single source of truth for the legal pages (src/pages/Legal.tsx).
//
// ⚠️ BEFORE LAUNCH: fill in the entity-specific fields below — they render
// verbatim in the Terms / Privacy / Refund pages and are referenced by payment
// gateways (Razorpay) and the app stores. The placeholder values are NOT valid
// for a commercial launch. Have a lawyer review the final pages for SEBI / DPDP
// Act 2023 / GST specifics.
export const LEGAL = {
  /** Product/brand name shown throughout the app. */
  product: "TaurEye",
  /** Registered business / proprietor legal name (TODO: replace placeholder). */
  entity: "TaurEye",
  /** Public support + grievance contact (TODO: use a branded address). */
  email: "support@taureye.com",
  /** Courts / governing-law seat. */
  jurisdiction: "Bengaluru, Karnataka, India",
  /** Last revision date shown on each document. */
  effectiveDate: "14 June 2026",
} as const;

// The documents, in display order. Keys are used in the URL: /legal/<key>.
export const LEGAL_DOCS = [
  { key: "terms", title: "Terms of Service" },
  { key: "privacy", title: "Privacy Policy" },
  { key: "refund", title: "Refund & Cancellation" },
  { key: "disclaimer", title: "Disclaimer" },
] as const;

export type LegalDocKey = (typeof LEGAL_DOCS)[number]["key"];
