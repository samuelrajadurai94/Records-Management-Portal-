
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from database import SessionLocal
import models

db = SessionLocal()
try:
    engine_sn = "697692"
    engine = db.query(models.Engine).filter(models.Engine.serial_number == engine_sn).first()
    if not engine:
        print(f"Engine {engine_sn} not found")
    else:
        print(f"Engine ID: {engine.id}")
        print(f"Selected LLP File ID: {engine.selected_llp_file_id}")
        
        records = db.query(models.LLPRecord).filter(models.LLPRecord.engine_id == engine.id).all()
        print(f"LLP Records count: {len(records)}")
        
        # Check segregation results
        seg_res = db.query(models.SegregationResult).filter(models.SegregationResult.engine_id == engine.id).first()
        if seg_res:
            import json
            data = seg_res.segregated
            print("Categories found in segregation:")
            found = False
            for cat, files in data.items():
                print(f" - {cat} ({len(files)} files)")
                for f in files:
                    fid = str(f.get('id', ''))
                    bfid = str(f.get('box_file_id', ''))
                    saved_id = str(engine.selected_llp_file_id)
                    
                    if bfid == saved_id or fid == saved_id:
                         print(f"   >>> FOUND SELECTED FILE IN CATEGORY: {cat}")
                         print(f"   >>> File Info: {f.get('box_file_name')}")
                         found = True
            if not found:
                print("   !!! Selected file NOT found in any category !!!")
        else:
            print("No segregation results found.")

finally:
    db.close()
