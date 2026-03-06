
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from database import SessionLocal
import models

db = SessionLocal()
try:
    engine_sn = "33crnew1"
    engine = db.query(models.Engine).filter(models.Engine.serial_number == engine_sn).first()
    if not engine:
        print(f"Engine {engine_sn} not found")
    else:
        print(f"Engine ID: {engine.id}")
        print(f"Selected LLP File ID: {engine.selected_llp_file_id} (Type: {type(engine.selected_llp_file_id)})")
        
        records = db.query(models.LLPRecord).filter(models.LLPRecord.engine_id == engine.id).all()
        print(f"LLP Records count: {len(records)}")
        
        # Check segregation results for this engine
        seg_rows = db.query(models.SegregationResult).filter(models.SegregationResult.engine_id == engine.id).all()
        print(f"Total segregation rows: {len(seg_rows)}")
        
        # Check if there are any files with metadata
        meta_files = [r for r in seg_rows if r.metadata_json]
        print(f"Files with metadata: {len(meta_files)}")
        if meta_files:
            for f in meta_files[:3]:
                print(f" - {f.box_file_name}: {len(str(f.metadata_json))} chars of metadata")

finally:
    db.close()
