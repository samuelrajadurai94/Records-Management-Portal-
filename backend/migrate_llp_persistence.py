from sqlalchemy import create_engine, text
from database import SQLALCHEMY_DATABASE_URL

def migrate():
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    with engine.connect() as conn:
        print("Checking for selected_llp_file_id column in engines table...")
        try:
            # PostgreSQL syntax to add column if not exists
            conn.execute(text("ALTER TABLE engines ADD COLUMN IF NOT EXISTS selected_llp_file_id VARCHAR;"))
            conn.commit()
            print("Migration successful: selected_llp_file_id added to engines table.")
        except Exception as e:
            print(f"Migration error: {e}")

if __name__ == "__main__":
    migrate()
