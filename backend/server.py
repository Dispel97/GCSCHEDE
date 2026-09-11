from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Response, Query, Header, Request, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import io
import uuid
import logging
import requests
import pdfplumber
import bcrypt
import jwt
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from collections import defaultdict


mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ---------- Auth config ----------
JWT_SECRET = os.environ.get("JWT_SECRET", "insecure-fallback-change-me")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30
ADMIN_EMAIL = (os.environ.get("ADMIN_EMAIL") or "").strip().lower()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id, "email": email, "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    if not token:
        raise HTTPException(status_code=401, detail="Non autenticato")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token scaduto")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token non valido")
    user = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Utente non trovato")
    if not user.get("is_approved") and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Account in attesa di approvazione")
    return user


async def get_current_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Solo per amministratori")
    return user


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
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type},
                        data=data, timeout=120)
    if resp.status_code == 404:
        init_storage(force=True)
        resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": storage_key, "Content-Type": content_type},
                            data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": storage_key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------- PDF Parser ----------
def parse_openfiber_pdf(pdf_bytes: bytes):
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        page_data = []
        for page in pdf.pages:
            w = page.width
            h = page.height
            mid = w / 2
            header_text = page.crop((0, 0, w, 150)).extract_text() or ''
            left_text = page.crop((0, 150, mid + 10, h - 25)).extract_text() or ''
            right_text = page.crop((mid - 10, 150, w, h - 25)).extract_text() or ''
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

        m = re.search(r'Cliente:\s*(.*?)\s+Indiriz\.', d['header']); cliente = m.group(1).strip() if m else ''
        m = re.search(r'Descrizione OLO:\s*(\S+)', d['header']); olo = m.group(1).strip() if m else ''
        m = re.search(r'PORTA_DI_USCITA_SPLITTER_PFS\s*-\s*(\S+)', body); splitter = m.group(1).strip() if m else ''

        nome_pte = ''
        for src in [d['left'], d['right']]:
            m = re.search(r'NOME_PTE\s*-\s*([^\n]*(?:\n(?![A-Z_]+\s*-|\d+\s*-\s*[A-Z])[^\n]*)*)', src)
            if m:
                nome_pte = re.sub(r'\s+', ' ', m.group(1)).strip()
                break
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
            if nums: n_pp = str(int(nums[-1]))

        p_pte = ''
        for src in [d['left'], d['right']]:
            m = re.search(r'PORTA_PTE\s*-\s*([^\n]*(?:\n(?![A-Z_]+\s*-|\d+\s*-\s*[A-Z])[^\n]*)*)', src)
            if m:
                val = re.sub(r'\s+', ' ', m.group(1)).strip()
                mm = re.search(r'-P_?0*(\d+)', val)
                if mm: p_pte = mm.group(1); break

        m = re.search(r'Indiriz\.:\s*(.*?)\s+Comune:', d['header']); indirizzo = m.group(1).strip() if m else ''

        results.append({
            'wr': wr, 'is_numeric': wr.isdigit(),
            'cliente': cliente, 'olo': olo, 'splitter': splitter, 'via': via,
            'nome_pte_raw': nome_pte, 'n_porta_perm': n_pp, 'porta_pte': p_pte,
            'indirizzo': indirizzo,
        })
    return results


def compose_note(cliente, olo, splitter, via, n_porta_perm, porta_pte,
                 cpe='', ont_sfp='', wr='',
                 pte_est='PTE-EST', ts='TS', tc='TC', d='D', a='A',
                 mono='MONO', internal='INT'):
    parts = [splitter, via, pte_est, f"PFS {n_porta_perm}", f"PTE {porta_pte}",
             ts, tc, d, a, mono, internal]
    tech = " ".join([str(p) for p in parts if p is not None and str(p).strip() != ''])
    return (f"WR: {wr}\n{(cliente or '').lower()}\n{olo}\n{tech}\n"
            f"CPE: {cpe}\n(ONT/SFP): {ont_sfp}")


