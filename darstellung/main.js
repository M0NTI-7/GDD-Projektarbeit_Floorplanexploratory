// --------------------------------------------------------------------------------

// ZIEL: Alle importe Global ausführen

// --------------------------------------------------------------------------------

import * as THREE from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// --------------------------------------------------------------------------------

// Ziel: Sämtliche Farben, Stifte und Texturen sind global am Anfang definiert und können von allen Gebäuden verwendet werden

// --------------------------------------------------------------------------------

const stiftfarbeUmfassungslinie = {
  "Geschossfläche": new LineMaterial({ color: "#000000", linewidth: 2 }), // Dicke: 2px, Füllung keine ???, Farbe: schwarz
  "Raum": new LineMaterial({ color: "#000000", linewidth: 2 }),
  "Öffnung": new LineMaterial({ color: "#000000", linewidth: 1 }),
  "Ausstattung": new LineMaterial({ color: "#000000", linewidth: 1 }),
};

// Pro Gebäude und Zeilentyp ein eigener Material-Klon von stiftfarbeUmfassungslinie (statt ein
// einziges Material pro Typ für alle Gebäude gemeinsam) -> jedes Gebäude kann seine eigenen Linien
// unabhängig ein-/ausblenden (siehe gebaeudeDimmingAktualisieren), ohne die anderer Gebäude zu berühren.
const gebaeudeLinienMaterialien = []; // alle geklonten Materialien, für resize (siehe unten)
const alleWohnungsKreise = []; // alle Wohnungs-Kreis-Meshes, für die Zoom-Skalierung (siehe wohnungsKreiseSkalierenAnKamera)
const alleZimmerKonturen = []; // alle Zimmer-/Bad-Strich-Konturen, für die Billboard-Rotation (siehe wohnungsKreiseSkalierenAnKamera)

// --------------------------------------------------------------------------------

// Ziel: Szene ist erstellt

// --------------------------------------------------------------------------------

const scene = new THREE.Scene();
// Kein scene.background -> Canvas bleibt transparent, der weisse "Papier"-Hintergrund kommt jetzt
// von der Seite (siehe index.html).

// Oben ist per CSS (--oberer-rand, siehe index.html) fest Platz für die Filterleiste reserviert; die
// Zeichnung selbst beginnt erst danach (kein Rand links/rechts/unten). Der CSS-Wert gilt nur als
// Fallback für den allerersten Sekundenbruchteil (versteckt hinter #splash) - danach hält ein
// ResizeObserver auf #filter-leiste (siehe weiter unten) obererRandPx synchron mit der tatsächlich
// gerenderten Höhe der Leiste, da diese sich beim Ein-/Ausklappen und je nach Tab-Slot ändert.



let obererRandPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--oberer-rand")) || 0;

function zeichenBreite() {
  return window.innerWidth;
}

function zeichenHoehe() {
  return window.innerHeight - obererRandPx;
}

let frustumSize = 50;

const DETAIL_SCHWELLE_METER = 400; // Schwellenwert ab wann die einzelnen Räume dargestellt werden.
let detailSichtbar = false;

const SCHWENK_SCHWELLE_RAD = THREE.MathUtils.degToRad(3);
let kameraGeschwenkt = false;

// Per Tastendruck (F, siehe Handler weiter unten) umschaltbar - true: Filteränderungen lösen kein
// Neu-Packen der Gebäude und keine Kamera-Neuzentrierung mehr aus (siehe filterAendern). Default
// false, damit sich der bewährte Ablauf (grob eingrenzen -> Gebäude packen sich, Kamera zentriert
// mit) nicht ändert - erst beim Wechsel in die Feineinstellung fixiert man die Ansicht bewusst.
let positionierungFixiert = false;

const STARTGESCHOSS_LABEL = "0101 | 01 OG";

const KAMERA_FOV = 50; // Grad - Blickwinkel der Perspective-Kamera bei gekippter Ansicht

const aspect = zeichenBreite() / zeichenHoehe();

const kameraOrtho = new THREE.OrthographicCamera(
  (-frustumSize * aspect) / 2,
  (frustumSize * aspect) / 2,
  frustumSize / 2,
  -frustumSize / 2,
  0.01, // alles was näher als 0.1 ist wird nicht dargestellt
  10000 // alles was weiter weg als 1000 ist wird nicht dargestellt
);

// near:1 statt 0.01 wie bei Orthographic - Perspective-Tiefenpuffer-Präzision ist empfindlich auf das
// Verhältnis far/near, sonst "flackern" (z-fighting) weit entfernte, übereinanderliegende Linien.
const kameraPerspektive = new THREE.PerspectiveCamera(KAMERA_FOV, aspect, 1, 10000);

// Grundriss (senkrecht von oben, Kippwinkel <= SCHWENK_SCHWELLE_RAD) zeigt die masstabsgetreue
// Orthographic-Draufsicht ohne Fluchtpunkt-Verzerrung; sobald gekippt/rotiert wird, übernimmt die
// Perspective-Kamera für den räumlichen 3D-Blick auf die gestapelten Geschosse (siehe
// kameraSchwenkAktualisieren, wo zwischen beiden umgeschaltet wird, und kameraTypWechseln für den
// nahtlosen Übergang). "camera" zeigt immer auf die aktuell aktive der beiden.
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

// Rechnet eine gewünschte sichtbare Höhe (Meter, siehe sichtbareHoeheMeterAktuell) in den dafür nötigen
// Perspective-Kameraabstand zum Ziel um - Umkehrung der Formel in sichtbareHoeheMeterAktuell.
function kameraDistanzFuerSichtbareHoehe(hoeheMeter) {
  return hoeheMeter / (2 * Math.tan(THREE.MathUtils.degToRad(kameraPerspektive.fov / 2)));
}

// Wechselt die aktive Kamera (siehe camera oben) und überträgt dabei Blickrichtung und sichtbare Höhe
// von der alten auf die neue Kamera, damit der Wechsel nicht sichtbar "springt".
function kameraTypWechseln(neueKamera) {
  if (neueKamera === camera) return;

  const sichtbareHoeheMeter = sichtbareHoeheMeterAktuell();
  const richtung = camera.position.clone().sub(controls.target).normalize();

  if (neueKamera === kameraPerspektive) {
    const distanz = kameraDistanzFuerSichtbareHoehe(sichtbareHoeheMeter);
    kameraPerspektive.position.copy(controls.target).addScaledVector(richtung, distanz);
  } else {
    kameraOrtho.zoom = frustumSize / sichtbareHoeheMeter;
    kameraOrtho.position.copy(camera.position); // Distanz ist für Orthographic irrelevant, nur die Richtung zählt
    kameraOrtho.updateProjectionMatrix();
  }
  neueKamera.lookAt(controls.target);

  camera = neueKamera;
  controls.object = camera;
  controls.update();
}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // alpha: Canvas-Hintergrund transparent statt opak
renderer.setClearColor(0x000000, 0); // alpha:true allein reicht nicht, sonst clear'd Three.js weiterhin opak (Standard: Schwarz, Alpha 1)
renderer.setSize(zeichenBreite(), zeichenHoehe());
renderer.setPixelRatio(window.devicePixelRatio); // greift die Pixel des Bildschirms ab für die schärfe
document.body.appendChild(renderer.domElement); // braucht es damit überhaupt etwas darstellt

// Die LineMaterial-Linien ("fat lines") brauchen die aktuelle Renderer-Auflösung als Uniform, um ihre
// Strichbreite bildschirmpixel-genau zu berechnen - muss daher jedes Mal aktualisiert werden, wenn sich
// renderer.setSize()/setPixelRatio() ändert (siehe layoutAktualisieren und zeichnungAlsPngSpeichern).
function linienMaterialAufloesungenAktualisieren() {
  for (const material of Object.values(stiftfarbeUmfassungslinie)) renderer.getSize(material.resolution);
  for (const material of gebaeudeLinienMaterialien) renderer.getSize(material.resolution);
}

linienMaterialAufloesungenAktualisieren();

// Ziel: Die Kammerasteuerung ist korrekt eingestellt

const controls = new OrbitControls(camera, renderer.domElement);

controls.target.set(0, 0, 0);
controls.zoomSpeed = 6; // Hier kann die Zoomgeschwindigkeit angepasst werden
controls.zoomToCursor = true; // zoom direkt auf die Mausposition
// Nur für die Perspective-Phase relevant (Orthographic zoomt über .zoom, nicht per Dolly) - verhindert,
// dass man beim Reinzoomen durchs Ziel hindurch- oder ins Unendliche rausfährt.
controls.minDistance = 1;
controls.maxDistance = 9000;
controls.mouseButtons = {
  MIDDLE: THREE.MOUSE.PAN,
  RIGHT: THREE.MOUSE.ROTATE,
};

// Verhalten: Passt die Zeichnung der Fenstergrösse an - sowohl bei echten Fenster-Resizes als auch
// (via ResizeObserver weiter unten) wenn sich die Höhe der Filterleiste selbst ändert (Ein-/Ausklappen,
// Tab-Wechsel mit unterschiedlich hohem Chart).

function layoutAktualisieren() {
  const aspect = zeichenBreite() / zeichenHoehe();
  kameraFrustumAktualisieren(aspect);

  renderer.setSize(zeichenBreite(), zeichenHoehe());
  linienMaterialAufloesungenAktualisieren();
}

window.addEventListener("resize", layoutAktualisieren);

