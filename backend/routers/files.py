from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import database, models, schemas, dependencies
from services.storage import storage_service

router = APIRouter(
    prefix="/files",
    tags=["files"],
)

@router.post("/upload/{engine_id}", response_model=schemas.FileMetadata)
async def upload_file(
    engine_id: int,
    file: UploadFile = File(...),
    folder_name: str = Form("root"),
    is_segregated: bool = Form(False),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user)
):
    # Verify engine ownership
    engine = db.query(models.Engine).filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")

    # Save to disk
    file_path = await storage_service.save_file(engine_id, file, folder_name, is_segregated)
    
    # Save to DB
    db_file = models.FileMetadata(
        filename=file.filename,
        file_path=file_path,
        is_segregated=is_segregated,
        engine_id=engine_id,
        folder_name=folder_name
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)
    return db_file

@router.get("/{engine_id}", response_model=List[schemas.FileMetadata])
def list_files(
    engine_id: int,
    is_segregated: Optional[bool] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user)
):
    engine = db.query(models.Engine).filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")
        
    query = db.query(models.FileMetadata).filter(models.FileMetadata.engine_id == engine_id)
    if is_segregated is not None:
        query = query.filter(models.FileMetadata.is_segregated == is_segregated)
        
    return query.all()

@router.post("/move/{file_id}")
def move_file(
    file_id: int,
    move_req: schemas.FileMoveRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user)
):
    file_meta = db.query(models.FileMetadata).filter(models.FileMetadata.id == file_id).first()
    if not file_meta:
        raise HTTPException(status_code=404, detail="File not found")
        
    # Verify ownership via engine
    engine = db.query(models.Engine).filter(models.Engine.id == file_meta.engine_id, models.Engine.owner_id == current_user.id).first()
    if not engine:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Move logic on disk
    try:
        new_path = storage_service.move_file(
            file_meta.file_path, 
            move_req.target_folder, 
            file_meta.engine_id, 
            move_req.is_segregated
        )
        
        # Update DB
        file_meta.file_path = new_path
        file_meta.folder_name = move_req.target_folder
        file_meta.is_segregated = move_req.is_segregated
        db.commit()
        return {"message": "File moved successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
