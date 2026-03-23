import sys
import os

os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.getcwd())

from database import SessionLocal
from models import SegregationResult
from services.box_service import box_service

def test_download():
    db = SessionLocal()
    row = db.query(SegregationResult).filter(SegregationResult.box_file_id.isnot(None)).first()
    if not row:
        print("No segregated file with box_file_id found.")
        return
        
    print(f"Testing download for file {row.box_file_id} ({row.box_file_name})")
    try:
        # Box Python SDK Gen uses downloads.download_file
        file_stream = box_service.client.downloads.download_file(row.box_file_id)
        
        # It's usually a generator or a byte stream
        print("Type of file_stream:", type(file_stream))
        if hasattr(file_stream, 'read'):
            content = file_stream.read()
            print("Successfully read() content of len:", len(content))
        else:
            print("Looking for how to read stream. Attributes:", dir(file_stream))
            # it might be a generator yielding bytes
            chunks = list(file_stream)
            print("Chunks length:", len(chunks))
            if len(chunks) > 0:
                print("Type of first chunk:", type(chunks[0]))
    except Exception as e:
        print("Failed:", e)

if __name__ == "__main__":
    test_download()