// Verhalten: Geschoss/Gebäude/Wohnungen/Zimmer klappen unabhängig voneinander auf/zu - Klick auf das
// Slot-Label (siehe .filter-slot-label in index.html) togglet NUR den eigenen .filter-slot, nicht die
// anderen Slots. Da sich die Höhe der Leiste dadurch (und je nach aktivem Tab) ändert, hält ein
// ResizeObserver obererRandPx synchron statt ihn nur einmal aus der CSS-Variable zu lesen (siehe
// obererRandPx oben).

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
  // Muss zusätzlich auf die CSS-Variable zurückgeschrieben werden, nicht nur die JS-Variable setzen:
  // --oberer-rand bestimmt die tatsächliche CSS-top-Position des <canvas> (siehe index.html), während
  // obererRandPx nur für Kamera-/Renderer-Berechnungen genutzt wird. Ohne diese Zeile bleibt die
  // Canvas-Position auf dem CSS-Fallback-Wert eingefroren und die (meist höhere) echte Leiste überdeckt
  // den oberen Streifen der Zeichnung.
  document.documentElement.style.setProperty("--oberer-rand", `${obererRandPx}px`);
  layoutAktualisieren();
}).observe(filterLeisteElement);

// --------------------------------------------------------------------------------

// Ziel: Gebäude-/Wohnungs-/Zimmer-Slot der Filterleiste zeigen ihre mehreren Kennzahlen als Tabs statt
// alle gleichzeitig - unabhängig von DIMENSIONEN/WOHNUNGEN (läuft daher schon vor dem Datenladen).
// Jeder Tab liest sein Label aus data-kuerzel der zugehörigen .chart-card - kurz genug für die schmale
// Tab-Leiste, während das <h3> in der Card selbst weiterhin den ausgeschriebenen Titel zeigt.

// --------------------------------------------------------------------------------

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
      const label = card.dataset.kuerzel;

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

// Aktuelle sichtbare Höhe der Szene in Metern, unabhängig davon welche der beiden Kameras (siehe
// camera oben) gerade aktiv ist - bei Orthographic direkt aus frustumSize/zoom, bei Perspective aus
// dem Kameraabstand zum Ziel und dem Blickwinkel (siehe kameraDistanzFuerSichtbareHoehe für die
// Umkehrung, verwendet in kameraTypWechseln beim Kamera-Wechsel).
function sichtbareHoeheMeterAktuell() {
  if (camera === kameraOrtho) return frustumSize / kameraOrtho.zoom;
  return 2 * camera.position.distanceTo(controls.target) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
}

// Verhalten: Reagiert auf die aktuelle Zoomstufe (sichtbare Höhe der Szene in Metern) und blendet
// Raum/Öffnung/Ausstattung erst ab DETAIL_SCHWELLE_METER ein - siehe linienSichtbarkeitAnwenden.
// Rechnet nur bei einer tatsächlichen Änderung neu (nicht bei jedem Frame), analog zu
// letztePackSignatur beim Neu-Packen.
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

// Verhalten: Reagiert auf den aktuellen Kamera-Kippwinkel (OrbitControls.getPolarAngle(), 0 = senkrecht
// von oben) - siehe SCHWENK_SCHWELLE_RAD oben. Rechnet nur bei einer tatsächlichen Änderung neu, analog
// zu detailSichtbarkeitAktualisieren.
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

// Ab dieser sichtbaren Szenenhöhe (Meter, siehe sichtbareHoeheMeter oben) hat der Wohnungs-Kreis genau
// seine Basisgrösse (Fläche * Faktor, siehe wohnungsKreiseErstellen) - bei weiterem Rauszoomen wächst
// er proportional mit, damit er auch bei einer Übersicht über viele Gebäude noch erkennbar bleibt.
// Beim Reinzoomen bleibt er auf der Basisgrösse (kein zusätzliches Schrumpfen).
const WOHNUNGSKREIS_REFERENZ_METER = 300;

const ZIMMER_KONTUR_EINFUEGEPUNKT_OFFSET = THREE.MathUtils.degToRad(120); // fixer Zusatz-Drehwinkel (Gegenuhrzeigersinn), verschiebt nur den "Start" des Strich-Musters relativ zur Kamera

function wohnungsKreiseSkalierenAnKamera() {
  const sichtbareHoeheMeter = sichtbareHoeheMeterAktuell();
  const faktor = Math.max(1, sichtbareHoeheMeter / WOHNUNGSKREIS_REFERENZ_METER);
  for (const kreis of alleWohnungsKreise) {
    if (kreis.visible) kreis.scale.setScalar(faktor);
  }

  // Billboard-Effekt: die Zimmer-/Bad-Strich-Konturen drehen sich um ihre eigene Y-Achse mit, damit
  // sie beim Umkreisen der Szene immer zur Kamera hin ausgerichtet bleiben (sonst stünde man beim
  // Navigieren teils seitlich vor einem Strich und er wäre kaum sichtbar). Ein einziger, für die ganze
  // Szene gleicher Azimutwinkel reicht dafür aus, statt pro Wohnung einzeln zu rechnen - bei der
  // Orthographic-Draufsicht (parallele Strahlen statt Fluchtpunkt) exakt, bei der gekippten Perspective-
  // Kamera nur eine Näherung, die bei dem kleinen FOV und der meist zentrierten Szene nicht auffällt.
  const azimut = controls.getAzimuthalAngle() + ZIMMER_KONTUR_EINFUEGEPUNKT_OFFSET;
  for (const kontur of alleZimmerKonturen) {
    if (kontur.visible) kontur.rotation.y = azimut;
  }
}

// --------------------------------------------------------------------------------

// Ziel: WASD bewegt die Kamera zusätzlich zur Maussteuerung (OrbitControls) - vor allem in der
// gekippten Perspective-Ansicht ist reines Maus-Rotate/Pan manchmal unhandlich, WASD bietet dafür
// eine direktere Alternative zum "Durchfliegen" der Szene.

// --------------------------------------------------------------------------------

const wasdGedrueckt = new Set();

window.addEventListener("keydown", (e) => {
  const taste = e.key.toLowerCase();
  if (taste === "w" || taste === "a" || taste === "s" || taste === "d") wasdGedrueckt.add(taste);
});

window.addEventListener("keyup", (e) => {
  wasdGedrueckt.delete(e.key.toLowerCase());
});

const WASD_GESCHWINDIGKEIT_FAKTOR = 0.6; // Meter pro Sekunde, pro Meter sichtbarer Szenenhöhe - skaliert automatisch mit dem Zoom
let letzterFrameZeitpunkt = performance.now();

// Bewegt camera.position UND controls.target um denselben Betrag (reine Parallelverschiebung, wie
// OrbitControls' Maus-Pan) - Blickrichtung und Zoom bleiben dabei unverändert. "Vorwärts"/"Rechts"
// werden aus dem aktuellen Azimutwinkel abgeleitet (siehe wohnungsKreiseSkalierenAnKamera für dieselbe
// Umrechnung), damit W immer "in die aktuelle Blickrichtung" bewegt, unabhängig vom Kamera-Kippwinkel.
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

// --------------------------------------------------------------------------------

// Ziel: CSV-Datei ist geladen und die Daten sind in einem Array gespeichert

// --------------------------------------------------------------------------------

// const csvPfad = "../data-prep/geometries_erste100.csv"; // für zum Testen
const csvPfad = "../data-prep/geometries_final_angereichert.csv";

// dynamicTyping:true würde Papaparse dazu bringen, bei JEDER Zelle eine Zahlen-Erkennung
// laufen zu lassen - auch auf der sehr langen "koordinaten"-Spalte (WKT-Polygon-Strings).
// Stattdessen werden hier gezielt nur die tatsächlich numerisch gebrauchten Spalten umgewandelt.
const NUMERISCHE_SPALTEN = new Set(["flaeche", "zimmer_zaehler", "hoehenkote"]);

// Papa.parse(url, {download:true}) lädt und dekodiert die Antwort intern als EINEN einzigen
// String. Bei einer Datei dieser Grösse (500+ MB) schlägt das fehl (liefert leere Daten statt
// eines Fehlers) statt eines klaren Fehlers. Deshalb wird die Datei hier selbst als Blob geladen
// (funktioniert zuverlässig) und Papaparse liest den Blob dann in 5-MB-Stücken - dieselbe Menge
// Daten, aber nie mehr als ein Stück gleichzeitig im Speicher.
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
        // ergebnis.meta.cursor ist die Byteposition im Blob - falls das in dieser Papaparse-Version
        // beim Blob-Parsing unzuverlässig ist (NaN/undefined), fällt die Anzeige auf die reine
        // Gebäudezahl zurück statt einen falschen Prozentwert zu zeigen.
        const prozent = Math.round((ergebnis.meta.cursor / blob.size) * 100);
        splashFortschrittElement.textContent = Number.isFinite(prozent)
          ? `${prozent}% geladen (${gesehenGebaeudeIds.size.toLocaleString("de-CH")} Gebäude)`
          : `${gesehenGebaeudeIds.size.toLocaleString("de-CH")} Gebäude geladen…`;
      },
      complete: () => {
        // Das Parsen selbst ist hier fertig (Prozentanzeige stand zuletzt bei ~100%), aber
        // gebaeudeDarstellen() braucht danach nochmals mehrere Sekunden (Gruppieren, Geometrien
        // aufbauen, Rechteckpackung), ohne dass sich der Hauptthread währenddessen für ein DOM-Update
        // freigibt - dieser Text macht die Wartezeit sichtbar/verständlich, statt dass die Prozentzahl
        // einfach bei ~100% hängen bleibt. setTimeout statt direktem Aufruf, damit der Browser den
        // neuen Text noch rendert, bevor gebaeudeDarstellen() den Hauptthread synchron blockiert.
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
    zielArray.push(x0, hoehenkote, y0, x1, hoehenkote, y1); // die beiden mittleren Werte sind die Höhe
  }
}

// Ein Material für alle Schwarzplan-Füllungen (siehe schwarzplanFuellungErstellen) - keine Beleuchtung
// in der Szene, deshalb MeshBasicMaterial statt eines lichtabhängigen Materials. side:DoubleSide,
// da die Umlaufrichtung der WKT-Konturen nicht garantiert ist - je nachdem würde sonst durch die
// 90°-Drehung (siehe unten) die von der Kamera abgewandte Seite gerendert und die Füllung wäre
// unsichtbar statt schwarz.
const schwarzplanMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });

