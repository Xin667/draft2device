# Testfall: Mini-Gewächshaus mit Klimalogik

## Beschreibung
Eine automatisierte Klimasteuerung für ein Zimmer-Gewächshaus. Ein DHT22 misst Lufttemperatur und relative Luftfeuchtigkeit, während ein LDR-Lichtsensor das Umgebungslicht erfasst.

Übersteigt die Luftfeuchtigkeit 75% oder die Temperatur 28°C, springt ein 5V-Lüfter an. Bei zu wenig Umgebungslicht schaltet sich ein LED-Pflanzenlicht dazu. Ein I2C-OLED-Display zeigt Temperatur und Feuchte vor Ort an.