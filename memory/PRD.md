# PRD — OpenFiber Notes & Warehouse (GC Impianti)

## Problem Statement (original, Italian)
Web app che automatizza la generazione delle note tecniche OpenFiber a partire dai PDF di pratica, con supporto foto, invio Gmail, autenticazione admin/tecnico/magazzino, scanner barcode/QR per seriali CPE/ONT, statistiche giornaliere/mensili, gestione magazzino modem, notifiche real-time e storico eventi per audit.

## Users
- **Admin** (Giuseppe Belviso): full access, approva utenti, vede tutte le sezioni.
- **Tecnico (user)**: crea/edita note, scansiona seriali, invia Gmail, sincronizza al magazzino.
- **Magazzino**: gestisce inventario seriali, riceve notifiche di scarico, esporta CSV.

## Tech Stack
- **Frontend**: React 19 (single-file `App.js` ~1700 lines), Tailwind, sonner (toast), lucide-react, html5-qrcode, jsbarcode, qrcode.
- **Backend**: FastAPI, Motor (async MongoDB), bcrypt+PyJWT, pdfplumber.
- **Storage**: Emergent Object Storage (PDF + foto).
- **Offline**: `standalone_offline.html` 2.5MB con librerie inlinate (usato su Android).

## Implemented (as of 11 Feb 2026)
### Core (prior iterations)
- OpenFiber PDF parsing (WR, cliente, OLO, splitter, via, PFS, PTE, etc.)
- JWT auth con approvazione admin, RBAC (admin/user/magazzino)
- Note CRUD, edit inline, rigenerazione da campi, foto (camera + gallery)
- Invio Gmail: Web Share API (mobile con foto allegate) + mailto/Gmail Web fallback
- Scanner barcode/QR in-app con html5-qrcode
- Statistiche: totale, oggi, media giornaliera, mensile, istogramma 30gg
- Filtri data range, ricerca, bulk-delete, reset mese, export JSON/OLO
- Magazzino: aggiunta USB scanner, bulk, assegnazione utenti, sync note → scaricato
- Note status espletato/sospeso (era singolo toggle)
- File offline standalone HTML per Android

### Iteration 11 (11 Feb 2026)
- **Tag magazzino liberi**: sostituito il dropdown fisso CPE/ONT/ALTRO con un **input free-form** con autocompletamento (`<datalist>`) basato sui tag già usati. Nuovo endpoint `GET /api/inventory/tags`.
- **Modifica tag inline**: nella tabella magazzino ogni riga mostra un **chip cliccabile** — al click diventa un input con Enter=salva, Esc=annulla. Chip vuoto = "+ tag".
- **Filtro dinamico**: il dropdown "Tutti i tag" nella lista magazzino è popolato solo con i tag realmente usati (non più valori fissi).
- **Download pubblici**: creato `/downloads/` con `index.html` che espone: build online (zip 2 MB), file offline (2.6 MB), guida migrazione smartphone, guida tecnica.

### Iteration 10 (11 Feb 2026)
- **Tasti stato separati**: `status-espletato-{wr}` (verde) e `status-sospeso-{wr}` (giallo). Il vecchio toggle unico è rimosso.
- **Scanner migliorato**: 
  - Genera automaticamente immagine PNG pulita del seriale (CODE128 barcode + QR + testo grande + data) — non più frame video sfocato
  - Torcia/flash toggle quando supportato dal device
  - Beep + vibrazione a scansione riuscita
  - Formati supportati estesi (CODE128, CODE39, CODE93, EAN, UPC, ITF, DataMatrix, PDF417, Aztec, QR)
  - Continuous focus + qrbox più ampio (85% viewport)
- **Storico seriale (Magazzino)**: cliccando un seriale si apre modal con timeline eventi (created, assigned, unassigned, downloaded on WR, manual_update, deleted). Endpoint `GET /api/inventory/serials/{sid}/history`.
- **Notifiche magazzino real-time**: campanella in header con badge unread, polling ogni 15s. Quando un tecnico sincronizza una nota, tutti gli admin + magazzino ricevono notifica con toast + vibrazione. Endpoints `/api/notifications`, `/notifications/{id}/read`, `/notifications/read-all`.
- **Export CSV magazzino**: pulsante nella pagina Magazzino → scarica `magazzino_YYYY-MM-DD.csv` con BOM UTF-8 per Excel. Endpoint `GET /api/inventory/export.csv` protetto RBAC.

## Data Models
```
users:         {id, email, name, password_hash, role, is_approved, created_at}
notes:         {id, user_id, wr, cliente, olo, splitter, via, n_porta_perm, porta_pte, cpe, ont_sfp, 
                indirizzo, pte_est, ts, tc, d, a, mono, internal, note_text, note_text_manual,
                photos[], pdf_filename, pdf_storage_path, status, suspend_reason,
                synced, synced_at, created_at, updated_at}
serials:       {id, serial, tipo, status, assigned_to_user_id, assigned_to_name,
                downloaded_by_user_id, downloaded_by_name, downloaded_at, note, created_at, updated_at}
serial_events: {id, serial, event_type, actor_id, actor_name, note_id, note_wr, extra{}, created_at}
notifications: {id, user_id, kind, message, from_user_name, note_id, note_wr, serials[], read, created_at}
```

## Key API Endpoints
- Auth: `POST /api/auth/login|register`, `GET /api/auth/me`, `GET/POST/DELETE /api/auth/admin/*`
- Notes: `POST /api/pdf/parse`, `GET|POST /api/notes`, `PATCH|DELETE /api/notes/{id}`, `POST /api/notes/bulk-delete`, `POST /api/notes/{id}/sync`, `POST /api/notes/{id}/photos`
- Inventory: `GET|POST /api/inventory/serials`, `POST /api/inventory/serials/bulk`, `PATCH|DELETE /api/inventory/serials/{sid}`, `GET /api/inventory/serials/{sid}/history`, `GET /api/inventory/export.csv`, `GET /api/inventory/users`
- Notifications: `GET /api/notifications`, `POST /api/notifications/{nid}/read`, `POST /api/notifications/read-all`

## Testing status
- Iteration 10 report: `/app/test_reports/iteration_10.json` — **100% pass** (5/5 backend pytest, frontend Playwright OK, code review passed with 2 minor stylistic notes non blockers).

## Backlog / Roadmap
### P1
- **QR Assegnazione utente**: generare QR per ogni utente da scansionare al magazzino per bulk-assign modem.
- **Offline HTML aggiornamento**: importare split-status buttons e immagine seriale generata (richiede inlining di ~40KB JsBarcode+QRCode UMD).
- **Notifiche push mobile**: usare Web Push API con service worker per notifiche fuori dall'app.

### P2
- **Refactor App.js** in cartelle `/components`, `/pages` per manutenibilità (attuale ~1700 righe).
- **Dashboard admin**: overview stato flotta modem + tecnici per periodo.
- **Backup automatico** MongoDB → export JSON schedulato.

## Migration guide (for user's own infra)
- Codice → **Save to GitHub** dalla chat (esporta repo completo)
- Database → **Republish → Database → Dump DB** (JSON compatibile con mongorestore)
- Env → **Republish → Secrets** (MONGO_URL, DB_NAME, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, EMERGENT_LLM_KEY)
- Auth: JWT-based custom (nessuna dipendenza da servizio esterno), bcrypt password hash. Seed admin al boot da ADMIN_EMAIL/PASSWORD env.

## Credentials
- Admin: `Giuseppe97belviso@gmail.com` / `Mucchetta4!` (vedere `/app/memory/test_credentials.md`)
