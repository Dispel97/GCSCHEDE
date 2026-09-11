import { useEffect, useState, useCallback, useRef, createContext, useContext } from "react";
import axios from "axios";
import { Toaster, toast } from "sonner";
import {
  Upload, FileText, Copy, Mail, Trash2, Image as ImageIcon,
  Loader2, Search, ChevronDown, ChevronUp, Save, X, Camera, RotateCcw,
  LogOut, Shield, UserCheck, UserX, Users, ScanLine, LogIn, UserPlus,
  Package, RefreshCw, Calendar, CheckCircle2, PauseCircle, Warehouse,
} from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const RECIPIENTS = [
  "g.c.impiantiufficio@gmail.com",
  "g.c.impiantisnc4@gmail.com",
  "giuseppe.abbatiscianni@circet.it",
  "dario.naviglio@circet.it",
  "vito.lalario@circet.it",
];

const LOGO_GC = "https://customer-assets-jai6qajn.emergentagent.net/job_ccf322e9-af2b-47ac-bdda-c765aa29fe4c/artifacts/26fm2fx6_1682096608045.jpeg";
const LOGO_OF = "https://customer-assets-jai6qajn.emergentagent.net/job_ccf322e9-af2b-47ac-bdda-c765aa29fe4c/artifacts/hfc42618_Open_Fiber_logo.svg.png";

const composeNote = (n) => {
  const parts = [
    n.splitter || "", n.via || "",
    n.pte_est ?? "PTE-EST",
    `PFS ${n.n_porta_perm || ""}`, `PTE ${n.porta_pte || ""}`,
    n.ts ?? "TS", n.tc ?? "TC", n.d ?? "D", n.a ?? "A",
    n.mono ?? "MONO", n.internal ?? "INT",
  ].filter((p) => p !== undefined && p !== null && String(p).trim() !== "");
  return `WR: ${n.wr || ""}\n${(n.cliente || "").toLowerCase()}\n${n.olo || ""}\n${parts.join(" ")}\nCPE: ${n.cpe || ""}\n(ONT/SFP): ${n.ont_sfp || ""}`;
};

const errorText = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(" ");
  if (d && typeof d.msg === "string") return d.msg;
  return e?.message || "Errore";
};

// ---------- Axios interceptor ----------
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem("gc_token");
  if (token) config.headers["Authorization"] = `Bearer ${token}`;
  return config;
});

// ---------- Auth Context ----------
const AuthCtx = createContext(null);
function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=loading, false=guest, obj=auth
  useEffect(() => {
    const token = localStorage.getItem("gc_token");
    if (!token) { setUser(false); return; }
    axios.get(`${API}/auth/me`).then((r) => setUser(r.data)).catch(() => { localStorage.removeItem("gc_token"); setUser(false); });
  }, []);
  const login = async (email, password) => {
    const r = await axios.post(`${API}/auth/login`, { email, password });
    localStorage.setItem("gc_token", r.data.access_token);
    setUser(r.data.user);
  };
  const register = async (email, password, name) => {
    const r = await axios.post(`${API}/auth/register`, { email, password, name });
    return r.data;
  };
  const logout = () => { localStorage.removeItem("gc_token"); setUser(false); };
  return <AuthCtx.Provider value={{ user, setUser, login, register, logout }}>{children}</AuthCtx.Provider>;
}
const useAuth = () => useContext(AuthCtx);

