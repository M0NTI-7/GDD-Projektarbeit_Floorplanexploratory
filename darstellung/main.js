// --------------------------------------------------------------------------------

// ZIEL: Alle importe Global ausführen

// --------------------------------------------------------------------------------

import * as THREE from "three"; // Importiert die ganze Three.js-Bibliothek als ein grosses Objekt mit ganz vielen Klassen
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";










// --------------------------------------------------------------------------------

// Ziel: Sämtliche Farben, Stifte und Texturen sind global am Anfang definiert und können von allen Gebäuden verwendet werden

// --------------------------------------------------------------------------------

const stiftfarbeUmfassungslinie = { // { } definiert ein Objekt wie ein Nachschlagewerk/Lexikon. stiftfarbeUmfassungslinie["Raum"] schlägt den Schlüssel "Raum" nach und gibt den dazugehörigen Wert zurück.
  "Geschossfläche": new LineMaterial({ color: "#000000", linewidth: 2 }), // Dicke: 2px, Farbe: schwarz
  "Raum":           new LineMaterial({ color: "#000000", linewidth: 2 }),
  "Öffnung":        new LineMaterial({ color: "#000000", linewidth: 1 }),
  "Ausstattung":    new LineMaterial({ color: "#000000", linewidth: 1 }),
};

const gebaeudeLinienMaterialien = []; // [ ] ein Array | eine geordnete Liste von Werten durchnummeriert von 0
const alleWohnungsKreise = [];
const alleZimmerKonturen = [];










// --------------------------------------------------------------------------------

// Ziel: Szene ist erstellt

// --------------------------------------------------------------------------------

const scene = new THREE.Scene(); // holt den Szene-Bauplan aus THREE-Objekt und new THREE.Scene() erzeugt danach eine neue leere Szene-Instanz

let obererRandPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--oberer-rand")) || 0;
  // parseFloat formt den Wert von "--oberer-rand" in eine Zahl um
  // getComputedStyle berechnet alle aktuell geltenden CSS-Werte für das <html>-Element
  // document.documentElement zeigt auf das <html> Element | document selbst auf das html und .documentElement auf das Element :root
  // .getPropertyValue("--oberer-rand") ist das var(--oberer-rand) vom CSS-Syntax
  // || 0 ist die Rückfallebene falls es kein Wert bei "--oberer-rand" hat

function canvasBreite() {
  return window.innerWidth;
}

function canvasHoehe() {
  return window.innerHeight - obererRandPx;
}

let frustumSize = 50;
let detailSichtbar = false;
let kameraGeschwenkt = false;
let positionierungFixiert = false;

const DETAIL_SCHWELLE_METER = 400; // Schwellenwert ab wann die einzelnen Räume dargestellt werden.
const SCHWENK_SCHWELLE_RAD = THREE.MathUtils.degToRad(3);
const STARTGESCHOSS_LABEL = "0101 | 01 OG";
const KAMERA_FOV = 50; // Grad - Blickwinkel der Perspective-Kamera bei gekippter Ansicht
const aspect = canvasBreite() / canvasHoehe();

const kameraOrtho = new THREE.OrthographicCamera(
  (-frustumSize * aspect) / 2,
  (frustumSize * aspect) / 2,
  frustumSize / 2,
  -frustumSize / 2,
  0.01, // alles was näher als 0.1 ist wird nicht dargestellt
  10000 // alles was weiter weg als 1000 ist wird nicht dargestellt
);

const kameraPerspektive = new THREE.PerspectiveCamera(KAMERA_FOV, aspect, 1, 10000);

let camera = kameraOrtho;

camera.position.set(0, 100, 0); // koordinatensystem = von vorne nicht wie CAD, Y ist die Höhe
camera.lookAt(0, 0, 0);

function kameraFrustumAktualisieren(aspect) {
  kameraOrtho.left = (-frustumSize * aspect) / 2;
  kameraOrtho.right = (frustumSize * aspect) / 2;
  kameraOrtho.top = frustumSize / 2;
  kameraOrtho.bottom = -frustumSize / 2;
  kameraOrtho.updateProjectionMatrix();

  kameraPerspektive.aspect = aspect;
  kameraPerspektive.updateProjectionMatrix();
}

function kameraDistanzFuerSichtbareHoehe(hoeheMeter) {
  return hoeheMeter / (2 * Math.tan(THREE.MathUtils.degToRad(kameraPerspektive.fov / 2)));
}

// Wechselt die aktive Kamera und überträgt dabei Blickrichtung und sichtbare Höhe von der alten auf die neue Kamera, damit der Wechsel nicht sichtbar "springt".
function kameraTypWechseln(neueKamera) {
  if (neueKamera === camera) return;

  const sichtbareHoeheMeter = sichtbareHoeheMeterAktuell();
  const richtung = camera.position.clone().sub(controls.target).normalize();

  if (neueKamera === kameraPerspektive) {
    const distanz = kameraDistanzFuerSichtbareHoehe(sichtbareHoeheMeter);
    kameraPerspektive.position.copy(controls.target).addScaledVector(richtung, distanz);
  } else {
    kameraOrtho.zoom = frustumSize / sichtbareHoeheMeter;
    kameraOrtho.position.copy(camera.position);
    kameraOrtho.updateProjectionMatrix();
  }
  neueKamera.lookAt(controls.target);

  camera = neueKamera;
  controls.object = camera;
  controls.update();
}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // alpha: Canvas-Hintergrund transparent statt opak
renderer.setClearColor(0x000000, 0);
renderer.setSize(canvasBreite(), canvasHoehe());
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

function linienMaterialAufloesungenAktualisieren() {
  for (const material of Object.values(stiftfarbeUmfassungslinie)) renderer.getSize(material.resolution);
  for (const material of gebaeudeLinienMaterialien) renderer.getSize(material.resolution);
}

linienMaterialAufloesungenAktualisieren();











// Ziel: Die Kammerasteuerung ist korrekt eingestellt

const controls = new OrbitControls(camera, renderer.domElement);

controls.target.set(0, 0, 0);
controls.zoomSpeed = 10; // Hier kann die Zoomgeschwindigkeit angepasst werden
controls.zoomToCursor = true;
controls.minDistance = 1;
controls.maxDistance = 9000;
controls.mouseButtons = {
  MIDDLE: THREE.MOUSE.PAN,
  RIGHT: THREE.MOUSE.ROTATE,
};

function layoutAktualisieren() {
  const aspect = canvasBreite() / canvasHoehe();
  kameraFrustumAktualisieren(aspect);

  renderer.setSize(canvasBreite(), canvasHoehe());
  linienMaterialAufloesungenAktualisieren();
}

window.addEventListener("resize", layoutAktualisieren);










// Ziel: Zoom und Kippwinkel der Kamera steuern Detailgrad, Kameratyp und Massstab der Darstellung

function sichtbareHoeheMeterAktuell() {
  if (camera === kameraOrtho) return frustumSize / kameraOrtho.zoom;
  return 2 * camera.position.distanceTo(controls.target) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
}

// Wechsel der Grundrissdarstellung von Schwarzplan zu Grundriss

function detailSichtbarkeitAktualisieren(erzwingen = false) {
  const sichtbareHoeheMeter = sichtbareHoeheMeterAktuell();
  const neuDetailSichtbar = sichtbareHoeheMeter <= DETAIL_SCHWELLE_METER;
  if (!erzwingen && neuDetailSichtbar === detailSichtbar) return;

  detailSichtbar = neuDetailSichtbar;
  for (const gebaeude of gebaeudeNachId.values()) {
    for (const gruppe of gebaeude.linienMaterialien) {
      linienSichtbarkeitAnwenden(gruppe);
    }
  }
}

function kameraSchwenkAktualisieren(erzwingen = false) {
  const neuGeschwenkt = controls.getPolarAngle() > SCHWENK_SCHWELLE_RAD;
  if (!erzwingen && neuGeschwenkt === kameraGeschwenkt) return;

  kameraGeschwenkt = neuGeschwenkt;
  kameraTypWechseln(kameraGeschwenkt ? kameraPerspektive : kameraOrtho);
  for (const gebaeude of gebaeudeNachId.values()) {
    for (const gruppe of gebaeude.linienMaterialien) {
      linienSichtbarkeitAnwenden(gruppe);
    }
  }
}









// Ziel: WASD bewegt die Kamera zusätzlich zur Maussteuerung

const wasdGedrueckt = new Set();

window.addEventListener("keydown", (e) => {
  const taste = e.key.toLowerCase();
  if (taste === "w" || taste === "a" || taste === "s" || taste === "d") wasdGedrueckt.add(taste);
});

window.addEventListener("keyup", (e) => {
  wasdGedrueckt.delete(e.key.toLowerCase());
});

const WASD_GESCHWINDIGKEIT_FAKTOR = 0.5; // Meter pro Sekunde, pro Meter sichtbarer Szenenhöhe - skaliert automatisch mit dem Zoom
let letzterFrameZeitpunkt = performance.now();

function wasdBewegungAnwenden() {
  const jetzt = performance.now();
  const deltaSekunden = (jetzt - letzterFrameZeitpunkt) / 1000;
  letzterFrameZeitpunkt = jetzt;

  if (wasdGedrueckt.size === 0) return;

  const azimut = controls.getAzimuthalAngle();
  const vorwaerts = new THREE.Vector3(-Math.sin(azimut), 0, -Math.cos(azimut));
  const rechts = new THREE.Vector3(-vorwaerts.z, 0, vorwaerts.x);

  const bewegung = new THREE.Vector3();
  if (wasdGedrueckt.has("w")) bewegung.add(vorwaerts);
  if (wasdGedrueckt.has("s")) bewegung.sub(vorwaerts);
  if (wasdGedrueckt.has("d")) bewegung.add(rechts);
  if (wasdGedrueckt.has("a")) bewegung.sub(rechts);
  if (bewegung.lengthSq() === 0) return;

  const distanz = sichtbareHoeheMeterAktuell() * WASD_GESCHWINDIGKEIT_FAKTOR * deltaSekunden;
  bewegung.normalize().multiplyScalar(distanz);

  camera.position.add(bewegung);
  controls.target.add(bewegung);
}

renderer.setAnimationLoop(() => {
  wasdBewegungAnwenden();
  controls.update();
  detailSichtbarkeitAktualisieren();
  kameraSchwenkAktualisieren();
  wohnungsKreiseSkalierenAnKamera();
  renderer.render(scene, camera);
});









const WOHNUNGSKREIS_REFERENZ_METER = 300;
const ZIMMER_KONTUR_EINFUEGEPUNKT_OFFSET = THREE.MathUtils.degToRad(120);

function wohnungsKreiseSkalierenAnKamera() {
  const sichtbareHoeheMeter = sichtbareHoeheMeterAktuell();
  const faktor = Math.max(1, sichtbareHoeheMeter / WOHNUNGSKREIS_REFERENZ_METER);
  for (const kreis of alleWohnungsKreise) {
    if (kreis.visible) kreis.scale.setScalar(faktor);
  }

  const azimut = controls.getAzimuthalAngle() + ZIMMER_KONTUR_EINFUEGEPUNKT_OFFSET;
  for (const kontur of alleZimmerKonturen) {
    if (kontur.visible) kontur.rotation.y = azimut;
  }
}








// Ziel: Gebäude-/Wohnungs-/Zimmer-Slot der Filterleiste zeigen ihre mehreren Kennzahlen als Tabs

const filterLeisteElement = document.getElementById("filter-leiste");

