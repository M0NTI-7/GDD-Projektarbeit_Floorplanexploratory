# --------------------- Ziel: Alle zu importierenden Biliotheken am Anfang laden.

import geopandas as gpd
import pandas as pd
import shapely
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# --------------------- Ziel: Schauen ob die Arbeitsumgebung funktiniert.

# print("hello world") 

# --------------------- Ziel: Gewünschtes CSV laden.

df = pd.read_csv(os.path.join(SCRIPT_DIR, "geometries_prepared.csv"))

# print(df)

# --------------------- Ziel: Spaltennamen mit dem richtigen Titel beschriften, Spalten löschen die nicht verwendet werden und Spalten sortieren.

# ---------- Unterziel: Ändern der Spaltennamen um sie besser lesbar zu machen.

# print(df.head())

df = df.rename(columns={
    "apartment_id": "wohnungs_id",
    "site_id": "parzellen_id",
    "building_id": "gebaeude_id",
    "plan_id": "plan_id",
    "floor_id": "geschoss_id",
    "unit_id": "einheit_id",
    "area_id": "flaechen_id",
    "unit_usage": "einheit_nutzung",
    "entity_type": "entitaet_typ",
    "entity_subtype": "entitaet_subtyp",
    "elevation": "hoehenkote",
    "height": "hoehe",
    "geometry": "koordinaten",
})

# ---------- Unterziel: Datenfeldtypen richtig einstellen

# print(df.dtypes)

df["einheit_id"] = df["einheit_id"].astype("Int64")
df["flaechen_id"] = df["flaechen_id"].astype("Int64")

# print(df.dtypes)

# ---------- Unterziel: Spalten sortieren und nicht zu verwendende löschen.

df = df[[
    "parzellen_id",
    "gebaeude_id",
    "geschoss_id",
    "wohnungs_id",
    "einheit_id",
    "flaechen_id",
    "einheit_nutzung",
    "entitaet_typ",
    "entitaet_subtyp",
    "hoehenkote",
    "hoehe",
    "koordinaten",
]]

# print(df.head())

# --------------------- Ziel: Werte aller Zeilen sind aufgeräumt

# Suchen von allen NaN-Wert
# print(df.isna().sum())

# Suchen von allen Dublikaten
# print(df.duplicated().sum())

# Anzeigen von allen Originalen und Dublikaten
# print(df[df.duplicated(keep=False)])

# Entscheid die Dublikate zu löschen
df = df.drop_duplicates()
# print(df.duplicated().sum())

# Wertebereiche / Ausreisser bei Zahlenspalten suchen
# print(df[["hoehenkote", "hoehe"]].describe())
    # count = Anzahl
    # mean = Durchschnitt
    # std = Standartabweichung
    # min = kleinster wert
    # max = grösster wert

# Einzelne Spalten nach Schreibfehler suchen und diese gleich auf Deutsch übersetzen

# print(df["einheit_nutzung"].unique())

df["einheit_nutzung"] = df["einheit_nutzung"].replace({
    "RESIDENTIAL": "Wohnen",
    "PUBLIC": "Öffentlich",
    "COMMERCIAL": "Gewerbe",
    "JANITOR": "Hauswart",
    "PLACEHOLDER": pd.NA,
})

# print(df["einheit_nutzung"].unique())

# print(df["entitaet_typ"].unique())

df["entitaet_typ"] = df["entitaet_typ"].replace({
    "area": "Raum",
    "feature": "Ausstattung",
    "separator": "Element",
    "opening": "Öffnung",
})

# print(df["entitaet_typ"].unique())

# print(df["entitaet_subtyp"].unique())

