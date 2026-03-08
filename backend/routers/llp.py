from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import models
import schemas
import database

router = APIRouter(
    prefix="/engines/{engine_id}/llp-records",
    tags=["llp-records"]
)

DEFAULT_LLP_PARTS = [
    {"part_group": "FAN ROTOR", "sr_no": 1, "description": "Booster Spool"},
    {"part_group": "FAN ROTOR", "sr_no": 2, "description": "Fan Disk"},
    {"part_group": "FAN ROTOR", "sr_no": 3, "description": "Fan Drive Shaft"},
    {"part_group": "COMPRESSOR ROTOR", "sr_no": 4, "description": "HPC Front Shaft"},
    {"part_group": "COMPRESSOR ROTOR", "sr_no": 5, "description": "HPC Stage 1 - 2 Spool"},
    {"part_group": "COMPRESSOR ROTOR", "sr_no": 6, "description": "HPC Stage 3 Disk"},
    {"part_group": "COMPRESSOR ROTOR", "sr_no": 7, "description": "HPC Stage 4 - 9 Spool"},
    {"part_group": "COMPRESSOR ROTOR", "sr_no": 8, "description": "HPC Rear Air Seal"},
    {"part_group": "HIGH PRESSURE TURBINE (HPT) ROTOR", "sr_no": 9, "description": "HPT Front Shaft"},
    {"part_group": "HIGH PRESSURE TURBINE (HPT) ROTOR", "sr_no": 10, "description": "HPT Front Air Seal"},
    {"part_group": "HIGH PRESSURE TURBINE (HPT) ROTOR", "sr_no": 11, "description": "HPT Disk"},
    {"part_group": "HIGH PRESSURE TURBINE (HPT) ROTOR", "sr_no": 12, "description": "HPT Rear Shaft"},
    {"part_group": "LOW PRESSURE TURBINE (LPT) ROTOR", "sr_no": 13, "description": "LPT Stage 1 Disk"},
    {"part_group": "LOW PRESSURE TURBINE (LPT) ROTOR", "sr_no": 14, "description": "LPT Stage 2 Disk"},
    {"part_group": "LOW PRESSURE TURBINE (LPT) ROTOR", "sr_no": 15, "description": "LPT Stage 3 Disk"},
]

@router.get("", response_model=schemas.LLPFetchResponse)
def get_llp_records(engine_id: int, db: Session = Depends(database.get_db)):
    # Check if the engine exists
    engine = db.query(models.Engine).filter(models.Engine.id == engine_id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")

    # Fetch existing records
    records = db.query(models.LLPRecord).filter(models.LLPRecord.engine_id == engine_id).order_by(models.LLPRecord.sr_no).all()

    # If empty, do not auto-seed. Just return empty list.
    if not records:
        records = []

    return {
        "records": records,
        "selected_llp_file_id": engine.selected_llp_file_id,
        "selected_thrust_ratings": engine.selected_thrust_ratings or []
    }

@router.put("", response_model=schemas.LLPFetchResponse)
def update_llp_records(engine_id: int, request: schemas.LLPBulkUpdateRequest, db: Session = Depends(database.get_db)):
    engine = db.query(models.Engine).filter(models.Engine.id == engine_id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")

    # Update Engine metadata
    engine.selected_llp_file_id = request.selected_llp_file_id
    engine.selected_thrust_ratings = request.selected_thrust_ratings

    # Sync approach: Update given, Create missing, Delete omitted
    existing_records = db.query(models.LLPRecord).filter(models.LLPRecord.engine_id == engine_id).all()
    existing_ids = {r.id for r in existing_records}
    incoming_ids = {r.id for r in request.records if r.id is not None}
    
    # Delete those not in new list
    ids_to_delete = existing_ids - incoming_ids
    if ids_to_delete:
        db.query(models.LLPRecord).filter(
            models.LLPRecord.id.in_(ids_to_delete), 
            models.LLPRecord.engine_id == engine_id
        ).delete(synchronize_session=False)

    updated_records = []
    
    for update_data in request.records:
        if update_data.id:
            db_record = db.query(models.LLPRecord).filter(models.LLPRecord.id == update_data.id, models.LLPRecord.engine_id == engine_id).first()
            if db_record:
                # Update fields
                for key, value in update_data.dict(exclude={"id", "engine_id"}).items():
                    setattr(db_record, key, value)
                updated_records.append(db_record)
        else:
            # Create new row
            # Use exclude to ensure no double engine_id if accidentally sent
            rec_dict = update_data.dict(exclude={"id", "engine_id"})
            new_record = models.LLPRecord(
                engine_id=engine_id,
                **rec_dict
            )
            db.add(new_record)
            updated_records.append(new_record)

    db.commit()
    
    # Refresh to return full models
    for rec in updated_records:
        db.refresh(rec)
        
    return {
        "records": updated_records,
        "selected_llp_file_id": engine.selected_llp_file_id,
        "selected_thrust_ratings": engine.selected_thrust_ratings or []
    }
