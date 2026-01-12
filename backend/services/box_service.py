import os
import hashlib
import base64
from io import BytesIO
from box_sdk_gen import BoxClient, BoxJWTAuth, JWTConfig
from box_sdk_gen.managers.uploads import UploadFileAttributes, UploadFileAttributesParentField
from box_sdk_gen.managers.folders import CreateFolderParent
from box_sdk_gen.schemas import Folder

# Constants
CHUNKED_UPLOAD_MINIMUM = 50 * 1024 * 1024  # 50MB
ROOT_FOLDER_ID = "359797132460" # GEM REC PORTAL

class BoxService:
    def __init__(self):
        self.client = None
        self._authenticate()

    def _authenticate(self):
        config_path = os.path.join(os.path.dirname(__file__), '..', 'box_config.json')
        if not os.path.exists(config_path):
            print("WARNING: box_config.json not found.")
            return
        
        try:
            config = JWTConfig.from_config_file(config_path)
            auth = BoxJWTAuth(config)
            self.client = BoxClient(auth)
            print("Box Authorization Successful (box-sdk-gen)")
        except Exception as e:
            print(f"Box Authorization Failed: {e}")

    def chunked_upload_file(self, parent_folder_id, file_path):
        """Upload large files (50MB+) using chunked upload"""
        if not self.client: return None
        
        file_name = os.path.basename(file_path)
        file_size = os.path.getsize(file_path)
        
        try:
            session = self.client.chunked_uploads.create_file_upload_session(
                parent_folder_id, file_size, file_name
            )
            
            part_size = session.part_size
            parts = []
            sha1_full = hashlib.sha1()
            
            with open(file_path, 'rb') as f:
                offset = 0
                while offset < file_size:
                    chunk = f.read(part_size)
                    sha1_full.update(chunk)
                    
                    digest = f"sha={base64.b64encode(hashlib.sha1(chunk).digest()).decode()}"
                    content_range = f"bytes {offset}-{offset + len(chunk) - 1}/{file_size}"
                    
                    # Convert bytes to BytesIO stream
                    chunk_stream = BytesIO(chunk)
                    
                    part = self.client.chunked_uploads.upload_file_part(
                        session.id, chunk_stream, digest, content_range
                    )
                    parts.append(part.part)
                    offset += len(chunk)
            
            file_digest = f"sha={base64.b64encode(sha1_full.digest()).decode()}"
            return self.client.chunked_uploads.create_file_upload_session_commit(
                session.id, parts, file_digest
            )
        except Exception as e:
            print(f"Error in chunked upload: {e}")
            return None

    def upload_file(self, parent_folder_id, file_path):
        """Upload file - uses direct or chunked based on size"""
        if not self.client: return None

        file_name = os.path.basename(file_path)
        file_size = os.path.getsize(file_path)
        
        try:
            if file_size >= CHUNKED_UPLOAD_MINIMUM:
                print(f"Chunked upload: {file_name}")
                return self.chunked_upload_file(parent_folder_id, file_path)
            else:
                print(f"Direct upload: {file_name}")
                with open(file_path, 'rb') as file_stream:
                    return self.client.uploads.upload_file(
                        UploadFileAttributes(
                            name=file_name,
                            parent=UploadFileAttributesParentField(id=parent_folder_id)
                        ),
                        file_stream
                    )
        except Exception as e:
            print(f"Error uploading file {file_name}: {e}")
            return None

    def upload_folder_contents(self, parent_folder_id, local_path):
        """Recursively upload folder contents to Box"""
        if not self.client: return

        for item in os.listdir(local_path):
            item_path = os.path.join(local_path, item)
            
            if os.path.isfile(item_path):
                self.upload_file(parent_folder_id, item_path)
            
            elif os.path.isdir(item_path):
                try:
                    subfolder = self.client.folders.create_folder(
                        item, 
                        CreateFolderParent(id=parent_folder_id)
                    )
                    self.upload_folder_contents(subfolder.id, item_path)
                except Exception as e:
                    # If folder exists, we might want to find it and upload into it
                    print(f"Could not create subfolder {item}: {e}")
                    # logic to find existing folder could be added here if needed

    def create_root_engine_folder(self, folder_name):
        """Creates a folder for the engine inside the global ROOT_FOLDER_ID"""
        if not self.client: return None
        try:
            folder = self.client.folders.create_folder(
                folder_name,
                CreateFolderParent(id=ROOT_FOLDER_ID)
            )
            print(f"Created engine folder: {folder_name} (ID: {folder.id})")
            return folder
        except Exception as e:
            print(f"Error creating engine folder: {e}")
            return None

box_service = BoxService()
