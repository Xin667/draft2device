"""
Gemeinsame Konfiguration, die von mehreren Endpoints genutzt wird
(aktuell /analyze, später z.B. auch der Hardware-Endpoint).

Wird hier zentral an EINER Stelle definiert, damit nicht jeder Endpoint
seinen eigenen OpenAI-Client oder eigene grundsätzliche Verhaltens-Schalter
separat definiert.

WICHTIG: Was hier NICHT reingehört, ist alles, was nur zu EINEM bestimmten
Endpoint gehört (z.B. das JSON-Schema oder der Systemprompt für /analyze) -
das liegt stattdessen im jeweiligen Ordner unter endpoints/<name>/.
"""

import os
from pathlib import Path

from openai import OpenAI

try:
    from dotenv import load_dotenv
except ImportError:
    # python-dotenv ist optional - ohne das Paket muss OPENAI_API_KEY direkt
    # in der Umgebung gesetzt sein.
    load_dotenv = None

if load_dotenv is not None:
    # .env liegt neben dieser Datei (backend/.env) und wird NICHT
    # eingecheckt - Vorlage siehe backend/.env.example.
    load_dotenv(Path(__file__).with_name(".env"))


def _load_api_key() -> str:
    """
    Holt den OpenAI-Key, bevorzugt aus der Umgebungsvariable OPENAI_API_KEY
    (gesetzt per backend/.env oder direkt in der Shell).

    Als Bequemlichkeits-Fallback für die lokale Entwicklung dient eine
    Datei key.py neben dieser Datei - die liegt bewusst NICHT im Repository
    (siehe .gitignore), damit kein Secret in die Versionsverwaltung gerät.
    """
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if key:
        return key

    try:
        from key import API_KEY as file_key
    except ImportError:
        return ""

    return file_key.strip()


API_KEY = _load_api_key()

if not API_KEY:
    raise RuntimeError(
        "Kein OpenAI-API-Key gefunden. Entweder backend/.env anlegen "
        "(Vorlage: backend/.env.example) oder die Umgebungsvariable "
        "OPENAI_API_KEY setzen."
    )

client = OpenAI(api_key=API_KEY)

# Der Modellname, der bei jedem Aufruf genutzt wird - an EINER Stelle
# änderbar, statt in jedem Endpoint einzeln.
model = "gpt-5.4-mini"

# ---------------------------------------------------------------------
# SCHALTER: Sollen bei JEDEM Modell-Aufruf ALLE bisher hochgeladenen Bilder
# des Projekts erneut mitgeschickt werden (True), oder nur das Bild, das
# GENAU JETZT (in diesem Request) neu hochgeladen wurde (False)?
#
# Das ist ein GRUNDSÄTZLICHES Verhalten (nicht spezifisch für /analyze) -
# falls später weitere Endpoints ebenfalls mit Bildern arbeiten, gilt
# derselbe Schalter für alle.
#
# False (günstiger): Ältere Bilder werden dem Modell nur einmal gezeigt,
#   direkt beim Upload. Spätere Rückfragen wie "schau nochmal ins Bild"
#   funktionieren dann nicht mehr zuverlässig, sparen aber Tokens/Kosten.
# True (teurer, mehr Kontext): Bei jedem einzelnen Refinement-Schritt werden
#   ALLE bisherigen Bilder des Projekts erneut an das Modell geschickt -
#   Kosten wachsen mit (Anzahl Bilder x Anzahl weiterer Chat-Runden).
# ---------------------------------------------------------------------
RESEND_ALL_IMAGES_EVERY_REQUEST = False
