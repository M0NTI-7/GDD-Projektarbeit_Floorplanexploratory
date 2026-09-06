import geopandas as gpd
import pandas as pd
import shapely

# print("hello world")

# Beim Laden von der CSV-Datei muss das aktuelle Arbeitsverzeichnis korrekt sein. Dafür im Terminal schauen wo man sich befindet.
# Befehl im Terminal: pwd
# Falls das Arbeitsverzeichnis nicht korrekt ist, kann man es mit dem Befehl cd <Pfad> ändern.
# Befehl im Terminal: cd data-prep

# Daten von geometries.csv in Chunks laden, um den Arbeitsspeicher zu schonen
for i, chunk in enumerate(pd.read_csv("geometries.csv", chunksize=150_000)):
    # "geometry"-Spalte von WKT-String in Geometrie-Objekte umwandeln und auf 2 Nachkommastellen runden
    geometry = shapely.set_precision(gpd.GeoSeries.from_wkt(chunk["geometry"]), grid_size=0.01)
    gdf = gpd.GeoDataFrame(chunk.drop(columns="geometry"), geometry=geometry)

    if i == 0:
        print(gdf.head())
    print(f"Chunk {i}: {len(gdf)} Zeilen")

    # Chunk direkt anhängen, damit nicht alle Chunks im Speicher gehalten werden müssen
    gdf.to_csv(
        "geometries_prepared.csv",
        mode="w" if i == 0 else "a",
        header=(i == 0),
        index=False,
    )