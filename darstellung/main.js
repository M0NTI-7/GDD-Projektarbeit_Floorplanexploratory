// --------------------------------------------------------------------------------

// ZIEL: Alle importe Global ausführen

// --------------------------------------------------------------------------------

import * as THREE from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// --------------------------------------------------------------------------------

// Ziel: Sämtliche Farben, Stifte und Texturen sind global am Anfang definiert und können von allen Gebäuden verwendet werden

// --------------------------------------------------------------------------------

const stiftfarbeUmfassungslinie = {
  "Geschossfläche": new LineMaterial({ color: "#000000", linewidth: 2 }), // Dicke: 2px, Füllung keine ???, Farbe: schwarz
  "Raum": new LineMaterial({ color: "#000000", linewidth: 2 }),
  "Öffnung": new LineMaterial({ color: "#000000", linewidth: 1 }),
  "Ausstattung": new LineMaterial({ color: "#000000", linewidth: 1 }),
};

const flaechenfarbenSia416farben = {
  "HNF": "#c0392b",
  "NNF": "#e08214",
  "VF": "#f1c40f",
  "FF": "#2e86c1",
  "KFT": "#7b4b2a",
  "KFN": "#c08a3e",
  "ANF": "#2ecc71", // Farbe stimmt noch nicht ????
};

// --------------------------------------------------------------------------------

// Ziel: Szene ist erstellt

// --------------------------------------------------------------------------------

const scene = new THREE.Scene();
scene.background = new THREE.Color("#ffffff"); // weisser "Papier"-Hintergrund für den Blueprint-Look

let frustumSize = 50;

const aspect = window.innerWidth / window.innerHeight;
const camera = new THREE.OrthographicCamera(
  (-frustumSize * aspect) / 2,
  (frustumSize * aspect) / 2,
  frustumSize / 2,
  -frustumSize / 2,
  0.1, // alles was näher als 0.1 ist wird nicht dargestellt
  1000 // alles was weiter weg als 1000 ist wird nicht dargestellt
);

camera.position.set(0, 100, 0); // koordinatensystem = von vorne nicht wie CAD, Y ist die Höhe
camera.lookAt(0, 0, 0);

function kameraFrustumAktualisieren(aspect) {
  camera.left = (-frustumSize * aspect) / 2;
  camera.right = (frustumSize * aspect) / 2;
  camera.top = frustumSize / 2;
  camera.bottom = -frustumSize / 2;
  camera.updateProjectionMatrix();
}

const renderer = new THREE.WebGLRenderer({ antialias: true }); // glättet die Linie in der darstellung
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio); // greift die Pixel des Bildschirms ab für die schärfe
document.body.appendChild(renderer.domElement); // braucht es damit überhaupt etwas darstellt

for (const material of Object.values(stiftfarbeUmfassungslinie)) {
  renderer.getSize(material.resolution);
}

// Ziel: Die Kammerasteuerung ist korrekt eingestellt

const controls = new OrbitControls(camera, renderer.domElement);

controls.target.set(0, 0, 0);
controls.zoomSpeed = 6; // Hier kann die Zoomgeschwindigkeit angepasst werden
controls.zoomToCursor = true; // zoom direkt auf die Mausposition
controls.mouseButtons = {
  MIDDLE: THREE.MOUSE.PAN,
  RIGHT: THREE.MOUSE.ROTATE,
};

// Verhalten: Past die Zeichnung der Fenstergrösse an falls diese geändert wird

window.addEventListener("resize", () => {
  const aspect = window.innerWidth / window.innerHeight;
  kameraFrustumAktualisieren(aspect);

  renderer.setSize(window.innerWidth, window.innerHeight);
  for (const material of Object.values(stiftfarbeUmfassungslinie)) {
    renderer.getSize(material.resolution);
  }
});

// Verhalten: Hier wird die Beschriftung der Anzahl Räume definiert

const anzahlRaumeBeschriftungen = []; // { position: THREE.Vector3, element: HTMLElement }

function beschriftungHinzufuegen(text, textPosition) {
  const element = document.createElement("div");
  element.className = "raum-beschriftung";
  element.textContent = text;
  document.body.appendChild(element);
  anzahlRaumeBeschriftungen.push({ position: textPosition, element });
}

function beschriftungenAktualisieren() {
  for (const { position, element } of anzahlRaumeBeschriftungen) {
    const projiziert = position.clone().project(camera);
    element.style.left = `${((projiziert.x + 1) / 2) * window.innerWidth}px`;
    element.style.top = `${((1 - projiziert.y) / 2) * window.innerHeight}px`;
  }
}

