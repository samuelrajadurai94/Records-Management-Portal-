"""
routers/segregation.py
----------------------
Endpoints for triggering and retrieving virtual folder segregation.
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from collections import defaultdict

import database, models, dependencies

from services import segregation as seg_service 

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
            "box_file_id":          r.box_file_id,
            "box_file_name":        r.box_file_name,
            "box_folder_id":        r.box_folder_id,
            "original_folder_path": r.original_folder_path,
            "prediction":           r.prediction,
            "confidence":           round(r.confidence, 3),
            "method":               r.method,
            "status":               r.status,
            "reason":               r.reason,
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
