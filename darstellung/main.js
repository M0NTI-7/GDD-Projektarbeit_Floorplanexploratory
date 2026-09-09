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

// Pro Gebäude und Zeilentyp ein eigener Material-Klon von stiftfarbeUmfassungslinie (statt ein
// einziges Material pro Typ für alle Gebäude gemeinsam) -> jedes Gebäude kann seine eigenen Linien
// unabhängig ein-/ausblenden (siehe gebaeudeDimmingAktualisieren), ohne die anderer Gebäude zu berühren.
const gebaeudeLinienMaterialien = []; // alle geklonten Materialien, für resize (siehe unten)

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
// Kein scene.background -> Canvas bleibt transparent, der weisse "Papier"-Hintergrund kommt jetzt
// von der Seite (siehe index.html), damit die Donut-Overlays dahinter sichtbar durchscheinen können.

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

// Ab welcher Zoomstufe Raum/Öffnung/Ausstattung dazukommen (Geschossfläche ist immer sichtbar) -
// als sichtbare Höhe der Szene in Metern (frustumSize / camera.zoom). Einfach anpassen, falls sich
// 50m beim Testen als zu früh/spät herausstellt.
const DETAIL_SCHWELLE_METER = 400;
let detailSichtbar = false;

// Nur dieses Geschoss wird als Geschossfläche gezeigt, solange kein eigener Geschoss-Filter aktiv
// ist (siehe linienSichtbarkeitAnwenden) - Gebäude ohne dieses Geschoss (z.B. eingeschossige Bauten)
// zeigen dadurch anfangs bewusst nichts, bis reingezoomt oder ein anderes Geschoss gefiltert wird.
const STARTGESCHOSS_LABEL = "0101 | 01 OG";

const aspect = zeichenBreite() / zeichenHoehe();
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

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // alpha: Canvas-Hintergrund transparent statt opak
renderer.setClearColor(0x000000, 0); // alpha:true allein reicht nicht, sonst clear'd Three.js weiterhin opak (Standard: Schwarz, Alpha 1)
renderer.setSize(zeichenBreite(), zeichenHoehe());
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

// Verhalten: Passt die Zeichnung der Fenstergrösse an - sowohl bei echten Fenster-Resizes als auch
// (via ResizeObserver weiter unten) wenn sich die Höhe der Filterleiste selbst ändert (Ein-/Ausklappen,
// Tab-Wechsel mit unterschiedlich hohem Chart).

function layoutAktualisieren() {
  const aspect = zeichenBreite() / zeichenHoehe();
  kameraFrustumAktualisieren(aspect);

  renderer.setSize(zeichenBreite(), zeichenHoehe());
  for (const material of Object.values(stiftfarbeUmfassungslinie)) {
    renderer.getSize(material.resolution);
  }
  for (const material of gebaeudeLinienMaterialien) {
    renderer.getSize(material.resolution);
  }
}

window.addEventListener("resize", layoutAktualisieren);

// Verhalten: Der "Filter ausblenden/anzeigen"-Button klappt die Slot-Inhalte der Filterleiste ein/aus
// (siehe .filter-leiste.eingeklappt in index.html), Kopf-Slot und Tab-Titelzeilen bleiben sichtbar. Da
// sich die Höhe der Leiste dadurch (und je nach aktivem Tab) ändert, hält ein ResizeObserver
// obererRandPx synchron statt ihn nur einmal aus der CSS-Variable zu lesen (siehe obererRandPx oben).

const filterLeisteElement = document.getElementById("filter-leiste");
const filterToggleButton = document.getElementById("filter-toggle");

filterToggleButton.addEventListener("click", () => {
  const eingeklappt = filterLeisteElement.classList.toggle("eingeklappt");
  filterToggleButton.textContent = eingeklappt ? "▾" : "▴";
  filterToggleButton.setAttribute("aria-label", eingeklappt ? "Filter anzeigen" : "Filter ausblenden");
  filterToggleButton.setAttribute("aria-expanded", String(!eingeklappt));
});

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
// Jeder Tab liest sein Label direkt aus dem h3 der zugehörigen (unveränderten) .chart-card, damit der
// Titel nicht doppelt gepflegt werden muss.

// --------------------------------------------------------------------------------

