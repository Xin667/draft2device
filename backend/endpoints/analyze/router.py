"""
Router für den /analyze Endpoint.
 
Der eigentliche Arbeits-Endpoint. Braucht IMMER eine project_id (aus
POST /projects). Nimmt eine Nachricht (+ optional ein Bild) entgegen und
gibt die aktualisierte Struktur zurück. Funktioniert für den ALLERERSTEN
Aufruf genauso wie für jeden weiteren Refinement-Schritt - das Modell sieht
dabei jedes Mal die gesamte bisherige Chat-Historie.
"""
 
from fastapi import APIRouter, Form, File, UploadFile
from typing import Optional, List
 
import db.db as db
from config import client, model, RESEND_ALL_IMAGES_EVERY_REQUEST
from .schema import schema2
from .prompt import SYSTEM_PROMPT

import json
import base64

# Unter diesem Namen speichern wir das Ergebnis dieses Endpoints in der
# "artifacts"-Tabelle - OHNE "open_questions" (siehe Schritt 7). Der
# spätere Hardware-Endpoint würde sich genau dieses Artefakt per
# db.get_latest_artifact(project_id, "concept_structure") holen. Offene
# Fragen sind für die Pipeline nicht relevant, nur für den Dialog mit
# der Nutzer:in - deshalb bewusst NICHT Teil dieses Artefakts.
ARTIFACT_TYPE = "concept_structure"

# Zweites Artefakt, zusätzlich zu ARTIFACT_TYPE gespeichert - IDENTISCH,
# außer dass "open_questions" hier MIT drin ist. Das ist die Version, die
# das Frontend über GET /analyze/{project_id} bekommt (siehe unten), damit
# es offene Fragen anzeigen und die Nutzer:in sie beantworten lassen kann.
REVIEW_ARTIFACT_TYPE = "concept_structure_review"

# Trennt die Chat-Historie DIESES Endpoints von der anderer Endpoints
# (z.B. eines späteren Hardware-Endpoints) innerhalb desselben Projekts.
CONVERSATION_TYPE = "analyze"

router = APIRouter()
 
# Erzwingt das Schema aus schema.py bei jedem Modell-Aufruf DIESES Endpoints.
# Bleibt hier lokal, weil jeder Endpoint sein eigenes Schema hat.
RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "iot_projekt_struktur",
        "schema": schema2,
        "strict": True,
    },
}




# ================================== GET /analyze/{project_id} =====================================
@router.get("/analyze/{project_id}")
def get_latest_analysis(project_id: str):
    # Gibt die ZULETZT gespeicherte Konzept-Struktur (Artefakt) zu einem
    # Projekt zurück, OHNE das Modell erneut aufzurufen - z.B. damit das
    # Frontend nach einem Seiten-Reload den aktuellen Stand erneut laden
    # kann, ohne eine neue Nachricht zu schicken.
    if not db.project_exists(project_id):
        return {"error": f"No Project with ID '{project_id}' found. Please call POST /projects first."}

    # REVIEW_ARTIFACT_TYPE (nicht ARTIFACT_TYPE), weil das Frontend die
    # "open_questions" braucht, um sie der Nutzer:in anzuzeigen.
    result = db.get_latest_artifact(project_id, REVIEW_ARTIFACT_TYPE)
    if result is None:
        return {"error": f"No concept structure found for project '{project_id}'. Please call POST /analyze first."}

    return {
        "project_id": project_id,
        **result,
    }

 



