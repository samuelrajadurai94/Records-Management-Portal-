
import sys
import os
import json

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from database import SessionLocal
import models

db = SessionLocal()
try:
    engine_sn = "33crnew1"
    engine = db.query(models.Engine).filter(models.Engine.serial_number == engine_sn).first()
    if engine:
        f = db.query(models.SegregationResult).filter(
            models.SegregationResult.engine_id == engine.id,
            models.SegregationResult.metadata_json.isnot(None)
        ).first()
        if f:
            print(f"File: {f.box_file_name}")
            meta = f.metadata_json
            if isinstance(meta, str):
                meta = json.loads(meta)
            
            components = meta.get('components', meta.get('records', []))
            print(f"Total components found: {len(components)}")
            if components:
                print("First component sample:")
                print(json.dumps(components[0], indent=2))
finally:
    db.close()
