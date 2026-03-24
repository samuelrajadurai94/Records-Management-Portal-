import sys
import os

os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.getcwd())

from database import SessionLocal
from models import SegregationResult, Engine
from services.box_service import box_service

def test_copy():
    db = SessionLocal()
    row = db.query(SegregationResult).filter(SegregationResult.box_file_id.isnot(None)).first()
    engine = db.query(Engine).filter(Engine.id == row.engine_id).first()
    if not row or not engine:
        print("No segregated file with box_file_id found.")
        return
        
    print(f"Testing remote copy for file {row.box_file_id} ({row.box_file_name}) to engine folder {engine.box_folder_id}")
    try:
        # Create a test Temp Segregated folder
        parent_folder = box_service.get_or_create_folder("Temp Segregated Folders", engine.box_folder_id)
        print(f"Parent folder ID created: {parent_folder.id}")
        
        # Test out the copy_file syntax
        if hasattr(box_service.client.files, 'copy_file'):
            print("Found copy_file")
            # In box-sdk-gen: 
            # def copy_file(self, file_id: str, parent: CopyFileParent, name: Optional[str] = None)
            from box_sdk_gen.managers.files import CopyFileParent
            copied_file = box_service.client.files.copy_file(
                file_id=row.box_file_id,
                parent=CopyFileParent(id=parent_folder.id),
                name=f"Copied_{row.box_file_name}"
            )
            print("Successfully copied file. New ID:", copied_file.id)
            
            # Clean up the folder
            box_service.client.folders.delete_folder(parent_folder.id, recursive=True)
            print("Cleaned up temp folder.")
        else:
            print("Looking for copy_file in attributes:", dir(box_service.client.files))
            
    except Exception as e:
        print("Failed:", e)

if __name__ == "__main__":
    test_copy()