renderer.setAnimationLoop(() => {
  controls.update();
  beschriftungenAktualisieren();
  renderer.render(scene, camera);
});

// --------------------------------------------------------------------------------

// Ziel: CSV-Datei ist geladen und die Daten sind in einem Array gespeichert

// --------------------------------------------------------------------------------

const csvPfad = "../data-prep/geometries_erste20.csv";

Papa.parse(csvPfad, {
  download: true,
  header: true,
  dynamicTyping: true,
  skipEmptyLines: true,
  complete: (ergebnis) => {
    const gebaeudeDaten = ergebnis.data;
    gebaeudeDarstellen(gebaeudeDaten);
  },
});

// --------------------------------------------------------------------------------

// Ziel: Gebäude sind dargestellt

// --------------------------------------------------------------------------------

function wktZuKonturen(wkt) {
  const konturen = wkt.match(/\(([^()]+)\)/g) || [];
  return konturen.map((kontur) =>
    kontur
      .slice(1, -1) // die Klammern dieser Kontur entfernen
      .split(", ")
      .map((paar) => {
        const [x, y] = paar.split(" ").map(Number);
        return [x, y];
      })
  );
}

function segmenteHinzufuegen(zielArray, kontur) {
  for (let i = 0; i < kontur.length - 1; i++) {
    const [x0, y0] = kontur[i];
    const [x1, y1] = kontur[i + 1];
    zielArray.push(x0, 0, y0, x1, 0, y1); // die beiden 0 sind die Höhe
  }
}

function gebaeudeDarstellen(zeilen) {
  
  const zeilenProGebaeude = new Map(); // Map ist eine Klasse, also eine neue Klasse ohne Inhalt dieser wird nun neu befüllt

  for (const zeile of zeilen) {
    if (!zeilenProGebaeude.has(zeile.gebaeude_id)) zeilenProGebaeude.set(zeile.gebaeude_id, []);
    zeilenProGebaeude.get(zeile.gebaeude_id).push(zeile);
  }

  const gebaeudeListe = [];

  for (const [gebaeude_id, zeilenDesGebaeudes] of zeilenProGebaeude) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const zeilenMitPunkten = zeilenDesGebaeudes.map((zeile) => {
      const konturen = wktZuKonturen(zeile.koordinaten);
      for (const kontur of konturen) {
        for (const [x, y] of kontur) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
      return { ...zeile, konturen };
    });

    const breite = maxX - minX;
    const tiefe = maxY - minY;

    const radius = Math.sqrt(breite ** 2 + tiefe ** 2) / 2;
    const ringInnenRadius = radius * 1.15; // kleiner Abstand zwischen Gebäude und Ring
    const ringAussenRadius = ringInnenRadius + radius * 0.2; // Ring-Dicke ~20% des Radius

    const flaechePro416Kategorie = {};
    const zimmerProWohnung = {};

    for (const zeile of zeilenDesGebaeudes) {
      if (zeile.entitaet_typ === "Raum" && zeile.sia416_definition) {
        flaechePro416Kategorie[zeile.sia416_definition] =
          (flaechePro416Kategorie[zeile.sia416_definition] || 0) + (zeile.flaeche || 0);
      }
      if (zeile.entitaet_typ === "Raum" && zeile.wohnungs_id) {
        zimmerProWohnung[zeile.wohnungs_id] =
          (zimmerProWohnung[zeile.wohnungs_id] || 0) + (zeile.zimmer_zaehler || 0);
      }
    }

    gebaeudeListe.push({
      gebaeude_id,
      zeilen: zeilenMitPunkten,
      mitteX: minX + breite / 2,
      mitteZ: minY + tiefe / 2,
      ringInnenRadius,
      ringAussenRadius,
      flaechePro416Kategorie,
      zimmerProWohnung,
    });
  }

  const typGruppen = {}; // entitaet_typ -> { material, positionen, zeilen }

  for (const gebaeude of gebaeudeListe) {
    for (const zeile of gebaeude.zeilen) {
      const material = stiftfarbeUmfassungslinie[zeile.entitaet_typ];
      if (!material) continue;

      if (!typGruppen[zeile.entitaet_typ]) {
        typGruppen[zeile.entitaet_typ] = { material, positionen: [], zeilen: [] };
      }
      const gruppe = typGruppen[zeile.entitaet_typ];

      for (const kontur of zeile.konturen) {
        segmenteHinzufuegen(gruppe.positionen, kontur);
        // Pro hinzugefügtem Segment dieselbe Zeile vermerken (kontur.length - 1 Segmente pro Kontur)
        for (let i = 0; i < kontur.length - 1; i++) {
          gruppe.zeilen.push(zeile);
        }
      }
    }
  }

  for (const gruppe of Object.values(typGruppen)) {
    const geometrie = new LineSegmentsGeometry();
    geometrie.setPositions(gruppe.positionen);

    const linien = new LineSegments2(geometrie, gruppe.material);
    linien.computeLineDistances();
    linien.userData.zeilen = gruppe.zeilen; // für die Infobox: Zeile pro Segment-Index
    scene.add(linien);
    klickbareObjekte.push(linien);
  }

  annotationenErstellen(gebaeudeListe);
  kameraAufGebaeudeZentrieren(gebaeudeListe);
}