def regenerate_note_text(doc):
    return compose_note(
        doc.get('cliente', ''), doc.get('olo', ''), doc.get('splitter', ''),
        doc.get('via', ''), doc.get('n_porta_perm', ''), doc.get('porta_pte', ''),
        doc.get('cpe', ''), doc.get('ont_sfp', ''), doc.get('wr', ''),
        doc.get('pte_est', 'PTE-EST'), doc.get('ts', 'TS'), doc.get('tc', 'TC'),
        doc.get('d', 'D'), doc.get('a', 'A'), doc.get('mono', 'MONO'), doc.get('internal', 'INT'),
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
    user_id: str = ''
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
    ts: str = 'TS'; tc: str = 'TC'; d: str = 'D'; a: str = 'A'
    mono: str = 'MONO'; internal: str = 'INT'
    note_text: str = ''
    note_text_manual: bool = False
    photos: List[Photo] = Field(default_factory=list)
    pdf_filename: str = ''
    pdf_storage_path: str = ''
    status: str = 'espletato'  # espletato | sospeso
    suspend_reason: str = ''
    synced: bool = False
    synced_at: str = ''
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
    ts: Optional[str] = None; tc: Optional[str] = None
    d: Optional[str] = None; a: Optional[str] = None
    mono: Optional[str] = None; internal: Optional[str] = None
    note_text: Optional[str] = None
    note_text_manual: Optional[bool] = None
    status: Optional[str] = None
    suspend_reason: Optional[str] = None


class BulkDeleteRequest(BaseModel):
    ids: List[str]


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = ''


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ApproveRequest(BaseModel):
    role: Optional[str] = "user"  # "user" | "magazzino"


class SerialItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    serial: str
    tipo: str = "CPE"  # CPE | ONT | ALTRO
    status: str = "in_stock"  # in_stock | assegnato | scaricato
    assigned_to_user_id: str = ""
    assigned_to_name: str = ""
    downloaded_by_user_id: str = ""
    downloaded_by_name: str = ""
    downloaded_at: str = ""
    note: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class SerialCreate(BaseModel):
    serial: str
    tipo: str = "CPE"
    note: str = ""
    assigned_to_user_id: Optional[str] = ""


class SerialUpdate(BaseModel):
    serial: Optional[str] = None
    tipo: Optional[str] = None
    status: Optional[str] = None
    assigned_to_user_id: Optional[str] = None
    note: Optional[str] = None


class BulkSerialsRequest(BaseModel):
    serials: List[str]
    tipo: str = "CPE"


# ---------- Auth Routes ----------
@api_router.post("/auth/register")
async def register(req: RegisterRequest):
    email = req.email.lower().strip()
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password troppo corta (min 6 caratteri)")
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email già registrata")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id, "email": email, "name": (req.name or '').strip(),
        "password_hash": hash_password(req.password),
        "role": "user", "is_approved": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(dict(doc))
    return {"id": user_id, "email": email, "is_approved": False,
            "message": "Registrazione riuscita. Attendi l'approvazione dell'amministratore."}


@api_router.post("/auth/login")
async def login(req: LoginRequest):
    email = req.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(req.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Email o password non corretti")
    if not user.get("is_approved") and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Account in attesa di approvazione dell'amministratore")
    token = create_access_token(user["id"], user["email"], user.get("role", "user"))
    return {
        "access_token": token, "token_type": "bearer",
        "user": {"id": user["id"], "email": user["email"], "name": user.get("name", ""),
                 "role": user.get("role", "user"), "is_approved": user.get("is_approved", False)},
    }


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {"id": user["id"], "email": user["email"], "name": user.get("name", ""),
            "role": user.get("role", "user"), "is_approved": user.get("is_approved", False)}


@api_router.get("/auth/admin/users")
async def admin_list_users(admin: dict = Depends(get_current_admin)):
    docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)
    return docs


@api_router.get("/auth/admin/pending")
async def admin_list_pending(admin: dict = Depends(get_current_admin)):
    docs = await db.users.find({"is_approved": False, "role": {"$ne": "admin"}},
                               {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)
    return docs


@api_router.post("/auth/admin/approve/{user_id}")
async def admin_approve(user_id: str, body: Optional[ApproveRequest] = None,
                        admin: dict = Depends(get_current_admin)):
    role = (body.role if body else "user") or "user"
    if role not in ("user", "magazzino"):
        raise HTTPException(status_code=400, detail="Ruolo non valido")
    res = await db.users.update_one({"id": user_id, "role": {"$ne": "admin"}},
                                    {"$set": {"is_approved": True, "role": role}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    return {"approved": True, "id": user_id, "role": role}


@api_router.post("/auth/admin/set-role/{user_id}")
async def admin_set_role(user_id: str, body: ApproveRequest,
                         admin: dict = Depends(get_current_admin)):
    role = body.role or "user"
    if role not in ("user", "magazzino"):
        raise HTTPException(status_code=400, detail="Ruolo non valido")
    res = await db.users.update_one({"id": user_id, "role": {"$ne": "admin"}},
                                    {"$set": {"role": role}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    return {"id": user_id, "role": role}


@api_router.post("/auth/admin/revoke/{user_id}")
async def admin_revoke(user_id: str, admin: dict = Depends(get_current_admin)):
    res = await db.users.update_one({"id": user_id, "role": {"$ne": "admin"}},
                                    {"$set": {"is_approved": False}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Utente non trovato o non modificabile")
    return {"revoked": True, "id": user_id}


@api_router.delete("/auth/admin/users/{user_id}")
async def admin_delete_user(user_id: str, admin: dict = Depends(get_current_admin)):
    user = await db.users.find_one({"id": user_id})
    if not user or user.get("role") == "admin":
        raise HTTPException(status_code=404, detail="Utente non eliminabile")
    await db.users.delete_one({"id": user_id})
    # Cascade delete notes owned
    await db.notes.delete_many({"user_id": user_id})
    return {"deleted": True}


# ---------- Note Routes ----------
@api_router.get("/")
async def root():
    return {"message": "OpenFiber Notes API"}


@api_router.post("/pdf/parse")
async def parse_pdf(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Deve essere un file PDF")
    data = await file.read()

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
            user_id=user["id"],
            wr=item['wr'], cliente=item['cliente'], olo=item['olo'],
            splitter=item['splitter'], via=item['via'],
            n_porta_perm=item['n_porta_perm'], porta_pte=item['porta_pte'],
            indirizzo=item['indirizzo'],
            pdf_filename=file.filename, pdf_storage_path=pdf_path,
        )
        note.note_text = regenerate_note_text(note.model_dump())
        doc = note.model_dump()
        await db.notes.insert_one(dict(doc))
        created_notes.append(doc)

    skipped = [p['wr'] for p in parsed if not p['is_numeric']]
    return {"created_count": len(created_notes), "skipped_wr": skipped,
            "notes": created_notes, "pdf_storage_path": pdf_path,
            "pdf_filename": file.filename}


@api_router.get("/notes")
async def list_notes(search: str = Query(''), user: dict = Depends(get_current_user)):
    q = {"user_id": user["id"]}
    if search:
        rx = {"$regex": re.escape(search), "$options": "i"}
        q = {"$and": [q, {"$or": [{"wr": rx}, {"cliente": rx}, {"olo": rx}]}]}
    docs = await db.notes.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return docs


async def _get_own_note(note_id: str, user: dict) -> dict:
    doc = await db.notes.find_one({"id": note_id, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Nota non trovata")
    return doc


@api_router.get("/notes/{note_id}")
async def get_note(note_id: str, user: dict = Depends(get_current_user)):
    return await _get_own_note(note_id, user)


@api_router.patch("/notes/{note_id}")
async def update_note(note_id: str, upd: NoteUpdate, user: dict = Depends(get_current_user)):
    doc = await _get_own_note(note_id, user)
    updates = {k: v for k, v in upd.model_dump().items() if v is not None}
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
async def regenerate_note(note_id: str, user: dict = Depends(get_current_user)):
    doc = await _get_own_note(note_id, user)
    doc['note_text'] = regenerate_note_text(doc)
    doc['note_text_manual'] = False
    doc['updated_at'] = datetime.now(timezone.utc).isoformat()
    await db.notes.update_one({"id": note_id}, {"$set": doc})
    return doc


@api_router.delete("/notes/{note_id}")
async def delete_note(note_id: str, user: dict = Depends(get_current_user)):
    await _get_own_note(note_id, user)
    res = await db.notes.delete_one({"id": note_id, "user_id": user["id"]})
    return {"deleted": res.deleted_count}


@api_router.post("/notes/bulk-delete")
async def bulk_delete_notes(req: BulkDeleteRequest, user: dict = Depends(get_current_user)):
    if not req.ids:
        return {"deleted": 0}
    res = await db.notes.delete_many({"id": {"$in": req.ids}, "user_id": user["id"]})
    return {"deleted": res.deleted_count}


@api_router.post("/notes/{note_id}/photos")
async def upload_photos(note_id: str, files: List[UploadFile] = File(...),
                        user: dict = Depends(get_current_user)):
    doc = await _get_own_note(note_id, user)
    photos = doc.get('photos', [])
    for f in files:
        ext = (f.filename.rsplit('.', 1)[-1] if '.' in f.filename else 'jpg').lower()
        path = f"{APP_NAME}/photos/{note_id}/{uuid.uuid4()}.{ext}"
        data = await f.read()
        put_object(path, data, f.content_type or "image/jpeg")
        photos.append({"id": str(uuid.uuid4()), "storage_path": path,
                       "filename": f.filename, "content_type": f.content_type or "image/jpeg"})
    await db.notes.update_one({"id": note_id},
                              {"$set": {"photos": photos,
                                        "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"photos": photos}


@api_router.delete("/notes/{note_id}/photos/{photo_id}")
async def delete_photo(note_id: str, photo_id: str, user: dict = Depends(get_current_user)):
    doc = await _get_own_note(note_id, user)
    photos = [p for p in doc.get('photos', []) if p.get('id') != photo_id]
    await db.notes.update_one({"id": note_id},
                              {"$set": {"photos": photos,
                                        "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"photos": photos}


@api_router.get("/files")
async def download_file(path: str = Query(...)):
    try:
        data, ct = get_object(path)
    except Exception:
        raise HTTPException(status_code=404, detail="File non trovato")
    return Response(content=data, media_type=ct)


# ---------- Inventory / Magazzino ----------
async def get_magazzino_or_admin(user: dict = Depends(get_current_user)) -> dict:
    role = user.get("role")
    if role not in ("admin", "magazzino"):
        raise HTTPException(status_code=403, detail="Accesso riservato al magazzino / admin")
    return user


def _serial_from_doc(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


@api_router.get("/inventory/serials")
async def list_serials(
    search: str = Query(''),
    status: str = Query(''),
    tipo: str = Query(''),
    user: dict = Depends(get_magazzino_or_admin),
):
    q = {}
    if status:
        q["status"] = status
    if tipo:
        q["tipo"] = tipo
    if search:
        rx = {"$regex": re.escape(search), "$options": "i"}
        q = {"$and": [q, {"$or": [{"serial": rx}, {"assigned_to_name": rx}, {"downloaded_by_name": rx}]}]} if q else {"$or": [{"serial": rx}, {"assigned_to_name": rx}, {"downloaded_by_name": rx}]}
    docs = await db.serials.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return docs


@api_router.post("/inventory/serials")
async def create_serial(req: SerialCreate, user: dict = Depends(get_magazzino_or_admin)):
    serial = (req.serial or "").strip()
    if not serial:
        raise HTTPException(status_code=400, detail="Seriale richiesto")
    if await db.serials.find_one({"serial": serial}):
        raise HTTPException(status_code=400, detail="Seriale già presente")
    item = SerialItem(serial=serial, tipo=req.tipo or "CPE", note=req.note or "")
    if req.assigned_to_user_id:
        u = await db.users.find_one({"id": req.assigned_to_user_id})
        if u:
            item.assigned_to_user_id = u["id"]
            item.assigned_to_name = u.get("name") or u.get("email") or ""
            item.status = "assegnato"
    doc = item.model_dump()
    await db.serials.insert_one(dict(doc))
    return doc


@api_router.post("/inventory/serials/bulk")
async def create_serials_bulk(req: BulkSerialsRequest, user: dict = Depends(get_magazzino_or_admin)):
    created, skipped = [], []
    for raw in req.serials:
        s = (raw or "").strip()
        if not s:
            continue
        if await db.serials.find_one({"serial": s}):
            skipped.append(s); continue
        item = SerialItem(serial=s, tipo=req.tipo or "CPE")
        d = item.model_dump()
        await db.serials.insert_one(dict(d))
        created.append(d)
    return {"created": len(created), "skipped": skipped, "items": created}


@api_router.patch("/inventory/serials/{sid}")
async def update_serial(sid: str, upd: SerialUpdate, user: dict = Depends(get_magazzino_or_admin)):
    doc = await db.serials.find_one({"id": sid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Seriale non trovato")
    updates = {k: v for k, v in upd.model_dump().items() if v is not None}
    if "assigned_to_user_id" in updates:
        uid = updates["assigned_to_user_id"]
        if uid:
            u = await db.users.find_one({"id": uid})
            if not u:
                raise HTTPException(status_code=400, detail="Utente assegnatario inesistente")
            updates["assigned_to_user_id"] = u["id"]
            updates["assigned_to_name"] = u.get("name") or u.get("email") or ""
            if doc.get("status") == "in_stock":
                updates["status"] = "assegnato"
        else:
            updates["assigned_to_user_id"] = ""
            updates["assigned_to_name"] = ""
            if doc.get("status") == "assegnato":
                updates["status"] = "in_stock"
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.serials.update_one({"id": sid}, {"$set": updates})
    fresh = await db.serials.find_one({"id": sid}, {"_id": 0})
    return fresh


@api_router.delete("/inventory/serials/{sid}")
async def delete_serial(sid: str, user: dict = Depends(get_magazzino_or_admin)):
    res = await db.serials.delete_one({"id": sid})
    return {"deleted": res.deleted_count}


@api_router.get("/inventory/users")
async def list_users_for_assignment(user: dict = Depends(get_magazzino_or_admin)):
    docs = await db.users.find({"is_approved": True, "role": {"$in": ["user", "admin"]}},
                               {"_id": 0, "password_hash": 0}).sort("email", 1).to_list(500)
    return docs


# ---------- Note Sync (marks CPE + ONT serials as scaricato) ----------
@api_router.post("/notes/{note_id}/sync")
async def sync_note_serials(note_id: str, user: dict = Depends(get_current_user)):
    doc = await _get_own_note(note_id, user)
    updates_count = 0
    now_iso = datetime.now(timezone.utc).isoformat()
    display_name = user.get("name") or user.get("email") or user.get("id")
    for field, tipo in (("cpe", "CPE"), ("ont_sfp", "ONT")):
        raw = (doc.get(field) or "").strip()
        if not raw:
            continue
        existing = await db.serials.find_one({"serial": raw})
        if existing:
            await db.serials.update_one(
                {"id": existing["id"]},
                {"$set": {
                    "status": "scaricato",
                    "downloaded_by_user_id": user["id"],
                    "downloaded_by_name": display_name,
                    "downloaded_at": now_iso,
                    "updated_at": now_iso,
                }},
            )
        else:
            item = SerialItem(
                serial=raw, tipo=tipo, status="scaricato",
                downloaded_by_user_id=user["id"], downloaded_by_name=display_name,
                downloaded_at=now_iso,
            )
            await db.serials.insert_one(dict(item.model_dump()))
        updates_count += 1
    await db.notes.update_one({"id": note_id},
                              {"$set": {"synced": True, "synced_at": now_iso, "updated_at": now_iso}})
    fresh = await db.notes.find_one({"id": note_id}, {"_id": 0})
    return {"synced": updates_count, "note": fresh}


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


async def seed_admin():
    if not ADMIN_EMAIL or not ADMIN_PASSWORD:
        logger.warning("ADMIN_EMAIL / ADMIN_PASSWORD non impostati; salto seed admin")
        return
    existing = await db.users.find_one({"email": ADMIN_EMAIL})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "email": ADMIN_EMAIL, "name": "Giuseppe Belviso",
            "password_hash": hash_password(ADMIN_PASSWORD),
            "role": "admin", "is_approved": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Admin creato: {ADMIN_EMAIL}")
    else:
        # Keep admin's password in sync with .env AND ensure role/approved flags
        update = {"role": "admin", "is_approved": True}
        if not verify_password(ADMIN_PASSWORD, existing.get("password_hash", "")):
            update["password_hash"] = hash_password(ADMIN_PASSWORD)
        await db.users.update_one({"email": ADMIN_EMAIL}, {"$set": update})
        logger.info(f"Admin verificato: {ADMIN_EMAIL}")


@app.on_event("startup")
async def startup():
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    try:
        await db.users.create_index("email", unique=True)
        await db.serials.create_index("serial", unique=True)
        await seed_admin()
    except Exception as e:
        logger.error(f"Admin seed failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