for (const label of document.querySelectorAll(".filter-slot-label")) {
  label.addEventListener("click", () => {
    const slot = label.closest(".filter-slot");
    const eingeklappt = slot.classList.toggle("eingeklappt");
    label.setAttribute("aria-expanded", String(!eingeklappt));
  });
}

new ResizeObserver(() => {
  obererRandPx = filterLeisteElement.getBoundingClientRect().height;
  document.documentElement.style.setProperty("--oberer-rand", `${obererRandPx}px`);
  layoutAktualisieren();
}).observe(filterLeisteElement);

const FILTER_GRUPPEN = {
  gebaeude: ["gf", "hnfAnteil", "wohnungen", "anzahlWohnungenProGeschoss", "gebaeudetiefe", "geschossigkeit"],
  wohnungen: ["wohnungsgroesse", "zimmer", "anzahlBadezimmer"],
  zimmer: ["wohnenSchlafenGroesse", "kuechengroesse", "esszimmergroesse", "nasszellengroesse", "reduitgroesse", "balkongroesse"],
};

function filterTabsInitialisieren() {
  for (const [gruppenName, dims] of Object.entries(FILTER_GRUPPEN)) {
    const slot = document.querySelector(`.filter-slot[data-slot="${gruppenName}"]`);
    const nav = slot.querySelector(".filter-tabs");
    const body = slot.querySelector(".filter-slot-body");

    dims.forEach((dim, i) => {
      const card = body.querySelector(`.chart-card[data-dim="${dim}"]`);
      const label = card.querySelector("h3").textContent;

      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "filter-tab";
      tab.dataset.dim = dim;
      tab.append(label);

      tab.addEventListener("click", () => {
        for (const anderesTab of nav.querySelectorAll(".filter-tab")) anderesTab.classList.remove("aktiv");
        for (const andereCard of body.querySelectorAll(".chart-card")) andereCard.classList.remove("aktiv");
        tab.classList.add("aktiv");
        card.classList.add("aktiv");
      });

      if (i === 0) {
        tab.classList.add("aktiv");
        card.classList.add("aktiv");
      }
      nav.appendChild(tab);
    });
  }
}
filterTabsInitialisieren();










// --------------------------------------------------------------------------------

// Ziel: CSV-Datei ist geladen und die Daten sind in einem Array gespeichert

// --------------------------------------------------------------------------------




// const csvPfad = "../data-prep/65_geometries_erste100.csv"; // für zum Testen
const csvPfad = "../data-prep/10_geometries_final.csv";




const NUMERISCHE_SPALTEN = new Set(["flaeche", "zimmer_zaehler", "hoehenkote"]);

const splashFortschrittElement = document.getElementById("splash-fortschritt");

