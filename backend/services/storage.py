import os
import shutil
from fastapi import UploadFile
import aiofiles

STORAGE_ROOT = "storage"

class LocalStorageService:
    def __init__(self):
        if not os.path.exists(STORAGE_ROOT):
            os.makedirs(STORAGE_ROOT)

    def _get_engine_path(self, engine_id: int, segregated: bool):
        base = os.path.join(STORAGE_ROOT, str(engine_id))
        folder_type = "segregated" if segregated else "raw"
        return os.path.join(base, folder_type)

    def ensure_directories(self, engine_id: int):
        raw_path = self._get_engine_path(engine_id, False)
        seg_path = self._get_engine_path(engine_id, True)
        os.makedirs(raw_path, exist_ok=True)
        os.makedirs(seg_path, exist_ok=True)

    async def save_file(self, engine_id: int, file: UploadFile, folder_name: str, segregated: bool) -> str:
        self.ensure_directories(engine_id)
        
        base_path = self._get_engine_path(engine_id, segregated)
        target_dir = os.path.join(base_path, folder_name) if folder_name != "root" else base_path
        os.makedirs(target_dir, exist_ok=True)
        
        file_path = os.path.join(target_dir, file.filename)
        
        async with aiofiles.open(file_path, 'wb') as out_file:
            content = await file.read()
            await out_file.write(content)
            
        return file_path

    def move_file(self, current_path: str, new_folder_name: str, engine_id: int, segregated: bool) -> str:
        # Construct new path
        base_path = self._get_engine_path(engine_id, segregated)
        target_dir = os.path.join(base_path, new_folder_name) if new_folder_name != "root" else base_path
        os.makedirs(target_dir, exist_ok=True)
        
        filename = os.path.basename(current_path)
        new_path = os.path.join(target_dir, filename)
        
        shutil.move(current_path, new_path)
        return new_path

    def delete_file(self, file_path: str):
        if os.path.exists(file_path):
            os.remove(file_path)

storage_service = LocalStorageService()
