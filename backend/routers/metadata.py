"""
routers/metadata.py
-------------------
Endpoints for triggering and monitoring text extraction on segregation results.
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

import database, models, dependencies
from services import Metadata_tagging as meta_service

router = APIRouter(prefix="/metadata", tags=["metadata"])


@router.post("/extract-text/{engine_id}")
def run_text_extraction(
    engine_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    """Trigger background text extraction for files with empty raw_text."""
    engine = (
        db.query(models.Engine)
        .filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id)
        .first()
    )
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")

    current_status = meta_service.get_extraction_status(engine_id)
    if current_status["status"] == "running":
        return {"message": "Text extraction already in progress", "status": "running"}

    # Use a new DB session inside the background task (sessions aren't thread-safe)
    def run_task():
        bg_db = next(database.get_db())
        try:
            meta_service.perform_text_extraction(engine_id, bg_db)
        finally:
            bg_db.close()

    background_tasks.add_task(run_task)
    return {"message": "Text extraction started", "status": "running"}


@router.get("/extract-text/status/{engine_id}")
def get_extraction_status(
    engine_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    """Returns current extraction job status: idle | running | done | error"""
    engine = (
        db.query(models.Engine)
        .filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id)
        .first()
    )
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")

    status = meta_service.get_extraction_status(engine_id)
    return status


@router.get("/stats/{engine_id}")
def get_engine_file_stats(
    engine_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    """Returns file statistics for the engine from segregation_results."""
    engine = (
        db.query(models.Engine)
        .filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id)
        .first()
    )
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")

    from sqlalchemy import func, and_, or_

    MEDIA_EXTENSIONS = [".mp4", ".png", ".jpeg", ".jpg", ".tif", ".heic", ".bmp"]

    # Total files in segregation results
    total_files = (
        db.query(func.count(models.SegregationResult.id))
        .filter(models.SegregationResult.engine_id == engine_id)
        .scalar()
    )

    # PDF files (filename ends with .pdf, case-insensitive)
    total_pdf_files = (
        db.query(func.count(models.SegregationResult.id))
        .filter(
            models.SegregationResult.engine_id == engine_id,
            func.lower(models.SegregationResult.box_file_name).like("%.pdf"),
        )
        .scalar()
    )

    # Media files (filename ends with any media extension)
    media_conditions = [
        func.lower(models.SegregationResult.box_file_name).like(f"%{ext}")
        for ext in MEDIA_EXTENSIONS
    ]
    media_files = (
        db.query(func.count(models.SegregationResult.id))
        .filter(
            models.SegregationResult.engine_id == engine_id,
            or_(*media_conditions),
        )
        .scalar()
    )

    # Other files = total - pdf - media
    other_files = total_files - total_pdf_files - media_files

    # PDFs with extracted raw text (PDF file AND raw_text is not null/empty)
    pdfs_with_text = (
        db.query(func.count(models.SegregationResult.id))
        .filter(
            models.SegregationResult.engine_id == engine_id,
            func.lower(models.SegregationResult.box_file_name).like("%.pdf"),
            models.SegregationResult.raw_text != None,
            models.SegregationResult.raw_text != "",
        )
        .scalar()
    )

    # PDFs with non-empty metadata_json (not null and not empty {})
    from sqlalchemy import String as _String
    files_with_tags = (
        db.query(func.count(models.SegregationResult.id))
        .filter(
            models.SegregationResult.engine_id == engine_id,
            func.lower(models.SegregationResult.box_file_name).like("%.pdf"),
            models.SegregationResult.metadata_json.isnot(None),
            func.cast(models.SegregationResult.metadata_json, _String) != "{}",
        )
        .scalar()
    )


    return {
        "total_files": total_files,
        "total_pdf_files": total_pdf_files,
        "media_files": media_files,
        "other_files": other_files,
        "pdfs_with_text": pdfs_with_text,
        "files_with_tags": files_with_tags,
    }


# ─────────────────────────────────────────────────────────────
# METADATA TAGGING ENDPOINTS
# ─────────────────────────────────────────────────────────────

@router.post("/tag/{engine_id}")
def start_metadata_tagging(
    engine_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    """Start background Gemini metadata tagging for eligible segregation result rows."""
    engine = (
        db.query(models.Engine)
        .filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id)
        .first()
    )
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")

    current_status = meta_service.get_tagging_status(engine_id)
    if current_status["status"] == "running":
        return {"message": "Metadata tagging already in progress", "status": "running"}

    def run_task():
        bg_db = next(database.get_db())
        try:
            meta_service.perform_metadata_tagging(engine_id, bg_db)
        finally:
            bg_db.close()

    background_tasks.add_task(run_task)
    return {"message": "Metadata tagging started", "status": "running"}


@router.get("/tag/status/{engine_id}")
def get_tagging_status(
    engine_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    """Returns current metadata-tagging job status: idle | running | done | error"""
    engine = (
        db.query(models.Engine)
        .filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id)
        .first()
    )
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")

    status = meta_service.get_tagging_status(engine_id)
    return status


# ─────────────────────────────────────────────────────────────
# FULL PIPELINE ENDPOINTS (single-button: extract + tag)
# ─────────────────────────────────────────────────────────────

@router.post("/pipeline/{engine_id}")
def start_full_pipeline(
    engine_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    """
    Start the full metadata pipeline in background:
      For every eligible PDF row (not in excluded categories):
        1. Extract text if missing
        2. Tag with Gemini if schema available
        3. Log errors to meta_data_status
    """
    engine = (
        db.query(models.Engine)
        .filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id)
        .first()
    )
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")

    current = meta_service.get_pipeline_status(engine_id)
    if current["status"] == "running":
        return {"message": "Pipeline already running", "status": "running"}

    def run_task():
        bg_db = next(database.get_db())
        try:
            meta_service.perform_full_pipeline(engine_id, bg_db)
        finally:
            bg_db.close()

    background_tasks.add_task(run_task)
    return {"message": "Full pipeline started", "status": "running"}


@router.get("/pipeline/status/{engine_id}")
def get_pipeline_status(
    engine_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    """Returns current full-pipeline status: idle | running | done | error"""
    engine = (
        db.query(models.Engine)
        .filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id)
        .first()
    )
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")

    return meta_service.get_pipeline_status(engine_id)



@router.get("/file-metadata/{engine_id}")
def get_file_metadata(
    engine_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    """
    Returns all segregation result rows for an engine with their metadata_json.
    Also returns has_text (bool) and has_schema (bool) so the frontend can
    immediately show the right action state without an extra API call.
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

    schema_categories = set(meta_service.Pydantic_Schema_mapping_dict.keys())

    return [
        {
            "id": r.id,
            "box_file_id": r.box_file_id,
            "box_file_name": r.box_file_name,
            "category": r.category,
            "method": r.method,
            "original_folder_path": r.original_folder_path,
            "latest": r.latest,
            "confidence": r.confidence,
            "metadata_json": r.metadata_json,
            # Pre-computed state flags for the frontend viewer
            "has_text": bool(r.raw_text and r.raw_text.strip()),
            "has_schema": r.category in schema_categories,
        }
        for r in rows
    ]


@router.post("/process-file/{engine_id}/{result_id}")
def process_single_file(
    engine_id: int,
    result_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user),
):
    """
    On-demand single-file processing:
      1. If raw_text is empty → download from Box and extract text
      2. If category has a Pydantic schema → call Gemini and save metadata_json
    Returns the resulting metadata_json and state flags.
    This is synchronous (blocking) so the frontend can await it directly.
    """
    # Verify engine ownership
    engine = (
        db.query(models.Engine)
        .filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id)
        .first()
    )
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")

    # Verify the result belongs to this engine
    row = (
        db.query(models.SegregationResult)
        .filter(
            models.SegregationResult.id == result_id,
            models.SegregationResult.engine_id == engine_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="File record not found")

    result = meta_service.process_single_file(result_id, db)

    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])

    return result