const FILTER_GRUPPEN = {
  gebaeude: ["gf", "hnfAnteil", "wohnungen", "anzahlWohnungenProGeschoss", "gebaeudetiefe", "geschossigkeit"],
  wohnungen: ["zimmer", "wohnungsgroesse", "anzahlBadezimmer"],
  zimmer: ["kuechengroesse", "esszimmergroesse", "wohnenSchlafenGroesse", "balkongroesse", "reduitgroesse", "nasszellengroesse"],
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
      const punkt = document.createElement("span");
      punkt.className = "filter-tab-dot";
      tab.append(label, punkt);

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

// Aufgerufen aus filterAendern() (siehe Crossfilter-Abschnitt) - zeigt per Punkt auf einem Tab an, wenn
// dessen Kennzahl gerade gefiltert ist, auch während ein anderer Tab derselben Gruppe sichtbar ist.
function filterTabIndikatorenAktualisieren() {
  for (const dim in filterAuswahl) {
    const hatAuswahl = filterAuswahl[dim].size > 0;
    if (dim === "geschoss") {
      document.querySelector(".filter-slot--geschoss summary").classList.toggle("hat-auswahl", hatAuswahl);
      continue;
    }
    const tab = document.querySelector(`.filter-tab[data-dim="${dim}"]`);
    if (tab) tab.classList.toggle("hat-auswahl", hatAuswahl);
  }
}

// Verhalten: Hier wird pro Gebäude eine HTML-Overlay-Gruppe (Donut + Zimmer-Legende) auf die
// projizierte Bildschirmposition der Gebäudemitte gesetzt und mit dem Kamera-Zoom skaliert. Als
// CSS-Elemente statt Three.js-Meshes sind Donut, Zimmer-Text und -Kreise dadurch garantiert
// konsistent zueinander positioniert (feste Pixel-Abstände zueinander), schrumpfen aber gemeinsam
// mit den Gebäuden beim Rauszoomen statt bei jeder Zoomstufe gleich gross zu bleiben.

const donutDurchmesserPx = 60; // einheitliche Bildschirmgrösse für alle Donuts

const gebaeudeOverlays = []; // { position: THREE.Vector3, element: HTMLElement }

function gebaeudeOverlayErstellen(mitteX, mitteZ, flaechePro416Kategorie, zimmerProWohnung) {
  const element = document.createElement("div");
  element.className = "gebaeude-overlay";

  // const donut = donutErstellen(flaechePro416Kategorie);
  // if (donut) element.appendChild(donut);

  // const legende = zimmerLegendeErstellen(zimmerProWohnung);
  // if (legende) element.appendChild(legende);

  document.body.appendChild(element);
  const position = new THREE.Vector3(mitteX, 0, mitteZ);
  gebaeudeOverlays.push({ position, element });
  return { element, position };
}

function gebaeudeOverlaysAktualisieren() {
  // camera.zoom ist 1 im Moment der Kamera-Zentrierung (siehe kameraAufGebaeudeZentrieren) und
  // ändert sich beim Scrollen über OrbitControls. Als Skalierungsfaktor sorgt das dafür, dass die
  // Overlays beim Rauszoomen mit den Gebäuden mitschrumpfen statt starr 60px zu bleiben und sich
  // beim Reinzoomen entsprechend vergrössern. Nach unten begrenzt, damit sie nie unsichtbar werden.
  const massstab = Math.max(0.15, camera.zoom);

  for (const { position, element } of gebaeudeOverlays) {
    const projiziert = position.clone().project(camera);
    // obererRandPx dazuzählen: die NDC-Koordinaten (-1 bis 1) beziehen sich auf die Zeichenfläche,
    // die Overlays sind aber fixed im ganzen Fenster positioniert (siehe .gebaeude-overlay in index.html).
    element.style.left = `${((projiziert.x + 1) / 2) * zeichenBreite()}px`;
    element.style.top = `${obererRandPx + ((1 - projiziert.y) / 2) * zeichenHoehe()}px`;
    element.style.transform = `scale(${massstab})`;
  }
}

// Verhalten: Reagiert auf die aktuelle Zoomstufe (sichtbare Höhe der Szene in Metern) und blendet
// Raum/Öffnung/Ausstattung erst ab DETAIL_SCHWELLE_METER ein - siehe linienSichtbarkeitAnwenden.
// Rechnet nur bei einer tatsächlichen Änderung neu (nicht bei jedem Frame), analog zu
// letztePackSignatur beim Neu-Packen.
function detailSichtbarkeitAktualisieren(erzwingen = false) {
  const sichtbareHoeheMeter = frustumSize / camera.zoom;
  const neuDetailSichtbar = sichtbareHoeheMeter <= DETAIL_SCHWELLE_METER;
  if (!erzwingen && neuDetailSichtbar === detailSichtbar) return;

  detailSichtbar = neuDetailSichtbar;
  for (const gebaeude of gebaeudeNachId.values()) {
    for (const gruppe of gebaeude.linienMaterialien) {
      linienSichtbarkeitAnwenden(gruppe);
    }
  }
}

renderer.setAnimationLoop(() => {
  controls.update();
  detailSichtbarkeitAktualisieren();
  gebaeudeOverlaysAktualisieren();
  renderer.render(scene, camera);
});

// --------------------------------------------------------------------------------

// Ziel: CSV-Datei ist geladen und die Daten sind in einem Array gespeichert

// --------------------------------------------------------------------------------

//const csvPfad = "../data-prep/geometries_erste100.csv"; // für zum Testen
const csvPfad = "../data-prep/geometries_final_angereichert.csv";

// dynamicTyping:true würde Papaparse dazu bringen, bei JEDER Zelle eine Zahlen-Erkennung
// laufen zu lassen - auch auf der sehr langen "koordinaten"-Spalte (WKT-Polygon-Strings).
// Stattdessen werden hier gezielt nur die beiden tatsächlich numerisch gebrauchten Spalten
// umgewandelt.
const NUMERISCHE_SPALTEN = new Set(["flaeche", "zimmer_zaehler"]);

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

function segmenteHinzufuegen(zielArray, kontur) {
  for (let i = 0; i < kontur.length - 1; i++) {
    const [x0, y0] = kontur[i];
    const [x1, y1] = kontur[i + 1];
    zielArray.push(x0, 0, y0, x1, 0, y1); // die beiden 0 sind die Höhe
  }
}

// Ein Material für alle Schwarzplan-Füllungen (siehe schwarzplanFuellungErstellen) - keine Beleuchtung
// in der Szene, deshalb MeshBasicMaterial statt eines lichtabhängigen Materials. side:DoubleSide,
// da die Umlaufrichtung der WKT-Konturen nicht garantiert ist - je nachdem würde sonst durch die
// 90°-Drehung (siehe unten) die von der Kamera abgewandte Seite gerendert und die Füllung wäre
// unsichtbar statt schwarz.
const schwarzplanMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });

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
      mesh.position.y = -0.05; // knapp unter den Linien, damit diese immer sichtbar obenauf bleiben
      meshes.push(mesh);
    }
  }

  if (meshes.length === 0) return null;
  if (meshes.length === 1) return meshes[0];

  const gruppe = new THREE.Group();
  gruppe.add(...meshes);
  return gruppe;
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
    const ringAussenRadius = radius * 1.35; // 15% Abstand zum Gebäude + 20% Ringdicke, für Kamera-Zentrierung und Zimmer-Legende

    const flaechePro416Kategorie = {};
    const zimmerProWohnung = {};
    const geschossIds = new Set();
    let gf = 0;

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
        segmenteHinzufuegen(gruppe.positionen, kontur);
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

      gebaeude.linienMaterialien.push({
        material,
        linien,
        fuellung,
        geschossLabel: gruppe.geschossLabel,
        entitaetTyp: gruppe.entitaetTyp,
        gefiltertSichtbar: true, // von gebaeudeDimmingAktualisieren aktuell gehalten, initial nichts gefiltert
        // Nur die initial sichtbare Geschossfläche (STARTGESCHOSS_LABEL) startet unenthüllt und wird von
        // enthuellungStarten() zufällig gestaffelt eingeblendet ("Ameisenhaufen"-Reveal, Akt 2); alles
        // andere (andere Geschosse, Raum/Öffnung/Ausstattung) folgt unverändert Filter/Zoom.
        enthuellt: !(gruppe.entitaetTyp === "Geschossfläche" && gruppe.geschossLabel === STARTGESCHOSS_LABEL),
      });
    }
  }

  annotationenErstellen(gebaeudeListe);
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

  gebaeude.overlayPosition.x += dx;
  gebaeude.overlayPosition.z += dz;
}

