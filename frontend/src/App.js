import { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import { Toaster, toast } from "sonner";
import {
  Upload, FileText, Copy, Mail, Trash2, Image as ImageIcon,
  Loader2, Search, ChevronDown, ChevronUp, Save, X, Camera,
} from "lucide-react";

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
  const tech = `${n.splitter || ""} ${n.via || ""} PTE-EST PFS ${n.n_porta_perm || ""} PTE ${n.porta_pte || ""} TS TC D A MONO INT`;
  return `WR: ${n.wr || ""}\n${(n.cliente || "").toLowerCase()}\n${n.olo || ""}\n${tech}\nCPE: ${n.cpe || ""}\n(ONT/SFP): ${n.ont_sfp || ""}`;
};

function Header() {
  return (
    <header className="bg-white border-b border-slate-200" data-testid="header-admin-bar">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
        <div className="flex items-center gap-3">
          <img src={LOGO_GC} alt="GC Impianti SNC" className="h-10 sm:h-12 w-auto object-contain rounded" data-testid="logo-gc" />
          <div className="hidden sm:block h-8 w-px bg-slate-200" />
          <img src={LOGO_OF} alt="Open Fiber" className="h-8 sm:h-10 w-auto object-contain" data-testid="logo-openfiber" />
        </div>
        <div className="ml-auto text-right">
          <h1 className="text-lg sm:text-xl font-display font-extrabold tracking-tight text-slate-900" data-testid="app-title">
            Gestione Pratiche & Note
          </h1>
          <p className="text-xs sm:text-[13px] text-slate-500 font-medium" data-testid="creator-credit">
            creato e amministrato da <span className="text-slate-800 font-semibold">Giuseppe Belviso</span>
          </p>
        </div>
      </div>
    </header>
  );
}

function PdfUploader({ onParsed }) {
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Seleziona un file PDF valido");
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await axios.post(`${API}/pdf/parse`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const { created_count, skipped_wr } = res.data;
      if (created_count === 0) {
        toast.warning("Nessuna pratica con WR numerico trovata nel PDF");
      } else {
        toast.success(`${created_count} nota/note create`);
      }
      if (skipped_wr && skipped_wr.length) {
        toast.message(`WR non numerici saltati: ${skipped_wr.join(", ")}`);
      }
      onParsed?.();
    } catch (e) {
      console.error(e);
      toast.error("Errore nell'analisi del PDF");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div
      className={`dropzone ${drag ? "drag" : ""} p-6 sm:p-8 text-center`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files?.[0]); }}
      data-testid="pdf-upload-dropzone"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-brand-pink/10 flex items-center justify-center brand-pink">
          {loading ? <Loader2 className="animate-spin" size={26} /> : <Upload size={26} />}
        </div>
        <div>
          <div className="text-base sm:text-lg font-semibold text-slate-900">Carica la pratica Open Fiber (PDF)</div>
          <div className="text-sm text-slate-500 mt-1">Trascina qui il file o clicca per selezionarlo. Note generate automaticamente per ogni WR numerico.</div>
        </div>
        <input ref={inputRef} type="file" accept="application/pdf" className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])} data-testid="upload-pdf-input" />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="btn-primary rounded-full px-5 py-2.5 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
          data-testid="upload-pdf-button"
        >
          <FileText size={16} /> {loading ? "Analisi in corso..." : "Seleziona PDF"}
        </button>
      </div>
    </div>
  );
}