# ========================================= POST /analyze ===========================================
@router.post("/analyze")
async def analyze(
    project_id: str = Form(...),
    message: Optional[str] = Form(default=None),
    answers: List[str] = Form(
        default=[],
        # description + example landen in Swagger UI als Hinweistext direkt
        # am Feld - man muss die Syntax nicht mehr im Code nachschlagen.
        description='Je "+" GENAU EIN JSON-Objekt: {"question_id": "question_1", "answer": "Einzelne LED"}',
        example='{"question_id": "question_1", "answer": "Einzelne LED"}',
    ),
    image: Optional[UploadFile] = File(default=None),
):
    # --- Schritt 1: Existiert das Projekt überhaupt? ---
    if not db.project_exists(project_id):
        return {"error": f"No Project with ID '{project_id}' found. Please call POST /projects first."}

    # --- Schritt 1b: answers-Form-Felder in Python-Dictionaries umwandeln ---
    try:
        parsed_answers = _parse_answers(answers)
    except (json.JSONDecodeError, KeyError, TypeError):
        return {"error": "Invalid 'answers' format. Expected JSON like '{\"question_id\": \"...\", \"answer\": \"...\"}' per entry."}

    # --- Schritt 1c: Mindestens "message", "answers" ODER "image" muss angegeben sein ---
    if not message and not parsed_answers and not image:
        return {"error": "Please provide 'message', 'answers' and/or 'image'."}

    # --- Schritt 1d: Jede beantwortete question_id muss zu einer TATSÄCHLICH
    # offenen Frage aus dem zuletzt gespeicherten Artefakt passen ---
    validation_error = _validate_answer_question_ids(parsed_answers, project_id)
    if validation_error:
        return {"error": validation_error}

    combined_message = _build_message_text(message, parsed_answers)

    # --- Schritt 2: Neue Nutzer-Nachricht in der Chat-Historie speichern ---
    # WICHTIG: Das muss VOR der Bild-Verarbeitung passieren, weil wir die
    # neue message_id brauchen, um das Bild (falls vorhanden) korrekt damit
    # zu verknüpfen (siehe Schritt 3).
    new_message_id = db.add_message(project_id, conversation_type=CONVERSATION_TYPE, role="user", content=combined_message)
 
    # --- Schritt 3: Bild (falls vorhanden) dauerhaft speichern ---
    if image:
        raw_data = await image.read()
        mime_type = image.content_type
        # Verknüpft mit der Nachricht von Schritt 2 - so bleibt im
        # Chatverlauf klar: "DIESES Bild gehört zu GENAU DIESER Nachricht".
        db.save_image(project_id, new_message_id, mime_type, raw_data)
 
    # --- Schritt 4: Komplette bisherige Historie + alle gespeicherten Bilder laden ---
    previous_messages = db.get_messages(project_id, conversation_type=CONVERSATION_TYPE)
    all_images = db.get_images(project_id)
 
    # Bilder nach ihrer message_id gruppieren, damit wir gleich pro Nachricht
    # nachschauen können: "gehört zu DIESER Nachricht ein Bild?"
    # Aufbau: {message_id: [bild1, bild2, ...]}
    images_by_message: dict[int, list[dict]] = {}
    for image_row in all_images:
        images_by_message.setdefault(image_row["message_id"], []).append(image_row)
 
    # --- Schritt 5: Nachrichten-Liste für den Modell-Aufruf zusammenbauen ---
    messages_for_model = []
    last_index = len(previous_messages) - 1
 
    for index, msg in enumerate(previous_messages):
        is_latest_message = (index == last_index)
        images_for_this_message = images_by_message.get(msg["id"], [])
 
        # Entscheidung: Hängen wir bei DIESER Nachricht Bilder an?
        # - Bei der neuesten Nachricht: IMMER, falls gerade ein Bild hochgeladen wurde
        # - Bei allen älteren Nachrichten: NUR, falls der Schalter in config.py auf True steht
        attach_images = images_for_this_message and (
            is_latest_message or RESEND_ALL_IMAGES_EVERY_REQUEST
        )
 
        if attach_images:
            image_blocks = []
            for image_row in images_for_this_message:
                b64_image = base64.b64encode(image_row["data"]).decode("utf-8")
                image_blocks.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:{image_row['mime_type']};base64,{b64_image}"}
                })
 
            messages_for_model.append({
                "role": msg["role"],
                "content": [{"type": "text", "text": msg["content"]}] + image_blocks,
            })
        else:
            # Normale, reine Text-Nachricht
            messages_for_model.append({"role": msg["role"], "content": msg["content"]})
 
    # --- Schritt 6: Modell aufrufen ---
    response = client.chat.completions.create(
        model=model,
        reasoning_effort="low",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            *messages_for_model,
        ],
        response_format=RESPONSE_FORMAT,
    )
 
    result = json.loads(response.choices[0].message.content)
 
    # --- Schritt 7: Antwort speichern - sowohl in der Chat-Historie ... ---
    db.add_message(project_id, conversation_type=CONVERSATION_TYPE, role="assistant", content=json.dumps(result, ensure_ascii=False))
 
    # --- ... als auch als ZWEI eigenständige Artefakte, für unterschiedliche Zwecke ---
    # 1. REVIEW_ARTIFACT_TYPE: das VOLLSTÄNDIGE Ergebnis inkl. "open_questions",
    #    für das Frontend (GET /analyze/{project_id}) und die Validierung
    #    künftiger "answers" (siehe _validate_answer_question_ids).
    db.save_artifact(project_id, REVIEW_ARTIFACT_TYPE, result)

    # 2. ARTIFACT_TYPE: das Ergebnis OHNE "open_questions", für die weitere
    #    Pipeline (z.B. der Hardware-Endpoint) - offene Fragen sind dafür
    #    kein sinnvoller fachlicher Input.
    result_without_open_questions = {
        key: value for key, value in result.items() if key != "open_questions"
    }
    db.save_artifact(project_id, ARTIFACT_TYPE, result_without_open_questions)
 
    # --- Schritt 8: Ergebnis an den Client zurückgeben ---
    return {
        "project_id": project_id,
        **result,
   }


