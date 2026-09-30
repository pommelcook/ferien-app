// ===========================================================
// KONFIGURATION der Ferien-App
// ===========================================================
// Diese Werte stammen aus der Azure-App-Registrierung "Ferien-App".
// Sie sind nicht geheim (keine Passwörter), müssen aber zum
// registrierten Eintrag passen. Siehe "Ferien-App - Setup-Notizen.txt".

const APP_CONFIG = {
  // Anwendungs-ID (Client-ID) der Azure-App-Registrierung "Ferien-App"
  clientId: "2224b5de-d363-4a47-a182-20cf49096afb",

  // Verzeichnis-ID (Tenant-ID) - eigenes privates "Default Directory"
  tenantId: "8e03eea8-3c9f-40b4-a31c-f94594fdb60a",

  // Pfad (ab OneDrive-Wurzel) zu dem Ordner, in dem die App ihre
  // Datendatei ablegt - bewusst der Ordner, den du selbst im
  // OneDrive-Explorer siehst und findest, kein verstecktes App-Verzeichnis.
  oneDriveFolderPath:
    "10  Privat/Ferien + Ausflüge/Ferien - Lager - Weekends/0 Allgemeine Unterlagen/Ferien-App",

  // Berechtigungen (Scopes), die die App beim Login anfragt
  scopes: ["User.Read", "Files.ReadWrite"],
};

// ===========================================================
// VERSION (wird im Tab "Mehr" angezeigt)
// ===========================================================
const APP_VERSION = "0.4.0";
const APP_BUILD_DATE = "2026-09-30";

// ===========================================================
// MERKMALE (wie im Excel-Master, hier als überschaubare Auswahl)
// ===========================================================
// Jede Ferien hat ein "merkmale"-Objekt mit diesen Schlüsseln (true/false).
// Ein Artikel/To-Do kann optional "nurWenn: [Schlüssel, ...]" tragen -
// dann wird er nur angezeigt, wenn MINDESTENS eines der dort genannten
// Merkmale für die aktuelle Ferien aktiv ist (wie die dynamische
// Packliste im Excel-Master). Kein "nurWenn" -> immer sichtbar.
const MERKMALE_DEFS = [
  { key: "ausland", label: "Ausland", icon: "ti-world" },
  { key: "auto", label: "Auto", icon: "ti-car" },
  { key: "flug", label: "Flug", icon: "ti-plane" },
  { key: "sommer", label: "Sommer", icon: "ti-sun" },
  { key: "winter", label: "Winter", icon: "ti-snowflake" },
  { key: "wasser", label: "Baden/Wasser", icon: "ti-swimming" },
  { key: "wandern", label: "Wandern", icon: "ti-mountain" },
  { key: "baby", label: "Baby/Kleinkind", icon: "ti-baby-carriage" },
  { key: "kinder", label: "Mit Kindern", icon: "ti-users" },
  { key: "zelten", label: "Zelten", icon: "ti-tent" },
  { key: "haustier", label: "Haustier", icon: "ti-paw" },
];

// ===========================================================
// KATEGORIE-PIKTOGRAMME
// ===========================================================
// Ordnet Kategorienamen (Teilwort-Suche, Gross-/Kleinschreibung egal)
// automatisch ein passendes Icon zu, damit Listen auf einen Blick
// erfassbar sind. Erste Übereinstimmung gewinnt, sonst Fallback "ti-list".
const CATEGORY_ICON_RULES = [
  { match: ["dokument", "pass", "ausweis"], icon: "ti-file-text" },
  { match: ["kleid", "hose", "jacke", "pulli"], icon: "ti-shirt" },
  { match: ["schuh"], icon: "ti-shoe" },
  { match: ["hygien", "kosmetik", "dusche"], icon: "ti-droplet" },
  { match: ["mediz", "apotheke", "gesundheit", "erste hilfe"], icon: "ti-first-aid-kit" },
  { match: ["elektro", "technik", "kabel", "ladegerät", "akku"], icon: "ti-plug" },
  { match: ["spielzeug", "spiel"], icon: "ti-puzzle" },
  { match: ["küche", "essen", "verpflegung", "proviant"], icon: "ti-tools-kitchen-2" },
  { match: ["sport"], icon: "ti-ball-football" },
  { match: ["baby", "kleinkind", "windel"], icon: "ti-baby-carriage" },
  { match: ["ski", "wintersport", "schnee"], icon: "ti-snowflake" },
  { match: ["bad", "schwimm", "wasser"], icon: "ti-swimming" },
  { match: ["geld", "finanz", "bargeld", "karte"], icon: "ti-cash" },
  { match: ["auto", "fahrzeug"], icon: "ti-car" },
  { match: ["camping", "zelt"], icon: "ti-tent" },
  { match: ["haustier", "hund", "katze"], icon: "ti-paw" },
  { match: ["reinigung", "putz"], icon: "ti-spray" },
];

function categoryIcon(name) {
  const n = (name || "").toLowerCase();
  const rule = CATEGORY_ICON_RULES.find((r) => r.match.some((m) => n.includes(m)));
  return rule ? rule.icon : "ti-list";
}

// MSAL-Konfigurationsobjekt (wird von auth.js verwendet)
const MSAL_CONFIG = {
  auth: {
    clientId: APP_CONFIG.clientId,
    authority: `https://login.microsoftonline.com/${APP_CONFIG.tenantId}`,
    // Muss EXAKT der Adresse entsprechen, die in Azure als
    // "Umleitungs-URI" hinterlegt ist. Solange die App noch nicht
    // gehostet ist, funktioniert der Login-Redirect noch nicht -
    // das wird nachgezogen, sobald eine echte Webadresse existiert.
    redirectUri: window.location.origin + window.location.pathname,
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  },
};
