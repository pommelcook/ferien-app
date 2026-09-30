// ===========================================================
// LOKALER DATENSPEICHER + OFFLINE-SYNC
// ===========================================================
// Prinzip: Jede Änderung wird SOFORT lokal gespeichert (localStorage),
// damit die App auch ganz ohne Internet nutzbar ist. Danach wird
// versucht, die Änderung auch nach OneDrive zu schreiben. Klappt das
// nicht (kein Internet), bleibt ein "ungespeichert"-Merker gesetzt,
// und es wird automatisch nachsynchronisiert, sobald wieder eine
// Internetverbindung da ist.

const LOCAL_KEY = "ferienapp_daten";
const DIRTY_KEY = "ferienapp_dirty";

let appData = null;
let syncing = false;

function loadLocal() {
  const raw = localStorage.getItem(LOCAL_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveLocal(data) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
}

function markDirty(dirty) {
  localStorage.setItem(DIRTY_KEY, dirty ? "1" : "0");
}

function isDirty() {
  return localStorage.getItem(DIRTY_KEY) === "1";
}

/** Beim Start: erst lokale Kopie zeigen, dann im Hintergrund mit OneDrive abgleichen. */
async function initStore() {
  appData = loadLocal() || emptyData();

  if (navigator.onLine) {
    try {
      const remote = await loadData();
      // Simpler Ansatz fürs Erste: wenn wir noch nichts lokal
      // Ungespeichertes haben, übernehmen wir einfach die
      // OneDrive-Version als aktuellen Stand.
      if (!isDirty()) {
        appData = remote;
        saveLocal(appData);
      } else {
        // Es gibt noch nicht hochgeladene lokale Änderungen. Trotzdem schon
        // jetzt Ferien aus der Cloud übernehmen, die hier lokal noch fehlen
        // (z. B. auf einem anderen Gerät angelegt) - sonst blieben sie für
        // immer unsichtbar, solange dieses Gerät "dirty" bleibt (das war die
        // Ursache dafür, dass andernorts angelegte Ferien nie im Umschalter
        // auftauchten). Die lokal ungespeicherten Änderungen bleiben erhalten
        // und werden weiterhin normal hochsynchronisiert.
        mergeMissingFerien(remote);
        await trySync();
      }
    } catch (e) {
      console.warn("Konnte OneDrive beim Start nicht erreichen, nutze lokale Daten.", e);
      updateSyncStatus("⚠ OneDrive-Fehler: " + (e && e.message ? e.message : e));
    }
  } else {
    updateSyncStatus("Offline (kein Internet beim Start)");
  }

  window.addEventListener("online", trySync);
  return appData;
}

/** Übernimmt Ferien aus der Cloud-Version, die es in den lokalen Daten (noch)
 *  nicht gibt - damit Ferien, die auf einem anderen Gerät angelegt wurden,
 *  nicht dauerhaft verschwinden, nur weil dieses Gerät gerade "dirty" ist. */
function mergeMissingFerien(remote) {
  if (!remote || !Array.isArray(remote.ferien)) return;
  appData.ferien = appData.ferien || [];
  const localIds = new Set(appData.ferien.map((f) => f.id));
  const missing = remote.ferien.filter((f) => !localIds.has(f.id));
  if (missing.length) {
    appData.ferien = appData.ferien.concat(missing);
    saveLocal(appData);
  }
}

/** Änderung an den Daten: lokal sichern + Sync versuchen. */
async function saveChange() {
  saveLocal(appData);
  markDirty(true);
  await trySync();
}

async function trySync() {
  if (syncing || !isDirty() || !navigator.onLine) return;
  syncing = true;
  try {
    await saveData(appData);
    markDirty(false);
    updateSyncStatus("Synchronisiert ✓");
  } catch (e) {
    console.warn("Sync fehlgeschlagen, versuche es später erneut.", e);
    updateSyncStatus("Offline - wird nachsynchronisiert");
  } finally {
    syncing = false;
  }
}

function updateSyncStatus(text) {
  const el = document.getElementById("sync-status");
  if (el) el.textContent = text;
}

function getData() {
  return appData;
}