// --------------------------------------------------------------------------------

// Ziel: SIA416-Donut und Zimmer-Legende sind pro Gebäude erstellt

// --------------------------------------------------------------------------------

function annotationenErstellen(gebaeudeListe) {
  for (const gebaeude of gebaeudeListe) {
    donutErstellen(
      gebaeude.mitteX,
      gebaeude.mitteZ,
      gebaeude.ringInnenRadius,
      gebaeude.ringAussenRadius,
      gebaeude.flaechePro416Kategorie
    );
    zimmerLegendeErstellen(gebaeude.mitteX, gebaeude.mitteZ, gebaeude.ringAussenRadius, gebaeude.zimmerProWohnung);
  }
}

// --------------------------------------------------------------------------------

// Ziel: Kamera ist auf die Gesamtausdehnung aller Gebäude (inkl. Donut-Ring) zentriert

// ???: Es ist zu überprüfen ob diese Funktion noch gebraucht wird wenn wir die neue Rechteckfunktion ausführen oder ob es nicht mehr Sinn macht dies zuerst zu setzen und dann die Szene aufbauen.

// --------------------------------------------------------------------------------

function kameraAufGebaeudeZentrieren(gebaeudeListe) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const gebaeude of gebaeudeListe) {
    minX = Math.min(minX, gebaeude.mitteX - gebaeude.ringAussenRadius);
    maxX = Math.max(maxX, gebaeude.mitteX + gebaeude.ringAussenRadius);
    minZ = Math.min(minZ, gebaeude.mitteZ - gebaeude.ringAussenRadius);
    maxZ = Math.max(maxZ, gebaeude.mitteZ + gebaeude.ringAussenRadius);
  }

  const zentrumX = (minX + maxX) / 2;
  const zentrumZ = (minZ + maxZ) / 2;

  const aktuellesAspect = window.innerWidth / window.innerHeight;
  const randFaktor = 1.1; // 10% Rand
  frustumSize = Math.max(
    (maxZ - minZ) * randFaktor,
    ((maxX - minX) * randFaktor) / aktuellesAspect
  );
  kameraFrustumAktualisieren(aktuellesAspect);
  camera.position.set(zentrumX, 100, zentrumZ);
  camera.lookAt(zentrumX, 0, zentrumZ);

  controls.target.set(zentrumX, 0, zentrumZ);
  controls.update();
}












// --------------------------------------------------------------------------------

// Ziel: SIA416 Flächen sind als Donut um jedes Gebäude dargestellt

// --------------------------------------------------------------------------------

function donutErstellen(mitteX, mitteZ, innenRadius, aussenRadius, flaechePro416Kategorie) {
  const Bruttogeschossflaeche = Object.values(flaechePro416Kategorie).reduce((summe, f) => summe + f, 0);
  if (Bruttogeschossflaeche === 0) return; // keine kategorisierten Räume -> kein Donut zeichnen

  let winkel = 0; // Startwinkel des nächsten Segments, läuft von 0 bis 2*PI
  for (const [sia416_definition, flaeche] of Object.entries(flaechePro416Kategorie)) {
    const prozentAnteil = flaeche / Bruttogeschossflaeche;
    const segmentWinkel = prozentAnteil * Math.PI * 2;

    const donutFill = flaechenfarbenSia416farben[sia416_definition] || "#999999"; // Fallback, falls Kategorie keine Farbe hat
    const donutGeometrie = new THREE.RingGeometry(innenRadius, aussenRadius, 100, 1, winkel, segmentWinkel); // 100 = Anzahl Segmente der einzelnen Segmente | 1 = keine Segmente vom inneren zum äusseren Ring
    const donutMaterial = new THREE.MeshBasicMaterial({ color: donutFill}); // falls es auf beide Seiten gefärbt werden muss diesen teil reinkopieren ", side: THREE.DoubleSide" 
    const donutSegment = new THREE.Mesh(donutGeometrie, donutMaterial);

    donutSegment.rotation.x = -Math.PI / 2; // Ansicht wäre grundsätzlich von Vorne und muss gedreht werden
    donutSegment.position.set(mitteX, 1, mitteZ); // 1 = 1m über dem Grundriss platziert
    scene.add(donutSegment);

    winkel += segmentWinkel;
  }
}

