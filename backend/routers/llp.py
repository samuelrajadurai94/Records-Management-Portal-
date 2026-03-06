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

@router.get("", response_model=List[schemas.LLPRecordResponse])
def get_llp_records(engine_id: int, db: Session = Depends(database.get_db)):
    # Check if the engine exists
    engine = db.query(models.Engine).filter(models.Engine.id == engine_id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")

    # Fetch existing records
    records = db.query(models.LLPRecord).filter(models.LLPRecord.engine_id == engine_id).order_by(models.LLPRecord.sr_no).all()

    # If empty, auto-seed the default 15 parts
    if not records:
        for p in DEFAULT_LLP_PARTS:
            new_record = models.LLPRecord(
                engine_id=engine_id,
                part_group=p["part_group"],
                sr_no=p["sr_no"],
                description=p["description"]
            )
            db.add(new_record)
        
        db.commit()
        # Fetch again after seeding
        records = db.query(models.LLPRecord).filter(models.LLPRecord.engine_id == engine_id).order_by(models.LLPRecord.sr_no).all()

    return records

@router.put("", response_model=List[schemas.LLPRecordResponse])
def update_llp_records(engine_id: int, updates: List[schemas.LLPRecordUpdate], db: Session = Depends(database.get_db)):
    engine = db.query(models.Engine).filter(models.Engine.id == engine_id).first()
    if not engine:
        raise HTTPException(status_code=404, detail="Engine not found")

    updated_records = []
    
    for update_data in updates:
        if update_data.id:
            db_record = db.query(models.LLPRecord).filter(models.LLPRecord.id == update_data.id, models.LLPRecord.engine_id == engine_id).first()
            if db_record:
                # Update fields
                for key, value in update_data.dict(exclude={"id"}).items():
                    setattr(db_record, key, value)
                updated_records.append(db_record)
        else:
            # If the frontend passes a new row without an ID, we can create it
            new_record = models.LLPRecord(
                engine_id=engine_id,
                **update_data.dict(exclude={"id"})
            )
            db.add(new_record)
            updated_records.append(new_record)

    db.commit()
    
    # Refresh to return full models
    for rec in updated_records:
        db.refresh(rec)
        
    return updated_records
