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

    # Set status synchronously so polling immediately returns "running" — prevents
    # re-run race condition where the old "done" status is seen on the first poll.
    seg_service._job_status[engine_id] = "running"

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
    # (happens after server restart or logout/login â€” memory is wiped but DB persists)
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
            "summary": {"total_files": 0, "pdf_files": 0, "pdfs_with_text": 0, "media_files": 0, "other_files": 0, "categories_found": 0},
            "segregated": {},
        }
    resolved_status = mem_status if mem_status in ("running", "error") else "done"

    MEDIA_EXT = {".mp4", ".png", ".jpeg", ".jpg", ".tif", ".heic", ".bmp"}
    pdf_count = media_count = other_count = pdf_with_text_count = 0
    
    segregated = defaultdict(list)
    for r in rows:
        ext = ("." + r.box_file_name.rsplit(".", 1)[-1]).lower() if "." in r.box_file_name else ""
        if ext == ".pdf":
            pdf_count += 1
            if r.raw_text and r.raw_text.strip():
                pdf_with_text_count += 1
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
            "pdfs_with_text":   pdf_with_text_count,
            "media_files":      media_count,
            "other_files":      other_count,
            "categories_found": len(sorted_seg),
        },
        "segregated": sorted_seg,
    }


# â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
_DATE_RE = re.compile(
    r'\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b'   # 12/06/22, 12-06-2022, etc.
    r'|\b(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})\b'    # 2022-06-12
)

