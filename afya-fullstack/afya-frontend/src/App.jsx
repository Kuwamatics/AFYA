import React, { useState, useEffect, useMemo } from "react";
import {
  Search, Star, ShieldCheck, MapPin, Video, Calendar, Check, X, Stethoscope,
  Wallet, LogOut, Send, Plus, Hourglass, Pill, FlaskConical, Bell, RefreshCw,
  User, FileText, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { api, setToken, getToken } from "./api.js";

const ksh = (n) => "KSh " + Math.round(n).toLocaleString();
const SPECIALTIES = ["All", "General Practice", "Pediatrics", "Mental Health", "Gynecology",
  "Nursing & Home Care", "Optometry", "Dermatology", "Cardiology", "Dentistry"];
const SLOTS = ["Today · 2:30 PM", "Tomorrow · 9:00 AM", "Tomorrow · 11:30 AM", "Thu · 10:00 AM", "Fri · 3:00 PM"];

/* ============================ ROOT ============================ */
export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!getToken()) { setBooting(false); return; }
    api.me().then((r) => setUser(r.user)).catch(() => setToken(null)).finally(() => setBooting(false));
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  const signOut = () => { setToken(null); setUser(null); };

  if (booting) return <div className="app"><div className="wrap"><p className="empty">Loading…</p></div></div>;

  return (
    <div className="app">
      <Header user={user} signOut={signOut} />
      {!user
        ? <Auth onAuthed={(u) => setUser(u)} toast={setToast} />
        : <Dashboard user={user} toast={setToast} />}
      {toast && <div className="toast"><Check size={15} /> {toast}</div>}
    </div>
  );
}

function Header({ user, signOut }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!user) return;
    api.notifications().then((rows) => setN(rows.filter((x) => !x.read).length)).catch(() => {});
  }, [user]);
  return (
    <header className="top">
      <div className="brand">
        <span className="mark"><Stethoscope size={18} strokeWidth={2.4} /></span>
        <span className="word">afya</span>
      </div>
      {user && (
        <div className="navright">
          <span className="rolebadge">{user.role}</span>
          <button className="iconbtn bell" title="Notifications">
            <Bell size={16} />{n > 0 && <span className="bell-dot">{n}</span>}
          </button>
          <div className="acct"><span className="acctname">{user.name?.split(" ")[0]}</span></div>
          <button className="iconbtn" title="Sign out" onClick={signOut}><LogOut size={16} /></button>
        </div>
      )}
    </header>
  );
}