df["entitaet_subtyp"] = df["entitaet_subtyp"].replace({
    "BATHROOM": "Badezimmer",
    "LIVING_ROOM": "Wohnzimmer",
    "ROOM": "Zimmer",
    "KITCHEN": "Küche",
    "BALCONY": "Balkon",
    "CORRIDOR": "Korridor",
    "BATHTUB": "Badewanne",
    "TOILET": "Toilette",
    "SINK": "Waschbecken",
    "WALL": "Wand",
    "RAILING": "Geländer",
    "DOOR": "Tür",
    "WINDOW": "Fenster",
    "ENTRANCE_DOOR": "Eingangstür",
    "DINING": "Esszimmer",
    "SHAFT": "Schacht",
    "STAIRCASE": "Treppenhaus",
    "STAIRS": "Treppe",
    "STOREROOM": "Abstellraum",
    "COLUMN": "Stütze",
    "SHOWER": "Dusche",
    "LIVING_DINING": "Wohn-/Esszimmer",
    "BASEMENT_COMPARTMENT": "Kellerabteil",
    "VOID": "Leerraum",
    "ELEVATOR": "Aufzug",
    "NOT_DEFINED": "Nicht definiert",
    "OFFICE": "Büro",
    "BEDROOM": "Schlafzimmer",
    "OUTDOOR_VOID": "Aussenraum",
    "LOGGIA": "Loggia",
    "KITCHEN_DINING": "Wohnküche",
    "PRAM": "Kinderwagenabstellraum",
    "LIGHTWELL": "Lichtschacht",
    "WASHING_MACHINE": "Waschmaschine",
    "TERRACE": "Terrasse",
    "PRAM_AND_BIKE_STORAGE_ROOM": "Kinderwagen- und Veloraum",
    "CORRIDORS_AND_HALLS": "Korridore und Hallen",
    "BIKE_STORAGE": "Veloraum",
    "COUNTER_ROOM": "Schalterraum",
    "BASEMENT": "Keller",
    "TECHNICAL_AREA": "Technikraum",
    "HEATING": "Heizung",
    "LOBBY": "Empfangsbereich",
    "WINTERGARTEN": "Wintergarten",
    "RAMP": "Rampe",
    "WASH_AND_DRY_ROOM": "Wasch- und Trockenraum",
    "BUILT_IN_FURNITURE": "Einbaumöbel",
    "CLOAKROOM": "Garderobe",
    "SALESROOM": "Verkaufsraum",
    "GARAGE": "Garage",
    "OIL_TANK": "Öltank",
    "FOYER": "Foyer",
    "HOUSE_TECHNICS_FACILITIES": "Haustechnikanlagen",
    "OFFICE_SPACE": "Bürofläche",
    "OFFICE_TECH_ROOM": "Büro-Technikraum",
    "WAREHOUSE": "Lagerhalle",
    "CARPARK": "Parkhaus",
    "SANITARY_ROOMS": "Sanitärräume",
    "OPEN_PLAN_OFFICE": "Grossraumbüro",
    "MEETING_ROOM": "Sitzungszimmer",
    "BREAK_ROOM": "Pausenraum",
    "ARCHIVE": "Archiv",
    "ELECTRICAL_SUPPLY": "Elektroversorgung",
    "MEDICAL_ROOM": "Behandlungsraum",
    "WAITING_ROOM": "Wartezimmer",
    "COMMON_KITCHEN": "Gemeinschaftsküche",
    "VEHICLE_TRAFFIC_AREA": "Verkehrsfläche",
    "ELEVATOR_FACILITIES": "Aufzugsanlagen",
    "AIR": "Luftraum",
    "PATIO": "Innenhof",
    "FACTORY_ROOM": "Fabrikraum",
    "RECEPTION_ROOM": "Empfangsraum",
    "COMMUNITY_ROOM": "Gemeinschaftsraum",
    "WORKSHOP": "Werkstatt",
    "GARDEN": "Garten",
    "CANTEEN": "Kantine",
    "SHELTER": "Schutzraum",
    "OPERATIONS_FACILITIES": "Betriebsanlagen",
    "STUDIO": "Atelier",
    "COLD_STORAGE": "Kühlraum",
    "TRANSPORT_SHAFT": "Transportschacht",
    "RADATION_THERAPY": "Strahlentherapie",
    "PHYSIO_AND_REHABILITATION": "Physiotherapie und Rehabilitation",
    "WATER_SUPPLY": "Wasserversorgung",
    "DEDICATED_MEDICAL_ROOM": "Spezialisierter Behandlungsraum",
    "SPORTS_ROOMS": "Sporträume",
    "SHOWROOM": "Ausstellungsraum",
    "GAS": "Gasversorgung",
    "TEACHING_ROOM": "Unterrichtsraum",
    "ARCADE": "Arkade",
    "LOGISTICS": "Logistik",
})

# print(df["entitaet_subtyp"].unique())

# Schauen welcher Subtyp zu welchem Typ gehört um die Werte zu verbessern.

# print(df.groupby("entitaet_typ")["entitaet_subtyp"].unique())

# Der Code oben hat die Liste abgeschnitten dieser hier sollte eine vollständige Liste ausgeben.

# for typ, subtypen in df.groupby("entitaet_typ")["entitaet_subtyp"].unique().items():
#     print(typ)
#     print(list(subtypen))
#     print()

# # --------------------- Ziel: Geschossfläche anlegen
# # Herangehensweise: Alle Geometrien bei "koordinaten" die die geometrisch übereinander liegen und die gleiche "parzellen_id", "gebaeude_id" und "geschoss_id" haben. Als eine neue Zeile einfügen und mit den zusätzlichen Werten ergänzen

# # Geopanda installieren ganz oben, gdf erstellen mit den WKT zur "wahre Geometrie"

gdf = gpd.GeoDataFrame(df, geometry=gpd.GeoSeries.from_wkt(df["koordinaten"]))


