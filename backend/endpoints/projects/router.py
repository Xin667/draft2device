"""
Router für den /projects Endpoint.

Legt neue, leere Projekte an, listet sie auf, löscht sie - und gibt über
GET /projects/{project_id} einen kompletten Überblick über EIN Projekt
zurück (Input/Output aller drei Pipeline-Schritte: /analyze, /hardware,
/circuit-diagram). Kein Modell-Aufruf, keine komplexe Logik - nur bereits
gespeicherte Daten aus der DB zusammenstellen. Braucht deshalb kein eigenes
Schema und keinen eigenen Prompt.
"""

from fastapi import APIRouter, Form
from typing import Optional
import db.db as db

router = APIRouter()
 
 
@router.post("/projects")
def create_project_endpoint(name: Optional[str] = Form(default=None)):
    # Legt ein neues, leeres Projekt an in der DB an und gibt die ID zurück.
    # "name" ist optional - wird keiner angegeben, vergibt db.create_project()
    # automatisch einen Platzhalter-Namen wie "Projekt-3".
    project_id = db.create_project(name=name)
    return {"project_id": project_id}


@router.get("/projects")
def list_projects_endpoint():
    # Gibt ALLE bisher angelegten Projekte zurück (id + name + Erstellungsdatum).
    # Gleicher Pfad wie oben ("/projects"), aber andere HTTP-Methode (GET
    # statt POST) - das ist erlaubt und üblich: POST zum Anlegen, GET zum
    # Abrufen einer Liste.
    return {"projects": db.list_projects()}


@router.get("/projects/{project_id}")
def get_project_overview(project_id: str):
    # Gibt ALLES zurück, was bisher zu einem Projekt gespeichert wurde -
    # über alle drei Pipeline-Schritte hinweg. Für jeden Schritt: das
    # zuletzt gespeicherte Ergebnis-Artefakt (Output) + die komplette
    # Chat-Historie dieses Schritts (das faktische "Input"-Protokoll, da
    # /analyze, /hardware und /circuit-diagram jede Nutzer-Nachricht +
    # Modell-Antwort dort mitschreiben - siehe deren jeweilige router.py).
    #
    # Zeigt bewusst nur das ZULETZT gespeicherte Artefakt je Typ (nicht die
    # komplette Versions-Historie, siehe db.save_artifact: jede Version
    # bleibt in der DB erhalten) - "artifact_versions" verrät aber, wie
    # viele es insgesamt gibt, ohne sie alle einzeln auszuliefern.
    if not db.project_exists(project_id):
        return {"error": f"No project with id '{project_id}' found."}

    project = next((p for p in db.list_projects() if p["id"] == project_id), None)

    images = db.get_images(project_id)
    uploaded_images = [
        {"message_id": image["message_id"], "mime_type": image["mime_type"]}
        for image in images
    ]

    return {
        "project_id": project_id,
        "project": project,

        # --- /analyze: siehe endpoints/analyze/router.py ---
        # ARTIFACT_TYPE = "concept_structure" (ohne offene Fragen, das ist
        # der fachliche Input für /hardware), REVIEW_ARTIFACT_TYPE =
        # "concept_structure_review" (inkl. offener Fragen, für die Anzeige).
        "analyze": {
            "result": db.get_latest_artifact(project_id, "concept_structure"),
            "result_review": db.get_latest_artifact(project_id, "concept_structure_review"),
            "artifact_versions": _count_artifact_versions(project_id, "concept_structure"),
            "conversation": db.get_messages(project_id, "analyze"),
            "uploaded_images": uploaded_images,
        },

        # --- /hardware: siehe endpoints/hardware/router.py ---
        # ARTIFACT_TYPE = "hardware" - enthält hardware_components UND
        # controllers, jeweils MIT allen Optionen (nicht nur der gewählten).
        "hardware": {
            "result": db.get_latest_artifact(project_id, "hardware_selection"),
            "result_review": db.get_latest_artifact(project_id, "hardware_selection_review"),
            "artifact_versions": _count_artifact_versions(project_id, "hardware_selection"),
            "conversation": db.get_messages(project_id, "hardware"),
        },

        # --- /circuit-diagram: siehe endpoints/circuit_diagram/router.py ---
        # CIRCUIT_ARTIFACT_TYPE = "circuit_diagram". "conversation" ist NUR
        # dann nicht leer, wenn schon mindestens eine Änderungsanfrage
        # (message) an /circuit-diagram geschickt wurde - eine reine
        # Erst-Generierung ohne message legt bewusst keine Historie an.
        "circuit_diagram": {
            "result": db.get_latest_artifact(project_id, "circuit_diagram"),
            "artifact_versions": _count_artifact_versions(project_id, "circuit_diagram"),
            "conversation": db.get_messages(project_id, "circuit_diagram"),
        },
        "code": {
            "result": db.get_latest_artifact(project_id, "generated_code"),
            "artifact_versions": _count_artifact_versions(project_id, "generated_code"),
        },
    }


def _count_artifact_versions(project_id: str, artifact_type: str) -> int:
    # Anzahl bisher gespeicherter Versionen eines Artefakt-Typs - db.py
    # bietet dafür keine eigene Funktion (nur get_latest_artifact), daher
    # hier direkt über die gemeinsame Connection-Hilfsfunktion gezählt.
    connection = db._get_connection()
    cursor = connection.cursor()
    cursor.execute(
        "SELECT COUNT(*) FROM artifacts WHERE project_id = ? AND artifact_type = ?",
        (project_id, artifact_type),
    )
    count = cursor.fetchone()[0]
    connection.close()
    return count


@router.delete("/projects/{project_id}")
def delete_project_endpoint(project_id: str):
    # "{project_id}" in der Route ist ein PFAD-Parameter - der Wert steht
    # direkt in der URL, z.B. DELETE /projects/a1b2c3d4-... statt als
    # Formularfeld. FastAPI erkennt das automatisch, weil der Funktions-
    # Parameter "project_id" genauso heißt wie der Platzhalter in der Route.
    if not db.project_exists(project_id):
        return {"error": f"No project with id '{project_id}' found."}
 
    db.delete_project(project_id)
    return {"message": f"Project '{project_id}' and all related data have been deleted."}