/* ============================ AUTH (real) ============================ */
function Auth({ onAuthed, toast }) {
  const [mode, setMode] = useState("login");
  const [role, setRole] = useState("patient");
  const [f, setF] = useState({ name: "", email: "", password: "", specialty: "General Practice",
    county: "Nairobi", subcounty: "Westlands", ward: "", location: "", sublocation: "" });
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const signup = mode === "signup";

  const submit = async () => {
    setErr("");
    try {
      const r = signup
        ? await api.signup({ ...f, role, agree })
        : await api.login({ email: f.email, password: f.password });
      setToken(r.token);
      onAuthed(r.user);
      toast(signup ? "Account created — welcome to afya" : "Signed in");
    } catch (e) { setErr(e.message); }
  };

  return (
    <main className="wrap">
      <section className="hero">
        <p className="eyebrow"><ShieldCheck size={13} /> Verified care across Kenya · video or in person</p>
        <h1>{signup ? <>Join <em>afya.</em></> : <>Welcome <em>back.</em></>}</h1>
        <p className="sub">Sign in to book verified providers, manage prescriptions and lab orders, and message securely — all on afya.</p>
      </section>

      <div className="authcard">
        <div className="rolepick">
          <button className={role === "patient" ? "on" : ""} onClick={() => setRole("patient")}><User size={14} /> Patient</button>
          <button className={role === "provider" ? "on" : ""} onClick={() => setRole("provider")}><Stethoscope size={14} /> Provider</button>
        </div>

        {signup && <><label className="flabel">Full name</label>
          <input className="finput" value={f.name} onChange={set("name")} placeholder={role === "provider" ? "Dr. Jane Doe" : "Jane Doe"} /></>}
        {signup && role === "provider" && <><label className="flabel">Specialty</label>
          <select className="finput" value={f.specialty} onChange={set("specialty")}>
            {SPECIALTIES.filter((s) => s !== "All").map((s) => <option key={s}>{s}</option>)}
          </select></>}
        {signup && role === "patient" && <><label className="flabel">County / sub-county</label>
          <div className="medgrid">
            <input className="finput" value={f.county} onChange={set("county")} placeholder="County" />
            <input className="finput" value={f.subcounty} onChange={set("subcounty")} placeholder="Sub-county" />
          </div></>}

        <label className="flabel">Email</label>
        <input className="finput" value={f.email} onChange={set("email")} placeholder="you@email.com" />
        <label className="flabel">Password</label>
        <input className="finput" type="password" value={f.password} onChange={set("password")} placeholder="••••••••" />

        {signup && (
          <label className="agreebox">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I agree to keep bookings, payments and messaging on afya (non-circumvention).</span>
          </label>
        )}
        {err && <p className="autherr"><AlertTriangle size={13} /> {err}</p>}
        <button className="primary" onClick={submit}>{signup ? "Create account" : "Sign in"}</button>
        <p className="switch">
          {signup ? "Already have an account?" : "New to afya?"}{" "}
          <button className="linkbtn" onClick={() => { setMode(signup ? "login" : "signup"); setErr(""); }}>
            {signup ? "Sign in" : "Create one"}
          </button>
        </p>
        <p className="fineprint">Demo logins (password demo1234): mary@demo.com · amina@demo.com · admin@afya.co.ke · pharmacy@afya.co.ke · lab@afya.co.ke</p>
      </div>
    </main>
  );
}

/* ============================ DASHBOARD ROUTER ============================ */
function Dashboard({ user, toast }) {
  if (user.role === "patient") return <PatientView user={user} toast={toast} />;
  if (user.role === "provider") return <ProviderView user={user} toast={toast} />;
  if (user.role === "admin") return <AdminView toast={toast} />;
  if (user.role === "pharmacy") return <PharmacyView toast={toast} />;
  if (user.role === "lab") return <LabView toast={toast} />;
  return null;
}

