from fastapi import APIRouter, Depends, HTTPException, Form, File, UploadFile, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
import database, models, schemas, dependencies
#from services.storage import storage_service
from services.box_service import box_service
import os
import shutil
import tempfile
import multipart.multipart

# Increase multipart file limits to allow large folder uploads (>1000 files)
multipart.multipart.parse_options_header = multipart.multipart.parse_options_header
multipart.multipart.FormParser.MAX_FILES = 100000
multipart.multipart.FormParser.MAX_FIELDS = 100000

router = APIRouter(
    prefix="/engines",
    tags=["engines"],
)

@router.get("/", response_model=List[schemas.Engine])
def read_engines(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db), current_user: models.User = Depends(dependencies.get_current_user)):
    engines = db.query(models.Engine).filter(models.Engine.owner_id == current_user.id).offset(skip).limit(limit).all()
    return engines

# In-memory storage for upload progress
# Key: serial_number, Value: { status, progress, completed, total, errors }
upload_progress = {}

@router.get("/upload-status/{serial_number}")
async def get_upload_status(serial_number: str):
    """Get the current upload progress for a specific engine"""
    status_obj = upload_progress.get(serial_number, {
        "status": "idle",
        "progress": 0,
        "completed": 0,
        "total": 0,
        "errors": []
    })
    return status_obj

def perform_box_upload(serial_number: str, model_name: str, upload_path: str, engine_id: int, db_session_factory, company_name: str = None):
    """Background task: upload to Box with per-file error handling and rich progress updates."""
    try:
        def update_progress(percentage, state=None):
            # Map Box's 0-100% into the 30-100% total range
            total_progress = 30 + int(percentage * 0.7)
            upload_progress[serial_number] = {
                "status": "running",
                "progress": total_progress,
                "completed": state["current"] if state else 0,
                "total":     state["total"]   if state else 0,
                "errors":    list(state["errors"]) if state else [],
            }
            print(f"Upload progress for {serial_number}: {total_progress}% ({(state or {}).get('current',0)}/{(state or {}).get('total',0)})")

        folder_name = f"{serial_number}"
        uploaded_folder, errors = box_service.create_and_upload_engine_folder(
            folder_name,
            upload_path,
            progress_callback=update_progress,
            company_name=company_name
        )

        if uploaded_folder:
            # Update database with Box Folder ID
            db = db_session_factory()
            try:
                engine = db.query(models.Engine).filter(models.Engine.id == engine_id).first()
                if engine:
                    engine.box_folder_id = uploaded_folder.id
                    db.commit()
            finally:
                db.close()

        # Mark as done (even if some files had errors — upload itself finished)
        prev = upload_progress.get(serial_number, {})
        upload_progress[serial_number] = {
            **prev,
            "status":   "done",
            "progress": 100,
            "errors":   errors,
        }

    except Exception as e:
        print(f"Error in background Box upload: {e}")
        prev = upload_progress.get(serial_number, {})
        upload_progress[serial_number] = {
            **prev,
            "status":   "error",
            "errors":   prev.get("errors", []) + [f"Fatal upload error: {e}"],
        }
    finally:
        # Cleanup Temp Dir
        if upload_path and os.path.exists(upload_path) and "temp" in upload_path:
            shutil.rmtree(upload_path)
            print(f"Cleaned up temp directory: {upload_path}")


@router.post("/init", response_model=schemas.EngineInitResponse)
def init_engine_upload(
    req: schemas.EngineInitRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user)
):
    db_engine = db.query(models.Engine).filter(models.Engine.serial_number == req.serial_number).first()
    if db_engine:
         raise HTTPException(status_code=400, detail="Engine with this serial number already exists")

    model_name = req.serial_number
    
    # Init Box Structure
    root_folder_id, folder_mapping = box_service.init_engine_folder_structure(
        req.serial_number, 
        req.folders, 
        current_user.company_name
    )
    
    if not root_folder_id:
        raise HTTPException(status_code=500, detail="Failed to initialize Box storage")

    db_engine = models.Engine(
        model_name=model_name,
        serial_number=req.serial_number,
        csn_value=req.csn_value,
        owner_id=current_user.id,
        box_folder_id=root_folder_id
    )
    db.add(db_engine)
    db.commit()
    db.refresh(db_engine)
    
    return schemas.EngineInitResponse(
        engine_id=db_engine.id,
        root_folder_id=root_folder_id,
        folder_mapping=folder_mapping
    )

