import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from backend.routers.segregation import _build_segregation_zip, zip_tasks

def test_zip(engine_id):
    print(f"Starting zip build for engine {engine_id}")
    _build_segregation_zip(engine_id)
    print("Zip task result:", zip_tasks.get(engine_id))

if __name__ == "__main__":
    if len(sys.argv) > 1:
        test_zip(int(sys.argv[1]))
    else:
        # Find an engine ID to test
        from backend.database import SessionLocal
        from backend.models import Engine
        db = SessionLocal()
        engine = db.query(Engine).first()
        if engine:
            print(f"Testing with engine {engine.id}")
            test_zip(engine.id)
        else:
            print("No engines found")
