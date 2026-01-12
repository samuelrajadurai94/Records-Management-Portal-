from fastapi import APIRouter, Depends, HTTPException, Form, File, UploadFile
from sqlalchemy.orm import Session
from typing import List, Optional
import database, models, schemas, dependencies
from services.storage import storage_service
from services.box_service import box_service
import os
import shutil
import tempfile

router = APIRouter(
    prefix="/engines",
    tags=["engines"],
)

@router.get("/", response_model=List[schemas.Engine])
def read_engines(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db), current_user: models.User = Depends(dependencies.get_current_user)):
    engines = db.query(models.Engine).filter(models.Engine.owner_id == current_user.id).offset(skip).limit(limit).all()
    return engines

@router.post("/", response_model=schemas.Engine)
async def create_engine(
    serial_number: str = Form(...),
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
    
    box_id = None
    upload_path = None

    # Handle Browser-based File Uploads
    temp_dir = None
    if files:
        print(f"Receiving {len(files)} files from browser upload...")
        # Create a temp directory structure
        temp_dir = tempfile.mkdtemp(prefix=f"engine_{serial_number}_")
        upload_path = temp_dir # Override path to point to temp dir
        
        for file in files:
            # Construct strict path: temp_dir/filename (or relative path if provided)
            # Browser uploads usually give filename. If webkitdirectory, filename might contain slashes? 
            # request.files usually flattens, but let's check. 
            # For simplicity, we save flat or assume filename has structure. 
            # Actually, standard upload usually gives basename. 
            # We will save them flat in the temp folder for now, or handle relative paths if available.
            # Using file.filename.
            
            # sanitize filename
            safe_filename = os.path.basename(file.filename)
            file_destination = os.path.join(temp_dir, safe_filename)
            
            with open(file_destination, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        
        print(f"Saved uploaded files to {temp_dir}")
        print("Files:", os.listdir(temp_dir))

    # Handle Box Upload (only if files were uploaded via browser)
    if upload_path:
        print(f"Starting Box upload for: {model_name} (SN: {serial_number}) from {upload_path}")
        
        folder_name = f"{serial_number}"
        uploaded_folder = box_service.create_and_upload_engine_folder(folder_name, upload_path)
        
        if uploaded_folder:
            box_id = uploaded_folder.id
                
    # Cleanup Temp Dir
    if temp_dir and os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
        print(f"Cleaned up temp directory: {temp_dir}")

    
    db_engine = models.Engine(
        model_name=model_name,
        serial_number=serial_number,
        owner_id=current_user.id,
        box_folder_id=box_id
    )
    db.add(db_engine)
    db.commit()
    db.refresh(db_engine)
    
    # Fallback Local Storage Creation (after engine is created so we have the ID)
    storage_service.ensure_directories(db_engine.id)
    
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
    """Get contents of a specific Box folder"""
    engine = db.query(models.Engine).filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")
    
    items = box_service.get_folder_items(folder_id)
    return items

@router.get("/{engine_id}/box-file/{file_id}")
def get_file_url(engine_id: int, file_id: str, db: Session = Depends(database.get_db), current_user: models.User = Depends(dependencies.get_current_user)):
    """Get download URL for a specific Box file"""
    engine = db.query(models.Engine).filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")
    
    file_info = box_service.get_file_info(file_id)
    download_url = box_service.get_file_download_url(file_id)
    
    if not file_info or not download_url:
        raise HTTPException(status_code=404, detail="File not found or unavailable")
    
    return {"file_info": file_info, "download_url": download_url}