def _parse_tokens(q: str):
    """
    Split a comma-or-space separated query into buckets:
      dates   â€“ anything that looks like a date pattern
      numbers â€“ pure numeric tokens (serial numbers, CSN, TSN â€¦)
      words   â€“ everything else (keywords, category names)
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


@router.get("/file-embed/{box_file_id}")
def get_file_embed(
    box_file_id: str,
    current_user: models.User = Depends(dependencies.get_current_user),
):
    """
    Returns a fresh Box embed link + download URL for a single file.
    Called on-demand when the user clicks a file in the global search overlay.
    """
    from services.box_service import box_service as _bs
    try:
        embed_link = _bs.get_file_embed_link(box_file_id)
        download_url = _bs.get_file_download_url(box_file_id)
        return {"embed_link": embed_link, "download_url": download_url}
    except Exception as e:
        print(f"Error fetching embed for {box_file_id}: {e}")
        return {"embed_link": None, "download_url": None}


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

    scores = {}        # row_id â†’ { score, match_reasons, row_data }

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
            # Filename match (exact substring â€“ high confidence)
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

import tempfile
import shutil
from fastapi.responses import FileResponse
from threading import Thread

# Global dict to store download zip tasks
zip_tasks = {}

# Global dict to store box export tasks
box_export_tasks = {}

def _build_segregation_zip(engine_id: int, category: str = None):
    # This requires its own db session
    from database import SessionLocal
    db = SessionLocal()
    task_key = f"{engine_id}_{category or 'All'}"
    
    try:
        from services.box_service import box_service
        
        # 1. Fetch engine
        engine = db.query(models.Engine).filter(models.Engine.id == engine_id).first()
        if not engine:
            zip_tasks[task_key] = {"status": "error", "progress": 0, "error": "Engine not found"}
            return
            
        query = db.query(models.SegregationResult).filter(models.SegregationResult.engine_id == engine_id)
        if category:
            query = query.filter(models.SegregationResult.category == category)
            
        rows = query.all()
        if not rows:
            zip_tasks[task_key] = {"status": "error", "progress": 0, "error": "No segregated files found"}
            return
            
        temp_dir = tempfile.mkdtemp(prefix=f"zip_{engine_id}_{category or 'All'}_")
        total = len(rows)

        # AI methods that produce no sub-folder hierarchy (placed flat under category/)
        AI_FLAT_METHODS = {"Direct Keyword", "AI MODEL"}
        
        for i, row in enumerate(rows):
            safe_category = "".join(c for c in row.category if c not in r'<>:"/\|?*').strip()
            base_path = os.path.join(temp_dir, safe_category)

            if row.method == "Skip Segregation":
                # Smart stripping: Find the category in the original path and strip everything up to it.
                # This ensures we don't duplicate wrapper folders like "Engine Serial/" in the hierarchy.
                path_str = row.original_folder_path or ""
                all_parts = [p.strip() for p in path_str.split("/") if p.strip()]
                
                cat_index = next((idx for idx, seg in enumerate(all_parts) if seg == row.category), None)
                if cat_index is not None:
                    sub_parts = all_parts[cat_index + 1:]
                else:
                    # Fallback
                    sub_parts = all_parts[1:] if len(all_parts) > 0 else []
                    if sub_parts and sub_parts[0] == row.category:
                        sub_parts = sub_parts[1:]
                
                sub_parts = ["".join(c for c in p if c not in r'<>:"/\|?*') for p in sub_parts]
                target_dir = os.path.join(base_path, *sub_parts) if sub_parts else base_path

            elif row.latest:
                # AI-segregated latest → virtual ⭐ Latest sub-folder
                target_dir = os.path.join(base_path, "\u2b50 Latest")

            elif row.method not in AI_FLAT_METHODS:
                # Folder Match / Extension / Unclassified / Manual — use folder path
                path_str = row.original_folder_path or ""
                parts = [p.strip() for p in path_str.split("/") if p.strip()]
                sub_parts = parts[1:] if parts else []
                sub_parts = ["".join(c for c in p if c not in r'<>:"/\|?*') for p in sub_parts]
                target_dir = os.path.join(base_path, *sub_parts) if sub_parts else base_path

            else:
                # AI MODEL / Direct Keyword — flat under category
                target_dir = base_path
                
            os.makedirs(target_dir, exist_ok=True)
            
            # Download from Box
            if row.box_file_id:
                try:
                    # New box-sdk-gen syntax for downloading files
                    file_stream = box_service.client.downloads.download_file(row.box_file_id)
                    file_content = file_stream.read()
                    
                    file_name = row.box_file_name or f"file_{row.box_file_id}.pdf"
                    file_path = os.path.join(target_dir, file_name)
                    with open(file_path, "wb") as f:
                        f.write(file_content)
                except Exception as e:
                    print(f"Failed to download {row.box_file_name} for zip: {e}")
                    
            zip_tasks[task_key]["progress"] = int(((i + 1) / total) * 90)  # 0-90% for downloading
            
        # Create Zip
        zip_tasks[task_key]["progress"] = 95
        
        if category:
            safe_cat_name = "".join(c for c in category if c not in r'<>:"/\|?*').strip()
            zip_filename = f"Segregated_Engine_{engine.serial_number}_{safe_cat_name}"
        else:
            zip_filename = f"Segregated_Engine_{engine.serial_number}"
            
        zip_output_path = os.path.join(tempfile.gettempdir(), zip_filename)
        
        # shutil.make_archive adds .zip automatically
        zip_path = shutil.make_archive(zip_output_path, 'zip', temp_dir)
        
        # Cleanup temp dir
        shutil.rmtree(temp_dir, ignore_errors=True)
        
        zip_tasks[task_key] = {
            "status": "done",
            "progress": 100,
            "zip_path": zip_path,
            "zip_filename": f"{zip_filename}.zip",
            "error": None
        }
        
    except Exception as e:
        print(f"Zip builder failed for {task_key}: {e}")
        zip_tasks[task_key] = {"status": "error", "progress": 0, "error": str(e)}
    finally:
        db.close()

@router.post("/start-download-zip/{engine_id}")
def start_segregation_zip(
    engine_id: int,
    category: str = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    engine = db.query(models.Engine).filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")
        
    task_key = f"{engine_id}_{category or 'All'}"
    if task_key in zip_tasks and zip_tasks[task_key]["status"] == "running":
        return {"message": "Zipping already in progress"}
        
    zip_tasks[task_key] = {"status": "running", "progress": 0, "error": None}
    
    thread = Thread(target=_build_segregation_zip, args=(engine_id, category))
    thread.start()
    
    return {"message": "Zip building started"}

@router.get("/download-zip-status/{engine_id}")
def check_segregation_zip_status(
    engine_id: int,
    category: str = None,
    current_user: models.User = Depends(dependencies.get_current_user),
):
    task_key = f"{engine_id}_{category or 'All'}"
    if task_key not in zip_tasks:
        return {"status": "idle", "progress": 0}
    return zip_tasks[task_key]

@router.get("/download-zip/{engine_id}")
def download_segregation_zip(
    engine_id: int,
    background_tasks: BackgroundTasks,
    category: str = None,
    current_user: models.User = Depends(dependencies.get_current_user),
):
    task_key = f"{engine_id}_{category or 'All'}"
    if task_key not in zip_tasks or zip_tasks[task_key]["status"] != "done":
        raise HTTPException(status_code=400, detail="Zip file not ready or task failed")
        
    task = zip_tasks[task_key]
    zip_path = task.get("zip_path")
    
    if not zip_path or not os.path.exists(zip_path):
        raise HTTPException(status_code=404, detail="Zip file not found on server")
        
    def cleanup():
        try:
            os.remove(zip_path)
            if task_key in zip_tasks:
                del zip_tasks[task_key]
        except Exception as e:
            print(f"Failed to cleanup zip {zip_path}: {e}")

    background_tasks.add_task(cleanup)
    
    return FileResponse(
        path=zip_path,
        filename=task.get("zip_filename", f"Segregated_Folder.zip"),
        media_type="application/zip",
    )

def _export_segregation_to_box(engine_id: int):
    # This requires its own db session
    from database import SessionLocal
    db = SessionLocal()
    
    try:
        from services.box_service import box_service
        from box_sdk_gen.managers.files import CopyFileParent
        
        # 1. Fetch engine
        engine = db.query(models.Engine).filter(models.Engine.id == engine_id).first()
        if not engine:
            box_export_tasks[engine_id] = {"status": "error", "progress": 0, "error": "Engine not found"}
            return
            
        if not engine.box_folder_id:
            box_export_tasks[engine_id] = {"status": "error", "progress": 0, "error": "Engine has no Box folder linked"}
            return
            
        rows = db.query(models.SegregationResult).filter(models.SegregationResult.engine_id == engine_id, models.SegregationResult.box_file_id.isnot(None)).all()
        if not rows:
            box_export_tasks[engine_id] = {"status": "error", "progress": 0, "error": "No segregated files to export"}
            return

        # 1. Create root "Segregated Folder"
        root_folder = box_service.get_or_create_folder("Segregated Folder", engine.box_folder_id)
        if not root_folder:
            box_export_tasks[engine_id] = {"status": "error", "progress": 0, "error": "Could not create root Segregated Folder in Box"}
            return

        # 2. Build unique folder paths
        # "Skip Segregation" uses path-based hierarchy just like Folder Match / Extension.
        # AI-method files (Direct Keyword, AI MODEL) go flat → just category/.
        AI_FLAT_METHODS = {"Direct Keyword", "AI MODEL"}
        folder_paths = set()
        file_destinations = []  # (row, expected_folder_path)

        for row in rows:
            safe_category = "".join(c for c in row.category if c not in r'<>:"/\|?*').strip()

            if row.method == "Skip Segregation":
                # Smart stripping: Find the category in the original path and strip everything up to it.
                # This ensures we don't duplicate wrapper folders like "Engine Serial/" in the hierarchy.
                path_str = row.original_folder_path or ""
                all_parts = [p.strip() for p in path_str.split("/") if p.strip()]
                
                cat_index = next((idx for idx, seg in enumerate(all_parts) if seg == row.category), None)
                if cat_index is not None:
                    sub_parts = all_parts[cat_index + 1:]
                else:
                    # Fallback
                    sub_parts = all_parts[1:] if len(all_parts) > 0 else []
                    if sub_parts and sub_parts[0] == row.category:
                        sub_parts = sub_parts[1:]

                # Sanitise each segment
                sub_parts = ["".join(c for c in p if c not in r'<>:"/\|?*').strip() for p in sub_parts]
                if sub_parts:
                    folder_path = f"{safe_category}/" + "/".join(sub_parts)
                else:
                    folder_path = safe_category

            elif row.latest:
                # AI-segmented latest files → ⭐ Latest sub-folder inside category
                folder_path = f"{safe_category}/⭐ Latest"

            elif row.method not in AI_FLAT_METHODS:
                # Folder Match / Extension / Unclassified / Manual — use folder path
                path_str = row.original_folder_path or ""
                parts = [p.strip() for p in path_str.split("/") if p.strip()]
                # Skip the first segment (root/engine folder)
                sub_parts = parts[1:] if len(parts) > 0 else []
                sub_parts = ["".join(c for c in p if c not in r'<>:"/\|?*').strip() for p in sub_parts]
                if sub_parts:
                    folder_path = f"{safe_category}/" + "/".join(sub_parts)
                else:
                    folder_path = safe_category

            else:
                # AI MODEL / Direct Keyword — flat under category
                folder_path = safe_category

            # Add all parent paths to ensure creation
            parts_chain = folder_path.split('/')
            for i in range(1, len(parts_chain) + 1):
                folder_paths.add('/'.join(parts_chain[:i]))

            file_destinations.append((row, folder_path))

        # 3. Create structure
        box_export_tasks[engine_id]["progress"] = 10
        # folder_mapping maps "Category/â­ Latest" -> "12345"
        folder_mapping = box_service.create_folder_structure(root_folder.id, list(folder_paths))
        
        # 4. Copy files
        total = len(file_destinations)
        for i, (row, folder_path) in enumerate(file_destinations):
            dest_folder_id = folder_mapping.get(folder_path)
            if not dest_folder_id:
                # Fallback to the newly created root folder if path parsing totally failed
                dest_folder_id = root_folder.id 
                
            file_name = row.box_file_name or f"file_{row.box_file_id}.pdf"
            
            try:
                # box-sdk-gen structure for copying file
                box_service.client.files.copy_file(
                    file_id=row.box_file_id,
                    parent=CopyFileParent(id=dest_folder_id),
                    name=file_name
                )
            except Exception as e:
                err_str = str(e).lower()
                # 409 Conflict simply means it was already copied there. Continue.
                if "item_name_in_use" not in err_str and "409" not in err_str:
                    print(f"Failed to copy file {file_name}: {e}")
                    
            # 10%-100%
            box_export_tasks[engine_id]["progress"] = 10 + int(((i + 1) / total) * 90)
            
        box_export_tasks[engine_id] = {
            "status": "done",
            "progress": 100,
            "error": None
        }
        
    except Exception as e:
        print(f"Box export failed for {engine_id}: {e}")
        box_export_tasks[engine_id] = {"status": "error", "progress": 0, "error": str(e)}
    finally:
        db.close()

@router.post("/start-box-export/{engine_id}")
def start_box_export(
    engine_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    engine = db.query(models.Engine).filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")
        
    if engine_id in box_export_tasks and box_export_tasks[engine_id]["status"] == "running":
        return {"message": "Export already in progress"}
        
    box_export_tasks[engine_id] = {"status": "running", "progress": 0, "error": None}
    
    thread = Thread(target=_export_segregation_to_box, args=(engine_id,))
    thread.start()
    
    return {"message": "Box export started"}

@router.get("/box-export-status/{engine_id}")
def check_box_export_status(
    engine_id: int,
    current_user: models.User = Depends(dependencies.get_current_user),
):
    if engine_id not in box_export_tasks:
        return {"status": "idle", "progress": 0}
    return box_export_tasks[engine_id]

@router.get("/saved-to-box-status/{engine_id}")
def check_saved_to_box_status(
    engine_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    """Checks if a 'Segregated Folder' exists in the Engine's root folder"""
    from services.box_service import box_service
    engine = db.query(models.Engine).filter(models.Engine.id == engine_id).first()
    if not engine or not engine.box_folder_id:
        return {"saved": False}
        
    try:
        items = box_service.get_folder_items(engine.box_folder_id)
        for f in items.get("folders", []):
            if f["name"] == "Segregated Folder":
                return {"saved": True, "folder_id": f["id"]}
        return {"saved": False, "folder_id": None}
    except Exception as e:
        print(f"Error checking saved status: {e}")
        return {"saved": False}


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# GLOBAL SEARCH  â€” two-phase, serial-aware cross-engine search
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@router.get("/global-search")
def global_search(
    q: str = Query(..., min_length=1, description="Comma or space separated keywords, numbers, dates"),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    """
    Phase 1 â€“ Serial detection
        Scan every token against every owned engine's serial number.
        If one or more tokens match a serial (substring, case-insensitive),
        restrict the row pool to ONLY that engine's files and remove the
        matched token(s) from the keyword pool so they don't double-score.

    Phase 2 â€“ File-level scoring on the (possibly narrowed) pool
        Score remaining tokens against:
          â€¢ box_file_name  (substring)  â†’ +4
          â€¢ category        (substring)  â†’ +3
          â€¢ raw_text        (pg_trgm)    â†’ up to +5
          â€¢ metadata_json   (substring)  â†’ +2
          â€¢ numbers in any of the above  â†’ +2 / +3
          â€¢ dates in raw_text / metadata â†’ +4

    Returns: ranked list (descending score), max 200 entries.
    """
    import json as _json

    words, numbers, dates = _parse_tokens(q)

    if not (words or numbers or dates):
        return []

    SIMILARITY_THRESHOLD = 0.15

    # â”€â”€ Load all user's engines â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    engines_list = (
        db.query(models.Engine)
        .filter(models.Engine.owner_id == current_user.id)
        .all()
    )
    engine_map = {e.id: e.serial_number for e in engines_list}   # id â†’ serial
    owned_ids  = list(engine_map.keys())

    if not owned_ids:
        return []

    # â”€â”€ Phase 1: match tokens against engine serial numbers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    # serial_matched_engine_ids: engines whose serial matched at least one token
    # serial_matched_tokens:     those tokens (excluded from Phase 2 scoring)
    serial_matched_engine_ids: set = set()
    serial_matched_tokens:     set = set()

    for token in list(words) + list(numbers):
        tok_low = token.lower()
        for eng_id, serial in engine_map.items():
            ser_low = serial.lower()
            # Match if the token is a substring of the serial OR the serial is
            # a substring of the token (handles partial numbers like "577" in "V577270")
            if tok_low in ser_low or ser_low in tok_low:
                serial_matched_engine_ids.add(eng_id)
                serial_matched_tokens.add(token)

    # Determine scope: if serial(s) matched â†’ only those engines; else all
    search_engine_ids = list(serial_matched_engine_ids) if serial_matched_engine_ids else owned_ids

    # Remove serial tokens so Phase 2 doesn't re-score them as plain keywords
    remaining_words   = [t for t in words   if t not in serial_matched_tokens]
    remaining_numbers = [t for t in numbers if t not in serial_matched_tokens]

    # â”€â”€ Phase 2: fetch rows and score â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    rows = (
        db.query(models.SegregationResult)
        .filter(models.SegregationResult.engine_id.in_(search_engine_ids))
        .all()
    )

    scores: dict = {}

    for row in rows:
        score   = 0
        reasons = []

        engine_serial = engine_map.get(row.engine_id, "")
        fname = (row.box_file_name or "").lower()
        cat   = (row.category      or "").lower()
        raw   = (row.raw_text      or "").lower()

        meta_text = ""
        if row.metadata_json:
            try:
                meta_text = _json.dumps(row.metadata_json).lower()
            except Exception:
                meta_text = str(row.metadata_json).lower()

        # Baseline boost: every row in a serial-scoped search gets +2
        if serial_matched_engine_ids:
            score += 2
            reasons.append(f"engine: {engine_serial}")

        # â”€â”€ Word tokens â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        for token in remaining_words:
            matched_any = False

            if token in fname:
                score += 4
                reasons.append(f'filename: "{token}"')
                matched_any = True

            if token in cat:
                score += 3
                reasons.append(f'category: "{token}"')
                matched_any = True

            if len(token) >= 3:
                sim = db.execute(
                    sa_text("SELECT similarity(lower(:text), :tok)"),
                    {"text": row.raw_text or "", "tok": token}
                ).scalar() or 0.0
                if sim >= SIMILARITY_THRESHOLD:
                    score += max(1, round(sim * 5))
                    reasons.append(f'text: "{token}" ({int(sim * 100)}%)')
                    matched_any = True
            elif token in raw:
                score += 1
                reasons.append(f'text: "{token}"')
                matched_any = True

            if token in meta_text:
                score += 2
                reasons.append(f'metadata: "{token}"')
                matched_any = True

        # â”€â”€ Number tokens â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        for num in remaining_numbers:
            try:
                fmt_num = f"{int(num):,}"
            except ValueError:
                fmt_num = num

            if num in fname or fmt_num in fname:
                score += 3
                reasons.append(f"number in filename: {fmt_num}")
            if num in cat or fmt_num in cat:
                score += 3
                reasons.append(f"number in category: {fmt_num}")
            if num in raw or fmt_num in raw:
                score += 3
                reasons.append(f"number in text: {fmt_num}")
            if num in meta_text or fmt_num in meta_text:
                score += 3
                reasons.append(f"number in metadata: {fmt_num}")

        # â”€â”€ Date tokens â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        for date in dates:
            norm = re.sub(r'[\/\-\.]', '', date)
            raw_norm  = re.sub(r'[\/\-\.]', '', raw)
            meta_norm = re.sub(r'[\/\-\.]', '', meta_text)
            if norm in raw_norm:
                score += 4
                reasons.append(f"date in text: {date}")
            if norm in meta_norm:
                score += 4
                reasons.append(f"date in metadata: {date}")

        # Only include rows that earned a score above the baseline boost
        min_score = 3 if serial_matched_engine_ids else 1
        if score >= min_score:
            seen  = set()
            uniq  = []
            for r in reasons:
                if r not in seen:
                    seen.add(r)
                    uniq.append(r)

            scores[row.id] = {
                "score":                score,
                "match_reasons":        uniq,
                "id":                   row.id,
                "engine_id":            row.engine_id,
                "engine_serial_number": engine_serial,
                "box_file_id":          row.box_file_id,
                "box_file_name":        row.box_file_name,
                "category":             row.category,
                "method":               row.method,
                "confidence":           round(row.confidence, 3),
                "status":               row.status,
                "reason":               row.reason,
                "original_folder_path": row.original_folder_path,
                "metadata_json":        row.metadata_json,
                "latest":               bool(row.latest),
                "embed_link":           None,
                "download_url":         None,
            }

    ranked = sorted(scores.values(), key=lambda x: x["score"], reverse=True)
    return ranked[:200]


