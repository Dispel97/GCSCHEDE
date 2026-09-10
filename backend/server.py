from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Response, Query, Header
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
                 cpe: str = '', ont_sfp: str = '', wr: str = '') -> str:
    tech = f"{splitter} {via} PTE-EST PFS {n_porta_perm} PTE {porta_pte} TS TC D A MONO INT"
    return (
        f"WR: {wr}\n"
        f"{cliente.lower()}\n"
        f"{olo}\n"
        f"{tech}\n"
        f"CPE: {cpe}\n"
        f"(ONT/SFP): {ont_sfp}"
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
    note_text: str = ''
    photos: List[Photo] = Field(default_factory=list)
    pdf_filename: str = ''
    pdf_storage_path: str = ''
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


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "OpenFiber Notes API"}


@api_router.post("/pdf/parse")
async def parse_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Deve essere un file PDF")
    data = await file.read()

    # Persist PDF for later attachment/redownload
    pdf_path = f"{APP_NAME}/pdfs/{uuid.uuid4()}.pdf"
    try:
        put_object(pdf_path, data, "application/pdf")
    except Exception as e:
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
        )
        note.note_text = compose_note(
            note.cliente, note.olo, note.splitter, note.via,
            note.n_porta_perm, note.porta_pte, note.cpe, note.ont_sfp, note.wr
        )
        doc = note.model_dump()
        await db.notes.insert_one(doc)
        created_notes.append(note.model_dump())

    skipped = [p['wr'] for p in parsed if not p['is_numeric']]
    return {
        "created_count": len(created_notes),
        "skipped_wr": skipped,
        "notes": created_notes,
        "pdf_storage_path": pdf_path,
        "pdf_filename": file.filename,
    }


@api_router.get("/notes")
async def list_notes(search: str = Query('', description="filter WR/cliente/OLO")):
    q = {}
    if search:
        rx = {"$regex": re.escape(search), "$options": "i"}
        q = {"$or": [{"wr": rx}, {"cliente": rx}, {"olo": rx}]}
    docs = await db.notes.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return docs


@api_router.get("/notes/{note_id}")
async def get_note(note_id: str):
    doc = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Nota non trovata")
    return doc


@api_router.patch("/notes/{note_id}")
async def update_note(note_id: str, upd: NoteUpdate):
    doc = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Nota non trovata")
    updates = {k: v for k, v in upd.model_dump().items() if v is not None}
    doc.update(updates)
    doc['note_text'] = compose_note(
        doc.get('cliente', ''), doc.get('olo', ''), doc.get('splitter', ''),
        doc.get('via', ''), doc.get('n_porta_perm', ''), doc.get('porta_pte', ''),
        doc.get('cpe', ''), doc.get('ont_sfp', ''), doc.get('wr', '')
    )
    doc['updated_at'] = datetime.now(timezone.utc).isoformat()
    await db.notes.update_one({"id": note_id}, {"$set": doc})
    return doc


@api_router.delete("/notes/{note_id}")
async def delete_note(note_id: str):
    res = await db.notes.delete_one({"id": note_id})
    return {"deleted": res.deleted_count}


class BulkDeleteRequest(BaseModel):
    ids: List[str]


@api_router.post("/notes/bulk-delete")
async def bulk_delete_notes(req: BulkDeleteRequest):
    if not req.ids:
        return {"deleted": 0}
    res = await db.notes.delete_many({"id": {"$in": req.ids}})
    return {"deleted": res.deleted_count}


@api_router.post("/notes/{note_id}/photos")
async def upload_photos(note_id: str, files: List[UploadFile] = File(...)):
    doc = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Nota non trovata")
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
async def delete_photo(note_id: str, photo_id: str):
    doc = await db.notes.find_one({"id": note_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Nota non trovata")
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
    except Exception as e:
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
