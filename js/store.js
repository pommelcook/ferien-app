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
        // Es gibt noch nicht hochgeladene lokale Änderungen -> versuchen, die zuerst zu sichern
        await trySync();
      }
    } catch (e) {
      console.warn("Konnte OneDrive beim Start nicht erreichen, nutze lokale Daten.", e);
    }
  }

  window.addEventListener("online", trySync);
  return appData;
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
