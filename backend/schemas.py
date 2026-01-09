from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# User Schemas
class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    is_active: bool

    class Config:
        from_attributes = True

# Token Schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

# Engine Schemas
class EngineBase(BaseModel):
    model_name: str
    serial_number: str

class EngineCreate(EngineBase):
    pass

class Engine(EngineBase):
    id: int
    owner_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

# File Schemas
class FileMetadataBase(BaseModel):
    filename: str
    folder_name: str
    is_segregated: bool

class FileMetadata(FileMetadataBase):
    id: int
    engine_id: int
    upload_date: datetime
    file_path: str # Exposed to client? Maybe not full path, but ID is enough usually.

    class Config:
        from_attributes = True

class FileMoveRequest(BaseModel):
    target_folder: str # "root" or specific folder name
    is_segregated: bool # Moving to/within segregated section?
