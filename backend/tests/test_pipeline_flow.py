"""
End-to-End-Test für die zusammengeführte Pipeline (/projects -> /analyze ->
/hardware -> /circuit-diagram, inkl. der rückwirkenden "message"-Änderung
am Circuit-Diagram-Endpoint) - OHNE echte Modell-Aufrufe (also ohne Kosten).

Läuft als eigenständiges Skript (kein pytest installiert):
    python tests/test_pipeline_flow.py

Isoliert die DB auf eine Scratch-Datei, damit die echte draft2device.db
nicht verändert wird, und patcht die drei vom Projekt genutzten OpenAI-
Aufrufarten (chat.completions.create, chat.completions.parse,
responses.create) auf demselben, von allen Endpoints geteilten config.client-
Objekt.
"""

import json
import os
import sys
import tempfile
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import db.db as db

# DB VOR jedem App-/Router-Import auf eine Scratch-Datei umleiten, damit
# init_db() und alle folgenden Aufrufe garantiert dort landen.
_scratch_db_fd, _scratch_db_path = tempfile.mkstemp(suffix=".db")
os.close(_scratch_db_fd)
os.remove(_scratch_db_path)
db.DB_PATH = _scratch_db_path
db.init_db()

import config
from fastapi.testclient import TestClient
from main import app
from endpoints.circuit_diagram.schema import CircuitDiagram, HardwareChangeClassification
from endpoints.circuit_diagram.hardware_output import EXAMPLE_HARDWARE_OUTPUT

client = TestClient(app)

ANALYZE_FIXTURE = {
    "project_metadata": {"working_title": "Test-Projekt", "core_intention": "Testet die Pipeline."},
    "actors_entities": [],
    "sensors": [
        {"id": "sensor_erde_trocken", "concept_term": "Erde ist trocken", "category": "Moisture Sensor"},
    ],
    "actuators": [
        {"id": "actuator_rot_blinklicht", "concept_term": "rot blinken", "category": "Visual Feedback (RGB-LED)"},
    ],
    "states": [
        {
            "id": "state_idle", "name": "Idle", "description": "Ruhezustand",
            "is_initial_state": True, "entry_actions": [], "trigger_actions": [],
        },
    ],
    "global_actions": [],
    "open_questions": [],
}

CIRCUIT_FIXTURE = CircuitDiagram(
    title="Test-Schaltplan",
    summary="Ein einfacher Test-Schaltplan.",
    components=[],
    connections=[],
    assembly_steps=[],
    power_requirements=[],
    safety_notes=[],
)

# Wird von test_revise_with_hardware_change() VOR dem jeweiligen Aufruf befüllt,
# damit der gemockte .parse()-Call weiß, welche Klassifizierung er als
# nächstes zurückgeben soll (mehrere /circuit-diagram-Aufrufe mit message
# hintereinander brauchen unterschiedliche Klassifizierungs-Antworten).
_next_classification = [None]


def _fake_chat_completions_create(*args, **kwargs):
    response = MagicMock()
    response.choices = [MagicMock(message=MagicMock(content=json.dumps(ANALYZE_FIXTURE)))]
    return response


def _fake_responses_create(*args, **kwargs):
    response = MagicMock()
    response.output_text = json.dumps(EXAMPLE_HARDWARE_OUTPUT)
    return response


def _fake_chat_completions_parse(*args, **kwargs):
    response_format = kwargs.get("response_format")
    response = MagicMock()
    if response_format is HardwareChangeClassification:
        parsed = _next_classification[0]
        assert parsed is not None, "Test muss _next_classification vor einem Revise-Call setzen"
    else:
        parsed = CIRCUIT_FIXTURE
    response.choices = [MagicMock(message=MagicMock(parsed=parsed))]
    return response


def _run_full_setup():
    """POST /projects -> /analyze -> /hardware, liefert die project_id."""
    res = client.post("/projects")
    assert res.status_code == 200, res.text
    project_id = res.json()["project_id"]

    res = client.post("/analyze", data={"project_id": project_id, "message": "Ein durstiger Blumentopf."})
    assert res.status_code == 200, res.text
    assert db.get_latest_artifact(project_id, "concept_structure") is not None

    res = client.post("/hardware", data={"project_id": project_id, "message": "Bitte Bauteile vorschlagen."})
    assert res.status_code == 200, res.text
    assert res.json().get("error") is None, res.json()
    assert db.get_latest_artifact(project_id, "hardware_selection") is not None

    return project_id


