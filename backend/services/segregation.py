import os
from .storage import storage_service, STORAGE_ROOT
from sqlalchemy.orm import Session
import models
import time

def perform_auto_segregation(engine_id: int, db: Session):
    """
    Mock function to simulate auto folder segregation.
    """
    
    # ensure directories exist
    storage_service.ensure_directories(engine_id)
    
    # Mock Logic:
    # 1. Create specific categories in segregated folder
    categories = ["Logbooks", "Certificates", "Invoices"]
    created_files = []
    
    for cat in categories:
        # Create folder on disk
        # We don't explicitly store folders in DB as entities, just file paths. 
        # But if we want to show empty folders, we might need a folder approach. 
        # For simplicity, we just won't show empty folders or we assume they exist.
        # Let's create a dummy file in each to ensure they show up if we scan DB.
        
        dummy_filename = f"sample_{cat.lower()}.pdf"
        # We need to actually create the file on disk
        seg_path = storage_service._get_engine_path(engine_id, True)
        folder_path = os.path.join(seg_path, cat)
        os.makedirs(folder_path, exist_ok=True)
        
        file_path = os.path.join(folder_path, dummy_filename)
        with open(file_path, "w") as f:
            f.write(f"Sample content for {cat}")
            
        # Add to DB
        db_file = models.FileMetadata(
            filename=dummy_filename,
            file_path=file_path, # In real app, relative path
            is_segregated=True,
            engine_id=engine_id,
            folder_name=cat
        )
        db.add(db_file)
        created_files.append(db_file)

    # Create a report file
    report_filename = "segregation_report.txt"
    seg_path = storage_service._get_engine_path(engine_id, True)
    report_path = os.path.join(seg_path, report_filename)
    with open(report_path, "w") as f:
        f.write(f"Segregation performed for Engine {engine_id} at {time.ctime()}\n")
    
    db_report = models.FileMetadata(
        filename=report_filename,
        file_path=report_path,
        is_segregated=True,
        engine_id=engine_id,
        folder_name="root"
    )
    db.add(db_report)
    
    db.commit()
        
    return True