fetch(csvPfad)
  .then((antwort) => antwort.blob())
  .then((blob) => {
    const gebaeudeDaten = [];
    const gesehenGebaeudeIds = new Set(); // wächst live mit, für die Gebäude-Anzahl in der Ladeanzeige
    Papa.parse(blob, {
      header: true,
      skipEmptyLines: true,
      chunkSize: 5 * 1024 * 1024,
      transform: (wert, spalte) => (NUMERISCHE_SPALTEN.has(spalte) ? (wert === "" ? 0 : Number(wert)) : wert),
      chunk: (ergebnis) => {
        for (const zeile of ergebnis.data) {
          gebaeudeDaten.push(zeile);
          gesehenGebaeudeIds.add(zeile.gebaeude_id);
        }
        const prozent = Math.round((ergebnis.meta.cursor / blob.size) * 100);
        splashFortschrittElement.textContent = Number.isFinite(prozent)
          ? `${prozent}% geladen (${gesehenGebaeudeIds.size.toLocaleString("de-CH")} Gebäude)`
          : `${gesehenGebaeudeIds.size.toLocaleString("de-CH")} Gebäude geladen…`;
      },
      complete: () => {
        splashFortschrittElement.textContent = "Grundrisse werden geladen...";
        setTimeout(() => gebaeudeDarstellen(gebaeudeDaten), 0);
      },
    });
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

function segmenteHinzufuegen(zielArray, kontur, hoehenkote = 0) {
  for (let i = 0; i < kontur.length - 1; i++) {
    const [x0, y0] = kontur[i];
    const [x1, y1] = kontur[i + 1];
    zielArray.push(x0, hoehenkote, y0, x1, hoehenkote, y1);
  }
}

const schwarzplanMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
const gestapelteFuellungMaterial = new THREE.MeshBasicMaterial({ color: cssFarbeAufloesen("var(--layout-hintergrund)"), side: THREE.DoubleSide }); // Farbe: GF Mesh bei Isometrie

function fuellungMaterialSetzen(fuellung, material) {
  if (!fuellung) return;
  if (fuellung.isMesh) {
    fuellung.material = material;
  } else {
    for (const mesh of fuellung.children) mesh.material = material;
  }
}

function punktInKontur([px, py], kontur) {
  let innen = false;
  for (let i = 0, j = kontur.length - 1; i < kontur.length; j = i++) {
    const [xi, yi] = kontur[i];
    const [xj, yj] = kontur[j];
    const schneidet = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (schneidet) innen = !innen;
  }
  return innen;
}

// Ziel: Aus den Geschossfläche-Zeilen eines Geschosses eine gefüllte schwarze Fläche

function schwarzplanFuellungErstellen(rohZeilen) {
  const meshes = [];

  for (const zeile of rohZeilen) {
    if (zeile.konturen.length === 0) continue;

    const nachFlaecheAbsteigend = zeile.konturen
      .slice()
      .sort((a, b) => Math.abs(flaecheAusKontur(b)) - Math.abs(flaecheAusKontur(a)));

    const aussenKonturen = [];
    for (const kontur of nachFlaecheAbsteigend) {
      const passendeAussenkontur = aussenKonturen.find((a) => punktInKontur(kontur[0], a.kontur));
      if (passendeAussenkontur) {
        passendeAussenkontur.shape.holes.push(new THREE.Path(kontur.map(([x, y]) => new THREE.Vector2(x, y))));
      } else {
        const shape = new THREE.Shape(kontur.map(([x, y]) => new THREE.Vector2(x, y)));
        aussenKonturen.push({ shape, kontur });
      }
    }

    for (const { shape } of aussenKonturen) {
      const geometrie = new THREE.ShapeGeometry(shape);
      const mesh = new THREE.Mesh(geometrie, schwarzplanMaterial);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = zeile.hoehenkote - 0.05;
      meshes.push(mesh);
    }
  }

  if (meshes.length === 0) return null;
  if (meshes.length === 1) return meshes[0];

  const gruppe = new THREE.Group();
  gruppe.add(...meshes);
  return gruppe;
}

const raumKlickflaecheMaterial = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const raumHighlightMaterial = new THREE.MeshBasicMaterial({
  color: "#ff0000",
  transparent: true,
  opacity: 0.45,
  depthWrite: false,
  side: THREE.DoubleSide,
});

function raumKlickflaechenErstellen(rohZeilen) {
  const geometrien = [];
  const raeume = [];

  for (const zeile of rohZeilen) {
    if (zeile.konturen.length === 0) continue;

    const nachFlaecheAbsteigend = zeile.konturen
      .slice()
      .sort((a, b) => Math.abs(flaecheAusKontur(b)) - Math.abs(flaecheAusKontur(a)));

    const aussenKonturen = [];
    for (const kontur of nachFlaecheAbsteigend) {
      const passendeAussenkontur = aussenKonturen.find((a) => punktInKontur(kontur[0], a.kontur));
      if (passendeAussenkontur) {
        passendeAussenkontur.shape.holes.push(new THREE.Path(kontur.map(([x, y]) => new THREE.Vector2(x, y))));
      } else {
        const shape = new THREE.Shape(kontur.map(([x, y]) => new THREE.Vector2(x, y)));
        aussenKonturen.push({ shape, kontur });
      }
    }

    for (const { shape } of aussenKonturen) {
      const geometrie = new THREE.ShapeGeometry(shape);
      geometrie.translate(0, 0, -(zeile.hoehenkote - 0.005)); // knapp unter den Linien, damit diese bei aktiviertem Highlight obenauf bleiben
      geometrien.push(geometrie);
      raeume.push(zeile);
    }
  }

  if (geometrien.length === 0) return null;

  const geometrie = mergeGeometries(geometrien, true);
  for (const gruppe of geometrie.groups) gruppe.materialIndex = RAUM_MATERIAL_INDEX.standard;

  const mesh = new THREE.Mesh(geometrie, RAUM_MATERIALIEN_ARRAY);
  mesh.rotation.x = Math.PI / 2;
  mesh.userData.raeume = raeume;
  return mesh;
}











// Ziel: Pro Wohnung eine kreisförmige Flächenfüllung

function cssFarbeAufloesen(varAusdruck) {
  const name = varAusdruck.match(/--[\w-]+/)[0];
  const wert = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(wert);
}

const ZIMMER_STRICH_WINKEL_SCHRITT = THREE.MathUtils.degToRad(20); // Winkelabstand zwischen zwei Strich-Mitten
const ZIMMER_STRICH_WINKEL_BREITE = THREE.MathUtils.degToRad(12); // Länge eines vollen Strichs (in Grad Bogenmass)
const ZIMMER_STRICH_HOEHE = 1.5; // Meter - wie hoch die Strich-"Balken" aus der Grundfläche ragen
const ZIMMER_STRICH_DICKE = 1; // Meter - radiale Dicke der Striche. 

function bogenWandErstellen(radius, winkelMitte, winkelBreite, segmente = 12) {
  const start = winkelMitte - winkelBreite / 2;
  const innenRadius = radius;
  const aussenRadius = radius + ZIMMER_STRICH_DICKE;

  const vertices = [];
  for (let i = 0; i <= segmente; i++) {
    const w = start + (i / segmente) * winkelBreite;
    const cosW = Math.cos(w), sinW = Math.sin(w);
    vertices.push(
      innenRadius * cosW, 0, innenRadius * sinW,
      aussenRadius * cosW, 0, aussenRadius * sinW,
      innenRadius * cosW, ZIMMER_STRICH_HOEHE, innenRadius * sinW,
      aussenRadius * cosW, ZIMMER_STRICH_HOEHE, aussenRadius * sinW
    );
  }

  const indices = [];
  for (let i = 0; i < segmente; i++) {
    const iInnenU = i * 4, iAussenU = i * 4 + 1, iInnenO = i * 4 + 2, iAussenO = i * 4 + 3;
    const jInnenU = iInnenU + 4, jAussenU = iAussenU + 4, jInnenO = iInnenO + 4, jAussenO = iAussenO + 4;

    indices.push(iInnenO, iAussenO, jAussenO, iInnenO, jAussenO, jInnenO);
    indices.push(iAussenU, iAussenO, jAussenO, iAussenU, jAussenO, jAussenU);
    indices.push(iInnenU, jInnenU, jInnenO, iInnenU, jInnenO, iInnenO);
  }

  indices.push(0, 2, 3, 0, 3, 1);
  const letzte = segmente * 4;
  indices.push(letzte, letzte + 1, letzte + 3, letzte, letzte + 3, letzte + 2);

  return { vertices, indices };
}

function wohnungsStrichKonturErstellen(radius, anzahl) {
  const volleStriche = Math.floor(anzahl);
  const halberStrich = anzahl - volleStriche >= 0.5;
  if (volleStriche === 0 && !halberStrich) return null;

  const alleVertices = [];
  const alleIndices = [];
  const bogenHinzufuegen = (winkelMitte, winkelBreite) => {
    const { vertices, indices } = bogenWandErstellen(radius, winkelMitte, winkelBreite);
    const basis = alleVertices.length / 3;
    alleVertices.push(...vertices);
    for (const index of indices) alleIndices.push(index + basis);
  };

  for (let i = 0; i < volleStriche; i++) {
    bogenHinzufuegen(i * ZIMMER_STRICH_WINKEL_SCHRITT, ZIMMER_STRICH_WINKEL_BREITE);
  }
  if (halberStrich) {
    bogenHinzufuegen(volleStriche * ZIMMER_STRICH_WINKEL_SCHRITT, ZIMMER_STRICH_WINKEL_BREITE / 2);
  }

  const geometrie = new THREE.BufferGeometry();
  geometrie.setAttribute("position", new THREE.Float32BufferAttribute(alleVertices, 3));
  geometrie.setIndex(alleIndices);

  // Hier können die Kreissegmente der Zimmer pro WHG und Anzahl Badezimmer angepasst werden
  const material = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  return new THREE.Mesh(geometrie, material);
}

function wohnungsKreiseErstellen(gebaeude) {
  const bboxProWohnung = {};
  for (const zeile of gebaeude.zeilen) {
    if (zeile.entitaet_typ !== "Raum" || !zeile.wohnungs_id) continue;
    if (!bboxProWohnung[zeile.wohnungs_id]) {
      bboxProWohnung[zeile.wohnungs_id] = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, hoehenkote: Infinity };
    }
    const bbox = bboxProWohnung[zeile.wohnungs_id];
    for (const kontur of zeile.konturen) {
      for (const [x, z] of kontur) {
        if (x < bbox.minX) bbox.minX = x;
        if (x > bbox.maxX) bbox.maxX = x;
        if (z < bbox.minZ) bbox.minZ = z;
        if (z > bbox.maxZ) bbox.maxZ = z;
      }
    }
    if (zeile.hoehenkote < bbox.hoehenkote) bbox.hoehenkote = zeile.hoehenkote;
  }

  function konturRegistrieren(kontur, mitteX, mitteZ, hoehenkote) {
    if (!kontur) return null;
    kontur.position.set(mitteX, hoehenkote, mitteZ);
    kontur.visible = false;
    scene.add(kontur);
    gebaeude.linienObjekte.push(kontur);
    alleWohnungsKreise.push(kontur); // für die Zoom-Skalierung
    alleZimmerKonturen.push(kontur); // für die Billboard-Rotation zur Kamera
    return kontur;
  }

  const kreise = {};
  const zimmerKonturen = {};
  const badezimmerKonturen = {};
  for (const [wohnungId, bbox] of Object.entries(bboxProWohnung)) {
    const flaeche = gebaeude.wohnungsFlaeche[wohnungId] || 0;
    if (flaeche <= 0) continue;

    const radius = Math.sqrt((flaeche * 4) / Math.PI); // Kreisgrösse für Filter Wohnungen ändern
    const mitteX = (bbox.minX + bbox.maxX) / 2;
    const mitteZ = (bbox.minZ + bbox.maxZ) / 2;

    const geometrie = new THREE.CircleGeometry(radius, 96);
    const material = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const kreis = new THREE.Mesh(geometrie, material);
    kreis.rotation.x = Math.PI / 2;
    kreis.position.set(mitteX, bbox.hoehenkote, mitteZ);
    kreis.visible = false; // erst sichtbar, wenn wohnungsMarkierungAktualisieren eine passende Wohnung findet

    scene.add(kreis);
    gebaeude.linienObjekte.push(kreis); // damit gebaeudePositionSetzen ihn beim Neu-Packen mitverschiebt
    alleWohnungsKreise.push(kreis); // für die Zoom-Skalierung, siehe wohnungsKreiseSkalierenAnKamera
    kreise[wohnungId] = kreis;

    // Zimmer-Strich-Kontur auf dem Rand DIESES Kreises
    const zimmerKontur = wohnungsStrichKonturErstellen(radius, gebaeude.zimmerProWohnung[wohnungId] || 0);
    if (konturRegistrieren(zimmerKontur, mitteX, mitteZ, bbox.hoehenkote)) {
      zimmerKonturen[wohnungId] = zimmerKontur;
    }

    const badezimmerKontur = wohnungsStrichKonturErstellen(radius * 1.25, gebaeude.badAnzahl[wohnungId] || 0);
    if (konturRegistrieren(badezimmerKontur, mitteX, mitteZ, bbox.hoehenkote)) {
      badezimmerKonturen[wohnungId] = badezimmerKontur;
    }
  }
  return { kreise, zimmerKonturen, badezimmerKonturen };
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
      const { koordinaten, ...rest } = zeile;
      return { ...rest, konturen };
    });

    const breite = maxX - minX;
    const tiefe = maxY - minY;

    const radius = Math.sqrt(breite ** 2 + tiefe ** 2) / 2;
    const ringAussenRadius = radius * 1.35; // 15% Abstand zum Gebäude + 20% Ringdicke, für Kamera-Zentrierung und Zimmer-Legende

    const flaechePro416Kategorie = {};
    const zimmerProWohnung = {};
    const geschossIds = new Set();
    let gf = 0;
    let maxHoehenkote = 0; // höchster hoehenkote-Wert im Gebäude

    const wohnungsFlaeche = {};
    const wohnenSchlafenFlaechen = {};
    const esszimmerFlaechen = {};
    const kuecheFlaeche = {};
    const balkonFlaeche = {};
    const reduitFlaeche = {};
    const nasszelleFlaeche = {};
    const badAnzahl = {};

    const wohnungenJeGeschoss = new Map();
    const heimGeschossProWohnung = new Map();

    for (const zeile of zeilenMitPunkten) {
      geschossIds.add(zeile.geschoss_id);
      if (zeile.hoehenkote > maxHoehenkote) maxHoehenkote = zeile.hoehenkote;

      if (zeile.entitaet_typ === "Raum" && zeile.definition) {
        flaechePro416Kategorie[zeile.definition] =
          (flaechePro416Kategorie[zeile.definition] || 0) + (zeile.flaeche || 0);
      }
      if (zeile.entitaet_typ === "Raum" && zeile.wohnungs_id) {
        const wohnungId = zeile.wohnungs_id;
        const flaeche = zeile.flaeche || 0;

        zimmerProWohnung[wohnungId] = (zimmerProWohnung[wohnungId] || 0) + (zeile.zimmer_zaehler || 0);
        wohnungsFlaeche[wohnungId] = (wohnungsFlaeche[wohnungId] || 0) + flaeche;
        if (WOHNEN_SCHLAFEN_SUBTYPEN.has(zeile.entitaet_subtyp)) {
          if (!wohnenSchlafenFlaechen[wohnungId]) wohnenSchlafenFlaechen[wohnungId] = [];
          wohnenSchlafenFlaechen[wohnungId].push(flaeche);
        }
        if (ESSEN_SUBTYPEN.has(zeile.entitaet_subtyp)) {
          if (!esszimmerFlaechen[wohnungId]) esszimmerFlaechen[wohnungId] = [];
          esszimmerFlaechen[wohnungId].push(flaeche);
        }
        if (KUECHE_SUBTYPEN.has(zeile.entitaet_subtyp)) kuecheFlaeche[wohnungId] = (kuecheFlaeche[wohnungId] || 0) + flaeche;
        if (BALKON_SUBTYPEN.has(zeile.entitaet_subtyp)) balkonFlaeche[wohnungId] = (balkonFlaeche[wohnungId] || 0) + flaeche;
        if (REDUIT_SUBTYPEN.has(zeile.entitaet_subtyp)) reduitFlaeche[wohnungId] = (reduitFlaeche[wohnungId] || 0) + flaeche;
        if (NASSZELLE_SUBTYPEN.has(zeile.entitaet_subtyp)) nasszelleFlaeche[wohnungId] = (nasszelleFlaeche[wohnungId] || 0) + flaeche;
        if (zeile.entitaet_subtyp === "Badezimmer") badAnzahl[wohnungId] = (badAnzahl[wohnungId] || 0) + 1;

        if (!wohnungenJeGeschoss.has(zeile.geschoss_label)) wohnungenJeGeschoss.set(zeile.geschoss_label, new Set());
        wohnungenJeGeschoss.get(zeile.geschoss_label).add(wohnungId);

        const bisherigesHeimGeschoss = heimGeschossProWohnung.get(wohnungId);
        if (bisherigesHeimGeschoss === undefined || zeile.geschoss_label < bisherigesHeimGeschoss) {
          heimGeschossProWohnung.set(wohnungId, zeile.geschoss_label);
        }
      }
      if (zeile.entitaet_typ === "Geschossfläche") {
        gf += flaecheAusKonturen(zeile.konturen);
      }
    }

    const wohnungenProGeschoss = {};
    for (const [wohnungId, geschoss] of heimGeschossProWohnung) {
      wohnungenProGeschoss[wohnungId] = wohnungenJeGeschoss.get(geschoss).size;
    }
    const heimGeschoss = Object.fromEntries(heimGeschossProWohnung);

    gebaeudeListe.push({
      gebaeude_id,
      zeilen: zeilenMitPunkten,
      mitteX: minX + breite / 2,
      mitteZ: minY + tiefe / 2,
      breite,
      tiefe,
      ringAussenRadius,
      flaechePro416Kategorie,
      zimmerProWohnung,
      geschossigkeit: geschossIds.size,
      gf,
      maxHoehenkote,
      hnfAnteil: gf > 0 ? ((flaechePro416Kategorie["HNF"] || 0) / gf) * 100 : 0, // in Prozent, nicht als Bruch (0-1)
      wohnungenAnzahl: Object.keys(zimmerProWohnung).length,
      wohnungsFlaeche,
      wohnenSchlafenFlaechen,
      esszimmerFlaechen,
      kuecheFlaeche,
      balkonFlaeche,
      reduitFlaeche,
      nasszelleFlaeche,
      badAnzahl,
      wohnungenProGeschoss,
      heimGeschoss,
    });
  }

  WOHNUNGEN = wohnungenAufbauen(gebaeudeListe);
  wohnungenNachId = new Map(WOHNUNGEN.map((wohnung) => [wohnung.wohnungId, wohnung]));

  gebaeudePacken(gebaeudeListe);

  for (const gebaeude of gebaeudeListe) {
    gebaeude.urspruenglicheMitteX = gebaeude.mitteX;
    gebaeude.urspruenglicheMitteZ = gebaeude.mitteZ;
  }

  gebaeudeNachId = new Map(gebaeudeListe.map((gebaeude) => [gebaeude.gebaeude_id, gebaeude]));

  for (const gebaeude of gebaeudeListe) {
    const geschossGruppen = {};

    for (const zeile of gebaeude.zeilen) {
      if (!stiftfarbeUmfassungslinie[zeile.entitaet_typ]) continue;

      const schluessel = `${zeile.entitaet_typ}|${zeile.geschoss_label}`;
      if (!geschossGruppen[schluessel]) {
        geschossGruppen[schluessel] = {
          positionen: [],
          zeilen: [],
          rohZeilen: [],
          entitaetTyp: zeile.entitaet_typ,
          geschossLabel: zeile.geschoss_label,
        };
      }
      const gruppe = geschossGruppen[schluessel];
      gruppe.rohZeilen.push(zeile);

      for (const kontur of zeile.konturen) {
        segmenteHinzufuegen(gruppe.positionen, kontur, zeile.hoehenkote);
        for (let i = 0; i < kontur.length - 1; i++) {
          gruppe.zeilen.push(zeile);
        }
      }
    }

    gebaeude.linienMaterialien = [];
    gebaeude.linienObjekte = [];

    for (const gruppe of Object.values(geschossGruppen)) {
      const material = stiftfarbeUmfassungslinie[gruppe.entitaetTyp].clone();
      material.transparent = true; // ermöglicht opacity 0 zum Ausblenden, siehe gebaeudeDimmingAktualisieren
      renderer.getSize(material.resolution);
      gebaeudeLinienMaterialien.push(material);

      const geometrie = new LineSegmentsGeometry();
      geometrie.setPositions(gruppe.positionen);

      const linien = new LineSegments2(geometrie, material);
      linien.computeLineDistances();
      linien.userData.zeilen = gruppe.zeilen;
      linien.visible = gruppe.entitaetTyp === "Geschossfläche" && gruppe.geschossLabel === STARTGESCHOSS_LABEL;
      scene.add(linien);
      klickbareObjekte.push(linien);
      gebaeude.linienObjekte.push(linien);

      // Schwarzplan-Füllung nur für Geschossfläche - Mesh statt Linien, siehe schwarzplanFuellungErstellen.
      let fuellung = null;
      if (gruppe.entitaetTyp === "Geschossfläche") {
        fuellung = schwarzplanFuellungErstellen(gruppe.rohZeilen);
        if (fuellung) {
          fuellung.visible = linien.visible;
          scene.add(fuellung);
          gebaeude.linienObjekte.push(fuellung);
        }
      }

      const klickflaeche = gruppe.entitaetTyp === "Raum" ? raumKlickflaechenErstellen(gruppe.rohZeilen) : null;
      if (klickflaeche) {
        klickflaeche.visible = linien.visible;
        scene.add(klickflaeche);
        klickbareObjekte.push(klickflaeche);
        alleRaumKlickflaechen.push(klickflaeche);
        gebaeude.linienObjekte.push(klickflaeche);
      }

      gebaeude.linienMaterialien.push({
        material,
        linien,
        fuellung,
        klickflaeche,
        geschossLabel: gruppe.geschossLabel,
        entitaetTyp: gruppe.entitaetTyp,
        gefiltertSichtbar: true,
        enthuellt: !(gruppe.entitaetTyp === "Geschossfläche" && gruppe.geschossLabel === STARTGESCHOSS_LABEL),
      });
    }

    const { kreise, zimmerKonturen, badezimmerKonturen } = wohnungsKreiseErstellen(gebaeude);
    gebaeude.wohnungsKreise = kreise;
    gebaeude.wohnungsZimmerKontur = zimmerKonturen;
    gebaeude.wohnungsBadezimmerKontur = badezimmerKonturen;
  }

  kameraAufGebaeudeZentrieren(gebaeudeListe);
  detailSichtbarkeitAktualisieren(true);
  filterPanelErstellen();

  splashAusblenden();
  enthuellungStarten(gebaeudeListe);
}











