"""
Router für den /hardware Endpoint.

Baut auf dem Ergebnis von /analyze auf. Braucht IMMER eine project_id, für
die bereits eine Konzept-Struktur existiert (also mindestens einmal
POST /analyze aufgerufen wurde). Nimmt eine Nachricht entgegen und gibt eine
aktualisierte Hardware-Liste zurück. Funktioniert für den ALLERERSTEN Aufruf
genauso wie für jeden weiteren Refinement-Schritt - das Modell sieht dabei
jedes Mal die gesamte bisherige Chat-Historie DIESES Endpoints sowie die
aktuellste Konzept-Struktur aus /analyze.
"""

from fastapi import APIRouter, Form
from typing import List, Optional

import db.db as db
from config import client, model
from .schema import schema2
from .prompt import SYSTEM_PROMPT

import json

# Der artifact_type, unter dem /analyze seine Konzept-Struktur speichert.
# Von dort holen wir uns den fachlichen Input für diesen Endpoint.
CONCEPT_ARTIFACT_TYPE = "concept_structure"

# Unter diesem Namen speichern wir das REDUZIERTE Ergebnis DIESES Endpoints
# in der "artifacts"-Tabelle - NUR die jeweils ausgewählte ("selected": true)
# Option pro Komponente/Controller, flach ins Objekt gezogen (siehe
# _build_selection_only unten). Das ist der fachliche Input für die
# WEITERE Pipeline (z.B. einen späteren Code-Generierungs-Endpoint) - dort
# interessieren die verworfenen Alternativen nicht mehr.
ARTIFACT_TYPE = "hardware_selection"

# Zweites Artefakt, zusätzlich zu ARTIFACT_TYPE gespeichert - das
# VOLLSTÄNDIGE Modell-Ergebnis inkl. ALLER Optionen/Alternativen je
# Komponente/Controller. Das ist die Version, die das Frontend über
# GET /hardware/{project_id} bekommt (siehe unten) sowie
# POST /hardware/select liest/verändert, damit die Nutzer:in zwischen den
# Alternativen wechseln kann.
REVIEW_ARTIFACT_TYPE = "hardware_selection_review"

# Trennt die Chat-Historie DIESES Endpoints von der anderer Endpoints
# (z.B. /analyze) innerhalb desselben Projekts.
CONVERSATION_TYPE = "hardware"

router = APIRouter()


# Erzwingt das Schema aus schema.py bei jedem Modell-Aufruf DIESES Endpoints.
# Bleibt hier lokal, weil jeder Endpoint sein eigenes Schema hat.
# WICHTIG: Das eingebaute "web_search"-Tool gibt es nur über die Responses API
# (client.responses.create), NICHT über Chat Completions - daher hier das
# "text.format"-Format der Responses API statt "response_format".
TEXT_FORMAT = {
    "format": {
        "type": "json_schema",
        "name": "iot_hardware",
        "schema": schema2,
        "strict": True,
    }
}




# ================================== GET /hardware/{project_id} =====================================
@router.get("/hardware/{project_id}")
def get_latest_hardware_selection(project_id: str):
    # Gibt die ZULETZT gespeicherte, VOLLSTÄNDIGE Hardware-Auswahl (inkl.
    # ALLER Optionen/Alternativen) zu einem Projekt zurück, OHNE das Modell
    # erneut aufzurufen - z.B. damit das Frontend nach einem Seiten-Reload
    # den aktuellen Auswahl-Stand erneut laden kann.
    if not db.project_exists(project_id):
        return {"error": f"No Project with ID '{project_id}' found. Please call POST /projects first."}

    # REVIEW_ARTIFACT_TYPE (nicht ARTIFACT_TYPE), weil das Frontend die
    # vollständigen "options"-Listen braucht, um Alternativen anzuzeigen.
    result = db.get_latest_artifact(project_id, REVIEW_ARTIFACT_TYPE)
    if result is None:
        return {"error": f"No hardware selection found for project '{project_id}'. Please call POST /hardware first."}

    return {
        "project_id": project_id,
        **result,
    }