const gestapelteFuellungMaterial = new THREE.MeshBasicMaterial({ color: "var(--layout-hintergrund", side: THREE.DoubleSide }); // Farbe: GF Mesh bei Isometrie

// gruppe.fuellung ist entweder ein einzelnes Mesh, eine THREE.Group mit mehreren Meshes, oder null
// (siehe schwarzplanFuellungErstellen) - diese Hilfsfunktion setzt das Material unabhängig davon,
// welcher Fall gerade vorliegt.
function fuellungMaterialSetzen(fuellung, material) {
  if (!fuellung) return;
  if (fuellung.isMesh) {
    fuellung.material = material;
  } else {
    for (const mesh of fuellung.children) mesh.material = material;
  }
}

// Ray-Casting-Test: liegt punkt innerhalb von kontur? Damit lässt sich unterscheiden, ob eine
// zusätzliche Kontur ein Loch (liegt innerhalb einer grösseren Aussenkontur) oder ein eigenständiges,
// getrenntes Flächenstück ist (liegt ausserhalb) - siehe schwarzplanFuellungErstellen.
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

// Ziel: Aus den Geschossfläche-Zeilen eines Geschosses eine gefüllte (schwarze) Fläche statt nur
// Umrisslinien bauen, für den Schwarzplan-Look solange nicht reingezoomt ist (siehe
// linienSichtbarkeitAnwenden). Eine Zeile kann mehrere Konturen haben - nicht einfach "erste =
// Aussenkontur, Rest = Löcher" annehmen: bei einer Geometrie mit mehreren GETRENNTEN Flächenstücken
// (z.B. zwei Gebäudeflügel auf demselben Geschoss) wäre das falsch, das zweite Stück würde
// fälschlich als Loch vom ersten abgezogen statt selbst gefüllt zu werden. Stattdessen nach Fläche
// absteigend sortiert und jede kleinere Kontur nur dann als Loch behandelt, wenn sie tatsächlich
// innerhalb einer bereits erkannten Aussenkontur liegt (Innenhof), sonst als eigene Aussenkontur.
function schwarzplanFuellungErstellen(rohZeilen) {
  const meshes = [];

  for (const zeile of rohZeilen) {
    if (zeile.konturen.length === 0) continue;

    const nachFlaecheAbsteigend = zeile.konturen
      .slice()
      .sort((a, b) => Math.abs(flaecheAusKontur(b)) - Math.abs(flaecheAusKontur(a)));

    const aussenKonturen = []; // { shape, kontur } - kontur hier für den punktInKontur-Test der nächsten Runde
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
      // ShapeGeometry liegt lokal in der XY-Ebene (z=0) - +90° um X dreht (x,y,0) nach (x,0,y), also
      // in dieselbe XZ-Ebene wie die Umfassungslinien (siehe segmenteHinzufuegen).
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = zeile.hoehenkote - 0.5; // knapp unter den Linien, damit diese immer sichtbar obenauf bleiben
      meshes.push(mesh);
    }
  }

  if (meshes.length === 0) return null;
  if (meshes.length === 1) return meshes[0];

  const gruppe = new THREE.Group();
  gruppe.add(...meshes);
  return gruppe;
}

// Komplett unsichtbares Material (opacity 0, kein Depth-Write) - nur fürs Raycasting gedacht, nie zu
// sehen. depthWrite:false verhindert, dass diese Flächen trotz Unsichtbarkeit andere (z.B.
// transparente) Objekte an derselben Stelle im Depth-Buffer verdecken. side:DoubleSide aus demselben
// Grund wie bei schwarzplanMaterial (nicht garantierte Umlaufrichtung der WKT-Konturen) - Three.js
// raycastet Mesh-Geometrie nur auf der durch material.side festgelegten Seite, sonst blieben manche
// Räume je nach Winding unklickbar.
const raumKlickflaecheMaterial = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  depthWrite: false,
  side: THREE.DoubleSide,
});

// Sichtbares Gegenstück zu raumKlickflaecheMaterial - wird nur dem gerade angeklickten Raum-Mesh
// zugewiesen (siehe Klick-Handler), alle anderen bleiben auf raumKlickflaecheMaterial (unsichtbar).
// Halbtransparent, damit die Umfassungslinie des Raums (siehe mesh.position.y unten) nicht komplett
// zugedeckt wirkt, sondern die Markierung eher wie ein Farbschleier darüber liegt.
const raumHighlightMaterial = new THREE.MeshBasicMaterial({
  color: 0xc0392b,
  transparent: true,
  opacity: 0.45,
  depthWrite: false,
  side: THREE.DoubleSide,
});

// Ziel: Räume sind bisher nur an ihrer Umfassungslinie anklickbar (siehe klickbareObjekte), nicht in
// ihrer Fläche - ein sichtbares Material geht nicht, weil alle Geschosse koplanar auf y=0 liegen und
// sich beim Reinzoomen mehrere Geschosse gleichzeitig zeigen können (siehe linienSichtbarkeitAnwenden)
// - ein echtes Material würde darunterliegende Geschosse zudecken. Stattdessen EIN unsichtbares Mesh
// pro Aufruf (raumKlickflaecheMaterial) nur fürs Raycasting, dessen Geometrie alle Raum-Konturen der
// übergebenen rohZeilen zu EINER BufferGeometry zusammenfasst (mergeGeometries mit useGroups:true) -
// bei hunderttausenden Räumen im gesamten Datensatz wäre je ein eigenes Mesh+Geometry-Objekt pro Raum
// (Overhead durch Matrix4/Quaternion/BoundingSphere/BufferAttribute-Wrapper pro Objekt) zu
// speicherintensiv (siehe Absturz "out of memory"). Analog zu den Umfassungslinien (linien.userData.
// zeilen[segmentIndex], siehe weiter unten), trägt das gemergte Mesh userData.raeume[groupIndex] -
// geometry.groups (ein Eintrag pro Aussenkontur) macht daraus den Link zwischen einem angeklickten
// Face und seiner Ursprungszeile, UND erlaubt über group.materialIndex weiterhin, einzelne Räume
// individuell einzufärben (Klick-Highlight, Zimmer-Subtyp-Filter - siehe RAUM_MATERIALIEN_ARRAY),
// ohne dass jeder Raum ein eigenes Mesh bräuchte.
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
      // Höhe hier statt über mesh.position.y setzen (wie es ein Einzel-Mesh früher tat) - das
      // gemergte Mesh hat nur EINE gemeinsame Position, verschiedene Zeilen dieser Gruppe können
      // aber unterschiedliche hoehenkote haben. ShapeGeometry liegt lokal in der XY-Ebene (z=0); die
      // erst NACH dem Merge angewandte mesh.rotation.x = 90° (siehe unten) bildet lokal-Z auf
      // Welt-Y ab mit world_y = -local_z (Rotationsmatrix um X, siehe Kommentar bei mesh.rotation.x)
      // - daher hier auf lokal-Z statt Y verschieben, mit umgekehrtem Vorzeichen, damit nach der
      // Rotation exakt world_y = hoehenkote - 0.005 herauskommt.
      geometrie.translate(0, 0, -(zeile.hoehenkote - 0.005)); // knapp unter den Linien, damit diese bei aktiviertem Highlight obenauf bleiben
      geometrien.push(geometrie);
      raeume.push(zeile);
    }
  }

  if (geometrien.length === 0) return null;

  const geometrie = mergeGeometries(geometrien, true);
  // mergeGeometries vergibt bei useGroups:true pro Eingabegeometrie einen eigenen, aufsteigenden
  // materialIndex (0,1,2,...) - hier sollen aber erstmal ALLE Räume auf den Standard-Index zeigen,
  // individuelle Indizes werden erst bei Klick-Highlight/Subtyp-Filter gesetzt (siehe raumSubtypMarkierungAktualisieren).
  for (const gruppe of geometrie.groups) gruppe.materialIndex = RAUM_MATERIAL_INDEX.standard;

  const mesh = new THREE.Mesh(geometrie, RAUM_MATERIALIEN_ARRAY);
  mesh.rotation.x = Math.PI / 2; // gleiche Ausrichtung wie schwarzplanFuellungErstellen
  mesh.userData.raeume = raeume; // parallel zu geometry.groups, analog zu linien.userData.zeilen
  return mesh;
}

// Ziel: Pro Wohnung eine kreisförmige Flächenfüllung (30% Deckkraft, damit Räume darunter noch
// durchscheinen), die bei aktivem Wohnungen-/Zimmer-Filter um die passenden Wohnungen erscheint
// (siehe wohnungsMarkierungAktualisieren). Fläche des Kreises = Wohnungsgrundfläche * Faktor (siehe
// unten), damit der Kreis sichtbar grösser als die Wohnung selbst ist.

// Liest eine CSS-Custom-Property (z.B. "var(--series-zimmer)", wie DIMENSIONEN[dim].colorOf() sie
// liefert) auf und wandelt sie in eine THREE.Color um - die Filter-Farben sind nur in index.html als
// CSS-Variablen definiert, Three.js-Materialien verstehen aber kein var(...).
function cssFarbeAufloesen(varAusdruck) {
  const name = varAusdruck.match(/--[\w-]+/)[0];
  const wert = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(wert);
}

