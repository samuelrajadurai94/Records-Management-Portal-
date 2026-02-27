
import os
from box_sdk_gen import BoxClient, BoxJWTAuth, JWTConfig
import inspect

def inspect_box():
    config_path = os.path.join(os.path.dirname(__file__), 'backend', 'box_config.json')
    if not os.path.exists(config_path):
        print("Config not found")
        return

    try:
        config = JWTConfig.from_config_file(config_path)
        auth = BoxJWTAuth(config)
        client = BoxClient(auth)
        
        folders_manager = client.folders
        print(f"Folders manager type: {type(folders_manager)}")
        
        # Check for delete_folder_by_id
        if hasattr(folders_manager, 'delete_folder_by_id'):
            sig = inspect.signature(folders_manager.delete_folder_by_id)
            print(f"Signature of delete_folder_by_id: {sig}")
        else:
            print("folders_manager does not have delete_folder_by_id")
            # List available methods
            methods = [m for m in dir(folders_manager) if not m.startswith('_')]
            print(f"Available methods: {methods}")

    except Exception as e:
        print(f"Inspection failed: {e}")

if __name__ == "__main__":
    inspect_box()