# ======================================= POST /hardware ============================================
@router.post("/hardware")
async def hardware(
    project_id: str = Form(...),
    message: Optional[str] = Form(default=None),
    # Deaktiviert die Websuche komplett - das Modell arbeitet dann nur mit
    # seinem eigenen (Trainings-)Wissen, ohne aktuelle Preise/Verfügbarkeit
    # nachzuschlagen.
    disable_web_search: bool = Form(False),
    # Schränkt die Websuche (falls aktiv) auf Anbieter/Läden in Deutschland
    # ein, statt international zu suchen.
    local_search_only: bool = Form(True),
):
    # --- Schritt 1: Existiert das Projekt überhaupt? ---
    if not db.project_exists(project_id):
        return {"error": f"No Project with ID '{project_id}' found. Please call POST /projects first."}

    # --- Schritt 2: Aktuellste Konzept-Struktur aus /analyze holen ---
    # Das ist der fachliche Input dieses Endpoints - ohne sie kann keine
    # sinnvolle Hardware-Liste erstellt werden.
    concept_structure = db.get_latest_artifact(project_id, CONCEPT_ARTIFACT_TYPE)
    if concept_structure is None:
        return {"error": f"No concept structure found for project '{project_id}'. Please call POST /analyze first."}

    # --- Schritt 3: Neue Nutzer-Nachricht in der Chat-Historie speichern ---
    if message is not None:
      db.add_message(project_id, conversation_type=CONVERSATION_TYPE, role="user", content=message)

    # --- Schritt 4: Komplette bisherige Historie DIESES Endpoints laden ---
    previous_messages = db.get_messages(project_id, conversation_type=CONVERSATION_TYPE)
    messages_for_model = [
        {"role": msg["role"], "content": msg["content"]} for msg in previous_messages
    ]

    # --- Schritt 5: Websuche-Tool je nach den beiden Schaltern konfigurieren ---
    tools = []
    if disable_web_search:
        search_instructions = (
            "Websuche ist deaktiviert. Nutze AUSSCHLIESSLICH dein eigenes "
            "Wissen für Bauteile, Kosten und Verfügbarkeit - führe KEINE "
            "Websuche durch."
        )
    else:
        web_search_tool = {"type": "web_search"}
        if local_search_only:
            web_search_tool["user_location"] = {"type": "approximate", "country": "DE"}
            search_instructions = (
                "Nutze die Websuche, um aktuelle Bauteile, Preise und "
                "Verfügbarkeit zu recherchieren. Beschränke dich dabei auf "
                "Anbieter/Läden, die in Deutschland verfügbar sind bzw. "
                "dorthin liefern."
            )
        else:
            search_instructions = (
                "Nutze die Websuche, um aktuelle Bauteile, Preise und "
                "Verfügbarkeit zu recherchieren. Anbieter sind nicht auf "
                "Deutschland beschränkt."
            )
        tools.append(web_search_tool)

    # --- Schritt 6: Modell aufrufen (Responses API, wegen web_search-Tool) ---
    response = client.responses.create(
        model=model,
        reasoning={"effort": "low"},
        input=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "system", "content": search_instructions},
            {
                "role": "system",
                "content": f"Konzept-Struktur aus /analyze:\n{json.dumps(concept_structure, ensure_ascii=False)}",
            },
            *messages_for_model,
        ],
        text=TEXT_FORMAT,
        **({"tools": tools} if tools else {}),
    )

    if not response.output_text:
        return {"error": "Das Modell hat keine verwertbare JSON-Antwort geliefert."}

    result = json.loads(response.output_text)

    # --- Schritt 7: Antwort speichern - sowohl in der Chat-Historie ... ---
    db.add_message(project_id, conversation_type=CONVERSATION_TYPE, role="assistant", content=json.dumps(result, ensure_ascii=False))

    # --- ... als auch als ZWEI eigenständige Artefakte, für unterschiedliche Zwecke ---
    # 1. REVIEW_ARTIFACT_TYPE: das VOLLSTÄNDIGE Ergebnis inkl. ALLER Optionen,
    #    für das Frontend (GET /hardware/{project_id} sowie /hardware/select).
    db.save_artifact(project_id, REVIEW_ARTIFACT_TYPE, result)

    # 2. ARTIFACT_TYPE: nur die jeweils ausgewählte Option, für die weitere
    #    Pipeline (z.B. ein späterer Code-Generierungs-Endpoint).
    db.save_artifact(project_id, ARTIFACT_TYPE, _build_selection_only(result))

    # --- Schritt 8: Ergebnis an den Client zurückgeben ---
    return {
        "project_id": project_id,
        **result,
    }


