from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import database, models, dependencies
from services import segregation

router = APIRouter(
    prefix="/segregation",
    tags=["segregation"],
)

@router.post("/run/{engine_id}")
def run_segregation(
    engine_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(dependencies.get_current_user)
):
    engine = db.query(models.Engine).filter(models.Engine.id == engine_id, models.Engine.owner_id == current_user.id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")

    # Check if already segregated? 
    # Logic: If 'segregated' files exist in DB for this engine?
    existing_segregated = db.query(models.FileMetadata).filter(
        models.FileMetadata.engine_id == engine_id, 
        models.FileMetadata.is_segregated == True
    ).first()
    
    if existing_segregated:
        return {"message": "Segregation done Already"}

    segregation.perform_auto_segregation(engine_id, db)
    return {"message": "Segregation completed successfully"}
