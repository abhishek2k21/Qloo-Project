"use client";

import { useState } from "react";

const PRESETS = [
  {
    goal: "Launch an indie-music zine to urban creatives who love vinyl",
    brand: "Miles Davis",
    audience: "indie music",
    tagQuery: "indie",
    location: "",
  },
  {
    goal: "Position a skincare brand with urban creatives who follow Aesop",
    brand: "Aesop",
    audience: "urban creatives",
    tagQuery: "minimalist",
    location: "Los Angeles",
  },
  {
    goal: "Pitch a neo-noir streaming original to cinephile 25-34s",
    brand: "Parasite",
    audience: "film buffs",
    tagQuery: "neo-noir",
    location: "New York",
  },
];

function Badge({ kind, label }) {
  const cls =
    kind === "live"
      ? "badge live"
      : kind === "mock"
      ? "badge mock"
      : "badge";
  return <span className={cls}>{label}</span>;
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
    goal: PRESETS[0].goal,
    brand: PRESETS[0].brand,
    audience: PRESETS[0].audience,
    tagQuery: PRESETS[0].tagQuery,
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
      const r = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, withHeatmap: form.withHeatmap }),
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
  const topAffinities = q?.insights?.entities?.slice(0, 6) || [];
  const heatSpots = q?.heatmap?.entities?.slice(0, 6) || [];
  const tags = q?.insights?.tags?.slice(0, 10) || [];

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
          <Badge kind="mock" label={`Qloo: ${res ? (res.qlooLive ? "live" : "disclosed mock") : "idle"}`} />
          <Badge kind="mock" label={`LLM: ${res ? (res.llmLive ? "live" : "template") : "idle"}`} />
          <Badge kind="mock" label="Qloo Agentic Hackathon entry" />
        </div>
      </div>

      <form className="card" onSubmit={run}>
        <h2>The brief</h2>
        <p className="hint">
          Pick a preset or fill in your own. The agent uses the goal to pick
          the right Qloo entity type (artist / brand / movie / place …),
          then runs five tool steps before writing the brief.
        </p>
        <div className="grid cols-2">
          <div style={{ gridColumn: "1 / -1" }}>
            <label>Goal / brief</label>
            <textarea rows={2} value={form.goal} onChange={set("goal")} />
          </div>
          <div>
            <label>Entity to anchor on (artist / brand / place …)</label>
            <input value={form.brand} onChange={set("brand")} placeholder="Miles Davis" />
          </div>
          <div>
            <label>Target audience (a Qloo audience phrase)</label>
            <input value={form.audience} onChange={set("audience")} placeholder="indie music" />
          </div>
          <div>
            <label>Interest keywords (tag search)</label>
            <input value={form.tagQuery} onChange={set("tagQuery")} placeholder="indie" />
          </div>
          <div>
            <label>City (optional)</label>
            <input value={form.location || ""} onChange={set("location")} placeholder="Los Angeles" />
          </div>
        </div>
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
              Five tool steps. Each one is a real Qloo call (or its disclosed
              mock). The brief only runs after the agent has resolved real
              entity, audience, and tag URIs.
            </p>
            <StepList steps={res.steps} />
          </div>

          <div className="card">
            <h2>Taste brief — where the audience is, what they cluster around</h2>
            <p className="hint">
              Affinities, recurring taste markers, and geographic hotspots,
              all sourced from the Qloo digest the agent just assembled.
            </p>
            <div>
              <label>Top affinities</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {topAffinities.length
                  ? topAffinities.map((e, i) => (
                      <span key={i} className="chip">
                        {e.name}
                        {typeof e.popularity === "number"
                          ? ` · ${(e.popularity * 100).toFixed(0)}%`
                          : ""}
                      </span>
                    ))
                  : <span className="empty">none resolved</span>}
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label>Recurring taste markers</label>
              <Chips items={tags} />
            </div>
            {form.withHeatmap ? (
              <div style={{ marginTop: 10 }}>
                <label>Where they are (heatmap)</label>
                <Chips items={heatSpots.map((e) => e.name)} heat />
              </div>
            ) : null}
          </div>

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

