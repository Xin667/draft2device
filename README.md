# Draft2Device

Multimodale KI-Plattform: wandelt analoge Storyboard-Skizzen in Hardware-Specs
und Quellcode um. 6-Schritte-Wizard, von der Ideenbeschreibung bis zum
fertigen Schaltplan samt generiertem Code und PDF-Export.

Dieses Repository enthält **Frontend, Backend und Datenbank an einer Stelle**
(Monorepo), damit sich das Projekt mit einem Clone komplett durchspielen lässt.

## Struktur

```
draft2device/
├── frontend/   React + TypeScript + Vite, Tailwind, shadcn/ui, Zustand,
│               TanStack Query, React Hook Form + Zod
├── backend/    FastAPI + OpenAI + SQLite
│   ├── main.py           Einstiegspunkt, bindet alle Endpoints ein
│   ├── config.py         gemeinsamer OpenAI-Client, Modellname, API-Key
│   ├── db/               SQLite-Anbindung + Datenbankdatei
│   ├── endpoints/        je Endpoint ein Ordner (router/schema/prompt)
│   ├── static/           Test-Visualizer für den Schaltplan (/viewer/)
│   └── tests/            Pipeline-Test (mockt die Modell-Aufrufe)
├── package.json        Start-Skripte für beide Teile
└── README.md
```

## Voraussetzungen

- Node.js ≥ 20 (getestet mit v26)
- Python 3.11 (getestet mit 3.11.5)
- Ein OpenAI-API-Key

## Schnellstart

### 1. Backend

```bash
cd backend

# virtuelle Umgebung anlegen und Abhängigkeiten installieren
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# API-Key hinterlegen (wird von config.py gelesen)
cp .env.example .env        # danach den echten Key in .env eintragen

# starten
python -m uvicorn main:app --reload
```

Läuft dann auf `http://127.0.0.1:8000`. Die automatische API-Doku ist unter
`http://127.0.0.1:8000/docs` erreichbar, der Schaltplan-Test-Visualizer unter
`http://127.0.0.1:8000/viewer/`.

> Falls uvicorn beim Start über eine zu alte `websockets`-Version stolpert,
> hilft `pip install -U websockets` oder der Aufruf
> `python -m uvicorn main:app --reload --ws none`.

### 2. Frontend

```bash
npm install          # im Ordner frontend/
npm run dev
```

Läuft auf `http://localhost:5173`.

### 3. Beides zusammen

Im Projekt-Root:

```bash
npm run backend:install   # einmalig: Backend-Abhängigkeiten
npm run dev               # Frontend
npm run backend           # Backend (eigenes Terminal)
```

Das Frontend erwartet das Backend unter `http://127.0.0.1:8000`. Der
Vite-Proxy in `frontend/vite.config.ts` leitet `/api`, `/projects`, `/analyze`,
`/hardware`, `/circuit-diagram` und `/code` dorthin weiter. Das Frontend allein
startet also, aber ab Schritt 3 der Pipeline werden Daten vom Backend gebraucht.

## API-Endpoints (Backend)

| Endpoint | Datei | Zweck |
| --- | --- | --- |
| `POST /projects` | `endpoints/projects/` | Projekt anlegen |
| `POST /analyze`, `GET /analyze/{id}` | `endpoints/analyze/` | Konzeptstruktur aus Skizze + Beschreibung |
| `POST /hardware`, `POST /hardware/select` | `endpoints/hardware/` | Hardware-Vorschläge + Auswahl |
| `POST /circuit-diagram` | `endpoints/circuit_diagram/` | Schaltplan inkl. Montageschritten |
| `POST /code`, `GET /code/{id}` | `endpoints/code/` | Quellcode-Generierung |
| `POST /api/glossary/extract-and-explain` | `endpoints/glossary/` | Fachbegriffe + Erklärungen für die Tooltips |

## Tests

```bash
cd backend
pytest tests/ -v
```

Die Tests spielen die komplette Pipeline durch (`/projects` → `/analyze` →
`/hardware` → `/circuit-diagram`) und **mocken alle Modell-Aufrufe**, laufen
also ohne API-Key-Verbrauch gegen eine temporäre SQLite-Datei.

## Datenbank

SQLite, eine Datei: `backend/db/draft2device.db`. Das Schema wird beim
Serverstart automatisch angelegt (`db.init_db()`), ein leerer Clone
funktioniert also sofort.

Die aktive Datenbankdatei wird **bewusst mit eingecheckt**, damit die
Demo-Daten (angelegte Projekte inklusive Analyse-, Hardware-, Schaltplan- und
Code-Artefakten) überall verfügbar sind. Wenn ihr das nicht wollt:

```bash
git rm --cached backend/db/draft2device.db
# dann in .gitignore ergänzen: backend/db/*.db
```

Die Backup-Dateien `*.db.bak*` werden nicht eingecheckt, bleiben aber lokal
liegen.

## Secrets

`backend/key.py` und `backend/.env` enthalten den OpenAI-API-Key und sind
beide per `.gitignore` ausgeschlossen. Eingecheckt wird nur
`backend/.env.example` als Vorlage.

`config.py` sucht den Key in dieser Reihenfolge: Umgebungsvariable
`OPENAI_API_KEY` (aus `.env`) → lokale `key.py`. Fehlt beides, bricht der
Serverstart mit einer klaren Meldung ab.

## Herkunft dieses Repos

Zusammengeführt aus drei Quellen:

- `Projekt_Moltimodale-Genarative-KI_Frondend` — Frontend
- `draft2device_server-main/_final_` — aktuellster Backend-Stand (analyze,
  hardware, circuit_diagram, code, projects)
- der Glossary-Endpoint aus dem früheren v2-Backend (Branch `backup`), hier
  eingepasst auf den gemeinsamen OpenAI-Client und Modellnamen aus `config.py`

## Konventionen

- Alle UI-Texte auf Deutsch.
- Design-Referenz: `frontend/reference/draft2device_prototype.html`
- Ein Endpoint pro Ordner unter `backend/endpoints/`; Modell-Einstellungen
  gehören zentral in `backend/config.py`, nicht in den einzelnen Endpoint.