// --------------------------------------------------------------------------------

// Ziel: Akt 2 - Gebäude erscheinen beim ersten Laden zufällig gestaffelt

// --------------------------------------------------------------------------------

const ENTHUELLUNG_DAUER_MS = 4000; // Gesamtfenster, in dem alle Gebäude zufällig auftauchen (~3-5s)

const splashElement = document.getElementById("splash");
const kopfTitelElement = document.getElementById("kopf-titel");

function splashAusblenden() {
  splashElement.classList.add("ausgeblendet");
}

function filterLeisteEinblenden() {
  filterLeisteElement.classList.add("sichtbar");
  kopfTitelElement.classList.add("sichtbar");
}

splashElement.addEventListener("transitionend", () => {
  splashElement.style.display = "none";
});

function enthuellungStarten(gebaeudeListe) {
  const jetzt = performance.now();
  const wartendeGruppen = [];
  for (const gebaeude of gebaeudeListe) {
    for (const gruppe of gebaeude.linienMaterialien) {
      if (gruppe.enthuellt) continue;
      wartendeGruppen.push({ gruppe, zeitpunkt: jetzt + Math.random() * ENTHUELLUNG_DAUER_MS });
    }
  }
  if (wartendeGruppen.length === 0) {
    filterLeisteEinblenden();
    return;
  }

  function schritt() {
    const aktuelleZeit = performance.now();
    let alleFertig = true;
    for (const eintrag of wartendeGruppen) {
      if (eintrag.gruppe.enthuellt) continue;
      if (aktuelleZeit >= eintrag.zeitpunkt) {
        eintrag.gruppe.enthuellt = true;
        linienSichtbarkeitAnwenden(eintrag.gruppe);
      } else {
        alleFertig = false;
      }
    }
    if (!alleFertig) requestAnimationFrame(schritt);
    else filterLeisteEinblenden();
  }
  requestAnimationFrame(schritt);

  const ueberspringen = () => {
    for (const eintrag of wartendeGruppen) {
      if (!eintrag.gruppe.enthuellt) {
        eintrag.gruppe.enthuellt = true;
        linienSichtbarkeitAnwenden(eintrag.gruppe);
      }
    }
    filterLeisteEinblenden();
    window.removeEventListener("pointerdown", ueberspringen);
    window.removeEventListener("wheel", ueberspringen);
  };
  window.addEventListener("pointerdown", ueberspringen);
  window.addEventListener("wheel", ueberspringen);
}











// --------------------------------------------------------------------------------

// Ziel: Gebäude sind wie Rechtecke gepackt "rectangle packaging", statt an ihrer realen

// --------------------------------------------------------------------------------

const gebaeudeAbstand = 1; // Meter Mindestabstand zwischen zwei gepackten Gebäuden
const maxPackVersucheProGebaeude = 300;

function packPositionenBerechnen(gebaeudeUnterliste) {
  const gesamtFlaeche = gebaeudeUnterliste.reduce(
    (summe, g) => summe + (g.breite + gebaeudeAbstand) * (g.tiefe + gebaeudeAbstand),
    0
  );

  const fensterAspect = canvasBreite() / canvasHoehe();
  const packHoehe = Math.sqrt(gesamtFlaeche / (0.3 * fensterAspect)); // 0.3 bedeutet 30% der Bildschirmfläche wird mit Gebäude dargestellt ?? evt. später mit einem Regler steuern
  const packBreite = packHoehe * fensterAspect;

  const platzierteBoxen = []; // { x, y, w, h } in Packflächen-Koordinaten (x/y = obere linke Ecke)

  const sortiert = gebaeudeUnterliste.slice().sort((a, b) => b.breite * b.tiefe - a.breite * a.tiefe);
  const positionen = new Map(); // gebaeude_id -> { mitteX, mitteZ }

  for (const gebaeude of sortiert) {
    const w = gebaeude.breite + gebaeudeAbstand;
    const h = gebaeude.tiefe + gebaeudeAbstand;

    let platziert = false;
    for (let versuch = 0; versuch < maxPackVersucheProGebaeude; versuch++) {
      const x = Math.random() * Math.max(0, packBreite - w);
      const y = Math.random() * Math.max(0, packHoehe - h);

      if (passtOhneUeberlappung(x, y, w, h, platzierteBoxen)) {
        platzierteBoxen.push({ x, y, w, h });
        positionen.set(gebaeude.gebaeude_id, { mitteX: x + w / 2, mitteZ: y + h / 2 });
        platziert = true;
        break;
      }
    }

    if (!platziert) {
      console.warn(`Gebäude ${gebaeude.gebaeude_id} konnte nicht gepackt werden (kein Platz gefunden).`); // ?? evt. können wir das später als text noch einfügen
      positionen.set(gebaeude.gebaeude_id, { mitteX: gebaeude.mitteX, mitteZ: gebaeude.mitteZ });
    }
  }

  return positionen;
}

function gebaeudePacken(gebaeudeListe) {
  const positionen = packPositionenBerechnen(gebaeudeListe);
  for (const gebaeude of gebaeudeListe) {
    const { mitteX, mitteZ } = positionen.get(gebaeude.gebaeude_id);
    gebaeudeVerschieben(gebaeude, mitteX - gebaeude.mitteX, mitteZ - gebaeude.mitteZ);
  }
}

function passtOhneUeberlappung(x, y, w, h, boxen) {
  for (const box of boxen) {
    if (x < box.x + box.w && x + w > box.x && y < box.y + box.h && y + h > box.y) {
      return false;
    }
  }
  return true;
}

function gebaeudeVerschieben(gebaeude, dx, dz) {
  gebaeude.mitteX += dx;
  gebaeude.mitteZ += dz;

  for (const zeile of gebaeude.zeilen) {
    for (const kontur of zeile.konturen) {
      for (const punkt of kontur) {
        punkt[0] += dx;
        punkt[1] += dz;
      }
    }
  }
}

function gebaeudePositionSetzen(gebaeude, neueMitteX, neueMitteZ) {
  const dx = neueMitteX - gebaeude.mitteX;
  const dz = neueMitteZ - gebaeude.mitteZ;
  if (dx === 0 && dz === 0) return;

  gebaeude.mitteX = neueMitteX;
  gebaeude.mitteZ = neueMitteZ;

  for (const linien of gebaeude.linienObjekte) {
    linien.position.x += dx;
    linien.position.z += dz;
  }
}











// --------------------------------------------------------------------------------

// Ziel: Kamera ist auf die Gesamtausdehnung aller Gebäude zentriert

// ???: Es ist zu überprüfen ob diese Funktion noch gebraucht wird wenn wir die neue Rechteckfunktion ausführen oder ob es nicht mehr Sinn macht dies zuerst zu setzen und dann die Szene aufbauen.

// --------------------------------------------------------------------------------

function kameraAufGebaeudeZentrieren(gebaeudeListe) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  let maxHoehe = 0;
  for (const gebaeude of gebaeudeListe) {
    minX = Math.min(minX, gebaeude.mitteX - gebaeude.ringAussenRadius);
    maxX = Math.max(maxX, gebaeude.mitteX + gebaeude.ringAussenRadius);
    minZ = Math.min(minZ, gebaeude.mitteZ - gebaeude.ringAussenRadius);
    maxZ = Math.max(maxZ, gebaeude.mitteZ + gebaeude.ringAussenRadius);
    maxHoehe = Math.max(maxHoehe, gebaeude.maxHoehenkote + 10); // 10m Puffer nach oben, damit die Kamera nicht zu nah an der Decke ist
  }

  const zentrumX = (minX + maxX) / 2;
  const zentrumZ = (minZ + maxZ) / 2;

  const aktuellesAspect = canvasBreite() / canvasHoehe();

  const horizontalRadius = Math.sqrt(((maxX - minX) / 2) ** 2 + ((maxZ - minZ) / 2) ** 2);
  const diagonalRadius = Math.sqrt(horizontalRadius ** 2 + maxHoehe ** 2);

frustumSize = Math.max(diagonalRadius * 2, (maxX - minX) / aktuellesAspect) * 0.38;
  kameraFrustumAktualisieren(aktuellesAspect);

  if (camera === kameraOrtho) {
    kameraOrtho.zoom = 1;
    camera.position.set(zentrumX, 100, zentrumZ);
  } else {
    const richtung = camera.position.clone().sub(controls.target).normalize();
    const distanz = kameraDistanzFuerSichtbareHoehe(frustumSize);
    camera.position.set(zentrumX, 0, zentrumZ).addScaledVector(richtung, distanz);
  }
  camera.lookAt(zentrumX, 0, zentrumZ);

  controls.target.set(zentrumX, 0, zentrumZ);
  controls.update();
}











