"""
PLATZHALTER für den Output des /hardware-Endpoints, solange dieser noch
nicht in DIESE (colin/) FastAPI-App eingebunden ist (er existiert bereits,
aber bisher nur als separate App unter franz/ - siehe hardware_output.py).

Dieser Endpoint (/circuit-diagram) ist NICHT dafür verantwortlich, physische
Bauteile aus der Konzept-Struktur auszuwählen - das übernimmt /hardware.
Solange /hardware hier noch nicht aufrufbar ist, wird stattdessen - NUR wenn
für ein Projekt noch kein echtes "hardware"-Artefakt in der DB liegt - auf
dieses Beispiel zurückgegriffen (siehe router.py: die DB wird IMMER zuerst
gefragt, das hier ist nur der Fallback).

Anders als frühere Versionen dieser Datei ist DUMMY_HARDWARE_SELECTION jetzt
NICHT mehr frei erfunden, sondern aus einer ECHTEN Beispiel-Antwort von
/hardware abgeleitet (hardware_output.py) - über denselben
normalize_hardware_output()-Adapter, der auch für ein spaeteres echtes
Artefakt aus der DB verwendet wird (siehe router.py). So testet dieser
Fallback exakt denselben Code-Pfad wie die echten Daten es später tun.
"""

from .hardware_output import EXAMPLE_HARDWARE_OUTPUT
from .hardware_adapter import normalize_hardware_output

DUMMY_HARDWARE_SELECTION = normalize_hardware_output(EXAMPLE_HARDWARE_OUTPUT)