def test_full_chain_no_message():
    with patch.object(config.client.chat.completions, "create", side_effect=_fake_chat_completions_create), \
         patch.object(config.client.chat.completions, "parse", side_effect=_fake_chat_completions_parse), \
         patch.object(config.client.responses, "create", side_effect=_fake_responses_create):
        project_id = _run_full_setup()

        res = client.post("/circuit-diagram", json={"project_id": project_id})
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["used_dummy_hardware_input"] is False, "sollte das echte hardware-Artefakt nutzen, nicht den Dummy"
        assert data["hardware_updated"] is False
        assert len(data["hardware_components_input"]) == 6  # 5 hardware_components + 1 controller aus EXAMPLE_HARDWARE_OUTPUT
        assert db.get_latest_artifact(project_id, "circuit_diagram") is not None
        # Ohne message darf KEINE circuit_diagram-Konversation entstehen (Rückwärtskompatibilität).
        assert db.get_messages(project_id, "circuit_diagram") == []

    print("test_full_chain_no_message: OK")


def test_revise_with_hardware_change():
    with patch.object(config.client.chat.completions, "create", side_effect=_fake_chat_completions_create), \
         patch.object(config.client.chat.completions, "parse", side_effect=_fake_chat_completions_parse) as parse_mock, \
         patch.object(config.client.responses, "create", side_effect=_fake_responses_create) as responses_mock:
        project_id = _run_full_setup()

        res = client.post("/circuit-diagram", json={"project_id": project_id})
        assert res.status_code == 200, res.text

        hardware_versions_before = _count_artifact_versions(project_id, "hardware_selection")
        responses_calls_before = responses_mock.call_count

        _next_classification[0] = HardwareChangeClassification(
            requires_hardware_change=True,
            target_component_id="component_rotes_blinklicht",
            target_component_name="Rote LED",
            hardware_change_instruction="Ersetze component_rotes_blinklicht (aktuell eine rote LED) durch einen kleinen Buzzer als akustisches Warnsignal.",
        )
        res = client.post("/circuit-diagram", json={
            "project_id": project_id,
            "message": "Ich möchte keine rote Warn-LED, sondern einen kleinen Buzzer als Hinweis.",
        })
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["hardware_updated"] is True, "Hardware-Auswahl hätte aktualisiert werden müssen"

        # /hardware wurde intern tatsächlich ein weiteres Mal aufgerufen (responses.create-Call-Zahl gestiegen)...
        assert responses_mock.call_count == responses_calls_before + 1
        # ...und eine NEUE, zusätzliche Version des "hardware_selection"-Artefakts wurde persistiert (Historie erhalten).
        assert _count_artifact_versions(project_id, "hardware_selection") == hardware_versions_before + 1

        # circuit_diagram-Konversation: genau ein user/assistant-Paar für diesen einen Revise-Call.
        circuit_messages = db.get_messages(project_id, "circuit_diagram")
        assert len(circuit_messages) == 2
        assert circuit_messages[0]["role"] == "user"
        assert circuit_messages[1]["role"] == "assistant"

    print("test_revise_with_hardware_change: OK")


def test_revise_without_hardware_change():
    with patch.object(config.client.chat.completions, "create", side_effect=_fake_chat_completions_create), \
         patch.object(config.client.chat.completions, "parse", side_effect=_fake_chat_completions_parse), \
         patch.object(config.client.responses, "create", side_effect=_fake_responses_create) as responses_mock:
        project_id = _run_full_setup()

        res = client.post("/circuit-diagram", json={"project_id": project_id})
        assert res.status_code == 200, res.text

        responses_calls_before = responses_mock.call_count
        hardware_versions_before = _count_artifact_versions(project_id, "hardware_selection")

        _next_classification[0] = HardwareChangeClassification(
            requires_hardware_change=False,
            target_component_id=None,
            target_component_name=None,
            hardware_change_instruction=None,
        )
        res = client.post("/circuit-diagram", json={
            "project_id": project_id,
            "message": "Beschreibe Montageschritt 1 bitte etwas genauer.",
        })
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["hardware_updated"] is False

        # /hardware darf für eine reine Verkabelungsfrage NICHT aufgerufen worden sein.
        assert responses_mock.call_count == responses_calls_before
        assert _count_artifact_versions(project_id, "hardware_selection") == hardware_versions_before

    print("test_revise_without_hardware_change: OK")


def _count_artifact_versions(project_id: str, artifact_type: str) -> int:
    connection = db._get_connection()
    cursor = connection.cursor()
    cursor.execute(
        "SELECT COUNT(*) FROM artifacts WHERE project_id = ? AND artifact_type = ?",
        (project_id, artifact_type),
    )
    count = cursor.fetchone()[0]
    connection.close()
    return count


if __name__ == "__main__":
    try:
        test_full_chain_no_message()
        test_revise_with_hardware_change()
        test_revise_without_hardware_change()
        print("\nALL TESTS PASSED")
    finally:
        try:
            os.remove(_scratch_db_path)
        except OSError:
            pass