# ── SKIP FOLDER SEGREGATION ────────────────────────────────────────────────────
# Directly maps the RAW FOLDER structure into SegregationResult rows
# without running the AI/OCR pipeline.
#
# Supports two layouts via `skip_levels` parameter:
#
# skip_levels=0 (default — categories are RAW FOLDER's direct children):
#   RAW FOLDER/
#   ├── 1. Certified statement/      ← category
#   │   ├── Latest/                  ← latest=True for files inside
#   │   └── file.pdf                 ← latest=False
#   └── loose_file.pdf               ← Manual Segregation
#
# skip_levels=1 (one extra wrapper level, e.g. engine serial folder):
#   RAW FOLDER/
#   └── ENGINE-SERIAL/               ← skipped (wrapper)
#       ├── 1. Certified statement/  ← category
#       │   ├── Latest/
#       │   └── file.pdf
#       └── loose_file.pdf           ← Manual Segregation
# ────────────────────────────────────────────────────────────────────────────────

_skip_seg_status: dict[int, str] = {}
_skip_seg_status_lock = __import__("threading").Lock()


def _perform_skip_segregation_task(engine_id: int, skip_levels: int = 0):
    """
    Background task: walk the RAW FOLDER in Box, derive categories from subfolder
    names at the appropriate level, flag 'Latest' sub-subfolders, and save results.

    skip_levels=0 → categories are RAW FOLDER's direct children.
    skip_levels=1 → one extra wrapper folder level is skipped before reading categories.
    """
    from database import SessionLocal
    from services.box_service import box_service

    db = SessionLocal()
    try:
        seg_service._job_status[engine_id] = "running"

        engine = db.query(models.Engine).filter(models.Engine.id == engine_id).first()
        if not engine or not engine.box_folder_id:
            seg_service._job_status[engine_id] = "error"
            return

        # Locate RAW FOLDER
        raw_folder_id = box_service.get_raw_folder_id(engine.box_folder_id)
        if not raw_folder_id:
            raw_folder_id = engine.box_folder_id

        print(f"[SkipSeg] Engine {engine_id}: RAW FOLDER id={raw_folder_id}, skip_levels={skip_levels}")

        results: list[dict] = []

        def is_latest_folder(name: str) -> bool:
            return name.strip().lower() == "latest"

        def walk_category_folder(cat_folder_id: str, category: str, folder_path: str):
            """
            Recursively walk one category folder.
            Files directly inside → latest=False.
            Files inside a 'Latest' sub-folder → latest=True.
            Other sub-folders → recurse with same category, latest=False.
            """
            items = box_service.get_folder_items(cat_folder_id)

            for f in items.get("files", []):
                results.append({
                    "engine_id":            engine_id,
                    "box_file_id":          f["id"],
                    "box_file_name":        f["name"],
                    "box_folder_id":        cat_folder_id,
                    "original_folder_path": folder_path,
                    "category":             category,
                    "prediction":           category,
                    "confidence":           1.0,
                    "method":               "Skip Segregation",
                    "status":               "Skipped",
                    "raw_text":             "",
                    "cleaned_text":         "",
                    "reason":               "",
                    "latest":               False,
                })

            for sub in items.get("folders", []):
                sub_path = f"{folder_path}/{sub['name']}"
                if is_latest_folder(sub["name"]):
                    # Files inside a Latest folder → latest=True
                    latest_items = box_service.get_folder_items(sub["id"])
                    for lf in latest_items.get("files", []):
                        results.append({
                            "engine_id":            engine_id,
                            "box_file_id":          lf["id"],
                            "box_file_name":        lf["name"],
                            "box_folder_id":        sub["id"],
                            "original_folder_path": sub_path,
                            "category":             category,
                            "prediction":           category,
                            "confidence":           1.0,
                            "method":               "Skip Segregation",
                            "status":               "Skipped",
                            "raw_text":             "",
                            "cleaned_text":         "",
                            "reason":               "",
                            "latest":               True,
                        })
                    # Recurse deeper inside Latest in case there are nested sub-folders
                    for sub2 in latest_items.get("folders", []):
                        walk_category_folder(sub2["id"], category, f"{sub_path}/{sub2['name']}")
                else:
                    walk_category_folder(sub["id"], category, sub_path)

        def process_category_level(parent_folder_id: str, parent_path: str):
            """
            Treat direct children of parent_folder_id as categories.
            Files directly here → Manual Segregation.
            Sub-folders → category name from folder name.
            """
            level_items = box_service.get_folder_items(parent_folder_id)

            # Loose files at this level → Manual Segregation
            for f in level_items.get("files", []):
                results.append({
                    "engine_id":            engine_id,
                    "box_file_id":          f["id"],
                    "box_file_name":        f["name"],
                    "box_folder_id":        parent_folder_id,
                    "original_folder_path": parent_path,
                    "category":             "Manual Segregation",
                    "prediction":           "Manual Segregation",
                    "confidence":           0.0,
                    "method":               "Skip Segregation",
                    "status":               "Skipped",
                    "raw_text":             "",
                    "cleaned_text":         "",
                    "reason":               "No parent category folder",
                    "latest":               False,
                })

            # Sub-folders → use folder name as category
            for cat_folder in level_items.get("folders", []):
                cat_name = cat_folder["name"]
                cat_path = f"{parent_path}/{cat_name}"
                print(f"[SkipSeg] Category: {cat_name}")
                walk_category_folder(cat_folder["id"], cat_name, cat_path)

        # ── Determine starting point based on skip_levels ─────────────────────
        if skip_levels == 0:
            # Standard: RAW FOLDER's direct children are the categories
            process_category_level(raw_folder_id, "RAW FOLDER")
        else:
            # skip_levels=1: RAW FOLDER → wrapper folder(s) → categories
            # Collect all wrapper folders' children as category-level entries.
            # Loose files directly in RAW FOLDER → Manual Segregation.
            raw_items = box_service.get_folder_items(raw_folder_id)

            # Loose files directly in RAW FOLDER → Manual Segregation
            for f in raw_items.get("files", []):
                results.append({
                    "engine_id":            engine_id,
                    "box_file_id":          f["id"],
                    "box_file_name":        f["name"],
                    "box_folder_id":        raw_folder_id,
                    "original_folder_path": "RAW FOLDER",
                    "category":             "Manual Segregation",
                    "prediction":           "Manual Segregation",
                    "confidence":           0.0,
                    "method":               "Skip Segregation",
                    "status":               "Skipped",
                    "raw_text":             "",
                    "cleaned_text":         "",
                    "reason":               "No parent category folder",
                    "latest":               False,
                })

            # Each direct sub-folder of RAW FOLDER is a wrapper — go one level deeper
            for wrapper in raw_items.get("folders", []):
                wrapper_path = f"RAW FOLDER/{wrapper['name']}"
                print(f"[SkipSeg] Skipping wrapper: {wrapper['name']}")
                process_category_level(wrapper["id"], wrapper_path)

        total = len(results)
        print(f"[SkipSeg] Engine {engine_id}: {total} files discovered. Saving to DB...")

        # Clear existing and batch-insert
        db.query(models.SegregationResult).filter(
            models.SegregationResult.engine_id == engine_id
        ).delete()
        db.commit()

        for r in results:
            db.add(models.SegregationResult(**r))
        db.commit()

        print(f"[SkipSeg] Engine {engine_id}: ✔ Done — {total} records saved")
        seg_service._job_status[engine_id] = "done"

    except Exception as e:
        print(f"[SkipSeg] Engine {engine_id}: ERROR — {e}")
        import traceback; traceback.print_exc()
        seg_service._job_status[engine_id] = "error"
        try:
            db.rollback()
        except Exception:
            pass
    finally:
        db.close()


