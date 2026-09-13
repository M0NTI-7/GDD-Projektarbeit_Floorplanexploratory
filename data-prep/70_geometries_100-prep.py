import pandas as pd
import geopandas as gpd
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

df = pd.read_csv(os.path.join(SCRIPT_DIR, "75_geometries_final.csv"))

# Erste 100 Gebäude (in der Reihenfolge, wie sie im CSV vorkommen) auswählen
erste_parzelle = df["gebaeude_id"].unique()[:100]
df_teilmenge = df[df["gebaeude_id"].isin(erste_parzelle)]

# "Element" (Wände, Geländer, Stützen) rausnehmen
df_teilmenge = df_teilmenge[df_teilmenge["entitaet_typ"] != "Element"]

# Berechnung der Flächen der Räume und Geschossflächen
flaeche_berechnen = df_teilmenge["entitaet_typ"].isin(["Raum", "Geschossfläche"])
df_teilmenge.loc[flaeche_berechnen, "flaeche"] = gpd.GeoSeries.from_wkt(
    df_teilmenge.loc[flaeche_berechnen, "koordinaten"]
).area.round(2)

# flächendefinition nach SIA416
sia416 = pd.read_csv(os.path.join(SCRIPT_DIR, "flaechen-sia416.csv"))
df_teilmenge = df_teilmenge.merge(
    sia416, left_on="entitaet_subtyp", right_on="raumname", how="left"
).drop(columns="raumname")

# Rückmeldung im Terminal, falls ein "Raum" keinen Treffer in flaechen-sia416.csv hatte
# (definition ist dann NaN) -> zeigt Lücken in der Referenzliste auf.
unbekannte_raumtypen = df_teilmenge.loc[
    (df_teilmenge["entitaet_typ"] == "Raum") & df_teilmenge["definition"].isna(),
    "entitaet_subtyp",
].unique()

if len(unbekannte_raumtypen) > 0:
    print("Achtung: folgende Raum-Subtypen fehlen in flaechen-sia416.csv:", list(unbekannte_raumtypen))

df = df_teilmenge[[
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
]]

df.to_csv(os.path.join(SCRIPT_DIR, "65_geometries_erste100.csv"), index=False)