// Baut pro Wohnung eine Strich-Kontur auf einem Radius um ihren Wohnungs-Kreis-Mittelpunkt - ein
// voller Strich pro Einheit, ein halblanger für x.5 (z.B. 2.5 Zimmer = Strich-Strich-halber Strich).
// Fixer Winkelabstand zwischen den Strich-MITTEN (nicht auf den ganzen Kreis verteilt), damit der
// Abstand unabhängig von der Anzahl immer gleich bleibt. Wiederverwendbar für mehrere Kennzahlen
// (Zimmer, Badezimmer, ...) auf unterschiedlichen Radien - siehe wohnungsKreiseErstellen. Als
// 3D-Objekt statt HTML/CSS-Overlay, konsistent mit dem Wohnungs-Kreis selbst.
const ZIMMER_STRICH_WINKEL_SCHRITT = THREE.MathUtils.degToRad(20); // Winkelabstand zwischen zwei Strich-Mitten
const ZIMMER_STRICH_WINKEL_BREITE = THREE.MathUtils.degToRad(12); // "Länge" eines vollen Strichs (in Grad Bogenmass)
const ZIMMER_STRICH_HOEHE = 1.5; // Meter - wie hoch die Strich-"Balken" aus der Grundfläche ragen, für bessere Erkennbarkeit in der gekippten 3D-Ansicht
const ZIMMER_STRICH_DICKE = 1; // Meter - radiale Dicke der Striche. WICHTIG: eine reine Wand ohne Dicke hat aus der senkrechten Draufsicht keine Fläche (man schaut exakt auf ihre Kante) und wäre dort unsichtbar - erst die Dicke gibt ihr eine von oben sichtbare Deckfläche.

// Kleiner "Balken" entlang eines Kreisbogens (Deckfläche oben bei y=ZIMMER_STRICH_HOEHE - von der
// Draufsicht sichtbar -, plus Innen-/Aussenseite und Endkappen für die gekippte Ansicht; mehrere
// gerade Segmente statt einer einzelnen Sehne, damit er der Kreisrundung sichtbar folgt) um
// winkelMitte herum, mit gegebener Winkelbreite. Gibt Vertex-/Index-Arrays zurück (statt einer
// fertigen Geometrie), damit mehrere Bögen in wohnungsStrichKonturErstellen zu EINER gemeinsamen
// Geometrie zusammengefügt werden können.
function bogenWandErstellen(radius, winkelMitte, winkelBreite, segmente = 12) {
  const start = winkelMitte - winkelBreite / 2;
  const innenRadius = radius;
  const aussenRadius = radius + ZIMMER_STRICH_DICKE;

  // Pro Winkel-Schritt 4 Punkte: innen-unten, aussen-unten, innen-oben, aussen-oben
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

    indices.push(iInnenO, iAussenO, jAussenO, iInnenO, jAussenO, jInnenO); // Deckfläche (von oben sichtbar)
    indices.push(iAussenU, iAussenO, jAussenO, iAussenU, jAussenO, jAussenU); // Aussenseite
    indices.push(iInnenU, jInnenU, jInnenO, iInnenU, jInnenO, iInnenO); // Innenseite
  }
  // Endkappen an beiden Enden des Bogenstücks, sonst wirkt es dort hohl/offen
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
    depthWrite: false, // verhindert, dass die Kontur trotz Transparenz die Grundriss-Linien dahinter verdeckt
  });
  return new THREE.Mesh(geometrie, material);
}

// Baut für jede Wohnung eines Gebäudes einen (anfangs unsichtbaren) Kreis - Zentrum/Höhe aus der
// Bounding-Box ihrer Räume, Radius aus deren Fläche - sowie die daugehörigen Zimmer-Punkte auf
// seinem Rand. Muss NACH dem Aufbau von gebaeude.linienObjekte aufgerufen werden, da beide dort mit
// eingetragen werden (fürs Mitverschieben beim Neu-Packen).
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

  // Positioniert eine Strich-Kontur (falls vorhanden) am Wohnungs-Mittelpunkt und trägt sie in
  // Szene/linienObjekte/alleWohnungsKreise/alleZimmerKonturen ein - gemeinsame Schritte für Zimmer-
  // UND Badezimmer-Kontur, siehe unten.
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
      depthWrite: false, // verhindert Z-Fighting/Verdecken bei mehreren überlappenden Kreisen
    });
    const kreis = new THREE.Mesh(geometrie, material);
    // CircleGeometry liegt lokal in der XY-Ebene (z=0) - +90° um X dreht (x,y,0) nach (x,0,y), analog
    // schwarzplanFuellungErstellen.
    kreis.rotation.x = Math.PI / 2;
    kreis.position.set(mitteX, bbox.hoehenkote, mitteZ);
    kreis.visible = false; // erst sichtbar, wenn wohnungsMarkierungAktualisieren eine passende Wohnung findet

    scene.add(kreis);
    gebaeude.linienObjekte.push(kreis); // damit gebaeudePositionSetzen ihn beim Neu-Packen mitverschiebt
    alleWohnungsKreise.push(kreis); // für die Zoom-Skalierung, siehe wohnungsKreiseSkalierenAnKamera
    kreise[wohnungId] = kreis;

    // Zimmer-Strich-Kontur auf dem Rand DIESES Kreises (radius) - unabhängig von dessen Sichtbarkeit,
    // siehe wohnungsMarkierungAktualisieren. null, falls die Wohnung keine (bekannte) Zimmerzahl hat.
    const zimmerKontur = wohnungsStrichKonturErstellen(radius, gebaeude.zimmerProWohnung[wohnungId] || 0);
    if (konturRegistrieren(zimmerKontur, mitteX, mitteZ, bbox.hoehenkote)) {
      zimmerKonturen[wohnungId] = zimmerKontur;
    }

    // Badezimmer-Strich-Kontur auf einem ÄUSSEREN Radius (125% des Kreisrands), damit sie ausserhalb
    // liegt und nicht mit der Zimmer-Kontur überlappt - zwei konzentrische Ringe statt einem.
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
      // koordinaten (roher WKT-String) wird nirgends mehr gebraucht, sobald konturen daraus geparst
      // ist - weggelassen, da er oft das grösste Feld pro Zeile ist und sonst für die Lebensdauer der
      // App doppelt (als String UND als geparste Zahlen) im Speicher bleibt.
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

    // Pro-Wohnung-Kennzahlen (unabhängig von der SIA416-Kategorie): Gesamtfläche der Wohnung sowie
    // die Fläche ihrer Zimmerprogramm-Räume (Wohnen/Schlafen, Essen, Küche, Balkon, Reduit, Nasszelle)
    // und die Anzahl Badezimmer.
    const wohnungsFlaeche = {};
    const wohnenSchlafenFlaechen = {}; // wohnungId -> [Fläche, Fläche, ...] (jedes Zimmer einzeln, nicht summiert)
    const esszimmerFlaechen = {}; // wohnungId -> [Fläche, ...]
    const kuecheFlaeche = {};
    const balkonFlaeche = {};
    const reduitFlaeche = {};
    const nasszelleFlaeche = {};
    const badAnzahl = {};

    // Für "Anzahl Wohnungen pro Geschoss": pro Geschoss die Menge der dort liegenden Wohnungen,
    // sowie pro Wohnung ihr unterstes Geschoss (Heimgeschoss), für den seltenen Fall von Wohnungen
    // über mehrere Geschosse (Maisonette).
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
        // "flaeche" ist bei Geschossfläche-Zeilen leer -> Fläche selbst aus der Kontur berechnen
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
    // Für gebaeudePositionenAktualisieren: Rückkehr zur ursprünglichen (vollen) Anordnung, sobald kein Filter mehr aktiv ist.
    gebaeude.urspruenglicheMitteX = gebaeude.mitteX;
    gebaeude.urspruenglicheMitteZ = gebaeude.mitteZ;
  }

  gebaeudeNachId = new Map(gebaeudeListe.map((gebaeude) => [gebaeude.gebaeude_id, gebaeude]));

  for (const gebaeude of gebaeudeListe) {
    // Gruppiert nach entitaet_typ UND geschoss_label (statt nur entitaet_typ) - jedes Geschoss
    // bekommt so sein eigenes Material und kann unabhängig ein-/ausgeblendet werden (siehe
    // gebaeudeDimmingAktualisieren, Geschoss-Filter).
    const geschossGruppen = {};

    for (const zeile of gebaeude.zeilen) {
      if (!stiftfarbeUmfassungslinie[zeile.entitaet_typ]) continue;

      const schluessel = `${zeile.entitaet_typ}|${zeile.geschoss_label}`;
      if (!geschossGruppen[schluessel]) {
        geschossGruppen[schluessel] = {
          positionen: [],
          zeilen: [],
          rohZeilen: [], // eine pro Zeile statt pro Segment - für die Schwarzplan-Füllung (Geschossfläche)
          entitaetTyp: zeile.entitaet_typ,
          geschossLabel: zeile.geschoss_label,
        };
      }
      const gruppe = geschossGruppen[schluessel];
      gruppe.rohZeilen.push(zeile);

      for (const kontur of zeile.konturen) {
        segmenteHinzufuegen(gruppe.positionen, kontur, zeile.hoehenkote);
        // Pro hinzugefügtem Segment dieselbe Zeile vermerken (kontur.length - 1 Segmente pro Kontur)
        for (let i = 0; i < kontur.length - 1; i++) {
          gruppe.zeilen.push(zeile);
        }
      }
    }

    gebaeude.linienMaterialien = []; // { material, linien, fuellung, geschossLabel, entitaetTyp, gefiltertSichtbar }
    gebaeude.linienObjekte = []; // für gebaeudePositionSetzen (Neu-Packen beim Filtern)

    for (const gruppe of Object.values(geschossGruppen)) {
      const material = stiftfarbeUmfassungslinie[gruppe.entitaetTyp].clone();
      material.transparent = true; // ermöglicht opacity 0 zum Ausblenden, siehe gebaeudeDimmingAktualisieren
      renderer.getSize(material.resolution);
      gebaeudeLinienMaterialien.push(material);

      const geometrie = new LineSegmentsGeometry();
      geometrie.setPositions(gruppe.positionen);

      const linien = new LineSegments2(geometrie, material);
      linien.computeLineDistances();
      linien.userData.zeilen = gruppe.zeilen; // für die Infobox: Zeile pro Segment-Index
      // Anfangs nur Geschossfläche des Startgeschosses sichtbar (siehe linienSichtbarkeitAnwenden) -
      // alles andere ist zwar schon aufgebaut (damit es beim Reinzoomen/Filtern sofort da ist), aber
      // ausgeblendet. Wird direkt nach dem Laden ohnehin von detailSichtbarkeitAktualisieren(true)
      // nochmals korrekt gesetzt, hier nur ein sinnvoller Startwert.
      linien.visible = gruppe.entitaetTyp === "Geschossfläche" && gruppe.geschossLabel === STARTGESCHOSS_LABEL;
      scene.add(linien);
      klickbareObjekte.push(linien);
      gebaeude.linienObjekte.push(linien);

      // Schwarzplan-Füllung nur für Geschossfläche - Mesh statt Linien, siehe schwarzplanFuellungErstellen.
      let fuellung = null;
      if (gruppe.entitaetTyp === "Geschossfläche") {
        fuellung = schwarzplanFuellungErstellen(gruppe.rohZeilen);
        if (fuellung) {
          fuellung.visible = linien.visible; // gleicher Startwert, wird ebenfalls gleich danach korrigiert
          scene.add(fuellung);
          gebaeude.linienObjekte.push(fuellung); // damit gebaeudePositionSetzen sie beim Neu-Packen mitverschiebt
        }
      }

      // Unsichtbare Klickfläche nur für Räume - macht sie in ihrer ganzen Fläche anklickbar statt
      // nur an der Umfassungslinie, siehe raumKlickflaechenErstellen. EIN gemergtes Mesh für alle
      // Räume dieser Geschoss-Gruppe (statt eines pro Raum, siehe Kommentar dort).
      const klickflaeche = gruppe.entitaetTyp === "Raum" ? raumKlickflaechenErstellen(gruppe.rohZeilen) : null;
      if (klickflaeche) {
        klickflaeche.visible = linien.visible; // gleicher Startwert, wird ebenfalls gleich danach korrigiert
        scene.add(klickflaeche);
        klickbareObjekte.push(klickflaeche);
        alleRaumKlickflaechen.push(klickflaeche);
        gebaeude.linienObjekte.push(klickflaeche); // damit gebaeudePositionSetzen sie beim Neu-Packen mitverschiebt
      }

      gebaeude.linienMaterialien.push({
        material,
        linien,
        fuellung,
        klickflaeche,
        geschossLabel: gruppe.geschossLabel,
        entitaetTyp: gruppe.entitaetTyp,
        gefiltertSichtbar: true, // von gebaeudeDimmingAktualisieren aktuell gehalten, initial nichts gefiltert
        // Nur die initial sichtbare Geschossfläche (STARTGESCHOSS_LABEL) startet unenthüllt und wird von
        // enthuellungStarten() zufällig gestaffelt eingeblendet ("Ameisenhaufen"-Reveal, Akt 2); alles
        // andere (andere Geschosse, Raum/Öffnung/Ausstattung) folgt unverändert Filter/Zoom.
        enthuellt: !(gruppe.entitaetTyp === "Geschossfläche" && gruppe.geschossLabel === STARTGESCHOSS_LABEL),
      });
    }

    const { kreise, zimmerKonturen, badezimmerKonturen } = wohnungsKreiseErstellen(gebaeude);
    gebaeude.wohnungsKreise = kreise;
    gebaeude.wohnungsZimmerKontur = zimmerKonturen;
    gebaeude.wohnungsBadezimmerKontur = badezimmerKonturen;
  }

  kameraAufGebaeudeZentrieren(gebaeudeListe);
  // erzwingen:true, weil frustumSize gerade erst durch kameraAufGebaeudeZentrieren den echten Wert
  // für diesen Datensatz bekommen hat - ohne das könnte der Vergleich mit dem alten Vorgabewert
  // zufällig gleich ausfallen und Raum/Öffnung/Ausstattung blieben fälschlich ausgeblendet.
  detailSichtbarkeitAktualisieren(true);
  filterPanelErstellen();

  splashAusblenden();
  enthuellungStarten(gebaeudeListe);
}