// ---------- Header ----------
function Header({ onAdmin, showAdminBtn, page, onPageChange, canSwitchPage }) {
  const { user, logout } = useAuth();
  return (
    <header className="bg-white border-b border-slate-200" data-testid="header-admin-bar">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <img src={LOGO_GC} alt="GC Impianti SNC" className="h-10 sm:h-12 w-auto object-contain rounded" data-testid="logo-gc" />
          <div className="hidden sm:block h-8 w-px bg-slate-200" />
          <img src={LOGO_OF} alt="Open Fiber" className="h-8 sm:h-10 w-auto object-contain" data-testid="logo-openfiber" />
        </div>
        <div className="ml-auto text-right">
          <h1 className="text-lg sm:text-xl font-display font-extrabold tracking-tight text-slate-900" data-testid="app-title">
            {page === "warehouse" ? "Magazzino Modem" : "Gestione Pratiche & Note"}
          </h1>
          <p className="text-xs sm:text-[13px] text-slate-500 font-medium">
            creato e amministrato da <span className="text-slate-800 font-semibold">Giuseppe Belviso</span>
          </p>
        </div>
        {user && (
          <div className="w-full flex items-center gap-2 pt-2 border-t border-slate-100 flex-wrap" data-testid="user-bar">
            <div className="text-xs text-slate-600 truncate">
              <span className="font-semibold text-slate-800">{user.email}</span>
              {user.role === "admin" && <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold text-brand-pink brand-pink"><Shield size={10} /> ADMIN</span>}
              {user.role === "magazzino" && <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded"><Warehouse size={10} /> MAGAZZINO</span>}
            </div>
            {canSwitchPage && (
              <div className="ml-auto flex gap-1 bg-slate-100 rounded-full p-1" data-testid="page-switcher">
                <button onClick={() => onPageChange("notes")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1 transition ${page === "notes" ? "bg-white text-slate-900 shadow" : "text-slate-500 hover:text-slate-800"}`}
                  data-testid="nav-notes">
                  <FileText size={12} /> Note
                </button>
                <button onClick={() => onPageChange("warehouse")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1 transition ${page === "warehouse" ? "bg-white text-slate-900 shadow" : "text-slate-500 hover:text-slate-800"}`}
                  data-testid="nav-warehouse">
                  <Warehouse size={12} /> Magazzino
                </button>
              </div>
            )}
            <div className={`${canSwitchPage ? "" : "ml-auto"} flex gap-2`}>
              {showAdminBtn && (
                <button onClick={onAdmin} className="btn-ghost text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-full px-3 py-1.5 inline-flex items-center gap-1" data-testid="btn-admin-panel">
                  <Users size={14} /> Admin
                </button>
              )}
              <button onClick={logout} className="btn-ghost text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-full px-3 py-1.5 inline-flex items-center gap-1" data-testid="btn-logout">
                <LogOut size={14} /> Esci
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

// ---------- Auth Screen ----------
function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email, password);
        toast.success("Accesso effettuato");
      } else {
        await register(email, password, name);
        toast.success("Registrazione inviata! Attendi l'approvazione dell'amministratore.");
        setMode("login");
      }
    } catch (e) {
      toast.error(errorText(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl card-shadow p-6 sm:p-8" data-testid="auth-card">
        <div className="flex items-center gap-3 mb-6">
          <img src={LOGO_GC} alt="GC" className="h-10 rounded" />
          <div className="h-8 w-px bg-slate-200" />
          <img src={LOGO_OF} alt="Open Fiber" className="h-8" />
        </div>
        <h1 className="text-2xl font-display font-extrabold text-slate-900 mb-1">
          {mode === "login" ? "Accedi" : "Crea account"}
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          {mode === "login" ? "Entra con la tua email e password" : "La registrazione richiede l'approvazione dell'amministratore"}
        </p>
        <form onSubmit={submit} className="space-y-3">
          {mode === "register" && (
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Nome (opzionale)</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-pink"
                data-testid="input-name" />
            </label>
          )}
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-pink"
              data-testid="input-email" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Password</span>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-pink"
              data-testid="input-password" />
          </label>
          <button type="submit" disabled={busy}
            className="btn-primary rounded-full w-full py-3 text-sm font-semibold inline-flex items-center justify-center gap-2"
            data-testid={mode === "login" ? "btn-login" : "btn-register"}>
            {busy ? <Loader2 className="animate-spin" size={16} /> : (mode === "login" ? <LogIn size={16} /> : <UserPlus size={16} />)}
            {mode === "login" ? "Accedi" : "Registrati"}
          </button>
        </form>
        <div className="mt-5 text-center text-sm text-slate-600">
          {mode === "login" ? (
            <>Non hai un account? <button onClick={() => setMode("register")} className="brand-pink font-semibold hover:underline" data-testid="switch-register">Registrati</button></>
          ) : (
            <>Hai già un account? <button onClick={() => setMode("login")} className="brand-pink font-semibold hover:underline" data-testid="switch-login">Accedi</button></>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Admin Panel ----------
function AdminPanel({ onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try { const r = await axios.get(`${API}/auth/admin/users`); setUsers(r.data); }
    catch (e) { toast.error(errorText(e)); } finally { setLoading(false); }
  };
  useEffect(() => { fetchUsers(); }, []);

  const approve = async (id, role) => { try { await axios.post(`${API}/auth/admin/approve/${id}`, { role }); toast.success(`Utente approvato come ${role === "magazzino" ? "Magazzino" : "Tecnico"}`); fetchUsers(); } catch (e) { toast.error(errorText(e)); } };
  const setRole = async (id, role) => { try { await axios.post(`${API}/auth/admin/set-role/${id}`, { role }); toast.success("Ruolo aggiornato"); fetchUsers(); } catch (e) { toast.error(errorText(e)); } };
  const revoke = async (id) => { try { await axios.post(`${API}/auth/admin/revoke/${id}`); toast.success("Approvazione revocata"); fetchUsers(); } catch (e) { toast.error(errorText(e)); } };
  const del = async (id, email) => {
    if (!window.confirm(`Eliminare definitivamente ${email} e tutte le sue note?`)) return;
    try { await axios.delete(`${API}/auth/admin/users/${id}`); toast.success("Utente eliminato"); fetchUsers(); } catch (e) { toast.error(errorText(e)); }
  };

  const pending = users.filter((u) => !u.is_approved && u.role !== "admin");
  const approved = users.filter((u) => u.is_approved || u.role === "admin");

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-start sm:items-center justify-center p-3 overflow-y-auto" onClick={onClose} data-testid="admin-modal">
      <div className="bg-white rounded-2xl max-w-3xl w-full my-4 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center gap-3 z-10">
          <Users size={18} className="brand-pink" />
          <h2 className="text-lg font-display font-bold">Pannello amministratore</h2>
          <button onClick={onClose} className="ml-auto btn-ghost rounded-full p-1.5 hover:bg-slate-100" data-testid="close-admin"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-6">
          {loading && <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="animate-spin" size={16} /> Caricamento…</div>}
          <section data-testid="pending-section">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">In attesa di approvazione ({pending.length})</h3>
            {pending.length === 0 ? (
              <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg p-4 text-center">Nessuna richiesta in attesa</div>
            ) : (
              <div className="space-y-2">
                {pending.map((u) => (
                  <div key={u.id} className="border border-slate-200 rounded-xl p-3 flex items-center gap-3 flex-wrap" data-testid={`pending-${u.email}`}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900 truncate">{u.email}</div>
                      <div className="text-xs text-slate-500">{u.name || "—"} • {new Date(u.created_at).toLocaleString("it-IT")}</div>
                    </div>
                    <button onClick={() => approve(u.id, "user")} className="btn-primary rounded-full px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1" data-testid={`approve-user-${u.email}`}><UserCheck size={12} /> Tecnico</button>
                    <button onClick={() => approve(u.id, "magazzino")} className="rounded-full px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white inline-flex items-center gap-1 hover:bg-slate-800" data-testid={`approve-magazzino-${u.email}`}><Warehouse size={12} /> Magazzino</button>
                    <button onClick={() => del(u.id, u.email)} className="btn-ghost rounded-full px-3 py-1.5 text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 inline-flex items-center gap-1" data-testid={`reject-${u.email}`}><UserX size={12} /> Rifiuta</button>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section data-testid="approved-section">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Utenti attivi ({approved.length})</h3>
            <div className="space-y-2">
              {approved.map((u) => (
                <div key={u.id} className="border border-slate-200 rounded-xl p-3 flex items-center gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {u.email}{" "}
                      {u.role === "admin" && <span className="ml-1 text-[10px] font-bold text-brand-pink brand-pink">ADMIN</span>}
                      {u.role === "magazzino" && <span className="ml-1 text-[10px] font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">MAGAZZINO</span>}
                      {u.role === "user" && <span className="ml-1 text-[10px] font-bold text-slate-500">TECNICO</span>}
                    </div>
                    <div className="text-xs text-slate-500">{u.name || "—"} • {new Date(u.created_at).toLocaleString("it-IT")}</div>
                  </div>
                  {u.role !== "admin" && (
                    <>
                      <select value={u.role} onChange={(e) => setRole(u.id, e.target.value)}
                        className="text-xs rounded-full border border-slate-200 bg-white px-2 py-1.5"
                        data-testid={`role-select-${u.email}`}>
                        <option value="user">Tecnico</option>
                        <option value="magazzino">Magazzino</option>
                      </select>
                      <button onClick={() => revoke(u.id)} className="btn-ghost rounded-full px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 inline-flex items-center gap-1"><UserX size={12} /> Sospendi</button>
                      <button onClick={() => del(u.id, u.email)} className="btn-ghost rounded-full px-3 py-1.5 text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 inline-flex items-center gap-1"><Trash2 size={12} /> Elimina</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ---------- Barcode Scanner Modal ----------
function ScannerModal({ onClose, onScan, target, setTarget }) {
  const containerId = "gc-scanner";
  const ref = useRef(null);

  useEffect(() => {
    if (!target) return;
    let stopped = false;
    const q = new Html5Qrcode(containerId, { formatsToSupport: [
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.DATA_MATRIX,
    ] });
    ref.current = q;
    q.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 260, height: 160 } },
      async (decoded) => {
        if (stopped) return;
        stopped = true;
        // Try to grab a snapshot of the current video frame as a File for the note photos
        let snapshot = null;
        try {
          const video = document.querySelector(`#${containerId} video`);
          if (video && video.videoWidth) {
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            canvas.getContext("2d").drawImage(video, 0, 0);
            const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
            if (blob) snapshot = new File([blob], `scan_${target}_${Date.now()}.jpg`, { type: "image/jpeg" });
          }
        } catch (_) { /* ignore snapshot errors */ }
        onScan(decoded, target, snapshot);
        q.stop().then(() => q.clear()).catch(() => {});
      },
      () => {}).catch((err) => toast.error("Impossibile avviare la fotocamera: " + err));
    return () => {
      stopped = true;
      try { q.stop().then(() => q.clear()).catch(() => {}); } catch (_) {}
    };
  }, [target, onScan]);

  return (
    <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-start sm:items-center justify-center p-3" onClick={onClose} data-testid="scanner-modal">
      <div className="bg-white rounded-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3">
          <ScanLine size={18} className="brand-pink" />
          <h3 className="text-base font-display font-bold">Scansiona seriale modem</h3>
          <button onClick={onClose} className="ml-auto btn-ghost rounded-full p-1.5 hover:bg-slate-100" data-testid="close-scanner"><X size={18} /></button>
        </div>
        <div className="p-4">
          {!target ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 mb-2">In quale campo vuoi inserire il codice scansionato?</p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setTarget("cpe")} className="border border-slate-200 rounded-xl px-4 py-6 hover:border-brand-pink hover:bg-pink-50 text-center transition" data-testid="scan-target-cpe">
                  <div className="text-lg font-display font-extrabold text-slate-900">CPE</div>
                  <div className="text-xs text-slate-500 mt-0.5">Seriale modem</div>
                </button>
                <button onClick={() => setTarget("ont_sfp")} className="border border-slate-200 rounded-xl px-4 py-6 hover:border-brand-pink hover:bg-pink-50 text-center transition" data-testid="scan-target-ont">
                  <div className="text-lg font-display font-extrabold text-slate-900">ONT / SFP</div>
                  <div className="text-xs text-slate-500 mt-0.5">Seriale ONT</div>
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div id={containerId} style={{ width: "100%" }} />
              <p className="text-xs text-slate-500 mt-3">Inquadra il codice a barre o QR — verrà inserito nel campo <strong>{target === "cpe" ? "CPE" : "ONT / SFP"}</strong></p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- PDF Uploader ----------
function PdfUploader({ onParsed }) {
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) { toast.error("Seleziona un file PDF valido"); return; }
    setLoading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await axios.post(`${API}/pdf/parse`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      const { created_count, skipped_wr } = res.data;
      if (created_count === 0) toast.warning("Nessuna pratica con WR numerico trovata");
      else toast.success(`${created_count} nota/note create`);
      if (skipped_wr && skipped_wr.length) toast.message(`WR non numerici saltati: ${skipped_wr.join(", ")}`);
      onParsed?.();
    } catch (e) { toast.error(errorText(e)); }
    finally { setLoading(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  return (
    <div className={`dropzone ${drag ? "drag" : ""} p-6 sm:p-8 text-center`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files?.[0]); }}
      data-testid="pdf-upload-dropzone">
      <div className="flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-brand-pink/10 flex items-center justify-center brand-pink">
          {loading ? <Loader2 className="animate-spin" size={26} /> : <Upload size={26} />}
        </div>
        <div>
          <div className="text-base sm:text-lg font-semibold text-slate-900">Carica la pratica Open Fiber (PDF)</div>
          <div className="text-sm text-slate-500 mt-1">Trascina qui il file o clicca per selezionarlo.</div>
        </div>
        <input ref={inputRef} type="file" accept="application/pdf" className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])} data-testid="upload-pdf-input" />
        <button onClick={() => inputRef.current?.click()} disabled={loading}
          className="btn-primary rounded-full px-5 py-2.5 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
          data-testid="upload-pdf-button">
          <FileText size={16} /> {loading ? "Analisi…" : "Seleziona PDF"}
        </button>
      </div>
    </div>
  );
}

// ---------- Photo Manager (with camera capture) ----------
function PhotoManager({ note, onChanged }) {
  const [uploading, setUploading] = useState(false);
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);

  const upload = async (files) => {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("files", f));
      await axios.post(`${API}/notes/${note.id}/photos`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Foto caricate");
      onChanged?.();
    } catch (e) { toast.error(errorText(e)); }
    finally { setUploading(false); if (galleryRef.current) galleryRef.current.value = ""; if (cameraRef.current) cameraRef.current.value = ""; }
  };

  const removePhoto = async (pid) => {
    try { await axios.delete(`${API}/notes/${note.id}/photos/${pid}`); toast.success("Foto rimossa"); onChanged?.(); }
    catch (e) { toast.error(errorText(e)); }
  };

  return (
    <div data-testid={`photo-manager-${note.wr}`}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <ImageIcon size={16} className="brand-pink" /> Foto ({note.photos?.length || 0})
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => upload(e.target.files)} data-testid={`photo-camera-${note.wr}`} />
          <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => upload(e.target.files)} data-testid={`photo-gallery-${note.wr}`} />
          <button onClick={() => cameraRef.current?.click()} disabled={uploading}
            className="text-xs font-semibold bg-slate-900 text-white rounded-full px-3 py-1.5 inline-flex items-center gap-1 hover:bg-slate-800 disabled:opacity-60"
            data-testid={`photo-camera-button-${note.wr}`}>
            {uploading ? <Loader2 className="animate-spin" size={12} /> : <Camera size={12} />} Scatta foto
          </button>
          <button onClick={() => galleryRef.current?.click()} disabled={uploading}
            className="text-xs font-semibold bg-slate-100 text-slate-900 rounded-full px-3 py-1.5 inline-flex items-center gap-1 hover:bg-slate-200 disabled:opacity-60"
            data-testid={`photo-gallery-button-${note.wr}`}>
            <ImageIcon size={12} /> Galleria
          </button>
        </div>
      </div>
      {note.photos?.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {note.photos.map((p) => (
            <div key={p.id} className="relative group">
              <img src={`${API}/files?path=${encodeURIComponent(p.storage_path)}`} alt={p.filename}
                className="photo-thumb w-full" loading="lazy" />
              <button onClick={() => removePhoto(p.id)}
                className="absolute top-1 right-1 rounded-full bg-black/70 text-white p-1 opacity-0 group-hover:opacity-100 transition"
                data-testid={`photo-delete-${p.id}`}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg p-3 text-center">
          Nessuna foto — usa "Scatta foto" per usare la fotocamera o "Galleria" per selezionare
        </div>
      )}
    </div>
  );
}

// ---------- Note Card ----------
function NoteCard({ note, onChanged, defaultOpen, selected, onToggleSelect, onOpenScanner }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState(note);
  const [saving, setSaving] = useState(false);
  const [noteDraft, setNoteDraft] = useState(note.note_text || composeNote(note));
  const [noteDirty, setNoteDirty] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setForm(note);
    if (!noteDirty) setNoteDraft(note.note_text || composeNote(note));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note]);

  useEffect(() => {
    if (edit && !noteDirty && !note.note_text_manual) setNoteDraft(composeNote(form));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, edit]);

  const noteText = noteDraft;

  const copy = async () => {
    try { await navigator.clipboard.writeText(noteText); toast.success("Nota copiata negli appunti!"); }
    catch { toast.error("Copia non riuscita"); }
  };

  const sendGmail = async () => {
    const subject = `WR: ${note.wr}`;
    const to = RECIPIENTS.join(",");
    const ua = navigator.userAgent || "";
    const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
    setSending(true);
    try {
      // Sempre copia i destinatari negli appunti
      try { await navigator.clipboard.writeText(RECIPIENTS.join(", ")); } catch (_) {}

      // Raccogli i file (PDF + foto)
      const files = [];
      try {
        if (note.pdf_storage_path) {
          const r = await fetch(`${API}/files?path=${encodeURIComponent(note.pdf_storage_path)}`);
          if (r.ok) { const b = await r.blob(); files.push(new File([b], note.pdf_filename || `pratica_WR_${note.wr}.pdf`, { type: "application/pdf" })); }
        }
        for (const p of note.photos || []) {
          const r = await fetch(`${API}/files?path=${encodeURIComponent(p.storage_path)}`);
          if (r.ok) { const b = await r.blob(); files.push(new File([b], p.filename || `foto_${p.id}.jpg`, { type: p.content_type || "image/jpeg" })); }
        }
      } catch (fe) { console.warn("fetch attachments failed", fe); }

      // Su mobile con file: Web Share (share sheet → l'utente sceglie l'app Gmail con foto già allegate)
      if (isMobile && files.length && navigator.canShare) {
        const shareData = { title: subject, text: noteText, files };
        try {
          if (navigator.canShare(shareData)) {
            await navigator.share(shareData);
            toast.success("Condivisione aperta — scegli Gmail. Destinatari negli appunti: incollali nel campo A:");
            setSending(false); return;
          }
        } catch (err) {
          if (err && err.name === "AbortError") { setSending(false); return; }
          console.warn("Web Share failed", err);
        }
      }

      // Mobile senza file (o Web Share non disponibile): mailto: apre l'app Gmail nativa con destinatari, oggetto, corpo
      if (isMobile) {
        window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(noteText)}`;
        toast.message("Apertura Gmail…" + (files.length ? " Aggiungi manualmente le foto dopo." : ""));
        setSending(false); return;
      }

      // Desktop: Gmail Web
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(noteText)}`;
      const a = document.createElement("a"); a.href = gmailUrl; a.target = "_blank"; a.rel = "noopener noreferrer";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      toast.message("Gmail aperto — allega manualmente PDF e foto");
    } finally { setSending(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        cliente: form.cliente, olo: form.olo, splitter: form.splitter,
        via: form.via, n_porta_perm: form.n_porta_perm, porta_pte: form.porta_pte,
        cpe: form.cpe, ont_sfp: form.ont_sfp, indirizzo: form.indirizzo,
        pte_est: form.pte_est ?? "PTE-EST",
        ts: form.ts ?? "TS", tc: form.tc ?? "TC", d: form.d ?? "D", a: form.a ?? "A",
        mono: form.mono ?? "MONO", internal: form.internal ?? "INT",
      };
      if (noteDirty) { payload.note_text = noteDraft; payload.note_text_manual = true; }
      else payload.note_text_manual = false;
      await axios.patch(`${API}/notes/${note.id}`, payload);
      toast.success("Nota salvata"); setNoteDirty(false); setEdit(false); onChanged?.();
    } catch (e) { toast.error(errorText(e)); }
    finally { setSaving(false); }
  };

  const regenerate = async () => {
    try { const r = await axios.post(`${API}/notes/${note.id}/regenerate`); setNoteDraft(r.data.note_text); setNoteDirty(false); toast.success("Nota rigenerata"); onChanged?.(); }
    catch (e) { toast.error(errorText(e)); }
  };

  const del = async () => {
    if (!window.confirm("Eliminare questa nota?")) return;
    try { await axios.delete(`${API}/notes/${note.id}`); toast.success("Nota eliminata"); onChanged?.(); }
    catch (e) { toast.error(errorText(e)); }
  };

  const applyScan = async (value, target, snapshot) => {
    setForm((f) => ({ ...f, [target]: value }));
    setEdit(true);
    toast.success(`Codice inserito in ${target === "cpe" ? "CPE" : "ONT/SFP"}`);
    if (snapshot) {
      try {
        const fd = new FormData();
        fd.append("files", snapshot);
        await axios.post(`${API}/notes/${note.id}/photos`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        toast.message("Foto del codice aggiunta alla nota");
        onChanged?.();
      } catch (_) { /* silent */ }
    }
  };

  const syncNote = async () => {
    if (!note.cpe && !note.ont_sfp) { toast.error("Nessun seriale CPE o ONT da sincronizzare"); return; }
    try { const r = await axios.post(`${API}/notes/${note.id}/sync`); toast.success(`Sincronizzati ${r.data.synced} seriale/i con il magazzino`); onChanged?.(); }
    catch (e) { toast.error(errorText(e)); }
  };

  const toggleStatus = async () => {
    const newStatus = note.status === "sospeso" ? "espletato" : "sospeso";
    let reason = note.suspend_reason || "";
    if (newStatus === "sospeso") {
      reason = window.prompt("Motivo della sospensione:", reason || "");
      if (reason === null) return;
    } else {
      reason = "";
    }
    try {
      await axios.patch(`${API}/notes/${note.id}`, { status: newStatus, suspend_reason: reason });
      toast.success(newStatus === "sospeso" ? "Nota sospesa (esclusa dalla media)" : "Nota espletata");
      onChanged?.();
    } catch (e) { toast.error(errorText(e)); }
  };

  const isSuspended = note.status === "sospeso";

  return (
    <div className={`bg-white border rounded-2xl card-shadow overflow-hidden stagger-in ${selected ? "border-brand-pink ring-1 ring-brand-pink/40" : isSuspended ? "border-amber-200 bg-amber-50/30" : "border-slate-200"}`}>
      <div className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 hover:bg-slate-50 transition">
        <input type="checkbox" checked={!!selected} onChange={() => onToggleSelect?.(note.id)}
          onClick={(e) => e.stopPropagation()} className="h-4 w-4 rounded border-slate-300 accent-pink-600 cursor-pointer"
          data-testid={`select-note-${note.wr}`} />
        <button onClick={() => setOpen(!open)} className="flex-1 text-left flex items-center gap-3 min-w-0" data-testid={`note-toggle-${note.wr}`}>
          <div className="wr-badge rounded-full px-3 py-1 text-xs sm:text-sm">WR {note.wr}</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900 truncate">
              {note.cliente || <span className="text-slate-400 italic">senza cliente</span>}
              {isSuspended && <span className="ml-2 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">SOSPESA</span>}
              {note.synced && <span className="ml-2 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">SYNC ✓</span>}
            </div>
            <div className="text-xs text-slate-500 truncate">{note.olo || "—"} • {note.indirizzo || note.via || "—"}</div>
          </div>
          <div className="hidden sm:flex items-center gap-1 text-xs text-slate-500">
            {note.photos?.length ? <span className="inline-flex items-center gap-1"><ImageIcon size={12} /> {note.photos.length}</span> : null}
          </div>
          {open ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
        </button>
      </div>

      {open && (
        <div className="px-4 sm:px-5 pb-5 border-t border-slate-100">
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button onClick={toggleStatus} className={`rounded-full px-3 py-2 text-xs font-semibold inline-flex items-center gap-2 ${isSuspended ? "bg-amber-100 text-amber-800 hover:bg-amber-200" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"}`} data-testid={`status-toggle-${note.wr}`}>
              {isSuspended ? <><PauseCircle size={14} /> Sospesa — {note.suspend_reason ? `"${note.suspend_reason.substring(0, 20)}${note.suspend_reason.length > 20 ? '…' : ''}"` : "clicca per riattivare"}</> : <><CheckCircle2 size={14} /> Espletata</>}
            </button>
            <button onClick={copy} className="rounded-full px-3 py-2 text-xs font-semibold bg-slate-900 text-white inline-flex items-center gap-2 hover:bg-slate-800" data-testid={`copy-note-button-${note.wr}`}>
              <Copy size={14} /> Copia nota
            </button>
            <button onClick={sendGmail} disabled={sending} className="btn-primary rounded-full px-3 py-2 text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-60" data-testid={`send-gmail-button-${note.wr}`}>
              {sending ? <Loader2 className="animate-spin" size={14} /> : <Mail size={14} />} Invia tramite Gmail
            </button>
            <button onClick={syncNote} className="rounded-full px-3 py-2 text-xs font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 inline-flex items-center gap-2" data-testid={`sync-note-${note.wr}`}>
              <RefreshCw size={14} /> Sincronizza magazzino
            </button>
            <button onClick={() => onOpenScanner(applyScan)} className="rounded-full px-3 py-2 text-xs font-semibold bg-brand-pink/10 text-brand-pink brand-pink inline-flex items-center gap-2 hover:bg-brand-pink/20" data-testid={`scan-serial-${note.wr}`}>
              <ScanLine size={14} /> Scansiona seriale
            </button>
            {note.pdf_storage_path ? (
              <a href={`${API}/files?path=${encodeURIComponent(note.pdf_storage_path)}`} target="_blank" rel="noopener noreferrer"
                className="rounded-full px-3 py-2 text-xs font-semibold bg-slate-100 text-slate-800 inline-flex items-center gap-2 hover:bg-slate-200">
                <FileText size={14} /> Apri PDF
              </a>
            ) : null}
            <button onClick={() => setEdit(!edit)} className="rounded-full px-3 py-2 text-xs font-semibold bg-slate-100 text-slate-800 inline-flex items-center gap-2 hover:bg-slate-200" data-testid={`edit-toggle-${note.wr}`}>
              {edit ? "Nascondi campi" : "Modifica campi"}
            </button>
            <button onClick={del} className="rounded-full px-3 py-2 text-xs font-semibold text-red-600 bg-red-50 inline-flex items-center gap-2 hover:bg-red-100 ml-auto" data-testid={`delete-note-${note.wr}`}>
              <Trash2 size={14} /> Elimina
            </button>
          </div>

          <div className="mt-2 text-[11px] text-slate-500 leading-relaxed">
            <strong>Suggerimento:</strong> "Scansiona seriale" apre la fotocamera per leggere codici a barre/QR del modem. "Scatta foto" apre la fotocamera per allegare foto alla nota.
          </div>

          {edit && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid={`edit-form-${note.wr}`}>
              {[
                { k: "cliente", label: "Cliente (D)" }, { k: "olo", label: "Descrizione OLO" },
                { k: "splitter", label: "Porta uscita splitter PFS (BA_)" }, { k: "via", label: "VIA (dopo A662_)" },
                { k: "pte_est", label: "PTE-EST" }, { k: "n_porta_perm", label: "PFS (N. porta perm.)" },
                { k: "porta_pte", label: "PTE (Porta PTE)" },
                { k: "ts", label: "TS" }, { k: "tc", label: "TC" }, { k: "d", label: "D" },
                { k: "a", label: "A" }, { k: "mono", label: "MONO" }, { k: "internal", label: "INT" },
                { k: "cpe", label: "CPE (seriale modem)" }, { k: "ont_sfp", label: "ONT / SFP" },
              ].map((f) => (
                <label key={f.k} className="text-xs font-medium text-slate-600">
                  {f.label}
                  <input type="text" value={form[f.k] ?? ""}
                    onChange={(e) => { setForm({ ...form, [f.k]: e.target.value }); setNoteDirty(false); }}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-pink focus:border-transparent"
                    data-testid={`field-${f.k}-${note.wr}`} />
                </label>
              ))}
            </div>
          )}

          <div className="mt-4">
            <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
              <div className="text-xs font-medium text-slate-500">
                Nota (modificabile){noteDirty ? <span className="ml-2 brand-pink">• modificata manualmente</span> : null}
              </div>
              <button onClick={regenerate} className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1" data-testid={`regenerate-note-${note.wr}`}>
                <RotateCcw size={12} /> Rigenera dai campi
              </button>
            </div>
            <textarea value={noteText} onChange={(e) => { setNoteDraft(e.target.value); setNoteDirty(true); }}
              rows={8} spellCheck={false}
              className="note-block w-full outline-none resize-y focus:ring-2 focus:ring-brand-pink/60"
              data-testid={`note-preview-${note.wr}`} />
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={save} disabled={saving} className="btn-primary rounded-full px-4 py-2 text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-60" data-testid={`save-note-${note.wr}`}>
                {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Salva nota
              </button>
            </div>
          </div>

          <div className="mt-4">
            <PhotoManager note={note} onChanged={onChanged} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Stats Panel ----------
const DAILY_TARGET = 4;

function localDateKey(iso) {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch { return "unknown"; }
}
function humanDate(key) {
  const [y, m, d] = key.split("-");
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  const days = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
  return `${days[dt.getDay()]} ${d}/${m}`;
}
function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function StatsPanel({ notes, onReset }) {
  // Escludi note sospese dalla media
  const active = notes.filter((n) => n.status !== "sospeso");
  const suspended = notes.length - active.length;
  const byDay = active.reduce((acc, n) => {
    const k = localDateKey(n.created_at);
    (acc[k] = acc[k] || []).push(n);
    return acc;
  }, {});
  const dayKeys = Object.keys(byDay).sort();
  const daysCount = dayKeys.length;
  const total = active.length;
  const avg = daysCount > 0 ? total / daysCount : 0;
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const thisMonth = active.filter((n) => localDateKey(n.created_at).startsWith(thisMonthKey)).length;
  const thisMonthDays = dayKeys.filter((k) => k.startsWith(thisMonthKey)).length;
  const monthAvg = thisMonthDays > 0 ? thisMonth / thisMonthDays : 0;
  const todayKey = localDateKey(now.toISOString());
  const todayCount = (byDay[todayKey] || []).length;
  const last7 = dayKeys.slice(-7).reverse();
  const maxCount = Math.max(1, ...last7.map((k) => byDay[k].length));

  // Monthly histogram — 30 days
  const monthKeys = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    monthKeys.push(localDateKey(d.toISOString()));
  }
  const monthMax = Math.max(1, ...monthKeys.map((k) => (byDay[k] || []).length));

  const targetOK = (v) => v >= DAILY_TARGET;

  const exportAll = () => {
    const payload = { exported_at: new Date().toISOString(), total: notes.length, notes };
    downloadFile(`note-openfiber-${todayKey}.json`, JSON.stringify(payload, null, 2), "application/json");
    toast.success("Esportazione completa avviata");
  };
  const exportOlo = () => {
    const lines = notes.map((n) => n.olo).filter(Boolean);
    downloadFile(`codici-olo-${todayKey}.txt`, lines.join("\n"), "text/plain;charset=utf-8");
    toast.success("Esportazione OLO avviata");
  };

  return (
    <section className="bg-white border border-slate-200 rounded-2xl card-shadow p-4 sm:p-5" data-testid="stats-panel">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Statistiche</div>
          <h2 className="text-lg sm:text-xl font-display font-bold text-slate-900 mt-0.5">Il tuo mese</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={exportOlo} disabled={!total} className="rounded-full px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-900 inline-flex items-center gap-1 disabled:opacity-40" data-testid="export-olo-btn">
            <FileText size={14} /> Export OLO
          </button>
          <button onClick={exportAll} disabled={!total} className="rounded-full px-3 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white inline-flex items-center gap-1 disabled:opacity-40" data-testid="export-all-btn">
            <FileText size={14} /> Export JSON
          </button>
          <button onClick={onReset} disabled={!total} className="rounded-full px-3 py-2 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 inline-flex items-center gap-1 disabled:opacity-40" data-testid="reset-month-btn">
            <RotateCcw size={14} /> Reset mese
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3" data-testid="stat-total">
          <div className="text-[11px] text-slate-500 font-semibold">Totale note</div>
          <div className="text-2xl font-display font-extrabold text-slate-900 mt-0.5">{total}</div>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3" data-testid="stat-today">
          <div className="text-[11px] text-slate-500 font-semibold">Oggi</div>
          <div className={`text-2xl font-display font-extrabold mt-0.5 ${targetOK(todayCount) ? "text-emerald-600" : "text-slate-900"}`}>{todayCount}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">target {DAILY_TARGET}/g</div>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3" data-testid="stat-daily-avg">
          <div className="text-[11px] text-slate-500 font-semibold">Media giornaliera</div>
          <div className={`text-2xl font-display font-extrabold mt-0.5 ${targetOK(avg) ? "text-emerald-600" : "text-red-600"}`}>{avg.toFixed(1)}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">su {daysCount} giorni</div>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3" data-testid="stat-month">
          <div className="text-[11px] text-slate-500 font-semibold">Questo mese</div>
          <div className="text-2xl font-display font-extrabold text-slate-900 mt-0.5">{thisMonth}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">media {monthAvg.toFixed(1)}/g</div>
        </div>
      </div>

      {last7.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-slate-500 mb-2">Ultimi giorni</div>
          <div className="space-y-1.5" data-testid="days-breakdown">
            {last7.map((k) => {
              const c = byDay[k].length;
              const pct = (c / maxCount) * 100;
              const ok = targetOK(c);
              return (
                <div key={k} className="flex items-center gap-2 text-xs" data-testid={`day-row-${k}`}>
                  <div className="w-20 shrink-0 font-mono text-slate-600">{humanDate(k)}</div>
                  <div className="flex-1 h-6 bg-slate-100 rounded-md overflow-hidden">
                    <div className={`h-full ${ok ? "bg-emerald-500" : "bg-brand-pink"} transition-all`} style={{ width: `${Math.max(6, pct)}%` }} />
                  </div>
                  <div className={`w-8 text-right font-semibold ${ok ? "text-emerald-600" : "text-slate-700"}`}>{c}</div>
                </div>
              );
            })}
          </div>
          <div className="text-[10px] text-slate-400 mt-2">Target: {DAILY_TARGET} note/giorno · verde = raggiunto{suspended > 0 ? ` · ${suspended} nota/e sospese escluse` : ""}</div>
        </div>
      )}

      {/* Monthly histogram (30 days) */}
      <div className="mt-5" data-testid="monthly-histogram">
        <div className="text-xs font-semibold text-slate-500 mb-2">Andamento ultimi 30 giorni</div>
        <div className="flex items-end gap-[3px] h-24">
          {monthKeys.map((k) => {
            const c = (byDay[k] || []).length;
            const h = Math.max(4, (c / monthMax) * 96);
            const ok = c >= DAILY_TARGET;
            const isToday = k === todayKey;
            return (
              <div key={k} title={`${humanDate(k)}: ${c} note`} className="flex-1 flex flex-col items-center justify-end" data-testid={`hist-${k}`}>
                <div className={`w-full rounded-t ${c === 0 ? "bg-slate-100" : ok ? "bg-emerald-500" : "bg-brand-pink"} ${isToday ? "ring-2 ring-slate-900" : ""}`} style={{ height: `${h}px` }} />
              </div>
            );
          })}
        </div>
        <div className="text-[10px] text-slate-400 mt-2">Ogni barra = 1 giorno · bordo scuro = oggi</div>
      </div>
    </section>
  );
}

// ---------- Warehouse Page ----------
function WarehousePage({ onOpenAdmin, showAdminBtn }) {
  const [serials, setSerials] = useState([]);
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tipoFilter, setTipoFilter] = useState("");
  const [inputSerial, setInputSerial] = useState("");
  const [inputTipo, setInputTipo] = useState("CPE");
  const [bulkText, setBulkText] = useState("");
  const [loading, setLoading] = useState(false);
  const scanRef = useRef(null);

  const fetchSerials = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/inventory/serials`, { params: { search: filter, status: statusFilter, tipo: tipoFilter } });
      setSerials(r.data || []);
    } catch (e) { toast.error(errorText(e)); }
    finally { setLoading(false); }
  }, [filter, statusFilter, tipoFilter]);

  useEffect(() => { const t = setTimeout(fetchSerials, 200); return () => clearTimeout(t); }, [fetchSerials]);
  useEffect(() => { axios.get(`${API}/inventory/users`).then((r) => setUsers(r.data || [])).catch(() => {}); }, []);
  useEffect(() => { if (scanRef.current) scanRef.current.focus(); }, []);

  const addSerial = async (s) => {
    const val = (s || inputSerial || "").trim();
    if (!val) return;
    try {
      await axios.post(`${API}/inventory/serials`, { serial: val, tipo: inputTipo, note: "" });
      toast.success(`Aggiunto ${val}`);
      setInputSerial("");
      fetchSerials();
    } catch (e) { toast.error(errorText(e)); }
    finally { setTimeout(() => scanRef.current?.focus(), 50); }
  };

  const bulkAdd = async () => {
    const list = bulkText.split(/[\n,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!list.length) return;
    try {
      const r = await axios.post(`${API}/inventory/serials/bulk`, { serials: list, tipo: inputTipo });
      toast.success(`${r.data.created} aggiunti, ${r.data.skipped.length} già presenti`);
      setBulkText(""); fetchSerials();
    } catch (e) { toast.error(errorText(e)); }
  };

  const assign = async (id, userId) => {
    try { await axios.patch(`${API}/inventory/serials/${id}`, { assigned_to_user_id: userId }); toast.success("Assegnazione aggiornata"); fetchSerials(); }
    catch (e) { toast.error(errorText(e)); }
  };

  const del = async (id, s) => {
    if (!window.confirm(`Eliminare seriale ${s}?`)) return;
    try { await axios.delete(`${API}/inventory/serials/${id}`); toast.success("Eliminato"); fetchSerials(); }
    catch (e) { toast.error(errorText(e)); }
  };

  const stats = {
    total: serials.length,
    in_stock: serials.filter((s) => s.status === "in_stock").length,
    assegnato: serials.filter((s) => s.status === "assegnato").length,
    scaricato: serials.filter((s) => s.status === "scaricato").length,
  };

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6" data-testid="warehouse-content">
      <section className="bg-white border border-slate-200 rounded-2xl card-shadow p-4 sm:p-5" data-testid="warehouse-add">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Aggiungi seriale</div>
        <h2 className="text-lg font-display font-bold mt-0.5 mb-3">Aggiungi al magazzino</h2>
        <div className="text-xs text-slate-500 mb-3">Punta il campo qui sotto e usa la pistola scanner USB/wireless — legge il seriale e invia Enter. Puoi anche digitare a mano.</div>
        <form onSubmit={(e) => { e.preventDefault(); addSerial(); }} className="flex flex-wrap gap-2 items-center">
          <select value={inputTipo} onChange={(e) => setInputTipo(e.target.value)} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm" data-testid="add-tipo">
            <option value="CPE">CPE (modem)</option>
            <option value="ONT">ONT / SFP</option>
            <option value="ALTRO">Altro</option>
          </select>
          <input ref={scanRef} value={inputSerial} onChange={(e) => setInputSerial(e.target.value)} placeholder="Scansiona o digita seriale, poi Enter"
            className="flex-1 min-w-[220px] rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-pink"
            data-testid="add-serial-input" autoFocus />
          <button type="submit" className="btn-primary rounded-full px-4 py-2 text-sm font-semibold inline-flex items-center gap-2" data-testid="add-serial-btn">
            <Package size={14} /> Aggiungi
          </button>
        </form>
        <details className="mt-3">
          <summary className="text-xs font-semibold text-slate-600 cursor-pointer">Inserimento massivo (una riga per seriale)</summary>
          <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={4} placeholder="ABC123&#10;DEF456"
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-pink"
            data-testid="bulk-serial-textarea" />
          <button onClick={bulkAdd} className="mt-2 rounded-full px-3 py-2 text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 inline-flex items-center gap-2" data-testid="bulk-serial-btn">
            <Package size={14} /> Aggiungi tutti come {inputTipo}
          </button>
        </details>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="warehouse-stats">
        <div className="rounded-xl bg-white border border-slate-200 p-3"><div className="text-[11px] text-slate-500 font-semibold">Totale</div><div className="text-2xl font-display font-extrabold">{stats.total}</div></div>
        <div className="rounded-xl bg-white border border-slate-200 p-3"><div className="text-[11px] text-slate-500 font-semibold">In stock</div><div className="text-2xl font-display font-extrabold text-emerald-600">{stats.in_stock}</div></div>
        <div className="rounded-xl bg-white border border-slate-200 p-3"><div className="text-[11px] text-slate-500 font-semibold">Assegnati</div><div className="text-2xl font-display font-extrabold text-amber-600">{stats.assegnato}</div></div>
        <div className="rounded-xl bg-white border border-slate-200 p-3"><div className="text-[11px] text-slate-500 font-semibold">Scaricati</div><div className="text-2xl font-display font-extrabold text-slate-500">{stats.scaricato}</div></div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl card-shadow p-4 sm:p-5" data-testid="warehouse-list">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Cerca seriale/utente"
              className="w-full pl-9 pr-3 py-2 rounded-full border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-pink" data-testid="warehouse-search" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-full border border-slate-200 px-3 py-2 text-sm" data-testid="warehouse-status-filter">
            <option value="">Tutti gli stati</option>
            <option value="in_stock">In stock</option>
            <option value="assegnato">Assegnati</option>
            <option value="scaricato">Scaricati</option>
          </select>
          <select value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value)} className="rounded-full border border-slate-200 px-3 py-2 text-sm" data-testid="warehouse-tipo-filter">
            <option value="">Tutti i tipi</option>
            <option value="CPE">CPE</option>
            <option value="ONT">ONT</option>
            <option value="ALTRO">Altro</option>
          </select>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm p-4"><Loader2 className="animate-spin" size={16} /> Caricamento…</div>
        ) : serials.length === 0 ? (
          <div className="border border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-500 text-sm">Nessun seriale in magazzino</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 font-semibold border-b border-slate-200">
                  <th className="py-2 pr-2">Seriale</th>
                  <th className="py-2 pr-2">Tipo</th>
                  <th className="py-2 pr-2">Stato</th>
                  <th className="py-2 pr-2">Assegnato a</th>
                  <th className="py-2 pr-2">Scaricato da</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {serials.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 last:border-0" data-testid={`serial-row-${s.serial}`}>
                    <td className="py-2 pr-2 font-mono text-slate-900">{s.serial}</td>
                    <td className="py-2 pr-2 text-slate-600">{s.tipo}</td>
                    <td className="py-2 pr-2">
                      {s.status === "in_stock" && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">IN STOCK</span>}
                      {s.status === "assegnato" && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">ASSEGNATO</span>}
                      {s.status === "scaricato" && <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">SCARICATO</span>}
                    </td>
                    <td className="py-2 pr-2">
                      <select value={s.assigned_to_user_id || ""} onChange={(e) => assign(s.id, e.target.value)} disabled={s.status === "scaricato"}
                        className="text-xs rounded-full border border-slate-200 bg-white px-2 py-1 disabled:opacity-50 max-w-[180px]"
                        data-testid={`assign-${s.serial}`}>
                        <option value="">— Non assegnato —</option>
                        {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                      </select>
                    </td>
                    <td className="py-2 pr-2 text-xs text-slate-600">
                      {s.downloaded_by_name ? (
                        <span>{s.downloaded_by_name}<br /><span className="text-[10px] text-slate-400">{s.downloaded_at ? new Date(s.downloaded_at).toLocaleString("it-IT") : ""}</span></span>
                      ) : "—"}
                    </td>
                    <td className="py-2 text-right">
                      <button onClick={() => del(s.id, s.serial)} className="text-red-600 hover:bg-red-50 rounded-full p-1.5" data-testid={`delete-serial-${s.serial}`}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

// ---------- Main app content (authenticated) ----------
function AppContent() {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastCreatedIds, setLastCreatedIds] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [scanner, setScanner] = useState(null); // { onScan }
  const [scanTarget, setScanTarget] = useState(null);
  const [page, setPage] = useState(user?.role === "magazzino" ? "warehouse" : "notes");

  const filteredNotes = notes.filter((n) => {
    if (!dateFrom && !dateTo) return true;
    const k = localDateKey(n.created_at);
    if (dateFrom && k < dateFrom) return false;
    if (dateTo && k > dateTo) return false;
    return true;
  });

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try { const r = await axios.get(`${API}/notes`, { params: { search } }); setNotes(r.data || []); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(fetchNotes, 200);
    return () => clearTimeout(t);
  }, [fetchNotes]);

  const handleParsed = async () => {
    const r = await axios.get(`${API}/notes`);
    setNotes(r.data || []);
    setLastCreatedIds((r.data || []).slice(0, 8).map((n) => n.id));
  };

  const toggleSelect = (id) => setSelectedIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const allSelected = notes.length > 0 && notes.every((n) => selectedIds.includes(n.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : notes.map((n) => n.id));

  const bulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`Eliminare ${selectedIds.length} nota/note?`)) return;
    setDeleting(true);
    try { const r = await axios.post(`${API}/notes/bulk-delete`, { ids: selectedIds }); toast.success(`${r.data.deleted} eliminate`); setSelectedIds([]); fetchNotes(); }
    catch (e) { toast.error(errorText(e)); }
    finally { setDeleting(false); }
  };

  const resetMonth = async () => {
    if (!notes.length) return;
    if (!window.confirm(`ATTENZIONE: verranno eliminate tutte le ${notes.length} note. Assicurati di aver esportato i dati prima.\n\nProcedere con il reset?`)) return;
    try {
      const r = await axios.post(`${API}/notes/bulk-delete`, { ids: notes.map((n) => n.id) });
      toast.success(`Reset completato: ${r.data.deleted} note eliminate`);
      setSelectedIds([]);
      fetchNotes();
    } catch (e) { toast.error(errorText(e)); }
  };

  const openScanner = (onScan) => { setScanner({ onScan }); setScanTarget(null); };
  const closeScanner = () => { setScanner(null); setScanTarget(null); };
  const handleScan = (value, target, snapshot) => {
    scanner?.onScan?.(value, target, snapshot);
    closeScanner();
  };

  const canSwitchPage = user?.role === "admin";
  const effectivePage = user?.role === "magazzino" ? "warehouse" : (canSwitchPage ? page : "notes");

  return (
    <div className="min-h-screen">
      <Header showAdminBtn={user?.role === "admin"} onAdmin={() => setAdminOpen(true)}
        page={effectivePage} onPageChange={setPage} canSwitchPage={canSwitchPage} />
      <Toaster richColors position="top-center" />
      {effectivePage === "warehouse" ? (
        <WarehousePage onOpenAdmin={() => setAdminOpen(true)} showAdminBtn={user?.role === "admin"} />
      ) : (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6" data-testid="main-content">
        <PdfUploader onParsed={handleParsed} />

        <StatsPanel notes={filteredNotes} onReset={resetMonth} />

        <section className="bg-white border border-slate-200 rounded-2xl card-shadow p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Destinatari email preimpostati</div>
              <div className="text-xs text-slate-500 mt-0.5">Precompilati come destinatari nell'invio Gmail</div>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500"><Mail size={14} /> {RECIPIENTS.length}</div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {RECIPIENTS.map((r) => (<span key={r} className="text-[11px] font-mono bg-slate-100 text-slate-800 px-2 py-1 rounded-md border border-slate-200">{r}</span>))}
          </div>
        </section>

        <section>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h2 className="text-lg sm:text-xl font-display font-bold text-slate-900">Note</h2>
            <span className="text-xs text-slate-500">{filteredNotes.length} / {notes.length}</span>
            <div className="ml-auto flex gap-2 flex-wrap items-center">
              <div className="inline-flex items-center gap-1 text-xs text-slate-500">
                <Calendar size={14} />
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-full border border-slate-200 px-2 py-1.5 text-xs" data-testid="date-from" />
                <span>–</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-full border border-slate-200 px-2 py-1.5 text-xs" data-testid="date-to" />
                {(dateFrom || dateTo) && (
                  <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-slate-500 hover:text-slate-900 p-1" data-testid="clear-date"><X size={12} /></button>
                )}
              </div>
              <div className="relative w-full sm:w-64">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cerca WR, cliente o OLO"
                  className="w-full pl-9 pr-3 py-2 rounded-full border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-pink focus:border-transparent"
                  data-testid="search-archive-input" />
              </div>
            </div>
          </div>

          {filteredNotes.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="h-4 w-4 rounded border-slate-300 accent-pink-600" data-testid="select-all-checkbox" />
                {allSelected ? "Deseleziona tutto" : "Seleziona tutto"}
              </label>
              <span className="text-xs text-slate-500" data-testid="selection-count">{selectedIds.length} selezionate</span>
              <button onClick={bulkDelete} disabled={!selectedIds.length || deleting}
                className="ml-auto rounded-full px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 inline-flex items-center gap-2 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="bulk-delete-button">
                {deleting ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />} Elimina selezionate
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm p-6"><Loader2 className="animate-spin" size={16} /> Caricamento…</div>
          ) : filteredNotes.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-500 text-sm bg-white" data-testid="empty-state">
              {notes.length === 0 ? "Nessuna nota. Carica un PDF Open Fiber per iniziare." : "Nessuna nota nel range selezionato."}
            </div>
          ) : (
            <div className="space-y-6" data-testid="notes-groups">
              {(() => {
                const groups = filteredNotes.reduce((acc, n) => {
                  const k = localDateKey(n.created_at);
                  (acc[k] = acc[k] || []).push(n);
                  return acc;
                }, {});
                const keys = Object.keys(groups).sort().reverse();
                return keys.map((k) => (
                  <div key={k} data-testid={`day-group-${k}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="text-xs font-mono font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-full px-3 py-1">{humanDate(k)}</div>
                      <div className={`text-xs font-semibold ${groups[k].length >= DAILY_TARGET ? "text-emerald-600" : "text-slate-500"}`}>{groups[k].length} note</div>
                      <div className="flex-1 h-px bg-slate-100" />
                    </div>
                    <div className="space-y-3">
                      {groups[k].map((n) => (
                        <NoteCard key={n.id} note={n} defaultOpen={lastCreatedIds.includes(n.id)}
                          onChanged={fetchNotes} selected={selectedIds.includes(n.id)} onToggleSelect={toggleSelect}
                          onOpenScanner={openScanner} />
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </section>
      </main>
      )}
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-center text-xs text-slate-400">
        creato e amministrato da <span className="text-slate-600 font-semibold">Giuseppe Belviso</span>
      </footer>
      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}
      {scanner && <ScannerModal onClose={closeScanner} onScan={handleScan} target={scanTarget} setTarget={setScanTarget} />}
    </div>
  );
}

// ---------- Root ----------
function AppRoot() {
  const { user } = useAuth();
  if (user === null) return <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm"><Loader2 className="animate-spin mr-2" size={16} /> Caricamento…</div>;
  if (!user) return (<><Toaster richColors position="top-center" /><AuthScreen /></>);
  return <AppContent />;
}

export default function App() {
  return <AuthProvider><AppRoot /></AuthProvider>;
}
