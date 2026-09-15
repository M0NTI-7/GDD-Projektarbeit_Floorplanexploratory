# Floorplanexplorer

> **Projektarbeit - CAS Generative Data Design**: Interaktive Explorations-Anwendung für die Wohnqualität von Schweizer Wohnbauten, gebaut mit three.js.

## Projektbeschreibung

Floorplanexplorer zeigt Schweizer Wohngebäude als massstäbliche Grundrisse in einer interaktiven three.js-Szene, wahlweise als Schwarzplan aus der Vogelperspektive oder, sobald man nah genug heranzoomt oder die Kamera kippt, mit sichtbaren Räumen und Öffnungen. Über eine Filterleiste mit vier Gruppen (Geschoss, Gebäude, Wohnungen, Zimmer) und insgesamt 15 Kennzahlen (z. B. Geschossfläche, Zimmerzahl, Wohnungsgrösse, Anzahl Nasszellen) lässt sich der gesamte Gebäudebestand nach Wohnqualitätsmerkmalen filtern und explorieren.

## Ziel des Projekts

Das Projekt entstand als Projektarbeit im CAS Generative Data Design und baut auf einem früheren CAS-Projekt auf, in dem Kosten und Termine für die Projektsteuerung visualisiert wurden, die Wohnqualität dort aber mangels Daten aussen vor blieb. Floorplanexplorer schliesst diese Lücke: Ziel ist es, Wohnqualität über eine grosse Anzahl realer Schweizer Wohnbauten hinweg sichtbar und vergleichbar zu machen, statt sie nur einzelfallweise anhand eines Grundrisses zu beurteilen.

## Datenquellen

