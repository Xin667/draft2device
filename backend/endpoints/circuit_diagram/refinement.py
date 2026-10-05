"""
Ermöglicht rückwirkende Änderungen ("Refinements") am Circuit-Diagram-
Endpoint, die bis zur Bauteil-Auswahl (/hardware) zurückwirken - z.B. "keine
rote Warn-LED, sondern ein kleiner Buzzer" - OHNE dass die Nutzer:in dafür
manuell /hardware erneut aufrufen muss.

Ablauf (siehe router.py, create_circuit_diagram):
1. classify_hardware_change(): ein kleiner, günstiger Modell-Call
   entscheidet, ob die Änderungsanfrage tatsächlich einen ANDEREN
   physischen Bauteil-Typ für eine bestehende hardware_components-/
   controllers-Komponente braucht, oder ob es nur eine reine Verkabelungs-/
   Pin-Frage ist, die die Bauteil-Auswahl gar nicht betrifft.
   -> Ein separater, günstiger Klassifizierungs-Schritt VOR einem echten
      /hardware-Aufruf lohnt sich, weil /hardware standardmäßig Websuche
      aktiviert hat (disable_web_search=False) und damit spürbar langsamer/
      teurer ist, als eine reine Verkabelungsfrage rechtfertigen würde.
2. Falls ja: run_hardware_refinement() ruft /hardware NICHT über HTTP,
   sondern DIREKT als Python-Funktion auf (dieselbe App, kein Netzwerk-
   Umweg nötig). Weil für das Projekt an dieser Stelle bereits eine
   "hardware"-Chat-Historie existiert, behandelt /hardware das automatisch
   als gezielten Refinement-Schritt (siehe dessen eigener SYSTEM_PROMPT:
   "Wenn eine bereits bestehende Chat-Historie DIESES Endpoints existiert
   ... passe die Hardware-Liste gezielt ... an, statt sie komplett neu zu
   erfinden.") - /hardware selbst wird dabei NICHT verändert, nur
   wiederverwendet.

WICHTIG: /hardware ist eine FastAPI-Route mit Form(...)-Parametern. Deren
Standardwerte (z.B. "disable_web_search: bool = Form(False)") lösen NUR bei
einem echten HTTP-Request zu einem echten Bool auf - bei einem direkten
Python-Aufruf (wie hier) ist ein weggelassener Parameter stattdessen das
Form(...)-Objekt selbst, kein bool. Deshalb werden unten IMMER alle vier
Parameter explizit gesetzt.
"""

from pydantic import BaseModel

from config import client, model
from .schema import HardwareChangeClassification

# Absichtlich ein eigener, schlanker Prompt statt des grossen circuit_diagram
# SYSTEM_PROMPT aus prompt.py - diese Klassifizierung ist eine eng
# umgrenzte Vorfrage, kein Schaltplan-Entwurf.
CLASSIFIER_SYSTEM_PROMPT = """
Du bekommst zwei Dinge: (1) die aktuelle Liste bereits ausgewählter
Hardware-Komponenten eines IoT-Projekts (jeweils id, name, role) und (2)
einen Änderungswunsch der Nutzer:in zu deren Schaltplan.

Deine EINZIGE Aufgabe: entscheiden, ob die Erfüllung dieses Wunsches
erfordert, dass für eine der VORHANDENEN Komponenten ein ANDERER
PHYSISCHER BAUTEIL-TYP verwendet wird (z.B. "LED durch Buzzer ersetzen",
"statt Bluetooth soll das Modul WLAN können") - im Unterschied zu einer
reinen Verkabelungs-/Pin-/Reihenfolge-Frage, die am Bauteil selbst nichts
ändert (z.B. "nutze Pin D5 statt D9", "beschreibe Schritt 3 genauer",
"vertausche die Kabelfarben").

Setze "requires_hardware_change" nur dann auf true, wenn wirklich ein
ANDERES Bauteil für einen BEREITS VORHANDENEN Eintrag gebraucht wird. Wenn
die Nachricht ein komplett NEUES Konzept (einen Sensor/Aktor, den es in der
Liste noch gar nicht gibt) verlangen würde, setze "requires_hardware_change"
trotzdem auf false (das liegt ausserhalb der Reichweite dieses Schritts).

Falls true:
- "target_component_id": die "id" aus der Liste, die betroffen ist.
- "target_component_name": deren aktueller Name, zur besseren Lesbarkeit.
- "hardware_change_instruction": EINE eigenständige, klare Anweisung auf
  Deutsch, die die betroffene Komponente EXPLIZIT beim Namen bzw. bei ihrer
  id nennt (z.B. "Ersetze die Option für component_warnleuchte (aktuell
  eine rote Warn-LED) durch einen kleinen Buzzer/Piepton als akustisches
  Warnsignal.") - der Hardware-Endpoint sieht NUR diesen Text plus seine
  eigene bisherige Historie, keine strukturierten Zusatzdaten.

Falls false: alle drei Felder auf null.
"""


def classify_hardware_change(hardware_components: list[dict], message: str) -> HardwareChangeClassification:
    slim_components = [
        {"id": c.get("id"), "name": c.get("name"), "role": c.get("role")}
        for c in hardware_components
    ]
    response = client.chat.completions.parse(
        model=model,
        reasoning_effort="low",
        messages=[
            {"role": "system", "content": CLASSIFIER_SYSTEM_PROMPT},
            {"role": "user", "content": (
                f"Bauteile:\n{slim_components}\n\nÄnderungswunsch:\n{message}"
            )},
        ],
        response_format=HardwareChangeClassification,
    )
    return response.choices[0].message.parsed


async def run_hardware_refinement(project_id: str, instruction: str) -> tuple[bool, dict | None]:
    """
    Ruft /hardware (franz' unveränderter Endpoint) direkt als Funktion auf,
    um die Bauteil-Auswahl gezielt zu aktualisieren.

    Rückgabe: (erfolgreich: bool, aktualisiertes hardware-Ergebnis: dict|None)
    erfolgreich=False z.B. wenn /hardware selbst einen Fehler zurückgibt
    (etwa weil doch keine concept_structure existiert) - dieser Fall wird
    hier abgefangen statt nach oben durchgereicht, damit der Circuit-
    Diagram-Endpoint in dem Fall einfach mit der bisherigen Hardware
    weiterarbeitet.
    """
    # Lokaler Import, um einen Zirkelbezug beim Modul-Laden zu vermeiden
    # (endpoints.hardware importiert selbst nichts aus circuit_diagram,
    # aber so bleibt die Abhängigkeit explizit an der Stelle sichtbar, an
    # der sie tatsächlich gebraucht wird).
    from endpoints.hardware.router import hardware as hardware_endpoint

    result = await hardware_endpoint(
        project_id=project_id,
        message=instruction,
        disable_web_search=False,
        local_search_only=True,
    )

    if not isinstance(result, dict) or "error" in result:
        return False, None

    return True, result
