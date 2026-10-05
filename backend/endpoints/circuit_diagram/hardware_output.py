"""
Echtes Beispiel-Ergebnis des /hardware-Endpoints (siehe franz/endpoints/
hardware/schema.py fuer das exakte Schema, franz/endpoints/hardware/
router.py fuer den Endpoint selbst).

Dieses Projekt besteht (noch) aus mehreren GETRENNTEN FastAPI-Apps pro
Teammitglied (colin/, franz/, julian/, tom/) - der /hardware-Endpoint ist
bisher NUR in franz/ gebaut und noch nicht in DIESE (colin/) App eingebunden.
Damit /circuit-diagram trotzdem schon gegen die ECHTE Form des Hardware-
Endpoint-Ergebnisses entwickelt/getestet werden kann (statt gegen eine frei
erfundene, siehe alte dummy_data.py), liegt hier eine vom Team eingefuegte,
tatsaechlich vom Modell erzeugte Beispiel-Antwort.

WICHTIG zur Form: /hardware liefert je Bauteil/Controller MEHRERE moegliche
Optionen (Alternativen), von denen genau eine "selected": true ist (per
Default die vom Modell empfohlene, kann aber ueber POST /hardware/select
nachtraeglich manuell umgeschaltet werden). /circuit-diagram braucht daraus
nur die JEWEILS gewaehlte Option pro Bauteil/Controller - siehe
hardware_adapter.normalize_hardware_output(), die genau das herauszieht und
in die flache Form umwandelt, die dieser Endpoint fuer sein Prompt braucht.

Hinweis: Das echte, in der DB gespeicherte Artefakt (db.save_artifact(
project_id, "hardware", result) in franz/endpoints/hardware/router.py)
enthaelt KEIN eigenes "project_id"-Feld (das Schema erlaubt nur
"hardware_components" + "controllers", additionalProperties=False) - das
war nur im urspruenglich kopierten HTTP-Response-Body enthalten und wurde
hier deshalb entfernt.
"""

