from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Response, Query, Header, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import io
import uuid
import logging
import requests
import pdfplumber
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
from collections import defaultdict


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ---------- Object Storage ----------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "openfiber-notes"
storage_key = None


def init_storage(force: bool = False):
    global storage_key
    if storage_key and not force:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if resp.status_code == 404:
        init_storage(force=True)
        key = storage_key
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        init_storage(force=True)
        key = storage_key
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------- Helpers ----------
def client_ip_from(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for") or ""
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else ""


def owner_query(owner_key: Optional[str], client_ip: str) -> dict:
    """Filter matches records for this device (owner_key) OR from same IP as fallback."""
    conds = []
    if owner_key:
        conds.append({"owner_key": owner_key})
    if client_ip:
        conds.append({"client_ip": client_ip, "owner_key": {"$in": ["", None]}})
    if not conds:
        return {"_never_match_": True}
    return {"$or": conds} if len(conds) > 1 else conds[0]


# ---------- PDF Parser ----------
def parse_openfiber_pdf(pdf_bytes: bytes):
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        page_data = []
        for page in pdf.pages:
            w = page.width
            h = page.height
            header_bbox = (0, 0, w, 150)
            body_top = 150
            body_bot = h - 25
            mid = w / 2
            header_text = page.crop(header_bbox).extract_text() or ''
            left_text = page.crop((0, body_top, mid + 10, body_bot)).extract_text() or ''
            right_text = page.crop((mid - 10, body_top, w, body_bot)).extract_text() or ''
            m = re.search(r'WR:\s*(\S+)', header_text)
            wr = m.group(1) if m else ''
            page_data.append({'wr': wr, 'header': header_text, 'left': left_text, 'right': right_text})

    grouped = defaultdict(lambda: {'header': '', 'left': '', 'right': ''})
    order = []
    for pd in page_data:
        wr = pd['wr']
        if not wr:
            continue
        if wr not in grouped:
            order.append(wr)
        grouped[wr]['header'] += "\n" + pd['header']
        grouped[wr]['left'] += "\n" + pd['left']
        grouped[wr]['right'] += "\n" + pd['right']

    results = []
    for wr in order:
        d = grouped[wr]
        body = d['left'] + "\n" + d['right']

        cliente = ''
        m = re.search(r'Cliente:\s*(.*?)\s+Indiriz\.', d['header'])
        if m:
            cliente = m.group(1).strip()

        olo = ''
        m = re.search(r'Descrizione OLO:\s*(\S+)', d['header'])
        if m:
            olo = m.group(1).strip()

        splitter = ''
        m = re.search(r'PORTA_DI_USCITA_SPLITTER_PFS\s*-\s*(\S+)', body)
        if m:
            splitter = m.group(1).strip()

        nome_pte = ''
        for src in [d['left'], d['right']]:
            m = re.search(r'NOME_PTE\s*-\s*([^\n]*(?:\n(?![A-Z_]+\s*-|\d+\s*-\s*[A-Z])[^\n]*)*)', src)
            if m:
                nome_pte = re.sub(r'\s+', ' ', m.group(1)).strip()
                break

        via = ''
        if 'A662_' in nome_pte:
            via = nome_pte.split('A662_', 1)[1].strip()
        elif '/' in nome_pte:
            via = nome_pte.rsplit('/', 1)[1].strip()
        else:
            via = nome_pte

        n_pp = ''
        m = re.search(r'N\.\s*PORTA PERM\.\s*-\s*(\S+)', body)
        if m:
            nums = re.findall(r'(\d+)', m.group(1))
            if nums:
                n_pp = str(int(nums[-1]))

        p_pte = ''
        for src in [d['left'], d['right']]:
            m = re.search(r'PORTA_PTE\s*-\s*([^\n]*(?:\n(?![A-Z_]+\s*-|\d+\s*-\s*[A-Z])[^\n]*)*)', src)
            if m:
                val = re.sub(r'\s+', ' ', m.group(1)).strip()
                mm = re.search(r'-P_?0*(\d+)', val)
                if mm:
                    p_pte = mm.group(1)
                    break

        indirizzo = ''
        m = re.search(r'Indiriz\.:\s*(.*?)\s+Comune:', d['header'])
        if m:
            indirizzo = m.group(1).strip()

        results.append({
            'wr': wr,
            'is_numeric': wr.isdigit(),
            'cliente': cliente,
            'olo': olo,
            'splitter': splitter,
            'via': via,
            'nome_pte_raw': nome_pte,
            'n_porta_perm': n_pp,
            'porta_pte': p_pte,
            'indirizzo': indirizzo,
        })
    return results


def compose_note(cliente: str, olo: str, splitter: str, via: str,
                 n_porta_perm: str, porta_pte: str,
                 cpe: str = '', ont_sfp: str = '', wr: str = '',
                 pte_est: str = 'PTE-EST',
                 ts: str = 'TS', tc: str = 'TC', d: str = 'D', a: str = 'A',
                 mono: str = 'MONO', internal: str = 'INT') -> str:
    tech_parts = [splitter, via, pte_est, f"PFS {n_porta_perm}", f"PTE {porta_pte}",
                  ts, tc, d, a, mono, internal]
    tech = " ".join([p for p in tech_parts if p is not None and p != ''])
    return (
        f"WR: {wr}\n"
        f"{cliente.lower()}\n"
        f"{olo}\n"
        f"{tech}\n"
        f"CPE: {cpe}\n"
        f"(ONT/SFP): {ont_sfp}"
    )


def regenerate_note_text(doc: dict) -> str:
    return compose_note(
        doc.get('cliente', ''), doc.get('olo', ''), doc.get('splitter', ''),
        doc.get('via', ''), doc.get('n_porta_perm', ''), doc.get('porta_pte', ''),
        doc.get('cpe', ''), doc.get('ont_sfp', ''), doc.get('wr', ''),
        doc.get('pte_est', 'PTE-EST'),
        doc.get('ts', 'TS'), doc.get('tc', 'TC'), doc.get('d', 'D'),
        doc.get('a', 'A'), doc.get('mono', 'MONO'), doc.get('internal', 'INT'),
    )


# ---------- Models ----------
class Photo(BaseModel):
    id: str
    storage_path: str
    filename: str
    content_type: str


class Note(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    wr: str
    cliente: str = ''
    olo: str = ''
    splitter: str = ''
    via: str = ''
    n_porta_perm: str = ''
    porta_pte: str = ''
    cpe: str = ''
    ont_sfp: str = ''
    indirizzo: str = ''
    pte_est: str = 'PTE-EST'
    ts: str = 'TS'
    tc: str = 'TC'
    d: str = 'D'
    a: str = 'A'
    mono: str = 'MONO'
    internal: str = 'INT'
    note_text: str = ''
    note_text_manual: bool = False
    photos: List[Photo] = Field(default_factory=list)
    pdf_filename: str = ''
    pdf_storage_path: str = ''
    owner_key: str = ''
    client_ip: str = ''
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class NoteUpdate(BaseModel):
    cliente: Optional[str] = None
    olo: Optional[str] = None
    splitter: Optional[str] = None
    via: Optional[str] = None
    n_porta_perm: Optional[str] = None
    porta_pte: Optional[str] = None
    cpe: Optional[str] = None
    ont_sfp: Optional[str] = None
    indirizzo: Optional[str] = None
    pte_est: Optional[str] = None
    ts: Optional[str] = None
    tc: Optional[str] = None
    d: Optional[str] = None
    a: Optional[str] = None
    mono: Optional[str] = None
    internal: Optional[str] = None
    note_text: Optional[str] = None
    note_text_manual: Optional[bool] = None


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "OpenFiber Notes API"}


@api_router.post("/pdf/parse")
async def parse_pdf(
    request: Request,
    file: UploadFile = File(...),
    x_owner_key: Optional[str] = Header(None, alias="X-Owner-Key"),
):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Deve essere un file PDF")
    data = await file.read()
    ip = client_ip_from(request)
    owner = x_owner_key or ''

    pdf_path = f"{APP_NAME}/pdfs/{uuid.uuid4()}.pdf"
    try:
        put_object(pdf_path, data, "application/pdf")
    except Exception:
        logging.exception("PDF storage failed")
        pdf_path = ''

    try:
        parsed = parse_openfiber_pdf(data)
    except Exception as e:
        logging.exception("PDF parse failed")
        raise HTTPException(status_code=400, detail=f"Impossibile leggere il PDF: {e}")

    created_notes = []
    for item in parsed:
        if not item['is_numeric']:
            continue
        note = Note(
            wr=item['wr'],
            cliente=item['cliente'],
            olo=item['olo'],
            splitter=item['splitter'],
            via=item['via'],
            n_porta_perm=item['n_porta_perm'],
            porta_pte=item['porta_pte'],
            indirizzo=item['indirizzo'],
            pdf_filename=file.filename,
            pdf_storage_path=pdf_path,
            owner_key=owner,
            client_ip=ip,
        )
        note.note_text = regenerate_note_text(note.model_dump())
        doc = note.model_dump()
        await db.notes.insert_one(dict(doc))
        created_notes.append(doc)

    skipped = [p['wr'] for p in parsed if not p['is_numeric']]
    return {
        "created_count": len(created_notes),
        "skipped_wr": skipped,
        "notes": created_notes,
        "pdf_storage_path": pdf_path,
        "pdf_filename": file.filename,
    }


@api_router.get("/notes")
async def list_notes(
    request: Request,
    search: str = Query(''),
    x_owner_key: Optional[str] = Header(None, alias="X-Owner-Key"),
):
    ip = client_ip_from(request)
    q = owner_query(x_owner_key, ip)
    if search:
        rx = {"$regex": re.escape(search), "$options": "i"}
        q = {"$and": [q, {"$or": [{"wr": rx}, {"cliente": rx}, {"olo": rx}]}]}
    docs = await db.notes.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return docs


async def _authorize_note(note_id: str, owner_key: Optional[str], ip: str) -> dict:
    doc = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Nota non trovata")
    note_owner = doc.get('owner_key') or ''
    note_ip = doc.get('client_ip') or ''
    if note_owner:
        if note_owner != (owner_key or ''):
            raise HTTPException(status_code=403, detail="Nota non accessibile da questo dispositivo")
    else:
        # legacy note without owner_key -> match by IP
        if note_ip and note_ip != ip:
            raise HTTPException(status_code=403, detail="Nota non accessibile da questo IP")
    return doc


@api_router.get("/notes/{note_id}")
async def get_note(
    note_id: str,
    request: Request,
    x_owner_key: Optional[str] = Header(None, alias="X-Owner-Key"),
):
    ip = client_ip_from(request)
    return await _authorize_note(note_id, x_owner_key, ip)


@api_router.patch("/notes/{note_id}")
async def update_note(
    note_id: str,
    upd: NoteUpdate,
    request: Request,
    x_owner_key: Optional[str] = Header(None, alias="X-Owner-Key"),
):
    ip = client_ip_from(request)
    doc = await _authorize_note(note_id, x_owner_key, ip)
    updates = {k: v for k, v in upd.model_dump().items() if v is not None}

    # If user directly edited note_text, mark manual and don't regenerate
    if 'note_text' in updates:
        doc.update(updates)
        doc['note_text_manual'] = updates.get('note_text_manual', True)
    else:
        doc.update(updates)
        if not doc.get('note_text_manual', False):
            doc['note_text'] = regenerate_note_text(doc)

    doc['updated_at'] = datetime.now(timezone.utc).isoformat()
    await db.notes.update_one({"id": note_id}, {"$set": doc})
    return doc


@api_router.post("/notes/{note_id}/regenerate")
async def regenerate_note(
    note_id: str,
    request: Request,
    x_owner_key: Optional[str] = Header(None, alias="X-Owner-Key"),
):
    ip = client_ip_from(request)
    doc = await _authorize_note(note_id, x_owner_key, ip)
    doc['note_text'] = regenerate_note_text(doc)
    doc['note_text_manual'] = False
    doc['updated_at'] = datetime.now(timezone.utc).isoformat()
    await db.notes.update_one({"id": note_id}, {"$set": doc})
    return doc


@api_router.delete("/notes/{note_id}")
async def delete_note(
    note_id: str,
    request: Request,
    x_owner_key: Optional[str] = Header(None, alias="X-Owner-Key"),
):
    ip = client_ip_from(request)
    await _authorize_note(note_id, x_owner_key, ip)
    res = await db.notes.delete_one({"id": note_id})
    return {"deleted": res.deleted_count}


class BulkDeleteRequest(BaseModel):
    ids: List[str]


@api_router.post("/notes/bulk-delete")
async def bulk_delete_notes(
    req: BulkDeleteRequest,
    request: Request,
    x_owner_key: Optional[str] = Header(None, alias="X-Owner-Key"),
):
    if not req.ids:
        return {"deleted": 0}
    ip = client_ip_from(request)
    # Only delete notes owned by this device/IP
    scope = owner_query(x_owner_key, ip)
    q = {"$and": [scope, {"id": {"$in": req.ids}}]}
    res = await db.notes.delete_many(q)
    return {"deleted": res.deleted_count}


@api_router.post("/notes/{note_id}/photos")
async def upload_photos(
    note_id: str,
    request: Request,
    files: List[UploadFile] = File(...),
    x_owner_key: Optional[str] = Header(None, alias="X-Owner-Key"),
):
    ip = client_ip_from(request)
    doc = await _authorize_note(note_id, x_owner_key, ip)
    photos = doc.get('photos', [])
    for f in files:
        ext = (f.filename.rsplit('.', 1)[-1] if '.' in f.filename else 'jpg').lower()
        path = f"{APP_NAME}/photos/{note_id}/{uuid.uuid4()}.{ext}"
        data = await f.read()
        put_object(path, data, f.content_type or "image/jpeg")
        photos.append({
            "id": str(uuid.uuid4()),
            "storage_path": path,
            "filename": f.filename,
            "content_type": f.content_type or "image/jpeg",
        })
    await db.notes.update_one(
        {"id": note_id},
        {"$set": {"photos": photos, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"photos": photos}


@api_router.delete("/notes/{note_id}/photos/{photo_id}")
async def delete_photo(
    note_id: str,
    photo_id: str,
    request: Request,
    x_owner_key: Optional[str] = Header(None, alias="X-Owner-Key"),
):
    ip = client_ip_from(request)
    doc = await _authorize_note(note_id, x_owner_key, ip)
    photos = [p for p in doc.get('photos', []) if p.get('id') != photo_id]
    await db.notes.update_one(
        {"id": note_id},
        {"$set": {"photos": photos, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"photos": photos}


@api_router.get("/files")
async def download_file(path: str = Query(...)):
    try:
        data, ct = get_object(path)
    except Exception:
        raise HTTPException(status_code=404, detail="File non trovato")
    return Response(content=data, media_type=ct)


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
