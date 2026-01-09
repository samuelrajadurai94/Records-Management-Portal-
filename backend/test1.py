from box_sdk_gen import BoxClient, BoxJWTAuth, JWTConfig
#from box_sdk_gen.schemas import CreateFolderParent
config = JWTConfig.from_config_file(r"backend\box_config.json")
auth = BoxJWTAuth(config)
client = BoxClient(auth)
print(client)