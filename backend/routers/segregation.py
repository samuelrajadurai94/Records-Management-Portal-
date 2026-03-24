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
        
        TREE_METHODS = {"Folder Match", "Extension", "Unclassified", "Manual"}
        
        for i, row in enumerate(rows):
            # Clean category name
            safe_category = "".join(c for c in row.category if c not in r'<>:"/\|?*').strip()
            base_path = os.path.join(temp_dir, safe_category)
            
            if row.latest:
                target_dir = os.path.join(base_path, "⭐ Latest")
            elif row.method in TREE_METHODS:
                path_str = row.original_folder_path or ""
                parts = [p.strip() for p in path_str.split("/") if p.strip()]
                # UI logic: skip the first segment (root/engine folder)
                sub_parts = parts[1:] if len(parts) > 0 else []
                # Clean sub_parts for safe folder names
                sub_parts = ["".join(c for c in p if c not in r'<>:"/\|?*') for p in sub_parts]
                
                target_dir = os.path.join(base_path, *sub_parts) if sub_parts else base_path
            else:
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
            if engine_id in zip_tasks:
                del zip_tasks[engine_id]
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
        TREE_METHODS = {"Folder Match", "Extension", "Unclassified", "Manual"}
        folder_paths = set()
        file_destinations = [] # (row, expected_folder_path)
        
        for row in rows:
            safe_category = "".join(c for c in row.category if c not in r'<>:"/\|?*').strip()
            
            if row.latest:
                folder_path = f"{safe_category}/⭐ Latest"
            elif row.method in TREE_METHODS:
                path_str = row.original_folder_path or ""
                parts = [p.strip() for p in path_str.split("/") if p.strip()]
                # UI logic: skip the first segment (root/engine folder)
                sub_parts = parts[1:] if len(parts) > 0 else []
                sub_parts = ["".join(c for c in p if c not in r'<>:"/\|?*').strip() for p in sub_parts]
                if sub_parts:
                    folder_path = f"{safe_category}/" + "/".join(sub_parts)
                else:
                    folder_path = safe_category
            else:
                # Flat files
                folder_path = safe_category
                
            # Add all parent paths to ensure creation
            parts = folder_path.split('/')
            for i in range(1, len(parts) + 1):
                folder_paths.add('/'.join(parts[:i]))
                
            file_destinations.append((row, folder_path))
            
        # 3. Create structure
        box_export_tasks[engine_id]["progress"] = 10
        # folder_mapping maps "Category/⭐ Latest" -> "12345"
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
        has_segregated = any(f["name"] == "Segregated Folder" for f in items.get("folders", []))
        return {"saved": has_segregated}
    except Exception as e:
        print(f"Error checking saved status: {e}")
        return {"saved": False}