EXAMPLE_HARDWARE_OUTPUT = {'hardware_components': [{'id': 'component_bodenfeuchtesensor_trocken',
                          'component_name': 'Bodenfeuchtesensor',
                          'concept_ref_id': 'sensor_erde_trocken',
                          'options': [{'id': 'option_bodenfeuchtesensor_trocken_dfrobot',
                                       'name': 'DFRobot Gravity: Capacitive Soil Moisture Sensor '
                                               'v1.2',
                                       'interface': 'Analog',
                                       'pros_cons': ['Korrosionsarm durch kapazitives Messprinzip',
                                                     'Einfach an analoge MCU-Eingänge anschließbar',
                                                     'Sehr verbreitet und gut dokumentiert'],
                                       'cost': 'ca. 8-12€',
                                       'availability': 'DFRobot, BerryBase, Reichelt, Amazon',
                                       'product_link': 'https://www.dfrobot.com/product-1385.html',
                                       'voltage': '3.3V - 5.5V',
                                       'current': 'geschätzt, wenige mA',
                                       'connector': '3-Pin: VCC, GND, AOUT',
                                       'dimensions': 'ca. 99mm x 16mm (Sensorstab, ohne Kabel)',
                                       'resolution': None,
                                       'measurement_range': 'ca. 0-100% relative Bodenfeuchte '
                                                            '(relativ, kalibrierungsabhängig)',
                                       'operating_temp': 'geschätzt, -20°C bis 85°C',
                                       'additional_notes': 'Analogausgang liegt typischerweise '
                                                           'deutlich unter 3.3V und ist damit für '
                                                           '3.3V-MCUs gut geeignet.',
                                       'selected': True},
                                      {'id': 'option_bodenfeuchtesensor_trocken_generic',
                                       'name': 'Kapazitiver Bodenfeuchtesensor v1.2',
                                       'interface': 'Analog',
                                       'pros_cons': ['Günstiger als Markenvarianten',
                                                     'Kapazitiv statt resistiv, daher langlebiger',
                                                     'Viele kompatible Nachbauten am Markt'],
                                       'cost': 'geschätzt, ca. 3-6€',
                                       'availability': 'AliExpress, Amazon, BerryBase, eBay',
                                       'product_link': None,
                                       'voltage': '3.3V - 5V',
                                       'current': 'geschätzt, wenige mA',
                                       'connector': '3-Pin: VCC, GND, AO',
                                       'dimensions': None,
                                       'resolution': None,
                                       'measurement_range': 'ca. 0-100% relative Bodenfeuchte '
                                                            '(relativ, kalibrierungsabhängig)',
                                       'operating_temp': None,
                                       'additional_notes': 'Qualität und Kalibrierung je nach '
                                                           'Anbieter schwankend.',
                                       'selected': False}]},
                         {'id': 'component_bodenfeuchtesensor_feucht',
                          'component_name': 'Bodenfeuchtesensor',
                          'concept_ref_id': 'sensor_erde_feucht',
                          'options': [{'id': 'option_bodenfeuchtesensor_feucht_dfrobot',
                                       'name': 'DFRobot Gravity: Capacitive Soil Moisture Sensor '
                                               'v1.2',
                                       'interface': 'Analog',
                                       'pros_cons': ['Korrosionsarm durch kapazitives Messprinzip',
                                                     'Einfach an analoge MCU-Eingänge anschließbar',
                                                     'Sehr verbreitet und gut dokumentiert'],
                                       'cost': 'ca. 8-12€',
                                       'availability': 'DFRobot, BerryBase, Reichelt, Amazon',
                                       'product_link': 'https://www.dfrobot.com/product-1385.html',
                                       'voltage': '3.3V - 5.5V',
                                       'current': 'geschätzt, wenige mA',
                                       'connector': '3-Pin: VCC, GND, AOUT',
                                       'dimensions': 'ca. 99mm x 16mm (Sensorstab, ohne Kabel)',
                                       'resolution': None,
                                       'measurement_range': 'ca. 0-100% relative Bodenfeuchte '
                                                            '(relativ, kalibrierungsabhängig)',
                                       'operating_temp': 'geschätzt, -20°C bis 85°C',
                                       'additional_notes': 'Analogausgang liegt typischerweise '
                                                           'deutlich unter 3.3V und ist damit für '
                                                           '3.3V-MCUs gut geeignet.',
                                       'selected': True},
                                      {'id': 'option_bodenfeuchtesensor_feucht_generic',
                                       'name': 'Kapazitiver Bodenfeuchtesensor v1.2',
                                       'interface': 'Analog',
                                       'pros_cons': ['Günstiger als Markenvarianten',
                                                     'Kapazitiv statt resistiv, daher langlebiger',
                                                     'Viele kompatible Nachbauten am Markt'],
                                       'cost': 'geschätzt, ca. 3-6€',
                                       'availability': 'AliExpress, Amazon, BerryBase, eBay',
                                       'product_link': None,
                                       'voltage': '3.3V - 5V',
                                       'current': 'geschätzt, wenige mA',
                                       'connector': '3-Pin: VCC, GND, AO',
                                       'dimensions': None,
                                       'resolution': None,
                                       'measurement_range': 'ca. 0-100% relative Bodenfeuchte '
                                                            '(relativ, kalibrierungsabhängig)',
                                       'operating_temp': None,
                                       'additional_notes': 'Qualität und Kalibrierung je nach '
                                                           'Anbieter schwankend.',
                                       'selected': False}]},
                         {'id': 'component_rotes_blinklicht',
                          'component_name': 'Rote LED',
                          'concept_ref_id': 'actuator_rot_blinklicht',
                          'options': [{'id': 'option_rote_led_diffused',
                                       'name': '5mm diffuse rote LED',
                                       'interface': 'GPIO (digital)',
                                       'pros_cons': ['Sehr günstig und überall erhältlich',
                                                     'Einfache Ansteuerung über GPIO mit '
                                                     'Vorwiderstand',
                                                     'Blinkeffekt leicht per Software '
                                                     'realisierbar'],
                                       'cost': 'ca. 0,05-0,30€',
                                       'availability': 'Reichelt, Conrad, Pollin, Amazon, '
                                                       'Elektronikfachhandel',
                                       'product_link': None,
                                       'voltage': 'ca. 1.8V - 2.2V',
                                       'current': 'typ. 10-20mA',
                                       'connector': '2-Pin: Anode, Kathode',
                                       'dimensions': '5mm Durchmesser',
                                       'resolution': None,
                                       'measurement_range': None,
                                       'operating_temp': None,
                                       'additional_notes': None,
                                       'selected': True},
                                      {'id': 'option_rote_led_high_brightness',
                                       'name': '5mm High-Brightness rote LED',
                                       'interface': 'GPIO (digital)',
                                       'pros_cons': ['Heller als Standard-LEDs',
                                                     'Gut sichtbar auch bei Tageslicht',
                                                     'Etwas genauer bei der '
                                                     'Vorwiderstands-Auslegung'],
                                       'cost': 'ca. 0,10-0,50€',
                                       'availability': 'Reichelt, Conrad, Pollin, Amazon',
                                       'product_link': None,
                                       'voltage': 'ca. 1.9V - 2.2V',
                                       'current': 'typ. 20mA',
                                       'connector': '2-Pin: Anode, Kathode',
                                       'dimensions': '5mm Durchmesser',
                                       'resolution': None,
                                       'measurement_range': None,
                                       'operating_temp': None,
                                       'additional_notes': None,
                                       'selected': False}]},
                         {'id': 'component_gruen_leuchten',
                          'component_name': 'Grüne LED',
                          'concept_ref_id': 'actuator_gruen_leuchten',
                          'options': [{'id': 'option_gruene_led_diffused',
                                       'name': '5mm diffuse grüne LED',
                                       'interface': 'GPIO (digital)',
                                       'pros_cons': ['Einfach und robust',
                                                     'Klarer Statusindikator für Entwarnung',
                                                     'Sehr günstig und gut verfügbar'],
                                       'cost': 'ca. 0,05-0,30€',
                                       'availability': 'Reichelt, Conrad, Pollin, Amazon, '
                                                       'Elektronikfachhandel',
                                       'product_link': None,
                                       'voltage': 'ca. 2.0V - 3.2V',
                                       'current': 'typ. 10-20mA',
                                       'connector': '2-Pin: Anode, Kathode',
                                       'dimensions': '5mm Durchmesser',
                                       'resolution': None,
                                       'measurement_range': None,
                                       'operating_temp': None,
                                       'additional_notes': None,
                                       'selected': True},
                                      {'id': 'option_gruene_led_high_brightness',
                                       'name': '5mm High-Brightness grüne LED',
                                       'interface': 'GPIO (digital)',
                                       'pros_cons': ['Hohe Leuchtkraft',
                                                     'Bei hellerer Umgebung besser sichtbar',
                                                     'Kann mit Standard-GPIO gut geschaltet '
                                                     'werden'],
                                       'cost': 'ca. 0,10-0,50€',
                                       'availability': 'Reichelt, Conrad, Pollin, Amazon',
                                       'product_link': None,
                                       'voltage': 'ca. 2.1V - 3.3V',
                                       'current': 'typ. 20mA',
                                       'connector': '2-Pin: Anode, Kathode',
                                       'dimensions': '5mm Durchmesser',
                                       'resolution': None,
                                       'measurement_range': None,
                                       'operating_temp': None,
                                       'additional_notes': None,
                                       'selected': False}]},
                         {'id': 'component_display_sprechblase',
                          'component_name': 'Display für Textausgabe',
                          'concept_ref_id': 'actuator_sprechblase',
                          'options': [{'id': 'option_display_oled_096_i2c',
                                       'name': '0,96" OLED Display SSD1306, 128x64, I2C',
                                       'interface': 'I2C',
                                       'pros_cons': ['Sehr günstig und kompakt',
                                                     "Passt gut für kurze Warntexte wie 'Durst!'",
                                                     'Breite Community-Unterstützung und viele '
                                                     'Libraries'],
                                       'cost': 'ca. 6-10€',
                                       'availability': 'Reichelt, AZ-Delivery, BerryBase, Conrad, '
                                                       'Amazon',
                                       'product_link': 'https://www.az-delivery.de/products/0-96zolldisplay',
                                       'voltage': '3.3V - 5V',
                                       'current': 'typ. wenige mA, abhängig von Helligkeit',
                                       'connector': '4-Pin: GND, VCC, SCL, SDA',
                                       'dimensions': 'ca. 27mm x 27mm',
                                       'resolution': '128 x 64 px',
                                       'measurement_range': None,
                                       'operating_temp': None,
                                       'additional_notes': None,
                                       'selected': True},
                                      {'id': 'option_display_oled_13_i2c',
                                       'name': '1,3" OLED Display SSD1306/SH1106, I2C',
                                       'interface': 'I2C',
                                       'pros_cons': ['Mehr Anzeigefläche als 0,96 Zoll',
                                                     'Besser für längere Sprechblasen-Texte',
                                                     'Etwas teurer und meist größer'],
                                       'cost': 'ca. 8-15€',
                                       'availability': 'BerryBase, Amazon, Conrad, AliExpress',
                                       'product_link': None,
                                       'voltage': '3.3V - 5V',
                                       'current': 'typ. wenige mA',
                                       'connector': '4-Pin: GND, VCC, SCL, SDA',
                                       'dimensions': None,
                                       'resolution': 'typ. 128 x 64 px',
                                       'measurement_range': None,
                                       'operating_temp': None,
                                       'additional_notes': None,
                                       'selected': False},
                                      {'id': 'option_display_tft_18_spi',
                                       'name': '1,8" TFT Farbdisplay ST7735, SPI',
                                       'interface': 'SPI',
                                       'pros_cons': ['Farbdarstellung für dramatische Effekte',
                                                     'Mehr Gestaltungsspielraum für Symbole und '
                                                     'Text',
                                                     'Benötigt mehr Pins und etwas mehr '
                                                     'Software-Aufwand'],
                                       'cost': 'ca. 6-12€',
                                       'availability': 'AZ-Delivery, BerryBase, Amazon, Conrad',
                                       'product_link': None,
                                       'voltage': '3.3V',
                                       'current': 'geschätzt, einige 10mA',
                                       'connector': '7-Pin: VCC, GND, SCL/SCK, SDA/MOSI, CS, DC, '
                                                    'RST',
                                       'dimensions': None,
                                       'resolution': '128 x 160 px',
                                       'measurement_range': None,
                                       'operating_temp': None,
                                       'additional_notes': 'Meist 3.3V-Logik; bei 5V-Controllern '
                                                           'ggf. Pegelwandler nötig.',
                                       'selected': False}]}],
 'controllers': [{'id': 'controller_main',
                  'role': 'Einziger Controller des Projekts',
                  'connected_component_ids': ['component_bodenfeuchtesensor_trocken',
                                              'component_bodenfeuchtesensor_feucht',
                                              'component_rotes_blinklicht',
                                              'component_gruen_leuchten',
                                              'component_display_sprechblase'],
                  'options': [{'id': 'option_esp32_devkitc_v4',
                               'name': 'ESP32-DevKitC V4',
                               'pros_cons': ['Sehr gute Kombination aus WLAN, GPIO und ADC',
                                             'Genug Pins für zwei Sensoren, zwei LEDs und '
                                             'I2C-Display',
                                             'Sehr breite Community und gute Verfügbarkeit'],
                               'cost': 'ca. 11-17€',
                               'availability': 'Reichelt, AZ-Delivery, BerryBase, Conrad, Amazon',
                               'product_link': 'https://www.espressif.com/en/products/devkits/esp32-devkitc',
                               'voltage': 'Versorgung typ. 5V via USB, Logikpegel 3.3V',
                               'current': 'typ. 80-240mA aktiv, je nach WLAN-Nutzung',
                               'supported_interfaces': ['I2C',
                                                        'SPI',
                                                        'UART',
                                                        'GPIO (digital)',
                                                        'ADC',
                                                        'PWM'],
                               'wireless_connectivity': 'WiFi 802.11 b/g/n, Bluetooth 4.2 (Classic '
                                                        '+ BLE)',
                               'gpio_count': 'ca. 34 GPIOs, einige mit Einschränkungen',
                               'dimensions': 'ca. 51mm x 25.4mm',
                               'operating_temp': 'ca. -40°C bis 85°C (Chip), Board-Umgebung '
                                                 'abhängig',
                               'compatibility_notes': 'Passt gut zu beiden kapazitiven '
                                                      'Bodenfeuchtesensoren über ADC, zu den '
                                                      'beiden LEDs über GPIO und zum OLED-Display '
                                                      'über I2C. Wichtig: Der ESP32-ADC verträgt '
                                                      'nur 3.3V; deshalb die Sensoren mit 3.3V '
                                                      'betreiben oder sicherstellen, dass der '
                                                      'Analogausgang nie über 3.3V steigt. Die '
                                                      '3.3V-Logik ist mit dem OLED kompatibel.',
                               'additional_notes': None,
                               'selected': True},
                              {'id': 'option_raspberry_pi_pico_w',
                               'name': 'Raspberry Pi Pico W',
                               'pros_cons': ['Sehr günstig und kompakt',
                                             'Genug GPIOs und ADC für das Projekt',
                                             'WLAN vorhanden, aber mehr Bastelaufwand als beim '
                                             'ESP32'],
                               'cost': 'ca. 7-12€',
                               'availability': 'Reichelt, BerryBase, Conrad, Amazon',
                               'product_link': 'https://www.raspberrypi.com/products/raspberry-pi-pico/',
                               'voltage': 'Versorgung 1.8V-5.5V am Board, Logikpegel 3.3V',
                               'current': 'typ. wenige 10mA, mit WLAN deutlich höher',
                               'supported_interfaces': ['I2C',
                                                        'SPI',
                                                        'UART',
                                                        'GPIO (digital)',
                                                        'ADC',
                                                        'PWM'],
                               'wireless_connectivity': 'WiFi 802.11n 2.4 GHz',
                               'gpio_count': '26 GPIOs',
                               'dimensions': '51mm x 21mm',
                               'operating_temp': 'ca. -20°C bis 85°C',
                               'compatibility_notes': 'Kann die zwei analogen Feuchtesensoren, '
                                                      'zwei LEDs und das I2C-OLED gleichzeitig '
                                                      'betreiben. Alle Signale sind '
                                                      '3.3V-kompatibel; die Sensoren sollten '
                                                      'ebenfalls mit 3.3V betrieben werden. Für '
                                                      'das Projekt technisch passend, aber WLAN '
                                                      'und Arduino-/Pico-Ökosystem sind je nach '
                                                      'Framework etwas aufwendiger als beim ESP32.',
                               'additional_notes': None,
                               'selected': False},
                              {'id': 'option_arduino_nano_33_iot',
                               'name': 'Arduino Nano 33 IoT',
                               'pros_cons': ['Kompakt und mit WLAN/BLE ausgestattet',
                                             'Gute Arduino-Bibliotheksunterstützung',
                                             'Weniger GPIOs als ein ESP32-Board'],
                               'cost': 'ca. 18-25€',
                               'availability': 'Arduino Store, Reichelt, Conrad, Amazon',
                               'product_link': 'https://store.arduino.cc/products/arduino-nano-33-iot-with-headers',
                               'voltage': 'Versorgung 5V via USB, Logikpegel 3.3V',
                               'current': 'typ. 20-50mA aktiv, je nach Funknutzung',
                               'supported_interfaces': ['I2C',
                                                        'SPI',
                                                        'UART',
                                                        'GPIO (digital)',
                                                        'ADC',
                                                        'PWM'],
                               'wireless_connectivity': 'WiFi 802.11 b/g/n, Bluetooth Low Energy',
                               'gpio_count': 'ca. 14 digitale I/O, mehrere ADC-Kanäle',
                               'dimensions': 'ca. 45mm x 18mm',
                               'operating_temp': None,
                               'compatibility_notes': 'Reicht für die zwei ADC-Sensoren, zwei '
                                                      'LED-Ausgänge und das I2C-Display aus. Alle '
                                                      'Peripherien laufen mit 3.3V-Logik, daher '
                                                      'passt das OLED gut; die '
                                                      'Bodenfeuchtesensoren sollten ebenfalls mit '
                                                      '3.3V betrieben werden, damit der '
                                                      'ADC-Eingang sicher bleibt. Im Vergleich zum '
                                                      'ESP32 teurer und mit weniger Reserven.',
                               'additional_notes': None,
                               'selected': False}]}]}
