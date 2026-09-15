import pandas as pd
import os
import subprocess

SPALTE = "gebaeude_id"  # anpassen: Name der zu durchsuchenden Spalte
WERT = 15413  # anpassen: gesuchter Wert (Zahl ohne Anführungszeichen bei numerischen Spalten wie gebaeude_id)

pfad = os.path.join(os.path.dirname(__file__), "10_geometries_final.csv")
df = pd.read_csv(pfad)
treffer = df[df[SPALTE] == WERT]

print(f"{len(treffer)} Zeilen mit {SPALTE} == {WERT!r} gefunden")

# Als CSV speichern und in der Standard-Tabellenkalkulation öffnen (echte Tabelle statt Terminal-Text)
ziel = os.path.join(os.path.dirname(__file__), "geometries_treffer.csv")
treffer.to_csv(ziel, index=False)