// --------------------------------------------------------------------------------

// Ziel: Zimmerzahl sind dargestellt

// --------------------------------------------------------------------------------

function kreisErstellen(mitteX, mitteZ, thetaLength = Math.PI * 2) {
  const kreisRadius = 0.6; // Meter
  const kreisDicke = 0.2; // Meter
  const kreisSegmente = 32 // Anzahl Segemente rundherum
  const kreisStartwinkel = 0
  const geometrie = new THREE.RingGeometry(kreisRadius - kreisDicke, kreisRadius, kreisSegmente, 1, kreisStartwinkel, thetaLength);
  const material = new THREE.MeshBasicMaterial({ color: "#000000", side: THREE.DoubleSide });
  const kreis = new THREE.Mesh(geometrie, material);
  kreis.rotation.x = -Math.PI / 2;
  kreis.position.set(mitteX, 0.01, mitteZ);
  scene.add(kreis);
}
function zimmerLegendeErstellen(mitteX, mitteZ, ringAussenRadius, zimmerProWohnung) {
  const wohnungenProZimmerzahl = {};
  for (const zimmerzahl of Object.values(zimmerProWohnung)) {
    wohnungenProZimmerzahl[zimmerzahl] = (wohnungenProZimmerzahl[zimmerzahl] || 0) + 1;
  }

  const zimmerzahlen = Object.keys(wohnungenProZimmerzahl).map(Number).sort((a, b) => a - b); // Aufsteigend sortiert

  const kreisAbstand = 1.6; // Meter zwischen Kreis-Mittelpunkten in einer Reihe
  const reihenAbstand = 2.6; // Meter zwischen den Reihen
  const abstandZumDonut = 2; // Meter Lücke zwischen Donut-Aussenkante und erster Reihe

  zimmerzahlen.forEach((zimmerzahl, reihenIndex) => {
    const reihenZ = mitteZ - ringAussenRadius - abstandZumDonut - reihenIndex * reihenAbstand;
    const volleKreise = Math.floor(zimmerzahl);
    const halberKreis = zimmerzahl - volleKreise >= 0.5;

    const anzahlWohnungen = wohnungenProZimmerzahl[zimmerzahl];
    beschriftungHinzufuegen(`${anzahlWohnungen} Stk.`, new THREE.Vector3(mitteX - 3, 0, reihenZ)); // 3 = Abstand, damit der Text vor dem ersten Kreis nicht mit ihm überlappt

    let kreisX = mitteX;
    for (let i = 0; i < volleKreise; i++) {
      kreisErstellen(kreisX, reihenZ);
      kreisX += kreisAbstand;
    }
    if (halberKreis) {
      kreisErstellen(kreisX, reihenZ, Math.PI);
      kreisX += kreisAbstand;
    }
  });
}

// --------------------------------------------------------------------------------

// Ziel: Bei Linksklick auf ein Element erscheint eine Infobox mit seinen Daten

// --------------------------------------------------------------------------------

const klickbareObjekte = [];

const raycaster = new THREE.Raycaster(); // greift die nächste Linie resp. Fläche die sich bei der Maus befindet
raycaster.params.Line2 = { threshold: 8 }; // die Zahl ist die Tolleranz wie genau ich die Linie treffen muss

const infobox = document.getElementById("infobox");

renderer.domElement.addEventListener("click", (e) => {
  const maus = new THREE.Vector2(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );

  raycaster.setFromCamera(maus, camera);
  const treffer = raycaster.intersectObjects(klickbareObjekte);

  if (treffer.length === 0) {
    infobox.style.display = "none";
    return;
  }

  const naechsterTreffer = treffer[0];
  const zeile = naechsterTreffer.object.userData.zeilen[naechsterTreffer.faceIndex];

  // hier kann ich das infofeld mit informationen gestalten
  // <strong>  = bolt </strong>

  infobox.innerHTML = `
    <strong>${zeile.entitaet_subtyp ?? "–"}</strong><br>
    Geschoss: ${zeile.geschoss_label ?? "–"}<br>
    Fläche: ${(zeile.entitaet_typ === "Raum" || zeile.entitaet_typ === "Geschossfläche") ? zeile.flaeche + " m2" : ""}<br>
  `;
  infobox.style.left = `${e.clientX + 12}px`;
  infobox.style.top = `${e.clientY + 12}px`;
  infobox.style.display = "block";
});