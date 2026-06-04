import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { SavedScreen } from "../api/types";
import "./Saved.css";

export default function Saved() {
  const nav = useNavigate();
  const [screens, setScreens] = useState<SavedScreen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .listScreens()
      .then(setScreens)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const runScreen = (s: SavedScreen) =>
    nav("/app/screener", { state: { request: s.request } });

  const remove = async (s: SavedScreen) => {
    if (!window.confirm(`Delete saved screen “${s.name}”?`)) return;
    await api.deleteScreen(s.id);
    load();
  };

  const summarize = (s: SavedScreen) => {
    const fc = s.request.filters.length;
    const ex = s.request.exchange ?? "All";
    return `${fc} filter${fc === 1 ? "" : "s"} · ${s.request.logic} · ${ex}`;
  };

  return (
    <section className="saved">
      <h1>Saved Screens</h1>
      <p className="saved-sub">Re-run a saved filter set in the screener, or delete it.</p>

      {loading && <p className="saved-note">Loading…</p>}
      {error && <p className="saved-note err">{error}</p>}

      {!loading && !error && screens.length === 0 && (
        <div className="saved-empty">
          <p>No saved screens yet.</p>
          <button className="btn-link" onClick={() => nav("/app/screener")}>
            Build one in the Screener →
          </button>
        </div>
      )}

      <div className="saved-grid">
        {screens.map((s) => (
          <div className="saved-card" key={s.id}>
            <div className="saved-card-head">
              <h3>{s.name}</h3>
              <button className="del" onClick={() => remove(s)} title="Delete">✕</button>
            </div>
            <p className="saved-meta">{summarize(s)}</p>
            <ul className="saved-filters">
              {s.request.filters.slice(0, 4).map((f, i) => (
                <li key={i} className="mono">
                  {f.field} {f.op} {f.value}
                  {f.op === "between" ? `–${f.value2 ?? ""}` : ""}
                </li>
              ))}
              {s.request.filters.length > 4 && (
                <li className="more">+{s.request.filters.length - 4} more</li>
              )}
            </ul>
            <button className="btn-run-saved" onClick={() => runScreen(s)}>
              Run screen
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
