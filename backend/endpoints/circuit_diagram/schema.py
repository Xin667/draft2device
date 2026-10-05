"""
Pydantic-Schema für den /circuit-diagram Endpoint.

Anders als bei /analyze (schema.py dort ist ein reines dict-JSON-Schema)
definieren wir das Ergebnis hier als Pydantic-Modelle. Das hat zwei Vorteile:

1. Wir übergeben das Modell direkt an client.chat.completions.parse(...)
   (response_format=CircuitDiagram) - die OpenAI-Bibliothek erzeugt daraus
   automatisch ein striktes JSON-Schema UND validiert/parsed die Antwort
   direkt in eine CircuitDiagram-Instanz zurück.

2. Über FastAPI's response_model=CircuitDiagramResponse (siehe router.py)
   taucht die exakte Struktur automatisch und lesbar in der Swagger-Doku
   (http://127.0.0.1:8000/docs) auf - darauf kann sich das Frontend-Team
   verlassen, ohne den Prompt oder Code lesen zu müssen.
"""

from enum import Enum
from typing import Any
from pydantic import BaseModel, Field


class SignalType(str, Enum):
    # Bestimmt u.a. die empfohlene Kabelfarbe und wie ein Pin im Frontend
    # eingefärbt/beschriftet werden kann.
    POWER = "power"
    GROUND = "ground"
    DIGITAL = "digital"
    ANALOG = "analog"
    PWM = "pwm"
    I2C = "i2c"
    SPI = "spi"
    UART = "uart"
    OTHER = "other"


class ComponentCategory(str, Enum):
    MICROCONTROLLER = "Microcontroller"
    SENSOR = "Sensor"
    ACTUATOR = "Actuator"
    POWER_SUPPLY = "Power Supply"
    PASSIVE_COMPONENT = "Passive Component"
    OTHER = "Other"


class WireColor(str, Enum):
    # Bewusst ein FESTES Set aus gültigen CSS-Farbnamen (nicht freier Text
    # wie "Rot"/"Schwarz") - so kann das Frontend den Wert direkt 1:1 als
    # Farbe verwenden (z.B. als CSS "color"/"stroke"), ohne selbst erst
    # deutsche Farbnamen übersetzen zu müssen.
    RED = "red"
    BLACK = "black"
    BLUE = "blue"
    YELLOW = "yellow"
    GREEN = "green"
    ORANGE = "orange"
    PURPLE = "purple"
    BROWN = "brown"
    GRAY = "gray"
    WHITE = "white"


class ComponentPin(BaseModel):
    # id zum Referenzieren aus "connections" heraus, z.B. "pin_arduino_d4"
    id: str
    # Kurzes, auf dem echten Bauteil aufgedrucktes Label, z.B. "D4", "VCC", "A0"
    label: str
    signal_type: SignalType
    # Für Einsteiger: was macht dieser Pin, wofür wird er hier gebraucht?
    description: str


class CircuitComponent(BaseModel):
    # id MUSS der id aus der Bauteil-Liste des Hardware-Endpoints entsprechen
    # (siehe dummy_data.py), damit beide Endpunkte über dieselben ids
    # referenzierbar bleiben.
    id: str
    name: str
    category: ComponentCategory
    # Für Einsteiger: welche Rolle spielt dieses Bauteil im Gesamtsystem?
    description: str
    pins: list[ComponentPin]


class Connection(BaseModel):
    id: str
    from_component_id: str
    from_pin_id: str
    to_component_id: str
    to_pin_id: str
    signal_type: SignalType
    # Feste Kabelfarbe aus WireColor (z.B. RED = Plus/Power, BLACK = Minus/
    # Ground) - direkt als CSS-Farbe im Frontend nutzbar.
    wire_color: WireColor
    # Für Einsteiger: WAS wird hier verbunden und WOZU/WARUM.
    description: str


class AssemblyStep(BaseModel):
    step_number: int
    # Eine einzelne, klar verständliche Anleitungs-Anweisung
    # (z.B. "Verbinde GND des Sensors mit GND des Arduino.")
    instruction: str
    # Welche der oben definierten "connections" werden durch diesen
    # Schritt hergestellt? Ermöglicht dem Frontend, im Diagramm genau
    # diese Kabel hervorzuheben, während der Nutzer den Schritt liest.
    connection_ids: list[str]


