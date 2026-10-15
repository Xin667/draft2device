# Draft2Device

A multimodal AI platform that turns analog storyboard sketches into hardware
specs and source code. A 6-step wizard, from the initial idea all the way to a
finished circuit diagram including generated code and a PDF export.

This repository keeps **frontend, backend and database in one place**
(a monorepo), so the whole project can be run end to end from a single clone.

## Structure

```
draft2device/
├── frontend/   React + TypeScript + Vite, Tailwind, shadcn/ui, Zustand,
│               TanStack Query, React Hook Form + Zod
├── backend/    FastAPI + OpenAI + SQLite
│   ├── main.py           entry point, wires up all endpoints
│   ├── config.py         shared OpenAI client, model name, API key
│   ├── db/               SQLite access layer + database file
│   ├── endpoints/        one folder per endpoint (router/schema/prompt)
│   ├── static/           test visualizer for the circuit diagram (/viewer/)
│   └── tests/            pipeline test (mocks all model calls)
├── package.json        start scripts for both parts
└── README.md
```

## Architecture
For a detailed explanation regarding the system architecture, the 6-step process pipeline and the technology decisions, see [Architecture.md](./architecture.md)


## Requirements

- Node.js ≥ 20 (tested with v26)
- Python 3.11 (tested with 3.11.5)
- An OpenAI API key

## Quick start

### 1. Backend

Go into the backend folder first — `.env.example` lives there, not in the
repository root:

```bash
cd backend

# create a virtual environment and install dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Now provide the API key. **This is two separate actions:**

**Step 1** — copy the template to a real config file (still inside `backend/`):

```bash
cp .env.example .env
```

**Step 2** — open the file `backend/.env` in your editor and replace this
placeholder line:

```text
OPENAI_API_KEY=sk-proj-hier-den-echten-key-eintragen
```

with your own key, then save. Nothing else in the file needs changing.

A few notes on that file:

- `.env` starts with a dot, so Finder hides it. In VS Code just open the
  `backend` folder and it shows up in the file list; from the terminal use
  `open -e .env` (TextEdit) or `nano .env`.
- It is listed in `.gitignore`, so it stays on your machine and never reaches
  GitHub.
- If the key is missing entirely, the server refuses to start with a clear
  message. If it is present but wrong, the server starts and only the AI calls
  fail.

Then start the server:

```bash
python -m uvicorn main:app --reload
```

It then runs on `http://127.0.0.1:8000`. The automatic API docs are available at
`http://127.0.0.1:8000/docs` and the circuit diagram test visualizer at
`http://127.0.0.1:8000/viewer/`.

> If uvicorn refuses to start because of an outdated `websockets` version,
> either run `pip install -U websockets` or start it with
> `python -m uvicorn main:app --reload --ws none`.

### 2. Frontend

```bash
npm install          # inside the frontend/ folder
npm run dev
```

It then runs on `http://localhost:5173`.

### 3. Both together

From the repository root:

```bash
npm run backend:install   # once: backend dependencies
npm run dev               # frontend
npm run backend           # backend (separate terminal)
```

The frontend expects the backend at `http://127.0.0.1:8000`. The Vite proxy in
`frontend/vite.config.ts` forwards `/api`, `/projects`, `/analyze`, `/hardware`,
`/circuit-diagram` and `/code` there. The frontend does start on its own, but
from step 3 of the pipeline onwards it needs data from the backend.

## API endpoints (backend)

| Endpoint | File | Purpose |
| --- | --- | --- |
| `POST /projects` | `endpoints/projects/` | create a project |
| `POST /analyze`, `GET /analyze/{id}` | `endpoints/analyze/` | concept structure from sketch + description |
| `POST /hardware`, `POST /hardware/select` | `endpoints/hardware/` | hardware suggestions + selection |
| `POST /circuit-diagram` | `endpoints/circuit_diagram/` | circuit diagram incl. assembly steps |
| `POST /code`, `GET /code/{id}` | `endpoints/code/` | source code generation |
| `POST /api/glossary/extract-and-explain` | `endpoints/glossary/` | technical terms + explanations for the tooltips |

## Tests

```bash
cd backend
pytest tests/ -v
```

The tests walk the entire pipeline (`/projects` → `/analyze` → `/hardware` →
`/circuit-diagram`) and **mock all model calls**, so they run without consuming
any API budget, against a temporary SQLite file.

## Database

SQLite, a single file: `backend/db/draft2device.db`. The schema is created
automatically on server start (`db.init_db()`), so an empty clone works
immediately.

The active database file is **deliberately committed**, so that the demo data
(created projects including their analysis, hardware, circuit diagram and code
artifacts) is available everywhere. If you do not want that:

```bash
git rm --cached backend/db/draft2device.db
# then add to .gitignore: backend/db/*.db
```

The backup files `*.db.bak*` are not committed, but they do stay on disk.

## Secrets

The OpenAI API key lives in `backend/.env`, which is excluded via `.gitignore` —
only the template `backend/.env.example` is committed. `config.py` reads the key
from the `OPENAI_API_KEY` entry in that file and refuses to start with a clear
message if it is missing. The same value is never stored anywhere else in the
repository.

## Where this repository comes from

Merged together from three sources:

- `Projekt_Moltimodale-Genarative-KI_Frondend` — the frontend
- `draft2device_server-main/_final_` — the most recent backend state (analyze,
  hardware, circuit_diagram, code, projects)
- the glossary endpoint from the earlier v2 backend (branch `backup`), adapted
  here to use the shared OpenAI client and model name from `config.py`

## Conventions

- All UI texts are in German.
- Design reference: `frontend/reference/draft2device_prototype.html`
- One endpoint per folder under `backend/endpoints/`; model settings belong
  centrally in `backend/config.py`, not in the individual endpoints.