@router.post("/{engine_id}/upload-single-file")
def upload_single_file(
    engine_id: int,
    box_folder_id: str = Form(...),
    file: UploadFile = File(...),
    current_user: models.User = Depends(dependencies.get_current_user)
):
    if box_folder_id == "undefined":
        raise HTTPException(status_code=400, detail="Invalid target folder ID (undefined). Please ensure the backend server has been restarted to load recent folder mapping fixes.")

    # Sanitize filename — strip any path separators to prevent path traversal
    # and avoid os.makedirs("") crash when filename has no directory component
    safe_filename = os.path.basename(file.filename or "unnamed_file") or "unnamed_file"
    temp_dir = tempfile.mkdtemp(prefix="engine_single_upload_")
    file_path = os.path.join(temp_dir, safe_filename)

    print(f"[upload-single-file] Receiving: {safe_filename} → box_folder: {box_folder_id}")

    try:
        # Save uploaded file to temp disk
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        file_size = os.path.getsize(file_path)
        print(f"[upload-single-file] Saved to disk: {safe_filename} ({file_size} bytes)")

        # Upload to Box
        result = box_service.upload_file(box_folder_id, file_path)
        if not result:
            print(f"[upload-single-file] Box upload returned None for: {safe_filename}")
            raise HTTPException(status_code=500, detail=f"Box upload failed for file: {safe_filename}")

        print(f"[upload-single-file] ✓ Uploaded to Box: {safe_filename}")
        return {"status": "success", "filename": safe_filename}

    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is (they produce proper 4xx/5xx responses)
    except Exception as e:
        # Catch ALL other exceptions and return 500 — never let them silently crash the worker
        print(f"[upload-single-file] ✗ Unexpected error for {safe_filename}: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Unexpected error uploading {safe_filename}: {str(e)}")
    finally:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


