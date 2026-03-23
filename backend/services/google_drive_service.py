from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from google.oauth2 import service_account
import io
import os
import re

SCOPES = ['https://www.googleapis.com/auth/drive.readonly']
# Assumes the backend is run from the backend/ directory where this file resides
SERVICE_ACCOUNT_FILE = 'google_drive_api.json'

def extract_drive_folder_id(link: str):
    """
    Extract the folder ID from a Google Drive share link.
    """
    # Matches /folders/ID
    match = re.search(r'/folders/([a-zA-Z0-9_-]+)', link)
    if match:
        return match.group(1)
    
    # Matches ?id=ID
    match = re.search(r'id=([a-zA-Z0-9_-]+)', link)
    if match:
        return match.group(1)
        
    raise ValueError("Invalid Google Drive folder link")

def download_gdrive_folder_from_link(folder_link: str, local_path: str, progress_callback=None):
    """
    Recursively download a Google Drive folder and its contents to a local path.
    progress_callback receives (files_downloaded_so_far).
    """
    folder_id = extract_drive_folder_id(folder_link)
    
    if not os.path.exists(SERVICE_ACCOUNT_FILE):
        raise FileNotFoundError(f"Service account config '{SERVICE_ACCOUNT_FILE}' is missing. Cannot authenticate with Google Drive.")

    creds = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=SCOPES
    )

    service = build('drive', 'v3', credentials=creds)

    os.makedirs(local_path, exist_ok=True)
    
    state = {"downloaded": 0}

    def download_recursive(current_folder_id, current_local_path):
        page_token = None
        while True:
            # Query the folder contents
            # trashed=false ensures we don't download deleted files
            results = service.files().list(
                q=f"'{current_folder_id}' in parents and trashed=false",
                fields="nextPageToken, files(id, name, mimeType)",
                pageToken=page_token
            ).execute()

            items = results.get('files', [])

            for item in items:
                file_id = item['id']
                name = item['name']
                mime_type = item['mimeType']

                file_path = os.path.join(current_local_path, name)

                if mime_type == 'application/vnd.google-apps.folder':
                    os.makedirs(file_path, exist_ok=True)
                    download_recursive(file_id, file_path)
                else:
                    try:
                        request = service.files().get_media(fileId=file_id)
                        fh = io.FileIO(file_path, 'wb')
                        downloader = MediaIoBaseDownload(fh, request)

                        done = False
                        while not done:
                            status, done = downloader.next_chunk()
                        
                        state["downloaded"] += 1
                        if progress_callback:
                            progress_callback(state["downloaded"])
                            
                        # print(f"[GDrive] Downloaded: {file_path}")
                    except Exception as e:
                        print(f"[GDrive] Error downloading file {name}: {e}")

            page_token = results.get('nextPageToken')
            if not page_token:
                break

    download_recursive(folder_id, local_path)
    return state["downloaded"]
