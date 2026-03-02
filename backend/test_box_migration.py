import os
import sys

# Add the backend directory to sys.path to allow importing services
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.services.box_service import box_service

def test_migration(shared_link, dest_folder_id):
    print(f"--- Starting Migration Test ---")
    print(f"Source Link: {shared_link}")
    print(f"Target ID:   {dest_folder_id}")
    
    result = box_service.import_folder_from_shared_link(shared_link, dest_folder_id)
    
    if result:
        print(f"\nSUCCESS! Folder imported as: {result.name} (ID: {result.id})")
    else:
        print(f"\nFAILED! Migration failed. Check backend logs for details.")

if __name__ == "__main__":
    # You can provided these manually here or via command line
    if len(sys.argv) < 3:
        print("Usage: python test_box_migration.py <SHARED_LINK> <DEST_FOLDER_ID>")
        print("Example: python test_box_migration.py https://app.box.com/s/xyz123 359797132460")
    else:
        test_migration(sys.argv[1], sys.argv[2])
