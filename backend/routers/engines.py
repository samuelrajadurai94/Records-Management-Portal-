from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import database, models, schemas, dependencies
from services.storage import storage_service

router = APIRouter(
    prefix="/engines",
    tags=["engines"],
)

@router.get("/", response_model=List[schemas.Engine])
def read_engines(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db), current_user: models.User = Depends(dependencies.get_current_user)):
    engines = db.query(models.Engine).filter(models.Engine.owner_id == current_user.id).offset(skip).limit(limit).all()
    return engines

from services.box_service import box_service
import os

@router.post("/", response_model=schemas.Engine)
def create_engine(engine: schemas.EngineCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(dependencies.get_current_user)):
    db_engine = db.query(models.Engine).filter(models.Engine.serial_number == engine.serial_number).first()
    if db_engine:
        raise HTTPException(status_code=400, detail="Engine with this serial number already exists")
    
    box_id = None
    
    # Handle Box Upload if local_path is provided
    if engine.local_path:
        if not os.path.exists(engine.local_path):
             raise HTTPException(status_code=400, detail=f"Local path does not exist: {engine.local_path}")
        
        print(f"Starting Box upload for: {engine.model_name} from {engine.local_path}")
        
        # Create Engine Folder in Box
        engine_folder = box_service.create_root_engine_folder(engine.model_name)
        if engine_folder:
            box_id = engine_folder.id
            # Recursive Upload
            box_service.upload_folder_contents(engine_folder.id, engine.local_path)
    
    # Fallback/Additional: Create local storage anyway? (User asked to store in Box)
    # We will keep local storage creation as backup or for legacy reasons if needed, 
    # but the primary request is Box.
    storage_service.create_directory(engine.model_name)
    
    db_engine = models.Engine(**engine.dict(exclude={'local_path'}), owner_id=current_user.id, box_folder_id=box_id)
    db.add(db_engine)
    db.commit()
    db.refresh(db_engine)
    return db_engine

@router.get("/{engine_id}", response_model=schemas.Engine)
def read_engine(engine_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(dependencies.get_current_user)):
    engine = db.query(models.Engine).filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id).first()
    if engine is None:
        raise HTTPException(status_code=404, detail="Engine not found")
    return engine
