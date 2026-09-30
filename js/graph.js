// ===========================================================
// ONEDRIVE-ANBINDUNG (Microsoft Graph API)
// ===========================================================
// Speichert alle Ferien-Daten in EINER JSON-Datei in OneDrive,
// direkt im vorhandenen Ordner "...\0 Allgemeine Unterlagen\Ferien-App"
// (sichtbar im normalen OneDrive-Explorer, kein verstecktes
// App-Verzeichnis). Der Pfad wird Segment für Segment kodiert,
// damit Leer- und Sonderzeichen (z. B. in "Ferien + Ausflüge")
// von der Graph-API korrekt verstanden werden.

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function buildDataPath() {
  const segments = APP_CONFIG.oneDriveFolderPath.split("/").map(encodeURIComponent);
  segments.push("daten.json");
  return segments.join("/");
}

const DATA_PATH = buildDataPath();

async function graphFetch(path, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  return res;
}

/** Leere Grundstruktur, falls noch keine Daten existieren. */
function emptyData() {
  return {
    version: 1,
    ferien: [], // Liste einzelner Ferien-Objekte, siehe unten
  };
}

/*
Struktur eines einzelnen "Ferien"-Eintrags (Beispiel):
{
  id: "2026-sommer-going",
  titel: "Sommerferien Going 2026",
  von: "2026-07-10",
  bis: "2026-07-24",
  merkmale: { ausland: true, auto: true, wintersport: false, ... },
  packliste: [
    { id: "p1", text: "Reisepass", erledigt: false, kategorie: "Dokumente" },
    ...
  ],
  todo: [
    { id: "t1", text: "CH-Kleber anbringen", erledigt: false, kategorie: "Allgemein" },
    ...
  ],
  unterkuenfte: [
    { id: "u1", name: "Chalet Alpenblick", adresse: "Musterweg 1, Going",
      von: "2026-07-10", bis: "2026-07-17", buchungsnummer: "AB1234",
      kontakt: "+43 555 123456", link: "https://...", notizen: "Schlüssel im Schlüsselkasten" },
    ...
  ]
}
Hinweis: packliste/todo-Einträge können zusätzlich "nurWenn": [merkmalSchlüssel, ...]
tragen (siehe config.js MERKMALE_DEFS) - dann werden sie nur angezeigt, wenn
mindestens eines der genannten Merkmale für die Ferien aktiv ist.
*/

/** Daten aus OneDrive laden. Legt die Datei beim ersten Mal an. */
async function loadData() {
  let res = await graphFetch(`/me/drive/root:/${DATA_PATH}:/content`);

  if (res.status === 404) {
    // Datei (und ggf. Ordner) existiert noch nicht -> anlegen
    const initial = emptyData();
    await saveData(initial);
    return initial;
  }

  if (!res.ok) {
    throw new Error(`Graph-Fehler beim Laden: ${await graphErrorDetail(res)}`);
  }

  return await res.json();
}

/** Daten als JSON in OneDrive speichern (überschreibt die Datei). */
async function saveData(data) {
  const res = await graphFetch(`/me/drive/root:/${DATA_PATH}:/content`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data, null, 2),
  });
  if (!res.ok) {
    throw new Error(`Graph-Fehler beim Speichern: ${await graphErrorDetail(res)}`);
  }
  return await res.json();
}

/** Baut aus einer fehlgeschlagenen Graph-Antwort eine möglichst aussagekräftige
 *  Fehlermeldung (HTTP-Status + Graph-Fehlercode/-text + verwendeter Pfad),
 *  damit sich Probleme (z. B. falscher Ordnerpfad) ohne Entwickler-Tools
 *  diagnostizieren lassen. */
async function graphErrorDetail(res) {
  let detail = "";
  try {
    const body = await res.json();
    if (body && body.error) {
      detail = ` - ${body.error.code}: ${body.error.message}`;
    }
  } catch (e) {
    // Antwort war kein JSON - ignorieren, Status reicht dann als Info.
  }
  return `${res.status}${detail} | Pfad: /${DATA_PATH}`;
}
