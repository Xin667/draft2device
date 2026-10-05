"""
Pydantic-Schema für den /code Endpoint.

Gleiches Muster wie franz/endpoints/circuit_diagram/schema.py: Pydantic-
Modelle statt eines rohen dict-JSON-Schemas, damit sie sich direkt an
client.chat.completions.parse(...) übergeben lassen (response_format=
GeneratedCode) UND über FastAPI's response_model=GeneratedCodeResponse
automatisch lesbar in der Swagger-Doku (http://127.0.0.1:8000/docs)
auftauchen.
"""

from pydantic import BaseModel, Field
from typing import Literal


class GeneratedFile(BaseModel):
    # Pfad relativ zum Projekt-Ordner, z.B. "platformio.ini", "src/main.cpp",
    # "include/config.h". Bei MEHREREN Controllern (mehrere Komponenten mit
    # category "Microcontroller" im Schaltplan) bekommt jeder Controller
    # einen eigenen Unterordner, z.B. "sensor_node/platformio.ini" -
    # benannt nach dessen id/role aus dem Schaltplan.
    path: str
    content: str


class ConfigQuestion(BaseModel):
    # Eindeutiger Schlüssel, der im Datei-Inhalt EXAKT als Platzhalter
    # "{{KEY}}" vorkommt, z.B. "WLAN_SSID". Wird beim Beantworten (siehe
    # CodeAnswersRequest) benutzt, um die richtige Stelle im Code zu finden.
    key: str
    # Verständliche Frage an die Nutzer:in auf Deutsch, z.B.
    # "Wie lautet der Name (SSID) deines WLANs?".
    question: str
    # Vorgeschlagener Default-Wert, z.B. "MeinWLAN" - laut SYSTEM_PROMPT
    # PFLICHT (nie leer/null). Wird vom /code-Endpoint automatisch anstelle
    # des Platzhalters eingesetzt, solange die Nutzer:in die Frage nicht
    # explizit beantwortet hat (siehe router.py: _resolve_effective_answers),
    # damit der Code auch ohne jede Konfiguration sofort lauffähig ist.
    # Bleibt trotzdem "str | None", falls ein älteres/fehlerhaftes Ergebnis
    # doch keinen Wert enthält.
    example: str | None = None
    # Wie soll diese Frage im Frontend dargestellt/bearbeitet werden?
    # "text"          -> normales Freitext-Eingabefeld.
    # "slider"        -> Zahlen-Schieberegler, siehe min/max unten.
    # "single_choice" -> Auswahl aus einer festen Liste, siehe options unten.
    input_type: Literal["text", "slider", "single_choice"]
    # NUR bei input_type == "slider" gesetzt: unterer/oberer erlaubter Wert
    # des Schiebereglers (z.B. 0 und 100 für einen Feuchtigkeits-
    # Schwellenwert in %). Sonst null.
    min: float | None = None
    max: float | None = None
    # NUR bei input_type == "single_choice" gesetzt: die zur Auswahl
    # stehenden Werte, z.B. ["Celsius", "Fahrenheit"] - "example" oben
    # enthält dann exakt einen dieser Werte als vorausgewählten Default.
    # Sonst null.
    options: list[str] | None = None


class GeneratedCode(BaseModel):
    files: list[GeneratedFile]
    # Alle Werte, die technisch NICHT aus Schaltplan/concept_structure
    # ableitbar sind (WLAN-Zugangsdaten, Server-Adressen, Schwellenwerte,
    # ...) und die die Nutzer:in gezielt beantworten kann/muss, damit der
    # Code läuft. Jeder "key" hier entspricht genau einem "{{KEY}}"-
    # Platzhalter irgendwo in "files".
    config_questions: list[ConfigQuestion] = Field(default_factory=list)


class GeneratedCodeResponse(GeneratedCode):
    # Nur für die HTTP-Antwort: hängt die project_id mit an, analog zu den
    # anderen Endpoints ({"project_id": ..., **result}).
    project_id: str = Field(...)


class CodeAnswersRequest(BaseModel):
    # Antworten auf (einen Teil der) config_questions: key -> Antworttext.
    # Muss nicht vollständig sein - unbeantwortete Platzhalter bleiben im
    # Code stehen und können mit einem späteren Aufruf nachgereicht werden.
    answers: dict[str, str]


class FilledCodeResponse(GeneratedCode):
    project_id: str = Field(...)
    # Die Teilmenge von config_questions, deren Platzhalter im Code NACH
    # dem Einsetzen der Antworten noch immer offen ist (falls "answers"
    # nicht alle Fragen abgedeckt hat).
    unanswered: list[ConfigQuestion] = Field(default_factory=list)
