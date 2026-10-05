"""
Router für den /circuit-diagram Endpoint (der "dritte" KI-Endpoint).

Nimmt die physischen Bauteile entgegen, die ein VORHERIGER (hier noch nicht
gebauter) Hardware-Auswahl-Endpoint ausgewählt hat, und erzeugt daraus einen
vollständigen, interaktiven Schaltplan: welches Bauteil wird mit welchem
Pin an welches andere Bauteil angeschlossen, in welcher Reihenfolge, und
worauf man dabei achten muss - verständlich auch für Einsteiger:innen.

WICHTIG: Dieser Endpoint ist NICHT dafür verantwortlich, Bauteile
auszuwählen (das macht /hardware, siehe endpoints/hardware/ - 1:1 von
franz' fertigem Endpoint übernommen). Solange kein echtes "hardware"-
Artefakt in der DB liegt, wird auf ein Beispiel zurückgegriffen (siehe
dummy_data.py), das über hardware_adapter.normalize_hardware_output() aus
einer echten /hardware-Beispielantwort (hardware_output.py) abgeleitet ist -
derselbe Adapter, den auch ein echtes Artefakt durchläuft (siehe Schritt 2
unten).

RÜCKWIRKENDE ÄNDERUNGEN (optionales "message"-Feld): Wird zusätzlich zur
project_id eine "message" mitgeschickt (z.B. "keine rote Warn-LED, sondern
ein kleiner Buzzer"), wird das als Änderungswunsch behandelt statt als
Neuanfang - siehe refinement.py für die Klassifizierung ("betrifft das
überhaupt die Bauteil-Auswahl?") und den ggf. daraus folgenden gezielten
/hardware-Refinement-Aufruf. Ohne "message" verhält sich dieser Endpoint
exakt wie zuvor (reine Neu-Generierung aus der aktuellen Bauteile-Liste).
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import db.db as db
from config import client, model
from .schema import CircuitDiagram, CircuitDiagramResponse
from .prompt import SYSTEM_PROMPT
from .dummy_data import DUMMY_HARDWARE_SELECTION
from .hardware_adapter import normalize_hardware_output
from .refinement import classify_hardware_change, run_hardware_refinement

import json

# Artefakt-Typ, unter dem /hardware sein Ergebnis ablegt (siehe
# endpoints/hardware/router.py: ARTIFACT_TYPE = "hardware"). Wird hier
# nur GELESEN, nie geschrieben.
HARDWARE_ARTIFACT_TYPE = "hardware_selection_review"

# Artefakt-Typ, unter dem WIR unser eigenes Ergebnis ablegen.
CIRCUIT_ARTIFACT_TYPE = "circuit_diagram"

# Trennt die Chat-Historie DIESES Endpoints von der anderer Endpoints,
# analog zu CONVERSATION_TYPE bei /analyze und /hardware. Wird NUR befüllt,
# wenn tatsächlich eine "message" (ein Änderungswunsch) mitgeschickt wurde -
# reine Neu-Generierungen ohne Nachricht hinterlassen bewusst KEINE Zeilen
# hier, damit sich am Verhalten ohne "message" nichts ändert.
CIRCUIT_CONVERSATION_TYPE = "circuit_diagram"

router = APIRouter()


class CircuitDiagramRequest(BaseModel):
    project_id: str
    # Optional: ein Änderungswunsch zu einem BEREITS bestehenden Schaltplan
    # (z.B. "keine rote Warn-LED, sondern ein Buzzer"). Ohne dieses Feld
    # verhält sich der Endpoint exakt wie vorher (einmalige Neu-Generierung).
    message: str | None = None


@router.post("/circuit-diagram", response_model=CircuitDiagramResponse)
async def create_circuit_diagram(request: CircuitDiagramRequest):
    project_id = request.project_id
    message = request.message

    # --- Schritt 1: Existiert das Projekt überhaupt? ---
    # (Anders als bei /analyze nutzen wir hier eine echte HTTPException statt
    # eines {"error": ...}-dicts, weil response_model=CircuitDiagramResponse
    # oben sonst versuchen würde, die Fehler-Antwort gegen das volle
    # Schaltplan-Schema zu validieren und mit einem 500er fehlschlagen würde.)
    if not db.project_exists(project_id):
        raise HTTPException(
            status_code=404,
            detail=f"No Project with ID '{project_id}' found. Please call POST /projects first.",
        )

    # --- Schritt 2: Bauteile-Liste laden ---
    # Erst versuchen, ein ECHTES Ergebnis des Hardware-Endpoints zu finden.
    # Existiert noch keins (weil /hardware für DIESES Projekt noch nicht
    # aufgerufen wurde), wird auf das feste Beispiel zurückgegriffen, damit
    # dieser Endpoint schon jetzt eigenständig getestet werden kann.
    #
    # In BEIDEN Fällen (echtes Artefakt ODER Beispiel) läuft die Liste durch
    # denselben normalize_hardware_output()-Adapter: /hardware liefert pro
    # Bauteil/Controller mehrere Optionen (Alternativen) mit je einem
    # "selected"-Flag - der Adapter zieht daraus deterministisch NUR die
    # gewählte Option und bringt sie in die flache Form, die das Prompt
    # unten erwartet (siehe hardware_adapter.py).
    raw_hardware_output = db.get_latest_artifact(project_id, HARDWARE_ARTIFACT_TYPE)
    used_dummy_hardware = raw_hardware_output is None
    if raw_hardware_output is None:
        hardware_components = DUMMY_HARDWARE_SELECTION
    else:
        hardware_components = normalize_hardware_output(raw_hardware_output)

    # --- Schritt 2b: Änderungswunsch (falls vorhanden) ggf. bis zur
    # Bauteil-Auswahl zurückwirken lassen ---
    # NUR wenn eine "message" mitgeschickt wurde: erst günstig klassifizieren
    # lassen, ob dafür überhaupt ein ANDERES physisches Bauteil gebraucht
    # wird (siehe refinement.py) - falls ja, /hardware GEZIELT (als
    # Refinement seiner eigenen Chat-Historie, nicht als Neuanfang)
    # aktualisieren und die frisch normalisierte Liste übernehmen.
    hardware_updated = False
    if message:
        classification = classify_hardware_change(hardware_components, message)
        if classification.requires_hardware_change and classification.hardware_change_instruction:
            success, updated_raw_hardware = await run_hardware_refinement(
                project_id, classification.hardware_change_instruction
            )
            if success:
                hardware_components = normalize_hardware_output(updated_raw_hardware)
                used_dummy_hardware = False
                hardware_updated = True

    # --- Schritt 3: Konzept-Struktur als optionalen Zusatzkontext laden ---
    # (falls /analyze für dieses Projekt schon einmal aufgerufen wurde)
    concept_structure = db.get_latest_artifact(project_id, "concept_structure")

    # --- Schritt 4: Nachricht für das Modell zusammenbauen ---
    user_payload = {"hardware_components": hardware_components}
    if concept_structure is not None:
        user_payload["concept_structure"] = concept_structure

    # Nur bei einer Änderungsanfrage: den bisher gespeicherten Schaltplan
    # als Grundlage mitschicken (siehe SYSTEM_PROMPT-Zusatz "Falls ein
    # vorheriger Schaltplan mitgeschickt wird") + bisherige circuit_diagram-
    # Konversation laden. Ohne "message" bleibt previous_messages leer und
    # user_payload bekommt KEIN "previous_circuit_diagram" - der Modell-
    # Aufruf unten ist dann exakt [system, user(payload)], byte-identisch
    # zum bisherigen Verhalten.
    previous_messages = []
    if message:
        previous_circuit_diagram = db.get_latest_artifact(project_id, CIRCUIT_ARTIFACT_TYPE)
        if previous_circuit_diagram is not None:
            user_payload["previous_circuit_diagram"] = previous_circuit_diagram
        previous_messages = db.get_messages(project_id, CIRCUIT_CONVERSATION_TYPE)

    user_content = json.dumps(user_payload, ensure_ascii=False)
    if message:
        user_content = f"{message}\n\n{user_content}"
        db.add_message(project_id, CIRCUIT_CONVERSATION_TYPE, "user", message)

    messages_for_model = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages_for_model += [{"role": m["role"], "content": m["content"]} for m in previous_messages]
    messages_for_model.append({"role": "user", "content": user_content})

    # --- Schritt 5: Modell aufrufen ---
    # client.chat.completions.parse(...) statt .create(...): die
    # OpenAI-Bibliothek erzeugt aus dem Pydantic-Modell CircuitDiagram
    # automatisch ein striktes JSON-Schema UND gibt das Ergebnis direkt als
    # validierte CircuitDiagram-Instanz zurück (response.choices[0].message.parsed).
    response = client.chat.completions.parse(
        model=model,
        reasoning_effort="low",
        messages=messages_for_model,
        response_format=CircuitDiagram,
    )

    result: CircuitDiagram = response.choices[0].message.parsed
    result_dict = result.model_dump(mode="json")

    if message:
        # Bewusst nur die kurze Zusammenfassung speichern, nicht den ganzen
        # Schaltplan-JSON-Dump (das größte der drei Artefakte) - hält die
        # gespeicherte Konversation klein, die aktuelle Wahrheit steht
        # ohnehin im "circuit_diagram"-Artefakt (siehe Schritt 6/previous_circuit_diagram).
        db.add_message(project_id, CIRCUIT_CONVERSATION_TYPE, "assistant", result.summary)

    # --- Schritt 6: Ergebnis als Artefakt speichern ---
    db.save_artifact(project_id, CIRCUIT_ARTIFACT_TYPE, result_dict)

    # --- Schritt 7: Ergebnis an den Client zurückgeben ---
    # hardware_components wird als Echo mitgeschickt, damit im Viewer der
    # Input (was ans Modell ging) neben dem rohen Output (was das Modell
    # daraus gemacht hat) angezeigt und verglichen werden kann.
    return {
        "project_id": project_id,
        "used_dummy_hardware_input": used_dummy_hardware,
        "hardware_components_input": hardware_components,
        "hardware_updated": hardware_updated,
        **result_dict,
    }


@router.get("/circuit-diagram/{project_id}")
async def get_circuit_diagram(project_id: str):
    # Gibt den ZULETZT für dieses Projekt gespeicherten Schaltplan zurück,
    # ohne das Modell erneut aufzurufen - z.B. damit das Frontend nach einem
    # Seiten-Reload den aktuellen Stand erneut laden kann.
    if not db.project_exists(project_id):
        raise HTTPException(
            status_code=404,
            detail=f"No Project with ID '{project_id}' found. Please call POST /projects first.",
        )

    circuit = db.get_latest_artifact(project_id, CIRCUIT_ARTIFACT_TYPE)
    if circuit is None:
        raise HTTPException(
            status_code=404,
            detail=f"No circuit diagram found for project '{project_id}' yet. Please call POST /circuit-diagram first.",
        )

    return {
        "project_id": project_id,
        **circuit,
    }