// --------------------------------------------------------------------------------

// Ziel: Bei Linksklick auf ein Element erscheint eine Infobox mit seinen Daten

// --------------------------------------------------------------------------------

const klickbareObjekte = [];
const alleRaumKlickflaechen = [];

const raycaster = new THREE.Raycaster(); // greift die nächste Linie resp. Fläche die sich bei der Maus befindet
raycaster.params.Line2 = { threshold: 8 }; // die Zahl ist die Tolleranz wie genau ich die Linie treffen muss

const infobox = document.getElementById("infobox");

function raumGruppenIndexVonFace(mesh, faceIndex) {
  const gruppen = mesh.geometry.groups;
  const zielIndex = faceIndex * 3;
  for (let i = 0; i < gruppen.length; i++) {
    const gruppe = gruppen[i];
    if (zielIndex >= gruppe.start && zielIndex < gruppe.start + gruppe.count) return i;
  }
  return -1;
}

let ausgewaehlteRaumGruppen = [];

let ausgewaehlteZeile = null;

let isolierung = null;

function raumAuswahlAufheben() {
  for (const { mesh, gruppenIndex } of ausgewaehlteRaumGruppen) {
    mesh.geometry.groups[gruppenIndex].materialIndex = RAUM_MATERIAL_INDEX.standard;
  }
  ausgewaehlteRaumGruppen = [];
}

renderer.domElement.addEventListener("click", (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  const maus = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );

  raycaster.setFromCamera(maus, camera);
  const treffer = raycaster.intersectObjects(klickbareObjekte.filter((objekt) => objekt.visible));

  if (treffer.length === 0) {
    infobox.style.display = "none";
    raumAuswahlAufheben();
    ausgewaehlteZeile = null;
    return;
  }

  const naechsterTreffer = treffer[0];
  const getroffenesObjekt = naechsterTreffer.object;
  const istRaumMesh = !!getroffenesObjekt.userData.raeume;
  const gruppenIndex = istRaumMesh ? raumGruppenIndexVonFace(getroffenesObjekt, naechsterTreffer.faceIndex) : -1;
  const zeile = istRaumMesh
    ? getroffenesObjekt.userData.raeume[gruppenIndex]
    : getroffenesObjekt.userData.zeilen[naechsterTreffer.faceIndex];
  ausgewaehlteZeile = zeile;

  const bereitsAusgewaehlt = ausgewaehlteRaumGruppen.some(
    (a) => a.mesh === getroffenesObjekt && a.gruppenIndex === gruppenIndex
  );
  if (istRaumMesh && bereitsAusgewaehlt) {
    raumAuswahlAufheben();
  } else {
    raumAuswahlAufheben();
    if (istRaumMesh) {
      const raeume = getroffenesObjekt.userData.raeume;
      ausgewaehlteRaumGruppen = raeume
        .map((r, i) => (r === zeile ? { mesh: getroffenesObjekt, gruppenIndex: i } : null))
        .filter(Boolean);
      for (const { mesh, gruppenIndex: i } of ausgewaehlteRaumGruppen) {
        mesh.geometry.groups[i].materialIndex = RAUM_MATERIAL_INDEX.highlight;
      }
    }
  }

  infobox.innerHTML = `
    <strong>${zeile.entitaet_subtyp ?? "–"}</strong>
    <div class="infobox-tabelle">
      <span>Gebäude-ID:</span><span>${zeile.gebaeude_id ?? "–"}</span>
      <span>Geschoss:</span><span>${zeile.geschoss_label ?? "–"}</span>
      <span>Fläche:</span><span>${(zeile.entitaet_typ === "Raum" || zeile.entitaet_typ === "Geschossfläche") ? zeile.flaeche + " m2" : ""}</span>
    </div>
  `;
  infobox.style.left = `${e.clientX + 12}px`;
  infobox.style.top = `${e.clientY + 12}px`;
  infobox.style.display = "block";
});

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  infobox.style.display = "none";
  raumAuswahlAufheben();
  ausgewaehlteZeile = null;
});

window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() !== "i") return;

  if (isolierung) {
    isolierung = null;
  } else if (ausgewaehlteZeile) {
    isolierung = {
      gebaeudeId: ausgewaehlteZeile.gebaeude_id,
      geschossLabel: ausgewaehlteZeile.entitaet_typ === "Geschossfläche" ? null : ausgewaehlteZeile.geschoss_label,
    };
  } else {
    return;
  }

  const { zaehlerProGebaeude } = matchAnzahlProGebaeudeBerechnen();
  gebaeudeDimmingAktualisieren(zaehlerProGebaeude, filterAuswahl.geschoss);
  wohnungsMarkierungAktualisieren();
  raumSubtypMarkierungAktualisieren();
});

// Tastendruck F | Fixiert die Kamera um die richtigen Einstellungen für weitere Filter zu machen

window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() !== "f") return;
  positionierungFixiert = !positionierungFixiert;
  console.log(positionierungFixiert ? "Positionierung fixiert (F zum Lösen)" : "Positionierung wieder aktiv (F zum Fixieren)");
});

// Tastendruck R | Neupositionierung der Grundrisse mit der neuen Auswahl von Filter
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() !== "r") return;
  positionierungAusloesen();
});

// 2x Supersampling: verdoppelt Pixel-Dichte des Bildschirms für einen Export
const PNG_EXPORT_SKALIERUNG = 2;

// Tastendruck P | exportiert die aktuelle Ansicht als PNG
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() !== "p") return;

  const breite = canvasBreite();
  const hoehe = canvasHoehe();

  // Auf Retina-Displays (devicePixelRatio 2) kann PNG_EXPORT_SKALIERUNG 4 eine Canvas-Auflösung
  // anfordern, die grösser ist als die maximale Textur-/Viewport-Grösse der GPU - der Browser schneidet
  // die Zeichnung dann kommentarlos am Rand ab, statt einen Fehler zu werfen. Deshalb hier auf das
  // tatsächlich unterstützte Maximum begrenzen, statt den vollen Faktor blind anzuwenden.
  const gl = renderer.getContext();
  const maxAufloesung = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), ...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
  const skalierung = Math.min(
    PNG_EXPORT_SKALIERUNG,
    maxAufloesung / (breite * window.devicePixelRatio),
    maxAufloesung / (hoehe * window.devicePixelRatio)
  );
  if (skalierung < PNG_EXPORT_SKALIERUNG) {
    console.warn(`PNG-Export: Auflösung auf ${skalierung.toFixed(2)}x begrenzt (GPU-Maximum erreicht, sonst wäre die Zeichnung am Rand abgeschnitten).`);
  }

  renderer.setPixelRatio(window.devicePixelRatio * skalierung);
  renderer.setSize(breite, hoehe, false); // false: CSS-Grösse auf dem Bildschirm bleibt unverändert, nur die interne Auflösung steigt
  linienMaterialAufloesungenAktualisieren();
  renderer.render(scene, camera);

  const link = document.createElement("a");
  link.href = renderer.domElement.toDataURL("image/png");
  const zeitstempel = new Date().toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "-");
  link.download = `floorplanexploratory_${zeitstempel}.png`;
  link.click();

  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(breite, hoehe, false);
  linienMaterialAufloesungenAktualisieren();
  renderer.render(scene, camera);
});

// Cursor zeigt "pointer" statt des normalen Pfeils, sobald die Maus über einer klickbaren (und
// sichtbaren) Linie schwebt - gleiche Raycasting-Logik wie beim Klick oben, nur ohne Infobox-Effekt.
renderer.domElement.addEventListener("pointermove", (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  const maus = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );

  raycaster.setFromCamera(maus, camera);
  const treffer = raycaster.intersectObjects(klickbareObjekte.filter((objekt) => objekt.visible));
  renderer.domElement.style.cursor = treffer.length > 0 ? "pointer" : "default";
});

function flaecheAusKontur(kontur) {
  let flaeche = 0;
  for (let i = 0; i < kontur.length - 1; i++) {
    const [x0, y0] = kontur[i];
    const [x1, y1] = kontur[i + 1];
    flaeche += x0 * y1 - x1 * y0;
  }
  return flaeche / 2; // vorzeichenbehaftet (abhängig vom Umlaufsinn)
}

function flaecheAusKonturen(konturen) {
  return Math.abs(konturen.reduce((summe, kontur) => summe + flaecheAusKontur(kontur), 0));
}













// --------------------------------------------------------------------------------

// Ziel: Gebäude ohne zum Filter passende Wohnung sind ausgeblendet

// --------------------------------------------------------------------------------

function linienSichtbarkeitAnwenden(gruppe) {
  if (gruppe.entitaetTyp !== "Geschossfläche") {
    gruppe.linien.visible = gruppe.gefiltertSichtbar && detailSichtbar;
    if (gruppe.klickflaeche) gruppe.klickflaeche.visible = gruppe.linien.visible;
    return;
  }

  const geschossFilterAktiv = filterAuswahl.geschoss.size > 0;
  const geschossBasisSichtbar = geschossFilterAktiv || gruppe.geschossLabel === STARTGESCHOSS_LABEL || kameraGeschwenkt;

  gruppe.linien.visible = gruppe.gefiltertSichtbar && gruppe.enthuellt && (geschossBasisSichtbar || detailSichtbar);

  if (gruppe.fuellung) {
    gruppe.fuellung.visible = gruppe.gefiltertSichtbar && gruppe.enthuellt && geschossBasisSichtbar && (!detailSichtbar || kameraGeschwenkt);
    fuellungMaterialSetzen(gruppe.fuellung, kameraGeschwenkt ? gestapelteFuellungMaterial : schwarzplanMaterial);
  }
}

function gebaeudeDimmingAktualisieren(matchAnzahlProGebaeude, ausgewaehlteGeschosse) {
  const geschossFilterAktiv = ausgewaehlteGeschosse.size > 0;

  for (const [gebaeude_id, gebaeude] of gebaeudeNachId) {
    const ausserhalbIsolierung = isolierung !== null && gebaeude_id !== isolierung.gebaeudeId;
    const dimmenGebaeude =
      ausserhalbIsolierung || (gebaeude.wohnungenAnzahl === 0 ? false : !(matchAnzahlProGebaeude.get(gebaeude_id) > 0));

    for (const gruppe of gebaeude.linienMaterialien) {
      const dimmenGeschoss =
        (geschossFilterAktiv && !ausgewaehlteGeschosse.has(gruppe.geschossLabel)) ||
        (isolierung?.geschossLabel != null && gruppe.geschossLabel !== isolierung.geschossLabel);
      const dimmen = dimmenGebaeude || dimmenGeschoss;
      gruppe.material.opacity = dimmen ? 0 : 1;
      gruppe.gefiltertSichtbar = !dimmen;
      linienSichtbarkeitAnwenden(gruppe);
    }
  }
}











// Ziel: Bei aktivem Wohnungsgrösse-Filter werden die dazu passenden Wohnungen mit einem farbigen Kreis markiert

