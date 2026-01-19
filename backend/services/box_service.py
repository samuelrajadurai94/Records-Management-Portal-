import os
import hashlib
import base64
from io import BytesIO
from box_sdk_gen import BoxClient, BoxJWTAuth, JWTConfig
from box_sdk_gen.managers.uploads import UploadFileAttributes, UploadFileAttributesParentField
from box_sdk_gen.managers.folders import CreateFolderParent

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
            result = self.client.chunked_uploads.create_file_upload_session_commit(
                session.id, parts, file_digest
            )
            print(f"Successfully uploaded chunked file: {file_name}")
            return result
        except Exception as e:
            print(f"Error in chunked upload for {file_name}: {e}")
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

    def upload_folder_contents(self, parent_folder_id, local_path, progress_callback=None, state={"current": 0, "total": 0}):
        """Recursively upload folder contents to Box maintaining hierarchy with progress tracking"""
        if not self.client: return

        if not os.path.exists(local_path):
            print(f"Local path not found: {local_path}")
            return

        for item in os.listdir(local_path):
            item_path = os.path.join(local_path, item)
            
            if os.path.isfile(item_path):
                # Upload file to current parent folder
                self.upload_file(parent_folder_id, item_path)
                
                # Update progress
                state["current"] += 1
                if progress_callback and state["total"] > 0:
                    progress = int((state["current"] / state["total"]) * 100)
                    progress_callback(progress)
            
            elif os.path.isdir(item_path):
                # Create subfolder and recursively upload its contents
                try:
                    subfolder = self.client.folders.create_folder(
                        item, 
                        CreateFolderParent(id=parent_folder_id)
                    )
                    print(f"Created subfolder: {item}")
                    # Recursively upload subfolder contents
                    self.upload_folder_contents(subfolder.id, item_path, progress_callback, state)
                except Exception as e:
                    print(f"Could not create subfolder {item}: {e}")
                    # If folder exists, try to find it and continue
                    pass

    def create_and_upload_engine_folder(self, folder_name, local_path, progress_callback=None):
        """Creates a root engine folder and uploads contents maintaining hierarchy"""
        if not self.client: return None
        
        try:
            # Create the Engine Root Folder (e.g. Serial Number) in the Project Root
            root_folder = self.client.folders.create_folder(
                folder_name,
                CreateFolderParent(id=ROOT_FOLDER_ID)
            )
            print(f"Created Engine Root Folder: {folder_name} (ID: {root_folder.id})")
            
            # Upload contents maintaining folder hierarchy
            if local_path and os.path.exists(local_path):
                # Count total files for progress tracking
                total_files = sum([len(files) for r, d, files in os.walk(local_path)])
                print(f"Starting recursive upload of {total_files} files from {local_path}...")
                
                # Initial progress
                if progress_callback: progress_callback(0)
                
                # Upload the contents of the local folder into the root folder
                self.upload_folder_contents(
                    root_folder.id, 
                    local_path, 
                    progress_callback, 
                    state={"current": 0, "total": total_files}
                )
                
                # Final progress
                if progress_callback: progress_callback(100)
                print("Upload complete.")
            
            return root_folder
        except Exception as e:
            print(f"Error creating engine folder {folder_name}: {e}")
            return None

    def get_folder_items(self, folder_id):
        """Get all items (files and folders) in a Box folder"""
        if not self.client:
            return {"folders": [], "files": []}
        
        try:
            items = self.client.folders.get_folder_items(folder_id)
            folders = []
            files = []
            
            for item in items.entries:
                if item.type == "folder":
                    folders.append({
                        "id": item.id,
                        "name": item.name,
                        "type": "folder"
                    })
                elif item.type == "file":
                    files.append({
                        "id": item.id,
                        "name": item.name,
                        "type": "file",
                        "size": getattr(item, 'size', 0),
                        "modified_at": getattr(item, 'modified_at', None)
                    })
            
            return {"folders": folders, "files": files}
        except Exception as e:
            print(f"Error getting folder items for {folder_id}: {e}")
            return {"folders": [], "files": []}

    def get_folder_hierarchy(self, folder_id):
        """Get top-level contents of a folder for lazy-loading structure"""
        if not self.client:
            return None
        
        try:
            folder_info = self.client.folders.get_folder_by_id(folder_id)
            items = self.get_folder_items(folder_id)
            
            # Form top-level structure
            children = []
            
            # Add subfolders
            for subfolder in items["folders"]:
                children.append({
                    "id": subfolder["id"],
                    "name": subfolder["name"],
                    "type": "folder",
                    "children": [], # Empty for lazy load
                    "isLoaded": False # Flag for frontend
                })
            
            # Add files
            for file in items["files"]:
                children.append({
                    "id": file["id"],
                    "name": file["name"],
                    "type": "file",
                    "size": file.get("size", 0),
                    "modified_at": file.get("modified_at", None)
                })
            
            return {
                "id": folder_id,
                "name": folder_info.name,
                "type": "folder",
                "children": children,
                "file_count": len(items["files"]),
                "isLoaded": True
            }
        except Exception as e:
            print(f"Error getting folder hierarchy for {folder_id}: {e}")
            return None

    def get_file_download_url(self, file_id):
        """Get temporary download URL for a file"""
        if not self.client:
            return None
        
        try:
            # Get file with download_url field
            file = self.client.files.get_file_by_id(file_id, fields=['download_url'])
            if hasattr(file, 'download_url') and file.download_url:
                return file.download_url
            # Fallback: construct download URL manually
            return f"https://api.box.com/2.0/files/{file_id}/content"
        except Exception as e:
            print(f"Error getting download URL for file {file_id}: {e}")
            return None

    def get_file_info(self, file_id):
        """Get detailed file information"""
        if not self.client:
            return None
        
        try:
            file_info = self.client.files.get_file_by_id(file_id)
            return {
                "id": file_info.id,
                "name": file_info.name,
                "size": file_info.size,
                "modified_at": file_info.modified_at,
                "extension": file_info.name.split('.')[-1] if '.' in file_info.name else ''
            }
        except Exception as e:
            print(f"Error getting file info for {file_id}: {e}")
            return None

    def get_file_embed_link(self, file_id):
        """Get expiring embed link for file preview"""
        if not self.client:
            return None
        
        try:
            # Request the expiring_embed_link field
            file_info = self.client.files.get_file_by_id(
                file_id, 
                fields=["expiring_embed_link"]
            )
            
            if hasattr(file_info, 'expiring_embed_link') and file_info.expiring_embed_link:
                return file_info.expiring_embed_link.url
            
            return None
                
        except Exception as e:
            print(f"Error getting embed link for file {file_id}: {e}")
            import traceback
            traceback.print_exc()
            return None
#client.folders.delete_folder_by_id(item.id, recursive=recursive)
    def delete_folder(self, folder_id):
        """Delete a folder and all its contents"""
        if not self.client:
            return False
        
        try:
            self.client.folders.delete_folder_by_id(folder_id, recursive=True)
            print(f"Successfully deleted folder: {folder_id}")
            return True
        except Exception as e:
            print(f"Error deleting folder {folder_id}: {e}")
            return False

box_service = BoxService()

