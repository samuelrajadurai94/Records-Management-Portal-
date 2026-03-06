from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# User Schemas
class UserBase(BaseModel):
    email: str
    company_name: Optional[str] = None
    role: str = "client"

class UserCreate(UserBase):
    password: str
    confirm_password: Optional[str] = None # Used for validation in API if needed

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
    csn_value: Optional[int] = 0

class EngineCreate(EngineBase):
    pass

class EngineInitRequest(BaseModel):
    serial_number: str
    csn_value: int = 0
    folders: List[str] = []

class EngineInitResponse(BaseModel):
    engine_id: int
    root_folder_id: str
    folder_mapping: dict # Maps "RAW FOLDER/subfolder" to box_folder_id

class Engine(EngineBase):
    id: int
    owner_id: int
    created_at: datetime
    box_folder_id: Optional[str] = None
    csn_value: int
    
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

# LLP Schemas
class LLPRecordBase(BaseModel):
    part_group: str
    sr_no: int
    description: str
    part_number: str = ""
    serial_number: str = ""
    total_hours: float = 0.0
    total_cycles: float = 0.0
    cycles_used_dict: dict = {}
    cycle_limits_dict: dict = {}
    docs: str = ""
    review_workflow: str = "Pending"
    raise_discrepancy: bool = False

class LLPRecordCreate(LLPRecordBase):
    pass

class LLPRecordUpdate(LLPRecordBase):
    id: Optional[int] = None # Include ID to know which row to update

class LLPRecordResponse(LLPRecordBase):
    id: int
    engine_id: int

    class Config:
        from_attributes = True
    is_segregated: bool # Moving to/within segregated section?
