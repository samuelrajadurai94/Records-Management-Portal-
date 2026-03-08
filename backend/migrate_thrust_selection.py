from sqlalchemy import create_engine, text
try:
    from database import SQLALCHEMY_DATABASE_URL
except ImportError:
    # Fallback if run from a different context
    SQLALCHEMY_DATABASE_URL = "postgresql://postgres:Sam1994@localhost:5432/gemrec_db"

def migrate():
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    with engine.connect() as conn:
        print("Checking for selected_thrust_ratings column in engines table...")
        try:
            # PostgreSQL syntax to add column if not exists
            conn.execute(text("ALTER TABLE engines ADD COLUMN IF NOT EXISTS selected_thrust_ratings JSONB DEFAULT '[]'::jsonb;"))
            conn.commit()
            print("Migration successful: selected_thrust_ratings added to engines table.")
        except Exception as e:
            print(f"Migration error: {e}")

if __name__ == "__main__":
    migrate()
