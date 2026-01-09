from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from database import engine, Base
import models
from routers import auth, engines, files, segregation

# Create tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Aircraft Records Portal")

# CORS Setup
origins = [
    "http://localhost:5173", # Vite default
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(engines.router)
app.include_router(files.router)
app.include_router(segregation.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to Aircraft Records Portal API"}

if __name__ == "__main__":
    import uvicorn
    # reload=False is required to fix the ModuleNotFoundError on Windows with venv
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