// --------------------------------------------------------------------------------

// Ziel: Akt 2 - Gebäude "erscheinen" beim ersten Laden zufällig gestaffelt (wie gebaut, nicht wie
// hereingeflogen/skaliert - reines Sichtbarkeits-Toggle auf bereits fertig aufgebauten Objekten), ganz
// ohne Filterleiste. Erst NACHDEM alle Gebäude enthüllt sind (oder der Nutzer die Enthüllung per
// Interaktion überspringt), blendet die Filterleiste per Crossfade ein - so bleibt der erste Eindruck
// ungestört nur der Schwarzplan, bevor die Bedienoberfläche dazukommt.

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

// display:none erst NACH der Opacity-Transition, sonst würde #splash sofort aus dem Layout
// verschwinden und könnte während des Fades keine Klicks/Pointer-Events mehr blockieren wollen -
// pointer-events:none (siehe CSS .ausgeblendet) übernimmt das ohnehin schon ab Transitionsbeginn.
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
        // Sichtbarkeit aus dem AKTUELLEN Filter-/Zoom-Zustand neu ableiten statt stur visible=true zu
        // setzen - so kann ein Gebäude, das während des Reveals weggefiltert oder rausgezoomt wurde,
        // trotzdem korrekt unsichtbar bleiben, statt kurz aufzublitzen.
        linienSichtbarkeitAnwenden(eintrag.gruppe);
      } else {
        alleFertig = false;
      }
    }
    if (!alleFertig) requestAnimationFrame(schritt);
    else filterLeisteEinblenden();
  }
  requestAnimationFrame(schritt);

  // Interaktion (Klick/Scroll) während des Reveals beendet es sofort - sonst könnten neu gefilterte
  // oder reingezoomte Gebäude bis zu ihrem zufälligen Zeitpunkt künstlich verzögert erscheinen.
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