@router.post("/", response_model=schemas.Engine)
async def create_engine(
    background_tasks: BackgroundTasks,
    serial_number: str = Form(...),
    csn: int = Form(0),
    files: List[UploadFile] = File(None),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user)
):
    # Check for existing engine
    db_engine = db.query(models.Engine).filter(models.Engine.serial_number == serial_number).first()
    if db_engine:
         raise HTTPException(status_code=400, detail="Engine with this serial number already exists")
    
    # Use serial number as model name
    model_name = serial_number
    
    upload_path = None
    temp_dir = None

    # Handle Browser-based File Uploads
    if files:
        print(f"Receiving {len(files)} files from browser upload...")
        temp_dir = tempfile.mkdtemp(prefix=f"engine_{serial_number}_")
        upload_path = temp_dir

        # Prepare progress tracking for Phase 1 (Saving to Server)
        total_files = len(files)
        upload_progress[serial_number] = {
            "status": "running",
            "progress": 0,
            "completed": 0,
            "total": total_files,
            "errors": []
        }

        for i, file in enumerate(files):
            try:
                relative_path = file.filename.replace('\\', '/')
                safe_relative_path = os.path.normpath(relative_path).lstrip(os.sep).lstrip('/')

                # Strip the root folder name (common with webkitdirectory uploads)
                parts = safe_relative_path.split(os.sep)
                path_without_base = os.path.join(*parts[1:]) if len(parts) > 1 else parts[0]

                file_destination = os.path.join(temp_dir, path_without_base)

                # Guard: only create parent dir if it is not the temp_dir itself
                parent_dir = os.path.dirname(file_destination)
                if parent_dir and parent_dir != temp_dir:
                    os.makedirs(parent_dir, exist_ok=True)

                with open(file_destination, "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)
                
                # Update progress for Phase 1
                progress = int(((i + 1) / total_files) * 30) # Phase 1 is 0-30%
                upload_progress[serial_number]["progress"] = progress

            except Exception as file_err:
                print(f"[create_engine] Skipping file {file.filename}: {file_err}")
                continue

        print(f"Saved {total_files} uploaded files to {temp_dir}")

    # Create engine in DB first (without Box ID yet)
    db_engine = models.Engine(
        model_name=model_name,
        serial_number=serial_number,
        csn_value=csn,
        owner_id=current_user.id,
        box_folder_id=None # Will be updated by background task
    )
    db.add(db_engine)
    db.commit()
    db.refresh(db_engine)
    
    # Initialize Local Storage
    #storage_service.ensure_directories(db_engine.id)

    # Start Background Upload to Box
    if upload_path:
        # Note: perform_box_upload will reset completed to 0 for its own tracking but keep total.
        # It will also start progress from 30% to 100%.
        background_tasks.add_task(
            perform_box_upload, 
            serial_number, 
            model_name, 
            upload_path, 
            db_engine.id,
            database.SessionLocal, # Reference to session factory
            current_user.company_name
        )
    
    return db_engine

def perform_box_link_import(serial_number: str, engine_id: int, shared_link: str, company_name: str, db_session_factory):
    """Background task: import a folder from a Box shared link into our storage."""
    try:
        upload_progress[serial_number]["status"] = "running"
        upload_progress[serial_number]["progress"] = 10

        # Determine parent (under company or root)
        from services.box_service import ROOT_FOLDER_ID
        parent_id = ROOT_FOLDER_ID
        if company_name:
            company_folder = box_service.get_or_create_folder(company_name, ROOT_FOLDER_ID)
            if company_folder:
                parent_id = company_folder.id

        upload_progress[serial_number]["progress"] = 20

        # Create engine root folder (e.g. serial_number)
        engine_root = box_service.client.folders.create_folder(
            serial_number,
            __import__("box_sdk_gen.managers.folders", fromlist=["CreateFolderParent"]).CreateFolderParent(id=parent_id)
        )
        upload_progress[serial_number]["progress"] = 30

        # Create RAW FOLDER inside
        from box_sdk_gen.managers.folders import CreateFolderParent
        raw_folder = box_service.client.folders.create_folder(
            "RAW FOLDER",
            CreateFolderParent(id=engine_root.id)
        )
        upload_progress[serial_number]["progress"] = 40

        # Copy shared link folder into RAW FOLDER
        copied = box_service.import_folder_from_shared_boxlink(shared_link, raw_folder.id)

        if not copied:
            raise Exception("import_folder_from_shared_boxlink returned None — check shared link permissions.")

        upload_progress[serial_number]["progress"] = 95

        # Update DB with the engine root box_folder_id
        db = db_session_factory()
        try:
            eng = db.query(models.Engine).filter(models.Engine.id == engine_id).first()
            if eng:
                eng.box_folder_id = engine_root.id
                db.commit()
        finally:
            db.close()

        upload_progress[serial_number] = {
            "status": "done",
            "progress": 100,
            "completed": 1,
            "total": 1,
            "errors": []
        }
        print(f"[import-from-link] Done for {serial_number}")

    except Exception as e:
        print(f"[import-from-link] Error for {serial_number}: {e}")
        upload_progress[serial_number] = {
            "status": "error",
            "progress": 0,
            "completed": 0,
            "total": 0,
            "errors": [str(e)]
        }

@router.post("/import-from-link", response_model=schemas.Engine)
async def import_engine_from_box_link(
    background_tasks: BackgroundTasks,
    serial_number: str = Form(...),
    box_link: str = Form(...),
    csn: int = Form(0),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user)
):
    """Import an engine folder from a Box shared link into our Box storage."""
    # Check for duplicate
    existing = db.query(models.Engine).filter(models.Engine.serial_number == serial_number).first()
    if existing:
        raise HTTPException(status_code=400, detail="Engine with this serial number already exists")
    
    # Create engine record
    db_engine = models.Engine(
        model_name=serial_number,
        serial_number=serial_number,
        csn_value=csn,
        owner_id=current_user.id,
        box_folder_id=None
    )
    db.add(db_engine)
    db.commit()
    db.refresh(db_engine)

    # Init progress
    upload_progress[serial_number] = {
        "status": "running",
        "progress": 5,
        "completed": 0,
        "total": 1,
        "errors": []
    }

    background_tasks.add_task(
        perform_box_link_import,
        serial_number,
        db_engine.id,
        box_link,
        current_user.company_name,
        database.SessionLocal
    )

    return db_engine

