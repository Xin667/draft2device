"""
Router für den /api/glossary Endpoint.

Eigenständiger Hilfs-Endpoint: braucht keine project_id und schreibt nichts in
die Datenbank. Er bekommt einen Textabschnitt aus der Oberfläche und gibt die
darin enthaltenen Hardware-/IoT-Fachbegriffe mit je einer kurzen Erklärung
zurück. Das Frontend nutzt das für die Tooltip-Erklärungen im Glossar (siehe
frontend/src/lib/ai-glossary.ts und frontend/src/api/api.ts).

Herkunft: übernommen aus dem früheren v2-Backend (Branch "backup"), angepasst
an unsere gemeinsame Konfiguration. Der OpenAI-Client und der Modellname kommen
jetzt aus config.py statt aus einer eigenen Client-Instanz im Modul. Das
frühere "temperature=0.1" ist dabei entfallen - unser Modell ist ein
Reasoning-Modell, und die übrigen Endpoints senden ebenfalls keinen
temperature-Parameter.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from config import client, model

import json

router = APIRouter(prefix="/api/glossary", tags=["Glossary"])


class TextAnalysisRequest(BaseModel):
    text: str


@router.post("/extract-and-explain")
def extract_and_explain_iot_terms(req: TextAnalysisRequest):
    # Bei zu kurzen Texten lohnt kein Modell-Aufruf.
    if not req.text or len(req.text.strip()) < 3:
        return {"terms": []}

    prompt = f"""
Analysiere folgenden Text aus einer Hardware-/IoT-Projektansicht:
"{req.text}"

AUFGABE:
Finde ALLE Fachbegriffe, Bauteilnamen, Pin-Bezeichnungen und Protokolle aus den Bereichen Elektronik, Hardware, Sensorik und IoT.
Beispiele für Begriffe, die du finden sollst:
- Pins/Versorgung: VCC, GND, AO, Signal, 3.3V - 5.5V, Logikpegel, Pegel
- Bauformen/Schnittstellen: Grove, Grove 4-Pin, Header, Analog, Analog-Eingang, Port, Port: Analog
- Sensortypen/Mechanik: kapazitiv, Bodenfeuchtesensor, korrosionsbeständig, Widerstandsfühler, Metallsonden, Messprinzip, SEN0193
- Chips & Funk: ESP32, Pico, GPIO, ADC, PWM, WiFi, Bluetooth, BLE

REGELN:
- Ignoriere nur reine Füllwörter und Allgemeinbegriffe (z. B. "sehr", "gut", "einfache", "Wahl", "Schritt").
- Gib für JEDEN gefundenen Begriff eine einfache, kurze Erklärung (1 prägnanter Satz).
- Gib immer gültiges JSON mit dem Root-Key "terms" zurück.
"""

    try:
        response = client.chat.completions.create(
            model=model,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Du bist ein technischer Glossar-Extraktor. "
                        "Antworte ausschließlich im JSON-Format: "
                        "{\"terms\": [{\"term\": \"exakter Begriff aus dem Text\", \"explanation\": \"kurze Erklärung\", \"category\": \"Elektronik/Sensorik/Hardware\"}]}"
                    )
                },
                {"role": "user", "content": prompt}
            ]
        )

        data = json.loads(response.choices[0].message.content)
        return data
    except Exception as e:
        # Das Glossar ist eine Zusatzfunktion: Wenn der Aufruf scheitert, darf
        # das die Oberfläche nicht stören. Das Frontend hat ohnehin einen
        # Fallback auf sein statisches Glossar (siehe glossary-match.ts).
        print(f"Fehler bei KI-Glossar Backend: {e}")
        return {"terms": []}
