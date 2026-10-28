"use client";

import { useState } from "react";
import { qlooBadge, llmBadge } from "../lib/ui-state.js";

const PRESETS = [
  {
    brief:
      "Launch an indie-music zine to urban creatives who love vinyl. Recommend artists, venues, and messaging angles that resonate.",
    goal: "Launch an indie-music zine to urban creatives who love vinyl",
    brand: "Miles Davis",
    audience: "indie music",
    tagQuery: "indie",
    location: "",
  },
  {
    brief:
      "Position a skincare brand with urban creatives who follow Aesop. Recommend affinities, geographic hotspots, and angles.",
    goal: "Position a skincare brand with urban creatives who follow Aesop",
    brand: "Aesop",
    audience: "urban creatives",
    tagQuery: "minimalist",
    location: "Los Angeles",
  },
  {
    brief:
      "Pitch a neo-noir streaming original to cinephile 25-34s. Recommend comparable films, directors, and cultural touchpoints.",
    goal: "Pitch a neo-noir streaming original to cinephile 25-34s",
    brand: "Parasite",
    audience: "film buffs",
    tagQuery: "neo-noir",
    location: "New York",
  },
];

function QlooBadge({ res }) {
  const b = qlooBadge(res);
  return <span className={`badge ${b.kind}`}>{b.label}</span>;
}
function LLMBadge({ res }) {
  const b = llmBadge(res);
  return <span className={`badge ${b.kind}`}>{b.label}</span>;
}

function Chips({ items, heat }) {
  if (!items?.length) return null;
  return (
    <div className="chips">
      {items.map((c, i) => (
        <span key={i} className={heat ? "chip heat" : "chip"}>
          {c}
        </span>
      ))}
    </div>
  );
}

