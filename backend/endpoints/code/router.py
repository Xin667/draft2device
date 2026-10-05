"""
Router für den /code Endpoint (der "vierte" KI-Endpoint).

Nimmt den Schaltplan entgegen, den der /circuit-diagram-Endpoint für ein
Projekt zuletzt erzeugt hat, und generiert daraus alle Dateien, die man
braucht, um das IoT-Projekt auf dem gewählten Controller tatsächlich zum
Laufen zu bringen - z.B. eine platformio.ini + den passenden Arduino-Sketch
für einen ESP32/Arduino, oder ein Python-Skript + requirements.txt für
einen Raspberry-Pi-basierten Controller (siehe prompt.py).

Gleiches Grundmuster wie /circuit-diagram: kein Chat-Verlauf, sondern ein
einzelner, deterministischer Schritt project_id -> Ergebnis, das als neues
Artefakt gespeichert wird. Anders als /analyze oder /hardware gibt es hier
KEINE volle, persistierte Chat-Historie - der fachliche Input kommt
größtenteils aus dem bereits gespeicherten circuit_diagram-Artefakt.

Optional lässt sich aber eine freie Nutzer-Nachricht ("message") mitgeben,
z.B. um einen Fehler im zuletzt generierten Code zu beschreiben oder eine
Anpassung zu wünschen ("WLAN-Verbindung baut keinen Reconnect nach
Verbindungsabbruch auf" o.ä.). Ist bereits Code für das Projekt gespeichert
UND wird eine message mitgegeben, wird dieser bisherige Code als
Ausgangspunkt an das Modell gegeben und gezielt gemäß der Nachricht
angepasst, statt komplett neu zu generieren.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import db.db as db
from config import client, model
from .schema import GeneratedCode, GeneratedCodeResponse, CodeAnswersRequest, FilledCodeResponse
from .prompt import SYSTEM_PROMPT, REVISION_SYSTEM_PROMPT

import json
import re
import io
import zipfile

# Erkennt Platzhalter der Form "{{KEY}}" in generierten Dateien - muss exakt
# zum Format passen, das SYSTEM_PROMPT dem Modell vorgibt (Abschnitt 4).
# Wird benutzt, wenn in den Code beispielsweise eine WLAN Andresse gebraucht wird
PLACEHOLDER_PATTERN = re.compile(r"\{\{([A-Z0-9_]+)\}\}")

# Artefakt-Typ, unter dem /circuit-diagram sein Ergebnis ablegt (siehe
# endpoints/circuit_diagram/router.py: CIRCUIT_ARTIFACT_TYPE). Wird
# hier nur GELESEN, nie geschrieben.
CIRCUIT_ARTIFACT_TYPE = "circuit_diagram"

# Artefakt-Typ, unter dem /analyze seine Konzept-Struktur ablegt - optionaler
# Zusatzkontext für die Verhaltens-/Zustandslogik im generierten Code.
# Wenn man nur das Diagramm hat, weiß man noch nicht, was das Konstrukt  können soll
CONCEPT_ARTIFACT_TYPE = "concept_structure"

# Artefakt-Typ, unter dem unser eigenes Ergebnis ablegt wird.
CODE_ARTIFACT_TYPE = "generated_code"

# Artefakt-Typ, unter dem die Antworten auf config_questions gesammelt
# werden (key -> value), gemerged über mehrere Aufrufe von
# POST /code/{project_id}/answers hinweg. Bewusst GETRENNT vom eigentlichen
# Code-Artefakt: dieses bleibt dadurch immer die unveränderte, mit
# "{{KEY}}"-Platzhaltern versehene Vorlage - nur so lässt sich eine bereits
# gegebene Antwort später nochmal ändern (würde man sie direkt in den
# Code-Text einsetzen und den überschreiben, wäre der Platzhalter danach
# unwiderruflich weg und ein erneutes Ändern nicht mehr möglich).
CODE_ANSWERS_ARTIFACT_TYPE = "code_answers"

router = APIRouter()


def _fill_placeholders(files: list[dict], answers: dict[str, str]) -> list[dict]:
    # Setzt alle bekannten Antworten in die "{{KEY}}"-Platzhalter der
    # (unveränderten) Datei-Vorlagen ein. Rein lesend/berechnend - verändert
    # weder "files" noch "answers".
    filled = []
    for file in files:
        content = file["content"]
        for key, value in answers.items():
            content = content.replace("{{" + key + "}}", value)
        filled.append({"path": file["path"], "content": content})
    return filled


def _resolve_effective_answers(config_questions: list[dict], answers: dict[str, str]) -> dict[str, str]:
    # Baut die Werte, mit denen die Platzhalter tatsächlich aufgefüllt
    # werden: eine echte, von der Nutzer:in gegebene Antwort hat Vorrang -
    # fehlt sie, wird auf "example" zurückgegriffen (laut SYSTEM_PROMPT ein
    # PFLICHTFELD mit einem plausiblen, funktionierenden Default-Wert). So
    # ist der Code auch OHNE jede Antwort sofort kompilierbar/lauffähig,
    # nur eben mit Default- statt echten Werten (z.B. Dummy-WLAN-Zugangsdaten).
    effective: dict[str, str] = {}
    for question in config_questions:
        key = question["key"]
        answer = answers.get(key)
        if answer:
            effective[key] = answer
        elif question.get("example"):
            effective[key] = question["example"]
    return effective


class CodeRequest(BaseModel):
    project_id: str
    # Optional: Freitext, um bereits generierten Code nachträglich zu
    # korrigieren/anzupassen (z.B. Fehlerbeschreibung wie "Der Sensor liest
    # immer 0" oder ein Änderungswunsch). Wird NUR als Korrektur-Anweisung
    # genutzt, wenn für das Projekt bereits Code existiert - andernfalls
    # (allererster Aufruf) hat message keine Wirkung, da es dann noch
    # nichts zu korrigieren gibt.
    message: str | None = None


@router.post("/code", response_model=GeneratedCodeResponse)
async def generate_code(request: CodeRequest):
    project_id = request.project_id

    # Die Abfragen sind mehr zur Sicherheit an sich braucht man die nicht
    # -> Dieser Schritt ist eh erst zugaenglich, wenn man die Sachen vorher erstellt hat
    # --- Schritt 1: Existiert das Projekt überhaupt? ---
    if not db.project_exists(project_id):
        raise HTTPException(
            status_code=404,
            detail=f"No Project with ID '{project_id}' found. Please call POST /projects first.",
        )

    # --- Schritt 2: Zuletzt gespeicherten Schaltplan laden ---
    # Anders als /circuit-diagram gibt es hier KEINEN Dummy-Fallback: ohne
    # echten Schaltplan lässt sich kein sinnvoller, zur tatsächlichen
    # Verkabelung passender Code erzeugen.
    # Da der Schaltplan-Endpoint eh vorher aufgerufen wird, ist ja immer schon was da
    circuit_diagram = db.get_latest_artifact(project_id, CIRCUIT_ARTIFACT_TYPE)
    if circuit_diagram is None:
        raise HTTPException(
            status_code=404,
            detail=f"No circuit diagram found for project '{project_id}'. Please call POST /circuit-diagram first.",
        )

    # --- Schritt 3: Konzept-Struktur als optionalen Zusatzkontext laden ---
    # (falls /analyze für dieses Projekt schon einmal aufgerufen wurde) -
    # liefert die Zustands-/Verhaltenslogik, die reine Verkabelung nicht
    # hergibt.
    concept_structure = db.get_latest_artifact(project_id, CONCEPT_ARTIFACT_TYPE)

    # --- Schritt 3b: Zuletzt generierten Code laden (falls vorhanden) ---
    # Nur relevant, falls zusätzlich eine "message" mitgegeben wurde - dann
    # dient dieser als Ausgangspunkt für eine gezielte Korrektur statt einer
    # kompletten Neu-Generierung.
    previous_code = db.get_latest_artifact(project_id, CODE_ARTIFACT_TYPE)
    is_revision = bool(request.message) and previous_code is not None

    # --- Schritt 4: Nachricht für das Modell zusammenbauen ---
    user_payload = {"circuit_diagram": circuit_diagram}
    if concept_structure is not None:
        user_payload["concept_structure"] = concept_structure

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    if is_revision:
        user_payload["previous_code"] = previous_code
        messages.append({"role": "system", "content": REVISION_SYSTEM_PROMPT})
        messages.append({"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)})
        messages.append({"role": "user", "content": request.message})
    else:
        messages.append({"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)})

    # --- Schritt 5: Modell aufrufen ---
    # client.chat.completions.parse(...) statt .create(...): die
    # OpenAI-Bibliothek erzeugt aus dem Pydantic-Modell GeneratedCode
    # automatisch ein striktes JSON-Schema UND gibt das Ergebnis direkt als
    # validierte GeneratedCode-Instanz zurück (response.choices[0].message.parsed).
    response = client.chat.completions.parse(
        model=model,
        reasoning_effort="low",
        messages=messages,
        response_format=GeneratedCode,
    )

    result: GeneratedCode = response.choices[0].message.parsed
    result_dict = result.model_dump(mode="json")

    # --- Schritt 6: Ergebnis als Artefakt speichern ---
    # WICHTIG: Hier wird die UNVERÄNDERTE Vorlage (mit "{{KEY}}"-
    # Platzhaltern) gespeichert, nicht die mit Defaults aufgefüllte Version
    # aus Schritt 7 - so bleibt POST /code/{project_id}/answers weiterhin in
    # der Lage, echte Antworten einzusetzen.
    # Wenn das nicht extra abgespeichert wird, kann man die Fragen immer nur 1 mal beantworten
    db.save_artifact(project_id, CODE_ARTIFACT_TYPE, result_dict)

    # --- Schritt 7: Ergebnis an den Client zurückgeben ---
    # Bewusst NUR project_id + files: der Endpoint soll ausschließlich den
    # tatsächlich benötigten Code (platformio.ini, main.cpp/main.py, ...)
    # liefern, keine Erklärtexte oder Echo des Inputs. Es gibt an dieser
    # Stelle noch keine echten Nutzer-Antworten - Platzhalter werden daher
    # direkt mit den "example"-Default-Werten aus config_questions
    # aufgefüllt, damit der Code auch ganz ohne POST /code/{project_id}/answers
    # sofort lauffähig/kompilierbar ist.
    config_questions = result_dict.get("config_questions", [])
    effective_answers = _resolve_effective_answers(config_questions, {})
    files = _fill_placeholders(result_dict.get("files", []), effective_answers)

    return {
        "project_id": project_id,
        "files": files,
        "config_questions": config_questions,
    }


@router.get("/code/{project_id}")
async def get_latest_code(project_id: str):
    # Gibt das ZULETZT gespeicherte Code-Ergebnis zu einem Projekt zurück,
    # OHNE das Modell erneut aufzurufen - z.B. damit das Frontend nach einem
    # Seiten-Reload den aktuellen Stand erneut laden kann (gleiches Muster
    # wie GET /hardware/{project_id}).
    if not db.project_exists(project_id):
        raise HTTPException(
            status_code=404,
            detail=f"No Project with ID '{project_id}' found. Please call POST /projects first.",
        )

    result = db.get_latest_artifact(project_id, CODE_ARTIFACT_TYPE)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"No generated code found for project '{project_id}' yet. Please call POST /code first.",
        )

    # Platzhalter auffüllen: echte Antworten (falls vorhanden) gehen vor,
    # unbeantwortete Fragen fallen auf ihren "example"-Default zurück -
    # damit auch nach einem Reload sofort lauffähiger Code sichtbar ist,
    # statt der rohen Platzhalter-Vorlage.
    answers = db.get_latest_artifact(project_id, CODE_ANSWERS_ARTIFACT_TYPE) or {}
    effective_answers = _resolve_effective_answers(result.get("config_questions", []), answers)
    result = {**result, "files": _fill_placeholders(result.get("files", []), effective_answers)}

    return {"project_id": project_id, **result}


@router.post("/code/{project_id}/answers", response_model=FilledCodeResponse)
async def answer_code_questions(project_id: str, request: CodeAnswersRequest):
    # Ermöglicht es, die in config_questions gestellten Fragen (z.B. WLAN-
    # SSID, WLAN-Passwort, Server-Adresse) gezielt zu beantworten - die
    # Antworten werden in die "{{KEY}}"-Platzhalter der zuletzt generierten
    # Code-Vorlage eingesetzt. Muss nicht alle Fragen auf einmal abdecken:
    # unbeantwortete Platzhalter bleiben stehen und können mit einem
    # weiteren Aufruf nachgereicht werden (siehe "unanswered" in der
    # Antwort). Ein KEY lässt sich dabei auch beliebig oft NEU beantworten
    # (z.B. falsches WLAN-Passwort korrigieren) - die Code-Vorlage selbst
    # wird dafür nie verändert, nur die separat gespeicherten Antworten.
    if not db.project_exists(project_id):
        raise HTTPException(
            status_code=404,
            detail=f"No Project with ID '{project_id}' found. Please call POST /projects first.",
        )

    generated_code = db.get_latest_artifact(project_id, CODE_ARTIFACT_TYPE)
    if generated_code is None:
        raise HTTPException(
            status_code=404,
            detail=f"No generated code found for project '{project_id}' yet. Please call POST /code first.",
        )

    # Neue Antworten mit bereits vorher gegebenen mergen (gleicher key ->
    # neuer Wert gewinnt), statt sie nur einmalig zu verwenden.
    stored_answers = db.get_latest_artifact(project_id, CODE_ANSWERS_ARTIFACT_TYPE) or {}
    stored_answers = {**stored_answers, **request.answers}
    db.save_artifact(project_id, CODE_ANSWERS_ARTIFACT_TYPE, stored_answers)

    config_questions = generated_code.get("config_questions", [])

    # "unanswered" bewusst NUR anhand ECHTER Nutzer-Antworten (nicht der
    # example-Defaults) ermittelt - zeigt weiterhin an, was die Nutzer:in
    # noch NICHT selbst beantwortet hat, auch wenn "files" unten dank
    # Default-Werten trotzdem schon lauffähig ist.
    filled_with_real_answers_only = _fill_placeholders(generated_code.get("files", []), stored_answers)
    remaining_keys: set[str] = set()
    for file in filled_with_real_answers_only:
        remaining_keys.update(PLACEHOLDER_PATTERN.findall(file["content"]))
    unanswered = [q for q in config_questions if q["key"] in remaining_keys]

    # "files" für die Antwort: echte Antworten gehen vor, alles andere
    # fällt auf den "example"-Default zurück, damit der zurückgegebene Code
    # immer vollständig lauffähig ist.
    effective_answers = _resolve_effective_answers(config_questions, stored_answers)
    filled_files = _fill_placeholders(generated_code.get("files", []), effective_answers)

    return {
        "project_id": project_id,
        "files": filled_files,
        "config_questions": config_questions,
        "unanswered": unanswered,
    }


@router.get("/code/{project_id}/download")
async def download_code(project_id: str):
    # Packt den zuletzt generierten (bzw. teilweise/vollständig beantworteten,
    # siehe POST /code/{project_id}/answers) Code als ZIP - damit lassen sich
    # die Dateien direkt entpacken und als echter Projektordner in VS Code
    # (oder PlatformIO) öffnen, statt sie einzeln aus der JSON-Antwort
    # herauszukopieren.
    if not db.project_exists(project_id):
        raise HTTPException(
            status_code=404,
            detail=f"No Project with ID '{project_id}' found. Please call POST /projects first.",
        )

    generated_code = db.get_latest_artifact(project_id, CODE_ARTIFACT_TYPE)
    if generated_code is None:
        raise HTTPException(
            status_code=404,
            detail=f"No generated code found for project '{project_id}' yet. Please call POST /code first.",
        )

    # Platzhalter auffüllen: echte Antworten gehen vor, unbeantwortete
    # Fragen fallen auf ihren "example"-Default zurück - die ZIP ist damit
    # auch OHNE jede vorherige Konfiguration direkt lauffähig/kompilierbar.
    answers = db.get_latest_artifact(project_id, CODE_ANSWERS_ARTIFACT_TYPE) or {}
    effective_answers = _resolve_effective_answers(generated_code.get("config_questions", []), answers)
    files = _fill_placeholders(generated_code.get("files", []), effective_answers)

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zip_file:
        for file in files:
            zip_file.writestr(file["path"], file["content"])
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{project_id}_code.zip"'},
    )