def _build_selection_only(full_result: dict) -> dict:
    # Baut aus dem VOLLSTÄNDIGEN Hardware-Ergebnis (mit "options"-Listen je
    # Komponente/Controller) die REDUZIERTE Struktur für ARTIFACT_TYPE: pro
    # Komponente/Controller bleibt nur die ausgewählte ("selected": true)
    # Option übrig, deren Felder DIREKT ins übergeordnete Objekt gezogen
    # werden (statt einer verschachtelten "options"-Liste mit nur einem
    # Eintrag). Die Felder "id" und "selected" der Option selbst werden
    # dabei NICHT übernommen - die "id" des Objekts bleibt die der
    # Komponente/des Controllers, "selected" ergibt bei nur einer
    # verbleibenden Option keinen Sinn mehr.
    def merge_selected_option(entry: dict, base_keys: list[str]) -> dict:
        selected_option = next(
            (option for option in entry["options"] if option.get("selected")), None
        )
        reduced_entry = {key: entry[key] for key in base_keys}
        if selected_option:
            reduced_entry.update({
                key: value for key, value in selected_option.items()
                if key not in ("id", "selected")
            })
        return reduced_entry

    reduced_components = [
        merge_selected_option(component, ["id", "component_name", "concept_ref_id"])
        for component in full_result.get("hardware_components", [])
    ]
    reduced_controllers = [
        merge_selected_option(controller, ["id", "role", "connected_component_ids"])
        for controller in full_result.get("controllers", [])
    ]

    return {
        "hardware_components": reduced_components,
        "controllers": reduced_controllers,
    }







# ========================================= POST /hardware/select ===========================================
#Das ansprechen dieses Routers braucht keine API Anfrage
#Der Endpoint geht die Datenpank durch und setzt das gewuenschte Objekt auf true und den
#Rest auf false (Also in dem einen type)
@router.post("/hardware/select")
async def select_hardware_option(
    project_id: str = Form(...),
    # Liste von JSON-Text-EINZELOBJEKTEN
    # dadurch bietet Swagger UI ein "+", um mehrere Selections in EINEM
    # Aufruf zu ändern, statt pro Änderung einen eigenen Request zu brauchen.
    selections: List[str] = Form(
        default=[],
        # description + example landen in Swagger UI als Hinweistext direkt
        # am Feld - man muss die Syntax nicht mehr im Code nachschlagen.
        description='Je "+" GENAU EIN JSON-Objekt: {"target_id": "component_...", "option_id": "option_..."}',
        example='{"target_id": "component_rgb_led_gruen", "option_id": "option_ws2812b_gruen"}',
    ),
):
    """
    Ändert nachträglich, welche Option (Alternative) einer oder mehrerer
    bereits bestehender hardware_components- bzw. controllers-Komponenten
    als "selected" markiert ist - z.B. wenn die Nutzer:in statt der vom
    Modell empfohlenen Option manuell eine andere Alternative bevorzugt.
    Ruft KEIN Modell auf, sondern schaltet nur "selected"-Flags innerhalb
    des zuletzt gespeicherten Hardware-Artefakts um und speichert das
    Ergebnis als neue Artefakt-Version.
    """

    if not db.project_exists(project_id):
        return {"error": f"No Project with ID '{project_id}' found. Please call POST /projects first."}

    try:
        parsed_selections = _parse_selections(selections)
    except (json.JSONDecodeError, KeyError, TypeError):
        return {"error": "Invalid 'selections' format. Expected JSON like '{\"target_id\": \"...\", \"option_id\": \"...\"}' per entry."}

    if not parsed_selections:
        return {"error": "Please provide at least one entry in 'selections'."}

    # REVIEW_ARTIFACT_TYPE (nicht ARTIFACT_TYPE), weil nur DORT noch die
    # vollständigen "options"-Listen aller Alternativen vorhanden sind -
    # ARTIFACT_TYPE enthält ja bereits nur noch die reduzierte, ausgewählte
    # Option ohne "options"-Liste.
    result = db.get_latest_artifact(project_id, REVIEW_ARTIFACT_TYPE)
    if result is None:
        return {"error": f"No hardware selection found for project '{project_id}'. Please call POST /hardware first."}

    validation_error, resolved_selections = _resolve_selections(parsed_selections, result)
    if validation_error:
        return {"error": validation_error}

    # Erst JETZT, nachdem ALLE Selections erfolgreich geprüft wurden,
    # werden die "selected"-Flags tatsächlich umgeschaltet.
    for target, option_id in resolved_selections:
        #Bei Optionen, deren id mit der mitgegebenen option_id uebereinstimmt wird es auf true gesetzt
        #Bei den anderen Optionen auf false
        for option in target["options"]:
            option["selected"] = option["id"] == option_id

    # --- Neue Version BEIDER Artefakte speichern (Historie bleibt erhalten) ---
    db.save_artifact(project_id, REVIEW_ARTIFACT_TYPE, result)
    db.save_artifact(project_id, ARTIFACT_TYPE, _build_selection_only(result))

    return {
        "project_id": project_id,
        **result,
    }