### Gebäudedaten
- **Quelle**: [Swiss Dwellings v3.0.0](https://zenodo.org/records/7788422) von Archilyse AG, ein frei verfügbarer Datensatz mit Grundrissgeometrien Schweizer Wohnbauten
- **Rohdatei**: `geometries.csv`
- **Datum**: 2023-03-31
- **Struktur**: Jede Zeile beschreibt eine Entität eines gezeichneten Grundrisses

| Zeile          | Wert                                              |
| -------------- | ------------------------------------------------- |
| apartment_id   | d4438f2129b30290845ce7eef98a5ba7                  |
| site_id        | 127                                               |
| building_id    | 164                                               |
| plan_id        | 492                                               |
| floor_id       | 861                                               |
| unit_id        | 63777                                             |
| area_id        | 767676                                            |
| unit_usage     | RESIDENTIAL                                       |
| entity_type    | area                                              |
| entity_subtype | LIVING_ROOM                                       |
| geometry       | POLYGON ((-6.1501158933490139 -4.8490786654693... |
| elevation      | 0                                                 |
| height         | 2.6                                               |
### SIA416-Flächenzuordnung
- **Datei**: `flaechen-sia416.csv`
- **Zweck**: Ordnet jedem Raumnamen (z. B. "Wohnzimmer", "Badezimmer") die zugehörige SIA416-Flächenkategorie (HNF, NNF, VF, FF, KFT, KFN, ANF) sowie den Zimmerzähler zu

### Datenaufbereitung (`data-prep/`)
Der Rohdatensatz von Archilyse wird in mehreren Python-Skripten (pandas/geopandas) schrittweise für die Anwendung aufbereitet, bevor er in `10_geometries_final.csv` landet:

| Skript                         | Zweck                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `90_geometries-wkt-prep.py`    | Liest den Rohdatensatz `geometries.csv` in Chunks ein, wandelt WKT-Strings in Geometrien um und rundet sie                                             |
| `80_geometries_data-prep.py`   | Benennt Spalten auf Deutsch, übersetzt Raum-/Nutzungstypen, bereinigt Duplikate und berechnet pro Geschoss eine zusammengeführte Geschossfläche        |
| `60_geometries_final_prep.py`  | Berechnet Flächen aus den Geometrien, ordnet SIA416-Kategorien zu und schreibt den finalen Datensatz `10_geometries_final.csv`, den die Anwendung lädt |
| `70_geometries_100-prep.py`    | Erstellt einen Testausschnitt mit den ersten 100 Gebäuden                                                                                              |
| `50_geometries_wert_suchen.py` | Hilfsskript zum gezielten Nachschlagen einzelner `gebaeude_id`-Werte (z. B. zur Fehlersuche), Export als `geometries_treffer.csv`                      |

## Funktionsweise

1. **Einlesen**: Die Gebäudegeometrien werden per Fetch + PapaParse aus der aufbereiteten CSV geladen
2. **Aufbereitung pro Gebäude**: Die Zeilen werden nach Gebäude gruppiert, WKT-Polygone in Konturen umgewandelt und pro Gebäude Kennzahlen berechnet (Geschossfläche, HNF-Anteil, Geschossigkeit, Gebäudetiefe, Zimmer pro Wohnung, Wohnungs-, Zimmer-, Küchen-, Ess- Nasszellen-, Reduit- und Balkonflächen, Anzahl Badezimmer, Wohnungen pro Geschoss)
3. **Darstellung**: Die Umrisse werden als `LineSegments2` gezeichnet; ein Schwarzplan (gefüllte Geschossflächen) ist immer sichtbar, Raumdetails und -öffnungen blenden sich automatisch ein, sobald die sichtbare Szenenhöhe unter einen Schwellenwert fällt
4. **Zwei Kameramodi**: Eine orthografische Kamera für die Vogelperspektive und eine Perspektivkamera für die gekippte Ansicht; die Anwendung wechselt automatisch, sobald man die Kamera kippt, und übernimmt dabei nahtlos Blickrichtung und Zoomstand
5. **Packing**: Da die Gebäudekoordinaten jeweils um den Gebäudeeinfügepunkt gezeichnet wurden, werden die Gebäude über einen einfachen Rectangle-Packing-Algorithmus (`gebaeudePacken`) kompakt nebeneinander angeordnet
6. **Enthüllung**: Beim ersten Laden erscheinen die Gebäude zufällig gestaffelt über rund 3–5 Sekunden, statt alle auf einmal
7. **Crossfilter**: Die Filterleiste zeigt 15 Kennzahlen in vier aufklappbaren Gruppen (Geschoss, Gebäude, Wohnungen, Zimmer) als SVG-Balkendiagramme. Klick oder Drag über einen Balkenbereich filtert alle Diagramme sowie die Gebäudedarstellung gleichzeitig

## Verwendete Technologien

- **three.js**: Rendering der Grundrisse, `OrbitControls` für Pan/Rotate/Zoom, orthografische und perspektivische Kamera
- **PapaParse**: Einlesen der CSV-Rohdaten
- **Natives SVG**: Zeichnen und Bedienen der Crossfilter-Diagramme in der Filterleiste
- **HTML/CSS**: Font (Google Font "Jost"), Struktur, Splash-Screen und Styling ohne zusätzliches Framework
- **Python** (pandas, geopandas, shapely): Datenaufbereitung ausserhalb der Web-Anwendung

## Setup & Installation

### Voraussetzungen
- VS Code mit der Erweiterung Live Server (die `import`-Map und der `fetch()`-Aufruf der CSV benötigen `http://`, ein Öffnen der `index.html` direkt per `file://` funktioniert nicht)
- Für die Datenaufbereitung zusätzlich Python mit `pandas`, `geopandas` und `shapely`

### Projekt starten
1. Repository lokal klonen
2. geometries.csv herunterladen und in den data-prep Ordner verschieben
3. Projektordner in VS Code öffnen
4. Nacheinander "`90_geometries-wkt-prep.py`", `80_geometries_data-prep.py` und  `60_geometries_final_prep.py` ausführen
5. `index.html` per Live Server öffnen ("Go Live" in der Statusleiste)
6. Die Anwendung öffnet sich im Browser, standardmässig unter `http://localhost:5500`

### Bedienung
- **Linke Maustaste**: Auswählen / Info zu einem Raum anzeigen
- **Mittlere Maustaste**: Verschieben
- **Rechte Maustaste**: Rotieren/Kippen
- **Scrollen**: Zoomen
- **W / A / S / D**: Kamera zusätzlich zur Maus frei bewegen
- **I**: Ausgewähltes Gebäude bzw. Geschoss isolieren, erneutes Drücken hebt die Isolierung auf
- **F**: Aktuelle Positionierung der Gebäude fixieren
- **R**: Gebäude mit der aktuellen Filterauswahl neu anordnen
- **P**: Aktuelle Ansicht als PNG exportieren
- **Filterleiste oben**: Gruppen (Geschoss, Gebäude, Wohnungen, Zimmer) aufklappen, darin Balken anklicken oder über einen Bereich ziehen, um nach dieser Kennzahl zu filtern

## Projektstatus

**Status**: Abgeschlossen - Projektarbeit - CAS Generative Data Design
**Aktueller Stand**: 15.09.2026
**Version**: 1.0

---

*Datengrundlage: [Swiss Dwellings v3.0.0](https://zenodo.org/records/7788422), Archilyse AG.*
