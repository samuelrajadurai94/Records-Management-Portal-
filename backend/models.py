from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Float, Text,text
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB

from database import Base
import datetime

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True) # Used for login
    company_name = Column(String) 
    role = Column(String, default="client") # 'client' or 'spi'
    hashed_password = Column(String)
    is_active = Column(Boolean, default=True)

    engines = relationship("Engine", back_populates="owner")

class Engine(Base):
    __tablename__ = "engines"

    id = Column(Integer, primary_key=True, index=True)
    model_name = Column(String, index=True)
    serial_number = Column(String, unique=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    box_folder_id = Column(String, nullable=True)
    csn_value = Column(Integer, default=0)
    selected_llp_file_id = Column(String, nullable=True) # Persists the file used for LLP Status
    selected_thrust_ratings = Column(JSONB, server_default=text("'[]'::jsonb"), nullable=True)

    owner = relationship("User", back_populates="engines")
    files = relationship("FileMetadata", back_populates="engine")
    segregation_results = relationship("SegregationResult", back_populates="engine", cascade="all, delete-orphan")
    llp_records = relationship("LLPRecord", back_populates="engine", cascade="all, delete-orphan")

class FileMetadata(Base):
    __tablename__ = "files"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String)
    file_path = Column(String) # Relative path in storage
    is_segregated = Column(Boolean, default=False) # True if in Segregated folder
    engine_id = Column(Integer, ForeignKey("engines.id"))
    folder_name = Column(String, default="root") # "root" or subfolder name
    upload_date = Column(DateTime, default=datetime.datetime.utcnow)

    engine = relationship("Engine", back_populates="files")

class SegregationResult(Base):
    """Stores virtual (no-move) segregation result for each Box file."""
    __tablename__ = "segregation_results"

    id                   = Column(Integer, primary_key=True, index=True)
    engine_id            = Column(Integer, ForeignKey("engines.id"))
    box_file_id          = Column(String, index=True)   # Box file ID
    box_file_name        = Column(String)
    box_folder_id        = Column(String)               # immediate parent Box folder ID
    original_folder_path = Column(String, default="")   # ancestor path, e.g. "RAW FOLDER/Engine Data Plate"
    category             = Column(String, default="Unclassified")  # virtual segregation bucket
    prediction           = Column(String, default="Manual Segregation")
    confidence           = Column(Float,  default=0.0)
    method               = Column(String, default="")   # 'Folder Match' / 'AI MODEL' / 'Direct Keyword' / 'Manual'
    status               = Column(String, default="")   # 'PDF readable', 'OCR readable', etc.
    raw_text             = Column(Text,   default="")
    cleaned_text         = Column(Text,   default="")
    reason               = Column(String, default="")
    created_at           = Column(DateTime, default=datetime.datetime.utcnow)
    latest               = Column(Boolean, default=False)
    text_extraction_status = Column(String(200), default="")
    metadata_json = Column(JSONB,server_default=text("'{}'::jsonb"),nullable=True)
    meta_data_status = Column(String(500), default="")  # Per-file pipeline status / error message



    engine = relationship("Engine", back_populates="segregation_results")

class LLPRecord(Base):
    __tablename__ = "llp_records"

    id = Column(Integer, primary_key=True, index=True)
    engine_id = Column(Integer, ForeignKey("engines.id"))
    part_group = Column(String, default="")  # e.g., "FAN ROTOR"
    sr_no = Column(Integer)
    description = Column(String, default="") # e.g., "Booster Spool"
    part_number = Column(String, default="")
    serial_number = Column(String, default="")
    total_hours = Column(Float, default=0.0)
    total_cycles = Column(Float, default=0.0)
    cycles_used_dict = Column(JSONB, server_default=text("'{}'::jsonb"), nullable=True)
    cycle_limits_dict = Column(JSONB, server_default=text("'{}'::jsonb"), nullable=True)
    docs = Column(String, default="")
    review_workflow = Column(String, default="Pending")
    raise_discrepancy = Column(Boolean, default=False)
    cycles_remain_dict = Column(JSONB, server_default=text("'{}'::jsonb"), nullable=True)

    
    engine = relationship("Engine", back_populates="llp_records")
