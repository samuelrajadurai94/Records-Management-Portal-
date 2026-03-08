import sqlite3
import os
import json

# This script adds the selected_thrust_ratings column to the engines table
# Usage: python add_thrust_column.py

db_path = "backend/app.db" # Standard path based on project structure

if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    print("Checking for selected_thrust_ratings column...")
    cursor.execute("PRAGMA table_info(engines)")
    columns = [col[1] for col in cursor.fetchall()]
    
    if "selected_thrust_ratings" not in columns:
        print("Adding selected_thrust_ratings column...")
        # Since it's SQLite, we'll store it as TEXT and handle JSON in Python
        cursor.execute("ALTER TABLE engines ADD COLUMN selected_thrust_ratings TEXT DEFAULT '[]'")
        conn.commit()
        print("Column added successfully.")
    else:
        print("Column already exists.")

except Exception as e:
    print(f"Error during migration: {e}")
    conn.rollback()
finally:
    conn.close()
