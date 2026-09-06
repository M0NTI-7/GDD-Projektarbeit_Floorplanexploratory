import pandas as pd
import geopandas as gpd
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

QUELLE = os.path.join(SCRIPT_DIR, "geometries_final.csv")
ZIEL = os.path.join(SCRIPT_DIR, "geometries_final_angereichert.csv")

sia416 = pd.read_csv(os.path.join(SCRIPT_DIR, "flaechen-sia416.csv"))

SPALTEN = [
    "parzellen_id",
    "gebaeude_id",
    "geschoss_id",
    "geschoss_label",
    "wohnungs_id",
    "einheit_id",
    "flaechen_id",
    "einheit_nutzung",
    "entitaet_subtyp",
    "entitaet_typ",
    "flaeche",
    "definition",
    "zimmer_zaehler",
    "hoehenkote",
    "hoehe",
    "koordinaten",
]

# In Chunks verarbeiten (wie in geometries-prep.py), damit die 3+ Mio. Zeilen von
# geometries_final.csv nicht als Ganzes plus Geometrie-Objekte im Speicher gehalten werden müssen.
unbekannte_raumtypen = set()

for i, chunk in enumerate(pd.read_csv(QUELLE, chunksize=150_000)):
    # "Element" (Wände, Geländer, Stützen) rausnehmen - wird in der Darstellung nicht gebraucht
    chunk = chunk[chunk["entitaet_typ"] != "Element"].copy()

    # Fläche der Räume und Geschossflächen aus der Geometrie berechnen (fehlt in geometries_final.csv)
    flaeche_berechnen = chunk["entitaet_typ"].isin(["Raum", "Geschossfläche"])
    chunk.loc[flaeche_berechnen, "flaeche"] = gpd.GeoSeries.from_wkt(
        chunk.loc[flaeche_berechnen, "koordinaten"]
    ).area.round(2)

    # SIA416-Kategorie ("definition") und Zimmerzähler pro Raum-Subtyp nachschlagen
    chunk = chunk.merge(sia416, left_on="entitaet_subtyp", right_on="raumname", how="left").drop(columns="raumname")

    unbekannte_raumtypen.update(
        chunk.loc[
            (chunk["entitaet_typ"] == "Raum") & chunk["definition"].isna(),
            "entitaet_subtyp",
        ].unique()
    )

    chunk = chunk[SPALTEN]
    chunk.to_csv(ZIEL, mode="w" if i == 0 else "a", header=(i == 0), index=False)
    print(f"Chunk {i}: {len(chunk)} Zeilen verarbeitet")

if unbekannte_raumtypen:
    print("Achtung: folgende Raum-Subtypen fehlen in flaechen-sia416.csv:", sorted(unbekannte_raumtypen))

print("Fertig:", ZIEL)