@router.get("/{engine_id}", response_model=schemas.Engine)
def read_engine(engine_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(dependencies.get_current_user)):
    engine = db.query(models.Engine).filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id).first()
    if engine is None:
        raise HTTPException(status_code=404, detail="Engine not found")
    return engine

@router.get("/{engine_id}/box-structure")
def get_box_structure(engine_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(dependencies.get_current_user)):
    """Get Box folder hierarchy for an engine"""
    engine = db.query(models.Engine).filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")
    
    if not engine.box_folder_id:
        raise HTTPException(status_code=404, detail="No Box folder linked to this engine")
    
    hierarchy = box_service.get_folder_hierarchy(engine.box_folder_id)
    if not hierarchy:
        raise HTTPException(status_code=500, detail="Failed to retrieve folder structure from Box")
    
    return hierarchy

@router.get("/{engine_id}/box-folder/{folder_id}")
def get_folder_contents(engine_id: int, folder_id: str, db: Session = Depends(database.get_db), current_user: models.User = Depends(dependencies.get_current_user)):
    """Get contents of a specific Box folder formatted for tree expansion"""
    engine = db.query(models.Engine).filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")
    
    items = box_service.get_folder_items(folder_id)
    
    # Format for tree
    children = []
    for f in items["folders"]:
        children.append({"id": f["id"], "name": f["name"], "type": "folder", "children": [], "isLoaded": False})
    for f in items["files"]:
        children.append({"id": f["id"], "name": f["name"], "type": "file", "size": f.get("size", 0)})
        
    return children

@router.get("/{engine_id}/box-file/{file_id}")
def get_file_url(engine_id: int, file_id: str, db: Session = Depends(database.get_db), current_user: models.User = Depends(dependencies.get_current_user)):
    """Get download URL for a specific Box file"""
    engine = db.query(models.Engine).filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")
    
    file_info = box_service.get_file_info(file_id)
    download_url = box_service.get_file_download_url(file_id)
    embed_link = box_service.get_file_embed_link(file_id)
    
    if not file_info:
        raise HTTPException(status_code=404, detail="File not found or unavailable")
    
    return {
        "file_info": file_info, 
        "download_url": download_url,
        "embed_link": embed_link
    }

@router.delete("/{engine_id}")
def delete_engine(engine_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(dependencies.get_current_user)):
    """Delete an engine and its associated Box folder"""
    engine = db.query(models.Engine).filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")
    
    # Delete from Box if folder exists
    if engine.box_folder_id:
        success = box_service.delete_folder(engine.box_folder_id)
        if not success:
            print(f"Warning: Could not delete Box folder {engine.box_folder_id}")
            # We continue to delete from DB even if Box delete fails, or should we?
            # Usually better to clean up DB, but maybe log a warning.
    
    # Delete from Database
    db.delete(engine)
    db.commit()
    
    return {"message": "Engine deleted successfully"}
