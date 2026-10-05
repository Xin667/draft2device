schema2 = {
    "type": "object",
    "properties": {
        # ---------------- HARDWARE-KOMPONENTEN ----------------
        "hardware_components": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    # id zum Referenzieren dieser benötigten Komponente, z.B. "component_feuchtigkeitssensor"
                    "id": {"type": "string"},
                    # Was wird hier gebraucht, z.B. "Feuchtigkeitssensor"
                    "component_name": {"type": "string"},
                    # Rückbezug: welcher sensor/actuator aus dem /analyze-Schema wird hiermit
                    # umgesetzt (id aus "sensors" bzw. "actuators"). Jede Komponente MUSS einem
                    # konkreten Sensor/Aktor entsprechen - keine allgemeinen Zusatzteile
                    # (Board, Kabel, Widerstände etc.) in dieser Liste.
                    "concept_ref_id": {"type": "string"},
                    # Mögliche Optionen für diese Komponente. Falls es keine Alternativen gibt,
                    # enthält die Liste nur genau einen Eintrag.
                    "options": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                # id zum Referenzieren dieser konkreten Option, z.B. "option_dht22"
                                "id": {"type": "string"},
                                "name": {"type": "string"},
                                # Physische Schnittstelle, z.B. "I2C", "SPI", "GPIO" etc.
                                "interface": {"type": "string"},
                                # Genau 3 Stichpunkte: Vor-/Nachteile dieser Option gegenüber den anderen Optionen
                                "pros_cons": {
                                    "type": "array",
                                    "items": {"type": "string"}
                                },
                                # Freitext, damit geschätzt werden kann bsp.: 5-10€
                                "cost": {"type": "string"},
                                # Wo man das Bauteil wahrscheinlich bekommt, z.B. "Amazon, Reichelt, lokaler Elektronikladen"
                                "availability": {"type": "string"},
                                # Link zu Produktseite/Datenblatt, falls dem Modell einer bekannt ist
                                "product_link": {"type": ["string", "null"]},
                                # Betriebsspannung, z.B. "3.3V - 5V"
                                "voltage": {"type": "string"},
                                # Stromaufnahme, z.B. "typ. 15mA (aktiv), 2µA (Standby)"
                                "current": {"type": "string"},
                                # Physischer Anschluss/Pinbelegung, z.B. "4-Pin Header: VCC, GND, SDA, SCL"
                                "connector": {"type": "string"},
                                # Abmessungen, falls bekannt/relevant - sonst null
                                "dimensions": {"type": ["string", "null"]},
                                # Auflösung, falls relevant (v.a. Displays/Kameras) - sonst null
                                "resolution": {"type": ["string", "null"]},
                                # Mess-/Wertebereich, falls relevant (v.a. Sensoren) - sonst null
                                "measurement_range": {"type": ["string", "null"]},
                                # Betriebstemperaturbereich, falls bekannt/relevant - sonst null
                                "operating_temp": {"type": ["string", "null"]},
                                # NUR für Ausnahmefälle: ein wirklich wichtiger technischer Fakt,
                                # der in keines der obigen Felder passt (z.B. Wasserdichtigkeit,
                                # benötigte Zusatzbeschaltung). Bei allen normalen Optionen null -
                                # NICHT für unwichtige/beliebige Zusatzinfos verwenden.
                                "additional_notes": {"type": ["string", "null"]},
                                # true = das ist die vom Modell empfohlene Option für diese Komponente.
                                # Nur eine Option pro Komponente darf hier true haben.
                                #Koennten wir auch manuell ändern lassen in einem Auswahltool
                                "selected": {"type": "boolean"}
                            },
                            "required": [
                                "id", "name", "interface", "pros_cons", "cost", "availability",
                                "product_link", "voltage", "current", "connector", "dimensions",
                                "resolution", "measurement_range", "operating_temp",
                                "additional_notes", "selected"
                            ],
                            "additionalProperties": False
                        }
                    }
                },
                "required": ["id", "component_name", "concept_ref_id", "options"],
                "additionalProperties": False
            }
        },
        # ---------------- CONTROLLER (Chip-/Board-Auswahl) ----------------
        "controllers": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    # id zum Referenzieren dieses Controllers, z.B. "controller_main"
                    "id": {"type": "string"},
                    # Rolle/Standort dieses Controllers im Gesamtsystem, z.B.
                    # "Einziger Controller des Projekts" oder bei mehreren Knoten
                    # z.B. "Sensor-Knoten im Gewächshaus, sendet per WiFi"
                    "role": {"type": "string"},
                    # ids aus hardware_components, die DIESER Controller anschließen
                    # und betreiben muss. Über alle Controller hinweg muss jede
                    # hardware_component genau einmal vorkommen.
                    "connected_component_ids": {
                        "type": "array",
                        "items": {"type": "string"}
                    },
                    # Chip-/Board-Alternativen für DIESEN Controller.
                    "options": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                # id zum Referenzieren dieser konkreten Option, z.B. "option_esp32_wroom32"
                                "id": {"type": "string"},
                                "name": {"type": "string"},
                                # Genau 3 Stichpunkte: Vor-/Nachteile ggü. anderen Chip-Optionen desselben Controllers
                                "pros_cons": {
                                    "type": "array",
                                    "items": {"type": "string"}
                                },
                                "cost": {"type": "string"},
                                "availability": {"type": "string"},
                                "product_link": {"type": ["string", "null"]},
                                # Versorgungsspannung + Logikpegel, z.B. "Versorgung 5V via USB/VIN, Logikpegel 3.3V"
                                "voltage": {"type": "string"},
                                # Typische Stromaufnahme des Boards selbst
                                "current": {"type": "string"},
                                # Auf dem Board verfügbare Schnittstellen, z.B. ["I2C", "SPI", "UART", "GPIO (digital)", "ADC"]
                                "supported_interfaces": {
                                    "type": "array",
                                    "items": {"type": "string"}
                                },
                                # Funkschnittstellen, z.B. "WiFi 802.11 b/g/n, Bluetooth 5.0 (BLE)" - sonst null
                                "wireless_connectivity": {"type": ["string", "null"]},
                                # Anzahl nutzbarer GPIOs, falls bekannt/relevant - sonst null
                                "gpio_count": {"type": ["string", "null"]},
                                "dimensions": {"type": ["string", "null"]},
                                "operating_temp": {"type": ["string", "null"]},
                                # Konkrete Begründung, warum dieser Chip zu ALLEN via
                                # connected_component_ids zugeordneten Komponenten passt
                                # (Schnittstellen, GPIO-Anzahl, Spannung, ggf. Funk zur Gegenstelle).
                                "compatibility_notes": {"type": "string"},
                                # NUR für Ausnahmefälle, siehe gleichnamiges Feld bei hardware_components-Optionen
                                "additional_notes": {"type": ["string", "null"]},
                                # true = empfohlene Chip-Option für diesen Controller. Nur eine pro Controller.
                                "selected": {"type": "boolean"}
                            },
                            "required": [
                                "id", "name", "pros_cons", "cost", "availability", "product_link",
                                "voltage", "current", "supported_interfaces", "wireless_connectivity",
                                "gpio_count", "dimensions", "operating_temp", "compatibility_notes",
                                "additional_notes", "selected"
                            ],
                            "additionalProperties": False
                        }
                    }
                },
                "required": ["id", "role", "connected_component_ids", "options"],
                "additionalProperties": False
            }
        }
    },
    "required": ["hardware_components", "controllers"],
    "additionalProperties": False
}
