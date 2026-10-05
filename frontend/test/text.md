# Test-Fixtures für /analyze

## 1. Nur Text (kein Bild)

Kurzer Input:
```
Ich brauche einen Sensor für meine Pflanze.
```

Ausführlicher Input, um eine vollständige Struktur zu bekommen:
```
Ich möchte einen Blumentopf bauen, der sich meldet, wenn er durstig ist.
Ein Feuchtigkeitssensor misst die Erde. Wenn sie zu trocken wird, blinkt
eine LED rot und der Topf gibt alle 30 Sekunden ein leises Jammergeräusch
von sich. Sobald jemand gießt, soll die LED fünfmal grün blinken und ein
fröhlicher Sound abgespielt werden. Danach ist der Topf wieder zufrieden.
```

## 2. Bild + Text (storyboard_sketch.png)

Das Bild zeigt: einen traurigen Blumentopf, Pfeil "trockene Erde" → LED
(rot blinkend) mit Sprechblase "ich hab Durst", zweiten Pfeil "wenn
gegossen wird", einen Besucher als Strichmännchen, und eine Randnotiz
"grün blinken + fröhlicher Sound, nicht nervig!".

Passender Text-Prompt dazu (testet, ob das Modell Bild und Text
zusammenführt, nicht nur eins von beiden liest):
```
Hier ist meine Skizze aus dem Brainstorming. Der Besucher soll das
Gefühl haben, dass die Pflanze wirklich mit ihm kommuniziert.
```

Guter Test für Widerspruch/Ergänzung: Text, der dem Bild bewusst
widerspricht, um zu sehen ob das als open_question auftaucht:
```
Genau wie in der Skizze, aber das Jammern soll erst nach 2 Minuten
Trockenheit anfangen, nicht sofort.
```

## 3. Mehrere Runden (Refinement testen)

1. Runde 1 mit dem ausführlichen Text oben aufrufen → project_id merken
2. Antwort auf eine offene Frage als neuer `message` an /analyze schicken,
   z.B.:
   ```
   Zur Frage nach dem Schwellenwert: ab 30% Feuchtigkeit gilt sie als durstig.
   ```
3. Prüfen: bleibt der Rest der Struktur (Metadaten, andere Sensoren)
   identisch, oder hat sich etwas unerwartet mitverändert? — das ist der
   Drift-Test aus Punkt D der Checkliste.

## curl-Beispiel (FormData, kein JSON!)

```bash
# Projekt anlegen
curl -X POST http://localhost:8000/projects

# Analyse mit Bild
curl -X POST http://localhost:8000/analyze \
  -F "project_id=<hier einfügen>" \
  -F "message=Hier ist meine Skizze aus dem Brainstorming..." \
  -F "image=@storyboard_sketch.png"
```