// Reine Berechnung (keine Mutation) -> auch für das Neu-Packen einer gefilterten Teilmenge
// wiederverwendbar (siehe gebaeudePositionenAktualisieren), nicht nur beim initialen Laden.
function packPositionenBerechnen(gebaeudeUnterliste) {
  const gesamtFlaeche = gebaeudeUnterliste.reduce(
    (summe, g) => summe + (g.breite + gebaeudeAbstand) * (g.tiefe + gebaeudeAbstand),
    0
  );
  // Packfläche grosszügiger als die reine Summe wählen, sonst braucht der Zufalls-Algorithmus
  // zu viele Versuche bzw. findet für die letzten Gebäude keinen Platz mehr.
  // Das Seitenverhältnis der Packfläche folgt der tatsächlichen Zeichenfläche (ohne oberen Rand),
  // damit die Anordnung dem sichtbaren Ausschnitt entspricht statt quadratisch zu sein.
  const fensterAspect = zeichenBreite() / zeichenHoehe();
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

// Wie gebaeudeVerschieben, aber für ein bereits dargestelltes Gebäude: verschiebt die fertigen
// Three.js-Objekte (Linien, Overlay-Position) statt der rohen Vertex-Daten, da Linien-Geometrien zu
// diesem Zeitpunkt schon aus den Zeilen gebaut sind (siehe gebaeudePositionenAktualisieren).
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

  // aktuellesAspect muss VOR diagonalRadius stehen, da unten verwendet
  const aktuellesAspect = zeichenBreite() / zeichenHoehe();

  const horizontalRadius = Math.sqrt(((maxX - minX) / 2) ** 2 + ((maxZ - minZ) / 2) ** 2);
  const diagonalRadius = Math.sqrt(horizontalRadius ** 2 + maxHoehe ** 2);

frustumSize = Math.max(diagonalRadius * 2, (maxX - minX) / aktuellesAspect) * 0.38;
  kameraFrustumAktualisieren(aktuellesAspect);

  // "zoom to fit": Blickrichtung bleibt erhalten (auch wenn schon gekippt, z.B. durch einen
  // Filterwechsel während der Perspective-Phase), nur Zentrum und Zoom/Distanz werden neu gesetzt -
  // sonst würde ein Neu-Zentrieren eine bereits gekippte Ansicht ungewollt auf die Draufsicht zurücksetzen.
  if (camera === kameraOrtho) {
    kameraOrtho.zoom = 1; // sauberer "zoom to fit" statt mit dem zuletzt vom Nutzer gewählten Zoom zu skalieren
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
const alleRaumKlickflaechen = []; // Teilmenge von klickbareObjekte (nur die gemergten Raum-Meshes, ein Eintrag pro Gebäude+Geschoss statt pro Raum) - für raumSubtypMarkierungAktualisieren

const raycaster = new THREE.Raycaster(); // greift die nächste Linie resp. Fläche die sich bei der Maus befindet
raycaster.params.Line2 = { threshold: 8 }; // die Zahl ist die Tolleranz wie genau ich die Linie treffen muss

const infobox = document.getElementById("infobox");

// Liefert den geometry.groups-Index, in dessen Dreiecksbereich faceIndex (von Raycaster.intersectObjects
// gelieferter Dreieck-Index) fällt - group.start/count sind in Index-Array-Einheiten (3 pro Dreieck),
// siehe raumKlickflaechenErstellen. Analog zu userData.zeilen[segmentIndex] bei den Umfassungslinien,
// nur dass hier wegen der Mehrfarbigkeit (Klick-Highlight/Subtyp-Filter, siehe RAUM_MATERIALIEN_ARRAY)
// zusätzlich der Gruppen-Index gebraucht wird, nicht nur die Zeile selbst.
function raumGruppenIndexVonFace(mesh, faceIndex) {
  const gruppen = mesh.geometry.groups;
  const zielIndex = faceIndex * 3;
  for (let i = 0; i < gruppen.length; i++) {
    const gruppe = gruppen[i];
    if (zielIndex >= gruppe.start && zielIndex < gruppe.start + gruppe.count) return i;
  }
  return -1;
}

// Aktuell farblich markierte Raum-Gruppen (materialIndex highlight statt standard), falls gerade ein
// Raum ausgewählt ist - siehe Klick-Handler unten. Ein Raum kann bei unregelmässiger Form aus MEHREREN
// geometry.groups bestehen (siehe raumKlickflaechenErstellen, eine pro Aussenkontur), die alle
// dasselbe zeile-Objekt in userData.raeume[gruppenIndex] tragen - deshalb ein Array aus
// { mesh, gruppenIndex } statt eines einzelnen Eintrags, sonst blieben Teile des Raums unmarkiert
// ("abgeschnitten").
let ausgewaehlteRaumGruppen = [];

// Rohe Zeile des zuletzt angeklickten Elements (Linie oder Raum-Klickfläche), unabhängig davon ob es
// sich um einen Raum handelt oder nicht - für die Isolierung per Taste I (siehe dort).
let ausgewaehlteZeile = null;

// { gebaeudeId, geschossLabel } | null - geschossLabel null isoliert das ganze Gebäude (alle
// Geschosse), gesetzt isoliert zusätzlich auf ein einzelnes Geschoss. Siehe Taste I weiter unten und
// gebaeudeDimmingAktualisieren, wo das ausgewertet wird.
let isolierung = null;

function raumAuswahlAufheben() {
  for (const { mesh, gruppenIndex } of ausgewaehlteRaumGruppen) {
    mesh.geometry.groups[gruppenIndex].materialIndex = RAUM_MATERIAL_INDEX.standard;
  }
  ausgewaehlteRaumGruppen = [];
}

renderer.domElement.addEventListener("click", (e) => {
  // Koordinaten relativ zur tatsächlichen Canvas-Position/-Grösse statt zum ganzen Fenster, da die
  // Zeichnung seit dem linken Rand (siehe zeichenBreite) nicht mehr bei Fenster-x=0 beginnt.
  const rect = renderer.domElement.getBoundingClientRect();
  const maus = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );

  raycaster.setFromCamera(maus, camera);
  // .intersectObjects() ignoriert object.visible NICHT automatisch - durch Filter ausgeblendete
  // (aber weiterhin in klickbareObjekte vorhandene) Linien müssen daher hier manuell rausgefiltert
  // werden, sonst liefert ein Klick an ihrer Position trotzdem einen Treffer.
  const treffer = raycaster.intersectObjects(klickbareObjekte.filter((objekt) => objekt.visible));

  if (treffer.length === 0) {
    infobox.style.display = "none";
    raumAuswahlAufheben();
    ausgewaehlteZeile = null;
    return;
  }

  const naechsterTreffer = treffer[0];
  const getroffenesObjekt = naechsterTreffer.object;
  // Linien (Line2) haben userData.zeilen (eine Zeile pro Segment-Index), die gemergten unsichtbaren
  // Raum-Klickflächen (siehe raumKlickflaechenErstellen) userData.raeume (eine Zeile pro
  // geometry.groups-Index) - der passende Gruppen-Index kommt aus dem getroffenen Dreieck.
  const istRaumMesh = !!getroffenesObjekt.userData.raeume;
  const gruppenIndex = istRaumMesh ? raumGruppenIndexVonFace(getroffenesObjekt, naechsterTreffer.faceIndex) : -1;
  const zeile = istRaumMesh
    ? getroffenesObjekt.userData.raeume[gruppenIndex]
    : getroffenesObjekt.userData.zeilen[naechsterTreffer.faceIndex];
  ausgewaehlteZeile = zeile;

  // Farbliche Markierung nur für Räume (erkennbar an userData.raeume) - erneuter Klick auf denselben
  // Raum hebt die Markierung wieder auf, Klick auf einen anderen Raum (oder eine Linie) wechselt sie.
  // Markiert werden ALLE Gruppen mit derselben zeile im selben Mesh (siehe raumKlickflaechenErstellen -
  // ein Raum kann bei unregelmässiger Form aus mehreren Aussenkonturen/Gruppen bestehen, aber immer
  // innerhalb derselben Geschoss-Gruppe/desselben Meshes), nicht nur die vom Raycaster getroffene,
  // sonst blieben Teile des Raums unmarkiert.
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

  // hier kann ich das infofeld mit informationen gestalten
  // <strong>  = bolt </strong>

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

// ESC schliesst die Infobox und hebt eine bestehende Raum-Markierung auf, genau wie ein Klick ins Leere.
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  infobox.style.display = "none";
  raumAuswahlAufheben();
  ausgewaehlteZeile = null;
});

// I isoliert das zuletzt angeklickte Element (ausgewaehlteZeile, siehe Klick-Handler oben): eine
// Geschossfläche (GF) isoliert das ganze Gebäude (alle Geschosse), jedes andere Element (Raum/
// Öffnung/Ausstattung) zusätzlich auf dessen Geschoss. Bewusst nur bis auf Geschoss-Ebene, nicht bis
// zur einzelnen Wohnung: deren Räume liegen in derselben Linien-Geometrie wie die der Nachbarwohnungen
// auf demselben Geschoss (siehe gebaeudeDarstellen) und lassen sich darum nicht separat ausblenden,
// ohne die Geometrie-Gruppierung aufzusplitten - bei diesem grossen Datensatz nicht ohne Weiteres
// vertretbar (mehr einzelne Linien-Objekte pro Gebäude). Erneuter Tastendruck hebt die Isolierung
// wieder auf, unabhängig von der aktuellen Auswahl.
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

// F fixiert/löst die Gebäude-Positionierung (siehe positionierungFixiert oben und ihre Nutzung in
// filterAendern): typischer Ablauf ist erst grob mit Gebäude-/Wohnungen-Filtern eingrenzen (Gebäude
// packen sich dabei neu, Kamera zentriert mit) und danach in die Feineinstellung (z.B. die neuen
// Flächen-Filter) wechseln, ohne dass sich die Ansicht dabei noch verschiebt.
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() !== "f") return;
  positionierungFixiert = !positionierungFixiert;
  console.log(positionierungFixiert ? "Positionierung fixiert (F zum Lösen)" : "Positionierung wieder aktiv (F zum Fixieren)");
});

// R löst manuell eine Neu-Positionierung mit dem aktuell gewählten Filter aus (siehe
// positionierungAusloesen) - funktioniert auch bei aktiver Fixierung, für ein bewusstes einmaliges
// "Nachziehen" der Ansicht, ohne die Fixierung selbst aufzuheben.
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() !== "r") return;
  positionierungAusloesen();
});

// 4x Supersampling: vierfache Pixel-Dichte des Bildschirms für einen Export, der auch beim Reinzoomen
// oder Drucken noch scharf bleibt.
const PNG_EXPORT_SKALIERUNG = 4;

// P exportiert die aktuelle Ansicht als PNG. Rendert dafür kurz in höherer Auflösung (siehe
// PNG_EXPORT_SKALIERUNG), liest das Bild aus dem Canvas und setzt danach Auflösung + Frame wieder
// zurück - alles synchron in einem Zug, bevor der Browser überhaupt neu zeichnet, sodass der
// hochskalierte Zwischenzustand nie sichtbar aufblitzt.
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() !== "p") return;

  const breite = zeichenBreite();
  const hoehe = zeichenHoehe();

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

// --------------------------------------------------------------------------------

// Ziel: Fläche einer (evt. mehrteiligen) Kontur ist berechnet, z.B. für Geschossfläche-Zeilen,
// deren "flaeche"-Spalte leer ist

// --------------------------------------------------------------------------------

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
  // Erst alle (vorzeichenbehafteten) Konturen aufsummieren, danach einmal abs() -> Löcher
  // (z.B. Innenhöfe als zweite Kontur mit umgekehrtem Umlaufsinn) ziehen sich dabei automatisch ab,
  // statt bei einem abs() pro Kontur fälschlicherweise mitgezählt zu werden.
  return Math.abs(konturen.reduce((summe, kontur) => summe + flaecheAusKontur(kontur), 0));
}

// --------------------------------------------------------------------------------