// --------------------------------------------------------------------------------

// Ziel: SIA416-Donut und Zimmer-Legende sind pro Gebäude erstellt

// --------------------------------------------------------------------------------

function annotationenErstellen(gebaeudeListe) {
  for (const gebaeude of gebaeudeListe) {
    const overlay = gebaeudeOverlayErstellen(
      gebaeude.mitteX,
      gebaeude.mitteZ,
      gebaeude.flaechePro416Kategorie,
      gebaeude.zimmerProWohnung
    );
    gebaeude.overlayElement = overlay.element;
    gebaeude.overlayPosition = overlay.position; // für gebaeudePositionSetzen (Neu-Packen beim Filtern)
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

  const aktuellesAspect = zeichenBreite() / zeichenHoehe();
  // Kein künstlicher Rand mehr (kein randFaktor) - die Zeichnung soll links/unten/rechts direkt an die
  // Kante gehen. Math.max wählt trotzdem die Achse mit dem grösseren Platzbedarf, sonst würde die
  // andere Achse abgeschnitten - stimmt das Seitenverhältnis von Anordnung und Zeichenfläche nicht
  // exakt überein, bleibt auf GENAU EINEM Achsenpaar (oben+unten ODER links+rechts) unvermeidbar ein
  // kleiner Rand übrig, das ist reine Geometrie (Seitenverhältnis passt selten exakt), kein Setting.
  frustumSize = Math.max(maxZ - minZ, (maxX - minX) / aktuellesAspect);
  camera.zoom = 1; // sauberer "zoom to fit" statt mit dem zuletzt vom Nutzer gewählten Zoom zu skalieren
  kameraFrustumAktualisieren(aktuellesAspect);
  camera.position.set(zentrumX, 100, zentrumZ);
  camera.lookAt(zentrumX, 0, zentrumZ);

  controls.target.set(zentrumX, 0, zentrumZ);
  controls.update();
}

// --------------------------------------------------------------------------------

// Ziel: SIA416 Flächen sind als Donut um jedes Gebäude dargestellt

// --------------------------------------------------------------------------------

function donutErstellen(flaechePro416Kategorie) {
  const Bruttogeschossflaeche = Object.values(flaechePro416Kategorie).reduce((summe, f) => summe + f, 0);
  if (Bruttogeschossflaeche === 0) return null; // keine kategorisierten Räume -> kein Donut

  let winkel = 0; // Startwinkel des nächsten Segments in Grad, läuft von 0 bis 360 (CSS conic-gradient)
  const segmente = [];
  for (const [sia416_definition, flaeche] of Object.entries(flaechePro416Kategorie)) {
    const prozentAnteil = flaeche / Bruttogeschossflaeche;
    const segmentWinkel = prozentAnteil * 360;

    const donutFill = flaechenfarbenSia416farben[sia416_definition] || "#999999"; // Fallback, falls Kategorie keine Farbe hat
    segmente.push(`${donutFill} ${winkel}deg ${winkel + segmentWinkel}deg`);

    winkel += segmentWinkel;
  }

  const donut = document.createElement("div");
  donut.className = "donut-overlay";
  donut.style.width = `${donutDurchmesserPx}px`;
  donut.style.height = `${donutDurchmesserPx}px`;
  donut.style.background = `conic-gradient(${segmente.join(", ")})`;
  donut.appendChild(document.createElement("div")).className = "donut-loch";
  return donut;
}

// --------------------------------------------------------------------------------

// Ziel: Zimmerzahl sind dargestellt

// --------------------------------------------------------------------------------

function kreisElementErstellen(halb = false) {
  const kreis = document.createElement("span");
  kreis.className = halb ? "zimmer-kreis zimmer-kreis-halb" : "zimmer-kreis";
  return kreis;
}

function zimmerLegendeErstellen(zimmerProWohnung) {
  const wohnungenProZimmerzahl = {};
  for (const zimmerzahl of Object.values(zimmerProWohnung)) {
    wohnungenProZimmerzahl[zimmerzahl] = (wohnungenProZimmerzahl[zimmerzahl] || 0) + 1;
  }

  const zimmerzahlen = Object.keys(wohnungenProZimmerzahl).map(Number).sort((a, b) => a - b); // Aufsteigend sortiert
  if (zimmerzahlen.length === 0) return null;

  const legende = document.createElement("div");
  legende.className = "zimmer-legende";

  for (const zimmerzahl of zimmerzahlen) {
    const volleKreise = Math.floor(zimmerzahl);
    const halberKreis = zimmerzahl - volleKreise >= 0.5;
    const anzahlWohnungen = wohnungenProZimmerzahl[zimmerzahl];

    const reihe = document.createElement("div");
    reihe.className = "zimmer-reihe";

    const text = document.createElement("span");
    text.textContent = `${anzahlWohnungen} Stk.`;
    reihe.appendChild(text);

    for (let i = 0; i < volleKreise; i++) {
      reihe.appendChild(kreisElementErstellen());
    }
    if (halberKreis) {
      reihe.appendChild(kreisElementErstellen(true));
    }

    legende.appendChild(reihe);
  }

  return legende;
}

// --------------------------------------------------------------------------------

// Ziel: Bei Linksklick auf ein Element erscheint eine Infobox mit seinen Daten

// --------------------------------------------------------------------------------

const klickbareObjekte = [];

const raycaster = new THREE.Raycaster(); // greift die nächste Linie resp. Fläche die sich bei der Maus befindet
raycaster.params.Line2 = { threshold: 8 }; // die Zahl ist die Tolleranz wie genau ich die Linie treffen muss

const infobox = document.getElementById("infobox");

renderer.domElement.addEventListener("click", (e) => {
  // Koordinaten relativ zur tatsächlichen Canvas-Position/-Grösse statt zum ganzen Fenster, da die
  // Zeichnung seit dem linken Rand (siehe zeichenBreite) nicht mehr bei Fenster-x=0 beginnt.
  const rect = renderer.domElement.getBoundingClientRect();
  const maus = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
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
    Gebäude-ID: ${zeile.gebaeude_id ?? "–"}<br>
    Geschoss: ${zeile.geschoss_label ?? "–"}<br>
    Fläche: ${(zeile.entitaet_typ === "Raum" || zeile.entitaet_typ === "Geschossfläche") ? zeile.flaeche + " m2" : ""}<br>
  `;
  infobox.style.left = `${e.clientX + 12}px`;
  infobox.style.top = `${e.clientY + 12}px`;
  infobox.style.display = "block";
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
    return;
  }

  // Geschossfläche: ohne aktiven Geschoss-Filter nur STARTGESCHOSS_LABEL zeigen (andere Geschosse
  // bleiben leer, bis reingezoomt wird). Ist ein Geschoss-Filter aktiv, übernimmt stattdessen
  // gefiltertSichtbar (siehe gebaeudeDimmingAktualisieren) die Auswahl - der Nutzer sieht dann genau
  // die gefilterten Geschosse, nicht zwingend das Startgeschoss.
  const geschossFilterAktiv = filterAuswahl.geschoss.size > 0;
  const geschossBasisSichtbar = geschossFilterAktiv || gruppe.geschossLabel === STARTGESCHOSS_LABEL;
  // gruppe.enthuellt gated den Akt-2-Reveal (siehe enthuellungStarten): bis ein Gebäude "an der Reihe"
  // ist, bleibt es unsichtbar, auch wenn Filter/Zoom es sonst zeigen würden.
  gruppe.linien.visible = gruppe.gefiltertSichtbar && gruppe.enthuellt && (geschossBasisSichtbar || detailSichtbar);

  // Schwarzplan-Füllung: wie die Geschossfläche-Linie selbst, aber nur solange NICHT reingezoomt ist -
  // sobald die Detailschwelle erreicht ist, verschwindet die Füllung wieder.
  if (gruppe.fuellung) {
    gruppe.fuellung.visible = gruppe.gefiltertSichtbar && gruppe.enthuellt && geschossBasisSichtbar && !detailSichtbar;
  }
}

function gebaeudeDimmingAktualisieren(matchAnzahlProGebaeude, ausgewaehlteGeschosse) {
  const geschossFilterAktiv = ausgewaehlteGeschosse.size > 0;

  for (const [gebaeude_id, gebaeude] of gebaeudeNachId) {
    // kein Wohngebäude -> nie wegen Wohnungs-Filtern ausblenden, Geschoss-Filter gilt aber trotzdem
    const dimmenGebaeude = gebaeude.wohnungenAnzahl === 0 ? false : !(matchAnzahlProGebaeude.get(gebaeude_id) > 0);

    for (const gruppe of gebaeude.linienMaterialien) {
      const dimmenGeschoss = geschossFilterAktiv && !ausgewaehlteGeschosse.has(gruppe.geschossLabel);
      const dimmen = dimmenGebaeude || dimmenGeschoss;
      gruppe.material.opacity = dimmen ? 0 : 1;
      gruppe.gefiltertSichtbar = !dimmen;
      linienSichtbarkeitAnwenden(gruppe);
    }

    if (gebaeude.wohnungenAnzahl > 0) {
      gebaeude.overlayElement.style.display = dimmenGebaeude ? "none" : "";
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

let WOHNUNGEN = [];
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
      // Geschosse haben eine natürliche unten-nach-oben-Reihenfolge wie ein Gebäudeschnitt -> Balken
      // laufen horizontal, Kategorien von unten (erster Key) nach oben gestapelt statt links-rechts.
      vertikaleKategorien: true,
    },
    wohnungen: {
      keysOf: (w) => [binIndexVon(w.wohnungenProGebaeude, WOHNUNGEN_PRO_GEBAEUDE_BINS)],
      keys: WOHNUNGEN_PRO_GEBAEUDE_BINS.map((_, i) => i),
      labelOf: (i) => WOHNUNGEN_PRO_GEBAEUDE_BINS[i].label,
      colorOf: () => "var(--series-wohnungen)",
      zaehlEinheit: "gebaeude",
    },
    zimmer: {
      keysOf: (w) => [binIndexVon(w.zimmer, ZIMMER_BINS)],
      keys: ZIMMER_BINS.map((_, i) => i),
      labelOf: (i) => ZIMMER_BINS[i].label,
      colorOf: () => "var(--series-zimmer)",
    },
    gf: {
      keysOf: (w) => [binIndexVon(w.gf, GF_BINS)],
      keys: GF_BINS.map((_, i) => i),
      labelOf: (i) => GF_BINS[i].label,
      colorOf: () => "var(--series-gf)",
      zaehlEinheit: "gebaeude",
    },
    hnfAnteil: {
      keysOf: (w) => [binIndexVon(w.hnfAnteil, HNF_ANTEIL_BINS)],
      keys: HNF_ANTEIL_BINS.map((_, i) => i),
      labelOf: (i) => HNF_ANTEIL_BINS[i].label,
      colorOf: () => "var(--series-hnf-anteil)",
      zaehlEinheit: "gebaeude",
    },
    gebaeudetiefe: {
      keysOf: (w) => [binIndexVon(w.gebaeudetiefe, GEBAEUDETIEFE_BINS)],
      keys: GEBAEUDETIEFE_BINS.map((_, i) => i),
      labelOf: (i) => GEBAEUDETIEFE_BINS[i].label,
      colorOf: () => "var(--series-gebaeudetiefe)",
      zaehlEinheit: "gebaeude",
    },
    geschossigkeit: {
      keysOf: (w) => [binIndexVon(w.geschossigkeit, GESCHOSSIGKEIT_BINS)],
      keys: GESCHOSSIGKEIT_BINS.map((_, i) => i),
      labelOf: (i) => GESCHOSSIGKEIT_BINS[i].label,
      colorOf: () => "var(--series-geschossigkeit)",
      zaehlEinheit: "gebaeude",
    },
    wohnungsgroesse: {
      keysOf: (w) => [binIndexVon(w.wohnungsgroesse, WOHNUNGSGROESSE_BINS)],
      keys: WOHNUNGSGROESSE_BINS.map((_, i) => i),
      labelOf: (i) => WOHNUNGSGROESSE_BINS[i].label,
      colorOf: () => "var(--series-wohnungsgroesse)",
    },
    wohnenSchlafenGroesse: {
      keysOf: (w) => w.wohnenSchlafenGroessen.map((flaeche) => binIndexVon(flaeche, WOHNEN_SCHLAFEN_BINS)),
      keys: WOHNEN_SCHLAFEN_BINS.map((_, i) => i),
      labelOf: (i) => WOHNEN_SCHLAFEN_BINS[i].label,
      colorOf: () => "var(--series-wohnen-schlafen-groesse)",
    },
    esszimmergroesse: {
      keysOf: (w) => w.esszimmergroessen.map((flaeche) => binIndexVon(flaeche, ESSZIMMERGROESSE_BINS)),
      keys: ESSZIMMERGROESSE_BINS.map((_, i) => i),
      labelOf: (i) => ESSZIMMERGROESSE_BINS[i].label,
      colorOf: () => "var(--series-esszimmergroesse)",
    },
    kuechengroesse: {
      keysOf: (w) => [binIndexVon(w.kuechengroesse, KUECHENGROESSE_BINS)],
      keys: KUECHENGROESSE_BINS.map((_, i) => i),
      labelOf: (i) => KUECHENGROESSE_BINS[i].label,
      colorOf: () => "var(--series-kuechengroesse)",
    },
    balkongroesse: {
      keysOf: (w) => [binIndexVon(w.balkongroesse, BALKONGROESSE_BINS)],
      keys: BALKONGROESSE_BINS.map((_, i) => i),
      labelOf: (i) => BALKONGROESSE_BINS[i].label,
      colorOf: () => "var(--series-balkongroesse)",
    },
    reduitgroesse: {
      keysOf: (w) => [binIndexVon(w.reduitgroesse, REDUITGROESSE_BINS)],
      keys: REDUITGROESSE_BINS.map((_, i) => i),
      labelOf: (i) => REDUITGROESSE_BINS[i].label,
      colorOf: () => "var(--series-reduitgroesse)",
    },
    nasszellengroesse: {
      keysOf: (w) => [binIndexVon(w.nasszellengroesse, NASSZELLENGROESSE_BINS)],
      keys: NASSZELLENGROESSE_BINS.map((_, i) => i),
      labelOf: (i) => NASSZELLENGROESSE_BINS[i].label,
      colorOf: () => "var(--series-nasszellengroesse)",
    },
    anzahlBadezimmer: {
      keysOf: (w) => [binIndexVon(w.anzahlBadezimmer, ANZAHL_BADEZIMMER_BINS)],
      keys: ANZAHL_BADEZIMMER_BINS.map((_, i) => i),
      labelOf: (i) => ANZAHL_BADEZIMMER_BINS[i].label,
      colorOf: () => "var(--series-anzahl-badezimmer)",
    },
    anzahlWohnungenProGeschoss: {
      keysOf: (w) => [binIndexVon(w.anzahlWohnungenProGeschoss, WOHNUNGEN_PRO_GESCHOSS_BINS)],
      keys: WOHNUNGEN_PRO_GESCHOSS_BINS.map((_, i) => i),
      labelOf: (i) => WOHNUNGEN_PRO_GESCHOSS_BINS[i].label,
      colorOf: () => "var(--series-anzahl-wohnungen-pro-geschoss)",
      zaehlEinheit: "gebaeude",
    },
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

function matchAnzahlProGebaeudeBerechnen() {
  const zaehlerProGebaeude = new Map();
  let gesamt = 0;
  for (const wohnung of WOHNUNGEN) {
    if (!wohnungPasstZuFiltern(wohnung, null)) continue;
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

function filterAendern() {
  for (const dim in DIMENSIONEN) diagrammRendern(dim);
  filterTabIndikatorenAktualisieren();

  const { zaehlerProGebaeude, gesamt } = matchAnzahlProGebaeudeBerechnen();
  const filterAktiv = filterKopfzeileAktualisieren(gesamt, zaehlerProGebaeude.size);

  gebaeudeDimmingAktualisieren(zaehlerProGebaeude, filterAuswahl.geschoss);
  gebaeudePositionenAktualisieren(zaehlerProGebaeude, filterAktiv);
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

  svg.addEventListener("pointerup", () => {
    if (state.dragging && !state.moved) {
      const key = keys[state.startIndex];
      const nurDieseAusgewaehlt = filterAuswahl[dim].size === 1 && filterAuswahl[dim].has(key);
      filterAuswahl[dim] = nurDieseAusgewaehlt ? new Set() : new Set([key]);
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
        stroke: istAusgewaehlt ? farbe : "var(--border)",
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

    const text = filterSvgEl("text", {
      x: FILTER_PAD_VERTIKAL.left - 6,
      y: y + barH / 2,
      "text-anchor": "end",
      "dominant-baseline": "middle",
      class: "bar-label",
    });
    text.textContent = labelOf(key);
    svg.appendChild(text);
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
        stroke: istAusgewaehlt ? farbe : "var(--border)",
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

    const text = filterSvgEl("text", {
      x: x + barW / 2,
      y: FILTER_CHART_H - FILTER_PAD.bottom + 14,
      "text-anchor": keys.length > 6 ? "end" : "middle",
      class: "bar-label",
      ...(keys.length > 6 && {
        transform: `rotate(-45 ${x + barW / 2} ${FILTER_CHART_H - FILTER_PAD.bottom + 10})`,
      }),
    });
    text.textContent = labelOf(key);
    svg.appendChild(text);
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