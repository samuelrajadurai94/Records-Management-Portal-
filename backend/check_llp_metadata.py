import json
from sqlalchemy import create_engine, text
from database import SQLALCHEMY_DATABASE_URL

engine = create_engine(SQLALCHEMY_DATABASE_URL)
with engine.connect() as conn:
    result = conn.execute(text("SELECT box_file_name, metadata_json FROM segregation_results WHERE category = '19. LLP Summary' AND metadata_json IS NOT NULL LIMIT 3;"))
    print("Metadata for LLP Summary files:")
    for row in result:
        print(f"File: {row[0]}")
        print(json.dumps(row[1], indent=2))
        print("-" * 40)
