"""
FastAPI-Einstiegspunkt.
- endpoints/projects/router.py         -> POST /projects
- endpoints/analyze/router.py          -> POST /analyze (julians finalisierte Version)
- endpoints/hardware/router.py         -> POST /hardware, POST /hardware/select (franz' finalisierte Version)
- endpoints/circuit_diagram/router.py  -> POST /circuit-diagram
- endpoints/code/router.py             -> POST /code, GET /code/{project_id}
- endpoints/glossary/router.py         -> POST /api/glossary/extract-and-explain
                                          (übernommen aus dem früheren v2-Backend)

Dies ist die ZUSAMMENGEFÜHRTE App: analyze/ (von julian) und hardware/ (von
franz) sind unverändert aus deren eigenen, bisher separaten FastAPI-Apps
hierher übernommen worden, damit sich ein Projekt komplett von der
Ideenbeschreibung bis zum fertigen Schaltplan durchspielen lässt.

Vorbereitung:
1. Installieren:
   pip install -r requirements.txt

2. API-Key hinterlegen (wird von config.py gelesen):
   .env anlegen (Vorlage: .env.example) oder OPENAI_API_KEY exportieren.

2. Starten:
   python -m uvicorn main:app --reload --ws none
   (statt nur "uvicorn main:app --reload" - falls das uvicorn-Skript bei dir
   nicht im PATH liegt, funktioniert der Aufruf über "python -m" trotzdem,
   weil er nur "python" selbst braucht. "--ws none" deaktiviert WebSocket-
   Unterstützung, die wir hier nicht brauchen - nötig, weil die installierte
   "websockets"-Version älter ist als das, was uvicorn standardmäßig
   erwartet. Alternativ: "pip install -U websockets".)

3. Testen im Browser (automatische Doku):
   http://127.0.0.1:8000/docs

4. Schaltplan-Test-Visualizer (Prototyp, siehe static/index.html):
   http://127.0.0.1:8000/viewer/
"""

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

import db.db as db
from endpoints.projects import router as projects_router
from endpoints.analyze import router as analyze_router
from endpoints.hardware import router as hardware_router
from endpoints.circuit_diagram import router as circuit_diagram_router
from endpoints.code import router as code_router
from endpoints.glossary import router as glossary_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Der Code VOR "yield" läuft einmalig beim Serverstart.
    db.init_db()
    yield
    # Der Code NACH "yield" würde beim Herunterfahren des Servers laufen.


app = FastAPI(lifespan=lifespan)

# Jeden Endpoint-Router einzeln in die App einbinden.
app.include_router(projects_router.router)
app.include_router(analyze_router.router)
app.include_router(hardware_router.router)
app.include_router(circuit_diagram_router.router)
app.include_router(code_router.router)
app.include_router(glossary_router.router)

# Statischer Test-Visualizer für den Schaltplan-Endpoint - siehe
# static/index.html. Erreichbar unter http://127.0.0.1:8000/viewer/
# (nicht Teil der eigentlichen API, nur ein Hilfsmittel zum manuellen Testen).
app.mount("/viewer", StaticFiles(directory="static", html=True), name="viewer")