@router.post("/skip-segregation/{engine_id}", status_code=202)
def skip_folder_segregation(
    engine_id: int,
    background_tasks: BackgroundTasks,
    skip_levels: int = Query(0, ge=0, le=1, description="0 = categories are RAW FOLDER's direct children; 1 = skip one extra wrapper level (e.g. engine serial folder)"),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    """
    Trigger 'Skip Folder Segregation' for an engine.
    Walks the RAW FOLDER structure in Box, uses subfolder names as categories.
    Use skip_levels=1 when RAW FOLDER contains a wrapper folder (e.g. engine serial
    number) before the actual category folders.
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
        return {"message": "A segregation job is already running", "status": "running"}

    # Set status synchronously so the polling endpoint immediately returns "running"
    # before the background task even starts — prevents re-run race condition.
    seg_service._job_status[engine_id] = "running"

    background_tasks.add_task(_perform_skip_segregation_task, engine_id, skip_levels)
    return {"message": "Skip segregation started", "status": "running", "skip_levels": skip_levels}

    """
    Background task: walk the RAW FOLDER in Box, derive categories from top-level
    subfolder names, flag 'Latest' sub-subfolders, and save SegregationResult rows.
    Shares the seg_service._job_status dict so the existing /status endpoint works.
    """
    from database import SessionLocal
    from services.box_service import box_service

    db = SessionLocal()
    try:
        # Mark running both in seg_service memory AND local cache
        seg_service._job_status[engine_id] = "running"

        engine = db.query(models.Engine).filter(models.Engine.id == engine_id).first()
        if not engine or not engine.box_folder_id:
            seg_service._job_status[engine_id] = "error"
            return

        # Locate RAW FOLDER
        raw_folder_id = box_service.get_raw_folder_id(engine.box_folder_id)
        if not raw_folder_id:
            # Fall back to engine root itself
            raw_folder_id = engine.box_folder_id

        print(f"[SkipSeg] Engine {engine_id}: RAW FOLDER id={raw_folder_id}")

        # ── Walk RAW FOLDER structure (Box API only, no downloads) ────────────
        # Structure we expect:
        #   RAW FOLDER/  (raw_folder_id)
        #     <Category subfolder>/   ← top-level: category name
        #       Latest/               ← optional: latest = True for files inside
        #         file.pdf
        #       file.pdf              ← latest = False
        #     loose_file.pdf          ← no category subfolder → Manual Segregation

        results: list[dict] = []

        def is_latest_folder(name: str) -> bool:
            return name.strip().lower() == "latest"

        def walk_category_folder(cat_folder_id: str, category: str, folder_path: str):
            """Walk one category subfolder. Detect 'Latest' sub-subfolders."""
            items = box_service.get_folder_items(cat_folder_id)

            # Direct files inside category folder (not in Latest) → latest=False
            for f in items.get("files", []):
                results.append({
                    "engine_id":            engine_id,
                    "box_file_id":          f["id"],
                    "box_file_name":        f["name"],
                    "box_folder_id":        cat_folder_id,
                    "original_folder_path": folder_path,
                    "category":             category,
                    "prediction":           category,
                    "confidence":           1.0,
                    "method":               "Skip Segregation",
                    "status":               "Skipped",
                    "raw_text":             "",
                    "cleaned_text":         "",
                    "reason":               "",
                    "latest":               False,
                })

            for sub in items.get("folders", []):
                sub_path = f"{folder_path}/{sub['name']}"
                if is_latest_folder(sub["name"]):
                    # All files inside a 'Latest' folder → latest=True
                    latest_items = box_service.get_folder_items(sub["id"])
                    for lf in latest_items.get("files", []):
                        results.append({
                            "engine_id":            engine_id,
                            "box_file_id":          lf["id"],
                            "box_file_name":        lf["name"],
                            "box_folder_id":        sub["id"],
                            "original_folder_path": sub_path,
                            "category":             category,
                            "prediction":           category,
                            "confidence":           1.0,
                            "method":               "Skip Segregation",
                            "status":               "Skipped",
                            "raw_text":             "",
                            "cleaned_text":         "",
                            "reason":               "",
                            "latest":               True,
                        })
                    # Recurse deeper inside Latest (e.g. nested sub-folders inside Latest)
                    for sub2 in latest_items.get("folders", []):
                        walk_category_folder(sub2["id"], category, f"{sub_path}/{sub2['name']}")
                else:
                    # Other sub-subfolders: recurse with same category, latest=False
                    walk_category_folder(sub["id"], category, sub_path)

        # ── Top-level traversal of RAW FOLDER ────────────────────────────────
        raw_items = box_service.get_folder_items(raw_folder_id)

        # Files directly in RAW FOLDER → Manual Segregation
        for f in raw_items.get("files", []):
            results.append({
                "engine_id":            engine_id,
                "box_file_id":          f["id"],
                "box_file_name":        f["name"],
                "box_folder_id":        raw_folder_id,
                "original_folder_path": "RAW FOLDER",
                "category":             "Manual Segregation",
                "prediction":           "Manual Segregation",
                "confidence":           0.0,
                "method":               "Skip Segregation",
                "status":               "Skipped",
                "raw_text":             "",
                "cleaned_text":         "",
                "reason":               "No parent category folder",
                "latest":               False,
            })

        # Sub-folders of RAW FOLDER → use their name as category
        for cat_folder in raw_items.get("folders", []):
            cat_name = cat_folder["name"]
            cat_path = f"RAW FOLDER/{cat_name}"
            print(f"[SkipSeg] Processing category: {cat_name}")
            walk_category_folder(cat_folder["id"], cat_name, cat_path)

        total = len(results)
        print(f"[SkipSeg] Engine {engine_id}: {total} files discovered. Saving to DB...")

        # ── Clear existing results and batch-insert new ones ─────────────────
        db.query(models.SegregationResult).filter(
            models.SegregationResult.engine_id == engine_id
        ).delete()
        db.commit()

        for r in results:
            db.add(models.SegregationResult(**r))
        db.commit()

        print(f"[SkipSeg] Engine {engine_id}: ✔ Done — {total} records saved")
        seg_service._job_status[engine_id] = "done"

    except Exception as e:
        print(f"[SkipSeg] Engine {engine_id}: ERROR — {e}")
        import traceback; traceback.print_exc()
        seg_service._job_status[engine_id] = "error"
        try:
            db.rollback()
        except Exception:
            pass
    finally:
        db.close()


@router.post("/skip-segregation/{engine_id}", status_code=202)
def skip_folder_segregation(
    engine_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    """
    Trigger 'Skip Folder Segregation' for an engine.
    Walks the RAW FOLDER structure in Box, uses top-level subfolder names as
    categories, detects Latest sub-folders, and saves results to DB.
    No OCR / AI processing is performed.
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
        return {"message": "A segregation job is already running", "status": "running"}

    background_tasks.add_task(_perform_skip_segregation_task, engine_id)
    return {"message": "Skip segregation started", "status": "running"}


