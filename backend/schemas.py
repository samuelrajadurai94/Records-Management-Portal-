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
    selected_llp_file_id: Optional[str] = None
    selected_thrust_ratings: Optional[List[str]] = []

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
    selected_llp_file_id: Optional[str] = None
    
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
    part_group: Optional[str] = "EXTRACTED DATA"
    sr_no: Optional[int] = 1
    description: Optional[str] = ""
    part_number: Optional[str] = ""
    serial_number: Optional[str] = ""
    total_hours: Optional[float] = 0.0
    total_cycles: Optional[float] = 0.0
    cycles_used_dict: Optional[dict] = {}
    cycle_limits_dict: Optional[dict] = {}
    cycles_remain_dict: Optional[dict] = {}
    docs: Optional[str] = ""
    review_workflow: Optional[str] = "Pending"
    raise_discrepancy: Optional[bool] = False
    engine_id: Optional[int] = None

    model_config = {
        "from_attributes": True,
        "extra": "ignore"
    }

class LLPRecordCreate(LLPRecordBase):
    pass

class LLPRecordUpdate(LLPRecordBase):
    id: Optional[int] = None 

class LLPRecordResponse(LLPRecordBase):
    id: int
    engine_id: int

    class Config:
        from_attributes = True

class LLPFetchResponse(BaseModel):
    records: List[LLPRecordResponse]
    selected_llp_file_id: Optional[str] = None
    selected_thrust_ratings: Optional[List[str]] = []

class LLPBulkUpdateRequest(BaseModel):
    records: List[LLPRecordUpdate]
    selected_llp_file_id: Optional[str] = None
    selected_thrust_ratings: Optional[List[str]] = []

    model_config = {
        "extra": "ignore"
    }
