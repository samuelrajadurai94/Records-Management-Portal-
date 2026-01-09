from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database import Base
import datetime

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True) # Company Name
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

    owner = relationship("User", back_populates="engines")
    files = relationship("FileMetadata", back_populates="engine")

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