function PhotoManager({ note, onChanged }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const upload = async (files) => {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("files", f));
      await axios.post(`${API}/notes/${note.id}/photos`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Foto caricate");
      onChanged?.();
    } catch (e) {
      console.error(e);
      toast.error("Errore caricamento foto");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removePhoto = async (pid) => {
    try {
      await axios.delete(`${API}/notes/${note.id}/photos/${pid}`);
      toast.success("Foto rimossa");
      onChanged?.();
    } catch (e) {
      toast.error("Errore rimozione foto");
    }
  };

  return (
    <div data-testid={`photo-manager-${note.wr}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <ImageIcon size={16} className="brand-pink" /> Foto ({note.photos?.length || 0})
        </div>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => upload(e.target.files)}
          data-testid={`photo-input-${note.wr}`} />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="text-xs font-semibold text-brand-pink brand-pink hover:underline inline-flex items-center gap-1 disabled:opacity-60"
          data-testid={`photo-upload-button-${note.wr}`}
        >
          {uploading ? <Loader2 className="animate-spin" size={14} /> : <Camera size={14} />}
          Aggiungi foto
        </button>
      </div>
      {note.photos?.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {note.photos.map((p) => (
            <div key={p.id} className="relative group" data-testid={`photo-thumb-${p.id}`}>
              <img
                src={`${API}/files?path=${encodeURIComponent(p.storage_path)}`}
                alt={p.filename}
                className="photo-thumb w-full"
                loading="lazy"
              />
              <button
                onClick={() => removePhoto(p.id)}
                className="absolute top-1 right-1 rounded-full bg-black/70 text-white p-1 opacity-0 group-hover:opacity-100 transition"
                data-testid={`photo-delete-${p.id}`}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg p-3 text-center">
          Nessuna foto — carica foto specifiche per questa pratica
        </div>
      )}
    </div>
  );
}

function NoteCard({ note, onChanged, defaultOpen, selected, onToggleSelect }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState(note);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(note); }, [note]);

  const noteText = edit ? composeNote(form) : (note.note_text || composeNote(note));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(noteText);
      toast.success("Nota copiata negli appunti!");
    } catch (e) {
      toast.error("Copia non riuscita");
    }
  };

  const [sending, setSending] = useState(false);

  const sendGmail = async () => {
    const subject = `WR: ${note.wr}`;
    const to = RECIPIENTS.join(",");
    const body = `${noteText}\n\n---\nDestinatari: ${RECIPIENTS.join(", ")}`;

    setSending(true);
    try {
      // Copia i destinatari negli appunti così l'utente li incolla nel campo A: se necessario
      try { await navigator.clipboard.writeText(RECIPIENTS.join(", ")); } catch (_) {}

      // Tenta Web Share API con file (PDF + foto) — apre lo share sheet del dispositivo,
      // l'utente sceglie Gmail e i file sono già allegati.
      if (navigator.canShare && (note.pdf_storage_path || (note.photos && note.photos.length))) {
        try {
          const files = [];
          if (note.pdf_storage_path) {
            const r = await fetch(`${API}/files?path=${encodeURIComponent(note.pdf_storage_path)}`);
            if (r.ok) {
              const b = await r.blob();
              files.push(new File([b], note.pdf_filename || `pratica_WR_${note.wr}.pdf`, { type: "application/pdf" }));
            }
          }
          for (const p of note.photos || []) {
            const r = await fetch(`${API}/files?path=${encodeURIComponent(p.storage_path)}`);
            if (r.ok) {
              const b = await r.blob();
              files.push(new File([b], p.filename || `foto_${p.id}.jpg`, { type: p.content_type || "image/jpeg" }));
            }
          }
          const shareData = { title: subject, text: body, files };
          if (files.length && navigator.canShare(shareData)) {
            await navigator.share(shareData);
            toast.success("Condivisione aperta — seleziona Gmail, i destinatari sono già copiati");
            setSending(false);
            return;
          }
        } catch (err) {
          if (err && err.name === "AbortError") {
            setSending(false);
            return; // utente ha annullato lo share
          }
          console.warn("Web Share fallita, fallback a Gmail compose", err);
        }
      }

      // Fallback: apri Gmail compose (webmail) con destinatari, oggetto e corpo
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&tf=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(noteText)}`;
      const a = document.createElement("a");
      a.href = gmailUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.message("Gmail aperto — allega manualmente PDF e foto (destinatari già copiati negli appunti)");
    } finally {
      setSending(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        cliente: form.cliente, olo: form.olo, splitter: form.splitter,
        via: form.via, n_porta_perm: form.n_porta_perm, porta_pte: form.porta_pte,
        cpe: form.cpe, ont_sfp: form.ont_sfp, indirizzo: form.indirizzo,
      };
      await axios.patch(`${API}/notes/${note.id}`, payload);
      toast.success("Nota aggiornata");
      setEdit(false);
      onChanged?.();
    } catch (e) {
      toast.error("Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!window.confirm("Eliminare questa nota?")) return;
    try {
      await axios.delete(`${API}/notes/${note.id}`);
      toast.success("Nota eliminata");
      onChanged?.();
    } catch (e) {
      toast.error("Errore eliminazione");
    }
  };

  return (
    <div className={`bg-white border rounded-2xl card-shadow overflow-hidden stagger-in ${selected ? "border-brand-pink ring-1 ring-brand-pink/40" : "border-slate-200"}`} data-testid="wr-note-card">
      <div className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 hover:bg-slate-50 transition">
        <input
          type="checkbox"
          checked={!!selected}
          onChange={(e) => { e.stopPropagation(); onToggleSelect?.(note.id); }}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-slate-300 accent-pink-600 cursor-pointer"
          data-testid={`select-note-${note.wr}`}
          aria-label={`Seleziona WR ${note.wr}`}
        />
        <button
          onClick={() => setOpen(!open)}
          className="flex-1 text-left flex items-center gap-3 min-w-0"
          data-testid={`note-toggle-${note.wr}`}
        >
          <div className="wr-badge rounded-full px-3 py-1 text-xs sm:text-sm">WR {note.wr}</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900 truncate">
              {note.cliente || <span className="text-slate-400 italic">senza cliente</span>}
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
            <button onClick={copy} className="btn-ghost rounded-full px-3 py-2 text-xs font-semibold bg-slate-900 text-white inline-flex items-center gap-2 hover:bg-slate-800"
              data-testid={`copy-note-button-${note.wr}`}>
              <Copy size={14} /> Copia nota
            </button>
            <button onClick={sendGmail} disabled={sending} className="btn-primary rounded-full px-3 py-2 text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-60"
              data-testid={`send-gmail-button-${note.wr}`}>
              {sending ? <Loader2 className="animate-spin" size={14} /> : <Mail size={14} />} Invia tramite Gmail
            </button>
            {note.pdf_storage_path ? (
              <a href={`${API}/files?path=${encodeURIComponent(note.pdf_storage_path)}`} target="_blank" rel="noopener noreferrer"
                className="btn-ghost rounded-full px-3 py-2 text-xs font-semibold bg-slate-100 text-slate-800 inline-flex items-center gap-2 hover:bg-slate-200"
                data-testid={`download-pdf-${note.wr}`}>
                <FileText size={14} /> Apri PDF
              </a>
            ) : null}
            <button onClick={() => setEdit(!edit)} className="btn-ghost rounded-full px-3 py-2 text-xs font-semibold bg-slate-100 text-slate-800 inline-flex items-center gap-2 hover:bg-slate-200"
              data-testid={`edit-toggle-${note.wr}`}>
              {edit ? "Chiudi modifica" : "Modifica campi"}
            </button>
            <button onClick={del} className="btn-ghost rounded-full px-3 py-2 text-xs font-semibold text-red-600 bg-red-50 inline-flex items-center gap-2 hover:bg-red-100 ml-auto"
              data-testid={`delete-note-${note.wr}`}>
              <Trash2 size={14} /> Elimina
            </button>
          </div>

          <div className="mt-2 text-[11px] text-slate-500 leading-relaxed" data-testid={`gmail-hint-${note.wr}`}>
            <strong>Suggerimento:</strong> su mobile "Invia tramite Gmail" apre la condivisione del sistema con PDF e foto già allegati (scegli l'app Gmail). I destinatari vengono copiati negli appunti — incollali nel campo "A:". Su desktop apre Gmail Web e devi allegare i file manualmente.
          </div>

          {edit && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { k: "cliente", label: "Cliente (D)" },
                { k: "olo", label: "Descrizione OLO" },
                { k: "splitter", label: "Porta uscita splitter PFS (BA_)" },
                { k: "via", label: "VIA (dopo A662_)" },
                { k: "n_porta_perm", label: "PFS (N. porta perm.)" },
                { k: "porta_pte", label: "PTE (Porta PTE)" },
                { k: "cpe", label: "CPE" },
                { k: "ont_sfp", label: "ONT / SFP" },
              ].map((f) => (
                <label key={f.k} className="text-xs font-medium text-slate-600">
                  {f.label}
                  <input
                    type="text"
                    value={form[f.k] || ""}
                    onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-pink focus:border-transparent"
                    data-testid={`field-${f.k}-${note.wr}`}
                  />
                </label>
              ))}
              <div className="sm:col-span-2 flex gap-2">
                <button onClick={save} disabled={saving}
                  className="btn-primary rounded-full px-4 py-2 text-xs font-semibold inline-flex items-center gap-2"
                  data-testid={`save-note-${note.wr}`}>
                  {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Salva modifiche
                </button>
              </div>
            </div>
          )}

          <div className="mt-4">
            <div className="text-xs font-medium text-slate-500 mb-1">Anteprima nota</div>
            <pre className="note-block" data-testid={`note-preview-${note.wr}`}>{noteText}</pre>
          </div>

          <div className="mt-4">
            <PhotoManager note={note} onChanged={onChanged} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [notes, setNotes] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastCreatedIds, setLastCreatedIds] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleting, setDeleting] = useState(false);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/notes`, { params: { search } });
      setNotes(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(fetchNotes, 200);
    return () => clearTimeout(t);
  }, [fetchNotes]);

  const handleParsed = async () => {
    const res = await axios.get(`${API}/notes`);
    const list = res.data || [];
    setNotes(list);
    setLastCreatedIds(list.slice(0, 8).map((n) => n.id));
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const allSelected = notes.length > 0 && notes.every((n) => selectedIds.includes(n.id));
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(notes.map((n) => n.id));
  };

  const bulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`Eliminare ${selectedIds.length} nota/note selezionate?`)) return;
    setDeleting(true);
    try {
      const res = await axios.post(`${API}/notes/bulk-delete`, { ids: selectedIds });
      toast.success(`${res.data.deleted} nota/note eliminate`);
      setSelectedIds([]);
      fetchNotes();
    } catch (e) {
      toast.error("Errore eliminazione multipla");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <Toaster richColors position="top-center" />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6" data-testid="main-content">
        <section className="grid grid-cols-1 gap-6">
          <PdfUploader onParsed={handleParsed} />
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl card-shadow p-4 sm:p-5" data-testid="destinatari-info">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Destinatari email preimpostati</div>
              <div className="text-xs text-slate-500 mt-0.5">L'invio Gmail includerà automaticamente questi indirizzi</div>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
              <Mail size={14} /> {RECIPIENTS.length}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {RECIPIENTS.map((r) => (
              <span key={r} className="text-[11px] font-mono bg-slate-100 text-slate-800 px-2 py-1 rounded-md border border-slate-200">{r}</span>
            ))}
          </div>
        </section>

        <section data-testid="storico-pratiche-section">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h2 className="text-lg sm:text-xl font-display font-bold text-slate-900">Note</h2>
            <span className="text-xs text-slate-500">{notes.length} totali</span>
            <div className="ml-auto relative w-full sm:w-80">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca WR, cliente o OLO"
                className="w-full pl-9 pr-3 py-2 rounded-full border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-pink focus:border-transparent"
                data-testid="search-archive-input"
              />
            </div>
          </div>

          {notes.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2" data-testid="bulk-toolbar">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-slate-300 accent-pink-600"
                  data-testid="select-all-checkbox"
                />
                {allSelected ? "Deseleziona tutto" : "Seleziona tutto"}
              </label>
              <span className="text-xs text-slate-500" data-testid="selection-count">
                {selectedIds.length} selezionate
              </span>
              <button
                onClick={bulkDelete}
                disabled={!selectedIds.length || deleting}
                className="ml-auto btn-ghost rounded-full px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 inline-flex items-center gap-2 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="bulk-delete-button"
              >
                {deleting ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                Elimina selezionate
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
                <NoteCard
                  key={n.id}
                  note={n}
                  defaultOpen={lastCreatedIds.includes(n.id)}
                  onChanged={fetchNotes}
                  selected={selectedIds.includes(n.id)}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </div>
          )}
        </section>
      </main>
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-center text-xs text-slate-400">
        creato e amministrato da <span className="text-slate-600 font-semibold">Giuseppe Belviso</span>
      </footer>
    </div>
  );
}