function wohnungsMarkierungAktualisieren() {
  const flaecheAktiv = filterAuswahl.wohnungsgroesse.size > 0;
  const flaecheFarbe = flaecheAktiv ? cssFarbeAufloesen(DIMENSIONEN.wohnungsgroesse.colorOf()) : null;

  const zimmerAktiv = filterAuswahl.zimmer.size > 0;
  const zimmerFarbe = zimmerAktiv ? cssFarbeAufloesen(DIMENSIONEN.zimmer.colorOf()) : null;

  const badAktiv = filterAuswahl.anzahlBadezimmer.size > 0;
  const badFarbe = badAktiv ? cssFarbeAufloesen(DIMENSIONEN.anzahlBadezimmer.colorOf()) : null;

  for (const wohnung of WOHNUNGEN) {
    const gebaeude = gebaeudeNachId.get(wohnung.gebaeudeId);
    const passt = wohnungPasstZuFiltern(wohnung, null) && wohnungPasstZuIsolierung(wohnung);

    const kreis = gebaeude.wohnungsKreise[wohnung.wohnungId];
    if (kreis) {
      kreis.visible = flaecheAktiv && passt;
      if (kreis.visible) kreis.material.color.copy(flaecheFarbe);
    }

    const kontur = gebaeude.wohnungsZimmerKontur[wohnung.wohnungId];
    if (kontur) {
      kontur.visible = zimmerAktiv && passt;
      if (kontur.visible) kontur.material.color.copy(zimmerFarbe);
    }

    const badKontur = gebaeude.wohnungsBadezimmerKontur[wohnung.wohnungId];
    if (badKontur) {
      badKontur.visible = badAktiv && passt;
      if (badKontur.visible) badKontur.material.color.copy(badFarbe);
    }
  }
}











// --------------------------------------------------------------------------------

// Ziel: Bei aktivem Filter rücken die Gebäude enger zusammen

// --------------------------------------------------------------------------------

let letztePackSignatur = null; // um bei jedem Zwischenschritt eines Drags nicht ständig neu zu packen

function gebaeudePositionenAktualisieren(matchAnzahlProGebaeude, filterAktiv) {
  const alleGebaeude = [...gebaeudeNachId.values()];

  if (!filterAktiv) {
    if (letztePackSignatur === null) return;
    for (const gebaeude of alleGebaeude) {
      gebaeudePositionSetzen(gebaeude, gebaeude.urspruenglicheMitteX, gebaeude.urspruenglicheMitteZ);
    }
    letztePackSignatur = null;
    kameraAufGebaeudeZentrieren(alleGebaeude);
    return;
  }

  const sichtbareGebaeude = alleGebaeude.filter(
    (gebaeude) => gebaeude.wohnungenAnzahl === 0 || matchAnzahlProGebaeude.get(gebaeude.gebaeude_id) > 0
  );

  if (sichtbareGebaeude.length === 0) return;

  const signatur = sichtbareGebaeude.map((gebaeude) => gebaeude.gebaeude_id).sort().join(",");
  if (signatur === letztePackSignatur) return; // dieselbe sichtbare Menge wie beim letzten Mal
  letztePackSignatur = signatur;

  const positionen = packPositionenBerechnen(sichtbareGebaeude);
  for (const gebaeude of sichtbareGebaeude) {
    const ziel = positionen.get(gebaeude.gebaeude_id);
    gebaeudePositionSetzen(gebaeude, ziel.mitteX, ziel.mitteZ);
  }

  kameraAufGebaeudeZentrieren(sichtbareGebaeude);
}












// --------------------------------------------------------------------------------

// Ziel: Crossfilter-Panel ist erstellt

// --------------------------------------------------------------------------------

const WOHNEN_SCHLAFEN_SUBTYPEN = new Set(["Zimmer", "Wohnzimmer", "Schlafzimmer", "Wohn-/Esszimmer"]);
const ESSEN_SUBTYPEN = new Set(["Esszimmer", "Wohn-/Esszimmer"]);
const KUECHE_SUBTYPEN = new Set(["Küche", "Wohnküche"]);
const BALKON_SUBTYPEN = new Set(["Balkon", "Aussenraum", "Loggia", "Terrasse", "Wintergarten", "Garten", "Arkade"]);
const REDUIT_SUBTYPEN = new Set(["Abstellraum"]);
const NASSZELLE_SUBTYPEN = new Set(["Badezimmer", "Toilette", "Dusche"]);

const ZIMMER_SUBTYP_ZU_DIMENSIONEN = {};
for (const [dim, subtypen] of [
  ["kuechengroesse", KUECHE_SUBTYPEN],
  ["esszimmergroesse", ESSEN_SUBTYPEN],
  ["wohnenSchlafenGroesse", WOHNEN_SCHLAFEN_SUBTYPEN],
  ["balkongroesse", BALKON_SUBTYPEN],
  ["reduitgroesse", REDUIT_SUBTYPEN],
  ["nasszellengroesse", NASSZELLE_SUBTYPEN],
]) {
  for (const subtyp of subtypen) {
    if (!ZIMMER_SUBTYP_ZU_DIMENSIONEN[subtyp]) ZIMMER_SUBTYP_ZU_DIMENSIONEN[subtyp] = [];
    ZIMMER_SUBTYP_ZU_DIMENSIONEN[subtyp].push(dim);
  }
}

const ZIMMER_SUBTYP_MATERIALIEN = {};
for (const dim of ["kuechengroesse", "esszimmergroesse", "wohnenSchlafenGroesse", "balkongroesse", "reduitgroesse", "nasszellengroesse"]) {
  ZIMMER_SUBTYP_MATERIALIEN[dim] = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    depthWrite: false, // verhindert, dass die Einfärbung andere Raum-Elemente dahinter verdeckt
  });
}

const RAUM_MATERIALIEN_ARRAY = [
  raumKlickflaecheMaterial, // Index 0: Standard (unsichtbar, nur Klick)
  raumHighlightMaterial, // Index 1: Klick-Auswahl (rot)
  ...Object.values(ZIMMER_SUBTYP_MATERIALIEN),
];
const RAUM_MATERIAL_INDEX = { standard: 0, highlight: 1 };
Object.keys(ZIMMER_SUBTYP_MATERIALIEN).forEach((dim, i) => (RAUM_MATERIAL_INDEX[dim] = i + 2));

function raumSubtypMarkierungAktualisieren() {
  for (const dim in ZIMMER_SUBTYP_MATERIALIEN) {
    if (filterAuswahl[dim].size > 0) {
      ZIMMER_SUBTYP_MATERIALIEN[dim].color.copy(cssFarbeAufloesen(DIMENSIONEN[dim].colorOf()));
    }
  }

  for (const mesh of alleRaumKlickflaechen) {
    const raeume = mesh.userData.raeume;
    for (let i = 0; i < raeume.length; i++) {
      if (ausgewaehlteRaumGruppen.some((a) => a.mesh === mesh && a.gruppenIndex === i)) continue;

      const zeile = raeume[i];
      const moeglicheDims = ZIMMER_SUBTYP_ZU_DIMENSIONEN[zeile.entitaet_subtyp];
      const aktiveDim = moeglicheDims && moeglicheDims.find((dim) => filterAuswahl[dim].size > 0);

      let index = RAUM_MATERIAL_INDEX.standard;
      if (aktiveDim) {
        const wohnung = wohnungenNachId.get(zeile.wohnungs_id);
        if (wohnung && wohnungPasstZuFiltern(wohnung, null) && wohnungPasstZuIsolierung(wohnung)) {
          index = RAUM_MATERIAL_INDEX[aktiveDim];
        }
      }
      mesh.geometry.groups[i].materialIndex = index;
    }
  }
}

let WOHNUNGEN = [];
let wohnungenNachId = new Map(); // wohnungId -> Wohnung, für raumSubtypMarkierungAktualisieren
let gebaeudeNachId = new Map();

function wohnungenAufbauen(gebaeudeListe) {
  const wohnungen = [];
  for (const gebaeude of gebaeudeListe) {
    for (const [wohnungId, zimmer] of Object.entries(gebaeude.zimmerProWohnung)) {
      wohnungen.push({
        wohnungId,
        gebaeudeId: gebaeude.gebaeude_id,
        zimmer,
        wohnungenProGebaeude: gebaeude.wohnungenAnzahl,
        gf: gebaeude.gf,
        hnfAnteil: gebaeude.hnfAnteil,
        gebaeudetiefe: gebaeude.tiefe,
        geschossigkeit: gebaeude.geschossigkeit,
        wohnungsgroesse: gebaeude.wohnungsFlaeche[wohnungId] || 0,
        wohnenSchlafenGroessen: gebaeude.wohnenSchlafenFlaechen[wohnungId] || [],
        esszimmergroessen: gebaeude.esszimmerFlaechen[wohnungId] || [],
        kuechengroesse: gebaeude.kuecheFlaeche[wohnungId] ?? null,
        balkongroesse: gebaeude.balkonFlaeche[wohnungId] ?? null,
        reduitgroesse: gebaeude.reduitFlaeche[wohnungId] ?? null,
        nasszellengroesse: gebaeude.nasszelleFlaeche[wohnungId] ?? null,
        anzahlBadezimmer: gebaeude.badAnzahl[wohnungId] || 0,
        anzahlWohnungenProGeschoss: gebaeude.wohnungenProGeschoss[wohnungId] || 0,
        geschoss: gebaeude.heimGeschoss[wohnungId],
      });
    }
  }
  return wohnungen;
}

function gleichmaessigeBins(start, schritt, anzahl, einheit) {
  const bins = Array.from({ length: anzahl }, (_, i) => {
    const max = start + (i + 1) * schritt;
    return { max, label: `${max} ${einheit}` };
  });
  bins.push({ max: Infinity, label: `> ${start + anzahl * schritt} ${einheit}` });
  return bins;
}

// Sprungmasse für die SVG Grafiken | Gebäude

const GF_BINS = gleichmaessigeBins(0, 200, 15000 / 200, "m²"); // PRIO 1 | 500, 1000, ..., 10000 m², plus "> 10000 m²"
const HNF_ANTEIL_BINS = gleichmaessigeBins(30, 5, 10, "%") // PRIO 1 | 35, 40, ..., 100 %, plus "> 100 %"
const WOHNUNGEN_PRO_GEBAEUDE_BINS = gleichmaessigeBins(0, 2, 75, "Wohnungen") // PRIO 1
const WOHNUNGEN_PRO_GESCHOSS_BINS = gleichmaessigeBins(0, 1, 20, "") // PRIO 1
const GEBAEUDETIEFE_BINS = gleichmaessigeBins(4, 2, 20, "m") // PRIO 3
const GESCHOSSIGKEIT_BINS = gleichmaessigeBins(0, 1, 20, "") // PRIO 2
// FILTER Erschliessung (1 Spänner, 2 Spänner) // PRIO 2


// Sprungmasse für die SVG Grafiken | Wohnungen

// FILTER Orientierung (Einseitig, Zweiseitig, Dreiseitig, Vierseitig) | PRIO 3
// FILTER Himmelsrichtung | PRIO 3
const WOHNUNGSGROESSE_BINS = gleichmaessigeBins(0, 5, 50, "m²") // PRIO 1
const ZIMMER_BINS = gleichmaessigeBins(0, 0.5, 20, "Zimmer") // PRIO 1
const ANZAHL_BADEZIMMER_BINS = gleichmaessigeBins(0, 1, 5, "Stk") // PRIO 1
// FILTER Organisation (linear, zoniert, zentral, zirkular, peripher) // PRIO 3

