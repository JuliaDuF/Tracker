import React, { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const uid = () => Math.random().toString(36).slice(2, 9);
const DAY = 86400000;

function dateKey(d) { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0"); return `${y}-${m}-${day}`; }
const todayKey = () => dateKey(new Date());
function parseDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function daysUntil(s) { const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((parseDate(s) - t) / DAY); }
const daysSince = (s) => -daysUntil(s);
function fmtShort(s) { try { return parseDate(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch (e) { return s; } }
function fmtMinutes(min) { if (!min) return "0m"; const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`; }
const round1 = (n) => Math.round(n * 10) / 10;
const toMin = (t) => { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
function clockFromHours(v) { let x = ((v % 24) + 24) % 24; let h = Math.floor(x); let m = Math.round((x - h) * 60); if (m === 60) { h++; m = 0; } return `${h}:${String(m).padStart(2, "0")}`; }
function sleepDur(bed, wake) { const b = toMin(bed), w = toMin(wake); if (b == null || w == null) return null; let ww = w; if (ww <= b) ww += 1440; return (ww - b) / 60; }
function bedVal(bed) { const b = toMin(bed); if (b == null) return null; let h = b / 60; if (h < 12) h += 24; return h; }
function addByCadence(date, c) { const x = new Date(date); if (c === "weekly") x.setDate(x.getDate() + 7); else if (c === "monthly") x.setMonth(x.getMonth() + 1); else x.setFullYear(x.getFullYear() + 1); return x; }

const leaf = (name, cad, aliases = []) => ({ id: uid(), name, mode: "cadence", cadence: cad, nextDate: null, history: [], paused: false, resetAt: null, aliases });
const SECTION_KEYS = ["body", "savings", "movement", "projects", "routines"];
const SECTION_TITLE = { body: "Body", savings: "Savings", movement: "Movement", projects: "Projects", routines: "Routines" };
const BODY_TITLE = { sleep: "Sleep", weight: "Weight" };

const SEED = {
  sectionOrder: [...SECTION_KEYS],
  bodyOrder: ["sleep", "weight"],
  sleep: { entries: [], paused: false },
  weight: { unit: "kg", entries: [], paused: false },
  savings: { tx: [] },
  activities: [
    { id: uid(), name: "Yoga", hasGoal: true, goalKind: "days", target: 100, deadline: "2026-12-31", defaultMin: 30, aliases: ["瑜伽", "yoga"], logs: [], paused: false },
    { id: uid(), name: "Brisk walk", hasGoal: true, goalKind: "days", target: 120, deadline: "2026-12-31", defaultMin: 30, aliases: ["快走", "散步", "走路", "walk"], logs: [], paused: false },
    { id: uid(), name: "Archery", hasGoal: false, goalKind: "days", target: 0, deadline: "2026-12-31", defaultMin: 90, aliases: ["射箭", "箭", "archery"], logs: [], paused: false },
    { id: uid(), name: "Horse riding", hasGoal: false, goalKind: "days", target: 0, deadline: "2026-12-31", defaultMin: 60, aliases: ["骑马", "马", "riding", "horse"], logs: [], paused: false },
  ],
  projects: [
    { id: uid(), name: "Portfolio", stages: ["Gather work", "Wireframe", "Visual design", "Write case studies", "Polish"], current: 0, sessions: [], aliases: ["portfolio", "作品集"], paused: false },
  ],
  routines: [
    { id: uid(), name: "Chores", group: true, collapsed: false, paused: false, items: [
      leaf("Water the plants", "weekly", ["浇", "植物", "浇花", "花", "water", "plant"]),
      leaf("Laundry", "weekly", ["洗衣", "衣服", "laundry"]),
      leaf("Wash the car", "monthly", ["洗车", "车", "car"]),
      leaf("Deep clean the apartment", "monthly", ["打扫", "大扫除", "扫除", "clean"]),
      leaf("Change the sheets", "monthly", ["床单", "换床单", "sheets"]),
    ] },
    leaf("Teeth cleaning", "yearly", ["洗牙", "牙", "teeth"]),
  ],
};

function normLeaf(r) { return { id: r?.id || uid(), name: r?.name || "", mode: r?.mode || "cadence", cadence: r?.cadence || "weekly", nextDate: r?.nextDate || null, history: Array.isArray(r?.history) ? r.history : [], paused: !!r?.paused, resetAt: r?.resetAt || null, aliases: Array.isArray(r?.aliases) ? r.aliases : [] }; }
function normRoutine(e) {
  if (e && (e.group || Array.isArray(e.items))) return { id: e.id || uid(), name: e.name || "Group", group: true, collapsed: !!e.collapsed, paused: !!e.paused, items: (e.items || []).map(normLeaf) };
  return normLeaf(e);
}
function normalize(d) {
  const so = Array.isArray(d?.sectionOrder) ? SECTION_KEYS.filter((k) => d.sectionOrder.includes(k)).concat(SECTION_KEYS.filter((k) => !d.sectionOrder.includes(k))) : [...SECTION_KEYS];
  const ordered = d?.sectionOrder ? d.sectionOrder.filter((k) => SECTION_KEYS.includes(k)) : [...SECTION_KEYS];
  SECTION_KEYS.forEach((k) => { if (!ordered.includes(k)) ordered.push(k); });
  const bo = Array.isArray(d?.bodyOrder) ? ["sleep", "weight"].filter((k) => d.bodyOrder.includes(k)) : ["sleep", "weight"];
  ["sleep", "weight"].forEach((k) => { if (!bo.includes(k)) bo.push(k); });
  return {
    sectionOrder: ordered,
    bodyOrder: bo,
    sleep: { entries: Array.isArray(d?.sleep?.entries) ? d.sleep.entries : [], paused: !!d?.sleep?.paused },
    weight: { unit: d?.weight?.unit || "kg", entries: Array.isArray(d?.weight?.entries) ? d.weight.entries : [], paused: !!d?.weight?.paused },
    savings: { tx: Array.isArray(d?.savings?.tx) ? d.savings.tx : [] },
    activities: (Array.isArray(d?.activities) ? d.activities : []).map((a) => ({ id: a.id || uid(), name: a.name || "", hasGoal: !!a.hasGoal, goalKind: a.goalKind || "days", target: a.target || 0, deadline: a.deadline || "2026-12-31", defaultMin: a.defaultMin ?? 30, aliases: Array.isArray(a.aliases) ? a.aliases : [], logs: Array.isArray(a.logs) ? a.logs : [], paused: !!a.paused })),
    projects: (Array.isArray(d?.projects) ? d.projects : []).map((p) => ({ id: p.id || uid(), name: p.name || "", stages: Array.isArray(p.stages) ? p.stages : [], current: p.current || 0, sessions: Array.isArray(p.sessions) ? p.sessions : [], aliases: Array.isArray(p.aliases) ? p.aliases : [], paused: !!p.paused })),
    routines: (Array.isArray(d?.routines) ? d.routines : []).map(normRoutine),
  };
}

const AC = "#6F7F73", AC2 = "#9AA6B0", MUT = "#83857A", LINE = "#D4D4CA";
const GOLD = "#B9985E", SILVER = "#9AA6B0", BRONZE = "#A9744F";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,400&family=Newsreader:ital,opsz@1,6..72&family=Inter:wght@400;500&display=swap');
.hy-root{--paper:#E7E7E0;--surface:#F1F1EB;--ink:#2A2B26;--muted:#83857A;--line:#D4D4CA;--accent:#6F7F73;--accent-ink:#55634F;--accent-soft:rgba(111,127,115,.13);--warn:#A8735B;--f-display:'Fraunces',Georgia,serif;--f-note:'Newsreader',Georgia,serif;--f-body:'Inter',system-ui,-apple-system,sans-serif;min-height:100vh;background:var(--paper);color:var(--ink);font-family:var(--f-body);-webkit-font-smoothing:antialiased;}
.hy-wrap{max-width:680px;margin:0 auto;padding:56px 26px 128px;}
.hy-topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.hy-editbtn{font-family:inherit;font-size:13px;color:var(--accent-ink);background:var(--accent-soft);border:1px solid transparent;border-radius:20px;padding:8px 18px;cursor:pointer;letter-spacing:.02em;}
.hy-editbtn.on{background:var(--accent);color:#fff;}
.hy-eyebrow{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);}
.hy-title{font-family:var(--f-display);font-weight:500;font-size:clamp(32px,7vw,46px);line-height:1.04;letter-spacing:-.01em;margin:14px 0 0;}
.hy-note{font-family:var(--f-note);font-style:italic;font-size:19px;color:var(--muted);margin:18px 0 0;line-height:1.5;max-width:44ch;}
.hy-authpanel{margin-top:56px;padding:28px;background:var(--surface);border-radius:13px;display:flex;flex-direction:column;gap:14px;max-width:400px;}
.hy-authpanel h2{font-family:var(--f-display);font-weight:500;font-size:22px;margin:0 0 8px;}
.hy-authpanel .hy-input{font-size:16px;}
.hy-authpanel button{font-size:14px;}
.hy-authinfo{text-align:center;font-size:13px;color:var(--muted);}
.hy-due{margin-top:28px;padding:15px 17px;background:var(--surface);border:1px solid var(--line);border-radius:13px;}
.hy-due h3{font-family:var(--f-display);font-weight:500;font-size:14px;margin:0 0 7px;}
.hy-due-item{font-size:13px;color:var(--muted);padding:3px 0;}
.hy-due-item b{color:var(--warn);font-weight:500;}
.hy-section{margin-top:56px;}
.hy-shead{display:flex;align-items:baseline;justify-content:space-between;gap:16px;border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:10px;}
.hy-h2{font-family:var(--f-display);font-weight:500;font-size:22px;letter-spacing:-.01em;}
.hy-meta{font-size:12px;letter-spacing:.03em;color:var(--muted);}
.hy-card{padding:22px 0;border-bottom:1px solid var(--line);}
.paused-card{opacity:.5;}
.hy-card-head{display:flex;align-items:center;gap:10px;}
.hy-cname{flex:1 1 auto;font-family:var(--f-display);font-weight:500;font-size:18px;color:var(--ink);background:none;border:none;border-bottom:1px solid transparent;padding:2px 0;min-width:0;}
.hy-cname:focus{outline:none;border-bottom-color:var(--accent);}
.hy-x{background:none;border:none;color:transparent;cursor:pointer;font-size:14px;padding:4px;transition:color .15s;}
.hy-card:hover .hy-x,.hy-routine:hover .hy-x,.hy-group-head:hover .hy-x{color:var(--muted);}
.hy-x:hover{color:var(--ink);}
.hy-pausebadge{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);border:1px solid var(--line);padding:2px 8px;border-radius:20px;white-space:nowrap;}
.hy-figure{font-family:var(--f-display);font-weight:500;font-size:24px;letter-spacing:-.01em;margin-top:12px;}
.hy-figure small{font-size:14px;color:var(--muted);font-family:var(--f-body);font-weight:400;margin-left:7px;}
.hy-bar{height:6px;background:var(--line);border-radius:6px;overflow:hidden;margin:10px 0;}
.hy-bar-fill{height:100%;background:var(--accent);border-radius:6px;transition:width .35s ease;}
.hy-pace{font-family:var(--f-note);font-style:italic;font-size:15px;color:var(--muted);line-height:1.45;}
.hy-pace b{color:var(--accent-ink);font-weight:400;font-style:normal;}
.hy-chips{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0 6px;}
.hy-chip{font-family:inherit;font-size:12px;padding:5px 11px;border-radius:20px;border:1px solid var(--line);background:transparent;color:var(--muted);cursor:pointer;}
.hy-chip.on{background:var(--accent-soft);border-color:var(--accent);color:var(--accent-ink);}
.hy-chart{margin-top:8px;}
.hy-empty{font-family:var(--f-note);font-style:italic;color:var(--muted);font-size:15px;padding:18px 0;}
.hy-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:14px;}
.hy-link{background:none;border:none;color:var(--muted);font-size:12.5px;letter-spacing:.03em;cursor:pointer;padding:0;font-family:inherit;}
.hy-link:hover{color:var(--ink);}
.hy-mini{font-family:inherit;font-size:13px;color:var(--accent-ink);background:var(--accent-soft);border:none;border-radius:8px;padding:8px 13px;cursor:pointer;transition:background .15s;}
.hy-mini:hover{background:rgba(111,127,115,.22);}
.hy-num,.hy-date,.hy-sel,.hy-text,.hy-time{font-family:inherit;font-size:14px;color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:7px 10px;}
.hy-num{width:84px;}.hy-coin-in{width:56px;}.hy-text{flex:1 1 120px;min-width:0;}.hy-unit{width:46px;text-align:center;}
.hy-lab{font-size:12px;color:var(--muted);}
.hy-panel{margin-top:14px;padding:15px;background:var(--surface);border-radius:11px;display:flex;flex-direction:column;gap:11px;}
.hy-field{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--muted);flex-wrap:wrap;}
.hy-field label{min-width:64px;}
.hy-input{flex:1 1 auto;font-size:16px;font-family:inherit;color:var(--ink);background:transparent;border:none;border-bottom:1px solid var(--line);padding:8px 0;min-width:0;}
.hy-input::placeholder{color:var(--muted);}
.hy-input:focus{outline:none;border-bottom-color:var(--accent);}
.hy-break{display:flex;align-items:center;gap:10px;margin:9px 0;font-size:13px;}
.hy-break .nm{flex:0 0 96px;color:var(--ink);}
.hy-break .track{flex:1 1 auto;height:7px;background:var(--line);border-radius:6px;overflow:hidden;}
.hy-break .fill{height:100%;background:var(--accent);border-radius:6px;}
.hy-break .val{flex:0 0 auto;color:var(--muted);width:64px;text-align:right;}
.hy-pips{display:flex;gap:6px;align-items:center;margin:12px 0;flex-wrap:wrap;}
.hy-pip{width:26px;height:8px;border-radius:5px;border:1px solid var(--line);background:transparent;cursor:pointer;padding:0;transition:background .2s;}
.hy-pip.done{background:var(--accent);border-color:var(--accent);}
.hy-pip.active{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft);}
.hy-stage-now{font-family:var(--f-note);font-style:italic;font-size:16px;color:var(--ink);margin-top:2px;}
.hy-routine{display:flex;align-items:center;gap:10px;padding:14px 0;border-bottom:1px solid var(--line);flex-wrap:wrap;}
.hy-rname{flex:1 1 150px;font-size:16px;color:var(--ink);background:none;border:none;border-bottom:1px solid transparent;padding:2px 0;min-width:0;}
.hy-rname:focus{outline:none;border-bottom-color:var(--accent);}
.hy-status{font-size:13px;color:var(--muted);white-space:nowrap;}
.hy-status.warn{color:var(--warn);}.hy-status.ok{color:var(--accent-ink);}
.hy-group{border-bottom:1px solid var(--line);}
.hy-group-head{display:flex;align-items:center;gap:10px;padding:15px 0;}
.hy-disc{background:none;border:none;color:var(--muted);cursor:pointer;font-size:12px;padding:2px 4px;}
.hy-group-items{padding-left:16px;border-left:2px solid var(--line);margin:0 0 14px 6px;}
.hy-group-items .hy-routine{border-bottom:1px solid var(--line);}
.hy-group-items .hy-routine:last-of-type{border-bottom:none;}
.hy-entry{display:flex;gap:12px;font-size:13px;color:var(--muted);padding:5px 0;}
.hy-entry b{color:var(--ink);font-weight:500;min-width:52px;}
.hy-hist{margin-top:12px;}
.hy-add{display:flex;align-items:center;gap:10px;margin-top:22px;flex-wrap:wrap;}
.hy-foot{margin-top:78px;font-family:var(--f-note);font-style:italic;font-size:16px;color:var(--muted);text-align:center;}
.hy-loading{min-height:100vh;display:flex;align-items:center;justify-content:center;color:var(--muted);font-family:var(--f-note);font-style:italic;font-size:18px;}
.hy-quick{margin-top:26px;}
.hy-quickbox{display:flex;gap:10px;align-items:center;}
.hy-qinput{flex:1 1 auto;font-family:inherit;font-size:16px;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:13px 15px;min-width:0;}
.hy-qinput::placeholder{color:var(--muted);}
.hy-qinput:focus{outline:none;border-color:var(--accent);}
.hy-qhint{font-size:12.5px;color:var(--muted);margin-top:9px;line-height:1.4;}
.hy-qfb{font-size:13px;margin-top:9px;}
.hy-qfb.ok{color:var(--accent-ink);}
.hy-qfb.err{color:var(--warn);}
.hy-savings{display:flex;align-items:center;gap:22px;flex-wrap:wrap;margin-top:8px;}
.hy-jarwrap{position:relative;flex:0 0 auto;}
.hy-jar{display:block;}
.hy-savetotal{flex:1 1 auto;min-width:130px;}
.hy-drop{position:absolute;top:2px;left:50%;width:15px;height:15px;margin-left:-7px;border-radius:50%;border:1.5px solid var(--muted);z-index:2;animation:hy-fall .72s ease-in forwards;}
.hy-drop.gold{border-color:#B9985E;}.hy-drop.silver{border-color:#9AA6B0;}.hy-drop.bronze{border-color:#A9744F;}
.hy-cdot{display:inline-block;width:9px;height:9px;border-radius:50%;border:1.5px solid;vertical-align:middle;margin-right:6px;}
.hy-outline{margin-top:30px;}
.hy-outrow{display:flex;align-items:center;gap:8px;padding:2px 0;}
.hy-outrow.dragging{opacity:.45;}
.hy-outrow.sec{margin-top:16px;border-top:1px solid var(--line);padding-top:12px;}
.hy-handle{flex:0 0 auto;background:none;border:none;color:var(--muted);cursor:grab;font-size:19px;line-height:1;padding:12px 12px;margin:-4px 0;touch-action:none;user-select:none;-webkit-user-select:none;}
.hy-handle:active{cursor:grabbing;color:var(--ink);}
.hy-outname{flex:1 1 auto;font-size:15px;color:var(--ink);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.hy-outrow.sec .hy-outname{font-family:var(--f-display);font-weight:500;font-size:18px;}
.hy-outrow.grp .hy-outname{color:var(--accent-ink);font-weight:500;}
.hy-outempty{padding:6px 0 6px 60px;color:var(--muted);font-size:13px;font-style:italic;}
@keyframes hy-fall{0%{transform:translateY(0);opacity:0;}18%{opacity:1;}100%{transform:translateY(150px);opacity:0;}}
button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:2px;}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;}}
`;

/* ---------- outline row (edit mode) ---------- */
function OutRow({ zone, cont = "-", id, kind = "item", depth = 0, label, begin, activeId, cls = "" }) {
  return (
    <div className={`hy-outrow ${cls}${activeId === id ? " dragging" : ""}`} data-hy-zone={zone} data-hy-cont={cont} data-hy-id={id} data-hy-kind={kind} style={{ paddingLeft: depth * 22 }}>
      <button className="hy-handle" aria-label={`Drag ${label}`} onPointerDown={begin({ zone, cont, id, kind })}>≡</button>
      <span className="hy-outname">{label}</span>
    </div>
  );
}

function PausedCard({ name, onName, onResume, onRemove }) {
  return (
    <div className="hy-card paused-card">
      <div className="hy-card-head">
        {onName ? <input className="hy-cname" value={name} onChange={(e) => onName(e.target.value)} aria-label="Name" /> : <span className="hy-cname" style={{ borderBottom: "none" }}>{name}</span>}
        <span className="hy-pausebadge">paused</span>
        <button className="hy-link" onClick={onResume}>resume</button>
        {onRemove && <button className="hy-x" style={{ color: "var(--muted)" }} aria-label="Remove" onClick={onRemove}>✕</button>}
      </div>
    </div>
  );
}

function Trend({ rows, lines, yFmt, tipFmt, height = 150 }) {
  if (!rows.length) return <div className="hy-empty">Nothing logged yet — add a day or two and the trend appears here.</div>;
  return (
    <div className="hy-chart">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: MUT }} tickLine={false} axisLine={{ stroke: LINE }} minTickGap={26} />
          <YAxis tick={{ fontSize: 10, fill: MUT }} tickLine={false} axisLine={false} width={40} tickFormatter={yFmt} domain={["auto", "auto"]} />
          <Tooltip formatter={tipFmt} labelStyle={{ color: MUT, fontSize: 12 }} contentStyle={{ background: "#F1F1EB", border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 12 }} />
          {lines.map((l) => (<Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={1.6} dot={{ r: 2, fill: l.color, strokeWidth: 0 }} activeDot={{ r: 3 }} connectNulls />))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
const RANGES = [{ k: "2w", d: 14 }, { k: "6w", d: 42 }, { k: "all", d: 9999 }];
function inRange(entries, days) { const s = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1)); return days >= 9999 ? s : s.filter((e) => daysSince(e.date) <= days); }

function SleepCard({ sleep, onChange }) {
  const [view, setView] = useState("duration"); const [range, setRange] = useState(14);
  const [bed, setBed] = useState(""); const [wake, setWake] = useState("");
  if (sleep.paused) return <PausedCard name="Sleep" onResume={() => onChange({ ...sleep, paused: false })} />;
  const today = todayKey(); const te = sleep.entries.find((e) => e.date === today);
  const save = () => { if (!bed && !wake) return; const entries = sleep.entries.filter((e) => e.date !== today); entries.push({ date: today, bed: bed || te?.bed || "", wake: wake || te?.wake || "" }); onChange({ ...sleep, entries }); setBed(""); setWake(""); };
  const data = inRange(sleep.entries, range).map((e) => ({ label: fmtShort(e.date), duration: sleepDur(e.bed, e.wake), bedtime: bedVal(e.bed), wake: e.wake ? toMin(e.wake) / 60 : null }));
  const lines = view === "duration" ? [{ key: "duration", name: "hours", color: AC }] : view === "bedtime" ? [{ key: "bedtime", name: "to bed", color: AC }] : [{ key: "wake", name: "up at", color: AC }];
  const yFmt = view === "duration" ? (v) => `${round1(v)}h` : (v) => clockFromHours(v);
  const tipFmt = view === "duration" ? (v) => [v == null ? "—" : `${round1(v)}h`, "slept"] : (v) => [v == null ? "—" : clockFromHours(v), view];
  const last = te && sleepDur(te.bed, te.wake);
  return (
    <div className="hy-card">
      <div className="hy-card-head"><span className="hy-cname" style={{ borderBottom: "none" }}>Sleep</span></div>
      <div className="hy-pace" style={{ marginTop: 4 }}>{te ? <>last night: <b>{te.bed || "—"} → {te.wake || "—"}</b>{last ? ` · ${fmtMinutes(last * 60)}` : ""}</> : "log when you went to bed and woke."}</div>
      <div className="hy-chips">
        {[["duration", "duration"], ["bedtime", "to bed"], ["wake", "up at"]].map(([k, l]) => <button key={k} className={`hy-chip${view === k ? " on" : ""}`} onClick={() => setView(k)}>{l}</button>)}
        <span style={{ flex: 1 }} />
        {RANGES.map((r) => <button key={r.k} className={`hy-chip${range === r.d ? " on" : ""}`} onClick={() => setRange(r.d)}>{r.k}</button>)}
      </div>
      <Trend rows={data} lines={lines} yFmt={yFmt} tipFmt={tipFmt} />
      <div className="hy-row">
        <span className="hy-lab">to bed</span><input className="hy-time" type="time" value={bed} onChange={(e) => setBed(e.target.value)} />
        <span className="hy-lab">up at</span><input className="hy-time" type="time" value={wake} onChange={(e) => setWake(e.target.value)} />
        <button className="hy-mini" onClick={save}>save last night</button>
        <button className="hy-link" onClick={() => onChange({ ...sleep, paused: true })}>pause</button>
      </div>
    </div>
  );
}

function WeightCard({ weight, onChange }) {
  const [view, setView] = useState("both"); const [range, setRange] = useState(14);
  const [am, setAm] = useState(""); const [pm, setPm] = useState("");
  if (weight.paused) return <PausedCard name="Weight" onResume={() => onChange({ ...weight, paused: false })} />;
  const today = todayKey(); const te = weight.entries.find((e) => e.date === today); const u = weight.unit || "kg";
  const save = () => { if (!am && !pm) return; const entries = weight.entries.filter((e) => e.date !== today); entries.push({ date: today, am: am ? parseFloat(am) : te?.am ?? null, pm: pm ? parseFloat(pm) : te?.pm ?? null }); onChange({ ...weight, entries }); setAm(""); setPm(""); };
  const data = inRange(weight.entries, range).map((e) => ({ label: fmtShort(e.date), am: e.am ?? null, pm: e.pm ?? null }));
  const lines = view === "am" ? [{ key: "am", name: "morning", color: AC }] : view === "pm" ? [{ key: "pm", name: "evening", color: AC2 }] : [{ key: "am", name: "morning", color: AC }, { key: "pm", name: "evening", color: AC2 }];
  return (
    <div className="hy-card">
      <div className="hy-card-head"><span className="hy-cname" style={{ borderBottom: "none", flex: "0 0 auto" }}>Weight</span><input className="hy-num hy-unit" value={u} onChange={(e) => onChange({ ...weight, unit: e.target.value })} aria-label="unit" /><span style={{ flex: 1 }} /></div>
      <div className="hy-pace" style={{ marginTop: 4 }}>{te ? <>today: <b>{te.am ?? "—"}</b> am · <b>{te.pm ?? "—"}</b> pm ({u})</> : `two readings a day, morning and evening (${u}).`}</div>
      <div className="hy-chips">
        {[["both", "both"], ["am", "morning"], ["pm", "evening"]].map(([k, l]) => <button key={k} className={`hy-chip${view === k ? " on" : ""}`} onClick={() => setView(k)}>{l}</button>)}
        <span style={{ flex: 1 }} />
        {RANGES.map((r) => <button key={r.k} className={`hy-chip${range === r.d ? " on" : ""}`} onClick={() => setRange(r.d)}>{r.k}</button>)}
      </div>
      <Trend rows={data} lines={lines} yFmt={(v) => `${round1(v)}`} tipFmt={(v, n) => [v == null ? "—" : `${round1(v)} ${u}`, n]} />
      <div className="hy-row">
        <span className="hy-lab">morning</span><input className="hy-num" type="number" step="0.1" value={am} onChange={(e) => setAm(e.target.value)} />
        <span className="hy-lab">evening</span><input className="hy-num" type="number" step="0.1" value={pm} onChange={(e) => setPm(e.target.value)} />
        <button className="hy-mini" onClick={save}>save today</button>
        <button className="hy-link" onClick={() => onChange({ ...weight, paused: true })}>pause</button>
      </div>
    </div>
  );
}

function coinSummary(c) { if (!c) return null; const p = []; if (c.g) p.push(`${c.g}×gold`); if (c.s) p.push(`${c.s}×silver`); if (c.b) p.push(`${c.b}×bronze`); return p.join(" · "); }
function SavingsCard({ savings, onChange }) {
  const [cg, setCg] = useState(""); const [cs, setCs] = useState(""); const [cb, setCb] = useState("");
  const [purpose, setPurpose] = useState(""); const [hist, setHist] = useState(false);
  const [drop, setDrop] = useState(null); const [err, setErr] = useState("");
  const tx = savings.tx;
  const balance = tx.reduce((s, t) => s + (t.type === "deposit" ? t.amount : -t.amount), 0);
  const gold = Math.floor(balance / 1000), rem = balance - gold * 1000;
  const silver = Math.floor(rem / 500), rem2 = rem - silver * 500;
  const bronze = Math.floor(rem2 / 100), loose = rem2 - bronze * 100;
  const picked = () => { const g = +cg || 0, s = +cs || 0, b = +cb || 0; return { g, s, b, amount: g * 1000 + s * 500 + b * 100 }; };
  const reset = () => { setCg(""); setCs(""); setCb(""); };
  const deposit = () => { const { g, s, b, amount } = picked(); if (amount <= 0) { setErr("Pick at least one coin."); return; } setErr(""); onChange({ ...savings, tx: [...tx, { id: uid(), type: "deposit", amount, coins: { g, s, b }, purpose: purpose.trim(), date: todayKey() }] }); setDrop({ kind: g > 0 ? "gold" : s > 0 ? "silver" : "bronze", key: Date.now() }); reset(); setPurpose(""); };
  const withdraw = () => { const { g, s, b, amount } = picked(); if (amount <= 0) { setErr("Pick which coins to take out."); return; } if (amount > balance) { setErr("That's more than the jar holds."); return; } if (!purpose.trim()) { setErr("Add what it's for."); return; } setErr(""); onChange({ ...savings, tx: [...tx, { id: uid(), type: "withdraw", amount, coins: { g, s, b }, purpose: purpose.trim(), date: todayKey() }] }); reset(); setPurpose(""); };

  const count = gold + silver + bronze, shown = Math.min(count, 54);
  const innerX = 48, innerW = 104, jarBottom = 188, jarTop = 64, innerH = jarBottom - jarTop;
  const cols = 4, gap = 4;
  let d = (innerW - gap * (cols - 1)) / cols;
  const rows = Math.max(1, Math.ceil(shown / cols));
  const maxD = (innerH - gap * (rows - 1)) / rows;
  if (maxD < d) d = Math.max(7, maxD);
  const startX = innerX + (innerW - (cols * d + (cols - 1) * gap)) / 2;
  const coins = [];
  for (let i = 0; i < shown; i++) { const row = Math.floor(i / cols), col = i % cols; const kind = i < gold ? "gold" : i < gold + silver ? "silver" : "bronze"; coins.push({ cx: startX + col * (d + gap) + d / 2, cy: jarBottom - row * (d + gap) - d / 2, r: d / 2, col: kind === "gold" ? GOLD : kind === "silver" ? SILVER : BRONZE }); }
  const recent = [...tx].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
  const Dot = ({ c }) => <span className="hy-cdot" style={{ borderColor: c }} />;

  return (
    <div className="hy-card">
      <div className="hy-savings">
        <div className="hy-jarwrap">
          {drop && <div key={drop.key} className={`hy-drop ${drop.kind}`} />}
          <svg viewBox="0 0 200 210" width="176" height="185" className="hy-jar" aria-label="Savings jar">
            <path d="M40 64 L40 172 Q40 190 58 190 L142 190 Q160 190 160 172 L160 64 Z" fill="rgba(255,255,255,0.22)" stroke="var(--muted)" strokeWidth="1.5" />
            <path d="M34 48 Q34 42 41 42 L159 42 Q166 42 166 48 L166 52 Q166 58 159 58 L41 58 Q34 58 34 52 Z" fill="none" stroke="var(--muted)" strokeWidth="1.5" />
            <path d="M40 64 Q100 72 160 64" fill="none" stroke="var(--muted)" strokeWidth="1" opacity="0.6" />
            {coins.map((c, i) => (<g key={i}><circle cx={c.cx} cy={c.cy} r={c.r} fill="none" stroke={c.col} strokeWidth="1.4" /><circle cx={c.cx} cy={c.cy} r={c.r * 0.56} fill="none" stroke={c.col} strokeWidth="0.9" /></g>))}
          </svg>
        </div>
        <div className="hy-savetotal">
          <div className="hy-figure" style={{ marginTop: 0, fontSize: 30 }}>${balance.toLocaleString()}</div>
          <div className="hy-pace">{gold} gold · {silver} silver · {bronze} bronze{loose ? ` · $${loose} loose` : ""}{count > shown ? ` · showing ${shown}` : ""}</div>
        </div>
      </div>

      <div className="hy-panel">
        <div className="hy-field"><label>Coins</label>
          <Dot c={GOLD} /><input className="hy-num hy-coin-in" type="number" min="0" placeholder="0" value={cg} onChange={(e) => setCg(e.target.value)} />
          <Dot c={SILVER} /><input className="hy-num hy-coin-in" type="number" min="0" placeholder="0" value={cs} onChange={(e) => setCs(e.target.value)} />
          <Dot c={BRONZE} /><input className="hy-num hy-coin-in" type="number" min="0" placeholder="0" value={cb} onChange={(e) => setCb(e.target.value)} />
        </div>
        <div className="hy-field"><label>For</label><input className="hy-text" placeholder="what it's for (required to withdraw)" value={purpose} onChange={(e) => setPurpose(e.target.value)} /></div>
        <div className="hy-row"><button className="hy-mini" onClick={deposit}>Deposit</button><button className="hy-mini" onClick={withdraw}>Withdraw</button><span className="hy-lab" style={{ marginLeft: 4 }}>gold $1000 · silver $500 · bronze $100</span></div>
      </div>
      {err && <div className="hy-qfb err" style={{ marginTop: 10 }}>{err}</div>}
      {tx.length > 0 && <div className="hy-row"><button className="hy-link" onClick={() => setHist((v) => !v)}>{hist ? "hide record" : "record"}</button></div>}
      {hist && (
        <div className="hy-hist">
          {recent.map((t) => (
            <div className="hy-entry" key={t.id}>
              <b>{fmtShort(t.date)}</b>
              <span style={{ color: t.type === "deposit" ? "var(--accent-ink)" : "var(--warn)", minWidth: 64 }}>{t.type === "deposit" ? "+" : "−"}${t.amount.toLocaleString()}</span>
              <span>{t.type === "withdraw" ? t.purpose : (coinSummary(t.coins) || "deposit")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityCard({ act, onChange, onRemove }) {
  const [adjust, setAdjust] = useState(false); const [hist, setHist] = useState(false); const [mins, setMins] = useState("");
  if (act.paused) return <PausedCard name={act.name} onName={(n) => onChange({ ...act, name: n })} onResume={() => onChange({ ...act, paused: false })} onRemove={onRemove} />;
  const days = new Set(act.logs.map((l) => l.date)).size;
  const totalMin = act.logs.reduce((s, l) => s + (l.minutes || 0), 0);
  const sessions = act.logs.length;
  const logToday = () => { const m = mins ? parseFloat(mins) : 0; onChange({ ...act, logs: [...act.logs, { id: uid(), date: todayKey(), minutes: m || 0 }] }); setMins(""); };
  const removeLog = (id) => onChange({ ...act, logs: act.logs.filter((l) => l.id !== id) });
  let goalUI = null;
  if (act.hasGoal) {
    const cur = act.goalKind === "hours" ? totalMin / 60 : act.goalKind === "sessions" ? sessions : days;
    const remn = Math.max(act.target - cur, 0); const dLeft = Math.max(daysUntil(act.deadline), 0);
    const pw = dLeft > 0 ? remn / (dLeft / 7) : remn; const pct = act.target > 0 ? Math.min(cur / act.target, 1) : 0;
    goalUI = (<><div className="hy-bar"><div className="hy-bar-fill" style={{ width: `${pct * 100}%` }} /></div><div className="hy-pace">{remn <= 0 ? <span>Goal reached — <b>{round1(cur)} {act.goalKind}</b>.</span> : <span>{round1(cur)} of {act.target} {act.goalKind} · about <b>{round1(pw)} a week</b> to reach it by {fmtShort(act.deadline)}</span>}</div></>);
  }
  const recent = [...act.logs].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
  return (
    <div className="hy-card">
      <div className="hy-card-head"><input className="hy-cname" value={act.name} onChange={(e) => onChange({ ...act, name: e.target.value })} aria-label="Activity name" /><button className="hy-x" aria-label="Remove" onClick={onRemove}>✕</button></div>
      <div className="hy-figure" style={{ fontSize: 20 }}>{days}<small>days</small> · {fmtMinutes(totalMin)}<small>total</small> · {sessions}<small>sessions</small></div>
      {goalUI}
      <div className="hy-row">
        <input className="hy-num" type="number" min="0" placeholder="min" value={mins} onChange={(e) => setMins(e.target.value)} onKeyDown={(e) => e.key === "Enter" && logToday()} />
        <button className="hy-mini" onClick={logToday}>log today</button>
        <button className="hy-link" onClick={() => setAdjust((v) => !v)}>{adjust ? "close" : "goal"}</button>
        {act.logs.length > 0 && <button className="hy-link" onClick={() => setHist((v) => !v)}>{hist ? "hide record" : "record"}</button>}
        <button className="hy-link" onClick={() => onChange({ ...act, paused: true })}>pause</button>
      </div>
      {adjust && (
        <div className="hy-panel">
          <div className="hy-field"><label>1 session</label><input className="hy-num" type="number" min="0" value={act.defaultMin} onChange={(e) => onChange({ ...act, defaultMin: Number(e.target.value) })} /><span>min · used for "1次" &amp; bare logs (past entries keep their own)</span></div>
          <div className="hy-field"><label>Match</label><input className="hy-text" value={(act.aliases || []).join(" ")} onChange={(e) => onChange({ ...act, aliases: e.target.value.split(/[\s,，、]+/).filter(Boolean) })} placeholder="words the quick box should match" /></div>
          <div className="hy-field"><label>Goal</label><button className="hy-chip" style={act.hasGoal ? { background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent-ink)" } : {}} onClick={() => onChange({ ...act, hasGoal: !act.hasGoal })}>{act.hasGoal ? "on" : "off"}</button></div>
          {act.hasGoal && (<>
            <div className="hy-field"><label>Reach</label><input className="hy-num" type="number" min="0" value={act.target} onChange={(e) => onChange({ ...act, target: Number(e.target.value) })} /><select className="hy-sel" value={act.goalKind} onChange={(e) => onChange({ ...act, goalKind: e.target.value })}><option value="days">days</option><option value="hours">hours</option><option value="sessions">sessions</option></select></div>
            <div className="hy-field"><label>By</label><input className="hy-date" type="date" value={act.deadline} onChange={(e) => onChange({ ...act, deadline: e.target.value })} /></div>
          </>)}
        </div>
      )}
      {hist && <div className="hy-hist">{recent.map((l) => (<div className="hy-entry" key={l.id}><b>{fmtShort(l.date)}</b><span>{l.minutes ? fmtMinutes(l.minutes) : "logged"}</span><button className="hy-link" style={{ marginLeft: "auto" }} onClick={() => removeLog(l.id)}>remove</button></div>))}</div>}
    </div>
  );
}

function MovementOverview({ activities }) {
  const [by, setBy] = useState("days");
  const rows = activities.map((a) => { const days = new Set(a.logs.map((l) => l.date)).size; const mins = a.logs.reduce((s, l) => s + (l.minutes || 0), 0); return { name: a.name, val: by === "days" ? days : by === "time" ? mins / 60 : a.logs.length }; });
  const max = Math.max(1, ...rows.map((r) => r.val));
  const fmt = by === "time" ? (v) => `${round1(v)}h` : (v) => `${Math.round(v)}`;
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="hy-chips">{[["days", "by days"], ["time", "by time"], ["sessions", "by sessions"]].map(([k, l]) => <button key={k} className={`hy-chip${by === k ? " on" : ""}`} onClick={() => setBy(k)}>{l}</button>)}</div>
      {rows.map((r) => (<div className="hy-break" key={r.name}><span className="nm">{r.name}</span><span className="track"><span className="fill" style={{ width: `${(r.val / max) * 100}%` }} /></span><span className="val">{fmt(r.val)}</span></div>))}
    </div>
  );
}

function ProjectCard({ project, onChange, onRemove }) {
  const [editStages, setEditStages] = useState(false); const [hist, setHist] = useState(false);
  const [mins, setMins] = useState(""); const [note, setNote] = useState(""); const [stageDraft, setStageDraft] = useState("");
  if (project.paused) return <PausedCard name={project.name} onName={(n) => onChange({ ...project, name: n })} onResume={() => onChange({ ...project, paused: false })} onRemove={onRemove} />;
  const n = project.stages.length; const current = Math.min(project.current, n); const allDone = current >= n && n > 0;
  const totalMin = project.sessions.reduce((s, x) => s + (x.minutes || 0), 0); const pct = n > 0 ? current / n : 0;
  const setCurrent = (c) => onChange({ ...project, current: Math.max(0, Math.min(c, n)) });
  const addSession = () => { const m = parseFloat(mins); if (!m || m <= 0) return; onChange({ ...project, sessions: [...project.sessions, { id: uid(), date: todayKey(), minutes: m, note: note.trim() }] }); setMins(""); setNote(""); };
  const updateStage = (i, v) => { const s = project.stages.slice(); s[i] = v; onChange({ ...project, stages: s }); };
  const addStage = () => { const s = stageDraft.trim(); if (!s) return; onChange({ ...project, stages: [...project.stages, s] }); setStageDraft(""); };
  const removeStage = (i) => { const s = project.stages.filter((_, idx) => idx !== i); onChange({ ...project, stages: s, current: Math.min(project.current, s.length) }); };
  const recent = [...project.sessions].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
  return (
    <div className="hy-card">
      <div className="hy-card-head"><input className="hy-cname" value={project.name} onChange={(e) => onChange({ ...project, name: e.target.value })} aria-label="Project name" /><button className="hy-x" aria-label="Remove" onClick={onRemove}>✕</button></div>
      <div className="hy-pips">{project.stages.map((s, i) => (<button key={i} className={`hy-pip${i < current ? " done" : ""}${i === current && !allDone ? " active" : ""}`} title={s} aria-label={`Stage ${i + 1}: ${s}`} onClick={() => setCurrent(i)} />))}</div>
      <div className="hy-stage-now">{n === 0 ? "No stages yet." : allDone ? "All stages complete." : `Stage ${current + 1} of ${n} — ${project.stages[current]}`}</div>
      <div className="hy-bar" style={{ marginTop: 10 }}><div className="hy-bar-fill" style={{ width: `${pct * 100}%` }} /></div>
      <div className="hy-pace">{fmtMinutes(totalMin)} over {project.sessions.length} session{project.sessions.length === 1 ? "" : "s"}</div>
      <div className="hy-row"><input className="hy-num" type="number" min="0" placeholder="min" value={mins} onChange={(e) => setMins(e.target.value)} /><input className="hy-text" placeholder="what you did (optional)" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSession()} /><button className="hy-mini" onClick={addSession}>log session</button></div>
      <div className="hy-row">
        {!allDone && n > 0 && <button className="hy-link" onClick={() => setCurrent(current + 1)}>finish this stage →</button>}
        {current > 0 && <button className="hy-link" onClick={() => setCurrent(current - 1)}>← step back</button>}
        <button className="hy-link" onClick={() => setEditStages((v) => !v)}>{editStages ? "close" : "edit stages"}</button>
        {project.sessions.length > 0 && <button className="hy-link" onClick={() => setHist((v) => !v)}>{hist ? "hide record" : "record"}</button>}
        <button className="hy-link" onClick={() => onChange({ ...project, paused: true })}>pause</button>
      </div>
      {editStages && (<div className="hy-panel">{project.stages.map((s, i) => (<div className="hy-field" key={i}><input className="hy-text" value={s} onChange={(e) => updateStage(i, e.target.value)} /><button className="hy-link" onClick={() => removeStage(i)}>remove</button></div>))}<div className="hy-field"><input className="hy-text" placeholder="add a stage…" value={stageDraft} onChange={(e) => setStageDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addStage()} /><button className="hy-mini" onClick={addStage}>add</button></div></div>)}
      {hist && <div className="hy-hist">{recent.map((x) => (<div className="hy-entry" key={x.id}><b>{fmtShort(x.date)}</b><span>{fmtMinutes(x.minutes)}{x.note ? ` · ${x.note}` : ""}</span></div>))}</div>}
    </div>
  );
}

function routineDue(r) {
  if (r.mode === "date") return r.nextDate || null;
  const last = r.history.length ? r.history.reduce((a, d) => (d > a ? d : a), r.history[0]) : null;
  const base = [last, r.resetAt].filter(Boolean).sort().pop();
  if (base) return dateKey(addByCadence(parseDate(base), r.cadence));
  return r.nextDate || todayKey();
}
function RoutineRow({ routine, onChange, onRemove, groupPaused }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const delCtl = confirmDel
    ? <><span className="hy-lab">delete?</span><button className="hy-link" onClick={onRemove}>yes</button><button className="hy-link" onClick={() => setConfirmDel(false)}>no</button></>
    : <button className="hy-x" style={{ color: "var(--muted)" }} aria-label="Remove" onClick={() => setConfirmDel(true)}>✕</button>;
  const paused = routine.paused || groupPaused;
  if (paused) return (
    <div className="hy-routine paused-card">
      <input className="hy-rname" value={routine.name} onChange={(e) => onChange({ ...routine, name: e.target.value })} aria-label="Routine name" />
      <span className="hy-pausebadge">paused</span>
      {!groupPaused && <button className="hy-link" onClick={() => onChange({ ...routine, paused: false, resetAt: todayKey() })}>resume</button>}
      {delCtl}
    </div>
  );
  const due = routineDue(routine); let status = "no date set", tone = "muted";
  if (due) { const dd = daysUntil(due), on = fmtShort(due); if (dd < 0) { status = `${on} · overdue ${-dd}d`; tone = "warn"; } else if (dd === 0) { status = `${on} · today`; tone = "warn"; } else { status = `${on} · in ${dd}d`; tone = "ok"; } }
  const markDone = () => { const t = todayKey(); const history = routine.history.includes(t) ? routine.history : [...routine.history, t]; const patch = { ...routine, history }; if (routine.mode === "date") patch.nextDate = null; onChange(patch); };
  return (
    <div className="hy-routine">
      <input className="hy-rname" value={routine.name} onChange={(e) => onChange({ ...routine, name: e.target.value })} aria-label="Routine name" />
      <select className="hy-sel" value={routine.mode} onChange={(e) => onChange({ ...routine, mode: e.target.value })} aria-label="Mode"><option value="cadence">every…</option><option value="date">on a date</option></select>
      {routine.mode === "cadence"
        ? <select className="hy-sel" value={routine.cadence} onChange={(e) => onChange({ ...routine, cadence: e.target.value })} aria-label="How often"><option value="weekly">week</option><option value="monthly">month</option><option value="yearly">year</option></select>
        : <input className="hy-date" type="date" value={routine.nextDate || ""} onChange={(e) => onChange({ ...routine, nextDate: e.target.value })} />}
      <span className={`hy-status ${tone}`}>{status}</span>
      <button className="hy-mini" onClick={markDone}>done</button>
      <button className="hy-link" onClick={() => onChange({ ...routine, paused: true })}>pause</button>
      {delCtl}
    </div>
  );
}
function RoutineGroup({ group, onChange, onRemove }) {
  const [draft, setDraft] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const setItem = (id, patch) => onChange({ ...group, items: group.items.map((it) => (it.id === id ? patch : it)) });
  const removeItem = (id) => onChange({ ...group, items: group.items.filter((it) => it.id !== id) });
  const addItem = () => { const n = draft.trim(); if (!n) return; onChange({ ...group, items: [...group.items, leaf(n, "weekly")] }); setDraft(""); };
  const dueCount = group.paused ? 0 : group.items.filter((it) => !it.paused).map(routineDue).filter((d) => d && daysUntil(d) <= 3).length;
  return (
    <div className="hy-group">
      <div className={`hy-group-head${group.paused ? " paused-card" : ""}`}>
        <button className="hy-disc" onClick={() => onChange({ ...group, collapsed: !group.collapsed })} aria-label={group.collapsed ? "Expand" : "Collapse"}>{group.collapsed ? "▸" : "▾"}</button>
        <input className="hy-cname" value={group.name} onChange={(e) => onChange({ ...group, name: e.target.value })} aria-label="Group name" />
        {group.paused ? <span className="hy-pausebadge">paused</span> : <span className="hy-meta">{group.items.length} item{group.items.length === 1 ? "" : "s"}{dueCount ? ` · ${dueCount} soon` : ""}</span>}
        <span style={{ flex: 1 }} />
        <button className="hy-link" onClick={() => group.paused
          ? onChange({ ...group, paused: false, items: group.items.map((it) => ({ ...it, resetAt: todayKey() })) })
          : onChange({ ...group, paused: true })}>{group.paused ? "resume" : "pause"}</button>
        {confirmDel
          ? <><span className="hy-lab">delete group?</span><button className="hy-link" onClick={onRemove}>yes</button><button className="hy-link" onClick={() => setConfirmDel(false)}>no</button></>
          : <button className="hy-x" style={{ color: "var(--muted)" }} aria-label="Remove group" onClick={() => setConfirmDel(true)}>✕</button>}
      </div>
      {!group.collapsed && (
        <div className="hy-group-items">
          {group.items.map((it) => <RoutineRow key={it.id} routine={it} groupPaused={group.paused} onChange={(v) => setItem(it.id, v)} onRemove={() => removeItem(it.id)} />)}
          {!group.paused && <div className="hy-add" style={{ marginTop: 8 }}><input className="hy-input" placeholder="add to this group…" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()} /></div>}
        </div>
      )}
    </div>
  );
}

function collectTargets(data) {
  const t = [];
  data.activities.forEach((a) => { if (!a.paused) t.push({ type: "activity", id: a.id, name: a.name, keys: [a.name, ...(a.aliases || [])] }); });
  data.routines.forEach((e) => {
    if (e.group) { if (!e.paused) e.items.forEach((it) => { if (!it.paused) t.push({ type: "routine", groupId: e.id, id: it.id, name: it.name, keys: [it.name, ...(it.aliases || [])] }); }); }
    else if (!e.paused) t.push({ type: "routine", id: e.id, name: e.name, keys: [e.name, ...(e.aliases || [])] });
  });
  data.projects.forEach((p) => { if (!p.paused) t.push({ type: "project", id: p.id, name: p.name, keys: [p.name, ...(p.aliases || [])] }); });
  return t;
}
function extractQty(low) {
  let minutes = null, count = null, m;
  if ((m = low.match(/(\d+(?:\.\d+)?)\s*(小时|時|时|hours?|hrs?|h)/))) minutes = parseFloat(m[1]) * 60;
  else if ((m = low.match(/(\d+(?:\.\d+)?)\s*(分钟|分鐘|分|minutes?|mins?|min|m)/))) minutes = parseFloat(m[1]);
  if ((m = low.match(/(\d+)\s*(次|回|times?|x)/))) count = parseInt(m[1], 10);
  return { minutes, count };
}
function rmLeaf(routines, id) {
  for (let i = 0; i < routines.length; i++) {
    const e = routines[i];
    if (e.group) { const j = e.items.findIndex((it) => it.id === id); if (j >= 0) { const lf = e.items[j]; const items = e.items.slice(); items.splice(j, 1); const r = routines.slice(); r[i] = { ...e, items }; return { routines: r, leaf: lf }; } }
    else if (e.id === id) { const r = routines.slice(); r.splice(i, 1); return { routines: r, leaf: e }; }
  }
  return { routines, leaf: null };
}

export default function HalfYear() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null); const [loaded, setLoaded] = useState(false);
  const [actDraft, setActDraft] = useState(""); const [projDraft, setProjDraft] = useState(""); const [routDraft, setRoutDraft] = useState("");
  const [quick, setQuick] = useState(""); const [feedback, setFeedback] = useState(null); const [undo, setUndo] = useState(null);
  const [edit, setEdit] = useState(false); const [dragId, setDragId] = useState(null);
  const [email, setEmail] = useState(""); const [authMsg, setAuthMsg] = useState("");
  const dragRef = useRef(null);

  useEffect(() => {
    let c = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user);
        try {
          const { data: rows } = await supabase.from("tracking_data").select("data").eq("user_id", session.user.id).single();
          if (rows?.data) { setData(normalize(rows.data)); }
          else { setData(normalize(SEED)); }
        } catch (e) {
          console.error("Load data error:", e);
          setData(normalize(SEED));
        }
        setLoaded(true);
      } else {
        setUser(null);
        setData(null);
        setLoaded(true);
      }
    });
    return () => {
      c = true;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!loaded || !data || !user) return;
    const t = setTimeout(async () => {
      try {
        await supabase.from("tracking_data").upsert({
          user_id: user.id,
          data: data,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      } catch (e) {
        console.error("Save data error:", e);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [data, loaded, user]);

  const sendMagicLink = async (e) => {
    e.preventDefault();
    if (!email) { setAuthMsg("Enter your email."); return; }
    setAuthMsg("Sending link…");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    if (error) { setAuthMsg(`Error: ${error.message}`); }
    else { setAuthMsg(`Check your email — we sent a login link to ${email}`); setEmail(""); }
  };
  const doLogout = async () => { await supabase.auth.signOut(); setUser(null); setData(null); };

  const applyMove = useCallback((zone, cont, targetId, after) => {
    const st = dragRef.current;
    if (!st) return;
    setData((prev) => {
      if (zone === "routines") {
        if (st.kind === "group") {
          if (cont !== "top") return prev;
          const from = prev.routines.findIndex((e) => e.id === st.id);
          if (from < 0) return prev;
          const r = prev.routines.slice();
          const [g] = r.splice(from, 1);
          let ti = r.findIndex((e) => e.id === targetId);
          if (ti < 0) { r.push(g); return { ...prev, routines: r }; }
          r.splice(after ? ti + 1 : ti, 0, g);
          return { ...prev, routines: r };
        }
        const { routines: r1, leaf: lf } = rmLeaf(prev.routines, st.id);
        if (!lf) return prev;
        if (cont === "top") {
          let ti = r1.findIndex((e) => e.id === targetId);
          if (ti < 0) ti = r1.length - 1;
          const r = r1.slice();
          r.splice(after ? ti + 1 : ti, 0, lf);
          return { ...prev, routines: r };
        }
        const gi = r1.findIndex((e) => e.group && e.id === cont);
        if (gi < 0) return prev;
        const items = r1[gi].items;
        let ti = items.findIndex((it) => it.id === targetId);
        const insert = ti < 0 ? items.length : (after ? ti + 1 : ti);
        const na = items.slice();
        na.splice(insert, 0, lf);
        const r = r1.slice();
        r[gi] = { ...r1[gi], items: na };
        return { ...prev, routines: r };
      }
      const key = zone === "sections" ? "sectionOrder" : zone === "body" ? "bodyOrder" : zone;
      const arr = prev[key].slice();
      const idOf = (zone === "sections" || zone === "body") ? (x) => x : (x) => x.id;
      const from = arr.findIndex((x) => idOf(x) === st.id);
      if (from < 0 || idOf(arr[from]) === targetId) return prev;
      const [x] = arr.splice(from, 1);
      let ti = arr.findIndex((y) => idOf(y) === targetId);
      if (ti < 0) return prev;
      arr.splice(after ? ti + 1 : ti, 0, x);
      return { ...prev, [key]: arr };
    });
  }, []);

  const applyEmpty = useCallback((cont) => {
    const st = dragRef.current;
    if (!st || st.kind !== "leaf") return;
    setData((prev) => {
      const { routines: r1, leaf: lf } = rmLeaf(prev.routines, st.id);
      if (!lf) return prev;
      const gi = r1.findIndex((e) => e.group && e.id === cont);
      if (gi < 0) return prev;
      const r = r1.slice();
      r[gi] = { ...r1[gi], items: [...r1[gi].items, lf] };
      return { ...prev, routines: r };
    });
  }, []);

  const onMove = useCallback((e) => {
    const st = dragRef.current;
    if (!st) return;
    e.preventDefault();
    const els = document.elementsFromPoint(e.clientX, e.clientY) || [];
    let target = null, empty = null;
    for (const el of els) {
      const ds = el.dataset;
      if (!ds) continue;
      if (ds.hyZone === st.zone && ds.hyId != null) { target = { cont: ds.hyCont ?? "-", id: ds.hyId, el }; break; }
      if (ds.hyZone === st.zone && ds.hyEmpty != null && empty == null) empty = { cont: ds.hyCont };
    }
    if (target) {
      if (target.id === st.id) return;
      const r = target.el.getBoundingClientRect();
      applyMove(st.zone, target.cont, target.id, e.clientY > r.top + r.height / 2);
    } else if (empty) {
      applyEmpty(empty.cont);
    }
  }, [applyMove, applyEmpty]);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragId(null);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
  }, [onMove]);

  const begin = useCallback((info) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = info;
    setDragId(info.id);
    try {
      e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  }, [onMove, endDrag]);

  if (!loaded) return (<div className="hy-root"><style>{CSS}</style><div className="hy-loading">gathering your pages…</div></div>);

  if (!user) {
    return (
      <div className="hy-root">
        <style>{CSS}</style>
        <div className="hy-wrap">
          <header>
            <div className="hy-eyebrow">2026 · your own pace</div>
            <h1 className="hy-title">The second half</h1>
            <p className="hy-note">Track the small things. Log sleep, weight, movement, savings, routines, and projects — all in one quiet place.</p>
          </header>
          <div className="hy-authpanel">
            <h2>Log in with email</h2>
            <form onSubmit={sendMagicLink}>
              <input className="hy-input" type="email" placeholder="your email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="hy-mini" style={{ marginTop: 8 }} type="submit">Send login link</button>
            </form>
            {authMsg && <div className="hy-authinfo">{authMsg}</div>}
          </div>
        </div>
      </div>
    );
  }

  const update = (coll, id, patch) => setData((p) => ({ ...p, [coll]: p[coll].map((x) => (x.id === id ? patch : x)) }));
  const remove = (coll, id) => setData((p) => ({ ...p, [coll]: p[coll].filter((x) => x.id !== id) }));
  const addAct = () => { const n = actDraft.trim(); if (!n) return; setData((p) => ({ ...p, activities: [...p.activities, { id: uid(), name: n, hasGoal: false, goalKind: "days", target: 0, deadline: "2026-12-31", defaultMin: 30, aliases: [], logs: [], paused: false }] })); setActDraft(""); };
  const addProj = () => { const n = projDraft.trim(); if (!n) return; setData((p) => ({ ...p, projects: [...p.projects, { id: uid(), name: n, stages: ["Start"], current: 0, sessions: [], aliases: [], paused: false }] })); setProjDraft(""); };
  const addRout = () => { const n = routDraft.trim(); if (!n) return; setData((p) => ({ ...p, routines: [...p.routines, leaf(n, "weekly")] })); setRoutDraft(""); };
  const addGroup = () => setData((p) => ({ ...p, routines: [...p.routines, { id: uid(), name: "New group", group: true, collapsed: false, paused: false, items: [] }] }));

  const doUndo = () => { if (undo) { setData(undo); setUndo(null); setFeedback({ type: "ok", msg: "Undone." }); } };
  const handleQuick = (text) => {
    const raw = (text || "").trim();
    if (!raw) return;
    const low = raw.toLowerCase();
    let best = null, bestLen = 0;
    collectTargets(data).forEach((t) => t.keys.forEach((k) => { if (k) { const kk = k.toLowerCase(); if (low.includes(kk) && kk.length > bestLen) { best = t; bestLen = kk.length; } } }));
    if (!best) { setFeedback({ type: "err", msg: `No match for "${raw}". Try an activity or routine name.` }); return; }
    const { minutes, count } = extractQty(low);
    let next = data, msg = "";
    if (best.type === "activity") {
      const a = data.activities.find((x) => x.id === best.id);
      const per = minutes != null ? minutes : (a.defaultMin || 0);
      const nlg = count || 1;
      const logs = [...a.logs];
      for (let i = 0; i < nlg; i++) logs.push({ id: uid(), date: todayKey(), minutes: per });
      next = { ...data, activities: data.activities.map((x) => (x.id === a.id ? { ...x, logs } : x)) };
      msg = `Logged ${nlg > 1 ? nlg + "× " : ""}${per ? fmtMinutes(per) : "a day"} to ${a.name}.`;
    } else if (best.type === "routine") {
      const t = todayKey();
      const mark = (it) => ({ ...it, history: it.history.includes(t) ? it.history : [...it.history, t], ...(it.mode === "date" ? { nextDate: null } : {}) });
      next = best.groupId
        ? { ...data, routines: data.routines.map((e) => (e.id === best.groupId ? { ...e, items: e.items.map((it) => (it.id === best.id ? mark(it) : it)) } : e)) }
        : { ...data, routines: data.routines.map((e) => (!e.group && e.id === best.id ? mark(e) : e)) };
      msg = `Marked ${best.name} done.`;
    } else {
      if (minutes == null) { setFeedback({ type: "err", msg: `How long? e.g. "${best.name} 30分钟".` }); return; }
      const p = data.projects.find((x) => x.id === best.id);
      next = { ...data, projects: data.projects.map((x) => (x.id === p.id ? { ...x, sessions: [...x.sessions, { id: uid(), date: todayKey(), minutes, note: "" }] } : x)) };
      msg = `Logged ${fmtMinutes(minutes)} to ${p.name}.`;
    }
    setUndo(data);
    setData(next);
    setFeedback({ type: "ok", msg });
    setQuick("");
  };

  const leaves = [];
  data.routines.forEach((e) => { if (e.group) { if (!e.paused) e.items.forEach((it) => { if (!it.paused) leaves.push(it); }); } else if (!e.paused) leaves.push(e); });
  const dueSoon = leaves.map((r) => ({ r, due: routineDue(r) })).filter((x) => x.due && daysUntil(x.due) <= 3).sort((a, b) => (a.due < b.due ? -1 : 1));

  const sectionContent = {
    body: (<><div className="hy-shead"><h2 className="hy-h2">Body</h2><span className="hy-meta">sleep &amp; weight, over time</span></div>
      {data.bodyOrder.map((k) => k === "sleep"
        ? <SleepCard key="sleep" sleep={data.sleep} onChange={(v) => setData((p) => ({ ...p, sleep: v }))} />
        : <WeightCard key="weight" weight={data.weight} onChange={(v) => setData((p) => ({ ...p, weight: v }))} />)}</>),
    savings: (<><div className="hy-shead"><h2 className="hy-h2">Savings</h2><span className="hy-meta">a jar of gold, silver &amp; bronze</span></div>
      <SavingsCard savings={data.savings} onChange={(v) => setData((p) => ({ ...p, savings: v }))} /></>),
    movement: (<><div className="hy-shead"><h2 className="hy-h2">Movement</h2><span className="hy-meta">by day, time, or kind</span></div>
      {data.activities.filter((a) => !a.paused).length > 0 && <MovementOverview activities={data.activities.filter((a) => !a.paused)} />}
      {data.activities.map((a) => <ActivityCard key={a.id} act={a} onChange={(v) => update("activities", a.id, v)} onRemove={() => remove("activities", a.id)} />)}
      <div className="hy-add"><input className="hy-input" placeholder="add an activity…" value={actDraft} onChange={(e) => setActDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addAct()} /></div></>),
    projects: (<><div className="hy-shead"><h2 className="hy-h2">Projects</h2><span className="hy-meta">time logged, stage by stage</span></div>
      {data.projects.map((pr) => <ProjectCard key={pr.id} project={pr} onChange={(v) => update("projects", pr.id, v)} onRemove={() => remove("projects", pr.id)} />)}
      <div className="hy-add"><input className="hy-input" placeholder="add a project…" value={projDraft} onChange={(e) => setProjDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addProj()} /></div></>),
    routines: (<><div className="hy-shead"><h2 className="hy-h2">Routines</h2><span className="hy-meta">grouped, on a rhythm or a set day</span></div>
      {data.routines.map((e) => e.group
        ? <RoutineGroup key={e.id} group={e} onChange={(v) => update("routines", e.id, v)} onRemove={() => remove("routines", e.id)} />
        : <RoutineRow key={e.id} routine={e} onChange={(v) => update("routines", e.id, v)} onRemove={() => remove("routines", e.id)} />)}
      <div className="hy-add"><input className="hy-input" placeholder="add a routine…" value={routDraft} onChange={(e) => setRoutDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addRout()} /><button className="hy-mini" onClick={addRout}>add</button><button className="hy-link" onClick={addGroup}>+ new group</button></div></>),
  };

  return (
    <div className="hy-root">
      <style>{CSS}</style>
      <div className="hy-wrap">
        <header>
          <div className="hy-topbar">
            <div className="hy-eyebrow">2026 · your own pace</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {user && <span style={{ fontSize: 12, color: MUT }}>{user.email}</span>}
              {edit
                ? <button className="hy-editbtn on" onClick={() => setEdit((v) => !v)}>Confirm</button>
                : <><button className={`hy-editbtn`} onClick={() => setEdit((v) => !v)}>Edit</button><button className="hy-link" onClick={doLogout}>log out</button></>}
            </div>
          </div>
          <h1 className="hy-title">The second half</h1>
          {edit
            ? <p className="hy-note" style={{ fontSize: 16 }}>Hold the ≡ handle and drag to reorder — sections, items, and things inside groups. Drag a routine onto a group to file it there, or out to loosen it. Press Confirm when you're done.</p>
            : <p className="hy-note">Log the small things as they happen. Tap any name to rename it. Pause anything you need a break from.</p>}
        </header>

        {edit ? (
          <div className="hy-outline">
            {data.sectionOrder.map((key) => (
              <React.Fragment key={key}>
                <OutRow zone="sections" id={key} kind="section" cls="sec" depth={0} label={SECTION_TITLE[key]} begin={begin} activeId={dragId} />
                {key === "body" && data.bodyOrder.map((k) => <OutRow key={k} zone="body" id={k} depth={1} label={BODY_TITLE[k]} begin={begin} activeId={dragId} />)}
                {key === "movement" && data.activities.map((a) => <OutRow key={a.id} zone="activities" id={a.id} depth={1} label={a.name || "untitled"} begin={begin} activeId={dragId} />)}
                {key === "projects" && data.projects.map((p) => <OutRow key={p.id} zone="projects" id={p.id} depth={1} label={p.name || "untitled"} begin={begin} activeId={dragId} />)}
                {key === "routines" && data.routines.map((e) => e.group
                  ? <React.Fragment key={e.id}>
                      <OutRow zone="routines" cont="top" id={e.id} kind="group" cls="grp" depth={1} label={e.name || "group"} begin={begin} activeId={dragId} />
                      {e.items.map((it) => <OutRow key={it.id} zone="routines" cont={e.id} id={it.id} kind="leaf" depth={2} label={it.name || "untitled"} begin={begin} activeId={dragId} />)}
                      {e.items.length === 0 && <div className="hy-outempty" data-hy-zone="routines" data-hy-empty="1" data-hy-cont={e.id}>· drop here ·</div>}
                    </React.Fragment>
                  : <OutRow key={e.id} zone="routines" cont="top" id={e.id} kind="leaf" depth={1} label={e.name || "untitled"} begin={begin} activeId={dragId} />)}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <>
            <div className="hy-quick">
              <div className="hy-quickbox">
                <input className="hy-qinput" value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleQuick(quick)} placeholder='say it plainly — "瑜伽 20分钟", "骑马1次", "浇完花了"' aria-label="Quick log" />
                <button className="hy-mini" onClick={() => handleQuick(quick)}>log</button>
              </div>
              {feedback
                ? <div className={`hy-qfb ${feedback.type}`}>{feedback.msg}{feedback.type === "ok" && undo && <> · <button className="hy-link" onClick={doUndo}>undo</button></>}</div>
                : <div className="hy-qhint">Type a name with minutes, hours, or "1次". A bare mention uses the activity's default length. Paused items are skipped.</div>}
            </div>

            {dueSoon.length > 0 && (
              <div className="hy-due"><h3>Coming up</h3>{dueSoon.map(({ r, due }) => { const d = daysUntil(due); const tail = d < 0 ? <b>overdue {-d}d</b> : d === 0 ? <b>today</b> : `in ${d}d`; return <div className="hy-due-item" key={r.id}>{r.name} — {fmtShort(due)}, {tail}</div>; })}</div>
            )}

            {data.sectionOrder.map((key) => <section className="hy-section" key={key}>{sectionContent[key]}</section>)}
          </>
        )}

        <p className="hy-foot">Steady is enough. Set aside what you need to; come back when you're ready.</p>
      </div>
    </div>
  );
}
