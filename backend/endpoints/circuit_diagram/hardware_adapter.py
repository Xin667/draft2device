"""
Wandelt das REICHHALTIGE Rohergebnis des /hardware-Endpoints (siehe
franz/endpoints/hardware/schema.py: "hardware_components" und "controllers",
jeweils mit MEHREREN "options" - Alternativen -, von denen genau eine
"selected": true ist) in die FLACHE Bauteilliste um, die /circuit-diagram
als Input erwartet (id, name, category, role, linked_concept_ids, specs -
dieselbe Form wie die alte, frei erfundene DUMMY_HARDWARE_SELECTION).

WOZU eine eigene Umwandlung statt die Rohstruktur direkt ans Modell zu
schicken:
- Garantiert deterministisch (in Python, nicht vom Modell interpretiert),
  dass NUR die tatsaechlich gewaehlte ("selected": true) Option verwendet
  wird - nie versehentlich eine verworfene Alternative.
- Filtert Felder raus, die fuer die Verkabelung irrelevant sind (Kosten,
  Bezugsquellen, Produktlinks, Vor-/Nachteile) und reduziert so Tokens.
- Haelt prompt.py stabil: der Systemprompt beschreibt weiterhin dieselbe
  einfache Eingabe-Form, unabhaengig davon, ob die Daten von der (noch nicht
  eingebundenen) echten /hardware-Route oder vom Dummy-Fallback kommen.
"""

# "sensors"/"actuators" aus /analyze werden dort IMMER mit diesem Praefix
# benannt (siehe endpoints/analyze/prompt.py: "sensor_<kurzbeschreibung>" /
# "actuator_<kurzbeschreibung>") - /hardware uebernimmt diese id 1:1 als
# "concept_ref_id" (siehe franz/endpoints/hardware/schema.py), daher laesst
# sich die Kategorie zuverlaessig darüber ableiten.
_CATEGORY_PREFIXES = {
    "sensor_": "Sensor",
    "actuator_": "Actuator",
}


def _infer_category(concept_ref_id: str | None) -> str:
    for prefix, category in _CATEGORY_PREFIXES.items():
        if concept_ref_id and concept_ref_id.startswith(prefix):
            return category
    return "Other"


def _selected_option(options: list[dict]) -> dict | None:
    # Erwartungsgemaess hat GENAU eine Option "selected": true (siehe
    # franz/endpoints/hardware/schema.py) - falls das (z.B. bei fehlerhaft
    # von Hand editierten Artefakten) doch nicht der Fall sein sollte, wird
    # ersatzweise einfach die erste Option verwendet, statt komplett
    # abzubrechen.
    for option in options:
        if option.get("selected"):
            return option
    return options[0] if options else None


def _clean_specs(specs: dict) -> dict:
    # Leere/nicht angegebene Werte (None, "", []) rausfiltern, damit das
    # Prompt-Payload nicht mit "null"-Feldern aufgeblaeht wird.
    return {key: value for key, value in specs.items() if value not in (None, "", [])}


def normalize_hardware_output(raw: dict) -> list[dict]:
    """
    raw: das Ergebnis von POST /hardware bzw. das unter dem Artefakt-Typ
         "hardware" gespeicherte Artefakt (siehe franz/endpoints/hardware/
         router.py) - {"hardware_components": [...], "controllers": [...]}.

    Rueckgabe: flache Liste, kompatibel zur alten DUMMY_HARDWARE_SELECTION-
    Form - [{"id", "name", "category", "role", "linked_concept_ids", "specs"}, ...].
    """
    components: list[dict] = []

    for entry in raw.get("hardware_components", []):
        option = _selected_option(entry.get("options", []))
        if option is None:
            continue
        concept_ref_id = entry.get("concept_ref_id")
        components.append({
            "id": entry["id"],
            "name": option.get("name", entry.get("component_name", entry["id"])),
            "category": _infer_category(concept_ref_id),
            "role": entry.get("component_name", option.get("name", "")),
            "linked_concept_ids": [concept_ref_id] if concept_ref_id else [],
            "specs": _clean_specs({
                "interface": option.get("interface"),
                # Physischer Anschluss/Pinbelegung, z.B. "3-Pin: VCC, GND, AOUT" -
                # der wichtigste Hinweis fuer eine korrekte Pin-Anzahl/-Zuordnung.
                "connector": option.get("connector"),
                "voltage": option.get("voltage"),
                "current": option.get("current"),
                "dimensions": option.get("dimensions"),
                "resolution": option.get("resolution"),
                "measurement_range": option.get("measurement_range"),
                "operating_temp": option.get("operating_temp"),
                "additional_notes": option.get("additional_notes"),
            }),
        })

    for entry in raw.get("controllers", []):
        option = _selected_option(entry.get("options", []))
        if option is None:
            continue
        components.append({
            "id": entry["id"],
            "name": option.get("name", entry["id"]),
            "category": "Microcontroller",
            "role": entry.get("role", option.get("name", "")),
            "linked_concept_ids": [],
            "specs": _clean_specs({
                "voltage": option.get("voltage"),
                "current": option.get("current"),
                "supported_interfaces": option.get("supported_interfaces"),
                "wireless_connectivity": option.get("wireless_connectivity"),
                "gpio_count": option.get("gpio_count"),
                "dimensions": option.get("dimensions"),
                "operating_temp": option.get("operating_temp"),
                # Enthaelt oft SICHERHEITSKRITISCHE Hinweise (z.B. "ESP32-ADC
                # vertraegt nur 3.3V") - bewusst NICHT weggefiltert, das soll
                # im generierten Schaltplan als safety_note landen koennen.
                "compatibility_notes": option.get("compatibility_notes"),
                "additional_notes": option.get("additional_notes"),
                # Welche hardware_components DIESER Controller anschliessen
                # muss - v.a. bei mehreren Controllern/Knoten relevant, damit
                # das Modell keine Kabel zwischen getrennten physischen
                # Knoten einzeichnet.
                "connects_to_component_ids": entry.get("connected_component_ids"),
            }),
        })

    return components