// Sprungmasse für die SVG Grafiken | Zimmer
const KUECHENGROESSE_BINS = gleichmaessigeBins(0, 0.5, 40, "m²")
const ESSZIMMERGROESSE_BINS = gleichmaessigeBins(15, 1, 30, "m²")
const WOHNEN_SCHLAFEN_BINS = gleichmaessigeBins(8, 1, 30, "m²")
const BALKONGROESSE_BINS = gleichmaessigeBins(0, 1, 30, "m²")
const REDUITGROESSE_BINS = gleichmaessigeBins(0.5, 0.5, 10, "m²")
const NASSZELLENGROESSE_BINS = gleichmaessigeBins(0, 0.5, 40, "m²")
// FILTER Ankommen Zimmergrösse | PRIO 2

function binIndexVon(wert, bins) {
  return bins.findIndex((bin) => wert <= bin.max);
}

function binDimension(feldZugriff, bins, seriesName, { ohneLabel, ...extra } = {}) {
  return {
    keysOf: (w) => {
      const wert = feldZugriff(w);
      if (ohneLabel && wert === null) return ["ohne"];
      return Array.isArray(wert) ? wert.map((v) => binIndexVon(v, bins)) : [binIndexVon(wert, bins)];
    },
    keys: ohneLabel ? ["ohne", ...bins.map((_, i) => i)] : bins.map((_, i) => i),
    labelOf: (k) => (k === "ohne" ? ohneLabel : bins[k].label),
    colorOf: () => `var(--series-${seriesName})`,
    ...extra,
  };
}

function dimensionenAufbauen(wohnungen) {
  const geschossWerte = [...new Set(wohnungen.map((w) => w.geschoss))].sort();

  return {
    geschoss: {
      keysOf: (w) => [w.geschoss],
      keys: geschossWerte,
      labelOf: (label) => label.split("|")[1]?.trim() ?? label,
      colorOf: () => "var(--series-geschoss)",
      vertikaleKategorien: true,
    },
    wohnungen: binDimension((w) => w.wohnungenProGebaeude, WOHNUNGEN_PRO_GEBAEUDE_BINS, "wohnungen", { zaehlEinheit: "gebaeude" }),
    zimmer: binDimension((w) => w.zimmer, ZIMMER_BINS, "zimmer"),
    gf: binDimension((w) => w.gf, GF_BINS, "gf", { zaehlEinheit: "gebaeude" }),
    hnfAnteil: binDimension((w) => w.hnfAnteil, HNF_ANTEIL_BINS, "hnf-anteil", { zaehlEinheit: "gebaeude" }),
    gebaeudetiefe: binDimension((w) => w.gebaeudetiefe, GEBAEUDETIEFE_BINS, "gebaeudetiefe", { zaehlEinheit: "gebaeude" }),
    geschossigkeit: binDimension((w) => w.geschossigkeit, GESCHOSSIGKEIT_BINS, "geschossigkeit", { zaehlEinheit: "gebaeude" }),
    wohnungsgroesse: binDimension((w) => w.wohnungsgroesse, WOHNUNGSGROESSE_BINS, "wohnungsgroesse"),
    wohnenSchlafenGroesse: binDimension((w) => w.wohnenSchlafenGroessen, WOHNEN_SCHLAFEN_BINS, "wohnen-schlafen-groesse"),
    esszimmergroesse: binDimension((w) => w.esszimmergroessen, ESSZIMMERGROESSE_BINS, "esszimmergroesse"),
    kuechengroesse: binDimension((w) => w.kuechengroesse, KUECHENGROESSE_BINS, "kuechengroesse", { ohneLabel: "keine Küche" }),
    balkongroesse: binDimension((w) => w.balkongroesse, BALKONGROESSE_BINS, "balkongroesse", { ohneLabel: "kein Balkon" }),
    reduitgroesse: binDimension((w) => w.reduitgroesse, REDUITGROESSE_BINS, "reduitgroesse", { ohneLabel: "kein Reduit" }),
    nasszellengroesse: binDimension((w) => w.nasszellengroesse, NASSZELLENGROESSE_BINS, "nasszellengroesse", { ohneLabel: "keine Nasszelle" }),
    anzahlBadezimmer: binDimension((w) => w.anzahlBadezimmer, ANZAHL_BADEZIMMER_BINS, "anzahl-badezimmer"),
    anzahlWohnungenProGeschoss: binDimension((w) => w.anzahlWohnungenProGeschoss, WOHNUNGEN_PRO_GESCHOSS_BINS, "anzahl-wohnungen-pro-geschoss", { zaehlEinheit: "gebaeude" }),
  };
}

let DIMENSIONEN = null;
let GESAMT_ZAEHLER = {}; // dim -> Map(key -> Anzahl, ungefiltert)

const filterAuswahl = {
  geschoss: new Set(),
  wohnungen: new Set(),
  zimmer: new Set(),
  gf: new Set(),
  hnfAnteil: new Set(),
  gebaeudetiefe: new Set(),
  geschossigkeit: new Set(),
  wohnungsgroesse: new Set(),
  wohnenSchlafenGroesse: new Set(),
  esszimmergroesse: new Set(),
  kuechengroesse: new Set(),
  balkongroesse: new Set(),
  reduitgroesse: new Set(),
  nasszellengroesse: new Set(),
  anzahlBadezimmer: new Set(),
  anzahlWohnungenProGeschoss: new Set(),
};

function wohnungPasstZuFiltern(wohnung, ausschlussDim) {
  for (const dim in filterAuswahl) {
    if (dim === ausschlussDim) continue;
    const auswahl = filterAuswahl[dim];
    if (auswahl.size === 0) continue;
    if (!DIMENSIONEN[dim].keysOf(wohnung).some((k) => auswahl.has(k))) return false;
  }
  return true;
}

function wohnungPasstZuIsolierung(wohnung) {
  if (!isolierung) return true;
  if (wohnung.gebaeudeId !== isolierung.gebaeudeId) return false;
  return isolierung.geschossLabel == null || wohnung.geschoss === isolierung.geschossLabel;
}

function zaehleProDimension(dim) {
  const { keysOf, keys, zaehlEinheit } = DIMENSIONEN[dim];
  if (zaehlEinheit === "gebaeude") {
    const gebaeudeProKey = new Map(keys.map((k) => [k, new Set()]));
    for (const wohnung of WOHNUNGEN) {
      if (!wohnungPasstZuFiltern(wohnung, dim)) continue;
      for (const k of keysOf(wohnung)) gebaeudeProKey.get(k).add(wohnung.gebaeudeId);
    }
    return new Map([...gebaeudeProKey].map(([k, menge]) => [k, menge.size]));
  }

  const zaehler = new Map(keys.map((k) => [k, 0]));
  for (const wohnung of WOHNUNGEN) {
    if (!wohnungPasstZuFiltern(wohnung, dim)) continue;
    for (const k of keysOf(wohnung)) {
      zaehler.set(k, (zaehler.get(k) || 0) + 1);
    }
  }
  return zaehler;
}

function zaehleAlleUnfiltered(dim) {
  const { keysOf, keys, zaehlEinheit } = DIMENSIONEN[dim];
  if (zaehlEinheit === "gebaeude") {
    const gebaeudeProKey = new Map(keys.map((k) => [k, new Set()]));
    for (const wohnung of WOHNUNGEN) {
      for (const k of keysOf(wohnung)) gebaeudeProKey.get(k).add(wohnung.gebaeudeId);
    }
    return new Map([...gebaeudeProKey].map(([k, menge]) => [k, menge.size]));
  }

  const zaehler = new Map(keys.map((k) => [k, 0]));
  for (const wohnung of WOHNUNGEN) {
    for (const k of keysOf(wohnung)) {
      zaehler.set(k, (zaehler.get(k) || 0) + 1);
    }
  }
  return zaehler;
}

function matchAnzahlProGebaeudeBerechnen(ausschlussDim = null) {
  const zaehlerProGebaeude = new Map();
  let gesamt = 0;
  for (const wohnung of WOHNUNGEN) {
    if (!wohnungPasstZuFiltern(wohnung, ausschlussDim)) continue;
    gesamt++;
    zaehlerProGebaeude.set(wohnung.gebaeudeId, (zaehlerProGebaeude.get(wohnung.gebaeudeId) || 0) + 1);
  }
  return { zaehlerProGebaeude, gesamt };
}

let WOHNGEBAEUDE_ANZAHL = 0;

function filterKopfzeileAktualisieren(gesamt, gebaeudeGefiltertAnzahl) {
  document.getElementById("stat-count").textContent = gesamt.toLocaleString("de-CH");
  document.getElementById("stat-total").textContent = WOHNUNGEN.length.toLocaleString("de-CH");
  document.getElementById("stat-gebaeude-count").textContent = gebaeudeGefiltertAnzahl.toLocaleString("de-CH");
  document.getElementById("stat-gebaeude-total").textContent = WOHNGEBAEUDE_ANZAHL.toLocaleString("de-CH");
  const irgendeinFilterAktiv = Object.values(filterAuswahl).some((s) => s.size > 0);
  kopfTitelElement.setAttribute("aria-disabled", String(!irgendeinFilterAktiv));
  return irgendeinFilterAktiv;
}

function positionierungAusloesen() {
  const { zaehlerProGebaeude: zaehlerOhneGeschoss } = matchAnzahlProGebaeudeBerechnen("geschoss");
  const positionierungAktiv = Object.entries(filterAuswahl).some(
    ([dim, auswahl]) => dim !== "geschoss" && auswahl.size > 0
  );
  gebaeudePositionenAktualisieren(zaehlerOhneGeschoss, positionierungAktiv);
}

function filterAendern() {
  for (const dim in DIMENSIONEN) diagrammRendern(dim);

  const { zaehlerProGebaeude, gesamt } = matchAnzahlProGebaeudeBerechnen();
  filterKopfzeileAktualisieren(gesamt, zaehlerProGebaeude.size);

  gebaeudeDimmingAktualisieren(zaehlerProGebaeude, filterAuswahl.geschoss);
  wohnungsMarkierungAktualisieren();
  raumSubtypMarkierungAktualisieren();

  if (!positionierungFixiert) {
    positionierungAusloesen();
  }
}

function filterZuruecksetzen() {
  for (const dim in filterAuswahl) filterAuswahl[dim].clear();
  filterAendern();
}











// --------------------------------------------------------------------------------

// Ziel: Die 4 Diagramme sind als SVG gezeichnet und per Drag (Bereich) / Klick (einzelner Balken)
// bedienbar, analog zu einem klassischen Crossfilter-Balkendiagramm

// --------------------------------------------------------------------------------

const FILTER_SVG_NS = "http://www.w3.org/2000/svg";

function filterSvgEl(tag, attrs) {
  const el = document.createElementNS(FILTER_SVG_NS, tag);
  for (const key in attrs) el.setAttribute(key, attrs[key]);
  return el;
}

const FILTER_CHART_W = 400;
const FILTER_CHART_H = 220;
const FILTER_PAD = { top: 12, right: 6, bottom: 6, left: 6 };
const FILTER_PAD_VERTIKAL = { top: 4, right: 10, bottom: 4, left: 46 }; // für vertikaleKategorien-Dimensionen (z.B. Geschoss)

const filterChartState = {}; // dim -> { svg, dragging, startIndex, moved }

const filterTooltip = document.getElementById("filter-tooltip");

function filterTooltipAnzeigen(evt, gefiltert, gesamt, label) {
  filterTooltip.querySelector(".filter-tooltip-value").textContent = `${gefiltert} / ${gesamt}`;
  filterTooltip.querySelector(".filter-tooltip-label").textContent = label;
  filterTooltip.hidden = false;
  filterTooltip.style.left = evt.clientX + "px";
  filterTooltip.style.top = evt.clientY + "px";
}