// Ziel: Gebäude ohne zum Filter passende Wohnung sind ausgeblendet, indem ihre Linienobjekte auf
// visible=false gesetzt werden (nicht nur opacity 0 - siehe gebaeude.linienMaterialien). Zusätzlich
// blendet ein aktiver Geschoss-Filter innerhalb jedes (weiterhin sichtbaren) Gebäudes alle nicht
// ausgewählten Geschosse aus, da jedes Geschoss dank der Gruppierung in gebaeudeDarstellen sein
// eigenes Material/Objekt hat.
//
// visible=false ist hier wichtig, nicht nur opacity=0: alle Linien liegen exakt auf derselben Höhe
// (y=0, siehe segmenteHinzufuegen) und sind transparent:true (nötig für die Opacity-Blendung). Beim
// Neu-Packen der gefilterten Teilmenge (gebaeudePositionenAktualisieren) landen ausgeblendete
// Gebäude oft dort, wo jetzt sichtbare Gebäude neu platziert werden - bei nur opacity=0 bleiben sie
// aber weiterhin gerendert und interferieren als koplanare transparente Geometrie am selben Ort mit
// den sichtbaren Linien (sichtbare Schnitte/Lücken). Mit visible=false werden sie komplett vom
// Rendering ausgeschlossen und können nicht mehr stören.
//
// Ob eine Gruppe am Ende WIRKLICH sichtbar ist, hängt von zwei unabhängigen Gründen ab: dem Filter
// (gefiltertSichtbar, hier gesetzt) und der aktuellen Zoomstufe (detailSichtbar, siehe
// detailSichtbarkeitAktualisieren) - deshalb setzt diese Funktion nicht direkt linien.visible,
// sondern lässt linienSichtbarkeitAnwenden() beide Gründe kombinieren.
function linienSichtbarkeitAnwenden(gruppe) {
  if (gruppe.entitaetTyp !== "Geschossfläche") {
    // Raum/Öffnung/Ausstattung: unverändert nur abhängig von Filter + Zoomstufe, alle Geschosse gleich.
    gruppe.linien.visible = gruppe.gefiltertSichtbar && detailSichtbar;
    // Klickfläche (nur bei Raum vorhanden, siehe raumKlickflaechenErstellen) folgt derselben
    // Sichtbarkeit wie die Umfassungslinie - Räume sind genau dann anklickbar, wenn sie auch gezeichnet werden.
    if (gruppe.klickflaeche) gruppe.klickflaeche.visible = gruppe.linien.visible;
    return;
  }

  // Geschossfläche: ohne aktiven Geschoss-Filter nur STARTGESCHOSS_LABEL zeigen (andere Geschosse
  // bleiben leer, bis reingezoomt wird). Ist ein Geschoss-Filter aktiv, übernimmt stattdessen
  // gefiltertSichtbar (siehe gebaeudeDimmingAktualisieren) die Auswahl - der Nutzer sieht dann genau
  // die gefilterten Geschosse, nicht zwingend das Startgeschoss. Gekippte Kamera (kameraGeschwenkt)
  // schaltet ebenfalls auf "alle Geschosse" um, für den gestapelten 3D-Blick.
  const geschossFilterAktiv = filterAuswahl.geschoss.size > 0;
  const geschossBasisSichtbar = geschossFilterAktiv || gruppe.geschossLabel === STARTGESCHOSS_LABEL || kameraGeschwenkt;
  // gruppe.enthuellt gated den Akt-2-Reveal (siehe enthuellungStarten): bis ein Gebäude "an der Reihe"
  // ist, bleibt es unsichtbar, auch wenn Filter/Zoom es sonst zeigen würden.
  gruppe.linien.visible = gruppe.gefiltertSichtbar && gruppe.enthuellt && (geschossBasisSichtbar || detailSichtbar);

  // Schwarzplan-Füllung: wie die Geschossfläche-Linie selbst, aber nur solange NICHT reingezoomt ist -
  // sobald die Detailschwelle erreicht ist, verschwindet die Füllung wieder. Ausnahme: bei gekippter
  // Kamera bleibt sie auch beim Reinzoomen sichtbar, da sich Geschosse dank hoehenkote räumlich nicht
  // mehr überlagern.
  if (gruppe.fuellung) {
    gruppe.fuellung.visible = gruppe.gefiltertSichtbar && gruppe.enthuellt && geschossBasisSichtbar && (!detailSichtbar || kameraGeschwenkt);
    fuellungMaterialSetzen(gruppe.fuellung, kameraGeschwenkt ? gestapelteFuellungMaterial : schwarzplanMaterial);
  }
}

function gebaeudeDimmingAktualisieren(matchAnzahlProGebaeude, ausgewaehlteGeschosse) {
  const geschossFilterAktiv = ausgewaehlteGeschosse.size > 0;

  for (const [gebaeude_id, gebaeude] of gebaeudeNachId) {
    // kein Wohngebäude -> nie wegen Wohnungs-Filtern ausblenden, Geschoss-Filter gilt aber trotzdem
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

// Ziel: Bei aktivem Wohnungsgrösse-Filter werden die dazu passenden Wohnungen mit einem farbigen Kreis
// markiert (Fläche, siehe wohnungsKreiseErstellen), bei aktivem Zimmer- bzw. Badezimmer-Filter mit
// einer Strich-Kontur auf dessen Rand bzw. einem inneren Ring (siehe wohnungsStrichKonturErstellen) -
// alle unabhängig voneinander sichtbar, andere Wohnungen-/Zimmer-Filter (Küchengrösse etc.) bekommen
// später eigene Überlagerungen und lösen HIER bewusst nichts aus. Gebäude-Dimming allein zeigt nur,
// dass IRGENDEINE Wohnung im Gebäude passt, nicht WELCHE.
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

// Ziel: Bei aktivem Filter rücken die (noch sichtbaren) Gebäude enger zusammen, statt verstreut in
// ihrer für die volle Menge berechneten Anordnung zu bleiben - dafür wird für die aktuell passende
// Teilmenge ein neues, engeres Packaging berechnet (siehe packPositionenBerechnen). Ohne Filter
// kehren alle Gebäude zu ihrer ursprünglichen (beim Laden gewürfelten) Position zurück.

// --------------------------------------------------------------------------------

let letztePackSignatur = null; // um bei jedem Zwischenschritt eines Drags (viele filterAendern-Aufrufe) nicht ständig neu (zufällig) zu packen

function gebaeudePositionenAktualisieren(matchAnzahlProGebaeude, filterAktiv) {
  const alleGebaeude = [...gebaeudeNachId.values()];

  if (!filterAktiv) {
    if (letztePackSignatur === null) return; // schon in der ursprünglichen Anordnung -> nichts zu tun
    for (const gebaeude of alleGebaeude) {
      gebaeudePositionSetzen(gebaeude, gebaeude.urspruenglicheMitteX, gebaeude.urspruenglicheMitteZ);
    }
    letztePackSignatur = null;
    kameraAufGebaeudeZentrieren(alleGebaeude);
    return;
  }

  // Gebäude ohne Wohnungen werden nie ausgeblendet (siehe gebaeudeDimmingAktualisieren) -> bleiben
  // Teil der sichtbaren Gruppe, sonst würden sie isoliert von der neu gepackten Gruppe zurückbleiben.
  const sichtbareGebaeude = alleGebaeude.filter(
    (gebaeude) => gebaeude.wohnungenAnzahl === 0 || matchAnzahlProGebaeude.get(gebaeude.gebaeude_id) > 0
  );

  if (sichtbareGebaeude.length === 0) return; // Filter passt auf nichts -> nichts zu packen, Kamera bleibt wie sie ist

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

// Ziel: Crossfilter-Panel über die Wohnungs-Kennzahlen, gruppiert nach Gebäude / Wohnungen / Zimmer
// (Geschossfläche, Anteil HNF an GF, Gebäudetiefe, Geschossigkeit, Wohnungen pro Gebäude/Geschoss,
// Zimmer pro Wohnung, Wohnungsgrösse, Anzahl Badezimmer, sowie die Zimmerprogramm-Grössen Kochen/
// Essen/Wohnen-Schlafen/Freibereiche/Aufbewahren/Nasszellen). Ein "Item" ist eine Wohnung; die
// gebäude-/geschossbezogenen Kennzahlen werden jeder Wohnung mitgegeben, die übrigen sind der eigene
// Wert der Wohnung.

// --------------------------------------------------------------------------------

// Welche entitaet_subtyp-Werte zu welcher Raumart zählen (für die Zimmerprogramm-Kennzahlen unter
// "Zimmer"). "Wohn-/Esszimmer" zählt bewusst zu Wohnen/Schlafen UND zu Essen, da dieser Raum beide
// Funktionen kombiniert - das dupliziert die Fläche nicht innerhalb einer Dimension, nur über zwei
// verschiedene Dimensionen hinweg.
const WOHNEN_SCHLAFEN_SUBTYPEN = new Set(["Zimmer", "Wohnzimmer", "Schlafzimmer", "Wohn-/Esszimmer"]);
const ESSEN_SUBTYPEN = new Set(["Esszimmer", "Wohn-/Esszimmer"]);
const KUECHE_SUBTYPEN = new Set(["Küche", "Wohnküche"]);
const BALKON_SUBTYPEN = new Set(["Balkon", "Aussenraum", "Loggia", "Terrasse", "Wintergarten", "Garten", "Arkade"]);
const REDUIT_SUBTYPEN = new Set(["Abstellraum"]);
const NASSZELLE_SUBTYPEN = new Set(["Badezimmer", "Toilette", "Dusche"]);

// Ziel: Bei aktivem Zimmer-Gruppen-Filter (Küchengrösse, Esszimmergrösse, ...) werden die dazu
// passenden Räume in ihrer TATSÄCHLICHEN Form eingefärbt (nutzt dieselben Klickflächen-Meshes wie
// raumKlickflaechenErstellen/der Klick-Highlight, siehe alleRaumKlickflaechen), statt einer
// abstrakten Form wie beim Wohnungs-Kreis - Räume sind grösstenteils rechteckig, ihre eigene Form
// zeigt Lage/Grösse besser. "Wohn-/Esszimmer" gehört bewusst zu zwei Dimensionen gleichzeitig
// (Wohnen/Schlafen UND Essen), daher hier eine Liste pro Subtyp statt nur einer Dimension.
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

// Ein gemeinsames Material pro Dimension (nicht pro Raum) - Farbe wird bei jedem Filterwechsel
// aktualisiert, siehe raumSubtypMarkierungAktualisieren.
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

// Gemeinsame Material-Palette für ALLE gemergten Raum-Klickflächen-Meshes (siehe
// raumKlickflaechenErstellen) - welche Farbe ein einzelner Raum zeigt, steuert nicht mehr
// mesh.material (ein Mesh enthält jetzt viele Räume), sondern geometry.groups[i].materialIndex,
// als Index in dieses Array.
const RAUM_MATERIALIEN_ARRAY = [
  raumKlickflaecheMaterial, // Index 0: Standard (unsichtbar, nur Klick)
  raumHighlightMaterial, // Index 1: Klick-Auswahl (rot)
  ...Object.values(ZIMMER_SUBTYP_MATERIALIEN), // Index 2+: pro Zimmer-Dimension
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
      // Klick-Auswahl (rot) hat Vorrang, hier nicht anfassen
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
        kuechengroesse: gebaeude.kuecheFlaeche[wohnungId] || 0,
        balkongroesse: gebaeude.balkonFlaeche[wohnungId] || 0,
        reduitgroesse: gebaeude.reduitFlaeche[wohnungId] || 0,
        nasszellengroesse: gebaeude.nasszelleFlaeche[wohnungId] || 0,
        anzahlBadezimmer: gebaeude.badAnzahl[wohnungId] || 0,
        anzahlWohnungenProGeschoss: gebaeude.wohnungenProGeschoss[wohnungId] || 0,
        geschoss: gebaeude.heimGeschoss[wohnungId],
      });
    }
  }
  return wohnungen;
}







// --------------------------------------------------------------------------------

// Ziel: Einfachere schreibweise für gleichmässige Teile

// --------------------------------------------------------------------------------

