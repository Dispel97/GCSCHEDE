import { useEffect, useState, useCallback, useRef, createContext, useContext } from "react";
import axios from "axios";
import { Toaster, toast } from "sonner";
import {
  Upload, FileText, Copy, Mail, Trash2, Image as ImageIcon,
  Loader2, Search, ChevronDown, ChevronUp, Save, X, Camera, RotateCcw,
  LogOut, Shield, UserCheck, UserX, Users, ScanLine, LogIn, UserPlus,
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
function Header({ onAdmin, showAdminBtn }) {
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
            Gestione Pratiche & Note
          </h1>
          <p className="text-xs sm:text-[13px] text-slate-500 font-medium">
            creato e amministrato da <span className="text-slate-800 font-semibold">Giuseppe Belviso</span>
          </p>
        </div>
        {user && (
          <div className="w-full flex items-center gap-2 pt-2 border-t border-slate-100" data-testid="user-bar">
            <div className="text-xs text-slate-600 truncate">
              <span className="font-semibold text-slate-800">{user.email}</span>
              {user.role === "admin" && <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold text-brand-pink brand-pink"><Shield size={10} /> ADMIN</span>}
            </div>
            <div className="ml-auto flex gap-2">
              {showAdminBtn && (
                <button onClick={onAdmin} className="btn-ghost text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-full px-3 py-1.5 inline-flex items-center gap-1" data-testid="btn-admin-panel">
                  <Users size={14} /> Pannello Admin
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

  const approve = async (id) => { try { await axios.post(`${API}/auth/admin/approve/${id}`); toast.success("Utente approvato"); fetchUsers(); } catch (e) { toast.error(errorText(e)); } };
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
                    <button onClick={() => approve(u.id)} className="btn-primary rounded-full px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1" data-testid={`approve-${u.email}`}><UserCheck size={12} /> Approva</button>
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
                      {u.email} {u.role === "admin" && <span className="ml-1 text-[10px] font-bold text-brand-pink brand-pink">ADMIN</span>}
                    </div>
                    <div className="text-xs text-slate-500">{u.name || "—"} • {new Date(u.created_at).toLocaleString("it-IT")}</div>
                  </div>
                  {u.role !== "admin" && (
                    <>
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
      (decoded) => {
        if (stopped) return;
        stopped = true;
        onScan(decoded, target);
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
    setSending(true);
    try {
      // Web Share with files (mobile) — best UX, but recipient auto-populate is not always supported by target app
      if (navigator.canShare && (note.pdf_storage_path || (note.photos && note.photos.length))) {
        try {
          const files = [];
          if (note.pdf_storage_path) {
            const r = await fetch(`${API}/files?path=${encodeURIComponent(note.pdf_storage_path)}`);
            if (r.ok) { const b = await r.blob(); files.push(new File([b], note.pdf_filename || `pratica_WR_${note.wr}.pdf`, { type: "application/pdf" })); }
          }
          for (const p of note.photos || []) {
            const r = await fetch(`${API}/files?path=${encodeURIComponent(p.storage_path)}`);
            if (r.ok) { const b = await r.blob(); files.push(new File([b], p.filename || `foto_${p.id}.jpg`, { type: p.content_type || "image/jpeg" })); }
          }
          // Include recipients in URL so if the sharee opens mailto, "to" is populated
          const mailto = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(noteText)}`;
          const shareData = { title: subject, text: noteText, url: mailto, files };
          if (files.length && navigator.canShare(shareData)) {
            await navigator.share(shareData);
            toast.success("Condivisione aperta — seleziona Gmail");
            setSending(false); return;
          }
        } catch (err) { if (err && err.name === "AbortError") { setSending(false); return; } }
      }
      // Fallback: open Gmail Web with recipients+subject+body prefilled
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

  const applyScan = (value, target) => {
    setForm((f) => ({ ...f, [target]: value }));
    setEdit(true);
    toast.success(`Codice inserito in ${target === "cpe" ? "CPE" : "ONT/SFP"}`);
  };

  return (
    <div className={`bg-white border rounded-2xl card-shadow overflow-hidden stagger-in ${selected ? "border-brand-pink ring-1 ring-brand-pink/40" : "border-slate-200"}`}>
      <div className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 hover:bg-slate-50 transition">
        <input type="checkbox" checked={!!selected} onChange={() => onToggleSelect?.(note.id)}
          onClick={(e) => e.stopPropagation()} className="h-4 w-4 rounded border-slate-300 accent-pink-600 cursor-pointer"
          data-testid={`select-note-${note.wr}`} />
        <button onClick={() => setOpen(!open)} className="flex-1 text-left flex items-center gap-3 min-w-0" data-testid={`note-toggle-${note.wr}`}>
          <div className="wr-badge rounded-full px-3 py-1 text-xs sm:text-sm">WR {note.wr}</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900 truncate">{note.cliente || <span className="text-slate-400 italic">senza cliente</span>}</div>
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
            <button onClick={copy} className="rounded-full px-3 py-2 text-xs font-semibold bg-slate-900 text-white inline-flex items-center gap-2 hover:bg-slate-800" data-testid={`copy-note-button-${note.wr}`}>
              <Copy size={14} /> Copia nota
            </button>
            <button onClick={sendGmail} disabled={sending} className="btn-primary rounded-full px-3 py-2 text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-60" data-testid={`send-gmail-button-${note.wr}`}>
              {sending ? <Loader2 className="animate-spin" size={14} /> : <Mail size={14} />} Invia tramite Gmail
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

// ---------- Main app content (authenticated) ----------
function AppContent() {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastCreatedIds, setLastCreatedIds] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [scanner, setScanner] = useState(null); // { onScan }
  const [scanTarget, setScanTarget] = useState(null);

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

  const openScanner = (onScan) => { setScanner({ onScan }); setScanTarget(null); };
  const closeScanner = () => { setScanner(null); setScanTarget(null); };
  const handleScan = (value, target) => {
    scanner?.onScan?.(value, target);
    closeScanner();
  };

  return (
    <div className="min-h-screen">
      <Header showAdminBtn={user?.role === "admin"} onAdmin={() => setAdminOpen(true)} />
      <Toaster richColors position="top-center" />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6" data-testid="main-content">
        <PdfUploader onParsed={handleParsed} />

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
            <span className="text-xs text-slate-500">{notes.length} totali</span>
            <div className="ml-auto relative w-full sm:w-80">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca WR, cliente o OLO"
                className="w-full pl-9 pr-3 py-2 rounded-full border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-pink focus:border-transparent"
                data-testid="search-archive-input" />
            </div>
          </div>

          {notes.length > 0 && (
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
          ) : notes.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-500 text-sm bg-white" data-testid="empty-state">
              Nessuna nota. Carica un PDF Open Fiber per iniziare.
            </div>
          ) : (
            <div className="space-y-3">
              {notes.map((n) => (
                <NoteCard key={n.id} note={n} defaultOpen={lastCreatedIds.includes(n.id)}
                  onChanged={fetchNotes}
                  selected={selectedIds.includes(n.id)} onToggleSelect={toggleSelect}
                  onOpenScanner={openScanner} />
              ))}
            </div>
          )}
        </section>
      </main>
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