function filterTooltipVerstecken() {
  filterTooltip.hidden = true;
}

function filterIndexAusEvent(dim, evt) {
  const { svg } = filterChartState[dim];
  const { keys, vertikaleKategorien } = DIMENSIONEN[dim];
  const rect = svg.getBoundingClientRect();

  if (vertikaleKategorien) {
    if (rect.height === 0) return null;
    const scaleY = FILTER_CHART_H / rect.height;
    const localY = (evt.clientY - rect.top) * scaleY;
    const innerH = FILTER_CHART_H - FILTER_PAD_VERTIKAL.top - FILTER_PAD_VERTIKAL.bottom;
    const slot = innerH / keys.length;
    let visIdx = Math.floor((localY - FILTER_PAD_VERTIKAL.top) / slot);
    visIdx = Math.min(Math.max(visIdx, 0), keys.length - 1);
    return keys.length - 1 - visIdx; // Key-Index 0 liegt unten, visuell aber in der letzten Zeile
  }

  if (rect.width === 0) return null;
  const scaleX = FILTER_CHART_W / rect.width;
  const localX = (evt.clientX - rect.left) * scaleX;
  const innerW = FILTER_CHART_W - FILTER_PAD.left - FILTER_PAD.right;
  const slot = innerW / keys.length;
  let idx = Math.floor((localX - FILTER_PAD.left) / slot);
  return Math.min(Math.max(idx, 0), keys.length - 1);
}

function filterDiagrammInteraktionInitialisieren(dim) {
  const card = document.querySelector(`.chart-card[data-dim="${dim}"]`);
  const svg = card.querySelector(".chart-svg");
  const state = { svg, dragging: false, startIndex: null, moved: false };
  filterChartState[dim] = state;

  const { keys } = DIMENSIONEN[dim];

  svg.addEventListener("pointerdown", (evt) => {
    const idx = filterIndexAusEvent(dim, evt);
    if (idx === null) return;
    state.dragging = true;
    state.moved = false;
    state.startIndex = idx;
    svg.setPointerCapture(evt.pointerId);
    evt.preventDefault();
  });

  svg.addEventListener("pointermove", (evt) => {
    const idx = filterIndexAusEvent(dim, evt);
    if (idx === null) return;

    if (state.dragging) {
      if (idx !== state.startIndex) state.moved = true;
      const lo = Math.min(state.startIndex, idx);
      const hi = Math.max(state.startIndex, idx);
      filterAuswahl[dim] = new Set(keys.slice(lo, hi + 1));
      filterAendern();
    }

    const key = keys[idx];
    const zaehler = zaehleProDimension(dim);
    filterTooltipAnzeigen(evt, zaehler.get(key) || 0, GESAMT_ZAEHLER[dim].get(key) || 0, DIMENSIONEN[dim].labelOf(key));
  });

  svg.addEventListener("pointerup", (evt) => {
    if (state.dragging && !state.moved) {
      const key = keys[state.startIndex];
      if (evt.altKey) {
        const auswahl = new Set(filterAuswahl[dim]);
        if (auswahl.has(key)) auswahl.delete(key);
        else auswahl.add(key);
        filterAuswahl[dim] = auswahl;
      } else {
        const nurDieseAusgewaehlt = filterAuswahl[dim].size === 1 && filterAuswahl[dim].has(key);
        filterAuswahl[dim] = nurDieseAusgewaehlt ? new Set() : new Set([key]);
      }
      filterAendern();
    }
    state.dragging = false;
  });

  svg.addEventListener("pointerleave", () => {
    if (!state.dragging) filterTooltipVerstecken();
  });
}

function vertikalesDiagrammRendern(dim, svg, keys, labelOf, colorOf, gefiltertZaehler, gesamtZaehler, maxWert) {
  const innerW = FILTER_CHART_W - FILTER_PAD_VERTIKAL.left - FILTER_PAD_VERTIKAL.right;
  const innerH = FILTER_CHART_H - FILTER_PAD_VERTIKAL.top - FILTER_PAD_VERTIKAL.bottom;
  const gap = 3;
  const barH = (innerH - gap * (keys.length - 1)) / keys.length;

  for (const frac of [0.25, 0.5, 0.75]) {
    const x = FILTER_PAD_VERTIKAL.left + innerW * frac;
    svg.appendChild(
      filterSvgEl("line", {
        x1: x,
        x2: x,
        y1: FILTER_PAD_VERTIKAL.top,
        y2: FILTER_PAD_VERTIKAL.top + innerH,
        class: "gridline",
      })
    );
  }

  const egIndex = keys.findIndex((k) => labelOf(k) === "EG");
  if (egIndex !== -1) {
    for (let i = 1; i < keys.length; i++) {
      if ((i - egIndex) % 5 !== 0) continue;
      const y = FILTER_PAD_VERTIKAL.top + (keys.length - i) * (barH + gap) - gap / 2;
      svg.appendChild(
        filterSvgEl("line", { x1: FILTER_PAD_VERTIKAL.left, x2: FILTER_PAD_VERTIKAL.left + innerW, y1: y, y2: y, class: "geschoss-trennlinie" })
      );
    }
  }

  const hatAuswahl = filterAuswahl[dim].size > 0;

  keys.forEach((key, i) => {
    const gesamtWert = gesamtZaehler.get(key) || 0;
    const gefiltertWert = gefiltertZaehler.get(key) || 0;
    const gesamtB = (gesamtWert / maxWert) * innerW;
    const gefiltertB = (gefiltertWert / maxWert) * innerW;
    // Key-Index 0 soll unten liegen -> von oben gezählt ist das die letzte Zeile
    const y = FILTER_PAD_VERTIKAL.top + (keys.length - 1 - i) * (barH + gap);
    const istAusgewaehlt = filterAuswahl[dim].has(key);
    const farbe = colorOf(key);
    const gruppenOpazitaet = !hatAuswahl || istAusgewaehlt ? 1 : 0.35;

    const gruppe = filterSvgEl("g", { opacity: gruppenOpazitaet, class: "bar" });

    gruppe.appendChild(
      filterSvgEl("rect", {
        x: FILTER_PAD_VERTIKAL.left,
        y,
        width: Math.max(gesamtB, 1),
        height: barH,
        rx: 4,
        fill: farbe,
        "fill-opacity": "0.18",
        stroke: istAusgewaehlt ? farbe : "var(--layout-linie)",
        "stroke-width": istAusgewaehlt ? "2" : "1",
        ...(istAusgewaehlt && { "stroke-opacity": "0.6" }),
      })
    );

    if (gefiltertWert > 0) {
      gruppe.appendChild(
        filterSvgEl("rect", {
          x: FILTER_PAD_VERTIKAL.left,
          y,
          width: Math.max(gefiltertB, 1),
          height: barH,
          rx: 4,
          fill: farbe,
        })
      );
    }

    svg.appendChild(gruppe);
  });

  svg.appendChild(
    filterSvgEl("line", {
      x1: FILTER_PAD_VERTIKAL.left,
      x2: FILTER_PAD_VERTIKAL.left,
      y1: FILTER_PAD_VERTIKAL.top,
      y2: FILTER_PAD_VERTIKAL.top + innerH,
      class: "baseline",
    })
  );
}

function diagrammRendern(dim) {
  const { svg } = filterChartState[dim];
  svg.innerHTML = "";

  const { keys, labelOf, colorOf, vertikaleKategorien } = DIMENSIONEN[dim];
  const gefiltertZaehler = zaehleProDimension(dim);
  const gesamtZaehler = GESAMT_ZAEHLER[dim];
  const maxWert = Math.max(1, ...keys.map((k) => gesamtZaehler.get(k) || 0));

  if (vertikaleKategorien) {
    vertikalesDiagrammRendern(dim, svg, keys, labelOf, colorOf, gefiltertZaehler, gesamtZaehler, maxWert);
    return;
  }

  const innerW = FILTER_CHART_W - FILTER_PAD.left - FILTER_PAD.right;
  const innerH = FILTER_CHART_H - FILTER_PAD.top - FILTER_PAD.bottom;
  const gap = 1; // Balkenabstand
  const barW = (innerW - gap * (keys.length - 1)) / keys.length;

  for (const frac of [0.25, 0.5, 0.75]) {
    const y = FILTER_PAD.top + innerH * (1 - frac);
    svg.appendChild(
      filterSvgEl("line", { x1: FILTER_PAD.left, x2: FILTER_CHART_W - FILTER_PAD.right, y1: y, y2: y, class: "gridline" })
    );
  }

  const hatAuswahl = filterAuswahl[dim].size > 0;

  keys.forEach((key, i) => {
    const gesamtWert = gesamtZaehler.get(key) || 0;
    const gefiltertWert = gefiltertZaehler.get(key) || 0;
    const gesamtH = (gesamtWert / maxWert) * innerH;
    const gefiltertH = (gefiltertWert / maxWert) * innerH;
    const x = FILTER_PAD.left + i * (barW + gap);
    const istAusgewaehlt = filterAuswahl[dim].has(key);
    const farbe = colorOf(key);
    const gruppenOpazitaet = !hatAuswahl || istAusgewaehlt ? 1 : 0.35;

    const gruppe = filterSvgEl("g", { opacity: gruppenOpazitaet, class: "bar" });

    gruppe.appendChild(
      filterSvgEl("rect", {
        x,
        y: FILTER_PAD.top + innerH - gesamtH,
        width: barW,
        height: Math.max(gesamtH, 1),
        rx: 4,
        fill: farbe,
        "fill-opacity": "0.18",
        stroke: istAusgewaehlt ? farbe : "var(--layout-linie)",
        "stroke-width": istAusgewaehlt ? "2" : "1",
        ...(istAusgewaehlt && { "stroke-opacity": "0.6" }),
      })
    );

    if (gefiltertWert > 0) {
      gruppe.appendChild(
        filterSvgEl("rect", {
          x,
          y: FILTER_PAD.top + innerH - gefiltertH,
          width: barW,
          height: Math.max(gefiltertH, 1),
          rx: 4,
          fill: farbe,
        })
      );
    }

    svg.appendChild(gruppe);
  });

  svg.appendChild(
    filterSvgEl("line", {
      x1: FILTER_PAD.left,
      x2: FILTER_CHART_W - FILTER_PAD.right,
      y1: FILTER_PAD.top + innerH,
      y2: FILTER_PAD.top + innerH,
      class: "baseline",
    })
  );
}

function filterPanelErstellen() {
  WOHNGEBAEUDE_ANZAHL = new Set(WOHNUNGEN.map((w) => w.gebaeudeId)).size;

  DIMENSIONEN = dimensionenAufbauen(WOHNUNGEN);
  GESAMT_ZAEHLER = {};
  for (const dim in DIMENSIONEN) GESAMT_ZAEHLER[dim] = zaehleAlleUnfiltered(dim);

  for (const dim in DIMENSIONEN) filterDiagrammInteraktionInitialisieren(dim);
  kopfTitelElement.addEventListener("click", () => {
    if (kopfTitelElement.getAttribute("aria-disabled") === "true") return;
    filterZuruecksetzen();
  });
  kopfTitelElement.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (kopfTitelElement.getAttribute("aria-disabled") === "true") return;
    event.preventDefault();
    filterZuruecksetzen();
  });

  filterAendern();
}