/* ---------------- PATIENT ---------------- */
function PatientView({ user, toast }) {
  const [tab, setTab] = useState("browse");
  const [providers, setProviders] = useState([]);
  const [appts, setAppts] = useState([]);
  const [rx, setRx] = useState([]);
  const [labs, setLabs] = useState([]);
  const [spec, setSpec] = useState("All");
  const [maxPrice, setMaxPrice] = useState(10000);

  const load = () => {
    api.providers().then(setProviders).catch(() => {});
    api.appointments().then(setAppts).catch(() => {});
    api.prescriptions().then(setRx).catch(() => {});
    api.labs().then(setLabs).catch(() => {});
  };
  useEffect(load, []);

  const list = useMemo(() => providers.filter((p) =>
    (spec === "All" || p.specialty === spec) && p.price <= maxPrice), [providers, spec, maxPrice]);

  const book = async (p) => {
    try { await api.book({ providerId: p.id, slot: SLOTS[0], mode: "video", price: p.price });
      toast("Booked with " + p.name); load(); setTab("visits"); }
    catch (e) { toast(e.message); }
  };
  const cancel = async (id) => { await api.cancelAppt(id); toast("Cancelled"); load(); };
  const rate = async (id, s) => { await api.rateAppt(id, s); toast("Thanks for rating"); load(); };

  return (
    <main className="wrap">
      <div className="dashhead">
        <div><p className="hi">Hi {user.name.split(" ")[0]} 👋</p><h1 className="dashtitle">Your care</h1></div>
      </div>
      <div className="seg subnav">
        {[["browse", "Find care"], ["visits", "Visits"], ["rx", "Prescriptions"], ["labs", "Lab tests"]].map(([v, l]) =>
          <button key={v} className={tab === v ? "on" : ""} onClick={() => setTab(v)}>{l}</button>)}
      </div>

      {tab === "browse" && <>
        <div className="scale">
          <div className="scalehead"><span className="scalelabel"><Wallet size={14} /> Budget per visit</span><span className="scaleval">up to {ksh(maxPrice)}</span></div>
          <input type="range" min={1000} max={10000} step={500} value={maxPrice} onChange={(e) => setMaxPrice(+e.target.value)} className="slider" />
        </div>
        <div className="chips">{SPECIALTIES.map((s) => <button key={s} className={"chip" + (spec === s ? " sel" : "")} onClick={() => setSpec(s)}>{s}</button>)}</div>
        <p className="count">{list.length} provider{list.length !== 1 ? "s" : ""} available</p>
        <div className="grid">
          {list.map((p) => (
            <div key={p.id} className="card" style={{ cursor: "default" }}>
              <div className="cardtop"><span className="avatar" style={{ background: "#0f7a3d" }}>{(p.name.match(/[A-Z]/g) || ["A"]).slice(0, 2).join("")}</span><span className="verified"><ShieldCheck size={13} /> Verified</span></div>
              <h3>{p.name}</h3>
              <p className="spec">{p.specialty}</p>
              <p className="rate"><Star size={13} fill="#0f7a3d" stroke="none" /> {p.rating || "New"} <span>· {p.reviews} reviews</span></p>
              <p className="cardloc"><MapPin size={11} /> {p.subcounty}, {p.county}</p>
              <div className="cardfoot"><span className="price">{ksh(p.price)}<small>/ visit</small></span><button className="go" onClick={() => book(p)}>Book</button></div>
            </div>
          ))}
        </div>
        {list.length === 0 && <p className="empty">No providers match yet.</p>}
      </>}

      {tab === "visits" && <>
        <h3 className="sectlabel">Upcoming</h3>
        {appts.filter((a) => a.status === "upcoming").map((a) => (
          <div key={a.id} className="appt"><div className="apptmain"><h4>{a.slot}</h4><p className="apptmeta">{ksh(a.price)} · {a.mode}</p></div>
            <button className="ghost tiny" onClick={() => cancel(a.id)}>Cancel</button></div>
        ))}
        <h3 className="sectlabel">Past</h3>
        {appts.filter((a) => a.status === "completed").map((a) => (
          <div key={a.id} className="appt done"><div className="apptmain"><h4>{a.slot}</h4>
            {a.rating ? <p className="apptmeta">You rated {a.rating}★</p>
              : <div className="ratestars">Rate: {[1,2,3,4,5].map((s) => <button key={s} className="starbtn" onClick={() => rate(a.id, s)}><Star size={16} stroke="#0f7a3d" /></button>)}</div>}
          </div><span className="donetag"><Check size={12} /> Completed</span></div>
        ))}
        {appts.length === 0 && <p className="empty sm">No visits yet.</p>}
      </>}

      {tab === "rx" && <>
        <h3 className="sectlabel">Prescriptions</h3>
        {rx.map((r) => (
          <div key={r.id} className="rxcard"><div className="rxtop"><span className="rxicon"><Pill size={16} /></span>
            <div className="apptmain"><h4>{r.meds.map((m) => m.name).join(", ")}</h4><p className="apptmeta">{r.createdAt}</p></div>
            <span className="donetag"><Check size={12} /> {r.status}</span></div></div>
        ))}
        {rx.length === 0 && <p className="empty sm">No prescriptions yet.</p>}
      </>}

      {tab === "labs" && <>
        <h3 className="sectlabel">Lab tests</h3>
        {labs.map((l) => (
          <div key={l.id} className="rxcard"><div className="rxtop"><span className="rxicon lab"><FlaskConical size={16} /></span>
            <div className="apptmain"><h4>{l.tests.map((t) => t.name).join(", ")}</h4><p className="apptmeta">{l.createdAt}</p></div>
            <span className={"donetag" + (l.status === "Results ready" ? "" : " amber")}>{l.status}</span></div>
            {l.results && <div style={{ padding: "10px 14px" }}>{l.results.map((res, i) => <p key={i} className="rxmed"><b>{res.test}</b></p>)}</div>}
          </div>
        ))}
        {labs.length === 0 && <p className="empty sm">No lab orders yet.</p>}
      </>}
    </main>
  );
}