function StepList({ steps }) {
  if (!steps?.length) return null;
  return (
    <div className="steps">
      {steps.map((s, i) => (
        <div key={i} className={`step ${s.ok ? "ok" : "err"}`}>
          <span className="s-dot">{s.ok ? "●" : "✕"}</span>{" "}
          <span className="s-label">{s.label || s.name}</span>
          {s.detail ? (
            <div className="s-detail">{s.detail}</div>
          ) : s.error ? (
            <div className="s-detail" style={{ color: "var(--bad)" }}>
              {s.error}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const [form, setForm] = useState({
    brief: PRESETS[0].brief || "",
    goal: "",
    brand: "",
    audience: "",
    tagQuery: "",
    location: "",
    withHeatmap: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [res, setRes] = useState(null);

  const set = (k) => (e) =>
    setForm((f) => ({
      ...f,
      [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value,
    }));

  async function run(e) {
    e?.preventDefault();
    setLoading(true);
    setError("");
    setRes(null);
    try {
      const body = { brief: form.brief, withHeatmap: form.withHeatmap };
      for (const k of ["goal", "brand", "audience", "tagQuery", "location"]) {
        if (form[k]) body[k] = form[k];
      }
      const r = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setRes(j);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  const q = res?.briefContext;
  const heatSpots = q?.heatmap?.entities?.slice(0, 6) || [];
  const heatStep = res?.steps?.find((s) => s.name === "heatmapInsights");
  const heatSkipped = heatStep?.detail?.startsWith("Skipped");

  return (
    <div className="app">
      <div className="hero">
        <h1>TasteBrief</h1>
        <p className="sub">
          A taste-gap agent for brand &amp; creative leads. Enter a target
          audience and a goal — the agent resolves entities, audiences, and
          tags on <strong>Qloo&apos;s taste graph</strong>, pulls insights
          (and heatmaps), and writes a taste brief: affinities, where the
          audience is, and messaging angles. Every answer is shown
          side-by-side against what a <em>bare LLM</em> would say without
          Qloo.
        </p>
        <div className="badges">
          <QlooBadge res={res} />
          <LLMBadge res={res} />
        </div>
      </div>

      <form className="card" onSubmit={run}>
        <h2>The brief</h2>
        <p className="hint">
          Pick a preset or fill in your own. The agent uses the goal to pick
          the right Qloo entity type (artist / brand / movie / place …),
          then runs five tool steps before writing the brief.
        </p>
        <div style={{ gridColumn: "1 / -1" }}>
          <label>Describe your brief</label>
          <textarea
            rows={3}
            value={form.brief}
            placeholder="e.g. Sell hiking boots to retirees in Denver"
            onChange={set("brief")}
          />
        </div>
        <details className="fine-tune" style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", color: "var(--accent-2)" }}>
            Fine-tune (optional overrides)
          </summary>
          <div className="grid cols-2" style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
            <div>
              <label>Goal</label>
              <input value={form.goal} onChange={set("goal")} placeholder="optional" />
            </div>
            <div>
              <label>Entity to anchor on</label>
              <input value={form.brand} onChange={set("brand")} placeholder="optional" />
            </div>
            <div>
              <label>Target audience</label>
              <input value={form.audience} onChange={set("audience")} placeholder="optional" />
            </div>
            <div>
              <label>Interest keywords</label>
              <input value={form.tagQuery} onChange={set("tagQuery")} placeholder="optional" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label>City (optional, for heatmap)</label>
              <input value={form.location || ""} onChange={set("location")} placeholder="Denver" />
            </div>
          </div>
        </details>
        <div className="row">
          <input id="hm" type="checkbox" checked={form.withHeatmap}
            onChange={set("withHeatmap")} />
          <label htmlFor="hm">Include geographic heatmap</label>
        </div>
        <div className="row">
          {PRESETS.map((p, i) => (
            <button key={i} type="button"
              style={{
                background: "var(--panel-2)",
                border: "1px solid var(--line)",
                color: "var(--muted)",
                borderRadius: 8,
                padding: "4px 10px",
                fontSize: 12,
                cursor: "pointer",
              }}
              onClick={() =>
                setForm({
                  brief: p.brief || "",
                  goal: p.goal,
                  brand: p.brand,
                  audience: p.audience,
                  tagQuery: p.tagQuery,
                  location: p.location || "",
                  withHeatmap: form.withHeatmap,
                })
              }
            >
              Preset {i + 1}
            </button>
          ))}
        </div>
        <button className="run" disabled={loading}>
          {loading ? (
            <>
              <span className="spin" /> Generating taste brief…
            </>
          ) : (
            "Generate taste brief"
          )}
        </button>
        {error ? <div className="note">{error}</div> : null}
        {res?.modeNote ? <div className="note">{res.modeNote}</div> : null}
      </form>

      {res ? (
        <>
          <div className="card">
            <h2>Agent trace</h2>
            <p className="hint">
              Each step is a real Qloo call (or its disclosed mock). The
              brief runs only after the agent resolves entity, audience, and
              tag URIs.
            </p>
            <StepList steps={res.steps} />
            {res.relaxations?.length ? (
              <div
                style={{
                  marginTop: 10,
                  padding: 10,
                  background: "var(--panel-2)",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                }}
              >
                <label
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Replan — signal relaxed
                </label>
                {res.relaxations.map((note, i) => (
                  <div
                    key={i}
                    className="chip"
                    style={{ display: "inline-block", marginRight: 6 }}
                  >
                    {note}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {res.emptyReason ? (
            <div className="card">
              <h2>No matches yet</h2>
              <p className="hint">{res.emptyReason}</p>
              <p style={{ color: "var(--muted)", fontSize: 13 }}>
                Try broadening the brief, for example &quot;Sell hiking boots
                to retirees in Denver&quot;, &quot;Launch a skincare line for
                urban creatives&quot;, or &quot;Pitch a neo-noir film to
                cinephile 25-34s&quot;.
              </p>
            </div>
          ) : null}

          {!res.emptyReason && (
            <div className="card">
              <h2>Taste brief — where the audience is, what they cluster around</h2>
              <p className="hint">
                Affinities and taste markers, all sourced from the Qloo digest
                the agent just assembled.
              </p>
              {res.citationAudit && (
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    marginBottom: 10,
                  }}
                >
                  {res.citationAudit.verified} of{" "}
                  {res.citationAudit.total} citations verified against Qloo
                  data
                </p>
              )}
              <div
                className="grid"
                style={{
                  gridTemplateColumns:
                    "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: 14,
                  marginTop: 12,
                }}
              >
                {Object.entries(
                  res.briefContext?.insightsByType || {}
                ).map(([urn, digest]) => {
                  const label = urn
                    .replace("urn:entity:", "")
                    .replace(/_/g, " ");
                  const title =
                    label.charAt(0).toUpperCase() + label.slice(1);
                  return (
                    <div key={urn} className="card" style={{ padding: 12 }}>
                      <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>
                        {title}
                      </h3>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                        }}
                      >
                        {(digest.entities || [])
                          .slice(0, 6)
                          .map((e, i) => (
                            <span key={i} className="chip">
                              {e.name}
                            </span>
                          ))}
                        {(digest.entities || []).length === 0 && (
                          <span className="empty">none resolved</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {Object.keys(
                  res.briefContext?.insightsByType || {}
                ).length === 0 && (
                  <span className="empty">no taste entities resolved</span>
                )}
              </div>
              {form.withHeatmap && (
                <div style={{ marginTop: 10 }}>
                  <label>Where they are (heatmap)</label>
                  {heatSkipped ? (
                    <span className="empty">
                      Heatmap skipped — add a city to see where this audience
                      concentrates.
                    </span>
                  ) : (
                    <Chips items={heatSpots.map((e) => e.name)} heat />
                  )}
                </div>
              )}
            </div>
          )}

          <div className="card">
            <h2>Bare LLM vs Qloo-grounded</h2>
            <p className="hint">
              Same brief, same audience. Left: an LLM with only parametric
              knowledge. Right: the same LLM grounded in the Qloo digest the
              agent just assembled — the difference is cultural intelligence.
            </p>
            <div className="compare">
              <div className="pane bare">
                <h3>Bare LLM (no Qloo)</h3>
                <div className="src">{res.bareLlm?.source}</div>
                <p>{res.bareLlm?.text || "—"}</p>
              </div>
              <div className="pane grounded">
                <h3>Qloo-grounded</h3>
                <div className="src">
                  {res.groundedLlm?.source} · Qloo{" "}
                  {res.qlooLive ? "live" : "disclosed mock"}
                </div>
                <p>{res.groundedLlm?.text || "—"}</p>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

