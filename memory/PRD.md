# PRD - Gestione Pratiche & Note Open Fiber (GC Impianti SNC)

## Problem Statement (verbatim)
Sito web per comporre automaticamente note strutturate da PDF pratica Open Fiber, con upload multiplo foto per nota e pulsante "Invia tramite Gmail" con destinatari fissi + oggetto = WR + corpo = nota. Copia nota rapida. Storico modificabile. Header con logo GC Impianti + Open Fiber + "creato e amministrato da Giuseppe Belviso".

## Users
- Tecnici / amministrazione GC Impianti SNC che processano pratiche Open Fiber.

## Core Requirements
- Parsing PDF multi/singola pratica; skip WR non numerici.
- Note nel formato: `WR:\n<cliente lowercase>\n<olo>\nBA_<splitter> <VIA...> PTE-EST PFS <n> PTE <n> TS TC D A MONO INT\nCPE:\n(ONT/SFP):`
- Estrazione automatica: Cliente, Descrizione OLO, PORTA_DI_USCITA_SPLITTER_PFS, NOME_PTE (dopo A662_ o `/`), N. PORTA PERM. (ultimo numero), PORTA_PTE (numero dopo `-P_`).
- Foto multi-upload per nota, persistenza su Emergent Object Storage.
- Copia nota + Invio Gmail (compose URL) con 5 destinatari fissi.
- Storico modificabile con ricerca WR/cliente/OLO.

## Architecture
- Backend: FastAPI + Motor/Mongo; pdfplumber per column-aware PDF extraction; Emergent Object Storage per PDF+foto.
- Frontend: React + Tailwind + Sonner toasts + lucide-react; single-page dashboard.
- Endpoints: `/api/pdf/parse`, `/api/notes` CRUD, `/api/notes/{id}/photos` (POST/DELETE), `/api/files?path=`.

## Implemented (2026-02)
- PDF parser column-aware con 100% accuracy sui 4 WR del PDF campione.
- Note CRUD + edit inline con ricomposizione automatica del testo.
- Upload/lista/cancellazione foto tramite Emergent Object Storage.
- Gmail compose diretto (mail.google.com/mail/?view=cm) con 5 recipients fissi.
- Copia nota clipboard + toast italiano.
- Header dual-logo (GC Impianti + Open Fiber) + credit Giuseppe Belviso.
- Search WR/cliente/OLO.
- Mobile responsive.

## Backlog / Next Steps
- P1 Statistiche pratiche (per data / OLO / cliente).
- P1 Export CSV / stampa nota diretta.
- P2 Firma foto con timestamp/GPS overlay.
- P2 Notifica sonora al completamento upload.
- P2 Autenticazione (login GC Impianti) se richiesta.