# # schauen ob wir ein Split Level bei den Räumen haben. Dies würde bedeuten, dass der weitere Teil der Programmierung komplizierter wird

# raeume = gdf[gdf["entitaet_typ"] == "Raum"]

# kote_pro_geschoss = raeume.groupby(["parzellen_id", "gebaeude_id", "geschoss_id"])["hoehenkote"].nunique()

# print("Anzahl Geschosse total:", len(kote_pro_geschoss))
# print("Anzahl Geschosse mit mehr als einer Höhenkote bei Räumen:", (kote_pro_geschoss > 1).sum())
# print(kote_pro_geschoss[kote_pro_geschoss > 1].head(10))

# print mir alle Höhenkoten von den Räumen
# print(gdf[gdf["entitaet_typ"] == "Raum"]["hoehenkote"].unique())

# # kein Split-Level vorhanden :)

# hoehenkote/hoehe nur aus den "Raum"-Zeilen ableiten, damit z.B. eine höher montierte Toilette die Werte nicht verfälscht
raum_werte = (
    gdf[gdf["entitaet_typ"] == "Raum"]
    .groupby(["parzellen_id", "gebaeude_id", "geschoss_id"])
    .agg(hoehenkote=("hoehenkote", "first"), hoehe=("hoehe", "max"))
    .reset_index()
)

# Geschossbezeichnungen erstellen
raum_werte = raum_werte.sort_values(["parzellen_id", "gebaeude_id", "hoehenkote"]).reset_index(drop=True)

def geschoss_indizes_pro_gebaeude(gruppe):
    eg_position = gruppe["hoehenkote"].abs().values.argmin()
    return [position - eg_position for position in range(len(gruppe))]

raum_werte["geschoss_index"] = (
    raum_werte.groupby(["parzellen_id", "gebaeude_id"], group_keys=False)
    .apply(lambda gruppe: pd.Series(geschoss_indizes_pro_gebaeude(gruppe), index=gruppe.index), include_groups=False)
)

def stockwerk_label(geschoss_index):
    if geschoss_index == 0:
        return "EG"
    elif geschoss_index < 0:
        return f"{abs(geschoss_index):02d} UG"
    else:
        return f"{geschoss_index:02d} OG"

raum_werte["geschoss_label"] = [
    f"{100 + index:04d} | {stockwerk_label(index)}"
    for index in raum_werte["geschoss_index"]
]

df = df.merge(
    raum_werte[["parzellen_id", "gebaeude_id", "geschoss_id", "geschoss_label"]],
    on=["parzellen_id", "gebaeude_id", "geschoss_id"],
    how="left",
)

# Gleiche Parzellen, Gebäude und Geschosse suchen und die Geometrien vereinigen
geschossflaechen = gdf.dissolve(by=["parzellen_id", "gebaeude_id", "geschoss_id"]).reset_index()
geschossflaechen = geschossflaechen.drop(columns=["hoehenkote", "hoehe"]).merge(
    raum_werte, on=["parzellen_id", "gebaeude_id", "geschoss_id"]
)

# Durch das Vereinigen können ungültige Geometrien entstehen (z.B. Selbstüberschneidungen) -> reparieren
geschossflaechen["geometry"] = geschossflaechen.geometry.make_valid()

def sichere_rundung(geom):
    try:
        return shapely.set_precision(geom, grid_size=0.01)
    except Exception:
        return geom

geschossflaechen["geometry"] = geschossflaechen.geometry.apply(sichere_rundung)

def kleine_loecher_entfernen(geom, min_flaeche=1): # 1 = 1 m2 kleine Flächen werden entfernt, grössere bleiben erhalten
    if geom.geom_type == "Polygon":
        grosse_loecher = [ring for ring in geom.interiors if shapely.Polygon(ring).area >= min_flaeche]
        return shapely.Polygon(geom.exterior, grosse_loecher)
    elif geom.geom_type == "MultiPolygon":
        return shapely.MultiPolygon([kleine_loecher_entfernen(teil, min_flaeche) for teil in geom.geoms])
    return geom

geschossflaechen["geometry"] = geschossflaechen.geometry.apply(kleine_loecher_entfernen)

neue_zeilen = geschossflaechen[["parzellen_id", "gebaeude_id", "geschoss_id", "hoehenkote", "hoehe", "geschoss_label"]].copy()
neue_zeilen["koordinaten"] = geschossflaechen.geometry.to_wkt()
neue_zeilen["einheit_nutzung"] = "Wohngebäude"
neue_zeilen["entitaet_typ"] = "Geschossfläche"
neue_zeilen["entitaet_subtyp"] = "GF"

df = pd.concat([df, neue_zeilen], ignore_index=True)

df.to_csv(os.path.join(SCRIPT_DIR, "geometries_final.csv"), index=False)