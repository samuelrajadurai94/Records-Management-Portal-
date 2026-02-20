"""
services/segregation.py
-----------------------
Virtual (no-file-move) Auto Folder Segregation for Box files.


Phase 1 – Folder-name keyword matching (fast, no PDF reading)
Phase 2 – PDF content classification via OCR + AI model (for unmatched PDFs)

All results are saved to the segregation_results DB table.
"""

import os
import re
import tempfile
import time
from io import BytesIO
from pathlib import Path

import fitz          # PyMuPDF
import joblib
import nltk
import ocrmypdf
import pandas as pd
from nltk import word_tokenize
from nltk.corpus import words as nltk_words
from sqlalchemy.orm import Session

import models
from services.box_service import box_service
from dotenv import load_dotenv

load_dotenv()

# ─────────────────────────────────────────────────────────────
# CONFIG & RESOURCES
# ─────────────────────────────────────────────────────────────
BACKEND_DIR = Path(__file__).parent.parent
MODEL_PATH       = BACKEND_DIR / "Model" / os.getenv("MODEL_NAME")
VECTORIZER_PATH  = BACKEND_DIR / "Model" / os.getenv("VECTORIZER_NAME")
KEYWORDS_CSV     = BACKEND_DIR / "Source" / "Keywords_30_7_25.csv"
READABILITY_THRESHOLD = float(os.getenv("READABILITY_THRESHOLD", "0.4"))
AI_MODEL_CONF    = float(os.getenv("AI_MODEL_CONF", "0.0"))

# ── OCR Tool Paths ─────────────────────────────────────────────────────────
# ocrmypdf calls Tesseract and Ghostscript directly as subprocesses —
# BOTH must be discoverable via PATH (setting pytesseract.cmd alone is NOT enough).
_tess_env = os.getenv("TESSERACT_PATH", "")
_gs_env   = os.getenv("GS_PATH", "")
TESSERACT_EXE = str(BACKEND_DIR / _tess_env) if _tess_env else ""
GS_EXE        = str(BACKEND_DIR / _gs_env)   if _gs_env   else ""

# Build extra PATH entries: add Tesseract dir + Ghostscript bin dir
_extra_paths = []
if TESSERACT_EXE and Path(TESSERACT_EXE).exists():
    _extra_paths.append(str(Path(TESSERACT_EXE).parent))
    print(f"[Segregation] ✔ Tesseract  : {TESSERACT_EXE}")
else:
    print(f"[Segregation] ✘ Tesseract not found at '{TESSERACT_EXE}'")

if GS_EXE and Path(GS_EXE).exists():
    _extra_paths.append(str(Path(GS_EXE).parent))
    print(f"[Segregation] ✔ Ghostscript: {GS_EXE}")
else:
    print(f"[Segregation] ✘ Ghostscript not found at '{GS_EXE}'")

if _extra_paths:
    os.environ["PATH"] = os.pathsep.join(_extra_paths) + os.pathsep + os.environ.get("PATH", "")

# Verify discovery for logging
import shutil
_tess_found = shutil.which("tesseract")
_gs_found   = shutil.which("gswin64c") or shutil.which("gs")
print(f"[Segregation] shutil.which(tesseract): {_tess_found}")
print(f"[Segregation] shutil.which(ghostscript): {_gs_found}")

# Set TESSDATA_PREFIX (directory containing tessdata folder)
if TESSERACT_EXE and Path(TESSERACT_EXE).exists():
    tessdata_path = BACKEND_DIR / "Source" / "Tesseract-OCR" / "tessdata"
    if tessdata_path.exists():
        os.environ["TESSDATA_PREFIX"] = str(tessdata_path)
        print(f"[Segregation] TESSDATA_PREFIX: {tessdata_path}")

# Also set pytesseract cmd (used by any direct pytesseract calls)
import pytesseract
if TESSERACT_EXE and Path(TESSERACT_EXE).exists():
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_EXE