/* ---------------- PROVIDER ---------------- */
function ProviderView({ user, toast }) {
  const [appts, setAppts] = useState([]);
  const load = () => api.appointments().then(setAppts).catch(() => {});
  useEffect(load, []);
  const complete = async (id) => { await api.completeAppt(id); toast("Visit completed"); load(); };
  const noShow = async (id) => { await api.noShow(id); toast("Marked no-show"); load(); };

  const upcoming = appts.filter((a) => a.status === "upcoming");
  const done = appts.filter((a) => a.status === "completed" || a.status === "noshow");
  const earned = done.reduce((s, a) => s + a.price * (1 - (a.fee_rate ?? 0.2)), 0);

  return (
    <main className="wrap">
      <div className="dashhead"><div><p className="hi">Provider dashboard</p><h1 className="dashtitle">{user.name}</h1></div>
        <span className="verified big"><ShieldCheck size={14} /> Verified</span></div>
      <div className="stats">
        <div className="stat"><span className="statnum">{ksh(earned)}</span><span className="statlab">Earned (after fee)</span></div>
        <div className="stat"><span className="statnum">{done.length}</span><span className="statlab">Visits completed</span></div>
        <div className="stat"><span className="statnum">{upcoming.length}</span><span className="statlab">Upcoming</span></div>
      </div>
      <h3 className="sectlabel">Upcoming patients</h3>
      {upcoming.map((a) => (
        <div key={a.id} className="appt"><div className="apptmain"><h4>Patient visit</h4><p className="apptmeta">{a.slot} · {ksh(a.price)}</p></div>
          <div className="apptactions"><button className="primary tiny" onClick={() => complete(a.id)}><Check size={14} /> Complete</button>
            <button className="ghost tiny" onClick={() => noShow(a.id)}>No-show</button></div></div>
      ))}
      {upcoming.length === 0 && <p className="empty sm">No upcoming bookings.</p>}
    </main>
  );
}

/* ---------------- ADMIN ---------------- */
function AdminView({ toast }) {
  const [provs, setProvs] = useState([]);
  const [ctrl, setCtrl] = useState(null);
  const load = () => { api.adminProviders().then(setProvs).catch(() => {}); api.controlled().then(setCtrl).catch(() => {}); };
  useEffect(load, []);
  const verify = async (id) => { await api.verifyProvider(id); toast("Provider verified"); load(); };
  const reject = async (id) => { await api.rejectProvider(id); toast("Declined"); load(); };
  const pending = provs.filter((p) => !p.verified && !p.rejected);

  return (
    <main className="wrap">
      <div className="dashhead"><div><p className="hi">Platform admin</p><h1 className="dashtitle">Operations</h1></div></div>
      {ctrl && <div className="stats">
        <div className="stat"><span className="statnum">{ctrl.prescriptions.length}</span><span className="statlab">Prescriptions</span></div>
        <div className="stat"><span className="statnum">{ctrl.integrity.blockedContactAttempts}</span><span className="statlab">Contact attempts blocked</span></div>
        <div className="stat"><span className="statnum">{provs.filter((p) => p.verified).length}</span><span className="statlab">Live providers</span></div>
      </div>}
      <h3 className="sectlabel">Awaiting verification ({pending.length})</h3>
      {pending.map((p) => (
        <div key={p.id} className="appt"><div className="apptmain"><h4>{p.name}</h4><p className="apptmeta">{p.specialty} · {p.subcounty}, {p.county}</p></div>
          <div className="apptactions"><button className="primary tiny" onClick={() => verify(p.id)}>Verify</button>
            <button className="ghost tiny" onClick={() => reject(p.id)}>Decline</button></div></div>
      ))}
      {pending.length === 0 && <p className="empty sm">No providers awaiting verification.</p>}
      <h3 className="sectlabel">All providers</h3>
      {provs.map((p) => (
        <div key={p.id} className={"appt" + (p.verified ? "" : " done")}><div className="apptmain"><h4>{p.name}</h4><p className="apptmeta">{p.specialty}</p></div>
          {p.verified ? <span className="donetag"><ShieldCheck size={12} /> Live</span> : <span className="donetag amber"><Hourglass size={12} /> Pending</span>}</div>
      ))}
    </main>
  );
}

