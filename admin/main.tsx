// TaurEye admin console — a SEPARATE mini-app (its own Vite build → dist-admin,
// served under /admin/). Deliberately not part of the user-facing SPA: no route
// in the app, nothing in the mobile OTA bundle, and noindex'd.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css"; // shared design tokens (dark theme)
import AdminApp from "./AdminApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