def _parse_selections(selections: List[str]) -> list[dict]:
    # Wandelt die rohen selections-Form-Felder (je ein JSON-Text-Objekt pro
    # Element) in eine Liste von Python-Dictionaries um. Gleiches Muster wie
    # _parse_answers in endpoints/analyze/router.py.
    #
    # Swagger UI schickt bei Listen-Form-Feldern auch dann ein (leeres)
    # Element mit, wenn man gar nichts eingegeben hat - solche leeren/
    # blanken Einträge werden hier rausgefiltert, sonst würde
    # json.loads("") fehlschlagen.
    #
    # Format PRO Element: '{"target_id": "component_...", "option_id": "option_..."}'
    # KEIN target_type mehr nötig - component_id- und controller_id-Werte
    # sind durch ihr Namensschema ("component_..." bzw. "controller_...")
    # bereits eindeutig unterscheidbar, siehe _find_target unten.
    non_empty_selections = [s for s in selections if s and s.strip()]
    return [json.loads(selection_json) for selection_json in non_empty_selections]


def _resolve_selections(parsed_selections: list[dict], result: dict):
    # Prüft ALLE gewünschten Änderungen, BEVOR irgendetwas am Artefakt
    # verändert wird - so bleibt der Aufruf atomar: entweder werden ALLE
    # Selections übernommen, oder GAR KEINE (bei einem Fehler irgendwo in
    # der Liste).
    #
    # Rückgabe: (Fehlermeldung oder None, Liste von (target, option_id)-Paaren)
    target_ids = [selection["target_id"] for selection in parsed_selections]

    # Doppelte target_ids innerhalb DESSELBEN Aufrufs sind nicht erlaubt -
    # sonst wäre unklar, welche der widersprüchlichen option_ids gelten soll.
    duplicate_ids = sorted({tid for tid in target_ids if target_ids.count(tid) > 1})
    if duplicate_ids:
        return (
            f"Duplicate target_id(s) in 'selections': {duplicate_ids}. "
            f"Each target_id may only appear once per call.",
            None,
        )

    resolved = []
    for selection in parsed_selections:
        target_id = selection["target_id"]
        option_id = selection["option_id"]

        target = _find_target(result, target_id)
        if target is None:
            return f"No entry with id '{target_id}' found in 'hardware_components' or 'controllers'.", None

        if not any(option["id"] == option_id for option in target["options"]):
            return f"No option with id '{option_id}' found for '{target_id}'.", None

        resolved.append((target, option_id))

    return None, resolved


def _find_target(result: dict, target_id: str) -> Optional[dict]:
    # Sucht target_id sowohl in "hardware_components" als auch in
    # "controllers" (statt dass der Client vorher sagen muss, in welcher
    # Liste gesucht werden soll) und gibt den passenden Eintrag zurück,
    # oder None, falls in KEINER der beiden Listen etwas gefunden wurde.
    for list_key in ("hardware_components", "controllers"):
        target = next((entry for entry in result.get(list_key, []) if entry["id"] == target_id), None)
        if target is not None:
            return target
    return None