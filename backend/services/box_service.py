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

    def upload_folder_contents(self, parent_folder_id, local_path, progress_callback=None, state={"current": 0, "total": 0, "errors": []}):
        """Recursively upload folder contents to Box maintaining hierarchy with progress tracking.
        Per-file errors are caught, logged in state['errors'], and skipped — upload continues."""
        if not self.client: return

        if not os.path.exists(local_path):
            print(f"Local path not found: {local_path}")
            return

        for item in os.listdir(local_path):
            item_path = os.path.join(local_path, item)

            if os.path.isfile(item_path):
                try:
                    self.upload_file(parent_folder_id, item_path)
                except Exception as file_err:
                    # Record the error path — relative to the engine root for readability
                    rel_path = os.path.relpath(item_path)
                    err_msg = f"{rel_path}: {file_err}"
                    print(f"[Upload] Skipping file due to error: {err_msg}")
                    state["errors"].append(err_msg)

                # Always update counter — whether success or error
                state["current"] += 1
                if progress_callback and state["total"] > 0:
                    progress = int((state["current"] / state["total"]) * 100)
                    progress_callback(progress, state)

            elif os.path.isdir(item_path):
                try:
                    subfolder = self.client.folders.create_folder(
                        item,
                        CreateFolderParent(id=parent_folder_id)
                    )
                    print(f"Created subfolder: {item}")
                    self.upload_folder_contents(subfolder.id, item_path, progress_callback, state)
                except Exception as e:
                    print(f"Could not create subfolder {item}: {e}")
                    # Still increment counter for files inside the failed folder
                    for root, dirs, files in os.walk(item_path):
                        state["current"] += len(files)
                        for f in files:
                            rel = os.path.relpath(os.path.join(root, f))
                            state["errors"].append(f"{rel}: subfolder creation failed — {e}")
                    if progress_callback and state["total"] > 0:
                        progress = int((state["current"] / state["total"]) * 100)
                        progress_callback(progress, state)

    def get_or_create_folder(self, folder_name, parent_id):
        """Find a folder by name or create it if it doesn't exist"""
        if not self.client: return None
        
        try:
            # List items in parent to find the folder
            items = self.client.folders.get_folder_items(parent_id)
            for item in items.entries:
                if item.type == "folder" and item.name == folder_name:
                    print(f"Found existing folder: {folder_name} (ID: {item.id})")
                    return item
            
            # Not found, create it
            new_folder = self.client.folders.create_folder(
                folder_name,
                CreateFolderParent(id=parent_id)
            )
            print(f"Created new folder: {folder_name} (ID: {new_folder.id})")
            return new_folder
        except Exception as e:
            print(f"Error in get_or_create_folder for {folder_name}: {e}")
            return None

    def create_folder_structure(self, parent_folder_id, folder_paths):
        """
        Creates a batch of folders based on relative paths and returns a mapping.
        folder_paths: list of strings e.g. ["RAW FOLDER", "RAW FOLDER/sub1"]
        Returns: dict mapping semantic path to Box folder ID.
        """
        if not self.client: return {}
        
        # Sort paths by depth to ensure parents exist before children
        sorted_paths = sorted(list(set(folder_paths)), key=lambda p: p.count('/'))
        
        folder_mapping = {"": parent_folder_id} # Root maps to parent_folder_id
        
        # Cache to store children of a folder ID we've already fetched
        # folder_id -> { "folder_name": child_folder_id }
        folder_contents_cache = {}
        
        def get_child_id(parent_id, target_name):
            if parent_id not in folder_contents_cache:
                folder_contents_cache[parent_id] = {}
                try:
                    items = self.client.folders.get_folder_items(parent_id)
                    for item in items.entries:
                        if item.type == "folder":
                            folder_contents_cache[parent_id][item.name] = item.id
                except Exception as e:
                    print(f"Error fetching items for {parent_id}: {e}")
                    
            return folder_contents_cache[parent_id].get(target_name)
        
        for path in sorted_paths:
            if not path: continue
            
            parts = path.replace("\\", "/").split('/')
            folder_name = parts[-1]
            parent_path = '/'.join(parts[:-1])
            
            target_parent_id = folder_mapping.get(parent_path)
            if not target_parent_id:
                print(f"Warning: Parent path '{parent_path}' not found for '{path}'.")
                continue
            
            # 1. Check if it already exists using our local cache of the parent
            existing_id = get_child_id(target_parent_id, folder_name)
            
            if existing_id:
                folder_mapping[path] = existing_id
            else:
                # 2. It doesn't exist, create it
                try:
                    new_folder = self.client.folders.create_folder(
                        folder_name,
                        CreateFolderParent(id=target_parent_id)
                    )
                    folder_mapping[path] = new_folder.id
                    # Update cache so future sibling lookups know about it
                    if target_parent_id not in folder_contents_cache:
                        folder_contents_cache[target_parent_id] = {}
                    folder_contents_cache[target_parent_id][folder_name] = new_folder.id
                except Exception as e:
                    print(f"Failed to create folder '{path}': {e}")
                
        # Remove the root mapping from the result
        if "" in folder_mapping:
            del folder_mapping[""]
            
        return folder_mapping

    def init_engine_folder_structure(self, serial_number, folder_paths, company_name=None):
        """Initializes the Engine root folder and its subfolders based on paths"""
        if not self.client: return None, {}
        
        parent_id = ROOT_FOLDER_ID
        if company_name:
            company_folder = self.get_or_create_folder(company_name, ROOT_FOLDER_ID)
            if company_folder:
                parent_id = company_folder.id
                
        # Create Engine Root
        engine_root = self.get_or_create_folder(serial_number, parent_id)
        if not engine_root:
            return None, {}
            
        # Create RAW FOLDER inside engine_root
        raw_folder = self.get_or_create_folder("RAW FOLDER", engine_root.id)
        if not raw_folder:
            return None, {}
            
        # Create folder structure inside RAW FOLDER based on the paths array
        # The paths received are typically like "subfolder" or "subfolder/child"
        mapping = self.create_folder_structure(raw_folder.id, folder_paths)
        
        # Ensure RAW FOLDER itself is in the mapping so the frontend can find it easily
        mapping["RAW FOLDER"] = raw_folder.id
        
        return engine_root.id, mapping

    def create_and_upload_engine_folder(self, folder_name, local_path, progress_callback=None, company_name=None):
        """Creates a root engine folder (inside company folder if provided) and uploads contents.
        Returns (root_folder, errors_list)."""
        if not self.client: return None, []

        errors = []
        try:
            # Determine parent folder (Root or Company Folder)
            parent_id = ROOT_FOLDER_ID
            if company_name:
                company_folder = self.get_or_create_folder(company_name, ROOT_FOLDER_ID)
                if company_folder:
                    parent_id = company_folder.id

            # Create the Engine Root Folder (e.g. Serial Number)
            root_folder = self.client.folders.create_folder(
                folder_name,
                CreateFolderParent(id=parent_id)
            )
            print(f"Created Engine Root Folder: {folder_name} (ID: {root_folder.id}) in parent {parent_id}")

            # Create "RAW FOLDER" inside the Engine Root
            raw_folder = self.client.folders.create_folder(
                "RAW FOLDER",
                CreateFolderParent(id=root_folder.id)
            )
            print(f"Created sub-container: RAW FOLDER (ID: {raw_folder.id})")

            # Upload contents maintaining folder hierarchy into the RAW FOLDER
            if local_path and os.path.exists(local_path):
                total_files = sum([len(files) for r, d, files in os.walk(local_path)])
                print(f"Starting recursive upload of {total_files} files into RAW FOLDER...")

                if progress_callback: progress_callback(0, {"current": 0, "total": total_files, "errors": errors})

                state = {"current": 0, "total": total_files, "errors": errors}
                self.upload_folder_contents(
                    raw_folder.id,
                    local_path,
                    progress_callback,
                    state
                )

                if progress_callback: progress_callback(100, state)
                print(f"Upload complete. {state['current']}/{total_files} files processed, {len(errors)} errors.")

            return root_folder, errors
        except Exception as e:
            print(f"Error creating engine folder {folder_name}: {e}")
            return None, errors

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

    def import_folder_from_shared_boxlink(self, shared_link_url, dest_parent_id):
        """Imports a folder from a public shared link into our Box storage recursively."""
        if not self.client: return None
        
        try:
        # Step 1: Resolve shared link to get the folder
            boxapi_header = f"shared_link={shared_link_url}"
            shared_folder = self.client.shared_links_folders.find_folder_for_shared_link(
                boxapi=boxapi_header
            )
            print(f"Shared Folder: {shared_folder.id} - {shared_folder.name}")

            # Step 2: Copy to root folder ("GEM REC PORTAL")
            copied_folder = self.client.folders.copy_folder(
                folder_id=shared_folder.id,
                parent={"id":"359797132460"}
            )
            print(f"copied to box root folder: {copied_folder.id}")

            # Step 3: Move it to your desired subfolder

            moved_folder = self.client.folders.update_folder_by_id(
                folder_id=copied_folder.id,
                parent={"id": dest_parent_id}
            )
            print(f"Moved to subfolder: {moved_folder.id}")
            return moved_folder.id
        except Exception as e:
            print(f"Error importing from shared link: {e}")
            return None


    

box_service = BoxService()

