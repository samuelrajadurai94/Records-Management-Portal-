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

@router.post("/", response_model=schemas.Engine)
def create_engine(engine: schemas.EngineCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(dependencies.get_current_user)):
    db_engine = db.query(models.Engine).filter(models.Engine.serial_number == engine.serial_number).first()
    if db_engine:
        raise HTTPException(status_code=400, detail="Engine with this serial number already exists")
    
    # Create folder in local storage
    storage_service.create_directory(engine.model_name)
    
    db_engine = models.Engine(**engine.dict(), owner_id=current_user.id)
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