/* ---------------- PHARMACY ---------------- */
function PharmacyView({ toast }) {
  const [rx, setRx] = useState([]);
  const load = () => api.prescriptions().then(setRx).catch(() => {});
  useEffect(load, []);
  const setStatus = async (id, status) => { await api.setRxStatus(id, status); toast("Marked " + status.toLowerCase()); load(); };
  return (
    <main className="wrap">
      <div className="dashhead"><div><p className="hi">Pharmacy portal</p><h1 className="dashtitle">Prescription queue</h1></div></div>
      {rx.map((r) => (
        <div key={r.id} className="rxcard"><div className="rxtop"><span className="rxicon"><Pill size={16} /></span>
          <div className="apptmain"><h4>{r.meds.map((m) => m.name + (m.dose ? " " + m.dose : "")).join(", ")}</h4><p className="apptmeta">{r.createdAt}</p></div>
          <span className={"donetag" + (r.status === "Collected" ? "" : " amber")}>{r.status}</span></div>
          <div className="apptactions end">
            {r.status === "Sent to pharmacy" && <button className="primary tiny" onClick={() => setStatus(r.id, "Ready for pickup")}>Mark ready</button>}
            {r.status === "Ready for pickup" && <button className="ghost tiny" onClick={() => setStatus(r.id, "Collected")}>Mark collected</button>}
          </div></div>
      ))}
      {rx.length === 0 && <p className="empty sm">No prescriptions in the queue.</p>}
    </main>
  );
}

/* ---------------- LAB ---------------- */
function LabView({ toast }) {
  const [labs, setLabs] = useState([]);
  const load = () => api.labs().then(setLabs).catch(() => {});
  useEffect(load, []);
  const advance = async (l) => {
    if (l.status === "Awaiting sample") { await api.setLabStatus(l.id, "Processing"); }
    else if (l.status === "Processing") {
      const results = l.tests.map((t) => ({ test: t.name, rows: [{ a: t.name, v: "Within range", u: "", r: "—", f: "normal" }] }));
      await api.setLabStatus(l.id, "Results ready", results);
    }
    toast("Updated"); load();
  };
  return (
    <main className="wrap">
      <div className="dashhead"><div><p className="hi">Lab portal</p><h1 className="dashtitle">Lab orders</h1></div></div>
      {labs.map((l) => (
        <div key={l.id} className="rxcard"><div className="rxtop"><span className="rxicon lab"><FlaskConical size={16} /></span>
          <div className="apptmain"><h4>{l.tests.map((t) => t.name).join(", ")}</h4><p className="apptmeta">{l.createdAt}</p></div>
          <span className={"donetag" + (l.status === "Results ready" ? "" : " amber")}>{l.status}</span></div>
          {l.status !== "Results ready" && <div className="apptactions end"><button className="primary tiny" onClick={() => advance(l)}>
            {l.status === "Awaiting sample" ? "Sample collected" : "Publish results"}</button></div>}
        </div>
      ))}
      {labs.length === 0 && <p className="empty sm">No lab orders.</p>}
    </main>
  );
}