def _parse_answers(answers: List[str]) -> list[dict]:
    # Wandelt die rohen answers-Form-Felder (je ein JSON-Text-Objekt pro
    # Element) in eine Liste von Python-Dictionaries um.
    #
    # Swagger UI schickt bei Listen-Form-Feldern auch dann ein (leeres)
    # Element mit, wenn man gar nichts eingegeben hat (statt einer
    # tatsächlich leeren Liste) - solche leeren/blanken Einträge werden
    # hier rausgefiltert, sonst würde json.loads("") fehlschlagen.
    #
    # Format PRO Element: '{"question_id": "question_1", "answer": "Einzelne LED"}'
    # question_id verweist auf die "id" einer offenen Frage
    # (open_questions[].id) aus einer VORHERIGEN Modell-Antwort.
    non_empty_answers = [a for a in answers if a and a.strip()]
    return [json.loads(answer_json) for answer_json in non_empty_answers]


def _validate_answer_question_ids(parsed_answers: list[dict], project_id: str) -> Optional[str]:
    # Prüft, ob JEDE beantwortete question_id tatsächlich einer offenen
    # Frage aus dem ZULETZT gespeicherten Artefakt entspricht - verhindert,
    # dass sich Tippfehler oder veraltete question_ids (aus einer älteren
    # Runde) unbemerkt in die Chat-Historie einschleichen.
    #
    # Gibt eine Fehlermeldung zurück, FALLS etwas nicht passt - sonst None.
    if not parsed_answers:
        return None

    # REVIEW_ARTIFACT_TYPE (nicht ARTIFACT_TYPE), weil nur DORT die
    # "open_questions" gespeichert sind (siehe Schritt 7).
    latest_structure = db.get_latest_artifact(project_id, REVIEW_ARTIFACT_TYPE)
    valid_question_ids = {
        question["id"] for question in (latest_structure or {}).get("open_questions", [])
    }

    unknown_ids = [
        answer["question_id"] for answer in parsed_answers
        if answer["question_id"] not in valid_question_ids
    ]

    if unknown_ids:
        return f"Unknown question_id(s) in 'answers': {unknown_ids}. No matching open question found."

    return None


def _build_message_text(message: Optional[str], parsed_answers: list[dict]) -> str:
    # Baut aus den zwei optionalen Eingaben (Freitext UND/ODER strukturierte
    # Antworten auf offene Fragen) EINE einzige Nachricht für die Chat-
    # Historie zusammen. Wird von genau einem der beiden Felder gespeist,
    # von beiden, oder (siehe Prüfung im Endpoint unten) von keinem - dann
    # ist es ein Fehler.
    text_parts = []

    if parsed_answers:
        answer_lines = [
            f"- {answer['question_id']}: {answer['answer']}"
            for answer in parsed_answers
        ]
        text_parts.append("Antworten auf offene Fragen:\n" + "\n".join(answer_lines))

    if message:
        text_parts.append(message)

    # Beide Teile (falls beide vorhanden) durch eine Leerzeile getrennt zu
    # EINER Nachricht zusammenfügen, damit weiterhin nur EINE Nutzer-
    # Nachricht pro Aufruf in der Chat-Historie landet.
    combined_text = "\n\n".join(text_parts)

    # Fall "nur Bild, weder message noch answers": Platzhaltertext, damit
    # in der Chat-Historie (Spalte "content", NOT NULL) trotzdem ein
    # sinnvoller Text steht statt eines leeren Strings.
    if not combined_text:
        combined_text = "Siehe Bild"

    return combined_text