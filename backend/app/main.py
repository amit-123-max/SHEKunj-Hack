from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import routers
from app.api.routers import system, accessibility, reader, voice, agent

app = FastAPI(title="NeuroRead AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount all modules
app.include_router(system.router)
app.include_router(accessibility.router)
app.include_router(reader.router)
app.include_router(voice.router)
app.include_router(agent.router)