class PowerRequirement(BaseModel):
    component_id: str
    voltage: str
    note: str


class CircuitDiagram(BaseModel):
    title: str
    # 1-2 Sätze: was wird hier aufgebaut, in einfacher Sprache
    summary: str
    components: list[CircuitComponent]
    connections: list[Connection]
    # Eine sinnvolle Reihenfolge (z.B. erst Stromversorgung, dann Sensoren,
    # dann Aktoren), damit auch Einsteiger:innen Schritt für Schritt
    # nachbauen können, ohne den ganzen Schaltplan auf einmal zu verstehen.
    assembly_steps: list[AssemblyStep]
    power_requirements: list[PowerRequirement]
    # Warnhinweise, z.B. Spannungs-/Stromgrenzen, ESD, Verpolungsschutz
    safety_notes: list[str]


class CircuitDiagramResponse(CircuitDiagram):
    # Nur für die HTTP-Antwort: hängt die project_id mit an, analog zu den
    # anderen Endpoints ({"project_id": ..., **result}).
    project_id: str = Field(...)
    # Solange /hardware für dieses Projekt kein eigenes "hardware"-Artefakt
    # gespeichert hat (oder /hardware hier noch nicht eingebunden ist),
    # greift dieser Endpoint auf ein festes Beispiel zurück (siehe
    # dummy_data.py). Dieses Flag macht für das Frontend sichtbar, ob GERADE
    # mit echten oder mit Platzhalter-Bauteilen gearbeitet wurde.
    used_dummy_hardware_input: bool = Field(...)
    # Die bereits NORMALISIERTE (flache) Bauteile-Liste, die tatsächlich als
    # Input an das Modell gegangen ist (siehe hardware_adapter.
    # normalize_hardware_output()) - wird hier nur zum Echo an den Client
    # zurückgegeben, damit sich Input und Output im Viewer nebeneinander
    # vergleichen lassen. Typ bewusst offen (Any) statt eines eigenen Pydantic-
    # Modells, damit sich diese interne Zwischenform noch anpassen lässt,
    # ohne das öffentliche Response-Schema zu brechen.
    hardware_components_input: Any = Field(...)
    # True, wenn eine per "message" mitgeschickte Änderungsanfrage (siehe
    # refinement.py) tatsächlich bis zur Bauteil-Auswahl zurückgewirkt und
    # dort ein neues "hardware"-Artefakt erzeugt hat - damit im Frontend
    # sichtbar ist, ob die Änderung "rückläufig" bis zur Hardware-Auswahl
    # durchgereicht wurde, statt nur eine reine Verkabelungs-Änderung zu sein.
    hardware_updated: bool = Field(default=False)


class HardwareChangeClassification(BaseModel):
    # Ergebnis des kleinen, günstigen Klassifizierungs-Calls in refinement.py:
    # entscheidet, ob eine Änderungsanfrage am Schaltplan tatsächlich einen
    # ANDEREN physischen Bauteil-Typ für einen bestehenden hardware_components-
    # /controllers-Eintrag braucht (z.B. "LED -> Buzzer"), oder ob es sich um
    # eine reine Verkabelungs-/Pin-Frage handelt, die das bestehende Bauteil
    # nicht verändert.
    requires_hardware_change: bool
    # Die "id" aus der aktuellen (flachen) Bauteile-Liste, die betroffen ist -
    # null, falls requires_hardware_change False ist ODER sich keine
    # eindeutige bestehende Komponente zuordnen lässt.
    target_component_id: str | None
    # Nur zur besseren Nachvollziehbarkeit/Fehlersuche - der Klartext-Name
    # der betroffenen Komponente, falls bekannt.
    target_component_name: str | None
    # Eine eigenständige, eindeutige Anweisung für den Hardware-Endpoint
    # (siehe run_hardware_refinement in refinement.py) - MUSS die betroffene
    # Komponente explizit benennen (id und/oder Name), weil /hardware selbst
    # keine strukturierte "welche Komponente"-Eingabe kennt, sondern nur
    # freien Text + seine eigene bisherige Chat-Historie sieht. null, falls
    # requires_hardware_change False ist.
    hardware_change_instruction: str | None