# Lazy-loaded singletons
_model      = None
_vectorizer = None
_eng_vocab  = None
_keyword_csv = None

def _get_model():
    global _model, _vectorizer
    if _model is None:
        _model      = joblib.load(MODEL_PATH)
        _vectorizer = joblib.load(VECTORIZER_PATH)
    return _model, _vectorizer

def _get_vocab():
    global _eng_vocab
    if _eng_vocab is None:
        _eng_vocab = set(nltk_words.words())
    return _eng_vocab

def _get_keyword_csv():
    global _keyword_csv
    if _keyword_csv is None and KEYWORDS_CSV.exists():
        _keyword_csv = pd.read_csv(KEYWORDS_CSV, na_values=["", " "])
    return _keyword_csv

# ─────────────────────────────────────────────────────────────
# TEXT HELPERS  (same as desktop app)
# ─────────────────────────────────────────────────────────────
def _remove_symbols(text: str) -> str:
    text = re.sub(r"[^a-zA-Z\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()

STOPLIST = [
    "this", "page", "contains", "no", "technical", "data", "subject",
    "to", "the", "ear", "or", "itar", "export", "control", "restrictions",
    "on", "first", "cover", "of", "document",
]

def _check_readability(text, threshold=READABILITY_THRESHOLD, min_len=2):
    if not text.strip():
        return False, 0.0, []
    tokens = word_tokenize(text)
    filtered = [w for w in tokens if len(w) >= min_len]
    if not filtered:
        return False, 0.0, []
    vocab = _get_vocab()
    valid = [w for w in filtered if w.lower() in vocab]
    ratio = len(valid) / len(filtered)
    return ratio >= threshold, ratio, valid

def _is_direct_keyword(text: str, keywords: list) -> bool:
    for line in text.lower().splitlines():
        clean = line.strip()
        if not clean:
            continue
        for kw in keywords:
            if kw.lower() in clean:
                return True
    return False

def _label_from_keyword_csv(page_texts: list) -> str | None:
    kdf = _get_keyword_csv()
    if kdf is None or not page_texts:
        return None
    combined = " ".join(page_texts)
    for col in kdf.columns:
        kwds = list(kdf[col].dropna())
        if _is_direct_keyword(combined, kwds):
            return col
    return None

def _predict_with_model(text: str):
    mdl, vec = _get_model()
    X = vec.transform([text])
    pred = mdl.predict(X)[0]
    conf = mdl.predict_proba(X).max()
    return pred, float(conf)

# ─────────────────────────────────────────────────────────────
# PHASE 1 — FOLDER NAME KEYWORD MATCHING
# mirrors move_matching_folders() from desktop app
# ─────────────────────────────────────────────────────────────
MEDIA_EXTENSIONS = {".mp4", ".png", ".jpeg", ".jpg", ".tif", ".heic", ".bmp"}

FOLDER_RULES = [
    # (category_name, keywords, is_regex_AD_SB)
    ("Engine Data Plate",          ["data plate"],                                          False),
    ("14. Shop Visit Records",     ["sv", "shop", "visit"],                                 False),
    ("20. LLP BTB Trace",          ["btb", "back to birth", "llp btb", "llp traces"],       False),
    ("12. Manufacturer Delivery Docs", ["manufacture", "export certificate", "export cofa"], False),
    ("17. Commercial",             ["commercial"],                                           False),
    ("Historical Misc",            ["historical miscellaneous", "misc", "miscellaneous", "historical misc"], False),
    ("21. AD",                     ["AD"],                                                   "AD"),
    ("22. SB",                     ["SB"],                                                   "SB"),
    ("26. QEC-LRU Inventory",      ["QEC", "LRU", "Accessory", "accessory"],                False),
    ("Archive",                    ["archive"],                                              False),
]

# check_Matching_folder_name from desktop app (for archive subfolders)
def _category_from_text(text: str) -> str | None:
    t = _remove_symbols(text).lower()
    tr = _remove_symbols(text)   # preserve case for AD/SB checks
    checks = [
        (["engine status", "time", "cycle"],             "1. Certified statement of total time in service"),
        (["incident", "accident"],                        "2. Non-Incident-Accident Statement"),
        (["exceed", "exceedance"],                        "3. Non-exceedance Statement"),
        (["thrust", "thrust setting"],                    "4. Power-Thrust rating Statement"),
        (["fluid", "oil fluid"],                          "6. Oil-Fluid used Statement"),
        (["field repair"],                                "7. Field repairs Statement"),
        (["condition", "trend", "condition monitoring"],  "8. Engine Condition-Trend Monitoring Report"),
        (["oil consumption"],                             "9. Oil Consumption Reports"),
        (["last test cell", "testcell"],                  "10. Last Test Cell-MPA Report"),
        (["etop"],                                        "11. ETOPs compliance report"),
        (["manufacturer delivery"],                       "12. Manufacturer delivery docs"),
        (["logbook", "install removal history", "removal"], "13. Logbook & Install-Removal History"),
        (["release", "last release"],                     "15. Engine Last Release Certificate"),
        (["borescope"],                                   "16. Last Borescope Inspection"),
        (["commercial"],                                  "17. Commercial"),
        (["preservation"],                                "18. Preservation"),
        (["llp"],                                         "19. LLP Summary"),
        (["modification"],                                "23. In-House Modifications"),
        (["qec", "lru", "accessory"],                     "26. QEC-LRU Inventory"),
        (["ldnd"],                                        "27. LDND-MPD"),
        (["ferry", "ferry flight"],                       "29. Ferry flight"),
        (["thrust change", "thrust history"],             "30. Thrust Change(s)"),
    ]
    for kws, label in checks:
        if any(kw in t for kw in kws):
            return label
    if "PMA" in tr or "DER" in tr:
        return "5. PMA-DER Statement"
    if "AD" in tr:
        return "21. AD"
    if "SB" in tr:
        return "22. SB"
    return None

def _folder_keyword_match(folder_path: str, file_ext: str) -> str | None:
    """
    Try to assign a category solely from folder path + file extension.
    Returns category string or None.
    """
    # Media files → Borescope
    if file_ext.lower() in MEDIA_EXTENSIONS:
        return "16. Last Borescope Inspection"

    path_clean = _remove_symbols(folder_path)
    path_lower = path_clean.lower()

    for (category, keywords, rule_type) in FOLDER_RULES:
        if rule_type == "AD":
            if re.search(r'(?<!\w)[^\w]*AD[^\w]*(?!\w)', path_clean):
                return category
        elif rule_type == "SB":
            if re.search(r'(?<!\w)[^\w]*SB[^\w]*(?!\w)', path_clean):
                return category
        elif rule_type is False:
            # Special: manufacturer docs — exclude 'non'
            if category == "12. Manufacturer Delivery Docs":
                if any(kw in path_lower for kw in keywords) and "non" not in path_lower:
                    return category
            else:
                if any(kw.lower() in path_lower for kw in keywords):
                    # Archive rule: check parent for a matching label
                    if category == "Archive":
                        parts = folder_path.split("/")
                        parent_name = parts[-2] if len(parts) >= 2 else ""
                        label = _category_from_text(parent_name)
                        return label if label else "Archive"
                    return category
    return None

# ─────────────────────────────────────────────────────────────
# PHASE 2 — PDF CONTENT CLASSIFICATION
# ─────────────────────────────────────────────────────────────
def _classify_pdf_bytes(pdf_bytes: bytes, filename: str) -> dict:
    """
    Download PDF bytes, extract text, run OCR if needed, classify.
    Returns result dict matching SegregationResult fields.
    """
    result = {
        "prediction": "Manual Segregation",
        "confidence": 0.0,
        "method": "Manual",
        "status": "",
        "raw_text": "",
        "cleaned_text": "",
        "reason": "",
        "category": "Manual Segregation",
    }
    label = None

    try:
        pdf_doc = fitz.open(stream=BytesIO(pdf_bytes), filetype="pdf")
        page_texts = []
        all_text = ""
        for i in range(min(len(pdf_doc), 5)):
            t = pdf_doc[i].get_text("text")
            page_texts.append(t)
            all_text += t
        num_pages = len(pdf_doc)
        pdf_doc.close()

        clean = _remove_symbols(all_text)
        readable, score, valid = _check_readability(clean)
        final_valid = [w for w in valid if w.lower() not in STOPLIST]

        if not all_text.strip() or len(final_valid) < 3:
            # Try OCR
            with tempfile.NamedTemporaryFile(suffix="_in.pdf",  delete=False) as fin:
                fin.write(pdf_bytes)
                in_path = fin.name
            with tempfile.NamedTemporaryFile(suffix="_out.pdf", delete=False) as fout:
                out_path = fout.name
            try:
                ocrmypdf.ocr(
                    in_path, out_path,
                    deskew=True, rotate_pages=True, force_ocr=True,
                    progress_bar=False, pages="1-5",
                    jobs=1, tesseract_timeout=300
                )
                ocr_doc = fitz.open(out_path)
                ocr_page_texts = []
                ocr_text = ""
                for i in range(min(len(ocr_doc), 5)):
                    t = ocr_doc[i].get_text("text")
                    ocr_page_texts.append(t)
                    ocr_text += t
                ocr_doc.close()

                clean = _remove_symbols(ocr_text)
                readable, score, valid = _check_readability(clean)

                result["raw_text"]     = ocr_text
                result["cleaned_text"] = clean

                if readable and len(valid) > 10:
                    result["status"] = "OCR readable"
                    result["reason"] = f"OCR ratio: {score:.2f}"
                    if num_pages < 3:
                        label = _label_from_keyword_csv(ocr_page_texts[0])
                        if label is not None:
                            result["prediction"] = label
                            result["method"]     = "Direct Keyword"
                            result["category"]   = label
                    if not label:
                        pred, conf = _predict_with_model(clean)
                        result["prediction"] = pred
                        result["confidence"] = conf
                        result["method"]     = "AI MODEL"
                        result["category"]   = pred if conf >= AI_MODEL_CONF else "Manual Segregation"
                else:
                    result["status"] = "OCR not readable"
                    result["reason"] = f"OCR ratio: {score:.2f}"
            except Exception as e:
                result["status"] = "OCR error"
                result["reason"] = str(e)
            finally:
                for p in [in_path, out_path]:
                    try:
                        os.remove(p)
                    except Exception:
                        pass
        else:
            result["raw_text"]     = all_text
            result["cleaned_text"] = clean
            readable, score, valid = _check_readability(clean)
            final_valid = [w for w in valid if w.lower() not in STOPLIST]

            if readable and len(final_valid) > 10:
                result["status"] = "PDF readable"
                result["reason"] = f"PDF ratio: {score:.2f}"
                if num_pages < 3:
                    label = _label_from_keyword_csv(page_texts[0])
                    if label is not None:
                        result["prediction"] = label
                        result["method"]     = "Direct Keyword"
                        result["category"]   = label
                if not label:
                    pred, conf = _predict_with_model(clean)
                    result["prediction"] = pred
                    result["confidence"] = conf
                    result["method"]     = "AI MODEL"
                    result["category"]   = pred if conf >= AI_MODEL_CONF else "Manual Segregation"
            else:
                result["status"] = "PDF not readable"
                result["reason"] = f"PDF ratio: {score:.2f}"

    except Exception as e:
        result["status"] = "Error"
        result["reason"] = str(e)

    return result

# ─────────────────────────────────────────────────────────────
# BOX FOLDER WALKER
# ─────────────────────────────────────────────────────────────
def _walk_box_folder(folder_id: str, folder_path: str = "") -> list[dict]:
    """Recursively walk Box folder. Returns flat list of file dicts."""
    all_files = []
    items = box_service.get_folder_items(folder_id)

    for f in items["files"]:
        ext = ("." + f["name"].rsplit(".", 1)[-1]).lower() if "." in f["name"] else ""
        all_files.append({
            "box_file_id":   f["id"],
            "box_file_name": f["name"],
            "box_folder_id": folder_id,
            "original_folder_path": folder_path,
            "extension": ext,
            "size": f.get("size", 0),
        })

    for sub in items["folders"]:
        child_path = f"{folder_path}/{sub['name']}" if folder_path else sub["name"]
        all_files.extend(_walk_box_folder(sub["id"], child_path))

    return all_files

# ─────────────────────────────────────────────────────────────
# MAIN: PERFORM AUTO SEGREGATION
# ─────────────────────────────────────────────────────────────
# In-memory job status: engine_id -> "idle" | "running" | "done" | "error"
_job_status: dict[int, str] = {}

def get_job_status(engine_id: int) -> str:
    return _job_status.get(engine_id, "idle")

def perform_auto_segregation(engine_id: int, db: Session):
    """
    Full virtual segregation pipeline for a Box engine folder.
    Called in a background thread — no return value; results saved to DB.
    """
    _job_status[engine_id] = "running"
    try:
        engine = db.query(models.Engine).filter(models.Engine.id == engine_id).first()
        if not engine or not engine.box_folder_id:
            _job_status[engine_id] = "error"
            return

        # Find RAW FOLDER inside engine root
        root_items = box_service.get_folder_items(engine.box_folder_id)
        raw_folder = next(
            (f for f in root_items["folders"] if f["name"].upper() == "RAW FOLDER"), None
        )
        if not raw_folder:
            # Fall back to using the root folder directly
            raw_folder = {"id": engine.box_folder_id, "name": "ROOT"}

        # Walk entire Box tree
        all_files = _walk_box_folder(raw_folder["id"])

        # Clear previous results for this engine
        db.query(models.SegregationResult).filter(
            models.SegregationResult.engine_id == engine_id
        ).delete()
        db.commit()

        for file_info in all_files:
            result_data = {
                "engine_id":            engine_id,
                "box_file_id":          file_info["box_file_id"],
                "box_file_name":        file_info["box_file_name"],
                "box_folder_id":        file_info["box_folder_id"],
                "original_folder_path": file_info["original_folder_path"],
                "method":               "Unclassified",
                "status":               "",
                "raw_text":             "",
                "cleaned_text":         "",
                "reason":               "",
                "prediction":           "Manual Segregation",
                "confidence":           0.0,
                "category":             "Manual Segregation",
            }

            # Phase 1: folder keyword match
            category = _folder_keyword_match(
                file_info["original_folder_path"],
                file_info["extension"]
            )
            if category:
                result_data["category"]  = category
                result_data["method"]    = "Folder Match"
                result_data["prediction"] = category
                result_data["status"]    = "Folder matched"
            elif file_info["extension"] == ".pdf":
                # Phase 2: AI/OCR classification for unmatched PDFs
                try:
                    pdf_bytes = box_service.client.downloads.download_file(
                        file_info["box_file_id"]
                    ).read()
                    ai_result = _classify_pdf_bytes(pdf_bytes, file_info["box_file_name"])
                    result_data.update(ai_result)
                except Exception as e:
                    result_data["status"] = "Download error"
                    result_data["reason"] = str(e)
                    result_data["category"] = "Manual Segregation"
            else:
                # Non-PDF, non-media, not folder matched
                result_data["category"] = "Other File Types"
                result_data["method"]   = "Extension"
                result_data["status"]   = "Non-PDF non-media"

            db_row = models.SegregationResult(**result_data)
            db.add(db_row)

        db.commit()
        _job_status[engine_id] = "done"

    except Exception as e:
        _job_status[engine_id] = "error"
        print(f"Segregation failed for engine {engine_id}: {e}")
        import traceback
        traceback.print_exc()