// start verschiebt den Beginn der Schrittfolge nach oben (Default 0 = bei schritt beginnen), für
// Kennzahlen deren Werte erst ab einem höheren Minimum vorkommen (z.B. Anteil HNF an GF ab ca. 35%),
// damit keine Bins für einen Bereich verschwendet werden, der in den Daten nie vorkommt.
function gleichmaessigeBins(start, schritt, anzahl, einheit) {
  const bins = Array.from({ length: anzahl }, (_, i) => {
    const max = start + (i + 1) * schritt;
    return { max, label: `${max} ${einheit}` };
  });
  bins.push({ max: Infinity, label: `> ${start + anzahl * schritt} ${einheit}` });
  return bins;
}

// Sprungmasse für die SVG Grafiken | Gebäude

const GF_BINS = gleichmaessigeBins(0, 100, 14900 / 100, "m²"); // PRIO 1 | 500, 1000, ..., 10000 m², plus "> 10000 m²"
const HNF_ANTEIL_BINS = gleichmaessigeBins(30, 5, 10, "%") // PRIO 1 | 35, 40, ..., 100 %, plus "> 100 %"
const WOHNUNGEN_PRO_GEBAEUDE_BINS = gleichmaessigeBins(0, 1, 150, "Wohnungen") // PRIO 1
const WOHNUNGEN_PRO_GESCHOSS_BINS = gleichmaessigeBins(0, 1, 15, "") // PRIO 1
const GEBAEUDETIEFE_BINS = gleichmaessigeBins(0, 2, 30, "m") // PRIO 3
const GESCHOSSIGKEIT_BINS = gleichmaessigeBins(0, 1, 10, "") // PRIO 2
// FILTER Erschliessung (1 Spänner, 2 Spänner) // PRIO 2


// Sprungmasse für die SVG Grafiken | Wohnungen

// FILTER Orientierung (Einseitig, Zweiseitig, Dreiseitig, Vierseitig) | PRIO 3
// FILTER Himmelsrichtung | PRIO 3
const WOHNUNGSGROESSE_BINS = gleichmaessigeBins(0, 5, 40, "m²") // PRIO 1
const ZIMMER_BINS = gleichmaessigeBins(0, 0.5, 20, "Zimmer") // PRIO 1
const ANZAHL_BADEZIMMER_BINS = gleichmaessigeBins(0, 1, 10, "Stk") // PRIO 1
// FILTER Organisation (linear, zoniert, zentral, zirkular, peripher) // PRIO 3

// Sprungmasse für die SVG Grafiken | Zimmer
const KUECHENGROESSE_BINS = gleichmaessigeBins(0, 0.5, 40, "m²")
const ESSZIMMERGROESSE_BINS = gleichmaessigeBins(0, 1, 20, "m²")
const WOHNEN_SCHLAFEN_BINS = gleichmaessigeBins(0, 1, 30, "m²")
const BALKONGROESSE_BINS = gleichmaessigeBins(0, 0.5, 40, "m²")
const REDUITGROESSE_BINS = gleichmaessigeBins(0, 0.5, 40, "m²")
const NASSZELLENGROESSE_BINS = gleichmaessigeBins(0, 0.5, 40, "m²")
// FILTER Ankommen Zimmergrösse | PRIO 2

function binIndexVon(wert, bins) {
  return bins.findIndex((bin) => wert <= bin.max);
}

// Baut eine Dimension, deren Werte über binIndexVon() in dieselben BINS einsortiert werden.
// feldZugriff liefert entweder einen einzelnen Wert (z.B. w.gf) oder ein Array von Werten
// (z.B. w.esszimmergroessen, wenn eine Wohnung mehrere Esszimmer hat).
function binDimension(feldZugriff, bins, seriesName, extra = {}) {
  return {
    keysOf: (w) => {
      const wert = feldZugriff(w);
      return Array.isArray(wert) ? wert.map((v) => binIndexVon(v, bins)) : [binIndexVon(wert, bins)];
    },
    keys: bins.map((_, i) => i),
    labelOf: (i) => bins[i].label,
    colorOf: () => `var(--series-${seriesName})`,
    ...extra,
  };
}

function dimensionenAufbauen(wohnungen) {
  // Rohe Labels ("0100 | EG") statt Sprungmass-Bins, da Geschosse eine feste, in den Daten selbst
  // schon durchnummerierte Kategorie sind (kein Wert dazwischen möglich) - die Zahl am Anfang sorgt
  // dafür, dass alphabetisches Sortieren bereits die richtige Geschossreihenfolge ergibt.
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
    kuechengroesse: binDimension((w) => w.kuechengroesse, KUECHENGROESSE_BINS, "kuechengroesse"),
    balkongroesse: binDimension((w) => w.balkongroesse, BALKONGROESSE_BINS, "balkongroesse"),
    reduitgroesse: binDimension((w) => w.reduitgroesse, REDUITGROESSE_BINS, "reduitgroesse"),
    nasszellengroesse: binDimension((w) => w.nasszellengroesse, NASSZELLENGROESSE_BINS, "nasszellengroesse"),
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
    // .some() statt .has() auf einem einzelnen Key -> Dimensionen mit mehreren Keys pro Wohnung
    // (z.B. wohnenSchlafenGroesse: ein Key pro Zimmer) passen bereits, wenn irgendein Key gewählt ist.
    if (!DIMENSIONEN[dim].keysOf(wohnung).some((k) => auswahl.has(k))) return false;
  }
  return true;
}

// Ergänzt wohnungPasstZuFiltern() um die aktuelle Isolierung (Taste I, siehe dort) - bewusst eine
// eigene, separate Funktion statt in wohnungPasstZuFiltern() selbst eingebaut: dort würde sie auch die
// Filter-Balkendiagramme und das Neu-Packen beeinflussen, was für die Isolierung nicht gewollt ist.
// Nur für die Zusatzmarkierungen genutzt (wohnungsMarkierungAktualisieren,
// raumSubtypMarkierungAktualisieren), die sonst auch in isolierten (ausgeblendeten) Gebäuden/Geschossen
// weiterhin sichtbar blieben, da deren Meshes unabhängig von den Umfassungslinien in der Szene liegen.
function wohnungPasstZuIsolierung(wohnung) {
  if (!isolierung) return true;
  if (wohnung.gebaeudeId !== isolierung.gebaeudeId) return false;
  return isolierung.geschossLabel == null || wohnung.geschoss === isolierung.geschossLabel;
}

// Gebäude-Dimensionen (z.B. Geschossfläche, Geschossigkeit) sind pro Gebäude konstant, aber jede
// ihrer Wohnungen trägt denselben Wert - ohne Entdoppelung würde ein Gebäude mit 10 Wohnungen 10x so
// stark zählen wie eines mit 1 Wohnung. Deshalb wird hier pro Key die Menge der GEBÄUDE (statt der
// Wohnungen) gezählt.
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

// Gesamtzahl Wohngebäude (Gebäude mit mindestens einer Wohnung), für die Kopfzeile - einmalig
// gesetzt in filterPanelErstellen, da sie sich durch Filtern nicht ändert.
let WOHNGEBAEUDE_ANZAHL = 0;

function filterKopfzeileAktualisieren(gesamt, gebaeudeGefiltertAnzahl) {
  document.getElementById("stat-count").textContent = gesamt.toLocaleString("de-CH");
  document.getElementById("stat-total").textContent = WOHNUNGEN.length.toLocaleString("de-CH");
  document.getElementById("stat-gebaeude-count").textContent = gebaeudeGefiltertAnzahl.toLocaleString("de-CH");
  document.getElementById("stat-gebaeude-total").textContent = WOHNGEBAEUDE_ANZAHL.toLocaleString("de-CH");
  const irgendeinFilterAktiv = Object.values(filterAuswahl).some((s) => s.size > 0);
  document.getElementById("filter-reset").disabled = !irgendeinFilterAktiv;
  return irgendeinFilterAktiv;
}

// Neu-Packen + Kamera-Zentrierung mit dem aktuell gewählten Filter - ausgelagert, damit sie sowohl
// automatisch aus filterAendern() (falls nicht fixiert) als auch manuell per Taste R (siehe Handler
// weiter unten, funktioniert auch bei aktiver Fixierung für ein bewusstes einmaliges "Nachziehen")
// ausgelöst werden kann. Geschoss bleibt aussen vor (siehe zaehlerOhneGeschoss), der ändert nur die
// Sichtbarkeit einzelner Geschosse INNERHALB eines Gebäudes, siehe gebaeudeDimmingAktualisieren.
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

  // AUSSER positionierungFixiert ist aktiv (Taste F, siehe Handler): dann bewusst gar nichts mehr
  // anfassen, damit die Ansicht in der Feineinstellung stabil bleibt.
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
const FILTER_PAD = { top: 5, right: 6, bottom: 50, left: 6 };
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
        // Option/Alt+Klick schaltet nur diesen einen Wert zur bestehenden Auswahl dazu/weg, statt sie
        // zu ersetzen - damit lassen sich auch nicht zusammenhängende Werte gemeinsam auswählen.
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

// Für Dimensionen mit vertikaleKategorien (z.B. Geschoss): Balken wachsen horizontal nach rechts,
// Kategorien sind von unten (Key-Index 0) nach oben gestapelt statt wie sonst links nach rechts -
// wie ein Gebäudeschnitt statt eines klassischen Balkendiagramms.
function vertikalesDiagrammRendern(dim, svg, keys, labelOf, colorOf, gefiltertZaehler, gesamtZaehler, maxWert) {
  const innerW = FILTER_CHART_W - FILTER_PAD_VERTIKAL.left - FILTER_PAD_VERTIKAL.right;
  const innerH = FILTER_CHART_H - FILTER_PAD_VERTIKAL.top - FILTER_PAD_VERTIKAL.bottom;
  const gap = 1;
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
  document.getElementById("filter-reset").addEventListener("click", filterZuruecksetzen);

  filterAendern();
}
