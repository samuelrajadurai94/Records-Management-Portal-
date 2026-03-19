"""
routers/segregation.py
----------------------
Endpoints for triggering and retrieving virtual folder segregation.
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.orm import Session
from sqlalchemy import text as sa_text
from collections import defaultdict
import re

import database, models, dependencies

#from services import segregation as seg_service 

import os 
from dotenv import load_dotenv
load_dotenv()

Extraction_Pipeline  = os.getenv("Extraction_Pipeline")
    #"Azure_ocr_rf_model"
if Extraction_Pipeline =="Azure_ocr_rf_model":
    from services import segregation_Azure_ocr_rf_model as seg_service
    print(Extraction_Pipeline)
elif Extraction_Pipeline == "ocmp_ocr_rf_model":
    from services import segregation as seg_service
    print(Extraction_Pipeline)
elif Extraction_Pipeline =="Azure_ocr_Gemini_model":
    from services import segregation_Azure_ocr_Gemini_model as seg_service
    print(Extraction_Pipeline)
elif Extraction_Pipeline =="Aws_textract_rf_model":
    from services import segregation_Aws_textract_rf_model as seg_service
    print(Extraction_Pipeline)

router = APIRouter(
    prefix="/segregation",
    tags=["segregation"],
)


@router.post("/run-box/{engine_id}", status_code=202)
def run_box_segregation(
    engine_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    """
    Trigger auto folder segregation for an engine's Box RAW FOLDER.
    Runs in the background; poll /results/{engine_id} for completion.
    """
    engine = (
        db.query(models.Engine)
        .filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id)
        .first()
    )
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")
    if not engine.box_folder_id:
        raise HTTPException(status_code=400, detail="Engine has no Box folder linked")

    current_status = seg_service.get_job_status(engine_id)
    if current_status == "running":
        return {"message": "Segregation already in progress", "status": "running"}

    # Use a NEW db session inside the background task (sessions aren't thread-safe)
    def run_task():
        bg_db = next(database.get_db())
        try:
            seg_service.perform_auto_segregation(engine_id, bg_db)
        finally:
            bg_db.close()

    background_tasks.add_task(run_task)
    return {"message": "Segregation started", "status": "running"}


@router.get("/status/{engine_id}")
def get_segregation_status(
    engine_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    """Returns current job status: idle | running | done | error"""
    engine = (
        db.query(models.Engine)
        .filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id)
        .first()
    )
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")

    # Check in-memory status first (catches actively running jobs)
    status = seg_service.get_job_status(engine_id)
    # If in-memory says "idle" but DB already has results, treat as "done"
    # (happens after server restart or logout/login — memory is wiped but DB persists)
    if status == "idle":
        has_results = (
            db.query(models.SegregationResult.id)
            .filter(models.SegregationResult.engine_id == engine_id)
            .first()
        )
        if has_results:
            status = "done"
    return {"engine_id": engine_id, "status": status}


@router.get("/results/{engine_id}")
def get_segregation_results(
    engine_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    """
    Returns all saved segregation results grouped by category.
    Response shape:
    {
      "status": "done",
      "summary": { total_files, pdf_files, media_files, other_files, categories_found },
      "segregated": {
          "14. Shop Visit Records": [ { box_file_id, box_file_name, ... }, ... ],
          ...
      }
    }
    """
    engine = (
        db.query(models.Engine)
        .filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id)
        .first()
    )
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")

    rows = (
        db.query(models.SegregationResult)
        .filter(models.SegregationResult.engine_id == engine_id)
        .all()
    )

    # Determine status: prefer in-memory (catches active/error), but if memory
    # says "idle" and DB rows exist, it means a previous run completed before this
    # server start (after restart / logout-login). Treat it as "done".
    mem_status = seg_service.get_job_status(engine_id)
    if not rows:
        return {
            "status": mem_status,
            "summary": {"total_files": 0, "pdf_files": 0, "media_files": 0, "other_files": 0, "categories_found": 0},
            "segregated": {},
        }
    resolved_status = mem_status if mem_status in ("running", "error") else "done"

    MEDIA_EXT = {".mp4", ".png", ".jpeg", ".jpg", ".tif", ".heic", ".bmp"}
    pdf_count = media_count = other_count = 0

    segregated = defaultdict(list)
    for r in rows:
        ext = ("." + r.box_file_name.rsplit(".", 1)[-1]).lower() if "." in r.box_file_name else ""
        if ext == ".pdf":
            pdf_count += 1
        elif ext in MEDIA_EXT:
            media_count += 1
        else:
            other_count += 1

        segregated[r.category].append({
            "id":                   r.id,
            "category":             r.category,
            "box_file_id":          r.box_file_id,
            "box_file_name":        r.box_file_name,
            "box_folder_id":        r.box_folder_id,
            "original_folder_path": r.original_folder_path,
            "metadata_json":        r.metadata_json,
            "prediction":           r.prediction,
            "confidence":           round(r.confidence, 3),
            "method":               r.method,
            "status":               r.status,
            "reason":               r.reason,
            "latest":               bool(r.latest),
        })

    # Sort categories by name for consistent display
    sorted_seg = dict(sorted(segregated.items()))

    return {
        "status": resolved_status,
        "summary": {
            "total_files":      len(rows),
            "pdf_files":        pdf_count,
            "media_files":      media_count,
            "other_files":      other_count,
            "categories_found": len(sorted_seg),
        },
        "segregated": sorted_seg,
    }


# ── helpers ───────────────────────────────────────────────────────────────────
_DATE_RE = re.compile(
    r'\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b'   # 12/06/22, 12-06-2022, etc.
    r'|\b(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})\b'    # 2022-06-12
)

def _parse_tokens(q: str):
    """
    Split a comma-or-space separated query into buckets:
      dates   – anything that looks like a date pattern
      numbers – pure numeric tokens (serial numbers, CSN, TSN …)
      words   – everything else (keywords, category names)
    Returns (words, numbers, dates) all as lowercase strings.
    """
    words, numbers, dates = [], [], []
    
    # 1. Extract dates anywhere in the string
    for m in _DATE_RE.finditer(q):
        dates.append(m.group(0))
    # Remove dates from string so they aren't parsed again
    q = _DATE_RE.sub(' ', q)
    
    # 2. Extract formatted numbers e.g. "57,489"
    fmt_num_re = re.compile(r'\b\d{1,3}(?:,\d{3})+\b')
    for m in fmt_num_re.finditer(q):
        numbers.append(m.group(0).replace(',', ''))
    # Remove formatted numbers from string
    q = fmt_num_re.sub(' ', q)
    
    # 3. Process remaining split by space and comma
    remaining_tokens = re.split(r'[,\s]+', q)
    for t in remaining_tokens:
        t = t.strip()
        if not t: continue
        if re.fullmatch(r'\d+', t):
            numbers.append(t)
        else:
            words.append(t.lower())
            
    return words, numbers, dates


@router.get("/search/{engine_id}")
def search_segregated_files(
    engine_id: int,
    q: str = Query(..., min_length=1, description="Comma or space separated keywords, numbers, dates"),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    """
    Multi-token fuzzy search across segregation results for an engine.
    Searches: raw_text (trigram similarity), metadata_json::text (ILIKE),
              box_file_name (ILIKE).
    Returns files ranked by descending match score with match_reasons.
    """
    engine = (
        db.query(models.Engine)
        .filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id)
        .first()
    )
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")

    words, numbers, dates = _parse_tokens(q)
    all_tokens = words + numbers + dates

    if not all_tokens:
        return []

    # Fetch all rows for this engine (raw_text can be large; we filter in Python
    # so we avoid complex ORM  with pg_trgm which needs raw SQL).
    # Use raw SQL for trigram similarity on raw_text + cast json to text for ILIKE.
    SIMILARITY_THRESHOLD = 0.15   # lower = more typo-tolerant

    # Build parameterised raw SQL
    # For each token: check similarity(lower(raw_text), token) > threshold
    #                 check lower(metadata_json::text) ILIKE %token%
    #                 check lower(box_file_name) ILIKE %token%

    scores = {}        # row_id → { score, match_reasons, row_data }

    rows = (
        db.query(models.SegregationResult)
        .filter(models.SegregationResult.engine_id == engine_id)
        .all()
    )

    for row in rows:
        score = 0
        reasons = []

        raw = (row.raw_text or "").lower()
        fname = (row.box_file_name or "").lower()
        # Cast metadata_json to a text string for searching
        meta_text = ""
        if row.metadata_json:
            import json as _json
            try:
                meta_text = _json.dumps(row.metadata_json).lower()
            except Exception:
                meta_text = str(row.metadata_json).lower()

        for token in words:
            # Filename match (exact substring – high confidence)
            if token in fname:
                score += 3
                reasons.append(f"filename: \"{token}\"")  
            # Category match
            if token in (row.category or "").lower():
                score += 2
                reasons.append(f"category: \"{token}\"")
            # raw_text: check trigram similarity via SQL for the specific row
            if len(token) >= 3:
                sim_result = db.execute(
                    sa_text("SELECT similarity(lower(:text), :token)"),
                    {"text": row.raw_text or "", "token": token}
                ).scalar() or 0.0
                if sim_result >= SIMILARITY_THRESHOLD:
                    score += max(1, round(sim_result * 5))
                    reasons.append(f"text match: \"{token}\" ({int(sim_result*100)}%)")
            elif token in raw:
                # Short tokens: exact substring in raw text
                score += 1
                reasons.append(f"text: \"{token}\"")
            # Metadata JSON text match
            if token in meta_text:
                score += 2
                reasons.append(f"metadata: \"{token}\"")

        for num in numbers:
            # Numeric tokens: look for exact occurrence in all text fields
            # Support both raw (57489) and comma-formatted (57,489) occurrences
            try:
                fmt_num = f"{int(num):,}"
            except ValueError:
                fmt_num = num

            if num in raw or fmt_num in raw:
                score += 3
                reasons.append(f"number in text: {fmt_num}")
            if num in meta_text or fmt_num in meta_text:
                score += 3
                reasons.append(f"number in metadata: {fmt_num}")
            if num in fname or fmt_num in fname:
                score += 2
                reasons.append(f"number in filename: {fmt_num}")

        for date in dates:
            # Normalise separators for comparison
            norm = re.sub(r'[\/\-\.]', '', date)
            if norm in re.sub(r'[\/\-\.]', '', raw):
                score += 4
                reasons.append(f"date in text: {date}")
            if norm in re.sub(r'[\/\-\.]', '', meta_text):
                score += 4
                reasons.append(f"date in metadata: {date}")

        if score > 0:
            # Deduplicate reasons
            seen = set()
            unique_reasons = []
            for r in reasons:
                if r not in seen:
                    seen.add(r)
                    unique_reasons.append(r)

            scores[row.id] = {
                "score": score,
                "match_reasons": unique_reasons,
                "id": row.id,
                "box_file_id": row.box_file_id,
                "box_file_name": row.box_file_name,
                "category": row.category,
                "method": row.method,
                "confidence": round(row.confidence, 3),
                "status": row.status,
                "reason": row.reason,
                "original_folder_path": row.original_folder_path,
                "metadata_json": row.metadata_json,
                "latest": bool(row.latest),
            }

    # Sort by score descending
    ranked = sorted(scores.values(), key=lambda x: x["score"], reverse=True)
    return ranked
