// ===========================================================
// HAUPT-APP-LOGIK
// ===========================================================

let currentTripId = null;
let currentTab = "start";
// Pro Liste merken wir uns, ob erledigte Punkte gerade eingeblendet sind
// (nur im Speicher, nicht gespeichert - beim Neuladen wieder eingeklappt).
// Pro Liste der aktive Filter: "offen" (Standard, ohne erledigt/nicht
// relevant), "erledigt", "nichtRelevant" oder "alle".
const filterMode = { packliste: "offen", todo: "offen" };
// Wonach gruppiert wird: "kategorie" oder (nur beim To-Do) "termin"
const groupBy = { packliste: "kategorie", todo: "kategorie" };
// Zwei getrennte Filter-Ebenen: Termin (nur To-Do) und Kategorie
const terminFilter = { packliste: "alle", todo: "alle" };
const kategorieFilter = { packliste: "alle", todo: "alle" };
// Sortierung innerhalb einer Gruppe: "manuell" (per Drag&Drop/Pfeile) oder "az"
const sortMode = { packliste: "manuell", todo: "manuell" };
// Welche Kategorien gerade eingeklappt sind (Set von "liste:kategorie")
const collapsed = new Set();
// Welche Unterkunft gerade im Bearbeiten-Formular offen ist:
// null = kein Formular offen, "__neu__" = neue Unterkunft, sonst deren id
let editingUnterkunftId = null;
// Welche Etappe gerade im Bearbeiten-Formular offen ist (analog zu Unterkünften):
// null = kein Formular offen, "__neu__" = neue Etappe, sonst deren id
let editingEtappeId = null;
// Im Programm-Tab: nach welcher Etappe die Ideen gefiltert werden ("alle" = kein Filter)
let ideenEtappenFilter = "alle";
// true = das Formular zum Bearbeiten von Titel/Zeitraum der aktuellen Ferien ist offen
let editingTrip = false;
// Welches Item gerade eine offene Erinnerungs-Bearbeitung hat (Item-ID oder null)
let editingReminderId = null;
// Wetter-Cache pro Ferien-ID: { ort, current, daily, fetchedAt }
const weatherCache = {};
// Drag&Drop-Status beim Verschieben von Listeneinträgen
let dragState = null;
// Aktuell angezeigter Tag im Register "Reisetag" (Tage relativ zum Abreisedatum,
// gleiche Zählweise wie item.termin: 0 = Abreisetag). null = noch nicht
// initialisiert, wird beim ersten Rendern auf "heute" gesetzt.
let reisetagOffset = null;
// true = im Reisetag-Register werden ALLE offenen Positionen angezeigt (unabhängig
// vom Termin), nicht nur jene mit aktuellem/vergangenem/fehlendem Datum.
let reisetagShowAllOpen = false;
// Kategorie-Filter im Reisetag-Register ("alle" = kein Filter) - gilt für
// beide Abschnitte (To-Dos und Packliste) gemeinsam.
let reisetagKategorieFilter = "alle";

/** Setzt alle rein visuellen Ansichts-Einstellungen (Filter, Sortierung,
 *  Gruppierung, Ein-/Ausklapp-Zustände, Matrix-Filter, Reisetag-Filter) auf
 *  den Auslieferungszustand zurück - betrifft NICHT die eigentlichen Daten
 *  (Packliste, To-Dos, Ferien, Artikel-Datenbank usw.), die bleiben
 *  unangetastet. Nützlich, wenn man sich in Filtern/Ansichten "verklickt"
 *  hat und schnell wieder einen neutralen Ausgangspunkt möchte. */
function resetAnsichtEinstellungen() {
  filterMode.packliste = "offen";
  filterMode.todo = "offen";
  groupBy.packliste = "kategorie";
  groupBy.todo = "kategorie";
  sortMode.packliste = "manuell";
  sortMode.todo = "manuell";
  collapsed.clear();
  artikelViewMode = "liste";
  artikelMatrixFilter = "alle";
  reisetagShowAllOpen = false;
  reisetagKategorieFilter = "alle";
}
// Einmalig/Fix-Wahl für die Inline-Erfassung auf der Reisetag-Seite (pro Liste)
const reisetagNeuErfassungsTyp = { todo: "einmalig", packliste: "einmalig" };
// Reisetag/Listen: kürzlich (letzte 3 Tage) abgehakte Punkte wieder einblenden,
// um Versehentliches wieder zu öffnen.
let reisetagZeigeErledigte = false;
function istKuerzlichErledigt(item) {
  return !!item.erledigt && !!item.erledigtAm && (Date.now() - item.erledigtAm) < 3 * 86400000;
}

// ===========================================================
// NAVIGATION (Kacheln) - vom Nutzer sortierbar, siehe Einstellungen
// ===========================================================
// "start"/"ferien" und "einstellungen" sind fest (immer zuerst bzw. immer
// zuletzt), alle anderen Kacheln kann der Nutzer in "Einstellungen" per
// Pfeiltasten umsortieren (data.tabOrder).
const TAB_DEFS = {
  start: { icon: "ti-home", label: "Start" },
  ferien: { icon: "ti-beach", label: "Ferien" },
  reisetag: { icon: "ti-calendar-time", label: "Reisetag" },
  packliste: { icon: "ti-checkbox", label: "Packliste" },
  todo: { icon: "ti-list-check", label: "To-Do" },
  artikel: { icon: "ti-list-details", label: "Artikel-DB" },
  programm: { icon: "ti-calendar-event", label: "Programm" },
  finanzen: { icon: "ti-cash", label: "Finanzen" },
  stromladen: { icon: "ti-plug", label: "Stromladen" },
  merkmale: { icon: "ti-tags", label: "Merkmale" },
  ratgeber: { icon: "ti-book-2", label: "Ratgeber" },
  rueckblick: { icon: "ti-camera", label: "Rückblick" },
  anleitung: { icon: "ti-help-circle", label: "Anleitung" },
  notizen: { icon: "ti-notes", label: "Notizen" },
};
const FIXED_FIRST_TABS = ["start", "ferien"];
const FIXED_LAST_TAB = "einstellungen";
const DEFAULT_SORTABLE_TABS = ["reisetag", "packliste", "todo", "artikel", "programm", "finanzen", "stromladen", "merkmale", "ratgeber", "rueckblick", "anleitung", "notizen"];

/** Liefert die aktuell sortierbaren Kacheln (ohne start/ferien/einstellungen),
 *  in der vom Nutzer gewählten Reihenfolge. Neue, dem Nutzer noch unbekannte
 *  Kacheln (z. B. nach einem App-Update) werden automatisch hinten angehängt. */
function getSortableTabs() {
  const data = getData();
  const known = Object.keys(TAB_DEFS).filter((k) => !FIXED_FIRST_TABS.includes(k));
  const stored = (data && data.tabOrder && data.tabOrder.length) ? data.tabOrder : DEFAULT_SORTABLE_TABS;
  const cleaned = stored.filter((k) => known.includes(k));
  known.forEach((k) => { if (!cleaned.includes(k)) cleaned.push(k); });
  return cleaned;
}

function renderNavBars() {
  const hatFerien = !!getCurrentTrip();
  const order = [...FIXED_FIRST_TABS, ...getSortableTabs()].filter((id) => hatFerien || NEUTRAL_TABS.includes(id));
  const buttonsHtml = order.map((id) => {
    const def = TAB_DEFS[id];
    if (!def) return "";
    return `<button class="nav-tab${currentTab === id ? " active" : ""}" data-tab="${id}"><i class="ti ${def.icon}"></i><span>${def.label}</span></button>`;
  }).join("") + `<button class="nav-tab${currentTab === FIXED_LAST_TAB ? " active" : ""}" data-tab="${FIXED_LAST_TAB}"><i class="ti ti-settings"></i><span>Einstellungen</span></button>`;

  const sidebar = document.getElementById("sidebar-nav");
  const tabBar = document.getElementById("tab-bar-nav");
  if (sidebar) sidebar.innerHTML = `<p class="sidebar-title">Verwalten</p>${buttonsHtml}<p class="sidebar-version">v${APP_VERSION}</p>`;
  if (tabBar) tabBar.innerHTML = buttonsHtml;

  document.querySelectorAll(".nav-tab").forEach((btn) => {
    btn.onclick = () => navigateTab(btn.dataset.tab);
  });
}

function initTheme() {
  const stored = localStorage.getItem("ferienapp_theme");
  const theme = stored || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);
}

function setTheme(theme) {
  localStorage.setItem("ferienapp_theme", theme);
  document.documentElement.setAttribute("data-theme", theme);
}

function getTheme() {
  return document.documentElement.getAttribute("data-theme") || "light";
}

async function main() {
  initTheme();
  registerServiceWorker();

  const account = await initAuth();

  if (!account) {
    showLoginScreen();
    return;
  }

  document.getElementById("header-sub").textContent = getAccountName();
  await initStore();

  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app-screen").classList.remove("hidden");

  ensureMerkmaleDefs();
  migrateFehlerhafteMerkmalSchluessel();
  einmaligAllePrioritaetenZuruecksetzen();
  einmaligCheckStatusSetzen();
  initScrollTopButton();

  const data = getData();
  if (!currentTripId) {
    currentTripId = determineInitialTripId(data);
  }
  // Liste "Meine Ferien" ist standardmässig eingeklappt, sobald schon eine
  // Ferien ausgewählt ist - sonst konkurriert sie optisch mit den Details
  // der aktuellen Ferien direkt darunter.
  if (currentTripId) collapsed.add("ferien:liste");

  render();

  // Erinnerungen: gleich beim Start fällige prüfen, danach jede Minute erneut
  checkReminders();
  setInterval(checkReminders, 60000);
}

function showLoginScreen() {
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("app-screen").classList.add("hidden");
  document.getElementById("login-button").addEventListener("click", login);
}

function getCurrentTrip() {
  const data = getData();
  return data.ferien.find((f) => f.id === currentTripId) || null;
}

/** Wechselt die aktuell gewählte Ferien und merkt sie sich dauerhaft
 *  (data.lastTripId), damit beim nächsten App-Start - falls gerade keine
 *  Ferien datumsmässig aktuell läuft - wieder dieselbe Ferien vorausgewählt
 *  wird. */
// Spezialwert für data.lastTripId: "Allgemein-Ansicht" (keine Ferien gewählt).
const NEUTRAL_TRIP_ID = "__neutral__";

function setCurrentTrip(id) {
  currentTripId = id || null;
  const data = getData();
  data.lastTripId = id || NEUTRAL_TRIP_ID;
  saveChange();
}

// Anzahl Tage nach Ende einer Ferien, in denen sie noch als "aktuell" gilt
// (Gnadenfrist), bevor auf die nächstfolgende Ferien umgeschaltet wird.
const AKTUELL_GNADENFRIST_TAGE = 7;

/** Liefert die Ferien, die aktuell als "die laufende Ferien" gelten:
 *  1. eine Ferien, deren Zeitraum (von-bis) das heutige Datum umfasst
 *     (Ferien ohne Bis-Datum: von <= heute reicht, offenes Ende);
 *  2. sonst die zuletzt beendete Ferien, falls ihr Ende nicht mehr als
 *     AKTUELL_GNADENFRIST_TAGE zurückliegt;
 *  3. sonst die nächstfolgende (zeitlich nächste künftige) Ferien.
 *  Gibt null zurück, wenn keine dieser drei Varianten zutrifft. */
function findDateCurrentTrip(data) {
  const today = new Date(new Date().toDateString());

  const laufend = data.ferien.find((f) => {
    if (!f.von) return false;
    const von = new Date(f.von);
    if (today < von) return false;
    if (f.bis) {
      const bis = new Date(f.bis);
      if (today > bis) return false;
    }
    return true;
  });
  if (laufend) return laufend;

  const kuerzlichBeendet = data.ferien
    .filter((f) => f.bis && new Date(f.bis) < today)
    .sort((a, b) => new Date(b.bis) - new Date(a.bis))[0];
  if (kuerzlichBeendet) {
    const tageSeitEnde = Math.round((today - new Date(kuerzlichBeendet.bis)) / 86400000);
    if (tageSeitEnde <= AKTUELL_GNADENFRIST_TAGE) return kuerzlichBeendet;
  }

  const naechste = data.ferien
    .filter((f) => f.von && new Date(f.von) > today)
    .sort((a, b) => new Date(a.von) - new Date(b.von))[0];
  if (naechste) return naechste;

  return null;
}

/** Bestimmt, welche Ferien beim App-Start vorausgewählt wird: zuerst eine
 *  datumsmässig gerade "aktuelle" Ferien (laufend, kürzlich beendet oder
 *  nächstfolgend - siehe findDateCurrentTrip), sonst die zuletzt angezeigte
 *  (data.lastTripId), sonst die erste vorhandene Ferien. */
function determineInitialTripId(data) {
  if (!data.ferien.length) return null;
  const dateCurrent = findDateCurrentTrip(data);
  if (dateCurrent) return dateCurrent.id;
  // Zuletzt in der Allgemein-Ansicht gewesen und gerade läuft keine Ferien: neutral starten.
  if (data.lastTripId === NEUTRAL_TRIP_ID) return null;
  if (data.lastTripId && data.ferien.some((f) => f.id === data.lastTripId)) return data.lastTripId;
  return data.ferien[0].id;
}

/** Immer sichtbarer Umschalter im Kopfbereich, um schnell zwischen Ferien
 *  zu wechseln - egal, in welchem Tab man gerade ist. */
function renderTripSwitcher() {
  const select = document.getElementById("trip-switcher");
  if (!select) return;
  const data = getData();

  if (!data.ferien.length) {
    select.classList.add("hidden");
    return;
  }
  select.classList.remove("hidden");

  const sorted = [...data.ferien].sort((a, b) => {
    if (!a.von && !b.von) return 0;
    if (!a.von) return 1;
    if (!b.von) return -1;
    return a.von.localeCompare(b.von);
  });

  select.innerHTML = '<option value="">Allgemein (ohne Ferien)</option>' + sorted.map((f) => '<option value="' + f.id + '">' + escapeHtml(f.titel) + '</option>').join("");
  select.value = currentTripId || "";
  select.onchange = () => {
    setCurrentTrip(select.value || null);
    render();
  };
}

function itemVisible(item, trip) {
  if (!item.nurWenn || item.nurWenn.length === 0) return true;
  return item.nurWenn.some((k) => trip.merkmale && trip.merkmale[k]);
}

/** Prüft, ob ein Datenbank-Artikel für die AKTUELLE Ferien tatsächlich
 *  relevant/sichtbar auf der Packliste ist - nicht nur technisch als
 *  Datensatz vorhanden. Die Packliste enthält intern alle Katalog-Artikel
 *  (zwecks einfacher Merkmale-Umschaltung), aber nur die zu den gewählten
 *  Merkmalen passenden sollen in Artikel-DB/Matrix als "auf Packliste"
 *  gelten - sonst wären nach dem Anlegen einer Ferien sofort ALLE Artikel
 *  als "schon drauf" markiert, egal welche Merkmale gewählt wurden. */
function istAufAktuellerPackliste(a, trip) {
  if (!trip) return false;
  return trip.packliste.some((p) => p.text === a.text && itemVisible(p, trip) && !p.nichtRelevant);
}

/** Prüft, ob ein Packliste-/To-Do-Item zum aktuell gewählten Status-Filter
 *  passt. "offen" (Standardansicht) blendet sowohl erledigte als auch als
 *  "nicht relevant" markierte Punkte aus. */
function matchesFilter(item, filter, trip) {
  if (filter === "erledigt") return !!item.erledigt;
  if (filter === "kuerzlich") return istKuerzlichErledigt(item);
  if (filter === "nichtRelevant") return !!item.nichtRelevant;
  if (filter === "prioritaet") return !!item.prioritaet && !item.nichtRelevant;
  if (filter === "einmalig") return item.erfassungsTyp === "einmalig";
  if (filter === "fix") return item.erfassungsTyp === "fix";
  if (filter === "ueberfaellig") {
    if (item.erledigt || item.nichtRelevant) return false;
    if (item.termin === undefined || item.termin === null || item.termin === "") return false;
    const todayOffset = trip ? computeTodayOffset(trip) : 0;
    return Number(item.termin) < todayOffset;
  }
  if (filter === "alle") return true;
  return !item.erledigt && !item.nichtRelevant; // "offen"
}

// ===========================================================
// MODAL (Popup) - z. B. für die Artikel-Bearbeitung, damit das
// Formular optisch klar von der Liste dahinter abgesetzt ist.
// ===========================================================
function openModal(innerEl, onClose) {
  closeModal();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "app-modal-overlay";
  const close = () => { closeModal(); if (onClose) onClose(); };
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  const card = document.createElement("div");
  card.className = "modal-card";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "modal-close-btn";
  closeBtn.innerHTML = `<i class="ti ti-x"></i>`;
  closeBtn.onclick = close;
  card.appendChild(closeBtn);
  card.appendChild(innerEl);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  // ESC schliesst das Popup wie ein Klick auf den X-Button
  const escHandler = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", escHandler);
  overlay._escHandler = escHandler;
}
function closeModal() {
  const existing = document.getElementById("app-modal-overlay");
  if (existing) {
    if (existing._escHandler) document.removeEventListener("keydown", existing._escHandler);
    existing.remove();
  }
}

// ===========================================================
// EINKLAPPBARE BOXEN (z. B. Merkmale/Unterkünfte im Ferien-Tab)
// ===========================================================
/** Baut einen klickbaren Panel-Header (Titel + Chevron), der collapseKey im
 *  gemeinsamen "collapsed"-Set umschaltet. Rückgabe: { header, isCollapsed }
 *  - isCollapsed bezieht sich auf den Stand VOR diesem Aufruf. */
function collapsibleHeader(collapseKey, titleHtml, onChange) {
  const isCollapsed = collapsed.has(collapseKey);
  const header = document.createElement("button");
  header.type = "button";
  header.className = "collapsible-header";
  header.innerHTML = `<span>${titleHtml}</span><i class="ti ti-chevron-${isCollapsed ? "right" : "down"}"></i>`;
  header.onclick = () => {
    if (isCollapsed) collapsed.delete(collapseKey);
    else collapsed.add(collapseKey);
    onChange();
  };
  return { header, isCollapsed };
}

/** "Nach oben"-Button: erscheint sobald die Seite gescrollt ist (funktioniert
 *  auf allen Tabs, da die ganze Seite scrollt, nicht nur #tab-content). */
function initScrollTopButton() {
  const btn = document.getElementById("scroll-top-btn");
  if (!btn) return;
  const update = () => {
    // Schwelle knapp über die Kopfzeile gesetzt, damit der Button schon
    // erscheint, sobald der obere Bereich nicht mehr sichtbar ist - nicht
    // erst nach langem Scrollen.
    if (window.scrollY > 120) btn.classList.add("visible");
    else btn.classList.remove("visible");
  };
  window.addEventListener("scroll", update, { passive: true });
  btn.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
  update();
}

// ===========================================================
// RENDER-DISPATCH
// ===========================================================

function render() {
  renderMain();
  injectAddBar();
}

function renderMain() {
  const trip = getCurrentTrip();
  if (!trip && currentTab !== "einstellungen" && !NEUTRAL_TABS.includes(currentTab)) currentTab = "start";
  document.getElementById("header-title").textContent = trip ? trip.titel : (getData().ferien.length ? "Allgemein (ohne Ferien)" : "Ferien-App");
  const headerDate = document.getElementById("header-date");
  if (headerDate) {
    headerDate.textContent = trip && trip.von
      ? formatDateShort(trip.von) + (trip.bis ? " - " + formatDateShort(trip.bis) : "")
      : "";
  }
  const headerVersion = document.getElementById("header-version");
  if (headerVersion) headerVersion.textContent = "v" + APP_VERSION;
  renderTripSwitcher();
  renderNavBars();

  const el = document.getElementById("tab-content");

  if (currentTab === "start") return renderStartTab(el, trip);
  if (currentTab === "ferien") return renderFerienTab(el, trip);
  if (currentTab === "einstellungen") return renderEinstellungenTab(el);
  if (currentTab === "artikel") return renderArtikelTab(el);
  if (currentTab === "merkmale") return renderMerkmaleTab(el);
  if (currentTab === "programm") return renderProgrammTab(el, trip);
  if (currentTab === "finanzen") return renderFinanzenTab(el, trip);
  if (currentTab === "reisetag") return renderReisetagTab(el, trip);
  if (currentTab === "stromladen") return renderStromladenTab(el, trip);
  if (currentTab === "ratgeber") return renderRatgeberTab(el);
  if (currentTab === "anleitung") return renderAnleitungTab(el);
  if (currentTab === "rueckblick") return renderRueckblickTab(el, trip);
  if (currentTab === "notizen") return renderNotizenTab(el, trip);
  if (!trip && currentTab === "todo") return renderTodoVorlageTab(el);

  if (!trip) {
    el.innerHTML = `<p class="hint">Noch keine Ferien angelegt.<br />Wechsle zum Tab "Ferien", um eine anzulegen.</p>`;
    return;
  }
  if (currentTab === "packliste") return renderListTab(el, trip, "packliste", "🎒", "Neuer Artikel...");
  if (currentTab === "todo") return renderListTab(el, trip, "todo", "✅", "Neuer Punkt...");
}

// ===========================================================
// TAB: START (Dashboard - schneller Überblick)
// ===========================================================

function renderStartTab(el, trip) {
  if (!trip && getData().ferien.length) {
    el.innerHTML = '<section class="panel">' + neutralExplanationHtml() + '</section>';
    return;
  }
  if (!trip) {
    el.innerHTML = `<p class="hint">Noch keine Ferien angelegt.<br />Wechsle zum Tab "Ferien", um eine anzulegen.</p>`;
    return;
  }

  const packOpen = trip.packliste.filter((i) => itemVisible(i, trip) && !i.erledigt && !i.nichtRelevant).length;
  const packTotal = trip.packliste.filter((i) => itemVisible(i, trip) && !i.nichtRelevant).length;
  const todoOpen = trip.todo.filter((i) => itemVisible(i, trip) && !i.erledigt && !i.nichtRelevant).length;
  const todoTotal = trip.todo.filter((i) => itemVisible(i, trip) && !i.nichtRelevant).length;
  const packPct = packTotal ? Math.round(((packTotal - packOpen) / packTotal) * 100) : 0;
  const todoPct = todoTotal ? Math.round(((todoTotal - todoOpen) / todoTotal) * 100) : 0;

  let countdown = "";
  if (trip.von) {
    const days = Math.ceil((new Date(trip.von) - new Date(new Date().toDateString())) / 86400000);
    if (days > 0) countdown = `Noch <strong>${days}</strong> Tag${days === 1 ? "" : "e"} bis zur Abreise`;
    else if (days === 0) countdown = "Heute geht's los! 🎉";
    else countdown = "Ferien laufen bereits";
  }

  const naechsteToDos = trip.todo
    .filter((i) => itemVisible(i, trip) && !i.erledigt && !i.nichtRelevant && i.termin !== undefined && i.termin !== null && i.termin !== "")
    .sort((a, b) => Number(a.termin) - Number(b.termin))
    .slice(0, 3);

  const aktiveMerkmale = getMerkmaleDefs().filter((m) => trip.merkmale && trip.merkmale[m.key]);

  const onChange = () => renderStartTab(el, trip);
  el.innerHTML = `
    <section class="panel dashboard-hero">
      <p class="hint-small">${escapeHtml(trip.titel)}</p>
      ${countdown ? `<p class="countdown">${countdown}</p>` : `<p class="hint-small">Kein Reisedatum hinterlegt (im Tab "Unterkünfte" bzw. später bei Ferien ergänzbar)</p>`}
    </section>

    <div class="dashboard-grid">
      <section class="panel">
        <p class="hint-small">🎒 Packliste</p>
        <p class="dashboard-number">${packPct}%</p>
        <div class="progress-bar"><div class="progress-fill" style="width:${packPct}%"></div></div>
        <p class="hint-small">${packOpen} von ${packTotal} noch offen</p>
      </section>
      <section class="panel">
        <p class="hint-small">✅ To-Do</p>
        <p class="dashboard-number">${todoPct}%</p>
        <div class="progress-bar"><div class="progress-fill" style="width:${todoPct}%"></div></div>
        <p class="hint-small">${todoOpen} von ${todoTotal} noch offen</p>
      </section>
    </div>

    <section class="panel" id="weather-section">
      <h2><i class="ti ti-cloud"></i> Wetter</h2>
      <div id="weather-panel"><p class="hint-small">Lade Wettervorhersage...</p></div>
    </section>
  `;

  if (naechsteToDos.length) {
    const naechsteSection = document.createElement("section");
    naechsteSection.className = "panel";
    const { header, isCollapsed } = collapsibleHeader("start:naechste", "Als Nächstes fällig", onChange);
    naechsteSection.appendChild(header);
    if (!isCollapsed) {
      const list = document.createElement("ul");
      list.className = "item-list";
      naechsteToDos.forEach((i) => {
        const li = document.createElement("li");
        li.className = "item-row";
        li.innerHTML = `<span class="termin-badge">${formatTermin(i.termin)}</span><span>${escapeHtml(i.text)}</span>`;
        list.appendChild(li);
      });
      naechsteSection.appendChild(list);
    }
    el.appendChild(naechsteSection);
  }

  const merkmaleSection = document.createElement("section");
  merkmaleSection.className = "panel";
  const { header: merkmaleHeader, isCollapsed: merkmaleCollapsed } = collapsibleHeader("start:merkmale", "Aktive Merkmale", onChange);
  merkmaleSection.appendChild(merkmaleHeader);
  if (!merkmaleCollapsed) {
    if (aktiveMerkmale.length) {
      const chipRow = document.createElement("div");
      chipRow.className = "chip-row";
      chipRow.innerHTML = aktiveMerkmale.map((m) => `<span class="chip active"><i class="ti ${m.icon}"></i>${m.label}</span>`).join("");
      merkmaleSection.appendChild(chipRow);
    } else {
      const hint = document.createElement("p");
      hint.className = "hint-small";
      hint.textContent = "Keine Merkmale aktiv - im Tab \"Ferien\" einstellbar.";
      merkmaleSection.appendChild(hint);
    }
  }
  el.appendChild(merkmaleSection);

  loadWeatherPanel(trip);
}

// ===========================================================
// WETTER (Open-Meteo - kostenlos, kein API-Key nötig)
// ===========================================================

function weatherLocationQuery(trip) {
  if (trip.unterkuenfte && trip.unterkuenfte.length && trip.unterkuenfte[0].adresse) {
    return trip.unterkuenfte[0].adresse;
  }
  // Groben Ortsnamen aus dem Reisetitel raten (Jahreszahlen/Füllwörter entfernen)
  return trip.titel
    .replace(/\b(ferien|sommerferien|herbstferien|winterferien|weihnachtsferien|sportferien|mit|und|gottis?)\b/gi, " ")
    .replace(/\d{4}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function weatherIcon(code) {
  if (code === 0) return "ti-sun";
  if ([1, 2, 3].includes(code)) return "ti-cloud";
  if ([45, 48].includes(code)) return "ti-cloud-fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "ti-cloud-drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "ti-cloud-rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "ti-cloud-snow";
  if ([95, 96, 99].includes(code)) return "ti-cloud-bolt";
  return "ti-cloud";
}

async function fetchWeather(query) {
  const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=de&format=json`);
  const geo = await geoRes.json();
  if (!geo.results || !geo.results.length) return null;
  const { latitude, longitude, name } = geo.results[0];
  const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=4`);
  const w = await wRes.json();
  return { ort: name, current: w.current, daily: w.daily, fetchedAt: Date.now() };
}

async function loadWeatherPanel(trip) {
  const panel = document.getElementById("weather-panel");
  if (!panel) return;

  const query = weatherLocationQuery(trip);
  if (!query) {
    panel.innerHTML = `<p class="hint-small">Kein Ort erkannt - Adresse bei einer Unterkunft ergänzen.</p>`;
    return;
  }

  const cached = weatherCache[trip.id];
  if (cached && Date.now() - cached.fetchedAt < 30 * 60 * 1000) {
    renderWeatherPanel(panel, cached);
    return;
  }

  try {
    const result = await fetchWeather(query);
    if (!result) {
      panel.innerHTML = `<p class="hint-small">Ort "${escapeHtml(query)}" nicht gefunden - Adresse bei einer Unterkunft ergänzen.</p>`;
      return;
    }
    weatherCache[trip.id] = result;
    // Nur noch aktuell, falls der Nutzer inzwischen nicht die Ferien gewechselt hat
    if (getCurrentTrip() && getCurrentTrip().id === trip.id && currentTab === "start") {
      renderWeatherPanel(panel, result);
    }
  } catch (e) {
    panel.innerHTML = `<p class="hint-small">Wetter aktuell nicht abrufbar.</p>`;
  }
}

function renderWeatherPanel(panel, w) {
  const days = (w.daily.time || []).slice(1, 4);
  panel.innerHTML = `
    <div class="weather-panel">
      <div class="weather-now"><i class="ti ${weatherIcon(w.current.weather_code)}"></i>${Math.round(w.current.temperature_2m)}°</div>
      <div class="weather-forecast">
        ${days.map((d, idx) => `
          <div class="weather-day">
            ${new Date(d).toLocaleDateString("de-CH", { weekday: "short" })}
            <i class="ti ${weatherIcon(w.daily.weather_code[idx + 1])}"></i>
            ${Math.round(w.daily.temperature_2m_max[idx + 1])}°/${Math.round(w.daily.temperature_2m_min[idx + 1])}°
          </div>
        `).join("")}
      </div>
    </div>
    <p class="hint-small">${escapeHtml(w.ort)}</p>
  `;
}

function formatTermin(t) {
  const n = Number(t);
  if (n === 0) return "Abreisetag";
  if (n > 0) return `+${n} Tag${n === 1 ? "" : "e"}`;
  return `${Math.abs(n)} Tag${Math.abs(n) === 1 ? "" : "e"} vorher`;
}

// ===========================================================
// TAB: REISETAG (Tagesansicht: welche To-Dos/Artikel sind heute dran -
// dieselben Item-Objekte wie Packliste/To-Do, daher automatisch
// bidirektional synchron beim Abhaken)
// ===========================================================

/** "Tage relativ zum Abreisedatum" für heute, gleiche Zählweise wie
 *  item.termin (0 = Abreisetag). Ohne hinterlegtes Von-Datum gibt es
 *  keinen sinnvollen "heute"-Bezug, daher Fallback auf 0. */
function computeTodayOffset(trip) {
  if (!trip.von) return 0;
  const today = new Date(new Date().toDateString());
  const von = new Date(trip.von);
  return Math.round((today - von) / 86400000);
}

function renderReisetagTab(el, trip) {
  if (!trip) {
    el.innerHTML = `<p class="hint">Noch keine Ferien angelegt.<br />Wechsle zum Tab "Ferien", um eine anzulegen.</p>`;
    return;
  }

  if (reisetagOffset === null) reisetagOffset = computeTodayOffset(trip);

  // Anzeige-Bereich: mindestens eine Woche vor Abreise bis Ende der Ferien,
  // erweitert um alle Tage, an denen tatsächlich To-Dos fällig sind.
  let minOffset = -7;
  let maxOffset = 0;
  trip.todo.forEach((i) => {
    if (itemVisible(i, trip) && i.termin !== undefined && i.termin !== null && i.termin !== "") {
      const n = Number(i.termin);
      if (n < minOffset) minOffset = n;
      if (n > maxOffset) maxOffset = n;
    }
  });
  if (trip.von && trip.bis) {
    const span = Math.round((new Date(trip.bis) - new Date(trip.von)) / 86400000);
    if (span > maxOffset) maxOffset = span;
  }
  reisetagOffset = Math.max(minOffset, Math.min(maxOffset, reisetagOffset));

  const onChange = () => renderReisetagTab(el, trip);
  el.innerHTML = "";

  // --- Navigation ---
  const nav = document.createElement("section");
  nav.className = "panel";
  const navRow = document.createElement("div");
  navRow.className = "panel-header-row";
  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "secondary";
  prevBtn.innerHTML = `<i class="ti ti-chevron-left"></i>`;
  prevBtn.disabled = reisetagOffset <= minOffset;
  prevBtn.onclick = () => { reisetagOffset -= 1; onChange(); };
  const title = document.createElement("h2");
  title.style.margin = "0";
  title.textContent = reisetagOffset === 0 ? "Abreisetag" : formatTermin(reisetagOffset);
  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "secondary";
  nextBtn.innerHTML = `<i class="ti ti-chevron-right"></i>`;
  nextBtn.disabled = reisetagOffset >= maxOffset;
  nextBtn.onclick = () => { reisetagOffset += 1; onChange(); };
  navRow.appendChild(prevBtn);
  navRow.appendChild(title);
  navRow.appendChild(nextBtn);
  nav.appendChild(navRow);

  if (trip.von) {
    const d = new Date(trip.von);
    d.setDate(d.getDate() + reisetagOffset);
    const dateP = document.createElement("p");
    dateP.className = "hint-small";
    dateP.style.textAlign = "center";
    dateP.textContent = d.toLocaleDateString("de-CH", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
    nav.appendChild(dateP);
  }

  const todayOffset = computeTodayOffset(trip);
  if (reisetagOffset !== todayOffset && todayOffset >= minOffset && todayOffset <= maxOffset) {
    const todayBtn = document.createElement("button");
    todayBtn.type = "button";
    todayBtn.className = "link-button";
    todayBtn.style.display = "block";
    todayBtn.style.margin = "0 auto";
    todayBtn.innerHTML = `<i class="ti ti-calendar-event"></i> Zu heute springen`;
    todayBtn.onclick = () => { reisetagOffset = todayOffset; onChange(); };
    nav.appendChild(todayBtn);
  }
  // Umschalter: Standardmässig nur fällige/überfällige/datumslose offene Positionen,
  // per Klick alle offenen Positionen (unabhängig vom Termin).
  const toggleAllBtn = document.createElement("button");
  toggleAllBtn.type = "button";
  toggleAllBtn.className = "link-button";
  toggleAllBtn.style.display = "block";
  toggleAllBtn.style.margin = "6px auto 0";
  toggleAllBtn.innerHTML = reisetagShowAllOpen
    ? `<i class="ti ti-filter"></i> Nur fällige/offene ohne Datum anzeigen`
    : `<i class="ti ti-list-details"></i> Alle offenen Positionen anzeigen`;
  toggleAllBtn.onclick = () => { reisetagShowAllOpen = !reisetagShowAllOpen; onChange(); };
  nav.appendChild(toggleAllBtn);
  const toggleDoneBtn = document.createElement("button");
  toggleDoneBtn.type = "button";
  toggleDoneBtn.className = "link-button";
  toggleDoneBtn.style.display = "block";
  toggleDoneBtn.style.margin = "6px auto 0";
  toggleDoneBtn.innerHTML = reisetagZeigeErledigte
    ? `<i class="ti ti-eye-off"></i> Kürzlich Erledigte ausblenden`
    : `<i class="ti ti-history"></i> Kürzlich Erledigte anzeigen`;
  toggleDoneBtn.onclick = () => { reisetagZeigeErledigte = !reisetagZeigeErledigte; onChange(); };
  nav.appendChild(toggleDoneBtn);

  // Kategorie-Filter: Auswahl aus allen Kategorien, die aktuell unter den
  // fälligen/offenen Positionen (beider Abschnitte) vorkommen.
  const alleSichtbarenItems = [...trip.todo, ...trip.packliste].filter((i) => reisetagItemMatches(i, trip, reisetagOffset, reisetagShowAllOpen));
  const kategorienImAngebot = [...new Set(alleSichtbarenItems.map((i) => i.kategorie || "Allgemein"))].sort((a, b) => a.localeCompare(b, "de"));
  if (kategorienImAngebot.length > 1) {
    const katFilterLabel = document.createElement("label");
    katFilterLabel.style.display = "block";
    katFilterLabel.style.marginTop = "6px";
    katFilterLabel.style.fontSize = "12px";
    katFilterLabel.innerHTML = `<i class="ti ti-filter"></i> Kategorie
      <select id="reisetag-kategorie-filter">
        <option value="alle" ${reisetagKategorieFilter === "alle" ? "selected" : ""}>Alle Kategorien</option>
        ${kategorienImAngebot.map((k) => `<option value="${escapeHtml(k)}" ${reisetagKategorieFilter === k ? "selected" : ""}>${escapeHtml(k)}</option>`).join("")}
      </select>`;
    nav.appendChild(katFilterLabel);
  } else {
    reisetagKategorieFilter = "alle";
  }
  el.appendChild(nav);
  const katFilterSelect = document.getElementById("reisetag-kategorie-filter");
  if (katFilterSelect) katFilterSelect.onchange = (e) => { reisetagKategorieFilter = e.target.value; onChange(); };

  const matchesKategorieFilter = (i) => reisetagKategorieFilter === "alle" || (i.kategorie || "Allgemein") === reisetagKategorieFilter;

  // --- To-Dos ---
  const todosForDay = trip.todo.filter((i) => reisetagItemMatches(i, trip, reisetagOffset, reisetagShowAllOpen) && matchesKategorieFilter(i));
  const todoSection = document.createElement("section");
  todoSection.className = "panel";
  const todoHeaderResult = collapsibleHeader(
    "reisetag:todos",
    `✅ To-Dos <i class="ti ti-external-link reisetag-jump-icon" title="Zur To-Do-Liste" data-jump="todo"></i> (${todosForDay.length})`,
    onChange
  );
  todoSection.appendChild(todoHeaderResult.header);
  const jumpTodoIcon = todoHeaderResult.header.querySelector('[data-jump="todo"]');
  if (jumpTodoIcon) jumpTodoIcon.onclick = (e) => { e.stopPropagation(); navigateTab("todo"); };
  if (!todoHeaderResult.isCollapsed) {
    if (!todosForDay.length) {
      const hint = document.createElement("p");
      hint.className = "hint-empty";
      hint.textContent = "Keine To-Dos zu sehen.";
      todoSection.appendChild(hint);
    } else {
      todosForDay.forEach((item) => todoSection.appendChild(reisetagItemRow(item, onChange, "todo")));
    }
    todoSection.appendChild(renderReisetagQuickAddForm(trip, "todo", reisetagOffset, onChange));
  }
  el.appendChild(todoSection);

  // --- Packliste: kein eigenes Termin-Feld, gilt daher immer als "ohne Datum" ---
  const openPack = trip.packliste.filter((i) => reisetagItemMatches(i, trip, reisetagOffset, reisetagShowAllOpen) && matchesKategorieFilter(i));
  const packSection = document.createElement("section");
  packSection.className = "panel";
  const packHeaderResult = collapsibleHeader(
    "reisetag:packliste",
    `🎒 Packliste <i class="ti ti-external-link reisetag-jump-icon" title="Zur Packliste" data-jump="packliste"></i> (${openPack.length})`,
    onChange
  );
  packSection.appendChild(packHeaderResult.header);
  const jumpPackIcon = packHeaderResult.header.querySelector('[data-jump="packliste"]');
  if (jumpPackIcon) jumpPackIcon.onclick = (e) => { e.stopPropagation(); navigateTab("packliste"); };
  if (!packHeaderResult.isCollapsed) {
    if (!openPack.length) {
      const empty = document.createElement("p");
      empty.className = "hint-empty";
      empty.textContent = "Alles gepackt!";
      packSection.appendChild(empty);
    } else {
      openPack.forEach((item) => packSection.appendChild(reisetagItemRow(item, onChange, "packliste")));
    }
    packSection.appendChild(renderReisetagQuickAddForm(trip, "packliste", reisetagOffset, onChange));
  }
  el.appendChild(packSection);
}

/** Entscheidet, ob ein Item im Reisetag-Register angezeigt wird: offene Positionen
 *  mit aktuellem/vergangenem Termin oder ganz ohne Termin (Packliste hat nie ein
 *  Termin-Feld, gilt also immer als "ohne Datum"); per Toggle auch alle offenen
 *  Positionen unabhängig vom Termin (z. B. auch zukünftige). */
function reisetagItemMatches(item, trip, offset, showAllOpen) {
  if (!itemVisible(item, trip)) return false;
  if (item.nichtRelevant) return false;
  if (item.erledigt) return reisetagZeigeErledigte && istKuerzlichErledigt(item);
  if (showAllOpen) return true;
  if (item.termin === undefined || item.termin === null || item.termin === "") return true;
  return Number(item.termin) <= offset;
}

/** Leichte Zeilen-Darstellung fürs Reisetag-Register: greift direkt auf
 *  dasselbe Item-Objekt wie Packliste/To-Do zu (keine Kopie), daher ist
 *  das Abhaken hier automatisch bidirektional synchron. */
function reisetagItemRow(item, onChange, listKey) {
  const trip = getCurrentTrip();
  const frag = document.createDocumentFragment();
  frag.appendChild(itemRow(trip, listKey, item, listKey === "todo", false, [], 0, onChange));
  if (editingReminderId === item.id) frag.appendChild(reminderForm(item, onChange));
  return frag;
}

/** Inline-Erfassungsformular direkt auf der Reisetag-Seite: neue To-Dos landen
 *  mit Termin = aktuell angezeigter Tag, neue Packliste-Punkte ohne Termin -
 *  in beiden Fällen mit Wahl Einmalig/Fix (Fix wandert zusätzlich in die
 *  zentrale Vorlage, siehe ensureArtikelDatenbank()/ensureTodoVorlage()). */
function renderReisetagQuickAddForm(trip, key, offset, onChange) {
  const isTodo = key === "todo";
  return buildNeuerEintragBox({
    key,
    trip,
    placeholder: isTodo ? "Neues To-Do für diesen Tag ..." : "Neuer Artikel ...",
    idSuffix: "reisetag-" + key + "-" + String(offset),
    fixedTermin: isTodo,
    offset: isTodo ? offset : undefined,
    compact: true,
    typStore: { get: () => reisetagNeuErfassungsTyp[key], set: (v) => { reisetagNeuErfassungsTyp[key] = v; } },
    onAdded: onChange,
    reload: onChange,
  });
}

// ===========================================================
// TAB: FERIEN (Reise wählen/anlegen + Merkmale einstellen)
// ===========================================================

function renderFerienTab(el, trip) {
  const data = getData();
  el.innerHTML = "";
  const onChange = () => renderFerienTab(el, trip);

  // ---------------------------------------------------------
  // Sektion 1: "Meine Ferien" - Übersicht/Umschalten/Neu anlegen.
  // Ist eine Ferien bereits ausgewählt, ist diese Liste standardmässig
  // eingeklappt (siehe main()), damit sie nicht mit den Details der
  // aktuellen Ferien direkt darunter verwechselt wird.
  // ---------------------------------------------------------
  const overviewKey = "ferien:liste";
  const overviewSection = document.createElement("section");
  overviewSection.className = "panel panel-muted";
  const overviewBadge = document.createElement("p");
  overviewBadge.className = "scope-badge scope-badge-neutral";
  overviewBadge.innerHTML = `<i class="ti ti-list"></i> Alle Ferien - nicht Teil der aktuellen Auswahl`;
  overviewSection.appendChild(overviewBadge);
  const { header: overviewHeader, isCollapsed: overviewCollapsed } = collapsibleHeader(
    overviewKey,
    "Meine Ferien",
    onChange
  );
  overviewSection.appendChild(overviewHeader);
  if (!overviewCollapsed) {
    const list = document.createElement("ul");
    list.className = "trip-list";
    const sortedFerien = [...data.ferien].sort((a, b) => {
      if (!a.von && !b.von) return 0;
      if (!a.von) return 1;
      if (!b.von) return -1;
      return a.von.localeCompare(b.von);
    });
    sortedFerien.forEach((f) => {
      const li = document.createElement("li");
      li.className = "trip-list-item" + (f.id === currentTripId ? " active" : "");
      li.innerHTML = `<span>${escapeHtml(f.titel)}</span>${f.id === currentTripId ? '<i class="ti ti-check"></i>' : ""}`;
      li.onclick = () => {
        setCurrentTrip(f.id);
        collapsed.add(overviewKey);
        render();
      };
      list.appendChild(li);
    });
    overviewSection.appendChild(list);
    const newTripBtn = document.createElement("button");
    newTripBtn.className = "secondary";
    newTripBtn.innerHTML = `<i class="ti ti-plus"></i> Neue Ferien`;
    newTripBtn.onclick = createNewTrip;
    overviewSection.appendChild(newTripBtn);
  }
  el.appendChild(overviewSection);

  if (!trip) return;

  // ---------------------------------------------------------
  // Ab hier: alles gehört zur AKTUELLEN Ferien - optisch klar abgesetzt
  // von der neutralen "Meine Ferien"-Übersicht oben (grüner Rahmen + Badge).
  // ---------------------------------------------------------
  const currentWrap = document.createElement("div");
  currentWrap.className = "current-ferien-wrap";
  const currentBadge = document.createElement("p");
  currentBadge.className = "scope-badge scope-badge-active";
  currentBadge.innerHTML = `<i class="ti ti-map-pin"></i> Aktuelle Ferien: ${escapeHtml(trip.titel)}`;
  currentWrap.appendChild(currentBadge);
  el.appendChild(currentWrap);

  // ---------------------------------------------------------
  // Sektion 2: aktuelle Ferien (Titel/Zeitraum) - immer sichtbar, das ist
  // der eigentliche Fokus dieses Tabs.
  // ---------------------------------------------------------
  const tripSection = document.createElement("section");
  tripSection.className = "panel";
  tripSection.innerHTML = `
    <div class="panel-header-row">
      <h2>${escapeHtml(trip.titel)}</h2>
      <button id="edit-trip-button" class="link-button"><i class="ti ti-pencil"></i> Bearbeiten</button>
    </div>
    <p class="hint-small">${trip.von || trip.bis ? `${trip.von ? formatDate(trip.von) : "?"} – ${trip.bis ? formatDate(trip.bis) : "?"}` : "Noch kein Zeitraum hinterlegt"}</p>
    <div id="trip-edit-form-container"></div>
  `;
  currentWrap.appendChild(tripSection);
  tripSection.querySelector("#edit-trip-button").onclick = () => {
    editingTrip = !editingTrip;
    onChange();
  };
  if (editingTrip) {
    tripSection.querySelector("#trip-edit-form-container").appendChild(renderTripEditForm(trip, onChange));
  }

  // ---------------------------------------------------------
  // Sektion 2b: Etappen - mehrere Destinationen innerhalb derselben Ferien
  // (z. B. 5 Tage Zermatt, dann 3 Tage Lugano) - einklappbar.
  // ---------------------------------------------------------
  trip.etappen = trip.etappen || [];
  const etappenKey = "ferien:etappen";
  const etappenSection = document.createElement("section");
  etappenSection.className = "panel";
  const { header: etappenHeader, isCollapsed: etappenCollapsed } = collapsibleHeader(
    etappenKey,
    `Etappen (${trip.etappen.length})`,
    onChange
  );
  etappenSection.appendChild(etappenHeader);
  if (!etappenCollapsed) {
    const hint = document.createElement("p");
    hint.className = "hint-small";
    hint.textContent = "Mehrere Destinationen innerhalb derselben Ferien (z. B. 5 Tage Zermatt, dann 3 Tage Lugano). Unterkünfte lassen sich einer Etappe zuordnen, Programm-Ideen können einer/mehreren/allen Etappen zugewiesen werden.";
    etappenSection.appendChild(hint);
    const etappenCardGrid = document.createElement("div");
    etappenCardGrid.className = "card-grid";
    etappenCardGrid.id = "etappen-cards";
    etappenSection.appendChild(etappenCardGrid);
    const etappenFormContainer = document.createElement("div");
    etappenFormContainer.id = "etappen-form-container";
    etappenSection.appendChild(etappenFormContainer);
  }
  currentWrap.appendChild(etappenSection);
  if (!etappenCollapsed) {
    renderEtappen(el, trip);
  }

  // ---------------------------------------------------------
  // Sektion 3: Merkmale - einklappbar.
  // ---------------------------------------------------------
  const merkmaleKey = "ferien:merkmale";
  const merkmaleSection = document.createElement("section");
  merkmaleSection.className = "panel";
  const { header: merkmaleHeader, isCollapsed: merkmaleCollapsed } = collapsibleHeader(merkmaleKey, "Merkmale", onChange);
  merkmaleSection.appendChild(merkmaleHeader);
  if (!merkmaleCollapsed) {
    const hint = document.createElement("p");
    hint.className = "hint-small";
    hint.textContent = "Bestimmen, welche Artikel/To-Dos automatisch angezeigt werden.";
    merkmaleSection.appendChild(hint);
    const gruppenContainer = document.createElement("div");
    groupMerkmale(getMerkmaleDefs()).forEach((g) => {
      const wrap = document.createElement("div");
      wrap.className = "merkmale-gruppe";
      wrap.innerHTML = `<p class="hint-small merkmale-gruppe-titel">${escapeHtml(g.gruppe)}</p>`;
      const chipRow = document.createElement("div");
      chipRow.className = "chip-row";
      g.items.forEach((m) => {
        const active = !!(trip.merkmale && trip.merkmale[m.key]);
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip" + (active ? " active" : "");
        chip.innerHTML = `<i class="ti ${m.icon}"></i>${m.label}`;
        chip.onclick = () => {
          trip.merkmale = trip.merkmale || {};
          trip.merkmale[m.key] = !trip.merkmale[m.key];
          saveChange();
          onChange();
        };
        chipRow.appendChild(chip);
      });
      wrap.appendChild(chipRow);
      gruppenContainer.appendChild(wrap);
    });
    merkmaleSection.appendChild(gruppenContainer);
  }
  currentWrap.appendChild(merkmaleSection);

  // ---------------------------------------------------------
  // Sektion 4: Unterkünfte - einklappbar.
  // ---------------------------------------------------------
  const unterkunftKey = "ferien:unterkuenfte";
  const unterkunftSection = document.createElement("section");
  unterkunftSection.className = "panel";
  const { header: unterkunftHeader, isCollapsed: unterkunftCollapsed } = collapsibleHeader(unterkunftKey, "Unterkünfte", onChange);
  unterkunftSection.appendChild(unterkunftHeader);
  if (!unterkunftCollapsed) {
    const hint = document.createElement("p");
    hint.className = "hint-small";
    hint.textContent = "Eine Reise kann mehrere Unterkünfte haben (z. B. bei mehreren Stopps).";
    unterkunftSection.appendChild(hint);
    const cardGrid = document.createElement("div");
    cardGrid.className = "card-grid";
    cardGrid.id = "unterkunft-cards";
    unterkunftSection.appendChild(cardGrid);
    const formContainer = document.createElement("div");
    formContainer.id = "unterkunft-form-container";
    unterkunftSection.appendChild(formContainer);
  }
  currentWrap.appendChild(unterkunftSection);
  if (!unterkunftCollapsed) {
    renderUnterkuenfte(el, trip);
  }
}

function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** Kurzform ohne führende Nullen und mit zweistelligem Jahr, z. B. "30.9.26"
 *  - fürs Ferien-Datum im Kopfbereich, wo es platzsparend sein soll. */
function formatDateShort(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(d)}.${Number(m)}.${y.slice(2)}`;
}

/** Formular zum Bearbeiten von Titel und Zeitraum der aktuellen Ferien
 *  (bislang liess sich das nur beim Anlegen per Prompt setzen). */
function renderTripEditForm(trip, onChange) {
  const form = document.createElement("form");
  form.className = "field-form panel";
  form.innerHTML = `
    <label><span><i class="ti ti-heading"></i> Titel</span><input type="text" name="titel" value="${escapeHtml(trip.titel)}" required /></label>
    <div class="field-row">
      <label><span><i class="ti ti-calendar-event"></i> Von</span><input type="date" name="von" value="${escapeHtml(trip.von || "")}" /></label>
      <label><span><i class="ti ti-calendar-event"></i> Bis</span><input type="date" name="bis" value="${escapeHtml(trip.bis || "")}" /></label>
    </div>
    <div class="form-actions">
      <button type="submit"><i class="ti ti-check"></i> Speichern</button>
      <button type="button" id="cancel-trip-edit" class="secondary">Abbrechen</button>
      <button type="button" id="delete-trip" class="danger"><i class="ti ti-trash"></i></button>
    </div>
  `;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    trip.titel = fd.get("titel").trim() || trip.titel;
    trip.von = fd.get("von") || "";
    trip.bis = fd.get("bis") || "";
    saveChange();
    editingTrip = false;
    onChange();
  });

  form.querySelector("#cancel-trip-edit").onclick = () => {
    editingTrip = false;
    onChange();
  };

  form.querySelector("#delete-trip").onclick = () => {
    if (!confirm(`"${trip.titel}" wirklich ganz löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    const data = getData();
    data.ferien = data.ferien.filter((f) => f.id !== trip.id);
    saveChange();
    editingTrip = false;
    setCurrentTrip(data.ferien.length ? data.ferien[0].id : null);
    render();
  };

  return form;
}

// ===========================================================
// UNTERKÜNFTE (Kacheln + Formular, direkt am Handy bearbeitbar)
// ===========================================================

function renderUnterkuenfte(el, trip) {
  trip.unterkuenfte = trip.unterkuenfte || [];

  const cardGrid = document.getElementById("unterkunft-cards");
  cardGrid.innerHTML = "";

  if (trip.unterkuenfte.length === 0) {
    cardGrid.innerHTML = `<p class="hint-empty">Noch keine Unterkunft erfasst.</p>`;
  }

  trip.unterkuenfte.forEach((u) => {
    const card = document.createElement("button");
    card.className = "unterkunft-card";
    const zeitraum = [u.von, u.bis].filter(Boolean).join(" – ");
    const etappe = u.etappeId ? (trip.etappen || []).find((e) => e.id === u.etappeId) : null;
    const ortZeile = [u.adresse, u.plzOrt, u.land].filter(Boolean).join(", ");
    card.innerHTML = `
      <p class="u-name"><i class="ti ti-home"></i>${escapeHtml(u.name || "Ohne Namen")}</p>
      ${etappe ? `<p class="u-dates"><i class="ti ti-map-pin"></i> ${escapeHtml(etappenLabel(trip, etappe))}</p>` : ""}
      ${zeitraum ? `<p class="u-dates">${escapeHtml(zeitraum)}</p>` : ""}
      ${ortZeile ? `<p class="u-adresse">${escapeHtml(ortZeile)}</p>` : ""}
      ${u.naviAdresse ? `<p class="u-adresse"><i class="ti ti-navigation"></i> Navi: ${escapeHtml(u.naviAdresse)}</p>` : ""}
    `;
    card.onclick = () => {
      editingUnterkunftId = u.id;
      renderUnterkuenfte(el, trip);
    };
    cardGrid.appendChild(card);
  });

  const addBtn = document.createElement("button");
  addBtn.className = "secondary";
  addBtn.innerHTML = `<i class="ti ti-plus"></i> Neue Unterkunft`;
  addBtn.onclick = () => {
    editingUnterkunftId = "__neu__";
    renderUnterkuenfte(el, trip);
  };
  cardGrid.appendChild(addBtn);

  const formContainer = document.getElementById("unterkunft-form-container");
  formContainer.innerHTML = "";
  if (editingUnterkunftId) {
    formContainer.appendChild(renderUnterkunftForm(trip, () => renderUnterkuenfte(el, trip)));
    if (editingUnterkunftId !== "__neu__") {
      const existing = trip.unterkuenfte.find((u) => u.id === editingUnterkunftId);
      if (existing) {
        formContainer.appendChild(renderUnterkunftAdressenListe(existing, () => renderUnterkuenfte(el, trip)));
        formContainer.appendChild(renderUnterkunftEinkaufsliste(existing, () => renderUnterkuenfte(el, trip)));
      }
    }
  }
}

function renderUnterkunftForm(trip, onChange) {
  const isNew = editingUnterkunftId === "__neu__";
  const existing = isNew ? null : trip.unterkuenfte.find((u) => u.id === editingUnterkunftId);
  const u = existing || {
    name: "", adresse: "", plzOrt: "", land: "", naviAdresse: "", von: "", bis: "", checkin: "", checkout: "",
    buchungsnummer: "", vermieterName: "", telefon: "", email: "", zugangscode: "",
    wlanName: "", wlanPasswort: "",
    linkGoogleMaps: "", linkWebseite: "", linkBooking: "", linkAirbnb: "", linkSonstiges: "",
    notizen: "", etappeId: "",
  };

  const form = document.createElement("form");
  form.className = "field-form panel";
  form.innerHTML = `
    <label><span><i class="ti ti-id"></i> Name</span><input type="text" name="name" value="${escapeHtml(u.name)}" placeholder="z. B. Chalet Alpenblick" required /></label>
    ${(trip.etappen && trip.etappen.length) ? `
    <label><span><i class="ti ti-route"></i> Etappe</span>
      <select name="etappeId">
        <option value="">Keine Etappe</option>
        ${trip.etappen.map((e) => `<option value="${escapeHtml(e.id)}" ${u.etappeId === e.id ? "selected" : ""}>${escapeHtml(etappenLabel(trip, e))}</option>`).join("")}
      </select>
    </label>` : ""}
    <div class="field-row">
      <label><span><i class="ti ti-calendar-event"></i> Von</span><input type="date" name="von" value="${escapeHtml(u.von)}" /></label>
      <label><span><i class="ti ti-calendar-event"></i> Bis</span><input type="date" name="bis" value="${escapeHtml(u.bis)}" /></label>
    </div>
    <div class="field-row">
      <label><span><i class="ti ti-login"></i> Check-in</span><input type="text" name="checkin" value="${escapeHtml(u.checkin)}" placeholder="z. B. ab 15:00" /></label>
      <label><span><i class="ti ti-logout"></i> Check-out</span><input type="text" name="checkout" value="${escapeHtml(u.checkout)}" placeholder="z. B. bis 10:00" /></label>
    </div>
    <label><span><i class="ti ti-map-pin"></i> Strasse / Nr.</span><input type="text" name="adresse" value="${escapeHtml(u.adresse)}" /></label>
    <div class="field-row">
      <label><span><i class="ti ti-map-pin"></i> PLZ / Ort</span><input type="text" name="plzOrt" value="${escapeHtml(u.plzOrt)}" /></label>
      <label><span><i class="ti ti-map-pin"></i> Land</span><input type="text" name="land" value="${escapeHtml(u.land)}" /></label>
    </div>
    <label><span><i class="ti ti-navigation"></i> Navi-Adresse (falls abweichend)</span><input type="text" name="naviAdresse" value="${escapeHtml(u.naviAdresse || "")}" placeholder="z. B. bei abgelegenen Chalets/Höfen - was man wirklich ins Navi eintippt" /></label>
    <div class="field-row">
      <label><span><i class="ti ti-user"></i> Vermieter (Name)</span><input type="text" name="vermieterName" value="${escapeHtml(u.vermieterName)}" /></label>
      <label><span><i class="ti ti-phone"></i> Telefon</span><input type="text" name="telefon" value="${escapeHtml(u.telefon)}" /></label>
    </div>
    <div class="field-row">
      <label><span><i class="ti ti-mail"></i> E-Mail</span><input type="email" name="email" value="${escapeHtml(u.email)}" /></label>
      <label><span><i class="ti ti-hash"></i> Buchungsnr.</span><input type="text" name="buchungsnummer" value="${escapeHtml(u.buchungsnummer)}" /></label>
    </div>
    <label><span><i class="ti ti-key"></i> Zugangscode / Schlüsselübergabe</span><input type="text" name="zugangscode" value="${escapeHtml(u.zugangscode)}" /></label>
    <div class="field-row">
      <label><span><i class="ti ti-wifi"></i> WLAN-Name</span><input type="text" name="wlanName" value="${escapeHtml(u.wlanName)}" /></label>
      <label><span><i class="ti ti-key"></i> WLAN-Passwort</span><input type="text" name="wlanPasswort" value="${escapeHtml(u.wlanPasswort)}" /></label>
    </div>
    <p class="hint-small" style="margin-bottom:2px">🔗 Links</p>
    <label><span><i class="ti ti-map"></i> Google Maps</span><input type="url" name="linkGoogleMaps" value="${escapeHtml(u.linkGoogleMaps)}" placeholder="https://..." /></label>
    <label><span><i class="ti ti-link"></i> Webseite / Inserat</span><input type="url" name="linkWebseite" value="${escapeHtml(u.linkWebseite)}" placeholder="https://..." /></label>
    <div class="field-row">
      <label><span><i class="ti ti-link"></i> Booking.com</span><input type="url" name="linkBooking" value="${escapeHtml(u.linkBooking)}" placeholder="https://..." /></label>
      <label><span><i class="ti ti-link"></i> Airbnb</span><input type="url" name="linkAirbnb" value="${escapeHtml(u.linkAirbnb)}" placeholder="https://..." /></label>
    </div>
    <label><span><i class="ti ti-dots"></i> Sonstiges</span><input type="url" name="linkSonstiges" value="${escapeHtml(u.linkSonstiges)}" placeholder="https://..." /></label>
    <label><span><i class="ti ti-message-2"></i> Bemerkung</span><textarea name="notizen" rows="2">${escapeHtml(u.notizen)}</textarea></label>
    <div class="form-actions">
      <button type="submit"><i class="ti ti-check"></i> Speichern</button>
      <button type="button" id="cancel-unterkunft" class="secondary">Abbrechen</button>
      ${existing ? `<button type="button" id="delete-unterkunft" class="danger"><i class="ti ti-trash"></i></button>` : ""}
    </div>
  `;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const values = Object.fromEntries(fd.entries());
    if (isNew) {
      trip.unterkuenfte.push({
        id: "u" + Date.now() + Math.random().toString(36).slice(2, 6),
        adressenInDerNaehe: [],
        einkauf: [],
        ...values,
      });
    } else {
      Object.assign(existing, values);
    }
    saveChange();
    editingUnterkunftId = null;
    onChange();
  });

  form.querySelector("#cancel-unterkunft").onclick = () => {
    editingUnterkunftId = null;
    onChange();
  };

  const deleteBtn = form.querySelector("#delete-unterkunft");
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      if (!confirm(`"${existing.name}" wirklich löschen?`)) return;
      trip.unterkuenfte = trip.unterkuenfte.filter((x) => x.id !== existing.id);
      saveChange();
      editingUnterkunftId = null;
      onChange();
    };
  }

  return form;
}

/** Sub-Liste "Nützliche Adressen in der Nähe" (Supermarkt, Apotheke, Arzt, ...)
 *  - pro Unterkunft, direkt auf dem Objekt gespeichert (keine eigene Ferien-weite
 *  Liste), analog zum Excel-Master. */
function renderUnterkunftAdressenListe(u, onChange) {
  u.adressenInDerNaehe = u.adressenInDerNaehe || [];
  const section = document.createElement("section");
  section.className = "panel";
  section.innerHTML = `<h3 style="margin-top:0">📍 Nützliche Adressen in der Nähe</h3>`;
  const list = document.createElement("div");
  if (!u.adressenInDerNaehe.length) {
    list.innerHTML = `<p class="hint-empty">Noch keine Adressen erfasst.</p>`;
  }
  u.adressenInDerNaehe.forEach((a) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <span style="flex:1">
        <strong>${escapeHtml(a.was || "Adresse")}</strong>${a.name ? `: ${escapeHtml(a.name)}` : ""}
        ${a.adresse ? `<br /><span class="hint-small" style="margin:0">${escapeHtml(a.adresse)}</span>` : ""}
        ${a.link ? `<br /><a href="${escapeHtml(a.link)}" target="_blank" rel="noopener" class="hint-small">Link</a>` : ""}
        ${a.bemerkung ? `<br /><span class="hint-small" style="margin:0">${escapeHtml(a.bemerkung)}</span>` : ""}
      </span>
    `;
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "icon-btn danger";
    delBtn.innerHTML = `<i class="ti ti-trash"></i>`;
    delBtn.onclick = () => {
      u.adressenInDerNaehe = u.adressenInDerNaehe.filter((x) => x.id !== a.id);
      saveChange();
      onChange();
    };
    row.appendChild(delBtn);
    list.appendChild(row);
  });
  section.appendChild(list);

  const form = document.createElement("form");
  form.className = "add-form";
  form.style.flexWrap = "wrap";
  form.innerHTML = `
    <select name="was" style="max-width:160px">
      <option value="Supermarkt">Supermarkt</option>
      <option value="Apotheke">Apotheke</option>
      <option value="Arzt / Notfallpraxis">Arzt / Notfallpraxis</option>
      <option value="Restaurant-Tipp">Restaurant-Tipp</option>
      <option value="Bäckerei">Bäckerei</option>
      <option value="Sonstiges">Sonstiges</option>
    </select>
    <input type="text" name="name" placeholder="Name" />
    <input type="text" name="adresse" placeholder="Adresse" />
    <input type="url" name="link" placeholder="Link" />
    <button type="submit"><i class="ti ti-plus"></i></button>
  `;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const values = Object.fromEntries(fd.entries());
    if (!values.name && !values.adresse) return;
    u.adressenInDerNaehe.push({ id: "adr" + Date.now() + Math.random().toString(36).slice(2, 6), bemerkung: "", ...values });
    saveChange();
    onChange();
  });
  section.appendChild(form);

  return section;
}

/** Sub-Liste "Einkauf & Vorräte" - pro Unterkunft eine eigene Einkaufsliste
 *  mit Abhak-Status (ok), analog zum Excel-Master. */
function renderUnterkunftEinkaufsliste(u, onChange) {
  u.einkauf = u.einkauf || [];
  const section = document.createElement("section");
  section.className = "panel";
  section.innerHTML = `<h3 style="margin-top:0">🛒 Einkauf &amp; Vorräte</h3>`;
  const list = document.createElement("div");
  if (!u.einkauf.length) {
    list.innerHTML = `<p class="hint-empty">Noch nichts auf der Einkaufsliste.</p>`;
  }
  u.einkauf.forEach((a) => {
    const row = document.createElement("div");
    row.className = "item-row" + (a.ok ? " done" : "");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!a.ok;
    cb.addEventListener("change", () => { a.ok = cb.checked; saveChange(); onChange(); });
    row.appendChild(cb);
    const span = document.createElement("span");
    span.style.flex = "1";
    span.innerHTML = `${escapeHtml(a.was || "")}${a.menge ? ` <span class="hint-small">(${escapeHtml(a.menge)})</span>` : ""}${a.wo ? `<br /><span class="hint-small" style="margin:0">${escapeHtml(a.wo)}</span>` : ""}${a.bemerkung ? `<br /><span class="hint-small" style="margin:0">${escapeHtml(a.bemerkung)}</span>` : ""}`;
    row.appendChild(span);
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "icon-btn danger";
    delBtn.innerHTML = `<i class="ti ti-trash"></i>`;
    delBtn.onclick = () => {
      u.einkauf = u.einkauf.filter((x) => x.id !== a.id);
      saveChange();
      onChange();
    };
    row.appendChild(delBtn);
    list.appendChild(row);
  });
  section.appendChild(list);

  const form = document.createElement("form");
  form.className = "add-form";
  form.style.flexWrap = "wrap";
  form.innerHTML = `
    <input type="text" name="was" placeholder="Was?" required />
    <input type="text" name="menge" placeholder="Menge" style="max-width:90px" />
    <input type="text" name="wo" placeholder="Wo besorgen?" style="max-width:130px" />
    <button type="submit"><i class="ti ti-plus"></i></button>
  `;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const values = Object.fromEntries(fd.entries());
    if (!values.was) return;
    u.einkauf.push({ id: "ek" + Date.now() + Math.random().toString(36).slice(2, 6), ok: false, bemerkung: "", ...values });
    saveChange();
    onChange();
  });
  section.appendChild(form);

  return section;
}

// ===========================================================
// ETAPPEN (mehrere Destinationen innerhalb derselben Ferien)
// ===========================================================

function renderEtappen(el, trip) {
  trip.etappen = trip.etappen || [];

  const cardGrid = document.getElementById("etappen-cards");
  if (!cardGrid) return;
  cardGrid.innerHTML = "";

  if (trip.etappen.length === 0) {
    cardGrid.innerHTML = `<p class="hint-empty">Noch keine Etappen erfasst - die ganze Ferien gilt als eine Destination.</p>`;
  }

  trip.etappen.forEach((etp) => {
    const card = document.createElement("button");
    card.className = "unterkunft-card";
    const zeitraum = [etp.von ? formatDate(etp.von) : "", etp.bis ? formatDate(etp.bis) : ""].filter(Boolean).join(" – ");
    card.innerHTML = `
      <p class="u-name"><i class="ti ti-map-pin"></i>${escapeHtml(etappenLabel(trip, etp))}</p>
      ${zeitraum ? `<p class="u-dates">${escapeHtml(zeitraum)}</p>` : ""}
    `;
    card.onclick = () => {
      editingEtappeId = etp.id;
      renderEtappen(el, trip);
    };
    cardGrid.appendChild(card);
  });

  const addBtn = document.createElement("button");
  addBtn.className = "secondary";
  addBtn.innerHTML = `<i class="ti ti-plus"></i> Neue Etappe`;
  addBtn.onclick = () => {
    editingEtappeId = "__neu__";
    renderEtappen(el, trip);
  };
  cardGrid.appendChild(addBtn);

  const formContainer = document.getElementById("etappen-form-container");
  formContainer.innerHTML = "";
  if (editingEtappeId) {
    formContainer.appendChild(renderEtappeForm(trip, () => renderEtappen(el, trip)));
  }
}

function renderEtappeForm(trip, onChange) {
  const isNew = editingEtappeId === "__neu__";
  const existing = isNew ? null : trip.etappen.find((e) => e.id === editingEtappeId);
  const etp = existing || { titel: "", von: "", bis: "" };

  const form = document.createElement("form");
  form.className = "field-form panel";
  form.innerHTML = `
    <label><span><i class="ti ti-heading"></i> Titel</span><input type="text" name="titel" value="${escapeHtml(etp.titel)}" placeholder="z. B. Zermatt" required /></label>
    <div class="field-row">
      <label><span><i class="ti ti-calendar-event"></i> Von</span><input type="date" name="von" value="${escapeHtml(etp.von)}" /></label>
      <label><span><i class="ti ti-calendar-event"></i> Bis</span><input type="date" name="bis" value="${escapeHtml(etp.bis)}" /></label>
    </div>
    <div class="form-actions">
      <button type="submit"><i class="ti ti-check"></i> Speichern</button>
      <button type="button" id="cancel-etappe" class="secondary">Abbrechen</button>
      ${existing ? `<button type="button" id="delete-etappe" class="danger"><i class="ti ti-trash"></i></button>` : ""}
    </div>
  `;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const values = Object.fromEntries(fd.entries());
    if (isNew) {
      trip.etappen.push({
        id: "etp" + Date.now() + Math.random().toString(36).slice(2, 6),
        ...values,
      });
    } else {
      Object.assign(existing, values);
    }
    saveChange();
    editingEtappeId = null;
    onChange();
  });

  form.querySelector("#cancel-etappe").onclick = () => {
    editingEtappeId = null;
    onChange();
  };

  const deleteBtn = form.querySelector("#delete-etappe");
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      if (!confirm(`Etappe "${existing.titel}" wirklich löschen? Zuordnungen bei Unterkünften/Ideen zu dieser Etappe werden dabei ebenfalls entfernt.`)) return;
      trip.etappen = trip.etappen.filter((x) => x.id !== existing.id);
      (trip.unterkuenfte || []).forEach((u) => { if (u.etappeId === existing.id) u.etappeId = ""; });
      (trip.ideen || []).forEach((i) => { if (Array.isArray(i.etappenIds)) i.etappenIds = i.etappenIds.filter((id) => id !== existing.id); });
      saveChange();
      editingEtappeId = null;
      onChange();
    };
  }

  return form;
}

function createNewTrip() {
  const titel = prompt("Name der neuen Ferien (z. B. 'Herbstferien 2026 Tessin'):");
  if (!titel) return;

  const data = getData();
  const id = titel.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now();

  // Packliste und To-Do werden aus dem zentralen Katalog / der Standard-Vorlage
  // vorbefüllt (wie im Excel-Master), gefiltert nach Merkmalen läuft danach
  // automatisch über itemVisible() weiter - so ist keine Ferien mehr "leer".
  const katalog = ensureArtikelDatenbank();
  const packliste = katalog.map((a, i) => ({
    id: "i" + Date.now() + Math.random().toString(36).slice(2, 6) + i,
    text: a.text,
    erledigt: false,
    kategorie: a.kategorie || "Allgemein",
    sort: i,
    ...(a.merkmale && a.merkmale.length ? { nurWenn: a.merkmale } : {}),
    ...(a.prioritaet ? { prioritaet: true } : {}),
  }));
  const todo = ensureTodoVorlage().map((t, i) => ({
    id: "i" + Date.now() + Math.random().toString(36).slice(2, 6) + "t" + i,
    text: t.text,
    erledigt: false,
    kategorie: t.kategorie || "Allgemein",
    sort: i,
    ...(t.merkmale && t.merkmale.length ? { nurWenn: t.merkmale } : {}),
    ...(t.prioritaet ? { prioritaet: true } : {}),
  }));

  data.ferien.push({
    id,
    titel,
    von: "",
    bis: "",
    merkmale: {},
    packliste,
    todo,
    unterkuenfte: [],
    etappen: [],
    programm: [],
    tagesplan: [],
    ideen: [],
    programmMigriert: true,
    finanzen: [],
  });
  saveChange();
  setCurrentTrip(id);
  render();
}

/** Liest die Merkmal-Definitionen aus den Daten (falls der Nutzer sie über
 *  "Merkmale verwalten" bereits angepasst hat), sonst die fest im Code
 *  hinterlegten Standard-Merkmale (MERKMALE_DEFS aus config.js). */
function getMerkmaleDefs() {
  const data = getData();
  if (data && data.merkmaleDefs && data.merkmaleDefs.length) return data.merkmaleDefs;
  return MERKMALE_DEFS;
}

/** Stellt sicher, dass die Merkmal-Liste in den Daten existiert (einmalig
 *  aus den Standardwerten kopiert), damit sie bearbeitbar wird. Führt
 *  ausserdem einmalig die Migration auf die neue, nach Überbegriffen
 *  gruppierte Merkmale-Liste durch (1:1 nach Excel-Master). Alte,
 *  inzwischen nicht mehr existierende Schlüssel an bestehenden Ferien
 *  bleiben als ungenutzte Daten liegen, werden aber nirgends mehr
 *  angezeigt (Fokus liegt auf zukünftigen Ferien, nicht auf der
 *  Bereinigung alter Daten). */
function ensureMerkmaleDefs() {
  const data = getData();
  if (!data.merkmaleDefsV2) {
    data.merkmaleDefs = MERKMALE_DEFS.map((m) => ({ ...m }));
    data.merkmaleDefsV2 = true;
    saveChange();
  } else if (!data.merkmaleDefs || !data.merkmaleDefs.length) {
    data.merkmaleDefs = MERKMALE_DEFS.map((m) => ({ ...m }));
  } else {
    // Label/Icon/Gruppe/Reihenfolge der Standard-Merkmale mit dem Code
    // synchron halten (z. B. Umbenennungen, neue Merkmale, geänderte
    // Gruppierung/Reihenfolge) - eigene, zusätzliche Merkmale (Keys, die
    // nicht im Code vorkommen) bleiben unangetastet und werden ans Ende
    // angehängt.
    const standardKeys = new Set(MERKMALE_DEFS.map((m) => m.key));
    const eigene = data.merkmaleDefs.filter((m) => !standardKeys.has(m.key));
    const neueListe = [...MERKMALE_DEFS.map((m) => ({ ...m })), ...eigene];
    const alt = JSON.stringify(data.merkmaleDefs);
    const neu = JSON.stringify(neueListe);
    if (alt !== neu) {
      data.merkmaleDefs = neueListe;
      saveChange();
    }
  }
  return data.merkmaleDefs;
}

// Korrigiert fehlerhafte Merkmal-Schlüssel, die in früheren Versionen der
// Standard-Artikel-/To-Do-Vorlagen fälschlich verwendet wurden (z. B. "kinder"
// statt "mitkindern") und dadurch in echten Trip-/Katalogdaten "hängen
// geblieben" sind. Ohne diese Migration blieben betroffene Artikel (u. a.
// die ganze Kinder- und Hund-Kategorie) dauerhaft unsichtbar, da der
// jeweilige Schlüssel nie mit einem echten, auswählbaren Merkmal übereinstimmt.
function migrateFehlerhafteMerkmalSchluessel() {
  const data = getData();
  if (data.merkmalSchluesselFixV1) return;

  const mapping = {
    kinder: "mitkindern",
    baby: "mitbabykleinkind",
    haustier: "mithund",
    flug: "flugzeug",
    wasser: "strand",
  };

  function fixListe(liste) {
    if (!Array.isArray(liste)) return false;
    let changed = false;
    liste.forEach((item) => {
      if (Array.isArray(item.merkmale)) {
        const neu = item.merkmale.map((k) => mapping[k] || k);
        if (neu.some((k, i) => k !== item.merkmale[i])) {
          item.merkmale = neu;
          changed = true;
        }
      }
    });
    return changed;
  }

  function fixNurWenn(liste) {
    if (!Array.isArray(liste)) return false;
    let changed = false;
    liste.forEach((item) => {
      if (Array.isArray(item.nurWenn)) {
        const neu = item.nurWenn.map((k) => mapping[k] | k);
        if (neu.some((k, i) => k !== item.nurWenn[i])) {
          item.nurWenn = neu;
          changed = true;
        }
      }
    });
    return changed;
  }

  let changed = false;
  if (fixListe(data.artikelDatenbank)) changed = true;
  if (fixListe(data.todoVorlage)) changed = true;
  (data.ferien || []).forEach((trip) => {
    if (fixNurWenn(trip.packliste)) changed = true;
    if (fixNurWenn(trip.todo)) changed = true;
  });

  data.merkmalSchluesselFixV1 = true;
  saveChange();
}

// Einmaliger Reset aller Prio-Markierungen (auf Nutzerwunsch, da sich durch
// einen früheren Darstellungsfehler - Prio-Icon im Dunkelmodus praktisch
// unsichtbar - vermutlich ungewollt viele Prio-Flags angesammelt haben).
function einmaligAllePrioritaetenZuruecksetzen() {
  const data = getData();
  // V2: erneuter einmaliger Reset, da sich durch den "ti-flag-filled"-Bug
  // (ungueltige Icon-Klasse liess das Flaggen-Icon beim Markieren verschwinden)
  // vermutlich weiterhin ungewollte Prio-Markierungen angesammelt haben.
  if (data.prioResetV2) return;
  (data.ferien || []).forEach((trip) => {
    (trip.packliste || []).forEach((item) => { item.prioritaet = false; });
    (trip.todo || []).forEach((item) => { item.prioritaet = false; });
  });
  data.prioResetV1 = true;
  data.prioResetV2 = true;
  saveChange();
}

// Einmalige Erstbefüllung: alle bestehenden Artikel-DB- und ToDo-Vorlage-
// Einträge erhalten den Status "Check offen", damit man sie einzeln einmal
// durchgehen und bei Bedarf korrigieren kann (Merkmale/Bemerkungen/Kategorien).
// Neue Einträge erhalten den Status direkt bei der Erfassung (siehe
// renderArtikelForm / die "Fix"-Schnellerfassung in Packliste/Reisetag).
function einmaligCheckStatusSetzen() {
  const data = getData();
  if (data.checkStatusInitV1) return;
  ensureArtikelDatenbank().forEach((a) => { if (a.check === undefined) a.check = "offen"; });
  ensureTodoVorlage().forEach((v) => { if (v.check === undefined) v.check = "offen"; });
  data.checkStatusInitV1 = true;
  saveChange();
}

/** true, wenn ein Artikel-DB-/ToDo-Vorlage-Eintrag noch nicht geprüft wurde
 *  ("Check offen"). Fehlt das Feld (sollte nach der Migration nicht mehr
 *  vorkommen), gilt der Eintrag sicherheitshalber ebenfalls als offen. */
function istCheckOffen(entry) {
  return !entry || entry.check !== "erledigt";
}

/** Formatiert das Datum der letzten Prüfung kurz fürs Popup. */
function formatCheckDatum(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("de-CH");
}

/** true, wenn eine Ferien bereits vorbei ist (Ende-Datum in der Vergangenheit).
 *  Für vergangene Ferien werden die Check-Badges nicht mehr angezeigt, da
 *  eine nachträgliche Prüfung dort keinen Mehrwert mehr bringt. */
function istFerienVorbei(trip) {
  if (!trip || !trip.bis) return false;
  const today = new Date(new Date().toDateString());
  return new Date(trip.bis) < today;
}

/** Bekannte Gruppen-Überbegriffe in der Reihenfolge des Excel-Masters
 *  (für die Gruppen-Auswahl im "Neues Merkmal"-Formular). */
function bekannteMerkmalGruppen() {
  const seen = [];
  MERKMALE_DEFS.forEach((m) => { if (!seen.includes(m.gruppe)) seen.push(m.gruppe); });
  return seen;
}

/** Bündelt eine flache Merkmal-Liste (ggf. nutzerangepasst) nach ihrem
 *  "gruppe"-Feld, damit sie wie im Excel-Master mit Überbegriffen
 *  angezeigt werden kann. Merkmale ohne bekannte Gruppe (z. B. selbst
 *  angelegte) landen gesammelt in "✨ Weitere". */
function groupMerkmale(defs) {
  const groups = [];
  const byName = {};
  defs.forEach((m) => {
    const gruppe = m.gruppe || "✨ Weitere";
    if (!byName[gruppe]) {
      byName[gruppe] = { gruppe, items: [] };
      groups.push(byName[gruppe]);
    }
    byName[gruppe].items.push(m);
  });
  return groups;
}

/** Stellt sicher, dass der zentrale Artikel-Katalog existiert - beim allerersten
 *  Öffnen wird er aus dem im Excel-Master gepflegten Standard-Katalog befüllt
 *  (DEFAULT_ARTIKEL_DATENBANK aus config.js), danach ist er frei bearbeitbar. */
/** Liefert die Kategorien eines Artikels als Array - unterstützt sowohl das
 *  alte einzelne "kategorie"-Feld als auch das neue "kategorien"-Array
 *  (Mehrfachkategorien), damit ein Artikel z. B. gleichzeitig unter
 *  "Gesundheit" und "Kind" auftauchen kann. */
function getArtikelKategorien(a) {
  if (Array.isArray(a.kategorien) && a.kategorien.length) return a.kategorien;
  return [a.kategorie || "Allgemein"];
}

function ensureArtikelDatenbank() {
  const data = getData();
  if (!data.artikelDatenbank || !data.artikelDatenbank.length) {
    data.artikelDatenbank = DEFAULT_ARTIKEL_DATENBANK.map((a, i) => ({
      id: "art-default-" + i,
      kategorie: a.kategorie,
      text: a.text,
      bemerkung: a.bemerkung || "",
      merkmale: [...(a.merkmale || [])],
    }));
  }
  return data.artikelDatenbank;
}

/** Stellt sicher, dass die zentrale To-Do-Vorlage existiert - beim allerersten
 *  Zugriff wird sie aus der im Code hinterlegten Standard-Vorlage befüllt
 *  (DEFAULT_TODO_VORLAGE aus config.js), danach ist sie frei erweiterbar
 *  (z. B. durch "fix" markierte, manuell erfasste To-Dos). */
function ensureTodoVorlage() {
  const data = getData();
  if (!data.todoVorlage || !data.todoVorlage.length) {
    data.todoVorlage = DEFAULT_TODO_VORLAGE.map((t, i) => ({
      id: "tv-default-" + i,
      kategorie: t.kategorie,
      text: t.text,
      merkmale: [...(t.merkmale || [])],
    }));
  }
  return data.todoVorlage;
}

/** Füllt Packliste/To-Do einer Ferien aus dem zentralen Katalog bzw. der
 *  Standard-Vorlage, falls die Liste noch ganz leer ist. Das greift nicht nur
 *  bei ganz neuen Ferien (die werden schon in createNewTrip() befüllt),
 *  sondern auch bei älteren, schon vorher angelegten Ferien, deren Packliste/
 *  To-Do noch nie befüllt wurde - z. B. weil sie vor diesem Update entstanden
 *  sind oder nie erfolgreich synchronisiert wurden. */
function seedListFromKatalogIfEmpty(trip, key) {
  if (trip[key] && trip[key].length) return;
  if (key === "packliste") {
    const katalog = ensureArtikelDatenbank();
    if (!katalog.length) return;
    trip.packliste = katalog.map((a, i) => ({
      id: "i" + Date.now() + Math.random().toString(36).slice(2, 6) + i,
      text: a.text,
      erledigt: false,
      kategorie: a.kategorie || "Allgemein",
      sort: i,
      ...(a.merkmale && a.merkmale.length ? { nurWenn: a.merkmale } : {}),
      ...(a.prioritaet ? { prioritaet: true } : {}),
    }));
    saveChange();
  } else if (key === "todo") {
    trip.todo = ensureTodoVorlage().map((t, i) => ({
      id: "i" + Date.now() + Math.random().toString(36).slice(2, 6) + "t" + i,
      text: t.text,
      erledigt: false,
      kategorie: t.kategorie || "Allgemein",
      sort: i,
      ...(t.merkmale && t.merkmale.length ? { nurWenn: t.merkmale } : {}),
      ...(t.prioritaet ? { prioritaet: true } : {}),
    }));
    saveChange();
  }
}

// ===========================================================
// TAB: PACKLISTE / TO-DO (kategorisierte Liste mit Filtern)
// ===========================================================

function renderListTab(el, trip, key, icon, placeholder) {
  seedListFromKatalogIfEmpty(trip, key);
  const items = trip[key];
  const statusItems = items.filter((i) => itemVisible(i, trip) && matchesFilter(i, filterMode[key], trip));
  const katOptionen = [...new Set(statusItems.map((i) => i.kategorie || "Allgemein"))].sort((a, b) => a.localeCompare(b, "de"));
  const terminWerte = [...new Set(statusItems.filter((i) => i.termin !== undefined && i.termin !== null && i.termin !== "").map((i) => Number(i.termin)))].sort((a, b) => a - b);
  if (kategorieFilter[key] !== "alle" && !katOptionen.includes(kategorieFilter[key])) kategorieFilter[key] = "alle";
  if (terminFilter[key] !== "alle" && terminFilter[key] !== "ohne" && terminFilter[key] !== "ueberfaellig" && !terminWerte.includes(Number(String(terminFilter[key]).slice(2)))) terminFilter[key] = "alle";
  const terminOk = (i) => {
    const tf = terminFilter[key];
    if (tf === "alle" || key !== "todo") return true;
    const hat = i.termin !== undefined && i.termin !== null && i.termin !== "";
    if (tf === "ohne") return !hat;
    if (tf === "ueberfaellig") return hat && !i.erledigt && !i.nichtRelevant && Number(i.termin) < (trip ? computeTodayOffset(trip) : 0);
    return hat && Number(i.termin) === Number(tf.slice(2));
  };
  const relevant = statusItems.filter((i) => terminOk(i) && (kategorieFilter[key] === "alle" || (i.kategorie || "Allgemein") === kategorieFilter[key]));
  const filterChip = (typ, val, label, aktiv) => '<button type="button" class="chip filter-chip' + (aktiv ? " active" : "") + '" data-ftype="' + typ + '" data-fval="' + encodeURIComponent(val) + '">' + label + '</button>';
  const katChips = [filterChip("kat", "alle", "Alle", kategorieFilter[key] === "alle"), ...katOptionen.map((k) => filterChip("kat", k, '<i class="ti ' + categoryIcon(k) + '"></i>' + escapeHtml(k), kategorieFilter[key] === k))].join("");
  const terminChips = key === "todo"
    ? [filterChip("termin", "alle", "Alle", terminFilter[key] === "alle"), filterChip("termin", "ueberfaellig", '<i class="ti ti-alarm"></i>Überfällig', terminFilter[key] === "ueberfaellig"), filterChip("termin", "ohne", "Kein Termin", terminFilter[key] === "ohne"), ...terminWerte.map((n) => filterChip("termin", "t:" + n, escapeHtml(formatTermin(n)), terminFilter[key] === "t:" + n))].join("")
    : "";
  const filterAktiv = terminFilter[key] !== "alle" || kategorieFilter[key] !== "alle";
  const isTodo = key === "todo";
  const mode = groupBy[key];

  const groups = groupItems(relevant, mode, sortMode[key]);
  const collapsePrefix = key + ":" + mode + ":";
  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(collapsePrefix + g.name));

  const quickFilters = isTodo
    ? [
        { value: "offen", label: "Offene", icon: "ti-circle-dashed" },
        { value: "prioritaet", label: "Prio", icon: "ti-flag" },
        { value: "ueberfaellig", label: "Überfällig", icon: "ti-alarm" },
        { value: "kuerzlich", label: "Kürzlich erledigt", icon: "ti-history" },
        { value: "alle", label: "Alle", icon: "ti-list" },
      ]
    : [
        { value: "offen", label: "Offene", icon: "ti-circle-dashed" },
        { value: "prioritaet", label: "Prio", icon: "ti-flag" },
        { value: "kuerzlich", label: "Kürzlich erledigt", icon: "ti-history" },
        { value: "alle", label: "Alle", icon: "ti-list" },
      ];

  el.innerHTML = `
    ${quickFilters.length ? `
    <div class="quick-filter-row">
      ${quickFilters.map((f) => `<button type="button" class="quick-filter-btn${filterMode[key] === f.value ? " active" : ""}" data-filter="${f.value}"><i class="ti ${f.icon}"></i> ${f.label}</button>`).join("")}
    </div>` : ""}
    <details class="filter-details"${filterAktiv ? " open" : ""}>
      <summary><i class="ti ti-filter"></i> Filter nach ${key === "todo" ? "Termin und " : ""}Kategorie${filterAktiv ? " (aktiv)" : ""}</summary>
      ${key === "todo" ? `<div class="filter-level"><span class="filter-level-title"><i class="ti ti-calendar-event"></i> Termin</span><div class="chip-row">${terminChips}</div></div>` : ""}
      <div class="filter-level"><span class="filter-level-title"><i class="ti ti-tag"></i> Kategorie</span><div class="chip-row">${katChips}</div></div>
    </details>
    <p class="hint-small" style="margin:4px 0">Total: ${relevant.length}</p>
    <div class="list-toolbar">
      <select id="filter-select" title="Status-Filter">
        <option value="offen"${filterMode[key] === "offen" ? " selected" : ""}>Offen</option>
        <option value="erledigt"${filterMode[key] === "erledigt" ? " selected" : ""}>Erledigt</option>
        <option value="kuerzlich"${filterMode[key] === "kuerzlich" ? " selected" : ""}>Kürzlich erledigt</option>
        <option value="nichtRelevant"${filterMode[key] === "nichtRelevant" ? " selected" : ""}>Nicht relevant</option>
        <option value="prioritaet"${filterMode[key] === "prioritaet" ? " selected" : ""}>Priorität</option>
        <option value="einmalig"${filterMode[key] === "einmalig" ? " selected" : ""}>Einmalig</option>
        <option value="fix"${filterMode[key] === "fix" ? " selected" : ""}>Fix</option>
        ${isTodo ? `<option value="ueberfaellig"${filterMode[key] === "ueberfaellig" ? " selected" : ""}>Überfällig</option>` : ""}
        <option value="alle"${filterMode[key] === "alle" ? " selected" : ""}>Alle</option>
      </select>
      ${isTodo ? `
      <button id="toggle-group" class="link-button">
        <i class="ti ti-arrows-sort"></i>
        Gruppiert nach ${mode === "termin" ? "Zeitpunkt" : "Kategorie"}
      </button>` : ""}
      <button id="toggle-sort" class="link-button">
        <i class="ti ${sortMode[key] === "az" ? "ti-sort-ascending-letters" : "ti-grip-vertical"}"></i>
        ${sortMode[key] === "az" ? "A-Z" : "Manuell"}
      </button>
      <button id="toggle-collapse-all" class="link-button">
        <i class="ti ${allCollapsed ? "ti-chevrons-down" : "ti-chevrons-up"}"></i>
        Alle ${allCollapsed ? "ausklappen" : "einklappen"}
      </button>
    </div>
    <div class="item-grid-head${isTodo ? " with-termin" : ""}"><span class="h-opts">Optionen</span><span class="h-text">${isTodo ? "To-Do" : "Artikel"}</span>${isTodo ? '<span class="h-termin">Termin</span>' : ""}<span class="h-bem">Bemerkung</span><span class="h-kat">Kategorie</span><span class="h-end"></span></div>
    <div id="cat-container"></div>
    <div id="neuer-eintrag-container"></div>
  `;

  document.querySelectorAll(".quick-filter-btn").forEach((btn) => {
    btn.onclick = () => {
      filterMode[key] = btn.dataset.filter;
      renderListTab(el, trip, key, icon, placeholder);
    };
  });

  document.querySelectorAll(".filter-chip").forEach((b) => {
    b.onclick = () => {
      const v = decodeURIComponent(b.dataset.fval);
      if (b.dataset.ftype === "termin") terminFilter[key] = v;
      else kategorieFilter[key] = v;
      renderListTab(el, trip, key, icon, placeholder);
    };
  });

  document.getElementById("filter-select").onchange = (e) => {
    filterMode[key] = e.target.value;
    renderListTab(el, trip, key, icon, placeholder);
  };

  if (isTodo) {
    document.getElementById("toggle-group").onclick = () => {
      groupBy[key] = mode === "termin" ? "kategorie" : "termin";
      renderListTab(el, trip, key, icon, placeholder);
    };
  }

  document.getElementById("toggle-sort").onclick = () => {
    sortMode[key] = sortMode[key] === "az" ? "manuell" : "az";
    renderListTab(el, trip, key, icon, placeholder);
  };

  document.getElementById("toggle-collapse-all").onclick = () => {
    if (allCollapsed) groups.forEach((g) => collapsed.delete(collapsePrefix + g.name));
    else groups.forEach((g) => collapsed.add(collapsePrefix + g.name));
    renderListTab(el, trip, key, icon, placeholder);
  };

  const catContainer = document.getElementById("cat-container");
  groups.forEach((g) => {
    catContainer.appendChild(renderCategory(trip, key, g.name, g.items, isTodo, () => renderListTab(el, trip, key, icon, placeholder)));
  });

  const rerenderListe = () => renderListTab(el, trip, key, icon, placeholder);
  document.getElementById("neuer-eintrag-container").appendChild(buildNeuerEintragBox({
    key, trip, placeholder, idSuffix: "inline", onAdded: rerenderListe, reload: rerenderListe,
    extraKategorien: groups.map((g) => g.name),
  }));
}

/** Gruppiert Items entweder nach "kategorie" (Text) oder "termin" (Tage vor Abreise),
 *  und sortiert innerhalb jeder Gruppe entweder manuell (item.sort) oder A-Z. */
function groupItems(items, mode, sort) {
  const sortGroup = (list) => {
    if (sort === "az") {
      return [...list].sort((a, b) => a.text.localeCompare(b.text, "de"));
    }
    return [...list].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  };

  if (mode === "termin") {
    const withTermin = items.filter((i) => i.termin !== undefined && i.termin !== null && i.termin !== "");
    const withoutTermin = items.filter((i) => !(i.termin !== undefined && i.termin !== null && i.termin !== ""));
    const terminValues = [...new Set(withTermin.map((i) => Number(i.termin)))].sort((a, b) => a - b);
    const groups = terminValues.map((t) => ({
      name: formatTermin(t),
      items: sortGroup(withTermin.filter((i) => Number(i.termin) === t)),
    }));
    if (withoutTermin.length) groups.push({ name: "Kein Termin", items: sortGroup(withoutTermin) });
    return groups;
  }

  const categories = [...new Set(items.map((i) => i.kategorie || "Allgemein"))];
  const cats = categories.length ? categories : ["Allgemein"];
  return cats.map((c) => ({ name: c, items: sortGroup(items.filter((i) => (i.kategorie || "Allgemein") === c)) }));
}

function renderCategory(trip, listKey, groupName, groupItemsList, showTermin, onChange) {
  const collapseKey = listKey + ":" + groupBy[listKey] + ":" + groupName;
  const isCollapsed = collapsed.has(collapseKey);
  const manualSort = sortMode[listKey] === "manuell";

  const wrap = document.createElement("div");
  wrap.className = "category";

  const header = document.createElement("button");
  header.className = "category-header";
  header.innerHTML = `<span><i class="ti ${categoryIcon(groupName)} category-icon"></i> ${escapeHtml(groupName)} <span class="hint-small" style="margin:0">(${groupItemsList.length})</span></span><i class="ti ti-chevron-${isCollapsed ? "right" : "down"}"></i>`;
  header.onclick = () => {
    if (isCollapsed) collapsed.delete(collapseKey);
    else collapsed.add(collapseKey);
    onChange();
  };
  wrap.appendChild(header);

  if (!isCollapsed) {
    const list = document.createElement("div");
    list.className = "category-items";
    groupItemsList.forEach((item, idx) => {
      list.appendChild(itemRow(trip, listKey, item, showTermin, manualSort, groupItemsList, idx, onChange));
      if (editingReminderId === item.id) list.appendChild(reminderForm(item, onChange));
    });
    wrap.appendChild(list);
  }

  return wrap;
}

function reassignSort(list) {
  list.forEach((item, idx) => { item.sort = idx; });
}

/** Einheitliche Beschriftung für eine Ferien-Etappe: "1: Zermatt" statt nur
 *  "Zermatt" - hilft bei mehreren Etappen, schnell die Reihenfolge zu sehen
 *  (z. B. in Dropdowns, Chips und Karten). */
function etappenLabel(trip, etappe) {
  const idx = (trip.etappen || []).findIndex((e) => e.id === etappe.id);
  const nr = idx >= 0 ? idx + 1 + ": " : "";
  return nr + (etappe.titel || "Ohne Namen");
}

/** Popup für Packliste-Einträge, die mit der Artikel-Datenbank verknüpft
 *  sind: zwei gleichwertige, klar beschriftete Optionen statt eines
 *  confirm()-Dialogs (der eher wie eine Fehlermeldung wirkte und dessen
 *  "Abbrechen" nicht nach einer echten Option klang). */
// Echtes Popup-Formular (statt Browser-prompt()-Kette) zum lokalen
// Bearbeiten eines Packliste-/To-Do-Eintrags - inkl. Bemerkung-Feld, das
// bisher über die prompt()-Dialoge leicht zu übersehen war.
function openLokalBearbeitenModal(item, onChange, listKey) {
  const wrap = document.createElement("div");
  wrap.className = "field-form";
  wrap.innerHTML = `
    <h3><i class="ti ti-pencil"></i> Lokal bearbeiten</h3>
    <p class="hint-small">Gilt nur für diese Ferien.</p>
    <label><span><i class="ti ti-pencil"></i> Text</span><input type="text" id="lokal-edit-text" class="field-emphasized" value="${escapeHtml(item.text)}" /></label>
    <label><span><i class="ti ti-tag"></i> Kategorie</span></label>
    <div id="lokal-edit-kategorie-field"></div>
    <label><span><i class="ti ti-message-2"></i> Bemerkung (gilt nur für diese Ferien, optional)</span><textarea id="lokal-edit-bemerkung" class="field-emphasized" rows="2">${escapeHtml(item.bemerkung || "")}</textarea></label>
    <label class="checkbox-inline"><input type="checkbox" id="lokal-edit-prioritaet" ${item.prioritaet ? "checked" : ""} /> <i class="ti ti-flag"></i> Priorität</label>
    <div class="form-actions">
      <button type="button" id="lokal-edit-save"><i class="ti ti-check"></i> Speichern</button>
      <button type="button" id="lokal-edit-cancel" class="secondary">Abbrechen</button>
      <button type="button" id="lokal-edit-delete" class="danger"><i class="ti ti-trash"></i></button>
    </div>
  `;
  openModal(wrap, () => {});
  const gewaehlteKategorieLDefault = item.kategorie || "Allgemein";
  const trip = getCurrentTrip();
  const katalogL = listKey ? ensureVorlageFuerListKey(listKey) : [];
  const ausListeL = (trip && listKey && trip[listKey]) ? trip[listKey].map((i) => i.kategorie) : [];
  const alleKategorienL = [...katalogL.map((k) => k.kategorie), ...ausListeL];
  wrap.querySelector("#lokal-edit-kategorie-field").innerHTML = kategorieDatalistHtml("lokal-edit-kategorie-neu", alleKategorienL, gewaehlteKategorieLDefault);
  wireKategorieBadges("lokal-edit-kategorie-neu", wrap);
  wrap.querySelector("#lokal-edit-cancel").onclick = () => closeModal();
  wrap.querySelector("#lokal-edit-save").onclick = () => {
    const neuerText = wrap.querySelector("#lokal-edit-text").value.trim();
    const neueBemerkung = wrap.querySelector("#lokal-edit-bemerkung").value.trim();
    const neuePrioritaet = wrap.querySelector("#lokal-edit-prioritaet").checked;
    item.text = neuerText || item.text;
    item.kategorie = (wrap.querySelector("#lokal-edit-kategorie-neu").value || "").trim() || "Allgemein";
    item.bemerkung = neueBemerkung;
    item.prioritaet = neuePrioritaet;
    saveChange();
    closeModal();
    onChange();
  };
  const lokalDeleteBtn = wrap.querySelector("#lokal-edit-delete");
  if (lokalDeleteBtn && trip && listKey) {
    lokalDeleteBtn.onclick = () => {
      const pos = trip[listKey].findIndex((i) => i.id === item.id);
      trip[listKey] = trip[listKey].filter((i) => i.id !== item.id);
      saveChange();
      closeModal();
      onChange();
      showUndoToast('"' + item.text + '" gelöscht', () => {
        trip[listKey].splice(Math.min(Math.max(pos, 0), trip[listKey].length), 0, item);
        saveChange();
        render();
      });
    };
  }
}

function ensureVorlageFuerListKey(listKey) {
  return listKey === "todo" ? ensureTodoVorlage() : ensureArtikelDatenbank();
}

/** Baut eine Kategorie-Chip-Auswahl (Single-Select) in "container": Chips für
 *  alle bekannten Kategorien plus Eingabefeld für eine neue Kategorie. Ruft
 *  bei jeder Auswahl onSelect(neueKategorie) auf - der Aufrufer hält den
 *  aktuellen Wert selbst und ruft diese Funktion zum Neuzeichnen erneut auf. */
function renderKategorieChipsAuswahl(container, alleKategorien, aktuelleKategorie, onSelect) {
  container.innerHTML = "";
  const chipRow = document.createElement("div");
  chipRow.className = "chip-row";
  const sortiert = [...new Set(alleKategorien.filter(Boolean))].sort((x, y) => x.localeCompare(y, "de"));
  sortiert.forEach((kat) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (kat === aktuelleKategorie ? " active" : "");
    chip.innerHTML = `<i class="ti ${categoryIcon(kat)}"></i>${escapeHtml(kat)}`;
    chip.onclick = () => onSelect(kat);
    chipRow.appendChild(chip);
  });
  container.appendChild(chipRow);
}

// Kompaktes Textfeld mit Datalist-Vorschlägen für die Kategorie-Auswahl
// (ersetzt die platzraubende Chip-Reihe bei spontaner Erfassung).
function kategorieDatalistHtml(id, alleKategorien, aktuelleKategorie) {
  const sortiert = [...new Set(alleKategorien.filter(Boolean))].sort((x, y) => x.localeCompare(y, "de"));
  const badges = sortiert.map((k) => `<button type="button" class="chip kategorie-badge-chip" data-kat="${escapeHtml(k)}"><i class="ti ${categoryIcon(k)}"></i>${escapeHtml(k)}</button>`).join("");
  return `<div class="kategorie-feld-wrap">
  <input type="text" id="${id}" placeholder="Kategorie ..." value="${escapeHtml(aktuelleKategorie || "")}" autocomplete="off" />
  <div class="chip-row kategorie-badges-dropdown hidden" id="${id}-badges">${badges}</div>
</div>`;
}

function wireKategorieBadges(id, root) {
  const scope = root || document;
  const input = scope.querySelector ? scope.querySelector("#" + id) : document.getElementById(id);
  const dropdown = scope.querySelector ? scope.querySelector("#" + id + "-badges") : document.getElementById(id + "-badges");
  if (!input || !dropdown) return;
  const show = () => dropdown.classList.remove("hidden");
  const hide = () => dropdown.classList.add("hidden");
  input.addEventListener("focus", show);
  input.addEventListener("click", show);
  input.addEventListener("blur", () => setTimeout(hide, 150));
  dropdown.querySelectorAll(".kategorie-badge-chip").forEach((chip) => {
    chip.addEventListener("mousedown", (e) => {
      e.preventDefault();
      input.value = chip.dataset.kat;
      hide();
    });
  });
}

// Leichtgewichtiges Popup zum Bearbeiten eines To-Do-Vorlage-Eintrags
// (Text/Kategorie) - ein vollständiges To-Do-Formular analog zum
// Artikel-Formular (mit Merkmalen/Bemerkung) ist als eigener Punkt geplant.
function openTodoVorlageEditModal(entry, onSaved, linkedItem) {
  const wrap = document.createElement("div");
  wrap.className = "field-form";
  wrap.innerHTML = `
    <div class="form-actions form-actions-top">
      <button type="button" id="vorlage-edit-save-top"><i class="ti ti-check"></i> Speichern</button>
    </div>
    <h3><i class="ti ti-database"></i> To-Do-Vorlage bearbeiten</h3>
    <p class="hint-small">Gilt für alle Ferien, auch künftige (zentrale To-Do-Vorlage). Änderungen nur für die aktuellen Ferien sind über die lokale Bearbeitung möglich.</p>
    <details class="popup-section" open><summary><i class="ti ti-pencil"></i> Eintrag</summary>
    <label><span><i class="ti ti-pencil"></i> Text</span><input type="text" id="vorlage-edit-text" class="field-emphasized" value="${escapeHtml(entry.text)}" /></label>
    <label><span><i class="ti ti-tag"></i> Kategorie</span></label>
    <div id="vorlage-edit-kategorie-field"></div>
    </details>
    <details class="popup-section" open><summary><i class="ti ti-list-check"></i> Prüfung &amp; Priorität</summary>
    ${entry.spontan ? `<p class="hint-small" style="margin:0 0 4px"><i class="ti ti-sparkles"></i> Spontan über Packliste/Reisetag erfasst - bitte Angaben prüfen und danach "Check erledigt" setzen.</p>` : ""}
    <div class="checkbox-inline-row">
      <label class="checkbox-inline"><input type="checkbox" id="vorlage-edit-check" ${!istCheckOffen(entry) ? "checked" : ""} /> <i class="ti ti-list-check"></i> Check erledigt (geprüft)</label>
      <label class="checkbox-inline"><input type="checkbox" id="vorlage-edit-prioritaet" ${(linkedItem ? linkedItem.prioritaet : entry.prioritaet) ? "checked" : ""} /> <i class="ti ti-flag"></i> Priorität (Standard)</label>
    </div>
    ${entry.checkDatum ? `<p class="hint-small" style="margin:-6px 0 4px">Zuletzt geprüft am ${escapeHtml(formatCheckDatum(entry.checkDatum))}</p>` : ""}
    </details>
    <div class="form-actions">
      <button type="button" id="vorlage-edit-save"><i class="ti ti-check"></i> Speichern</button>
      <button type="button" id="vorlage-edit-duplizieren" class="secondary"><i class="ti ti-copy"></i> Duplizieren</button>
      <button type="button" id="vorlage-edit-cancel" class="secondary">Abbrechen</button>
    </div>
  `;
  openModal(wrap, () => {});
  const gewaehlteKategorieVDefault = entry.kategorie || "Allgemein";
  const alleKategorienV = ensureTodoVorlage().map((e) => e.kategorie);
  wrap.querySelector("#vorlage-edit-kategorie-field").innerHTML = kategorieDatalistHtml("vorlage-edit-kategorie-neu", alleKategorienV, gewaehlteKategorieVDefault);
  wireKategorieBadges("vorlage-edit-kategorie-neu", wrap);
  wrap.querySelector("#vorlage-edit-cancel").onclick = () => closeModal();
  const dupBtnV = wrap.querySelector("#vorlage-edit-duplizieren");
  if (dupBtnV) dupBtnV.onclick = () => {
    const liste = ensureTodoVorlage();
    const kopie = { ...entry, id: "tv" + Date.now() + Math.random().toString(36).slice(2, 6), text: entry.text + " (Kopie)" };
    delete kopie.checkDatum;
    kopie.check = "offen";
    liste.push(kopie);
    saveChange();
    closeModal();
    onSaved();
  };
  const vorlageSaveHandler = () => {
    const neuerText = wrap.querySelector("#vorlage-edit-text").value.trim();
    const neuCheckV = wrap.querySelector("#vorlage-edit-check").checked ? "erledigt" : "offen";
    const neuPrioV = wrap.querySelector("#vorlage-edit-prioritaet").checked;
    const warSchonErledigtV = entry.check === "erledigt";
    entry.text = neuerText || entry.text;
    entry.kategorie = (wrap.querySelector("#vorlage-edit-kategorie-neu").value || "").trim() || "Allgemein";
    entry.check = neuCheckV;
    entry.prioritaet = neuPrioV;
    if (linkedItem) linkedItem.prioritaet = neuPrioV;
    entry.checkDatum = neuCheckV === "erledigt" ? (warSchonErledigtV ? (entry.checkDatum || new Date().toISOString()) : new Date().toISOString()) : (entry.checkDatum || null);
    saveChange();
    closeModal();
    onSaved();
  };
  wrap.querySelector("#vorlage-edit-save").onclick = vorlageSaveHandler;
  const vorlageSaveTopBtn = wrap.querySelector("#vorlage-edit-save-top");
  if (vorlageSaveTopBtn) vorlageSaveTopBtn.onclick = vorlageSaveHandler;
}

function openLocalOderDbChoiceModal(item, onChange, listKey) {
  const vorlageLabel = listKey === "todo" ? "zentralen To-Do-Vorlage" : "zentralen Artikel-Datenbank";
  const wrap = document.createElement("div");
  wrap.className = "choice-modal";
  wrap.innerHTML = `
    <h3><i class="ti ti-link"></i> "${escapeHtml(item.text)}" bearbeiten</h3>
    <p class="hint-small">Dieser Eintrag ist mit der ${vorlageLabel} verknüpft. Wo möchtest du die Änderung vornehmen?</p>
    <div class="choice-modal-options">
      <button type="button" class="choice-option" id="choice-lokal">
        <i class="ti ti-map-pin"></i>
        <span><strong>Nur hier ändern</strong><span class="choice-desc">Gilt nur für diese Ferien - der Vorlage-Eintrag bleibt unverändert.</span></span>
      </button>
      <button type="button" class="choice-option choice-option-secondary" id="choice-db">
        <i class="ti ti-database"></i>
        <span><strong>In der Datenbank bearbeiten</strong><span class="choice-desc">Gilt für alle Ferien, auch künftige.</span></span>
      </button>
      <button type="button" class="choice-option choice-option-danger" id="choice-delete">
        <i class="ti ti-trash"></i>
        <span><strong>Löschen</strong><span class="choice-desc">Entfernt diesen Punkt nur aus dieser Ferien - der Vorlage-Eintrag bleibt erhalten.</span></span>
      </button>
    </div>
  `;
  openModal(wrap, () => {});
  wrap.querySelector("#choice-lokal").onclick = () => {
    openLokalBearbeitenModal(item, onChange, listKey);
  };
  wrap.querySelector("#choice-delete").onclick = () => {
    const trip = getCurrentTrip();
    if (!trip) return;
    const pos = trip[listKey].findIndex((i) => i.id === item.id);
    trip[listKey] = trip[listKey].filter((i) => i.id !== item.id);
    saveChange();
    closeModal();
    onChange();
    showUndoToast('"' + item.text + '" gelöscht', () => {
      trip[listKey].splice(Math.min(Math.max(pos, 0), trip[listKey].length), 0, item);
      saveChange();
      render();
    });
  };
  wrap.querySelector("#choice-db").onclick = () => {
    closeModal();
    const katalog = ensureVorlageFuerListKey(listKey);
    const dbEntry = katalog.find((a) => a.text === item.text);
    if (!dbEntry) return;
    if (listKey === "todo") {
      openTodoVorlageEditModal(dbEntry, onChange, item);
    } else {
      editingArtikelId = dbEntry.id || dbEntry.text;
      openModal(
        renderArtikelForm(katalog, () => { closeModal(); onChange(); }, dbEntry, item),
        () => { editingArtikelId = null; }
      );
    }
  };
}

function itemRow(trip, listKey, item, showTermin, manualSort, siblingList, idx, onChange) {
  const row = document.createElement("div");
  row.className = "item-row" + (item.erledigt ? " done" : "") + (item.nichtRelevant ? " not-relevant" : "") + (item.prioritaet ? " priority" : "") + " item-grid" + (showTermin ? " with-termin" : "");
  const optsCol = document.createElement("div");
  optsCol.className = "item-col-opts";
  row.appendChild(optsCol);

  if (manualSort) {
    const handle = document.createElement("i");
    handle.className = "ti ti-grip-vertical drag-handle";
    optsCol.appendChild(handle);
    row.draggable = true;
    row.addEventListener("dragstart", () => {
      dragState = { id: item.id, list: siblingList };
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => row.classList.remove("dragging"));
    row.addEventListener("dragover", (e) => e.preventDefault());
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      if (!dragState || dragState.list !== siblingList) return;
      const fromIdx = siblingList.findIndex((i) => i.id === dragState.id);
      const toIdx = siblingList.findIndex((i) => i.id === item.id);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
      const [moved] = siblingList.splice(fromIdx, 1);
      siblingList.splice(toIdx, 0, moved);
      reassignSort(siblingList);
      saveChange();
      onChange();
    });

    const moveButtons = document.createElement("div");
    moveButtons.className = "move-buttons";
    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.innerHTML = `<i class="ti ti-chevron-up"></i>`;
    upBtn.disabled = idx === 0;
    upBtn.onclick = () => {
      if (idx === 0) return;
      [siblingList[idx - 1], siblingList[idx]] = [siblingList[idx], siblingList[idx - 1]];
      reassignSort(siblingList);
      saveChange();
      onChange();
    };
    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.innerHTML = `<i class="ti ti-chevron-down"></i>`;
    downBtn.disabled = idx === siblingList.length - 1;
    downBtn.onclick = () => {
      if (idx === siblingList.length - 1) return;
      [siblingList[idx + 1], siblingList[idx]] = [siblingList[idx], siblingList[idx + 1]];
      reassignSort(siblingList);
      saveChange();
      onChange();
    };
    moveButtons.appendChild(upBtn);
    moveButtons.appendChild(downBtn);
    optsCol.appendChild(moveButtons);
  }

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = item.erledigt;
  cb.addEventListener("change", () => {
    item.erledigt = cb.checked;
    item.erledigtAm = cb.checked ? Date.now() : null;
    if (cb.checked) item.nichtRelevant = false;
    saveChange();
    onChange();
  });
  optsCol.appendChild(cb);

  // --- Aktions-Icons direkt nach der Checkbox (Zeilenanfang), damit man beim
  // schnellen Durchgehen einer Liste mit der Maus nicht jedes Mal ans
  // Zeilenende fahren muss. Text/Badges folgen danach im flexiblen Bereich.
  // Kein eigenes Bearbeiten-Icon mehr - ein Klick auf den Text öffnet direkt
  // das Bearbeiten-Popup (siehe label weiter unten). ---
  const actionCluster = document.createElement("span");
  actionCluster.className = "item-row-actions";

    function openEditForItem() {
    const inDb = (listKey === "packliste" || listKey === "todo") && ensureVorlageFuerListKey(listKey).some((a) => a.text === item.text);
    if (inDb) {
      openLocalOderDbChoiceModal(item, onChange, listKey);
      return;
    }
    openLokalBearbeitenModal(item, onChange, listKey);
  }

  const prioBtn = document.createElement("button");
  prioBtn.type = "button";
  prioBtn.className = "icon-btn priority-btn" + (item.prioritaet ? " active" : "");
  // Hinweis: "ti-flag-filled" existiert in der eingebundenen tabler-icons-Version
  // NICHT als Icon-Klasse - das liess das Icon beim Markieren (aktiver Zustand)
  // unsichtbar werden. Daher immer dieselbe Icon-Form, Unterscheidung nur über Farbe.
  prioBtn.innerHTML = `<i class="ti ti-flag"></i>`;
  prioBtn.title = item.prioritaet ? "Priorität entfernen" : "Als Priorität markieren";
  prioBtn.onclick = () => {
    item.prioritaet = !item.prioritaet;
    saveChange();
    onChange();
  };
  actionCluster.appendChild(prioBtn);

  const nrBtn = document.createElement("button");
  nrBtn.type = "button";
  nrBtn.className = "icon-btn" + (item.nichtRelevant ? " active" : "");
  nrBtn.innerHTML = `<i class="ti ti-circle-minus"></i>`;
  nrBtn.title = item.nichtRelevant ? "Als relevant markieren" : "Als nicht relevant markieren";
  nrBtn.onclick = () => {
    item.nichtRelevant = !item.nichtRelevant;
    if (item.nichtRelevant) item.erledigt = false;
    saveChange();
    onChange();
  };
  actionCluster.appendChild(nrBtn);

  const bell = document.createElement("button");
  bell.type = "button";
  bell.className = "bell-btn" + (item.erinnerung ? " active" : "");
  bell.innerHTML = `<i class="ti ${item.erinnerung ? "ti-bell-filled" : "ti-bell"}"></i>`;
  bell.title = item.erinnerung ? `Erinnerung: ${new Date(item.erinnerung).toLocaleString("de-CH")}` : "Erinnerung setzen";
  bell.onclick = () => {
    editingReminderId = editingReminderId === item.id ? null : item.id;
    onChange();
  };
  actionCluster.appendChild(bell);

  if (listKey === "packliste" && !ensureArtikelDatenbank().some((a) => a.text === item.text)) {
    const dbBtn = document.createElement("button");
    dbBtn.type = "button";
    dbBtn.className = "icon-btn";
    dbBtn.title = "In Artikel-Datenbank übernehmen (Kategorien/Merkmale direkt hier erfassen)";
    dbBtn.innerHTML = `<i class="ti ti-database-plus"></i>`;
    dbBtn.onclick = () => {
      editingArtikelId = "__neu__";
      const katalog = ensureArtikelDatenbank();
      openModal(
        renderArtikelForm(katalog, () => { closeModal(); onChange(); }, { text: item.text, kategorie: item.kategorie, merkmale: item.nurWenn || [] }, item),
        () => { editingArtikelId = null; }
      );
    };
    actionCluster.appendChild(dbBtn);
  }

  optsCol.appendChild(actionCluster);

  if (showTermin && item.termin !== undefined && item.termin !== null && item.termin !== "") {
    const badge = document.createElement("span");
    badge.className = "termin-badge";
    badge.textContent = formatTermin(item.termin);
    const terminCol = document.createElement("span");
    terminCol.className = "item-col-termin";
    terminCol.appendChild(badge);
    row.appendChild(terminCol);
  }

  const label = document.createElement("span");
  label.className = "item-row-label item-col-text";
  label.style.flex = "1";
  label.title = "Antippen zum Bearbeiten";
  label.onclick = openEditForItem;
  label.innerHTML = escapeHtml(item.text);
  row.appendChild(label);

  if (item.bemerkung) {
    const bemCol = document.createElement("span");
    bemCol.className = "item-col-bem hint-small";
    bemCol.innerHTML = `<i class="ti ti-message-2"></i> ${escapeHtml(item.bemerkung)}`;
    row.appendChild(bemCol);
  }
  if (item.kategorie) {
    const katCol = document.createElement("span");
    katCol.className = "item-col-kat hint-small";
    katCol.title = "Kategorie";
    katCol.innerHTML = `<i class="ti ${categoryIcon(item.kategorie)}"></i> ${escapeHtml(item.kategorie)}`;
    row.appendChild(katCol);
  }

  if (item.erfassungsTyp === "einmalig" || item.erfassungsTyp === "fix") {
    const typBadge = document.createElement("span");
    typBadge.className = "erfassungstyp-badge" + (item.erfassungsTyp === "fix" ? " fix" : "") + " manual-entry-badge";
    typBadge.title = item.erfassungsTyp === "fix" ? "Fix - auch in der zentralen Vorlage" : "Einmalig - nur für diese Ferien";
    typBadge.innerHTML = `<i class="ti ti-hand-click"></i> ${item.erfassungsTyp === "fix" ? "Fix" : "Einmalig"}`;
    label.appendChild(typBadge);
  }

  if ((listKey === "packliste" || listKey === "todo") && !istFerienVorbei(trip)) {
    const dbEntry = ensureVorlageFuerListKey(listKey).find((e) => e.text === item.text);
    if (dbEntry) {
      if (dbEntry.spontan) {
        const spontanBadge = document.createElement("span");
        spontanBadge.className = "spontan-badge";
        spontanBadge.title = "Spontan über Packliste/Reisetag erfasst - noch nicht vollständig geprüft";
        spontanBadge.innerHTML = `<i class="ti ti-sparkles"></i> Spontan`;
        label.appendChild(spontanBadge);
      }
      if (istCheckOffen(dbEntry)) {
        const checkBadge = document.createElement("span");
        checkBadge.className = "check-badge";
        checkBadge.title = "Dieser Datenbank-Eintrag wurde noch nicht geprüft";
        checkBadge.innerHTML = `<i class="ti ti-list-check"></i> Check offen`;
        label.appendChild(checkBadge);
      }
    }
  }

  // Delete-Icon bewusst ganz am Zeilenende (nicht im vorderen Aktions-Cluster) -
  // damit es beim schnellen Antippen der anderen Icons nicht aus Versehen
  // getroffen wird; ein Löschen ist unumkehrbar, die anderen Icons nicht.
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "icon-btn danger item-row-delete";
  deleteBtn.innerHTML = `<i class="ti ti-trash"></i>`;
  deleteBtn.title = "Löschen";
  deleteBtn.onclick = () => {
    const liste = trip[listKey];
    const pos = liste.findIndex((i) => i.id === item.id);
    if (pos === -1) return;
    liste.splice(pos, 1);
    saveChange();
    onChange();
    showUndoToast('"' + item.text + '" gelöscht', () => {
      liste.splice(Math.min(pos, liste.length), 0, item);
      saveChange();
      render();
    });
  };
  row.appendChild(deleteBtn);

  return row;
}

function reminderForm(item, onChange) {
  const form = document.createElement("form");
  form.className = "reminder-form";
  form.innerHTML = `
    <input type="datetime-local" name="erinnerung" value="${item.erinnerung ? escapeHtml(item.erinnerung) : ""}" />
    <button type="submit"><i class="ti ti-check"></i></button>
    ${item.erinnerung ? `<button type="button" id="remove-reminder" class="secondary"><i class="ti ti-x"></i></button>` : ""}
  `;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = form.querySelector("input[name=erinnerung]").value;
    if (val) {
      item.erinnerung = val;
      item.erinnerungGesendet = false;
    } else {
      delete item.erinnerung;
      delete item.erinnerungGesendet;
    }
    saveChange();
    editingReminderId = null;
    onChange();
  });
  const removeBtn = form.querySelector("#remove-reminder");
  if (removeBtn) {
    removeBtn.onclick = () => {
      delete item.erinnerung;
      delete item.erinnerungGesendet;
      saveChange();
      editingReminderId = null;
      onChange();
    };
  }
  return form;
}

// ===========================================================
// ERINNERUNGEN (Browser-Notification API)
// ===========================================================
// Wichtig: Das funktioniert nur, solange die App in einem Browser-Tab
// geöffnet ist (bzw. kurz nach dem Öffnen für fällige Erinnerungen).
// Echte Push-Benachrichtigungen (auch bei geschlossener App) würden
// einen eigenen Server mit Push-Diensten erfordern - das ist bei
// dieser rein statischen GitHub-Pages-App bewusst nicht eingebaut.
function checkReminders() {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const data = getData();
  if (!data) return;
  const now = new Date();
  let changed = false;
  data.ferien.forEach((trip) => {
    ["packliste", "todo"].forEach((key) => {
      (trip[key] || []).forEach((item) => {
        if (item.erinnerung && !item.erinnerungGesendet) {
          const t = new Date(item.erinnerung);
          if (t <= now) {
            try {
              new Notification("Ferien-App Erinnerung", {
                body: item.text + (trip.titel ? " (" + trip.titel + ")" : ""),
              });
            } catch (e) { /* Notification evtl. nicht erlaubt - ignorieren */ }
            item.erinnerungGesendet = true;
            changed = true;
          }
        }
      });
    });
  });
  if (changed) saveChange();
}

// ===========================================================
// TAB: EINSTELLUNGEN
// ===========================================================

function renderEinstellungenTab(el) {
  const theme = getTheme();
  const notifSupported = typeof Notification !== "undefined";
  const notifPermission = notifSupported ? Notification.permission : "nicht unterstützt";
  const notifLabel = { granted: "aktiviert", denied: "blockiert (in Browser-Einstellungen ändern)", default: "noch nicht aktiviert" }[notifPermission] || notifPermission;
  const sortable = getSortableTabs();

  el.innerHTML = `
    <section class="panel">
      <p><i class="ti ti-user"></i> Angemeldet als<br /><strong>${escapeHtml(getAccountName() || "")}</strong></p>
      <button id="logout-button" class="secondary"><i class="ti ti-logout"></i> Abmelden</button>
    </section>
    <section class="panel">
      <p class="hint-small">Synchronisationsstatus: <span id="sync-status-mehr"></span></p>
    </section>
    <section class="panel">
      <h2><i class="ti ti-sun-moon"></i> Erscheinungsbild</h2>
      <div class="theme-toggle-row">
        <button id="theme-light" class="${theme === "light" ? "active" : ""}"><i class="ti ti-sun"></i> Hell</button>
        <button id="theme-dark" class="${theme === "dark" ? "active" : ""}"><i class="ti ti-moon"></i> Dunkel</button>
      </div>
    </section>
    <section class="panel">
      <h2><i class="ti ti-bell"></i> Erinnerungen</h2>
      <p class="hint-small">Status: ${notifLabel}. Erinnerungen kannst du pro Artikel/To-Do über das Glocken-Symbol setzen. Funktioniert nur, solange die App in einem Browser-Tab geöffnet ist (bzw. kurz danach) - echtes Push bei geschlossener App bräuchte einen eigenen Server, den diese rein statische App bewusst nicht hat.</p>
      ${notifSupported && notifPermission !== "granted" ? `<button id="enable-notif" class="secondary"><i class="ti ti-bell"></i> Benachrichtigungen aktivieren</button>` : ""}
    </section>
        <section class="panel">
      <h2><i class="ti ti-arrow-back-up"></i> Ansicht zurücksetzen</h2>
      <p class="hint-small">Setzt Ein-/Ausklapp-Zustände, Filter, Sortierung und Gruppierung alle Listen auf den Standard zurück (z. B. wenn du dich in Filtern/Ansichten "verklickt" hast). Deine Daten (Packliste, To-Dos, Ferien usw.) bleiben unverändert.</p>
      <button id="reset-ansicht-button" class="secondary"><i class="ti ti-refresh"></i> Ansicht zurücksetzen</button>
    </section>
    <section class="panel">
      <h2><i class="ti ti-flag-off"></i> Prioritäten zurücksetzen</h2>
      <p class="hint-small">Entfernt die Prio-Markierung (Flagge) von ALLEN Artikeln und To-Dos in ALLEN Ferien. Nützlich, wenn sich zu viele Prio-Markierungen angesammelt haben.</p>
      <button id="reset-prio-button" class="secondary"><i class="ti ti-flag-off"></i> Alle Prioritäten zurücksetzen</button>
    </section>
    <p class="version-footer">Ferien-App v${APP_VERSION} &middot; Stand ${APP_BUILD_DATE}</p>
  `;
  document.getElementById("logout-button").onclick = logout;
  document.getElementById("theme-light").onclick = () => { setTheme("light"); renderEinstellungenTab(el); };
  document.getElementById("theme-dark").onclick = () => { setTheme("dark"); renderEinstellungenTab(el); };
  document.getElementById("reset-ansicht-button").onclick = () => {
    if (!confirm("Ansicht (Filter, Sortierung, Ein-/Ausklapp-Zustände) auf Standard zurücksetzen? Deine Daten bleiben erhalten.")) return;
    resetAnsichtEinstellungen();
    render();
  };
  document.getElementById("reset-prio-button").onclick = () => {
    if (!confirm("Prio-Markierung bei ALLEN Artikeln und To-Dos in ALLEN Ferien entfernen?")) return;
    const data = getData();
    (data.ferien || []).forEach((trip) => {
      (trip.packliste || []).forEach((item) => { item.prioritaet = false; });
      (trip.todo || []).forEach((item) => { item.prioritaet = false; });
    });
    saveChange();
    render();
  };
  const enableBtn = document.getElementById("enable-notif");
  if (enableBtn) {
    enableBtn.onclick = async () => {
      await Notification.requestPermission();
      renderEinstellungenTab(el);
      checkReminders();
    };
  }

  const orderSection = document.createElement("section");
  orderSection.className = "panel";
  const orderHeaderResult = collapsibleHeader("einstellungen:kachelreihenfolge", "<i class=\"ti ti-arrows-sort\"></i> Kacheln anordnen", () => renderEinstellungenTab(el));
  orderSection.appendChild(orderHeaderResult.header);
  const orderHint = document.createElement("p");
  orderHint.className = "hint-small";
  orderHint.textContent = "Lege fest, in welcher Reihenfolge Artikel-Datenbank, Programm, Finanzen usw. in der Navigation erscheinen.";
  orderSection.appendChild(orderHint);
  const orderListEl = document.createElement("div");
  orderListEl.id = "tab-order-list";
  orderListEl.className = "tab-order-list";
  if (!orderHeaderResult.isCollapsed) orderSection.appendChild(orderListEl);
  el.insertBefore(orderSection, el.querySelector(".version-footer"));

  if (orderHeaderResult.isCollapsed) return;
  sortable.forEach((tabId, idx) => {
    const def = TAB_DEFS[tabId];
    if (!def) return;
    const row = document.createElement("div");
    row.className = "tab-order-row";
    row.innerHTML = `<span><i class="ti ${def.icon}"></i> ${escapeHtml(def.label)}</span>`;
    const moveButtons = document.createElement("div");
    moveButtons.className = "move-buttons";
    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.innerHTML = `<i class="ti ti-chevron-up"></i>`;
    upBtn.disabled = idx === 0;
    upBtn.onclick = () => {
      if (idx === 0) return;
      [sortable[idx - 1], sortable[idx]] = [sortable[idx], sortable[idx - 1]];
      getData().tabOrder = sortable;
      saveChange();
      renderEinstellungenTab(el);
      renderNavBars();
    };
    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.innerHTML = `<i class="ti ti-chevron-down"></i>`;
    downBtn.disabled = idx === sortable.length - 1;
    downBtn.onclick = () => {
      if (idx === sortable.length - 1) return;
      [sortable[idx + 1], sortable[idx]] = [sortable[idx], sortable[idx + 1]];
      getData().tabOrder = sortable;
      saveChange();
      renderEinstellungenTab(el);
      renderNavBars();
    };
    moveButtons.appendChild(upBtn);
    moveButtons.appendChild(downBtn);
    row.appendChild(moveButtons);
    orderListEl.appendChild(row);
  });
}

// ===========================================================
// VERWALTUNG: ARTIKEL-DATENBANK (zentraler Katalog, unabhängig von Ferien)
// ===========================================================
let editingArtikelId = null; // null | "__neu__" | id
// Ansicht der Artikel-Datenbank: "liste" (klassische Gruppen-Liste) oder
// "matrix" (Tabelle Artikel x Merkmale, 1:1 nach Excel-Master) - nur im Speicher.
let artikelViewMode = "liste";
// Matrix-Filter: "alle" | "aufPackliste" | "nichtAufPackliste"
let artikelMatrixFilter = "alle";
let artikelMatrixSortMerkmal = null;

function renderArtikelTab(el) {
  closeModal();
  const katalog = ensureArtikelDatenbank();
  const trip = getCurrentTrip();

  el.innerHTML = `
    <section class="panel">
      <div class="panel-header-row">
        <h2><i class="ti ti-list-details"></i> Artikel-Datenbank <span class="hint-small" style="margin:0">(${katalog.length})</span></h2>
        <div class="chip-row">
          <button type="button" class="chip view-toggle-chip${artikelViewMode === "liste" ? " active" : ""}" data-mode="liste"><i class="ti ti-list"></i>Liste</button>
          <button type="button" class="chip view-toggle-chip${artikelViewMode === "matrix" ? " active" : ""}" data-mode="matrix"><i class="ti ti-table"></i>Matrix</button>
        </div>
      </div>
      <p class="hint-small">Zentraler Katalog aller Artikel, unabhängig von einzelnen Ferien. Von hier lässt sich ein Artikel direkt in die Packliste der aktuell gewählten Ferien übernehmen. In der Matrix-Ansicht lassen sich die Merkmale direkt per Checkbox zuweisen (wie im ursprünglichen Excel-Master).</p>
      <div id="artikel-list"></div>
      <button id="new-artikel-button" class="secondary"><i class="ti ti-plus"></i> Neuer Artikel</button>
    </section>
  `;

  document.querySelectorAll(".view-toggle-chip").forEach((chip) => {
    chip.onclick = () => { artikelViewMode = chip.dataset.mode; renderArtikelTab(el); };
  });

  const list = document.getElementById("artikel-list");
  if (!katalog.length) {
    list.innerHTML = `<p class="hint-empty">Noch keine Artikel im Katalog.</p>`;
  } else if (artikelViewMode === "matrix") {
    const matrixHeaderResult = collapsibleHeader(
      "artikel:matrix",
      `<i class="ti ti-table"></i> Matrix (${katalog.length})`,
      () => renderArtikelTab(el)
    );
    list.appendChild(matrixHeaderResult.header);
    if (!matrixHeaderResult.isCollapsed) {
      list.appendChild(renderArtikelMatrix(katalog, trip, () => renderArtikelTab(el)));
    }
  } else {
    // Liste-Ansicht bekommt dieselben Merkmale wie die Matrix: Filter
    // auf/nicht auf Packliste (gemeinsamer Zustand mit der Matrix, da
    // Änderungen ohnehin für beide Ansichten gelten sollen), Graustufe für
    // bereits gepackte Artikel, Bemerkungen sichtbar.
    if (trip) {
      const filterRow = document.createElement("div");
      filterRow.className = "chip-row";
      filterRow.style.marginBottom = "8px";
      [
        { key: "alle", label: "Alle", icon: "ti-list" },
        { key: "aufPackliste", label: "Auf Packliste", icon: "ti-checkbox" },
        { key: "nichtAufPackliste", label: "Nicht auf Packliste", icon: "ti-square" },
      ].forEach((f) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip" + (artikelMatrixFilter === f.key ? " active" : "");
        chip.innerHTML = `<i class="ti ${f.icon}"></i>${f.label}`;
        chip.onclick = () => { artikelMatrixFilter = f.key; renderArtikelTab(el); };
        filterRow.appendChild(chip);
      });
      list.appendChild(filterRow);
    } else {
      artikelMatrixFilter = "alle";
    }

    const gefiltert = katalog.filter((a) => {
      if (artikelMatrixFilter === "alle" || !trip) return true;
      const aufPackliste = istAufAktuellerPackliste(a, trip);
      return artikelMatrixFilter === "aufPackliste" ? aufPackliste : !aufPackliste;
    });
    const sorted = [...gefiltert].sort((a, b) => getArtikelKategorien(a).join(",").localeCompare(getArtikelKategorien(b).join(",")) || a.text.localeCompare(b.text, "de"));
    const byKategorie = [];
    const byName = {};
    sorted.forEach((a) => {
      getArtikelKategorien(a).forEach((kat) => {
        if (!byName[kat]) { byName[kat] = { kategorie: kat, items: [] }; byKategorie.push(byName[kat]); }
        byName[kat].items.push(a);
      });
    });
    byKategorie.sort((g1, g2) => g1.kategorie.localeCompare(g2.kategorie, "de"));
    if (!byKategorie.length) {
      const empty = document.createElement("p");
      empty.className = "hint-empty";
      empty.textContent = "Keine Artikel für diesen Filter.";
      list.appendChild(empty);
    }
    byKategorie.forEach((g) => {
      const collapseKey = "artikel:" + g.kategorie;
      const { header, isCollapsed } = collapsibleHeader(
        collapseKey,
        `<i class="ti ${categoryIcon(g.kategorie)}"></i> ${escapeHtml(g.kategorie)} <span class="hint-small" style="margin:0">(${g.items.length})</span>`,
        () => renderArtikelTab(el)
      );
      header.className += " category-header";
      list.appendChild(header);
      if (isCollapsed) return;
      g.items.forEach((a) => {        const packlisteItem = trip ? trip.packliste.find((p) => p.text === a.text && itemVisible(p, trip) && !p.nichtRelevant) : null;
        const alreadyOnPackliste = !!packlisteItem;
        const kategorien = getArtikelKategorien(a);
        const row = document.createElement("div");
        row.className = "item-row" + (alreadyOnPackliste ? " item-row-on-packliste" : "");

        function addZuPackliste(erledigt) {
          trip.packliste.push({
            id: "i" + Date.now() + Math.random().toString(36).slice(2, 6),
            text: a.text,
            erledigt: !!erledigt,
            kategorie: a.kategorie || kategorien[0] || "Allgemein",
            sort: trip.packliste.length,
            ...(a.merkmale && a.merkmale.length ? { nurWenn: a.merkmale } : {}),
            ...(a.prioritaet ? { prioritaet: true } : {}),
          });
          saveChange();
          renderArtikelTab(el);
        }

        if (trip) {
          // Checkbox: Artikel direkt auf die Packliste setzen UND abhaken
          // (für Artikel, die man schon eingepackt hat, aber noch nicht in
          // der DB als "auf Packliste" markiert sind).
          const quickCb = document.createElement("input");
          quickCb.type = "checkbox";
          quickCb.checked = packlisteItem ? !!packlisteItem.erledigt : false;
          quickCb.title = packlisteItem ? "Abgehakt-Status umschalten" : "Direkt auf die Packliste setzen und abhaken";
          quickCb.onclick = (e) => {
            e.stopPropagation();
            if (!packlisteItem) {
              addZuPackliste(true);
            } else {
              packlisteItem.erledigt = !packlisteItem.erledigt;
              saveChange();
              renderArtikelTab(el);
            }
          };
          row.appendChild(quickCb);

          const addBtn = document.createElement("button");
          addBtn.type = "button";
          addBtn.className = "icon-btn" + (packlisteItem ? " remove-from-packliste" : "");
          addBtn.innerHTML = packlisteItem ? `<i class="ti ti-minus"></i>` : `<i class="ti ti-plus"></i>`;
          addBtn.title = packlisteItem ? `Von Packliste von "${trip.titel}" entfernen` : `Zu Packliste von "${trip.titel}" hinzufügen`;
          addBtn.onclick = (e) => {
            e.stopPropagation();
            if (packlisteItem) {
              trip.packliste = trip.packliste.filter((p) => p.id !== packlisteItem.id);
              saveChange();
              renderArtikelTab(el);
            } else {
              addZuPackliste(false);
            }
          };
          row.appendChild(addBtn);
        }

        const textSpan = document.createElement("span");
        textSpan.style.flex = "1";
        textSpan.innerHTML = `${alreadyOnPackliste ? `<span class="on-packliste-badge" title="Bereits auf der Packliste von &quot;${escapeHtml(trip.titel)}&quot;"><i class="ti ti-checkbox"></i></span> ` : ""}${escapeHtml(a.text)}${kategorien.length > 1 ? ` <span class="hint-small" style="margin:0">(${kategorien.map(escapeHtml).join(", ")})</span>` : ""}${a.bemerkung ? `<br /><span class="hint-small" style="margin:0"><i class="ti ti-message-2"></i> ${escapeHtml(a.bemerkung)}</span>` : ""}${a.spontan ? ` <span class="spontan-badge" title="Spontan über Packliste/Reisetag erfasst - noch nicht vollständig geprüft"><i class="ti ti-sparkles"></i> Spontan</span>` : ""}${istCheckOffen(a) ? ` <span class="check-badge" title="Noch nicht geprüft"><i class="ti ti-list-check"></i> Check offen</span>` : ""}`;
        // Klick auf den Text öffnet direkt das Bearbeiten-Popup (kein
        // separates Bleistift-Icon mehr nötig, spart Platz in der Zeile).
        // Merkmale werden hier bewusst NICHT angezeigt (sprengt die Liste) -
        // die sieht man im Popup oder in der Matrix-Ansicht.
        textSpan.onclick = () => { editingArtikelId = a.id; renderArtikelTab(el); };
        row.appendChild(textSpan);

        const dupBtn = document.createElement("button");
        dupBtn.type = "button";
        dupBtn.className = "icon-btn";
        dupBtn.innerHTML = `<i class="ti ti-copy"></i>`;
        dupBtn.title = "Duplizieren";
        dupBtn.onclick = (e) => {
          e.stopPropagation();
          const data = getData();
          const kopie = { ...a, id: "art" + Date.now() + Math.random().toString(36).slice(2, 6), text: a.text + " (Kopie)" };
          data.artikelDatenbank.push(kopie);
          saveChange();
          renderArtikelTab(el);
        };
        row.appendChild(dupBtn);

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "icon-btn danger";
        delBtn.innerHTML = `<i class="ti ti-trash"></i>`;
        delBtn.title = "Löschen";
        delBtn.onclick = (e) => {
          e.stopPropagation();
          const data = getData();
          const pos = data.artikelDatenbank.findIndex((x) => x.id === a.id);
          data.artikelDatenbank = data.artikelDatenbank.filter((x) => x.id !== a.id);
          saveChange();
          renderArtikelTab(el);
          showUndoToast('"' + a.text + '" gelöscht', () => {
            const d2 = getData();
            d2.artikelDatenbank.splice(Math.min(Math.max(pos, 0), d2.artikelDatenbank.length), 0, a);
            saveChange();
            render();
          });
        };
        row.appendChild(delBtn);
        list.appendChild(row);
      });

    });
  }

  document.getElementById("new-artikel-button").onclick = () => { editingArtikelId = "__neu__"; renderArtikelTab(el); };

  if (editingArtikelId) {
    openModal(renderArtikelForm(katalog, () => renderArtikelTab(el)), () => { editingArtikelId = null; });
  }
}

/** Matrix-Ansicht der Artikel-Datenbank (Artikel x Merkmale), 1:1 nach dem
 *  ursprünglichen Excel-Master: pro Artikel eine Zeile, pro Merkmal eine
 *  Checkbox-Spalte, direkt anklickbar ohne Formular zu öffnen. Wegen der
 *  potenziell vielen Merkmal-Spalten horizontal scrollbar. */
function renderArtikelMatrix(katalog, trip, onChange) {
  const defs = getMerkmaleDefs();
  const outer = document.createElement("div");

  if (trip) {
    const filterRow = document.createElement("div");
    filterRow.className = "chip-row";
    filterRow.style.marginBottom = "6px";
    [
      { key: "alle", label: "Alle", icon: "ti-list" },
      { key: "aufPackliste", label: "Auf Packliste", icon: "ti-checkbox" },
      { key: "nichtAufPackliste", label: "Nicht auf Packliste", icon: "ti-square" },
    ].forEach((f) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip" + (artikelMatrixFilter === f.key ? " active" : "");
      chip.innerHTML = `<i class="ti ${f.icon}"></i>${f.label}`;
      chip.onclick = () => { artikelMatrixFilter = f.key; onChange(); };
      filterRow.appendChild(chip);
    });
    outer.appendChild(filterRow);
  } else {
    artikelMatrixFilter = "alle";
  }

  const wrap = document.createElement("div");
  wrap.className = "matrix-scroll";
  outer.appendChild(wrap);

  const table = document.createElement("table");
  table.className = "artikel-matrix";

  const thead = document.createElement("thead");

  // Zweite Kopfzeile: Merkmale nach ihrer Gruppe (z. B. "Transport": Auto/
  // VW-Bus/Flugzeug/öV) farblich hervorheben, damit auf einen Blick klar
  // ist, welche Spalten zusammengehören - je Gruppe eine Akzentfarbe aus
  // einer kleinen, zyklisch wiederholten Palette.
  const MATRIX_GRUPPEN_FARBEN = ["#e8f5e9", "#e3f2fd", "#fff3e0", "#f3e5f5", "#fce4ec", "#e0f7fa", "#fff9c4"];
  const gruppen = groupMerkmale(defs);
  const gruppenRow = document.createElement("tr");
  gruppenRow.className = "matrix-gruppen-row";
  gruppenRow.innerHTML = `<th class="matrix-artikel-col"></th><th class="matrix-bemerkung-col"></th><th></th><th class="matrix-standard-col"></th>`;
  gruppen.forEach((g, gIdx) => {
    const th = document.createElement("th");
    th.colSpan = g.items.length;
    th.textContent = g.gruppe;
    th.style.background = MATRIX_GRUPPEN_FARBEN[gIdx % MATRIX_GRUPPEN_FARBEN.length];
    gruppenRow.appendChild(th);
  });
  gruppenRow.appendChild(document.createElement("th"));
  thead.appendChild(gruppenRow);

  const headRow = document.createElement("tr");
  headRow.innerHTML = `<th class="matrix-artikel-col">Artikel</th><th class="matrix-bemerkung-col">Bemerkung</th><th class="matrix-alle-col" title="Alle Merkmale auf/abwählen"><i class="ti ti-checks"></i></th><th class="matrix-standard-col" title="Standard: Artikel ohne Merkmale erscheinen automatisch auf JEDER Packliste. Schliesst sich mit 'Alle auf/abwählen' aus - sobald ein Merkmal gewählt wird, ist Standard automatisch aus."><i class="ti ti-star"></i></th>`;
  gruppen.forEach((g, gIdx) => {
    g.items.forEach((m) => {
      const th = document.createElement("th");
      th.title = m.label;
      th.style.background = MATRIX_GRUPPEN_FARBEN[gIdx % MATRIX_GRUPPEN_FARBEN.length];
      th.innerHTML = `<i class="ti ${m.icon}"></i>`;
      // Tooltip (title) hilft am PC. Klick/Tap sortiert die Artikel
      // dieser Spalte nach Ankreuzstatus (angekreuzte zuerst), da
      // Touch-Geräte kein Mouseover kennen und ein Alert hier wenig nützt.
      th.classList.add("matrix-sortable");
      if (artikelMatrixSortMerkmal === m.key) th.classList.add("matrix-sort-active");
      th.onclick = () => {
        artikelMatrixSortMerkmal = artikelMatrixSortMerkmal === m.key ? null : m.key;
        onChange();
      };
      headRow.appendChild(th);
    });
  });
  headRow.appendChild(document.createElement("th"));
  thead.appendChild(headRow);
  table.appendChild(thead);

  // Spaltenreihenfolge der Checkboxen muss zur Kopfzeile passen (dort nach
  // Gruppen sortiert) - daher hier dieselbe, nach Gruppen geflachte Liste.
  const orderedDefs = gruppen.flatMap((g) => g.items);

  const tbody = document.createElement("tbody");

  const gefiltert = katalog.filter((a) => {
    if (artikelMatrixFilter === "alle" || !trip) return true;
    const aufPackliste = istAufAktuellerPackliste(a, trip);
    return artikelMatrixFilter === "aufPackliste" ? aufPackliste : !aufPackliste;
  });
  const sorted = [...gefiltert].sort((a, b) => getArtikelKategorien(a).join(",").localeCompare(getArtikelKategorien(b).join(",")) || a.text.localeCompare(b.text, "de"));
  const byKategorie = [];
  const byName = {};
  sorted.forEach((a) => {
    getArtikelKategorien(a).forEach((kat) => {
      if (!byName[kat]) { byName[kat] = { kategorie: kat, items: [] }; byKategorie.push(byName[kat]); }
      byName[kat].items.push(a);
    });
  });
  byKategorie.sort((g1, g2) => g1.kategorie.localeCompare(g2.kategorie, "de"));
  if (artikelMatrixSortMerkmal) {
    byKategorie.forEach((g) => {
      g.items.sort((x, y) => {
        const xHas = (x.merkmale || []).includes(artikelMatrixSortMerkmal) ? 0 : 1;
        const yHas = (y.merkmale || []).includes(artikelMatrixSortMerkmal) ? 0 : 1;
        return xHas - yHas || x.text.localeCompare(y.text, "de");
      });
    });
  }

  if (!byKategorie.length) {
    const emptyRow = document.createElement("tr");
    const emptyCell = document.createElement("td");
    emptyCell.colSpan = orderedDefs.length + 5;
    emptyCell.className = "hint-empty";
    emptyCell.textContent = "Keine Artikel für diesen Filter.";
    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
  }

  byKategorie.forEach((g) => {
    // Jede Kategorie einzeln einklappbar (nicht nur die ganze Matrix) -
    // eigener Collapse-Key pro Kategorie innerhalb der Matrix.
    const collapseKey = "artikel:matrix:" + g.kategorie;
    const isKatCollapsed = collapsed.has(collapseKey);
    const katRow = document.createElement("tr");
    katRow.className = "matrix-kategorie-row";
    katRow.style.cursor = "pointer";
    const katCell = document.createElement("td");
    katCell.colSpan = orderedDefs.length + 5;
    katCell.innerHTML = `<i class="ti ti-chevron-${isKatCollapsed ? "right" : "down"}"></i> <i class="ti ${categoryIcon(g.kategorie)}"></i> ${escapeHtml(g.kategorie)} <span class="hint-small" style="margin:0">(${g.items.length})</span>`;
    katRow.onclick = () => {
      if (isKatCollapsed) collapsed.delete(collapseKey);
      else collapsed.add(collapseKey);
      onChange();
    };
    katRow.appendChild(katCell);
    tbody.appendChild(katRow);
    if (isKatCollapsed) return;

    g.items.forEach((a) => {
      const alreadyOnPackliste = istAufAktuellerPackliste(a, trip);
      const row = document.createElement("tr");
      if (alreadyOnPackliste) row.className = "matrix-row-on-packliste";
      const nameCell = document.createElement("td");
      nameCell.className = "matrix-artikel-col";
      nameCell.innerHTML = `${alreadyOnPackliste ? `<span class="on-packliste-badge" title="Bereits auf der Packliste von &quot;${escapeHtml(trip.titel)}&quot;"><i class="ti ti-checkbox"></i></span> ` : ""}${escapeHtml(a.text)}`;
      // Klick auf Artikel-Namen oder Bemerkung öffnet direkt das
      // Bearbeiten-Popup (kein separates Bleistift-Icon mehr nötig).
      nameCell.style.cursor = "pointer";
      nameCell.onclick = () => { editingArtikelId = a.id; onChange(); };
      row.appendChild(nameCell);

      const bemerkungCell = document.createElement("td");
      bemerkungCell.className = "matrix-bemerkung-col";
      bemerkungCell.textContent = a.bemerkung || "";
      bemerkungCell.style.cursor = "pointer";
      bemerkungCell.onclick = () => { editingArtikelId = a.id; onChange(); };
      row.appendChild(bemerkungCell);

      const selected = new Set(a.merkmale || []);
      const merkmaleCheckboxes = [];
      const alleCell = document.createElement("td");
      alleCell.className = "matrix-alle-col";
      const alleCb = document.createElement("input");
      alleCb.type = "checkbox";
      alleCb.title = "Alle Merkmale auf/abwählen";
      alleCb.checked = orderedDefs.length > 0 && orderedDefs.every((m) => selected.has(m.key));
      alleCell.appendChild(alleCb);
      row.appendChild(alleCell);

      const standardCell = document.createElement("td");
      standardCell.className = "matrix-standard-col";
      const standardCb = document.createElement("input");
      standardCb.type = "checkbox";
      standardCb.title = "Standard: Dieser Artikel hat keine Merkmale ausgewählt und erscheint darum automatisch auf JEDER Packliste. Schliesst sich mit 'Alle auf/abwählen' aus. Standard verlässt man, indem man mindestens ein Merkmal auswählt.";
      standardCb.checked = selected.size === 0;
      standardCell.appendChild(standardCb);
      row.appendChild(standardCell);

      alleCb.onchange = () => {
        if (alleCb.checked) orderedDefs.forEach((m) => selected.add(m.key));
        else selected.clear();
        a.merkmale = [...selected];
        saveChange();
        standardCb.checked = selected.size === 0;
        onChange();
      };

      standardCb.onchange = () => {
        if (standardCb.checked) {
          if (selected.size > 0 && !confirm("\"Standard\" aktivieren und damit alle " + selected.size + " ausgewählten Merkmale bei \"" + a.text + "\" entfernen?")) {
            standardCb.checked = false;
            return;
          }
          selected.clear();
          a.merkmale = [...selected];
          saveChange();
          alleCb.checked = false;
          merkmaleCheckboxes.forEach((cb) => { cb.checked = false; });
          onChange();
        } else {
          // Standard kann nicht direkt abgewählt werden - dazu muss
          // mindestens ein Merkmal ausgewählt werden.
          standardCb.checked = true;
        }
      };

      orderedDefs.forEach((m) => {
        const cell = document.createElement("td");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = selected.has(m.key);
        cb.title = m.label;
        cb.onchange = () => {
          if (cb.checked) selected.add(m.key);
          else selected.delete(m.key);
          a.merkmale = [...selected];
          saveChange();
          alleCb.checked = orderedDefs.every((mm) => selected.has(mm.key));
          standardCb.checked = selected.size === 0;
        };
        merkmaleCheckboxes.push(cb);
        cell.appendChild(cb);
        row.appendChild(cell);
      });

      const actionsCell = document.createElement("td");
      actionsCell.className = "matrix-actions-col";
      if (trip) {
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "icon-btn" + (alreadyOnPackliste ? " remove-from-packliste" : "");
        addBtn.innerHTML = alreadyOnPackliste ? `<i class="ti ti-minus"></i>` : `<i class="ti ti-plus"></i>`;
        addBtn.title = alreadyOnPackliste ? `Von Packliste von "${trip.titel}" entfernen` : `Zu Packliste von "${trip.titel}" hinzufügen`;
        addBtn.onclick = () => {
          if (alreadyOnPackliste) {
            trip.packliste = trip.packliste.filter((p) => !(p.text === a.text && itemVisible(p, trip) && !p.nichtRelevant));
            saveChange();
            onChange();
            return;
          }
          trip.packliste.push({
            id: "i" + Date.now() + Math.random().toString(36).slice(2, 6),
            text: a.text,
            erledigt: false,
            kategorie: a.kategorie || getArtikelKategorien(a)[0] || "Allgemein",
            sort: trip.packliste.length,
            ...(a.merkmale && a.merkmale.length ? { nurWenn: a.merkmale } : {}),
            ...(a.prioritaet ? { prioritaet: true } : {}),
          });
          saveChange();
          onChange();
        };
        actionsCell.appendChild(addBtn);
      }
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "icon-btn danger";
      delBtn.innerHTML = `<i class="ti ti-trash"></i>`;
      delBtn.title = "Löschen";
      delBtn.onclick = () => {
        if (!confirm(`"${a.text}" wirklich aus dem Katalog löschen?`)) return;
        const data = getData();
        data.artikelDatenbank = data.artikelDatenbank.filter((x) => x.id !== a.id);
        saveChange();
        onChange();
      };
      actionsCell.appendChild(delBtn);
      row.appendChild(actionsCell);

      tbody.appendChild(row);
    });
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  return outer;
}

function renderArtikelForm(katalog, onChange, prefill, linkedItem) {
  const isNew = editingArtikelId === "__neu__";
  const existing = isNew ? null : katalog.find((a) => a.id === editingArtikelId);
  const a = existing || { text: (prefill && prefill.text) || "", kategorie: "", kategorien: (prefill && prefill.kategorie) ? [prefill.kategorie] : [], merkmale: (prefill && prefill.merkmale) || [], bemerkung: "" };

  const form = document.createElement("form");
  form.className = "field-form";
    const hatMerkmale = (a.merkmale || []).length > 0;
  form.innerHTML = `
    <div class="form-actions form-actions-top">
      <button type="submit"><i class="ti ti-check"></i> Speichern</button>
    </div>
    <label><span><i class="ti ti-pencil"></i> Artikel</span><input type="text" name="text" class="field-emphasized" value="${escapeHtml(a.text)}" required /></label>
    <label><span><i class="ti ti-message-2"></i> Bemerkung (allgemein)</span><textarea name="bemerkung" class="field-emphasized" rows="2">${escapeHtml(a.bemerkung || "")}</textarea></label>
    ${a.spontan ? `<p class="hint-small" style="margin:0 0 4px"><i class="ti ti-sparkles"></i> Spontan über Packliste/Reisetag erfasst - bitte Angaben prüfen/ergänzen und danach "Check erledigt" setzen.</p>` : ""}
    <div class="checkbox-inline-row">
      <label class="checkbox-inline"><input type="checkbox" id="artikel-edit-check" ${(isNew || !istCheckOffen(a)) ? "checked" : ""} /> <i class="ti ti-list-check"></i> Check erledigt (geprüft)</label>
      <label class="checkbox-inline"><input type="checkbox" id="artikel-edit-prioritaet" ${(linkedItem ? linkedItem.prioritaet : a.prioritaet) ? "checked" : ""} /> <i class="ti ti-flag"></i> Priorität (Standard)</label>
    </div>
    ${a.checkDatum ? `<p class="hint-small" style="margin:-6px 0 4px">Zuletzt geprüft am ${escapeHtml(formatCheckDatum(a.checkDatum))}</p>` : ""}
    <details class="form-section-box" open>
      <summary>Kategorien (Mehrfachauswahl möglich)</summary>
      <div class="chip-row" id="artikel-kategorien-chiprow"></div>
      <div class="field-row">
        <input type="text" id="artikel-neue-kategorie" placeholder="Neue Kategorie ..." style="flex:1" />
        <button type="button" id="artikel-kategorie-add" class="secondary"><i class="ti ti-plus"></i></button>
      </div>
    </details>
    <details class="form-section-box" open>
      <summary>Merkmale (optional) <span class="standard-badge${hatMerkmale ? " hidden" : ""}" id="artikel-standard-badge" title="Standard: Dieser Artikel hat keine Merkmale ausgewählt und kommt dadurch automatisch auf JEDE Packliste.">✓ Standard</span></summary>
      <p class="hint-small" style="margin:0 0 4px">Für Standardartikel, die für alle gelten, müssen keine Merkmale ausgewählt werden - sie tragen oben automatisch das Label "Standard". Der Chip unten wählt das direkt an und leert dafür die übrigen Merkmale.</p>
      <div class="chip-row" id="artikel-standard-chiprow" style="margin-bottom:10px"></div>
      <div id="artikel-merkmale-gruppen"></div>
    </details>
    <div class="form-actions">
      <button type="submit"><i class="ti ti-check"></i> Speichern</button>
      <button type="button" id="cancel-artikel" class="secondary">Abbrechen</button>
      ${existing ? `<button type="button" id="delete-artikel" class="danger"><i class="ti ti-trash"></i></button>` : ""}
    </div>
  `;

  const selectedKategorien = new Set(getArtikelKategorien(a));
  const bekannteKategorien = Array.from(new Set(katalog.flatMap(getArtikelKategorien))).sort((x, y) => x.localeCompare(y, "de"));
  const katChipRow = form.querySelector("#artikel-kategorien-chiprow");
  const renderKatChips = () => {
    katChipRow.innerHTML = "";
    const alleKategorien = Array.from(new Set([...bekannteKategorien, ...selectedKategorien])).sort((x, y) => x.localeCompare(y, "de"));
    alleKategorien.forEach((kat) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip" + (selectedKategorien.has(kat) ? " active" : "");
      chip.innerHTML = `<i class="ti ${categoryIcon(kat)}"></i>${escapeHtml(kat)}`;
      chip.onclick = () => {
        if (selectedKategorien.has(kat)) selectedKategorien.delete(kat);
        else selectedKategorien.add(kat);
        renderKatChips();
      };
      katChipRow.appendChild(chip);
    });
  };
  renderKatChips();
  form.querySelector("#artikel-kategorie-add").onclick = () => {
    const input = form.querySelector("#artikel-neue-kategorie");
    const neu = input.value.trim();
    if (!neu) return;
    selectedKategorien.add(neu);
    input.value = "";
    renderKatChips();
  };

  const selectedMerkmale = new Set(a.merkmale || []);
  const standardBadge = form.querySelector("#artikel-standard-badge");
  const updateStandardBadge = () => {
    if (standardBadge) standardBadge.classList.toggle("hidden", selectedMerkmale.size > 0);
    if (standardChip) standardChip.classList.toggle("active", selectedMerkmale.size === 0);
  };
  const standardChipRow = form.querySelector("#artikel-standard-chiprow");
  const standardChip = document.createElement("button");
  standardChip.type = "button";
  standardChip.className = "chip standard-chip" + (selectedMerkmale.size === 0 ? " active" : "");
  standardChip.innerHTML = `<i class="ti ti-star"></i> Standard (alle Merkmale)`;
  standardChip.title = "Kein Merkmal ausgewählt: Artikel erscheint automatisch auf JEDER Packliste.";
  standardChip.onclick = () => {
    if (selectedMerkmale.size > 0 && !confirm("\"Standard\" aktivieren und damit alle " + selectedMerkmale.size + " ausgewählten Merkmale entfernen?")) return;
    selectedMerkmale.clear();
    gruppenContainer.querySelectorAll(".chip.active").forEach((c) => c.classList.remove("active"));
    updateStandardBadge();
  };
  standardChipRow.appendChild(standardChip);
  const gruppenContainer = form.querySelector("#artikel-merkmale-gruppen");
  groupMerkmale(getMerkmaleDefs()).forEach((g) => {
    const wrap = document.createElement("div");
    wrap.className = "merkmale-gruppe";
    wrap.innerHTML = `<p class="hint-small merkmale-gruppe-titel">${escapeHtml(g.gruppe)}</p>`;
    const chipRow = document.createElement("div");
    chipRow.className = "chip-row";
    g.items.forEach((m) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip" + (selectedMerkmale.has(m.key) ? " active" : "");
      chip.innerHTML = `<i class="ti ${m.icon}"></i>${m.label}`;
      chip.onclick = () => {
        if (selectedMerkmale.has(m.key)) selectedMerkmale.delete(m.key);
        else selectedMerkmale.add(m.key);
        chip.classList.toggle("active");
        updateStandardBadge();
      };
      chipRow.appendChild(chip);
    });
    wrap.appendChild(chipRow);
    gruppenContainer.appendChild(wrap);
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const kategorien = [...selectedKategorien];
    const checkInputEl = form.querySelector("#artikel-edit-check");
    const neuCheck = checkInputEl && checkInputEl.checked ? "erledigt" : "offen";
    const warSchonErledigt = existing && existing.check === "erledigt";
    const prioInputEl = form.querySelector("#artikel-edit-prioritaet");
    const values = {
      text: fd.get("text").trim(),
      kategorien,
      kategorie: kategorien[0] || "Allgemein",
      bemerkung: fd.get("bemerkung").trim(),
      merkmale: [...selectedMerkmale],
      check: neuCheck,
      checkDatum: neuCheck === "erledigt" ? (warSchonErledigt ? (existing.checkDatum || new Date().toISOString()) : new Date().toISOString()) : ((existing && existing.checkDatum) || null),
      prioritaet: !!(prioInputEl && prioInputEl.checked),
    };
    if (!values.text) return;
    if (isNew) {
      katalog.push({ id: "art" + Date.now() + Math.random().toString(36).slice(2, 6), ...values });
    } else {
      Object.assign(existing, values);
    }
    if (linkedItem) linkedItem.prioritaet = values.prioritaet;
    saveChange();
    editingArtikelId = null;
    onChange();
  });

  form.querySelector("#cancel-artikel").onclick = () => { editingArtikelId = null; onChange(); };
  const deleteBtn = form.querySelector("#delete-artikel");
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      const data = getData();
      const pos = data.artikelDatenbank.findIndex((x) => x.id === existing.id);
      data.artikelDatenbank = data.artikelDatenbank.filter((x) => x.id !== existing.id);
      saveChange();
      editingArtikelId = null;
      onChange();
      showUndoToast('"' + existing.text + '" gelöscht', () => {
        const d2 = getData();
        d2.artikelDatenbank.splice(Math.min(Math.max(pos, 0), d2.artikelDatenbank.length), 0, existing);
        saveChange();
        render();
      });
    };
  }

  return form;
}

// ===========================================================
// VERWALTUNG: MERKMALE (bislang fest im Code, jetzt bearbeitbar)
// ===========================================================
let editingMerkmalKey = null; // null | "__neu__" | key

function renderMerkmaleTab(el) {
  const defs = ensureMerkmaleDefs();

  el.innerHTML = `
    <section class="panel">
      <h2><i class="ti ti-tags"></i> Merkmale verwalten</h2>
      <p class="hint-small">Merkmale bestimmen, welche Artikel/To-Dos je nach Ferienart automatisch angezeigt werden (z. B. "Winter", "Ausland").</p>
    </section>
    <div id="merkmal-form-container"></div>
  `;

  const listSection = document.createElement("section");
  listSection.className = "panel";
  const { header: listHeader, isCollapsed: listCollapsed } = collapsibleHeader(
    "merkmale-tab:liste",
    `Alle Merkmale <span class="hint-small" style="margin:0">(${defs.length})</span>`,
    () => renderMerkmaleTab(el)
  );
  listSection.appendChild(listHeader);
  const list = document.createElement("div");
  list.id = "merkmal-list";
  if (!listCollapsed) listSection.appendChild(list);
  const newBtn = document.createElement("button");
  newBtn.id = "new-merkmal-button";
  newBtn.className = "secondary";
  newBtn.innerHTML = `<i class="ti ti-plus"></i> Neues Merkmal`;
  listSection.appendChild(newBtn);
  el.insertBefore(listSection, document.getElementById("merkmal-form-container"));

  if (listCollapsed) {
    newBtn.onclick = () => { editingMerkmalKey = "__neu__"; renderMerkmaleTab(el); };
    if (editingMerkmalKey) {
      document.getElementById("merkmal-form-container").appendChild(renderMerkmalForm(defs, () => renderMerkmaleTab(el)));
    }
    return;
  }

  groupMerkmale(defs).forEach((g) => {
    const groupWrap = document.createElement("div");
    groupWrap.className = "merkmale-gruppe";
    groupWrap.innerHTML = `<p class="hint-small merkmale-gruppe-titel">${escapeHtml(g.gruppe)}</p>`;
    g.items.forEach((m) => {
      const row = document.createElement("div");
      row.className = "item-row";
      row.innerHTML = `<i class="ti ${m.icon} category-icon"></i><span style="flex:1">${escapeHtml(m.label)}</span>`;
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "icon-btn";
      editBtn.innerHTML = `<i class="ti ti-pencil"></i>`;
      editBtn.onclick = () => { editingMerkmalKey = m.key; renderMerkmaleTab(el); };
      row.appendChild(editBtn);
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "icon-btn danger";
      delBtn.innerHTML = `<i class="ti ti-trash"></i>`;
      delBtn.onclick = () => {
        if (!confirm(`Merkmal "${m.label}" wirklich löschen? Bestehende Zuordnungen bei Artikeln/Ferien bleiben als ungenutzter Schlüssel erhalten.`)) return;
        const data = getData();
        data.merkmaleDefs = data.merkmaleDefs.filter((x) => x.key !== m.key);
        saveChange();
        renderMerkmaleTab(el);
      };
      row.appendChild(delBtn);
      groupWrap.appendChild(row);
    });
    list.appendChild(groupWrap);
  });

  document.getElementById("new-merkmal-button").onclick = () => { editingMerkmalKey = "__neu__"; renderMerkmaleTab(el); };

  const formContainer = document.getElementById("merkmal-form-container");
  if (editingMerkmalKey) {
    formContainer.appendChild(renderMerkmalForm(defs, () => renderMerkmaleTab(el)));
    formContainer.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function renderMerkmalForm(defs, onChange) {
  const isNew = editingMerkmalKey === "__neu__";
  const existing = isNew ? null : defs.find((m) => m.key === editingMerkmalKey);
  const m = existing || { label: "", icon: "ti-tag", gruppe: "" };
  const gruppen = bekannteMerkmalGruppen();
  const weitereLabel = "✨ Weitere";

  const form = document.createElement("form");
  form.className = "field-form panel";
  form.innerHTML = `
    <label><span><i class="ti ti-tag"></i> Bezeichnung</span><input type="text" name="label" value="${escapeHtml(m.label)}" required /></label>
    <label><span><i class="ti ti-mood-smile"></i> Icon (Tabler-Icon-Name, z. B. "ti-sun")</span><input type="text" name="icon" value="${escapeHtml(m.icon)}" /></label>
    <label><span><i class="ti ti-category"></i> Gruppe (Überbegriff)</span>
      <select name="gruppe">
        ${gruppen.map((g) => `<option value="${escapeHtml(g)}"${m.gruppe === g ? " selected" : ""}>${escapeHtml(g)}</option>`).join("")}
        <option value="${escapeHtml(weitereLabel)}"${!m.gruppe || !gruppen.includes(m.gruppe) ? " selected" : ""}>${escapeHtml(weitereLabel)}</option>
      </select>
    </label>
    <div class="form-actions">
      <button type="submit"><i class="ti ti-check"></i> Speichern</button>
      <button type="button" id="cancel-merkmal" class="secondary">Abbrechen</button>
    </div>
  `;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const label = fd.get("label").trim();
    const icon = fd.get("icon").trim() || "ti-tag";
    const gruppe = fd.get("gruppe");
    if (!label) return;
    if (isNew) {
      const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      defs.push({ key, label, icon, gruppe });
    } else {
      existing.label = label;
      existing.icon = icon;
      existing.gruppe = gruppe;
    }
    saveChange();
    editingMerkmalKey = null;
    onChange();
  });

  form.querySelector("#cancel-merkmal").onclick = () => { editingMerkmalKey = null; onChange(); };

  return form;
}

// ===========================================================
// TAB: PROGRAMM (Tagesplan + Ideensammlung, wie im Excel-Master
// "Programm & Aktivitäten": ein Bereich für die konkrete Tagesplanung
// (mit Datum) und ein Bereich für noch nicht eingeplante Ideen.)
// ===========================================================
let editingTagesplanId = null;
let editingIdeeId = null;

/** Migriert einmalig alte, flache trip.programm-Einträge (vor diesem
 *  Update) in die neue Struktur (trip.tagesplan), damit keine
 *  bestehenden Daten verloren gehen. */
function ensureProgrammStruktur(trip) {
  trip.tagesplan = trip.tagesplan || [];
  trip.ideen = trip.ideen || [];
  if (!trip.programmMigriert && Array.isArray(trip.programm) && trip.programm.length) {
    trip.programm.forEach((p) => {
      let slot = "vormittag";
      if (p.zeit && p.zeit >= "18:00") slot = "abend";
      else if (p.zeit && p.zeit >= "12:00") slot = "nachmittag";
      const entry = {
        id: "tp" + Date.now() + Math.random().toString(36).slice(2, 6),
        datum: p.datum || "",
        vormittag: "",
        nachmittag: "",
        abend: "",
        ort: p.ort || "",
        reservation: false,
        kosten: "",
        bemerkung: p.notizen || "",
        link: "",
      };
      entry[slot] = p.titel + (p.zeit ? ` (${p.zeit})` : "");
      trip.tagesplan.push(entry);
    });
    trip.programmMigriert = true;
    saveChange();
  }
}

function renderProgrammTab(el, trip) {
  if (!trip) {
    el.innerHTML = `
      <p class="hint">Noch keine Ferien angelegt.</p>
    `;
    return;
  }
  ensureProgrammStruktur(trip);

  trip.etappen = trip.etappen || [];
  const tagesplanSorted = [...trip.tagesplan].sort((a, b) => (a.datum || "").localeCompare(b.datum || ""));
  const ideenAll = [...trip.ideen].sort((a, b) => (a.kategorie || "").localeCompare(b.kategorie || "") || (a.idee || "").localeCompare(b.idee || ""));
  if (trip.etappen.length && !trip.etappen.some((e) => e.id === ideenEtappenFilter)) {
    ideenEtappenFilter = "alle";
  }
  const ideenSorted = ideenEtappenFilter === "alle"
    ? ideenAll
    : ideenEtappenFilter === "__ohne__"
      ? ideenAll.filter((i) => !i.etappenIds || !i.etappenIds.length)
      : ideenAll.filter((i) => Array.isArray(i.etappenIds) && i.etappenIds.includes(ideenEtappenFilter));

  el.innerHTML = `
    <section class="panel">
      <h2><i class="ti ti-calendar-event"></i> Programm - ${escapeHtml(trip.titel)}</h2>
    </section>
  `;

  const tpSection = document.createElement("section");
  tpSection.className = "panel prog-plan";
  const tpHeaderResult = collapsibleHeader("programm:tagesplan", `📅 Tagesplan (${tagesplanSorted.length})`, () => renderProgrammTab(el, trip));
  tpSection.appendChild(tpHeaderResult.header);
  const tpHint = document.createElement("p");
  tpHint.className = "hint-small";
  tpHint.textContent = "Konkrete Planung mit Datum - was steht wann an?";
  tpSection.appendChild(tpHint);
  const ansichtRow = document.createElement("div");
  ansichtRow.className = "chip-row";
  [["liste", "ti-list", "Liste"], ["woche", "ti-calendar-week", "Wochenplan"]].forEach(([k, ic, t]) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip" + (programmAnsicht === k ? " active" : "");
    b.innerHTML = '<i class="ti ' + ic + '"></i>' + t;
    b.onclick = () => { programmAnsicht = k; renderProgrammTab(el, trip); };
    ansichtRow.appendChild(b);
  });
  tpSection.appendChild(ansichtRow);
  const tpListDiv = document.createElement("div");
  tpListDiv.id = "tagesplan-list";
  if (!tpHeaderResult.isCollapsed) tpSection.appendChild(tpListDiv);
  const newTpBtn = document.createElement("button");
  newTpBtn.id = "new-tagesplan-button";
  newTpBtn.className = "secondary";
  newTpBtn.innerHTML = `<i class="ti ti-plus"></i> Neuer Tagesplan-Eintrag`;
  tpSection.appendChild(newTpBtn);
  el.appendChild(tpSection);

  const tpFormContainer = document.createElement("div");
  tpFormContainer.id = "tagesplan-form-container";
  el.appendChild(tpFormContainer);

  const ideenSection = document.createElement("section");
  ideenSection.className = "panel prog-ideen";
  const ideenCountLabel = ideenEtappenFilter === "alle" ? `${ideenAll.length}` : `${ideenSorted.length}/${ideenAll.length}`;
  const ideenHeaderResult = collapsibleHeader("programm:ideen", `💡 Ideensammlung (${ideenCountLabel})`, () => renderProgrammTab(el, trip));
  ideenSection.appendChild(ideenHeaderResult.header);
  const ideenHint = document.createElement("p");
  ideenHint.className = "hint-small";
  ideenHint.textContent = "Noch nicht eingeplante Ideen - Ausflüge, Restaurants, Aktivitäten ...";
  ideenSection.appendChild(ideenHint);
  if (!ideenHeaderResult.isCollapsed && trip.etappen.length) {
    const filterRow = document.createElement("label");
    filterRow.style.display = "block";
    filterRow.style.marginBottom = "8px";
    filterRow.innerHTML = `Nach Etappe filtern
      <select id="idee-etappen-filter">
        <option value="alle" ${ideenEtappenFilter === "alle" ? "selected" : ""}>Alle Etappen</option>
        <option value="__ohne__" ${ideenEtappenFilter === "__ohne__" ? "selected" : ""}>Ohne Etappe</option>
        ${trip.etappen.map((e) => `<option value="${escapeHtml(e.id)}" ${ideenEtappenFilter === e.id ? "selected" : ""}>${escapeHtml(etappenLabel(trip, e))}</option>`).join("")}
      </select>
    `;
    filterRow.querySelector("select").onchange = (e) => {
      ideenEtappenFilter = e.target.value;
      renderProgrammTab(el, trip);
    };
    ideenSection.appendChild(filterRow);
  }
  const ideenListDiv = document.createElement("div");
  ideenListDiv.id = "ideen-list";
  if (!ideenHeaderResult.isCollapsed) ideenSection.appendChild(ideenListDiv);
  const newIdeeBtn = document.createElement("button");
  newIdeeBtn.id = "new-idee-button";
  newIdeeBtn.className = "secondary";
  newIdeeBtn.innerHTML = `<i class="ti ti-plus"></i> Neue Idee`;
  ideenSection.appendChild(newIdeeBtn);
  el.appendChild(ideenSection);

  const ideeFormContainer = document.createElement("div");
  ideeFormContainer.id = "idee-form-container";
  el.appendChild(ideeFormContainer);

  const tpList = document.getElementById("tagesplan-list");
  if (tpList && !tagesplanSorted.length) {
    tpList.innerHTML = `<p class="hint-empty">Noch kein Tagesplan erfasst.</p>`;
  }
  if (tpList && programmAnsicht === "woche") renderWochenplan(trip, tpList, tagesplanSorted, () => renderProgrammTab(el, trip));
  else if (tpList) tagesplanSorted.forEach((p) => {
    const teile = [
      p.vormittag ? `<strong>Vormittag:</strong> ${escapeHtml(p.vormittag)}` : "",
      p.nachmittag ? `<strong>Nachmittag:</strong> ${escapeHtml(p.nachmittag)}` : "",
      p.abend ? `<strong>Abend:</strong> ${escapeHtml(p.abend)}` : "",
    ].filter(Boolean).join("<br />");
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <span style="flex:1">
        <span class="termin-badge">${p.datum ? escapeHtml(formatDate(p.datum)) : "Datum offen"}</span>
        ${p.ideeId && trip.ideen.some((i) => i.id === p.ideeId) ? ' <span class="prog-badge"><i class="ti ti-bulb"></i> aus Idee</span>' : ""}${p.reservation ? ` <i class="ti ti-alarm" title="Reservation nötig"></i>` : ""}
        <br />${teile || `<span class="hint-small" style="margin:0">-</span>`}
        ${p.ort ? `<br /><span class="hint-small" style="margin:0"><i class="ti ti-map-pin"></i> ${escapeHtml(p.ort)}</span>` : ""}
        ${p.kosten ? `<br /><span class="hint-small" style="margin:0">Kosten ca. ${escapeHtml(p.kosten)}</span>` : ""}
        ${p.link ? `<br /><a href="${escapeHtml(p.link)}" target="_blank" rel="noopener" class="hint-small">Link</a>` : ""}
        ${p.bemerkung ? `<br /><span class="hint-small" style="margin:0">${escapeHtml(p.bemerkung)}</span>` : ""}
      </span>
    `;
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "icon-btn";
    editBtn.innerHTML = `<i class="ti ti-pencil"></i>`;
    if (p.ideeId && trip.ideen.some((i) => i.id === p.ideeId)) {
      const backBtn = document.createElement("button");
      backBtn.type = "button"; backBtn.className = "icon-btn"; backBtn.title = "Zurück in die Ideensammlung";
      backBtn.innerHTML = '<i class="ti ti-arrow-back-up"></i>';
      backBtn.onclick = () => { trip.tagesplan = trip.tagesplan.filter((x) => x.id !== p.id); saveChange(); renderProgrammTab(el, trip); };
      row.appendChild(backBtn);
    }
    const geldBtn = document.createElement("button");
    geldBtn.type = "button"; geldBtn.className = "icon-btn"; geldBtn.title = "Ausgabe dazu erfassen (Finanzen)";
    geldBtn.innerHTML = '<i class="ti ti-cash"></i>';
    geldBtn.onclick = () => {
      finPrefill = { datum: p.datum || finToday(), details: p.vormittag || p.nachmittag || p.abend || p.ort || "", wo: p.ort || "" };
      editingFinanzId = "__neu__";
      navigateTab("finanzen");
    };
    row.appendChild(geldBtn);
    editBtn.onclick = () => { editingTagesplanId = p.id; renderProgrammTab(el, trip); };
    row.appendChild(editBtn);
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "icon-btn danger";
    delBtn.innerHTML = `<i class="ti ti-trash"></i>`;
    delBtn.onclick = () => {
      if (!confirm(`Diesen Tagesplan-Eintrag wirklich löschen?`)) return;
      trip.tagesplan = trip.tagesplan.filter((x) => x.id !== p.id);
      saveChange();
      renderProgrammTab(el, trip);
    };
    row.appendChild(delBtn);
    tpList.appendChild(row);
  });

  newTpBtn.onclick = () => { editingTagesplanId = "__neu__"; renderProgrammTab(el, trip); };
  if (editingTagesplanId) {
    tpFormContainer.appendChild(renderTagesplanForm(trip, () => renderProgrammTab(el, trip)));
  }

  const ideenList = document.getElementById("ideen-list");
  if (ideenList && !ideenSorted.length) {
    ideenList.innerHTML = `<p class="hint-empty">Noch keine Ideen erfasst.</p>`;
  }
  if (ideenList) ideenSorted.forEach((idee) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <span style="flex:1">
        <strong>${escapeHtml(idee.idee)}</strong>${ideePlanBadge(trip, idee)}${idee.kategorie ? ` <span class="hint-small">(${escapeHtml(idee.kategorie)})</span>` : ""}
        ${(Array.isArray(idee.etappenIds) && idee.etappenIds.length) ? `<br />${idee.etappenIds.map((eid) => {
          const e = trip.etappen.find((x) => x.id === eid);
          return e ? `<span class="chip" style="font-size:10px;padding:2px 8px"><i class="ti ti-map-pin"></i>${escapeHtml(e.titel)}</span>` : "";
        }).join(" ")}` : ""}
        ${idee.ort ? `<br /><span class="hint-small" style="margin:0"><i class="ti ti-map-pin"></i> ${escapeHtml(idee.ort)}</span>` : ""}
        ${idee.fahrzeit ? `<br /><span class="hint-small" style="margin:0">Fahrzeit: ${escapeHtml(idee.fahrzeit)}</span>` : ""}
        ${idee.kosten ? `<br /><span class="hint-small" style="margin:0">Kosten ca. ${escapeHtml(idee.kosten)}</span>` : ""}
        ${idee.googleMaps ? `<br /><a href="${escapeHtml(idee.googleMaps)}" target="_blank" rel="noopener" class="hint-small">Google Maps</a>` : ""}
        ${idee.link ? `<br /><a href="${escapeHtml(idee.link)}" target="_blank" rel="noopener" class="hint-small">Link</a>` : ""}
        ${idee.bemerkung ? `<br /><span class="hint-small" style="margin:0">${escapeHtml(idee.bemerkung)}</span>` : ""}
      </span>
    `;
    const toPlanBtn = document.createElement("button");
    toPlanBtn.type = "button";
    toPlanBtn.className = "icon-btn";
    toPlanBtn.title = "In Tagesplan übernehmen";
    toPlanBtn.innerHTML = `<i class="ti ti-calendar-plus"></i>`;
    const plan = trip.tagesplan.find((x) => x.ideeId === idee.id);
    if (plan) {
      row.classList.add("idee-eingeplant");
      toPlanBtn.title = "Eintrag im Tagesplan öffnen";
      toPlanBtn.innerHTML = '<i class="ti ti-calendar-check"></i>';
      toPlanBtn.onclick = () => { programmAnsicht = "liste"; editingTagesplanId = plan.id; renderProgrammTab(el, trip); };
    } else {
      toPlanBtn.onclick = () => {
        const neu = {
          id: "tp" + Date.now() + Math.random().toString(36).slice(2, 6),
          ideeId: idee.id, datum: "", vormittag: idee.idee, nachmittag: "", abend: "", ort: idee.ort || "",
          reservation: false, kosten: idee.kosten || "", bemerkung: idee.bemerkung || "", link: idee.link || idee.googleMaps || "",
        };
        trip.tagesplan.push(neu);
        saveChange();
        programmAnsicht = "liste";
        editingTagesplanId = neu.id;
        renderProgrammTab(el, trip);
      };
    }
    row.appendChild(toPlanBtn);
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "icon-btn";
    editBtn.innerHTML = `<i class="ti ti-pencil"></i>`;
    editBtn.onclick = () => { editingIdeeId = idee.id; renderProgrammTab(el, trip); };
    row.appendChild(editBtn);
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "icon-btn danger";
    delBtn.innerHTML = `<i class="ti ti-trash"></i>`;
    delBtn.onclick = () => {
      if (!confirm(`"${idee.idee}" wirklich löschen?`)) return;
      trip.ideen = trip.ideen.filter((x) => x.id !== idee.id);
      saveChange();
      renderProgrammTab(el, trip);
    };
    row.appendChild(delBtn);
    ideenList.appendChild(row);
  });

  newIdeeBtn.onclick = () => { editingIdeeId = "__neu__"; renderProgrammTab(el, trip); };
  if (editingIdeeId) {
    ideeFormContainer.appendChild(renderIdeeForm(trip, () => renderProgrammTab(el, trip)));
  }
}

function renderTagesplanForm(trip, onChange) {
  const isNew = editingTagesplanId === "__neu__";
  const existing = isNew ? null : trip.tagesplan.find((p) => p.id === editingTagesplanId);
  const p = existing || { datum: tagesplanNeuDatum || "", vormittag: "", nachmittag: "", abend: "", ort: "", reservation: false, kosten: "", bemerkung: "", link: "" };
  tagesplanNeuDatum = "";

  const form = document.createElement("form");
  form.className = "field-form panel";
  form.innerHTML = `
    <label><span><i class="ti ti-calendar"></i> Datum</span><input type="date" name="datum" value="${escapeHtml(p.datum)}" /></label>
    <label><span><i class="ti ti-sunrise"></i> Vormittag</span><input type="text" name="vormittag" value="${escapeHtml(p.vormittag)}" /></label>
    <label><span><i class="ti ti-sun"></i> Nachmittag</span><input type="text" name="nachmittag" value="${escapeHtml(p.nachmittag)}" /></label>
    <label><span><i class="ti ti-moon"></i> Abend</span><input type="text" name="abend" value="${escapeHtml(p.abend)}" /></label>
    <label><span><i class="ti ti-map-pin"></i> Ort</span><input type="text" name="ort" value="${escapeHtml(p.ort)}" /></label>
    <label style="display:flex;align-items:center;gap:6px;font-weight:normal">
      <input type="checkbox" name="reservation" ${p.reservation ? "checked" : ""} /> Reservation nötig?
    </label>
    <label><span><i class="ti ti-cash"></i> Kosten</span><input type="text" name="kosten" value="${escapeHtml(p.kosten)}" placeholder="ca. CHF ..." /></label>
    <label><span><i class="ti ti-link"></i> Link</span><input type="url" name="link" value="${escapeHtml(p.link)}" placeholder="https://..." /></label>
    <label><span><i class="ti ti-message-2"></i> Bemerkung</span><textarea name="bemerkung" rows="2">${escapeHtml(p.bemerkung)}</textarea></label>
    <div class="form-actions">
      <button type="submit"><i class="ti ti-check"></i> Speichern</button>
      <button type="button" id="cancel-tagesplan" class="secondary">Abbrechen</button>
      ${existing ? `<button type="button" id="delete-tagesplan" class="danger"><i class="ti ti-trash"></i></button>` : ""}
    </div>
  `;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const values = Object.fromEntries(fd.entries());
    values.reservation = fd.get("reservation") === "on";
    if (isNew) {
      trip.tagesplan.push({ id: "tp" + Date.now() + Math.random().toString(36).slice(2, 6), ...values });
    } else {
      Object.assign(existing, values);
    }
    saveChange();
    editingTagesplanId = null;
    onChange();
  });

  form.querySelector("#cancel-tagesplan").onclick = () => { editingTagesplanId = null; onChange(); };
  const deleteBtn = form.querySelector("#delete-tagesplan");
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      if (!confirm(`Diesen Tagesplan-Eintrag wirklich löschen?`)) return;
      trip.tagesplan = trip.tagesplan.filter((x) => x.id !== existing.id);
      saveChange();
      editingTagesplanId = null;
      onChange();
    };
  }

  return form;
}

function renderIdeeForm(trip, onChange) {
  const isNew = editingIdeeId === "__neu__";
  const existing = isNew ? null : trip.ideen.find((i) => i.id === editingIdeeId);
  const idee = existing || { idee: "", kategorie: "", ort: "", googleMaps: "", fahrzeit: "", bemerkung: "", link: "", kosten: "", etappenIds: [] };
  const selectedEtappenIds = new Set(idee.etappenIds || []);

  const form = document.createElement("form");
  form.className = "field-form panel";
  form.innerHTML = `
    <label><span><i class="ti ti-bulb"></i> Idee</span><input type="text" name="idee" value="${escapeHtml(idee.idee)}" required /></label>
    ${(trip.etappen && trip.etappen.length) ? `
    <div>
      <label style="display:block;margin-bottom:4px;font-weight:600">Etappe(n) - einer, mehreren oder allen Destinationen zuweisen</label>
      <div class="chip-row" id="idee-etappen-chiprow"></div>
    </div>` : ""}
    <label><span><i class="ti ti-tag"></i> Kategorie</span><input type="text" name="kategorie" value="${escapeHtml(idee.kategorie)}" placeholder="z. B. Ausflug, Restaurant, Baden ..." /></label>
    <label><span><i class="ti ti-map-pin"></i> Ort</span><input type="text" name="ort" value="${escapeHtml(idee.ort)}" /></label>
    <label><span><i class="ti ti-map"></i> Google-Maps-Link</span><input type="url" name="googleMaps" value="${escapeHtml(idee.googleMaps)}" placeholder="https://maps.google.com/..." /></label>
    <label><span><i class="ti ti-clock"></i> Fahrzeit</span><input type="text" name="fahrzeit" value="${escapeHtml(idee.fahrzeit)}" placeholder="z. B. 25 Min." /></label>
    <label><span><i class="ti ti-cash"></i> Kosten ca.</span><input type="text" name="kosten" value="${escapeHtml(idee.kosten)}" /></label>
    <label><span><i class="ti ti-link"></i> Link</span><input type="url" name="link" value="${escapeHtml(idee.link)}" placeholder="https://..." /></label>
    <label><span><i class="ti ti-message-2"></i> Bemerkung</span><textarea name="bemerkung" rows="2">${escapeHtml(idee.bemerkung)}</textarea></label>
    <div class="form-actions">
      <button type="submit"><i class="ti ti-check"></i> Speichern</button>
      <button type="button" id="cancel-idee" class="secondary">Abbrechen</button>
      ${existing ? `<button type="button" id="delete-idee" class="danger"><i class="ti ti-trash"></i></button>` : ""}
    </div>
  `;

  const katInp = form.querySelector('input[name="kategorie"]');
  const katVorschlaege = finUniq(["Ausflug", "Restaurant", "Baden", "Wandern", "Sehenswürdigkeit", "Einkaufen", "Aktivität", "Schlechtwetter", ...trip.ideen.map((i) => i.kategorie)]);
  const katRow = document.createElement("div");
  katRow.className = "chip-row";
  const zeichneKat = () => {
    katRow.innerHTML = "";
    katVorschlaege.forEach((k) => {
      const c = document.createElement("button");
      c.type = "button"; c.className = "chip" + (katInp.value.trim() === k ? " active" : ""); c.textContent = k;
      c.onclick = () => { katInp.value = katInp.value.trim() === k ? "" : k; zeichneKat(); };
      katRow.appendChild(c);
    });
  };
  katInp.parentElement.after(katRow);
  katInp.addEventListener("input", zeichneKat);
  zeichneKat();

  if (trip.etappen && trip.etappen.length) {
    const chipRow = form.querySelector("#idee-etappen-chiprow");
    const renderChips = () => {
      chipRow.innerHTML = "";
      trip.etappen.forEach((e) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip" + (selectedEtappenIds.has(e.id) ? " active" : "");
        chip.textContent = etappenLabel(trip, e);
        chip.onclick = () => {
          if (selectedEtappenIds.has(e.id)) selectedEtappenIds.delete(e.id);
          else selectedEtappenIds.add(e.id);
          renderChips();
        };
        chipRow.appendChild(chip);
      });
      const allActive = trip.etappen.every((e) => selectedEtappenIds.has(e.id));
      const allChip = document.createElement("button");
      allChip.type = "button";
      allChip.className = "chip" + (allActive ? " active" : "");
      allChip.innerHTML = `<i class="ti ti-list"></i>Alle`;
      allChip.onclick = () => {
        if (allActive) selectedEtappenIds.clear();
        else trip.etappen.forEach((e) => selectedEtappenIds.add(e.id));
        renderChips();
      };
      chipRow.appendChild(allChip);
    };
    renderChips();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const values = Object.fromEntries(fd.entries());
    values.etappenIds = Array.from(selectedEtappenIds);
    if (isNew) {
      trip.ideen.push({ id: "idee" + Date.now() + Math.random().toString(36).slice(2, 6), ...values });
    } else {
      Object.assign(existing, values);
    }
    saveChange();
    editingIdeeId = null;
    onChange();
  });

  form.querySelector("#cancel-idee").onclick = () => { editingIdeeId = null; onChange(); };
  const deleteBtn = form.querySelector("#delete-idee");
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      if (!confirm(`"${existing.idee}" wirklich löschen?`)) return;
      trip.ideen = trip.ideen.filter((x) => x.id !== existing.id);
      saveChange();
      editingIdeeId = null;
      onChange();
    };
  }

  return form;
}

// ===========================================================
// TAB: FINANZEN (Ausgaben pro Ferien, Aufteilung, Abrechnung, Export)
// Datenmodell Position: { id, datum, kategorie, details, wo, betrag, waehrung,
//   zahlungsart, bezahltVon, anteile:[{person, betrag}], abgerechnet, notizen }
// "anteile" = Beträge, die ANDERE Personen übernehmen; den Rest trägt der Zahler.
// Trip: finAusgleiche[], finPersonen[], finWaehrungen[], finZahlarten[], finKurse{}, finHauptwaehrung
// ===========================================================
let editingFinanzId = null;
let finAuswertungOffen = false;
let finPrefill = null;
const FIN_FIX_PERSONEN = ["Benzo", "Marielle"];
const FIN_WAEHRUNGEN = [["CHF", "CHF"], ["EUR", "EUR"], ["USD", "USD"], ["GBP", "GBP (Pfund Sterling)"]];
const FIN_KATEGORIEN = ["Unterkunft", "Essen & Trinken", "Einkäufe", "Transport & Treibstoff", "Aktivitäten & Eintritte", "Gebühren (Maut, Parkplatz)", "Sonstiges"];
const FIN_ZAHLARTEN = ["Bar", "Kreditkarte", "Maestro"];

function finToday() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
function finNum(x) {
  const n = Number(String(x == null ? "" : x).replace(",", "."));
  return isFinite(n) ? n : 0;
}
function finRound(n) { return Math.round(n * 100) / 100; }
function finFmt(n) { return finRound(n).toFixed(2); }

function finNormalize(trip) {
  trip.finanzen = trip.finanzen || [];
  trip.finAusgleiche = trip.finAusgleiche || [];
  trip.finPersonen = trip.finPersonen || [];
  trip.finWaehrungen = trip.finWaehrungen || [];
  trip.finZahlarten = trip.finZahlarten || [];
  trip.finKurse = trip.finKurse || {};
  trip.finHauptwaehrung = trip.finHauptwaehrung || "CHF";
  trip.finanzen.forEach((f) => {
    if (f.details === undefined) f.details = f.beschreibung || "";
    if (!Array.isArray(f.anteile)) f.anteile = [];
    if (f.abgerechnet === undefined) f.abgerechnet = false;
    if (!f.waehrung) f.waehrung = "CHF";
  });
}
function finUniq(arr) {
  const seen = new Set();
  return arr.filter((x) => x && !seen.has(x) && seen.add(x));
}
function finPersonen(trip) {
  const l = [...FIN_FIX_PERSONEN, ...trip.finPersonen];
  trip.finanzen.forEach((f) => { l.push(f.bezahltVon); (f.anteile || []).forEach((a) => l.push(a.person)); });
  trip.finAusgleiche.forEach((a) => { l.push(a.von); l.push(a.an); });
  return finUniq(l);
}
function finKategorien(trip) {
  const dd = getData();
  dd.finKategorienEigen = dd.finKategorienEigen || [];
  return finUniq([...FIN_KATEGORIEN, ...dd.finKategorienEigen, ...trip.finanzen.map((f) => f.kategorie)]);
}
function finWaehrungenListe(trip) {
  const l = FIN_WAEHRUNGEN.map((x) => x.slice());
  const known = new Set(l.map((x) => x[0]));
  finUniq([...trip.finWaehrungen, ...trip.finanzen.map((f) => f.waehrung), trip.finHauptwaehrung]).forEach((w) => { if (!known.has(w)) l.push([w, w]); });
  return l;
}
function finZahlartenListe(trip) {
  return finUniq([...FIN_ZAHLARTEN, ...trip.finZahlarten, ...trip.finanzen.map((f) => f.zahlungsart)]);
}

/** Verteilung einer Position: { Person: Betrag }. Der Zahler trägt den Rest. */
function finShareMap(f) {
  const betrag = finNum(f.betrag);
  const m = {};
  let rest = betrag;
  (f.anteile || []).forEach((a) => {
    const b = finNum(a.betrag);
    if (!a.person || a.person === f.bezahltVon || !b) return;
    m[a.person] = (m[a.person] || 0) + b;
    rest -= b;
  });
  if (f.bezahltVon) m[f.bezahltVon] = (m[f.bezahltVon] || 0) + rest;
  return m;
}

function finBerechne(trip) {
  const R = { gesamt: {}, kat: {}, bezahlt: {}, anteil: {}, net: {} };
  const add = (o, w, k, v) => { o[w] = o[w] || {}; o[w][k] = (o[w][k] || 0) + v; };
  trip.finanzen.forEach((f) => {
    const w = f.waehrung || "CHF";
    const b = finNum(f.betrag);
    R.gesamt[w] = (R.gesamt[w] || 0) + b;
    const k = f.kategorie || "Ohne Kategorie";
    R.kat[k] = R.kat[k] || {};
    R.kat[k][w] = (R.kat[k][w] || 0) + b;
    if (f.bezahltVon) add(R.bezahlt, w, f.bezahltVon, b);
    const sh = finShareMap(f);
    Object.keys(sh).forEach((p) => add(R.anteil, w, p, sh[p]));
    if (!f.abgerechnet && f.bezahltVon) {
      Object.keys(sh).forEach((p) => {
        if (p === f.bezahltVon) return;
        add(R.net, w, f.bezahltVon, sh[p]);
        add(R.net, w, p, -sh[p]);
      });
    }
  });
  trip.finAusgleiche.forEach((a) => {
    if (a.abgerechnet) return;
    const w = a.waehrung || "CHF";
    const b = finNum(a.betrag);
    add(R.net, w, a.von, b);
    add(R.net, w, a.an, -b);
  });
  return R;
}

function finVorschlaege(net) {
  const cr = [], de = [];
  Object.keys(net || {}).forEach((p) => {
    const v = finRound(net[p]);
    if (v > 0.004) cr.push({ p, v });
    else if (v < -0.004) de.push({ p, v: -v });
  });
  cr.sort((a, b) => b.v - a.v);
  de.sort((a, b) => b.v - a.v);
  const out = [];
  let i = 0, j = 0;
  while (i < cr.length && j < de.length) {
    const x = Math.min(cr[i].v, de[j].v);
    out.push({ von: de[j].p, an: cr[i].p, betrag: finRound(x) });
    cr[i].v -= x; de[j].v -= x;
    if (cr[i].v < 0.005) i++;
    if (de[j].v < 0.005) j++;
  }
  return out;
}

function finKonv(sumsW, trip) {
  const h = trip.finHauptwaehrung || "CHF";
  let tot = 0, ok = true;
  Object.keys(sumsW).forEach((w) => {
    const v = sumsW[w];
    if (!v) return;
    if (w === h) tot += v;
    else {
      const k = finNum(trip.finKurse[w]);
      if (k > 0) tot += v * k; else ok = false;
    }
  });
  return ok ? tot : null;
}
function finSumStr(sumsW) {
  const parts = Object.keys(sumsW || {}).filter((w) => Math.abs(sumsW[w]) > 0.004).map((w) => finFmt(sumsW[w]) + " " + escapeHtml(w));
  return parts.length ? parts.join(" · ") : "–";
}
function finSumMitKonv(sumsW, trip) {
  let s = finSumStr(sumsW);
  const waehrungen = Object.keys(sumsW || {}).filter((w) => Math.abs(sumsW[w]) > 0.004);
  if (waehrungen.length > 1 || (waehrungen.length === 1 && waehrungen[0] !== trip.finHauptwaehrung)) {
    const k = finKonv(sumsW, trip);
    if (k !== null) s += ` <span class="hint-small">(≈ ${finFmt(k)} ${escapeHtml(trip.finHauptwaehrung)})</span>`;
  }
  return s;
}

// ---------- kleine UI-Helfer ----------
/** Auswahlfeld mit Eintrag "+ Neu ...", der per Eingabedialog einen eigenen Wert ergänzt. */
function finSelect(name, options, value, opt) {
  const sel = document.createElement("select");
  sel.name = name;
  const opts = options.slice();
  const val = (x) => (Array.isArray(x) ? x[0] : x);
  const txt = (x) => (Array.isArray(x) ? x[1] : x);
  const fill = (v) => {
    sel.innerHTML = "";
    if (opt.placeholder) {
      const o = document.createElement("option");
      o.value = ""; o.textContent = opt.placeholder; sel.appendChild(o);
    }
    if (v && !opts.some((x) => val(x) === v)) opts.push(v);
    opts.forEach((x) => {
      const o = document.createElement("option");
      o.value = val(x); o.textContent = txt(x); sel.appendChild(o);
    });
    if (opt.neuLabel) {
      const o = document.createElement("option");
      o.value = "__neu__"; o.textContent = opt.neuLabel; sel.appendChild(o);
    }
    sel.value = v || "";
  };
  fill(value);
  let prev = sel.value;
  sel.addEventListener("change", () => {
    if (sel.value !== "__neu__") { prev = sel.value; return; }
    let t = (prompt(opt.neuPrompt || "Neuer Eintrag:") || "").trim();
    if (opt.upper) t = t.toUpperCase();
    if (!t) { sel.value = prev; return; }
    if (opt.onNew) opt.onNew(t);
    fill(t);
    prev = t;
    sel.dispatchEvent(new Event("fin-neu"));
  });
  return sel;
}
function finKatSelect(trip, value, placeholder) {
  return finSelect("kategorie", finKategorien(trip), value, {
    placeholder, neuLabel: "+ Eigene Kategorie ...", neuPrompt: "Name der neuen Kategorie:",
    onNew: (t) => { const dd = getData(); dd.finKategorienEigen = dd.finKategorienEigen || []; if (!dd.finKategorienEigen.includes(t)) dd.finKategorienEigen.push(t); saveChange(); },
  });
}
function finWaehrungSelect(trip, value) {
  return finSelect("waehrung", finWaehrungenListe(trip), value, {
    neuLabel: "+ Andere ...", neuPrompt: "Währung (Kürzel, z. B. SEK, CZK, HRK):", upper: true,
    onNew: (t) => { if (!trip.finWaehrungen.includes(t)) trip.finWaehrungen.push(t); saveChange(); },
  });
}
function finZahlSelect(trip, value, placeholder) {
  return finSelect("zahlungsart", finZahlartenListe(trip), value, {
    placeholder, neuLabel: "+ Andere ...", neuPrompt: "Zahlungsart (z. B. Twint, Debit):",
    onNew: (t) => { if (!trip.finZahlarten.includes(t)) trip.finZahlarten.push(t); saveChange(); },
  });
}
function finPersonSelect(trip, name, value, placeholder, exclude) {
  const list = finPersonen(trip).filter((p) => p !== exclude);
  return finSelect(name, list, value, {
    placeholder, neuLabel: "+ Neue Person ...", neuPrompt: "Name der Person:",
    onNew: (t) => { if (!trip.finPersonen.includes(t) && !FIN_FIX_PERSONEN.includes(t)) trip.finPersonen.push(t); saveChange(); },
  });
}

// ---------- Tab ----------
function renderFinanzenTab(el, trip) {
  if (!trip) {
    el.innerHTML = `<p class="hint">Noch keine Ferien angelegt.</p>`;
    return;
  }
  finNormalize(trip);
  const rerender = () => renderFinanzenTab(el, trip);
  const sorted = [...trip.finanzen].sort((a, b) => (a.datum || "").localeCompare(b.datum || ""));
  const R = finBerechne(trip);

  el.innerHTML = `
    <section class="panel fin-top">
      <h2><i class="ti ti-cash"></i> Finanzen - ${escapeHtml(trip.titel)}</h2>
      <p class="fin-total"><strong>Total:</strong> ${finSumMitKonv(R.gesamt, trip)}</p>
      <div class="fin-actions">
        <button type="button" id="new-finanz-button" class="secondary"><i class="ti ti-plus"></i> Neue Ausgabe</button>
        <button type="button" id="fin-export-csv" class="secondary"><i class="ti ti-file-type-csv"></i> CSV</button>
        <button type="button" id="fin-export-xlsx" class="secondary"><i class="ti ti-file-spreadsheet"></i> Excel</button>
      </div>
    </section>
    <div id="finanzen-form-container"></div>
    <section class="panel">
      <h3><i class="ti ti-table"></i> Ausgaben (${sorted.length})</h3>
      <div class="fin-wrap"><div class="fin-grid" id="finanzen-list"></div></div>
    </section>
    <section class="panel" id="fin-saldo"></section>
    <details class="panel fin-details" id="fin-auswertung" ${finAuswertungOffen ? "open" : ""}></details>
  `;

  el.querySelector("#new-finanz-button").onclick = () => { editingFinanzId = "__neu__"; rerender(); };
  el.querySelector("#fin-export-csv").onclick = () => finExportCsv(trip);
  el.querySelector("#fin-export-xlsx").onclick = () => finExportXlsx(trip);

  const formContainer = el.querySelector("#finanzen-form-container");
  if (editingFinanzId) {
    const form = renderFinanzForm(trip, rerender);
    formContainer.appendChild(form);
    setTimeout(() => form.scrollIntoView({ behavior: "smooth", block: "nearest" }), 0);
  }

  // Tabelle: Kopf, Datenzeilen, Platzhalter, Erfassungszeile
  const grid = el.querySelector("#finanzen-list");
  const head = document.createElement("div");
  head.className = "fin-row fin-head";
  head.innerHTML = ["Datum", "Kategorie", "Details", "Wo", "Betrag", "Zahlungsart", "Bezahlt von", "Aufteilung", ""].map((h) => `<div>${h}</div>`).join("");
  grid.appendChild(head);
  sorted.forEach((f) => grid.appendChild(finDataRow(trip, f, rerender)));
  if (!sorted.length) {
    for (let i = 0; i < 3; i++) {
      const ph = document.createElement("div");
      ph.className = "fin-row fin-ph";
      ph.innerHTML = "<div></div>".repeat(9);
      grid.appendChild(ph);
    }
  }
  grid.appendChild(finEntryRow(trip, rerender));

  finRenderSaldo(el.querySelector("#fin-saldo"), trip, R, rerender);
  finRenderAuswertung(el.querySelector("#fin-auswertung"), trip, R, rerender);
}

function finDataRow(trip, f, rerender) {
  const row = document.createElement("div");
  row.className = "fin-row fin-data" + (f.abgerechnet ? " fin-done" : "");
  const shares = (f.anteile || []).filter((a) => a.person && finNum(a.betrag));
  const teil = shares.map((a) => escapeHtml(a.person) + " " + finFmt(finNum(a.betrag))).join(", ");
  row.innerHTML = `
    <div class="fin-c-datum">${f.datum ? formatDate(f.datum) : ""}</div>
    <div class="fin-c-kat">${escapeHtml(f.kategorie || "")}</div>
    <div class="fin-c-details">${escapeHtml(f.details || "")}${f.notizen ? ` <i class="ti ti-notes" title="${escapeHtml(f.notizen)}"></i>` : ""}</div>
    <div class="fin-c-wo" data-l="Wo: ">${escapeHtml(f.wo || "")}</div>
    <div class="fin-c-betrag">${finFmt(finNum(f.betrag))} ${escapeHtml(f.waehrung || "CHF")}</div>
    <div class="fin-c-zahl">${escapeHtml(f.zahlungsart || "")}</div>
    <div class="fin-c-von" data-l="Von: ">${escapeHtml(f.bezahltVon || "")}</div>
    <div class="fin-c-teil" data-l="Teilung: ">${teil}</div>
    <div class="fin-c-act"></div>
  `;
  row.style.cursor = "pointer";
  row.title = "Zum Bearbeiten anklicken";
  row.onclick = (e) => { if (e.target.closest("input,button,select,a")) return; editingFinanzId = f.id; rerender(); };
  const act = row.querySelector(".fin-c-act");
  const cb = document.createElement("input");
  cb.type = "checkbox"; cb.checked = !!f.abgerechnet; cb.title = "Abgerechnet";
  cb.onchange = () => { f.abgerechnet = cb.checked; saveChange(); rerender(); };
  act.appendChild(cb);
  const edit = document.createElement("button");
  edit.type = "button"; edit.className = "icon-btn"; edit.title = "Bearbeiten";
  edit.innerHTML = `<i class="ti ti-pencil"></i>`;
  edit.onclick = () => { editingFinanzId = f.id; rerender(); };
  act.appendChild(edit);
  return row;
}

/** Erfassungszeile direkt in der Tabelle (am Handy: untereinander angeordnet). */
function finEntryRow(trip, rerender) {
  const last = trip.finanzen[trip.finanzen.length - 1] || {};
  const row = document.createElement("form");
  row.className = "fin-row fin-entry";
  const cell = (cls, node) => {
    const d = document.createElement("div");
    d.className = cls;
    d.appendChild(node);
    row.appendChild(d);
    return d;
  };
  const inp = (type, name, ph, val) => {
    const i = document.createElement("input");
    i.type = type; i.name = name; i.placeholder = ph || ""; if (val !== undefined) i.value = val;
    return i;
  };
  cell("fin-c-datum", inp("date", "datum", "", last.datum || finToday()));
  cell("fin-c-kat", finKatSelect(trip, "", "Kategorie ..."));
  const det = inp("text", "details", "Details (neu erfassen)");
  cell("fin-c-details", det);
  cell("fin-c-wo", inp("text", "wo", "Wo"));
  const bc = document.createElement("div");
  bc.className = "fin-betrag-edit";
  const bi = inp("number", "betrag", "Betrag"); bi.step = "0.01"; bi.inputMode = "decimal";
  bc.appendChild(bi);
  bc.appendChild(finWaehrungSelect(trip, last.waehrung || trip.finHauptwaehrung));
  cell("fin-c-betrag", bc);
  cell("fin-c-zahl", finZahlSelect(trip, last.zahlungsart || "", "Zahlungsart"));
  cell("fin-c-von", finPersonSelect(trip, "bezahltVon", last.bezahltVon || "Benzo", "Bezahlt von", null));
  const teil = document.createElement("select");
  teil.name = "teilen";
  teil.innerHTML = `<option value="">Nicht teilen</option><option value="halb">50 / 50</option><option value="detail">Details ...</option>`;
  cell("fin-c-teil", teil);
  const add = document.createElement("button");
  add.type = "submit"; add.title = "Hinzufügen"; add.innerHTML = `<i class="ti ti-plus"></i>`;
  cell("fin-c-act", add);

  row.addEventListener("submit", (e) => {
    e.preventDefault();
    const g = (n) => row.elements[n].value;
    const betrag = finNum(g("betrag"));
    if (!betrag) { bi.focus(); return; }
    if (!g("details").trim() && !g("wo").trim()) { det.focus(); return; }
    const pos = {
      id: "fin" + Date.now() + Math.random().toString(36).slice(2, 6),
      datum: g("datum"), kategorie: g("kategorie"), details: g("details").trim(), wo: g("wo").trim(),
      betrag, waehrung: g("waehrung") || "CHF", zahlungsart: g("zahlungsart"), bezahltVon: g("bezahltVon"),
      anteile: [], abgerechnet: false, notizen: "",
    };
    const t = g("teilen");
    if (t === "halb" || t === "detail") {
      const other = finPersonen(trip).find((p) => p !== pos.bezahltVon);
      if (other) pos.anteile = [{ person: other, betrag: t === "halb" ? finRound(betrag / 2) : 0 }];
    }
    trip.finanzen.push(pos);
    saveChange();
    if (t === "detail") editingFinanzId = pos.id;
    rerender();
  });
  return row;
}

function finOpenForm(trip, id, rerender) { editingFinanzId = id; rerender(); }

/** Vollständiges Formular (neue Ausgabe / Bearbeiten) inkl. Aufteilung. */
function renderFinanzForm(trip, onChange) {
  const isNew = editingFinanzId === "__neu__";
  const existing = isNew ? null : trip.finanzen.find((x) => x.id === editingFinanzId);
  const last = trip.finanzen[trip.finanzen.length - 1] || {};
  const f = existing || {
    datum: finToday(), kategorie: "", details: "", wo: "", betrag: "", waehrung: last.waehrung || trip.finHauptwaehrung,
    zahlungsart: last.zahlungsart || "", bezahltVon: last.bezahltVon || "Benzo", anteile: [], abgerechnet: false, notizen: "",
  };
  if (isNew && finPrefill) { Object.assign(f, finPrefill); finPrefill = null; }
  const anteile = (f.anteile || []).map((a) => ({ person: a.person, betrag: a.betrag }));

  const form = document.createElement("form");
  form.className = "field-form panel fin-form";
  form.innerHTML = `
    <h3><i class="ti ti-receipt"></i> ${existing ? "Ausgabe bearbeiten" : "Neue Ausgabe"}</h3>
    <div class="field-row">
      <label><span><i class="ti ti-calendar"></i> Datum</span><input type="date" name="datum" value="${escapeHtml(f.datum || "")}" /></label>
      <label class="fin-f-kat"><span><i class="ti ti-tag"></i> Kategorie</span></label>
    </div>
    <label><span><i class="ti ti-file-description"></i> Details</span><input type="text" name="details" value="${escapeHtml(f.details || "")}" /></label>
    <label><span><i class="ti ti-building-store"></i> Wo</span><input type="text" name="wo" value="${escapeHtml(f.wo || "")}" placeholder="Restaurant, Laden, Campingplatz ..." /></label>
    <div class="field-row">
      <label><span><i class="ti ti-cash"></i> Betrag</span><input type="number" step="0.01" inputmode="decimal" name="betrag" value="${escapeHtml(String(f.betrag))}" required /></label>
      <label class="fin-f-waehrung"><span><i class="ti ti-currency-dollar"></i> Währung</span></label>
    </div>
    <div class="field-row">
      <label class="fin-f-zahl"><span><i class="ti ti-credit-card"></i> Zahlungsart</span></label>
      <label class="fin-f-von"><span><i class="ti ti-user"></i> Bezahlt von</span></label>
    </div>
    <div class="fin-split">
      <div class="fin-split-title"><i class="ti ti-users"></i> Aufteilung <span class="hint-small">(Beträge, die andere Personen übernehmen - den Rest trägt der Zahler)</span></div>
      <div id="fin-anteile"></div>
      <div class="fin-split-btns">
        <button type="button" class="secondary" id="fin-add-anteil"><i class="ti ti-user-plus"></i> Person</button>
        <button type="button" class="secondary" id="fin-halb"><i class="ti ti-percentage-50"></i> 50 / 50</button>
        <button type="button" class="secondary" id="fin-alles"><i class="ti ti-arrow-big-right"></i> Alles die andere Person</button>
      </div>
      <p class="hint-small" id="fin-rest"></p>
    </div>
    <label class="checkbox-label"><input type="checkbox" name="abgerechnet" ${f.abgerechnet ? "checked" : ""} /> <span><i class="ti ti-checks"></i> Abgerechnet</span></label>
    <label><span><i class="ti ti-notes"></i> Notizen</span><textarea name="notizen" rows="2">${escapeHtml(f.notizen || "")}</textarea></label>
    <div class="form-actions">
      <button type="submit"><i class="ti ti-check"></i> Speichern</button>
      <button type="button" id="cancel-finanz" class="secondary">Abbrechen</button>
      ${existing ? `<button type="button" id="delete-finanz" class="danger"><i class="ti ti-trash"></i></button>` : ""}
    </div>
  `;

  const katSel = finKatSelect(trip, f.kategorie || "", "(keine)");
  form.querySelector(".fin-f-kat").appendChild(katSel);
  const wSel = finWaehrungSelect(trip, f.waehrung || "CHF");
  form.querySelector(".fin-f-waehrung").appendChild(wSel);
  const zSel = finZahlSelect(trip, f.zahlungsart || "", "(keine)");
  form.querySelector(".fin-f-zahl").appendChild(zSel);
  const vSel = finPersonSelect(trip, "bezahltVon", f.bezahltVon || "", "(niemand)", null);
  form.querySelector(".fin-f-von").appendChild(vSel);

  const betragInp = form.elements["betrag"];
  const anteileDiv = form.querySelector("#fin-anteile");
  const restP = form.querySelector("#fin-rest");
  const updateRest = () => {
    const sum = anteile.reduce((s, a) => s + (a.person ? finNum(a.betrag) : 0), 0);
    const rest = finNum(betragInp.value) - sum;
    restP.innerHTML = vSel.value
      ? ` ${escapeHtml(vSel.value)} trägt selbst: <strong>${finFmt(rest)} ${escapeHtml(wSel.value)}</strong>${rest < -0.004 ? ' <span style="color:#b3261e">- Anteile höher als Betrag!</span>' : ""}`
      : "Bitte „Bezahlt von“ wählen, damit Aufteilung und Saldo berechnet werden können.";
  };
  const drawAnteile = () => {
    anteileDiv.innerHTML = "";
    anteile.forEach((a, idx) => {
      const r = document.createElement("div");
      r.className = "fin-anteil-row";
      const ps = finPersonSelect(trip, "p" + idx, a.person || "", "Person ...", vSel.value);
      ps.onchange = () => { if (ps.value !== "__neu__") { a.person = ps.value; updateRest(); } };
      ps.addEventListener("fin-neu", () => { a.person = ps.value; updateRest(); });
      const bi = document.createElement("input");
      bi.type = "number"; bi.step = "0.01"; bi.inputMode = "decimal"; bi.placeholder = "Anteil";
      bi.value = a.betrag === "" || a.betrag === undefined ? "" : a.betrag;
      bi.oninput = () => { a.betrag = bi.value; updateRest(); };
      const del = document.createElement("button");
      del.type = "button"; del.className = "icon-btn danger"; del.innerHTML = `<i class="ti ti-x"></i>`;
      del.onclick = () => { anteile.splice(idx, 1); drawAnteile(); };
      const cur = document.createElement("span");
      cur.className = "hint-small"; cur.textContent = wSel.value;
      r.append(ps, bi, cur, del);
      anteileDiv.appendChild(r);
    });
    updateRest();
  };
  const andere = () => finPersonen(trip).find((p) => p !== vSel.value) || "";
  form.querySelector("#fin-add-anteil").onclick = () => { anteile.push({ person: andere(), betrag: "" }); drawAnteile(); };
  form.querySelector("#fin-halb").onclick = () => {
    const p = andere();
    anteile.length = 0;
    anteile.push({ person: p, betrag: finRound(finNum(betragInp.value) / 2) });
    drawAnteile();
  };
  form.querySelector("#fin-alles").onclick = () => {
    anteile.length = 0;
    anteile.push({ person: andere(), betrag: finRound(finNum(betragInp.value)) });
    drawAnteile();
  };
  betragInp.oninput = updateRest;
  wSel.addEventListener("change", drawAnteile);
  vSel.addEventListener("change", () => {
    anteile.forEach((a) => { if (a.person === vSel.value) a.person = ""; });
    drawAnteile();
  });
  drawAnteile();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const values = {
      datum: fd.get("datum") || "", kategorie: katSel.value, details: (fd.get("details") || "").trim(), wo: (fd.get("wo") || "").trim(),
      betrag: finNum(fd.get("betrag")), waehrung: wSel.value || "CHF", zahlungsart: zSel.value, bezahltVon: vSel.value,
      anteile: anteile.filter((a) => a.person && finNum(a.betrag)).map((a) => ({ person: a.person, betrag: finNum(a.betrag) })),
      abgerechnet: form.elements["abgerechnet"].checked, notizen: (fd.get("notizen") || "").trim(),
    };
    if (isNew) trip.finanzen.push({ id: "fin" + Date.now() + Math.random().toString(36).slice(2, 6), ...values });
    else Object.assign(existing, values);
    saveChange();
    editingFinanzId = null;
    onChange();
  });
  form.querySelector("#cancel-finanz").onclick = () => { editingFinanzId = null; onChange(); };
  const deleteBtn = form.querySelector("#delete-finanz");
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      const idx = trip.finanzen.findIndex((x) => x.id === existing.id);
      const removed = trip.finanzen.splice(idx, 1)[0];
      saveChange();
      editingFinanzId = null;
      onChange();
      showUndoToast("Ausgabe gelöscht", () => {
        trip.finanzen.splice(Math.min(idx, trip.finanzen.length), 0, removed);
        saveChange();
        onChange();
      });
    };
  }
  return form;
}

// ---------- Saldo / Abrechnung ----------
function finRenderSaldo(sec, trip, R, rerender) {
  const waehrungen = Object.keys(R.net).filter((w) => finVorschlaege(R.net[w]).length);
  let html = `<h3><i class="ti ti-scale"></i> Abrechnung</h3>`;
  if (!waehrungen.length) {
    html += `<p class="hint-small">Keine offenen Beträge zwischen den Personen.</p>`;
  } else {
    waehrungen.forEach((w) => {
      finVorschlaege(R.net[w]).forEach((v, i) => {
        html += `<div class="fin-saldo-row"><span><strong>${escapeHtml(v.von)}</strong> schuldet <strong>${escapeHtml(v.an)}</strong> <strong>${finFmt(v.betrag)} ${escapeHtml(w)}</strong></span>
          <button type="button" class="secondary fin-buchen" data-w="${escapeHtml(w)}" data-i="${i}"><i class="ti ti-check"></i> Als bezahlt buchen</button></div>`;
      });
    });
  }
  const offen = trip.finanzen.some((f) => !f.abgerechnet) || trip.finAusgleiche.some((a) => !a.abgerechnet);
  html += `<div class="fin-actions">
    ${offen ? `<button type="button" class="secondary" id="fin-alle-abrechnen"><i class="ti ti-checks"></i> Alles als abgerechnet markieren</button>` : ""}
  </div>`;
  html += `<details class="fin-aus"><summary><i class="ti ti-arrows-exchange"></i> Ausgleich erfassen / Ausgleichszahlungen (${trip.finAusgleiche.length})</summary><div id="fin-aus-body"></div></details>`;
  sec.innerHTML = html;

  sec.querySelectorAll(".fin-buchen").forEach((b) => {
    b.onclick = () => {
      const v = finVorschlaege(R.net[b.dataset.w])[Number(b.dataset.i)];
      if (!v) return;
      trip.finAusgleiche.push({ id: "aus" + Date.now(), datum: finToday(), von: v.von, an: v.an, betrag: v.betrag, waehrung: b.dataset.w, abgerechnet: false });
      saveChange();
      rerender();
    };
  });
  const alle = sec.querySelector("#fin-alle-abrechnen");
  if (alle) alle.onclick = () => {
    if (!confirm("Alle Ausgaben und Ausgleichszahlungen als abgerechnet markieren? Der Saldo wird damit auf 0 gesetzt.")) return;
    trip.finanzen.forEach((f) => { f.abgerechnet = true; });
    trip.finAusgleiche.forEach((a) => { a.abgerechnet = true; });
    saveChange();
    rerender();
  };

  const body = sec.querySelector("#fin-aus-body");
  trip.finAusgleiche.forEach((a) => {
    const r = document.createElement("div");
    r.className = "fin-saldo-row" + (a.abgerechnet ? " fin-done" : "");
    r.innerHTML = `<span>${a.datum ? formatDate(a.datum) + " · " : ""}${escapeHtml(a.von)} → ${escapeHtml(a.an)}: <strong>${finFmt(finNum(a.betrag))} ${escapeHtml(a.waehrung || "CHF")}</strong></span>`;
    const del = document.createElement("button");
    del.type = "button"; del.className = "icon-btn danger"; del.innerHTML = `<i class="ti ti-trash"></i>`;
    del.onclick = () => {
      const idx = trip.finAusgleiche.findIndex((x) => x.id === a.id);
      const removed = trip.finAusgleiche.splice(idx, 1)[0];
      saveChange();
      rerender();
      showUndoToast("Ausgleichszahlung gelöscht", () => { trip.finAusgleiche.splice(Math.min(idx, trip.finAusgleiche.length), 0, removed); saveChange(); rerender(); });
    };
    r.appendChild(del);
    body.appendChild(r);
  });
  const form = document.createElement("form");
  form.className = "fin-aus-form";
  const personen = finPersonen(trip);
  const von = finPersonSelect(trip, "von", personen[0] || "", "Von", null);
  const an = finPersonSelect(trip, "an", personen[1] || "", "An", null);
  const bi = document.createElement("input");
  bi.type = "number"; bi.step = "0.01"; bi.name = "betrag"; bi.placeholder = "Betrag"; bi.inputMode = "decimal"; bi.required = true;
  const ws = finWaehrungSelect(trip, trip.finHauptwaehrung);
  const ok = document.createElement("button");
  ok.type = "submit"; ok.innerHTML = `<i class="ti ti-plus"></i> Ausgleich buchen`;
  form.append(von, an, bi, ws, ok);
  form.onsubmit = (e) => {
    e.preventDefault();
    if (!von.value || !an.value || von.value === an.value || !finNum(bi.value)) return;
    trip.finAusgleiche.push({ id: "aus" + Date.now(), datum: finToday(), von: von.value, an: an.value, betrag: finNum(bi.value), waehrung: ws.value || "CHF", abgerechnet: false });
    saveChange();
    rerender();
  };
  body.appendChild(form);
  const det = sec.querySelector(".fin-aus");
  if (trip.finAusgleiche.length === 0) det.open = false;
}

// ---------- Auswertung (Personen, Kategorien, Wechselkurse) ----------
function finRenderAuswertung(det, trip, R, rerender) {
  det.addEventListener("toggle", () => { finAuswertungOffen = det.open; });
  const personen = finPersonen(trip).filter((p) =>
    Object.keys(R.bezahlt).some((w) => R.bezahlt[w][p]) || Object.keys(R.anteil).some((w) => R.anteil[w][p]));
  const perW = (obj, p) => {
    const m = {};
    Object.keys(obj).forEach((w) => { if (obj[w][p]) m[w] = obj[w][p]; });
    return m;
  };
  let html = `<summary><i class="ti ti-chart-pie"></i> Auswertung, Totale &amp; Wechselkurse</summary>`;
  html += `<h4>Pro Person</h4>`;
  if (!personen.length) html += `<p class="hint-small">Noch keine Daten.</p>`;
  else {
    html += `<div class="fin-wrap"><table class="fin-table"><thead><tr><th>Person</th><th>Hat bezahlt</th><th>Eigener Anteil</th><th>Saldo (offen)</th></tr></thead><tbody>`;
    personen.forEach((p) => {
      const saldo = {};
      Object.keys(R.net).forEach((w) => { if (R.net[w][p] && Math.abs(R.net[w][p]) > 0.004) saldo[w] = R.net[w][p]; });
      html += `<tr><td>${escapeHtml(p)}</td><td>${finSumMitKonv(perW(R.bezahlt, p), trip)}</td><td>${finSumMitKonv(perW(R.anteil, p), trip)}</td><td>${finSumStr(saldo)}</td></tr>`;
    });
    html += `</tbody></table></div><p class="hint-small">Saldo: positiv = bekommt noch Geld, negativ = schuldet noch Geld.</p>`;
  }
  html += `<h4>Pro Kategorie</h4>`;
  const kats = Object.keys(R.kat).sort();
  if (!kats.length) html += `<p class="hint-small">Noch keine Daten.</p>`;
  else {
    html += `<div class="fin-wrap"><table class="fin-table"><tbody>`;
    kats.forEach((k) => { html += `<tr><td>${escapeHtml(k)}</td><td>${finSumMitKonv(R.kat[k], trip)}</td></tr>`; });
    html += `</tbody></table></div>`;
  }
  html += `<h4>Wechselkurse</h4><div class="fin-kurse"></div>`;
  det.innerHTML = html;

  const box = det.querySelector(".fin-kurse");
  const hauptWrap = document.createElement("label");
  hauptWrap.innerHTML = `<span><i class="ti ti-coin"></i> Hauptwährung für Totale</span>`;
  const hs = finWaehrungSelect(trip, trip.finHauptwaehrung);
  hs.addEventListener("change", () => { trip.finHauptwaehrung = hs.value || "CHF"; saveChange(); finAuswertungOffen = true; rerender(); });
  hauptWrap.appendChild(hs);
  box.appendChild(hauptWrap);
  const verwendet = finUniq([...trip.finanzen.map((f) => f.waehrung), ...trip.finAusgleiche.map((a) => a.waehrung)]).filter((w) => w !== trip.finHauptwaehrung);
  if (!verwendet.length) {
    const p = document.createElement("p");
    p.className = "hint-small"; p.textContent = "Es wird nur die Hauptwährung verwendet - keine Kurse nötig.";
    box.appendChild(p);
  }
  verwendet.forEach((w) => {
    const r = document.createElement("label");
    r.innerHTML = `<span>1 ${escapeHtml(w)} = ... ${escapeHtml(trip.finHauptwaehrung)}</span>`;
    const i = document.createElement("input");
    i.type = "number"; i.step = "0.0001"; i.inputMode = "decimal"; i.value = trip.finKurse[w] || "";
    i.onchange = () => { trip.finKurse[w] = finNum(i.value) || ""; saveChange(); finAuswertungOffen = true; rerender(); };
    r.appendChild(i);
    box.appendChild(r);
  });
}

// ---------- Export ----------
function finExportRows(trip) {
  finNormalize(trip);
  const personen = finPersonen(trip);
  const konv = Object.keys(finBerechne(trip).gesamt).every((w) => w === trip.finHauptwaehrung || finNum(trip.finKurse[w]) > 0);
  const head = ["Datum", "Kategorie", "Details", "Wo", "Betrag", "Währung", "Zahlungsart", "Bezahlt von", "Abgerechnet", "Notizen", ...personen.map((p) => "Anteil " + p)];
  if (konv) head.push("Betrag in " + trip.finHauptwaehrung);
  const sorted = [...trip.finanzen].sort((a, b) => (a.datum || "").localeCompare(b.datum || ""));
  const rows = sorted.map((f) => {
    const sh = finShareMap(f);
    const w = f.waehrung || "CHF";
    const r = [f.datum ? formatDate(f.datum) : "", f.kategorie || "", f.details || "", f.wo || "", finNum(f.betrag), w, f.zahlungsart || "", f.bezahltVon || "", f.abgerechnet ? "ja" : "nein", f.notizen || "",
      ...personen.map((p) => (sh[p] ? finRound(sh[p]) : ""))];
    if (konv) r.push(finRound(w === trip.finHauptwaehrung ? finNum(f.betrag) : finNum(f.betrag) * finNum(trip.finKurse[w])));
    return r;
  });
  return { head, rows, personen, konv };
}
function finDownload(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function finDateiname(trip, ext) {
  const s = (trip.titel || "Ferien").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
  return "Finanzen_" + s + "." + ext;
}
function finCsvCell(v) {
  if (typeof v === "number") return String(v).replace(".", ",");
  const s = String(v == null ? "" : v);
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function finExportCsv(trip) {
  const { head, rows } = finExportRows(trip);
  const csv = [head, ...rows].map((r) => r.map(finCsvCell).join(";")).join("\r\n");
  finDownload(finDateiname(trip, "csv"), new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
}

let finCrcTable = null;
function finCrc32(bytes) {
  if (!finCrcTable) {
    finCrcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      finCrcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = finCrcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
/** Minimaler ZIP-Writer (ohne Kompression) - genügt für .xlsx. */
function finZip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  files.forEach((f) => {
    const name = enc.encode(f.name);
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const crc = finCrc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  });
  let csize = 0;
  central.forEach((c) => { csize += c.length; });
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, csize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
function finXmlEsc(s) {
  return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function finColName(i) {
  let s = "";
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}
function finXlsxBlob(sheets) {
  const sheetXml = (rows) => {
    let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="30" width="18" customWidth="1"/></cols><sheetData>';
    rows.forEach((r, ri) => {
      x += '<row r="' + (ri + 1) + '">';
      r.forEach((v, ci) => {
        if (v === "" || v == null) return;
        const ref = finColName(ci) + (ri + 1);
        const st = r.__bold ? ' s="1"' : "";
        if (typeof v === "number") x += '<c r="' + ref + '"' + st + "><v>" + v + "</v></c>";
        else x += '<c r="' + ref + '" t="inlineStr"' + st + "><is><t xml:space=\"preserve\">" + finXmlEsc(v) + "</t></is></c>";
      });
      x += "</row>";
    });
    return x + "</sheetData></worksheet>";
  };
  const files = [
    { name: "[Content_Types].xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("") + "</Types>" },
    { name: "_rels/.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: "xl/workbook.xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map((s, i) => '<sheet name="' + finXmlEsc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join("") + "</sheets></workbook>" },
    { name: "xl/_rels/workbook.xml.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join("") + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: "xl/styles.xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>' },
    ...sheets.map((s, i) => ({ name: "xl/worksheets/sheet" + (i + 1) + ".xml", data: sheetXml(s.rows) })),
  ];
  return finZip(files);
}
function finExportXlsx(trip) {
  const { head, rows, personen } = finExportRows(trip);
  const bold = (arr) => { arr.__bold = true; return arr; };
  const R = finBerechne(trip);
  const aus = [bold(["Datum", "Fehlbetrag von", "An", "Betrag", "Währung", "Abgerechnet"])];
  trip.finAusgleiche.forEach((a) => aus.push([a.datum ? formatDate(a.datum) : "", a.von, a.an, finNum(a.betrag), a.waehrung || "CHF", a.abgerechnet ? "ja" : "nein"]));
  aus[0][1] = "Von";
  const ausw = [bold(["Person", "Währung", "Hat bezahlt", "Eigener Anteil", "Saldo offen"])];
  personen.forEach((p) => {
    Object.keys(finUniq([...Object.keys(R.bezahlt), ...Object.keys(R.anteil), ...Object.keys(R.net)]).reduce((o, w) => { o[w] = 1; return o; }, {})).forEach((w) => {
      const b = (R.bezahlt[w] || {})[p] || 0, a = (R.anteil[w] || {})[p] || 0, n = (R.net[w] || {})[p] || 0;
      if (b || a || n) ausw.push([p, w, finRound(b), finRound(a), finRound(n)]);
    });
  });
  ausw.push([""]);
  ausw.push(bold(["Kategorie", "Währung", "Summe"]));
  Object.keys(R.kat).sort().forEach((k) => Object.keys(R.kat[k]).forEach((w) => ausw.push([k, w, finRound(R.kat[k][w])])));
  ausw.push([""]);
  ausw.push(bold(["Total", "Währung", "Summe"]));
  Object.keys(R.gesamt).forEach((w) => ausw.push(["Total", w, finRound(R.gesamt[w])]));
  finDownload(finDateiname(trip, "xlsx"), finXlsxBlob([
    { name: "Ausgaben", rows: [bold(head), ...rows] },
    { name: "Auswertung", rows: ausw },
    { name: "Ausgleiche", rows: aus },
  ]));
}

// ===========================================================
// SUCHE (global oder nur im aktuellen Register) + PROGRAMM-HILFEN
// ===========================================================
let sucheNurRegister = false;
let sucheText = "";
let programmAnsicht = "liste";
let tagesplanNeuDatum = "";

function sucheQuellen(trip) {
  const d = getData();
  const q = [];
  const lbl = (o) => o.text || o.name || o.titel || o.idee || o.details || o.wo || o.frage || o.thema || o.vormittag || o.nachmittag || o.abend || "";
  const add = (tab, arr, labelFn) => (arr || []).forEach((o) => q.push({ tab, o, label: (labelFn || lbl)(o) }));
  if (trip) {
    add("packliste", trip.packliste);
    add("todo", trip.todo);
    add("programm", trip.ideen);
    add("programm", trip.tagesplan, (p) => [p.datum ? formatDate(p.datum) : "", p.vormittag || p.nachmittag || p.abend].filter(Boolean).join(" · "));
    add("finanzen", trip.finanzen, (f) => [f.datum ? formatDate(f.datum) : "", f.details || f.wo, f.betrag ? finFmt(finNum(f.betrag)) + " " + (f.waehrung || "") : ""].filter(Boolean).join(" · "));
    add("notizen", trip.notizen);
    add("ferien", trip.unterkuenfte);
  }
  add("artikel", d.artikelDatenbank);
  add("todo", d.todoVorlage);
  add("ratgeber", d.ratgeberDatenbank);
  return q;
}
function sucheHeu(o) {
  return Object.keys(o).filter((k) => !/^id$|Id$|Ids$/.test(k))
    .map((k) => o[k]).filter((v) => typeof v === "string" || typeof v === "number").join(" ").toLowerCase();
}
function openSucheModal() {
  const trip = getCurrentTrip();
  const quellen = sucheQuellen(trip);
  const defCur = TAB_DEFS[currentTab] || null;
  const wrap = document.createElement("div");
  wrap.className = "field-form suche-box";
  wrap.innerHTML = `
    <h3><i class="ti ti-search"></i> Suchen</h3>
    <input type="search" id="suche-input" placeholder="Suchbegriff ..." value="${escapeHtml(sucheText)}" autocomplete="off" />
    ${defCur ? `<label class="checkbox-inline"><input type="checkbox" id="suche-nur" ${sucheNurRegister ? "checked" : ""} /> Nur im Register «${escapeHtml(defCur.label)}»</label>` : ""}
    <div id="suche-ergebnis"></div>
  `;
  const input = wrap.querySelector("#suche-input");
  const nur = wrap.querySelector("#suche-nur");
  const out = wrap.querySelector("#suche-ergebnis");
  const run = () => {
    sucheText = input.value;
    sucheNurRegister = !!(nur && nur.checked);
    const q = sucheText.trim().toLowerCase();
    out.innerHTML = "";
    if (q.length < 2) { out.innerHTML = `<p class="hint-small">Mindestens 2 Zeichen eingeben.</p>`; return; }
    const hits = quellen.filter((x) => (!sucheNurRegister || x.tab === currentTab) && sucheHeu(x.o).includes(q));
    if (!hits.length) { out.innerHTML = `<p class="hint-empty">Nichts gefunden.</p>`; return; }
    const byTab = {};
    hits.forEach((h) => { (byTab[h.tab] = byTab[h.tab] || []).push(h); });
    Object.keys(byTab).forEach((tab) => {
      const def = TAB_DEFS[tab] || { icon: "ti-search", label: tab };
      const h = document.createElement("div");
      h.className = "suche-gruppe";
      h.innerHTML = `<i class="ti ${def.icon}"></i> ${escapeHtml(def.label)} (${byTab[tab].length})`;
      out.appendChild(h);
      byTab[tab].slice(0, 8).forEach((x) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "suche-treffer";
        b.textContent = x.label || "(ohne Titel)";
        b.onclick = () => { closeModal(); if (tab === currentTab) render(); else navigateTab(tab); };
        out.appendChild(b);
      });
      if (byTab[tab].length > 8) {
        const m = document.createElement("p");
        m.className = "hint-small"; m.textContent = "… und " + (byTab[tab].length - 8) + " weitere - Suchbegriff präzisieren.";
        out.appendChild(m);
      }
    });
  };
  input.oninput = run;
  if (nur) nur.onchange = run;
  openModal(wrap, () => {});
  setTimeout(() => { input.focus(); input.select(); run(); }, 50);
}

function ideePlanBadge(trip, idee) {
  const p = trip.tagesplan.find((x) => x.ideeId === idee.id);
  return p ? ` <span class="prog-badge"><i class="ti ti-calendar-check"></i> ${p.datum ? escapeHtml(formatDate(p.datum)) : "eingeplant"}</span>` : "";
}

/** Wochenplan: pro Tag eine Zeile mit Vormittag / Nachmittag / Abend. */
function renderWochenplan(trip, host, plaene, onChange) {
  const tage = new Set(plaene.map((p) => p.datum).filter(Boolean));
  if (trip.von) {
    const ende = new Date((trip.bis || trip.von) + "T12:00:00");
    for (let d = new Date(trip.von + "T12:00:00"), n = 0; d <= ende && n < 62; d.setDate(d.getDate() + 1), n++) {
      tage.add(d.toISOString().slice(0, 10));
    }
  }
  const wt = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const slots = ["vormittag", "nachmittag", "abend"];
  const grid = document.createElement("div");
  grid.className = "woche-grid";
  ["Tag", "Vormittag", "Nachmittag", "Abend"].forEach((t) => {
    const c = document.createElement("div");
    c.className = "woche-head"; c.textContent = t; grid.appendChild(c);
  });
  const oeffnen = (eintraege, datum) => {
    if (eintraege.length) editingTagesplanId = eintraege[0].id;
    else { editingTagesplanId = "__neu__"; tagesplanNeuDatum = datum || ""; }
    onChange();
    setTimeout(() => { const f = document.getElementById("tagesplan-form-container"); if (f) f.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, 0);
  };
  const zeile = (labelText, eintraege, datum) => {
    const l = document.createElement("div");
    l.className = "woche-day woche-cell"; l.textContent = labelText;
    l.onclick = () => oeffnen(eintraege, datum);
    grid.appendChild(l);
    slots.forEach((s) => {
      const c = document.createElement("div");
      c.className = "woche-cell";
      c.textContent = eintraege.map((p) => p[s]).filter(Boolean).join(" · ");
      c.onclick = () => oeffnen(eintraege, datum);
      grid.appendChild(c);
    });
  };
  [...tage].sort().forEach((datum) => {
    const wd = wt[new Date(datum + "T12:00:00").getDay()];
    zeile(wd + " " + formatDate(datum).slice(0, 5), plaene.filter((p) => p.datum === datum), datum);
  });
  plaene.filter((p) => !p.datum).forEach((p) => zeile("Datum offen", [p], ""));
  host.appendChild(grid);
}

// ===========================================================
// TAB: STROMLADEN (Ladeprotokoll E-Auto pro Ferien, 1:1 nach dem
// Excel-Register "🔌 Stromladen" - Grundlage für die Abrechnung)
// ===========================================================
let editingLadungId = null;

function ensureStromladen(trip) {
  trip.stromladen = trip.stromladen || {
    waehrung: "CHF",
    strompreis: 0.3,
    batteriekapazitaet: 19.7,
    ladeverlustProzent: 12,
    log: [],
  };
  trip.stromladen.log = trip.stromladen.log || [];
  return trip.stromladen;
}

/** Berechnet die abgeleiteten Werte einer Ladung: kWh, die tatsächlich im
 *  Akku ankommen (aus Start-/Ende-%), kWh ab Steckdose (inkl. Ladeverlust -
 *  das misst der Stromzähler des Vermieters) und die daraus resultierenden
 *  Kosten. */
function berechneLadung(eintrag, einstellungen) {
  const start = Number(eintrag.startProzent);
  const ende = Number(eintrag.endeProzent);
  if (!Number.isFinite(start) || !Number.isFinite(ende) || ende <= start) {
    return { kwhAkku: 0, kwhSteckdose: 0, kosten: 0 };
  }
  const kwhAkku = ((ende - start) / 100) * Number(einstellungen.batteriekapazitaet || 0);
  const verlust = Number(einstellungen.ladeverlustProzent || 0) / 100;
  const kwhSteckdose = verlust < 1 ? kwhAkku / (1 - verlust) : kwhAkku;
  const kosten = kwhSteckdose * Number(einstellungen.strompreis || 0);
  return { kwhAkku, kwhSteckdose, kosten };
}

function renderStromladenTab(el, trip) {
  if (!trip) {
    el.innerHTML = `<p class="hint">Noch keine Ferien angelegt.</p>`;
    return;
  }
  const s = ensureStromladen(trip);
  const onChange = () => renderStromladenTab(el, trip);

  let totalAkku = 0, totalSteckdose = 0, totalKosten = 0, totalBezahlt = 0;
  s.log.forEach((eintrag) => {
    const b = berechneLadung(eintrag, s);
    totalAkku += b.kwhAkku;
    totalSteckdose += b.kwhSteckdose;
    totalKosten += b.kosten;
    if (eintrag.bezahlt) totalBezahlt += b.kosten;
  });
  const offen = totalKosten - totalBezahlt;

  el.innerHTML = `
    <section class="panel">
      <h2><i class="ti ti-plug"></i> Stromladen - ${escapeHtml(trip.titel)}</h2>
      <p class="hint-small">Ladeprotokoll fürs Aufladen in der Unterkunft oder an Ladestationen - Grundlage für die Abrechnung.</p>
    </section>
    <div class="dashboard-grid">
      <section class="panel">
        <p class="hint-small">Total geladen (Akku)</p>
        <p class="dashboard-number" style="font-size:18px">${totalAkku.toFixed(1)} kWh</p>
        <p class="hint-small">Ab Steckdose: ${totalSteckdose.toFixed(1)} kWh</p>
      </section>
      <section class="panel">
        <p class="hint-small">Zu bezahlen</p>
        <p class="dashboard-number" style="font-size:18px">${totalKosten.toFixed(2)} ${escapeHtml(s.waehrung)}</p>
        <p class="hint-small">offen: ${offen.toFixed(2)} ${escapeHtml(s.waehrung)}</p>
      </section>
    </div>
  `;

  const settingsSection = document.createElement("section");
  settingsSection.className = "panel";
  const settingsResult = collapsibleHeader("stromladen:einstellungen", "<i class=\"ti ti-settings\"></i> Einstellungen", onChange);
  settingsSection.appendChild(settingsResult.header);
  if (!settingsResult.isCollapsed) {
    const form = document.createElement("form");
    form.className = "field-form";
    form.innerHTML = `
      <div class="field-row">
        <label><span><i class="ti ti-currency-dollar"></i> Währung</span><input type="text" name="waehrung" value="${escapeHtml(s.waehrung)}" style="max-width:70px" /></label>
        <label><span><i class="ti ti-cash"></i> Strompreis (/kWh)</span><input type="number" step="0.01" name="strompreis" value="${escapeHtml(String(s.strompreis))}" /></label>
      </div>
      <div class="field-row">
        <label><span><i class="ti ti-battery-charging"></i> Batteriekapazität (kWh)</span><input type="number" step="0.1" name="batteriekapazitaet" value="${escapeHtml(String(s.batteriekapazitaet))}" /></label>
        <label><span><i class="ti ti-battery-charging"></i> Ladeverlust (%)</span><input type="number" step="1" name="ladeverlustProzent" value="${escapeHtml(String(s.ladeverlustProzent))}" /></label>
      </div>
      <div class="form-actions"><button type="submit"><i class="ti ti-check"></i> Speichern</button></div>
    `;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      s.waehrung = fd.get("waehrung").trim() || "CHF";
      s.strompreis = Number(fd.get("strompreis")) || 0;
      s.batteriekapazitaet = Number(fd.get("batteriekapazitaet")) || 0;
      s.ladeverlustProzent = Number(fd.get("ladeverlustProzent")) || 0;
      saveChange();
      onChange();
    });
    settingsSection.appendChild(form);
  }
  el.appendChild(settingsSection);

  const logSection = document.createElement("section");
  logSection.className = "panel";
  const logResult = collapsibleHeader("stromladen:log", `Ladungen (${s.log.length})`, onChange);
  logSection.appendChild(logResult.header);
  const listDiv = document.createElement("div");
  if (!logResult.isCollapsed) logSection.appendChild(listDiv);
  const newBtn = document.createElement("button");
  newBtn.className = "secondary";
  newBtn.innerHTML = `<i class="ti ti-plus"></i> Neue Ladung`;
  logSection.appendChild(newBtn);
  el.appendChild(logSection);

  const formContainer = document.createElement("div");
  el.appendChild(formContainer);

  if (!logResult.isCollapsed) {
    if (!s.log.length) {
      listDiv.innerHTML = `<p class="hint-empty">Noch keine Ladung erfasst.</p>`;
    }
    [...s.log].sort((a, b) => (a.datum || "").localeCompare(b.datum || "")).forEach((eintrag) => {
      const b = berechneLadung(eintrag, s);
      const row = document.createElement("div");
      row.className = "item-row" + (eintrag.bezahlt ? " item-row-on-packliste" : "");
      row.innerHTML = `
        <span style="flex:1">
          ${eintrag.datum ? `<span class="termin-badge">${formatDate(eintrag.datum)}</span> ` : ""}<strong>${escapeHtml(eintrag.ort || "Ladung")}</strong>
          <br /><span class="hint-small" style="margin:0">${eintrag.startProzent ?? "?"}% → ${eintrag.endeProzent ?? "?"}% · ${b.kwhAkku.toFixed(1)} kWh Akku · ${b.kwhSteckdose.toFixed(1)} kWh Steckdose · ${b.kosten.toFixed(2)} ${escapeHtml(s.waehrung)}</span>
          ${eintrag.bezahlt ? ` <span class="on-packliste-badge"><i class="ti ti-check"></i> bezahlt</span>` : ""}
          ${eintrag.bemerkung ? `<br /><span class="hint-small" style="margin:0">${escapeHtml(eintrag.bemerkung)}</span>` : ""}
        </span>
      `;
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "icon-btn";
      editBtn.innerHTML = `<i class="ti ti-pencil"></i>`;
      editBtn.onclick = () => { editingLadungId = eintrag.id; renderStromladenFormInto(formContainer, trip, s, onChange); formContainer.scrollIntoView({ behavior: "smooth" }); };
      row.appendChild(editBtn);
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "icon-btn danger";
      delBtn.innerHTML = `<i class="ti ti-trash"></i>`;
      delBtn.onclick = () => {
        if (!confirm("Diese Ladung wirklich löschen?")) return;
        s.log = s.log.filter((x) => x.id !== eintrag.id);
        saveChange();
        onChange();
      };
      row.appendChild(delBtn);
      listDiv.appendChild(row);
    });
  }

  newBtn.onclick = () => { editingLadungId = "__neu__"; renderStromladenFormInto(formContainer, trip, s, onChange); formContainer.scrollIntoView({ behavior: "smooth" }); };
  if (editingLadungId) renderStromladenFormInto(formContainer, trip, s, onChange);
}

function renderStromladenFormInto(container, trip, s, onChange) {
  const isNew = editingLadungId === "__neu__";
  const existing = isNew ? null : s.log.find((e) => e.id === editingLadungId);
  const eintrag = existing || { datum: "", ort: "", startProzent: "", endeProzent: "", bezahlt: false, bemerkung: "" };

  const form = document.createElement("form");
  form.className = "field-form panel";
  form.innerHTML = `
    <div class="field-row">
      <label><span><i class="ti ti-calendar"></i> Datum</span><input type="date" name="datum" value="${escapeHtml(eintrag.datum)}" /></label>
      <label><span><i class="ti ti-plug"></i> Ort / Ladestation</span><input type="text" name="ort" value="${escapeHtml(eintrag.ort)}" /></label>
    </div>
    <div class="field-row">
      <label><span><i class="ti ti-battery-charging"></i> Start %</span><input type="number" step="1" min="0" max="100" name="startProzent" value="${escapeHtml(String(eintrag.startProzent))}" /></label>
      <label><span><i class="ti ti-battery-charging"></i> Ende %</span><input type="number" step="1" min="0" max="100" name="endeProzent" value="${escapeHtml(String(eintrag.endeProzent))}" /></label>
    </div>
    <label style="display:flex;align-items:center;gap:6px;font-weight:normal">
      <input type="checkbox" name="bezahlt" ${eintrag.bezahlt ? "checked" : ""} /> Bezahlt
    </label>
    <label><span><i class="ti ti-message-2"></i> Bemerkung</span><textarea name="bemerkung" rows="2">${escapeHtml(eintrag.bemerkung)}</textarea></label>
    <div class="form-actions">
      <button type="submit"><i class="ti ti-check"></i> Speichern</button>
      <button type="button" id="cancel-ladung" class="secondary">Abbrechen</button>
      ${existing ? `<button type="button" id="delete-ladung" class="danger"><i class="ti ti-trash"></i></button>` : ""}
    </div>
  `;

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const values = Object.fromEntries(fd.entries());
    values.bezahlt = fd.get("bezahlt") === "on";
    values.startProzent = values.startProzent === "" ? "" : Number(values.startProzent);
    values.endeProzent = values.endeProzent === "" ? "" : Number(values.endeProzent);
    if (isNew) {
      s.log.push({ id: "lad" + Date.now() + Math.random().toString(36).slice(2, 6), ...values });
    } else {
      Object.assign(existing, values);
    }
    saveChange();
    editingLadungId = null;
    onChange();
  });
  form.querySelector("#cancel-ladung").onclick = () => { editingLadungId = null; onChange(); };
  const deleteBtn = form.querySelector("#delete-ladung");
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      if (!confirm("Diese Ladung wirklich löschen?")) return;
      s.log = s.log.filter((x) => x.id !== existing.id);
      saveChange();
      editingLadungId = null;
      onChange();
    };
  }

  container.innerHTML = "";
  container.appendChild(form);
}

// ===========================================================
// VERWALTUNG: RATGEBER & NOTFALL (zentraler Wissens-Katalog,
// unabhängig von Ferien - 1:1 nach dem Excel-Register)
// ===========================================================
let editingRatgeberId = null;

function ensureRatgeberDatenbank() {
  const data = getData();
  if (!data.ratgeberDatenbank || !data.ratgeberDatenbank.length) {
    data.ratgeberDatenbank = DEFAULT_RATGEBER_EINTRAEGE.map((r, i) => ({ id: "rat-default-" + i, ...r }));
  }
  return data.ratgeberDatenbank;
}

function renderRatgeberTab(el) {
  const katalog = ensureRatgeberDatenbank();
  el.innerHTML = `
    <section class="panel">
      <h2><i class="ti ti-book-2"></i> Ratgeber &amp; Notfall</h2>
      <p class="hint-small">Wissen für unterwegs: Was tun, wenn ... Kurzfassung hier, Details über den Link.</p>
      <div id="ratgeber-list"></div>
      <button id="new-ratgeber-button" class="secondary"><i class="ti ti-plus"></i> Neuer Eintrag</button>
    </section>
  `;

  const list = document.getElementById("ratgeber-list");
  if (!katalog.length) {
    list.innerHTML = `<p class="hint-empty">Noch keine Einträge.</p>`;
  } else {
    const byBereich = [];
    const byName = {};
    [...katalog].sort((a, b) => (a.bereich || "").localeCompare(b.bereich || "") || (a.thema || "").localeCompare(b.thema || "")).forEach((r) => {
      const bereich = r.bereich || "Allgemein";
      if (!byName[bereich]) { byName[bereich] = { bereich, items: [] }; byBereich.push(byName[bereich]); }
      byName[bereich].items.push(r);
    });
    byBereich.forEach((g) => {
      const collapseKey = "ratgeber:" + g.bereich;
      const { header, isCollapsed } = collapsibleHeader(
        collapseKey,
        `<i class="ti ${categoryIcon(g.bereich)}"></i> ${escapeHtml(g.bereich)} <span class="hint-small" style="margin:0">(${g.items.length})</span>`,
        () => renderRatgeberTab(el)
      );
      header.className += " category-header";
      list.appendChild(header);
      if (isCollapsed) return;
      g.items.forEach((r) => {
        const row = document.createElement("div");
        row.className = "item-row";
        const textSpan = document.createElement("span");
        textSpan.style.flex = "1";
        textSpan.style.cursor = "pointer";
        textSpan.innerHTML = `
          <strong>${escapeHtml(r.thema)}</strong>
          <br /><span class="hint-small" style="margin:0">${escapeHtml(r.wasDuWissenMusst)}</span>
          ${r.link ? `<br /><a href="${escapeHtml(r.link)}" target="_blank" rel="noopener" class="hint-small" onclick="event.stopPropagation()">Link${r.quelle ? ` (${escapeHtml(r.quelle)})` : ""}</a>` : (r.quelle ? `<br /><span class="hint-small" style="margin:0">Quelle: ${escapeHtml(r.quelle)}</span>` : "")}
          ${r.zuletztGeprueft ? `<br /><span class="hint-small" style="margin:0">Zuletzt geprüft: ${formatDate(r.zuletztGeprueft)}</span>` : ""}
        `;
        textSpan.onclick = () => { editingRatgeberId = r.id; renderRatgeberTab(el); };
        row.appendChild(textSpan);
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "icon-btn danger";
        delBtn.innerHTML = `<i class="ti ti-trash"></i>`;
        delBtn.onclick = (ev) => {
          ev.stopPropagation();
          if (!confirm(`"${r.thema}" wirklich löschen?`)) return;
          const data = getData();
          data.ratgeberDatenbank = data.ratgeberDatenbank.filter((x) => x.id !== r.id);
          saveChange();
          renderRatgeberTab(el);
        };
        row.appendChild(delBtn);
        list.appendChild(row);
      });
    });
  }

  document.getElementById("new-ratgeber-button").onclick = () => { editingRatgeberId = "__neu__"; renderRatgeberTab(el); };
  if (editingRatgeberId) {
    openModal(renderRatgeberForm(katalog, () => renderRatgeberTab(el)), () => { editingRatgeberId = null; });
  }
}

function renderRatgeberForm(katalog, onChange) {
  const isNew = editingRatgeberId === "__neu__";
  const existing = isNew ? null : katalog.find((r) => r.id === editingRatgeberId);
  const r = existing || { bereich: "", thema: "", wasDuWissenMusst: "", link: "", quelle: "", zuletztGeprueft: "" };

  const form = document.createElement("form");
  form.className = "field-form";
  form.innerHTML = `
    <label><span><i class="ti ti-category"></i> Bereich</span><input type="text" name="bereich" value="${escapeHtml(r.bereich)}" placeholder="z. B. Gesundheit &amp; Notfall" required /></label>
    <label><span><i class="ti ti-bulb"></i> Thema</span><input type="text" name="thema" value="${escapeHtml(r.thema)}" required /></label>
    <label><span><i class="ti ti-info-circle"></i> Was du wissen musst</span><textarea name="wasDuWissenMusst" rows="4">${escapeHtml(r.wasDuWissenMusst)}</textarea></label>
    <label><span><i class="ti ti-link"></i> Link</span><input type="url" name="link" value="${escapeHtml(r.link)}" placeholder="https://..." /></label>
    <div class="field-row">
      <label><span><i class="ti ti-link"></i> Quelle</span><input type="text" name="quelle" value="${escapeHtml(r.quelle)}" /></label>
      <label><span><i class="ti ti-list-check"></i> Zuletzt geprüft</span><input type="date" name="zuletztGeprueft" value="${escapeHtml(r.zuletztGeprueft)}" /></label>
    </div>
    <div class="form-actions">
      <button type="submit"><i class="ti ti-check"></i> Speichern</button>
      <button type="button" id="cancel-ratgeber" class="secondary">Abbrechen</button>
      ${existing ? `<button type="button" id="delete-ratgeber" class="danger"><i class="ti ti-trash"></i></button>` : ""}
    </div>
  `;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const values = Object.fromEntries(fd.entries());
    if (!values.thema || !values.bereich) return;
    if (isNew) {
      katalog.push({ id: "rat" + Date.now() + Math.random().toString(36).slice(2, 6), ...values });
    } else {
      Object.assign(existing, values);
    }
    saveChange();
    editingRatgeberId = null;
    onChange();
  });
  form.querySelector("#cancel-ratgeber").onclick = () => { editingRatgeberId = null; onChange(); };
  const deleteBtn = form.querySelector("#delete-ratgeber");
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      if (!confirm(`"${existing.thema}" wirklich löschen?`)) return;
      const data = getData();
      data.ratgeberDatenbank = data.ratgeberDatenbank.filter((x) => x.id !== existing.id);
      saveChange();
      editingRatgeberId = null;
      onChange();
    };
  }

  return form;
}

// ===========================================================
// TAB: ANLEITUNG (statische Hilfeseite - erklärt die App-Mechanik,
// Nachfolger des Excel-Registers "Anleitung")
// ===========================================================
function renderAnleitungTab(el) {
  el.innerHTML = `
    <section class="panel">
      <h2><i class="ti ti-help-circle"></i> Anleitung</h2>
      <p class="hint-small">Wie die Ferien-App funktioniert - kurz erklärt.</p>
    </section>
  `;

  const abschnitte = [
    {
      key: "merkmale-filter",
      titel: "Wie die Packliste/To-Do gefiltert wird",
      icon: "ti-filter",
      text: `Jeder Artikel bzw. To-Do-Punkt in der zentralen Datenbank kann ein oder mehrere Merkmale tragen (z. B. "Winter", "Ausland", "Auto"). Im Tab "Ferien" wählst du für die aktuelle Ferien die passenden Merkmale aus - danach erscheinen automatisch alle Artikel/To-Dos, die KEIN Merkmal verlangen (Standard) oder mindestens eines deiner angekreuzten Merkmale tragen. Das ersetzt die WAHR/FALSCH-Formeln aus dem alten Excel-Master; nichts muss manuell nachgeführt werden.`,
    },
    {
      key: "artikel-erfassen",
      titel: "Neuen Artikel dauerhaft erfassen",
      icon: "ti-database-plus",
      text: `Im Tab "Artikel-DB" auf "Neuer Artikel" tippen (oder in der Packliste bei einem einmalig erfassten Punkt auf das Datenbank-Icon). Im Formular Kategorien (Mehrfachauswahl möglich) und gewünschte Merkmale per Chip auswählen - ein Artikel ohne Merkmal gilt als Standard und erscheint in jeder Ferien automatisch. Änderungen gelten sofort für alle künftigen Ferien, bereits bestehende Packlisten werden nicht rückwirkend verändert.`,
    },
    {
      key: "artikel-matrix",
      titel: "Matrix-Ansicht der Artikel-Datenbank",
      icon: "ti-table",
      text: `In der Matrix-Ansicht siehst du alle Artikel und Merkmale als Tabelle mit Checkboxen - 1:1 wie früher im Excel. Merkmal-Spalten sind farblich nach Überbegriff gruppiert (z. B. "Transport": Auto/VW-Bus/Flugzeug/öV). Jede Kategorie lässt sich einzeln ein-/ausklappen, ein Klick auf den Artikelnamen öffnet das Bearbeiten-Formular.`,
    },
    {
      key: "einmalig-fix",
      titel: '"Einmalig" vs. "Fix" bei neuen Einträgen',
      icon: "ti-pin",
      text: `Trägst du direkt in einer Ferien einen neuen Punkt ein, wählst du zwischen "Einmalig" (gilt nur für diese Ferien) und "Fix" (wird zusätzlich dauerhaft in die zentrale Artikel-Datenbank bzw. To-Do-Vorlage übernommen und taucht ab sofort auch in künftigen Ferien auf).`,
    },
    {
      key: "reisetag",
      titel: 'Register "Reisetag"',
      icon: "ti-calendar-time",
      text: `Zeigt tagesweise, was an einem bestimmten Ferientag ansteht - dieselben Packliste-/To-Do-Einträge wie in den jeweiligen Listen, nur anders sortiert. Abhaken hier wirkt sich automatisch auch dort aus (und umgekehrt), da es sich um dieselben Datensätze handelt.`,
    },
    {
      key: "ansicht-reset",
      titel: "Ansicht zurücksetzen",
      icon: "ti-refresh",
      text: `Hast du dich in Filtern, Sortierungen oder Ein-/Ausklapp-Zuständen "verklickt"? Unter Einstellungen → "Ansicht zurücksetzen" lässt sich das auf den Standard zurücksetzen, ohne dass dabei Daten (Packliste, To-Dos, Ferien usw.) verloren gehen.`,
    },
    {
      key: "offline",
      titel: "Offline-Nutzung & Synchronisation",
      icon: "ti-cloud",
      text: `Die App speichert ihre Daten in einer Datei in deinem OneDrive und funktioniert dank Service Worker auch kurzzeitig ohne Internetverbindung. Änderungen werden synchronisiert, sobald wieder eine Verbindung besteht - bei Konflikten (z. B. Bearbeitung auf zwei Geräten gleichzeitig) gewinnt der zuletzt gespeicherte Stand.`,
    },
  ];

  abschnitte.forEach((a) => {
    const section = document.createElement("section");
    section.className = "panel";
    const { header, isCollapsed } = collapsibleHeader(
      "anleitung:" + a.key,
      `<i class="ti ${a.icon}"></i> ${escapeHtml(a.titel)}`,
      () => renderAnleitungTab(el)
    );
    section.appendChild(header);
    if (!isCollapsed) {
      const p = document.createElement("p");
      p.className = "hint-small";
      p.style.margin = "0";
      p.textContent = a.text;
      section.appendChild(p);
    }
    el.appendChild(section);
  });
}

// ===========================================================
// TAB: RÜCKBLICK (Freitext-Formular pro Ferien, kurz nach der
// Heimkehr auszufüllen - 1:1 nach dem Excel-Register)
// ===========================================================
function ensureRueckblick(trip) {
  trip.rueckblick = trip.rueckblick || {
    toll: "", andersMachen: "", packlisteFehlte: "", packlisteUnnoetig: "",
    lieblingsOrt: "", tipps: "", fotosLink: "", gesamtkosten: "", nochmalsHin: "",
  };
  return trip.rueckblick;
}

function renderRueckblickTab(el, trip) {
  if (!trip) {
    el.innerHTML = `<p class="hint">Noch keine Ferien angelegt.</p>`;
    return;
  }
  const r = ensureRueckblick(trip);

  const felder = [
    { key: "toll", icon: "ti-thumb-up", label: "Was war besonders toll?" },
    { key: "andersMachen", icon: "ti-arrows-shuffle", label: "Was würden wir nächstes Mal anders machen?" },
    { key: "packlisteFehlte", icon: "ti-backpack", label: "Packliste: Was hat gefehlt?" },
    { key: "packlisteUnnoetig", icon: "ti-circle-minus", label: "Packliste: Was war unnötig / zu viel dabei?" },
    { key: "lieblingsOrt", icon: "ti-heart", label: "Lieblings-Restaurant / -Ort / -Aktivität" },
    { key: "tipps", icon: "ti-bulb", label: "Tipps für nächstes Mal (Timing, Route, Reservationen ...)" },
    { key: "fotosLink", icon: "ti-camera", label: "Fotos / Videos - Link/Ablageort" },
    { key: "gesamtkosten", icon: "ti-cash", label: "Gesamtkosten (Bauchgefühl vs. Budget)" },
  ];

  el.innerHTML = `
    <section class="panel">
      <h2><i class="ti ti-camera"></i> Rückblick - ${escapeHtml(trip.titel)}</h2>
      <p class="hint-small">Kurz nach der Heimkehr ausfüllen, solange die Eindrücke frisch sind - hilft beim nächsten Mal enorm.</p>
    </section>
  `;

  const form = document.createElement("form");
  form.className = "field-form panel";
  form.innerHTML = felder.map((f) => `
    <label><span><i class="ti ${f.icon || "ti-pencil"}"></i> ${escapeHtml(f.label)}</span><textarea name="${f.key}" rows="2">${escapeHtml(r[f.key] || "")}</textarea></label>
  `).join("") + `
    <label><span><i class="ti ti-refresh"></i> Nochmals hin?</span>
      <select name="nochmalsHin">
        <option value="">-</option>
        <option value="Ja" ${r.nochmalsHin === "Ja" ? "selected" : ""}>Ja</option>
        <option value="Vielleicht" ${r.nochmalsHin === "Vielleicht" ? "selected" : ""}>Vielleicht</option>
        <option value="Nein" ${r.nochmalsHin === "Nein" ? "selected" : ""}>Nein</option>
      </select>
    </label>
    <div class="form-actions"><button type="submit"><i class="ti ti-check"></i> Speichern</button></div>
  `;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    felder.forEach((f) => { r[f.key] = (fd.get(f.key) || "").trim(); });
    r.nochmalsHin = fd.get("nochmalsHin") || "";
    saveChange();
    const saved = document.createElement("p");
    saved.className = "hint-small";
    saved.style.color = "var(--green)";
    saved.innerHTML = `<i class="ti ti-check"></i> Gespeichert.`;
    form.appendChild(saved);
    setTimeout(() => saved.remove(), 2000);
  });

  el.appendChild(form);
}

// ===========================================================
// TAB: NOTIZEN (spontane Notizen pro Ferien)
// ===========================================================
function ensureNotizen(trip) {
  trip.notizen = trip.notizen || [];
  return trip.notizen;
}

function renderNotizenTab(el, trip) {
  if (!trip) {
    el.innerHTML = `<p class="hint">Noch keine Ferien angelegt.</p>`;
    return;
  }
  const notizen = ensureNotizen(trip);

  el.innerHTML = `
    <section class="panel">
      <h2><i class="ti ti-notes"></i> Notizen - ${escapeHtml(trip.titel)}</h2>
      <p class="hint-small">Für spontane Notizen während der Ferien. Mit dem Fahnen-Symbol markierte Notizen sollten nach den Ferien auf feste Übernahme in die App geprüft werden.</p>
    </section>
  `;

  const listSection = document.createElement("section");
  listSection.className = "panel";
  const list = document.createElement("div");
  list.id = "notizen-list";
  if (!notizen.length) {
    list.innerHTML = `<p class="hint-empty">Noch keine Notizen erfasst.</p>`;
  }
  notizen.slice().reverse().forEach((n) => {
    const row = document.createElement("div");
    row.className = "item-row";
    const textSpan = document.createElement("span");
    textSpan.style.flex = "1";
    textSpan.innerHTML = `${escapeHtml(n.text)}${n.pruefen ? ` <span class="spontan-badge" title="Nach den Ferien für die fixe Übernahme in die App prüfen"><i class="ti ti-flag"></i> Prüfen</span>` : ""}`;
    textSpan.onclick = () => {
      const neuerText = prompt("Notiz bearbeiten:", n.text);
      if (neuerText === null) return;
      n.text = neuerText.trim() || n.text;
      saveChange();
      renderNotizenTab(el, trip);
    };
    row.appendChild(textSpan);

    const flagBtn = document.createElement("button");
    flagBtn.type = "button";
    flagBtn.className = "icon-btn";
    flagBtn.style.color = n.pruefen ? "var(--amber-dark)" : "";
    flagBtn.innerHTML = `<i class="ti ti-flag"></i>`;
    flagBtn.title = "Nach den Ferien für die fixe Übernahme in die App prüfen";
    flagBtn.onclick = (e) => {
      e.stopPropagation();
      n.pruefen = !n.pruefen;
      saveChange();
      renderNotizenTab(el, trip);
    };
    row.appendChild(flagBtn);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "icon-btn danger";
    delBtn.innerHTML = `<i class="ti ti-trash"></i>`;
    delBtn.title = "Löschen";
    delBtn.onclick = (e) => {
      e.stopPropagation();
      const pos = trip.notizen.findIndex((x) => x.id === n.id);
      trip.notizen = trip.notizen.filter((x) => x.id !== n.id);
      saveChange();
      renderNotizenTab(el, trip);
      showUndoToast("Notiz gelöscht", () => {
        trip.notizen.splice(Math.min(Math.max(pos, 0), trip.notizen.length), 0, n);
        saveChange();
        render();
      });
    };
    row.appendChild(delBtn);

    list.appendChild(row);
  });
  listSection.appendChild(list);
  el.appendChild(listSection);

  const newBtn = document.createElement("button");
  newBtn.id = "new-notiz-button";
  newBtn.className = "secondary";
  newBtn.innerHTML = `<i class="ti ti-plus"></i> Neue Notiz`;
  newBtn.onclick = () => {
    const text = prompt("Neue Notiz:");
    if (!text || !text.trim()) return;
    notizen.push({ id: "notiz" + Date.now() + Math.random().toString(36).slice(2, 6), text: text.trim(), pruefen: false });
    saveChange();
    renderNotizenTab(el, trip);
  };
  el.appendChild(newBtn);
}

// ===========================================================
// ALLGEMEIN-ANSICHT (keine Ferien gewählt) + ERFASSEN-LEISTE
// ===========================================================

// Register, die auch ohne gewählte Ferien Sinn machen (alles andere gehört zu einer Ferien).
const NEUTRAL_TABS = ["start", "ferien", "todo", "artikel", "merkmale", "ratgeber", "anleitung"];

function neutralExplanationHtml() {
  const sichtbar = NEUTRAL_TABS.filter((id) => id !== "start").map((id) => TAB_DEFS[id].label).concat(["Einstellungen"]);
  const versteckt = Object.keys(TAB_DEFS).filter((id) => !NEUTRAL_TABS.includes(id)).map((id) => TAB_DEFS[id].label);
  return `
    <h2><i class="ti ti-world"></i> Allgemein-Ansicht (keine Ferien gewählt)</h2>
    <p>Mit der Auswahl "Allgemein (ohne Ferien)" im Ferien-Dropdown arbeitest du an dem, was für <strong>alle</strong> Ferien gilt - ohne dass eine bestimmte Reise im Weg steht. Damit kannst du die Artikel-DB, die To-Do-Vorlage und andere allgemeine Sachen einsehen und pflegen.</p>
    <p><strong>Sichtbar:</strong> ${sichtbar.map(escapeHtml).join(", ")}. Das Register "To-Do" zeigt hier die allgemeine To-Do-Vorlage.</p>
    <p><strong>Ausgeblendet</strong> (gehören zu einer bestimmten Ferien): ${versteckt.map(escapeHtml).join(", ")}.</p>
    <p class="hint-small">Wähle oben im Dropdown eine Ferien, um diese Register wieder zu sehen. Beim Öffnen startet die App nur dann in dieser Ansicht, wenn gerade keine Ferien laufen und du sie zuletzt so verlassen hast. Läuft eine Ferien, öffnet die App direkt diese.</p>
  `;
}

function openNeutralInfoModal() {
  const wrap = document.createElement("div");
  wrap.innerHTML = neutralExplanationHtml();
  openModal(wrap, () => {});
}

/** Gemeinsame Erfassungs-Box (Packliste, To-Do, Reisetag, To-Do-Vorlage, Popup):
 *  Text, Termin, Kategorie, Art (einmalig/fix) und "Mit Details ..." als ein
 *  sichtbar zusammengehörender Block. */
function buildNeuerEintragBox(cfg) {
  const key = cfg.key;
  const isTodo = key === "todo";
  const vorlageOnly = !!cfg.vorlageOnly;
  const trip = cfg.trip || null;
  const katId = "ne-kat-" + (cfg.idSuffix || "x");
  const typStore = cfg.typStore || null;
  let typ = typStore ? typStore.get() : "einmalig";
  if (typ !== "fix") typ = "einmalig";

  const katalog = ensureVorlageFuerListKey(key);
  const alleKat = [...katalog.map((k) => k.kategorie), ...(cfg.extraKategorien || []), ...(trip ? (trip[key] || []).map((i) => i.kategorie) : [])];
  const letzte = trip && (trip[key] || []).length ? trip[key][trip[key].length - 1].kategorie : "";
  const defaultKat = cfg.defaultKategorie || letzte || "Allgemein";
  const zeigeTermin = isTodo && !vorlageOnly && !cfg.fixedTermin;
  const titel = cfg.title || (vorlageOnly ? "Neue Vorlage erfassen" : (isTodo ? "Neues To-Do erfassen" : "Neuen Artikel erfassen"));
  const vorlageName = isTodo ? "To-Do-Vorlage" : "Artikel-Datenbank";

  const form = document.createElement("form");
  form.className = "neuer-eintrag-box";
  const mittel = `
    ${zeigeTermin ? '<div class="ne-field"><span class="ne-field-title"><i class="ti ti-calendar-event"></i> Termin (Tage vor Abreise, optional)</span><input type="number" class="ne-termin" placeholder="z. B. -5, 0 = Abreisetag" /></div>' : ""}
    <div class="ne-field"><span class="ne-field-title"><i class="ti ti-tag"></i> Kategorie</span><div class="ne-kat"></div></div>
    ${vorlageOnly ? "" : `<div class="ne-field"><span class="ne-field-title"><i class="ti ti-bolt"></i> Art</span>
      <div class="chip-row">
        <button type="button" class="chip ne-typ-chip" data-typ="einmalig"><i class="ti ti-bolt"></i>Einmalig</button>
        <button type="button" class="chip ne-typ-chip" data-typ="fix"><i class="ti ti-pin"></i>Fix (in Vorlage übernehmen)</button>
      </div>
      <span class="hint-small" style="margin:0">Einmalig gilt nur für diese Ferien. Fix landet zusätzlich in der ${vorlageName} und erscheint bei künftigen Ferien.</span></div>`}
  `;
  form.innerHTML = `
    <div class="neuer-eintrag-head"><i class="ti ti-plus"></i> ${escapeHtml(titel)}</div>
    <div class="ne-field"><span class="ne-field-title"><i class="ti ti-pencil"></i> ${isTodo ? "To-Do" : "Artikel"}</span><input type="text" class="ne-text" placeholder="${escapeHtml(cfg.placeholder || "")}" /></div>
    ${cfg.compact ? '<details class="ne-more"><summary class="ne-field-title"><i class="ti ti-adjustments"></i> Kategorie, Art ...</summary>' + mittel + '</details>' : mittel}
    <div class="ne-actions">
      <button type="submit"><i class="ti ti-plus"></i> Hinzufügen</button>
      <button type="button" class="secondary ne-details-btn"><i class="ti ti-list-details"></i> Mit Details ...</button>
    </div>
  `;
  form.querySelector(".ne-kat").innerHTML = kategorieDatalistHtml(katId, alleKat, defaultKat);
  wireKategorieBadges(katId, form);

  const typChips = form.querySelectorAll(".ne-typ-chip");
  const syncChips = () => typChips.forEach((c) => c.classList.toggle("active", c.dataset.typ === typ));
  typChips.forEach((c) => { c.onclick = () => { typ = c.dataset.typ; if (typStore) typStore.set(typ); syncChips(); }; });
  syncChips();

  const erfassen = (mitDetails) => {
    const textInput = form.querySelector(".ne-text");
    const text = textInput.value.trim();
    if (!text) { textInput.focus(); return; }
    const kategorie = (form.querySelector("#" + katId).value || "").trim() || "Allgemein";
    const rnd = () => Date.now() + Math.random().toString(36).slice(2, 6);
    let newItem = null;
    let dbEntry = null;
    if (!vorlageOnly) {
      newItem = { id: "i" + rnd(), text, erledigt: false, kategorie, sort: trip[key].length, erfassungsTyp: typ };
      if (isTodo) {
        if (cfg.fixedTermin) newItem.termin = cfg.offset;
        else {
          const ti = form.querySelector(".ne-termin");
          if (ti && ti.value !== "") newItem.termin = Number(ti.value);
        }
      }
      trip[key].push(newItem);
      if (typ === "fix") {
        dbEntry = key === "packliste"
          ? { id: "art" + rnd(), kategorie, text, bemerkung: "", merkmale: [], check: "offen", spontan: true }
          : { id: "tv" + rnd(), kategorie, text, merkmale: [], check: "offen", spontan: true };
        katalog.push(dbEntry);
      }
    } else {
      dbEntry = { id: "tv" + rnd(), kategorie, text, merkmale: [], check: "erledigt", checkDatum: new Date().toISOString() };
      katalog.push(dbEntry);
    }
    saveChange();
    cfg.onAdded();
    if (!mitDetails) return;
    if (dbEntry) {
      if (isTodo) openTodoVorlageEditModal(dbEntry, cfg.reload, newItem || undefined);
      else {
        const kat = ensureArtikelDatenbank();
        editingArtikelId = dbEntry.id;
        openModal(renderArtikelForm(kat, () => { closeModal(); cfg.reload(); }, dbEntry, newItem || undefined), () => { editingArtikelId = null; });
      }
    } else if (newItem) {
      openLokalBearbeitenModal(newItem, cfg.reload, key);
    }
  };

  form.addEventListener("submit", (e) => { e.preventDefault(); erfassen(false); });
  form.querySelector(".ne-details-btn").onclick = () => erfassen(true);
  return form;
}

/** Öffnet die Erfassungs-Box als Popup (für das fixierte Plus oben). */
function openNeuerEintragModal(opts) {
  const rerender = opts.rerender || (() => render());
  const wrap = document.createElement("div");
  wrap.className = "field-form";
  openModal(wrap, () => {});
  const box = buildNeuerEintragBox({
    key: opts.key,
    trip: opts.trip,
    vorlageOnly: opts.vorlageOnly,
    placeholder: opts.placeholder,
    title: opts.title,
    idSuffix: "modal",
    extraKategorien: opts.extraKategorien,
    onAdded: () => { closeModal(); rerender(); },
    reload: rerender,
  });
  wrap.appendChild(box);
  setTimeout(() => { const i = box.querySelector(".ne-text"); if (i) i.focus(); }, 60);
}

/** To-Do-Register ohne gewählte Ferien: zeigt die allgemeine To-Do-Vorlage. */
function renderTodoVorlageTab(el) {
  const vorlage = ensureTodoVorlage();
  const reload = () => renderTodoVorlageTab(el);
  el.innerHTML = `
    <section class="panel">
      <h2><i class="ti ti-list-check"></i> To-Do-Vorlage (für alle Ferien)</h2>
      <p class="hint-small">Allgemein-Ansicht: Diese To-Dos werden bei neuen Ferien in deren To-Do-Liste übernommen. Änderungen hier gelten für alle künftigen Ferien. Die To-Do-Liste einer bestimmten Ferien siehst du, sobald du oben im Dropdown eine Ferien wählst.</p>
      <p class="hint-small" style="margin:0">Total: ${vorlage.length}</p>
    </section>
  `;
  const gruppen = {};
  vorlage.forEach((v) => { const k = v.kategorie || "Allgemein"; (gruppen[k] = gruppen[k] || []).push(v); });
  Object.keys(gruppen).sort((a, b) => a.localeCompare(b, "de")).forEach((k) => {
    const sec = document.createElement("section");
    sec.className = "panel";
    const res = collapsibleHeader("todovorlage:" + k, escapeHtml(k) + " (" + gruppen[k].length + ")", reload);
    sec.appendChild(res.header);
    if (!res.isCollapsed) {
      gruppen[k].slice().sort((a, b) => (a.text || "").localeCompare(b.text || "", "de")).forEach((v) => {
        const row = document.createElement("div");
        row.className = "item-row";
        const span = document.createElement("span");
        span.style.flex = "1";
        span.innerHTML = (v.prioritaet ? '<i class="ti ti-flag" style="color:var(--amber-dark)"></i> ' : "") + escapeHtml(v.text) + (istCheckOffen(v) ? ' <span class="check-badge" title="Noch nicht geprüft"><i class="ti ti-list-check"></i> Check offen</span>' : "");
        span.onclick = () => openTodoVorlageEditModal(v, reload);
        row.appendChild(span);
        const dup = document.createElement("button");
        dup.type = "button";
        dup.className = "icon-btn";
        dup.title = "Duplizieren";
        dup.innerHTML = '<i class="ti ti-copy"></i>';
        dup.onclick = (e) => {
          e.stopPropagation();
          const kopie = { ...v, id: "tv" + Date.now() + Math.random().toString(36).slice(2, 6), text: v.text + " (Kopie)", check: "offen" };
          delete kopie.checkDatum;
          vorlage.push(kopie);
          saveChange();
          reload();
        };
        row.appendChild(dup);
        const del = document.createElement("button");
        del.type = "button";
        del.className = "icon-btn danger";
        del.title = "Löschen";
        del.innerHTML = '<i class="ti ti-trash"></i>';
        del.onclick = (e) => {
          e.stopPropagation();
          const data = getData();
          const pos = data.todoVorlage.findIndex((x) => x.id === v.id);
          data.todoVorlage = data.todoVorlage.filter((x) => x.id !== v.id);
          saveChange();
          reload();
          showUndoToast('"' + v.text + '" gelöscht', () => {
            const d2 = getData();
            d2.todoVorlage.splice(Math.min(Math.max(pos, 0), d2.todoVorlage.length), 0, v);
            saveChange();
            render();
          });
        };
        row.appendChild(del);
        sec.appendChild(row);
      });
    }
    el.appendChild(sec);
  });
  const holder = document.createElement("div");
  holder.appendChild(buildNeuerEintragBox({
    key: "todo", trip: null, vorlageOnly: true, placeholder: "Neue To-Do-Vorlage ...", idSuffix: "vorlage",
    extraKategorien: Object.keys(gruppen), onAdded: reload, reload,
  }));
  el.appendChild(holder);
}

function findAddBtn(sel, text) {
  const root = document.getElementById("tab-content");
  if (!root) return null;
  if (sel) return root.querySelector(sel);
  return Array.from(root.querySelectorAll("button")).find((b) => b.textContent.trim() === text) || null;
}

function getAddActions(tab, trip) {
  const click = (label, sel, text) => ({ label, sel, text });
  const listModal = (label, key) => ({
    label,
    run: () => openNeuerEintragModal({
      key,
      trip: trip || null,
      vorlageOnly: !trip,
      placeholder: key === "todo" ? "Neuer Punkt ..." : "Neuer Artikel ...",
      title: key === "todo" ? "Neues To-Do erfassen" : "Neuen Artikel erfassen",
    }),
  });
  if (tab === "artikel") return [click("Artikel", "#new-artikel-button")];
  if (tab === "merkmale") return [click("Merkmal", "#new-merkmal-button")];
  if (tab === "ratgeber") return [click("Eintrag", "#new-ratgeber-button")];
  if (tab === "ferien") return [click("Ferien", null, "Neue Ferien"), click("Unterkunft", null, "Neue Unterkunft"), click("Etappe", null, "Neue Etappe")];
  if (!trip && tab !== "todo") return [];
  if (tab === "todo") return [listModal("To-Do", "todo")];
  if (tab === "packliste") return [listModal("Artikel", "packliste")];
  if (tab === "reisetag") return [listModal("To-Do", "todo"), listModal("Artikel", "packliste")];
  if (tab === "programm") return [click("Tagesplan", "#new-tagesplan-button"), click("Idee", "#new-idee-button")];
  if (tab === "finanzen") return [click("Ausgabe", "#new-finanz-button")];
  if (tab === "stromladen") return [click("Ladung", null, "Neue Ladung")];
  if (tab === "notizen") return [click("Notiz", "#new-notiz-button")];
  return [];
}

/** Fixierte Leiste oben (bleibt beim Scrollen sichtbar) mit Plus-Button(s)
 *  zum schnellen Erfassen - öffnet das jeweilige Erfassen-Popup. */
function injectAddBar() {
  const app = document.getElementById("app-screen");
  if (!app) return;
  let bar = document.getElementById("tab-add-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "tab-add-bar";
    bar.className = "tab-add-bar hidden";
    const header = app.querySelector("header");
    app.insertBefore(bar, header ? header.nextSibling : app.firstChild);
  }
  const trip = getCurrentTrip();
  const neutral = !trip && getData().ferien.length > 0;
  const actions = getAddActions(currentTab, trip).filter((a) => a.run || findAddBtn(a.sel, a.text));
  const hatZurueck = tabHistory.length > 0;
  const def = TAB_DEFS[currentTab] || { icon: "ti-settings", label: "Einstellungen" };
  bar.classList.remove("hidden");
  bar.innerHTML = `${hatZurueck ? '<button type="button" class="tab-back-btn" title="Zurück"><i class="ti ti-arrow-left"></i></button>' : ""}<span class="tab-add-title"><i class="ti ${def.icon}"></i> ${escapeHtml(def.label)}</span>${neutral ? '<button type="button" class="tab-add-info" title="Was ist die Allgemein-Ansicht?"><i class="ti ti-info-circle"></i> Allgemein-Ansicht</button>' : ""}<span class="tab-add-spacer"></span>`;
  const sb = document.createElement("button");
  sb.type = "button"; sb.className = "tab-add-btn tab-search-btn"; sb.title = "Suchen"; sb.innerHTML = '<i class="ti ti-search"></i>';
  sb.onclick = openSucheModal;
  bar.appendChild(sb);
  const back = bar.querySelector(".tab-back-btn");
  if (back) back.onclick = () => history.back();
  const info = bar.querySelector(".tab-add-info");
  if (info) info.onclick = openNeutralInfoModal;
  actions.forEach((a) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tab-add-btn";
    b.title = "Neu erfassen: " + a.label;
    b.innerHTML = '<i class="ti ti-plus"></i> ' + escapeHtml(a.label);
    b.onclick = a.run ? a.run : () => { const x = findAddBtn(a.sel, a.text); if (x) x.click(); };
    bar.appendChild(b);
  });
}

// ===========================================================
// ZURUECK-NAVIGATION + RUECKGAENGIG-HINWEIS (Toast)
// ===========================================================
const tabHistory = [];

/** Tab wechseln und den Wechsel in der Browser-Chronik merken, damit der
 *  Zurück-Button (und die Zurück-Taste am Handy) zum vorigen Register führt. */
function navigateTab(tab) {
  if (tab === currentTab) return;
  tabHistory.push(currentTab);
  try { history.pushState({ tab }, ""); } catch (e) { /* ignorieren */ }
  currentTab = tab;
  render();
}

try { history.replaceState({ tab: currentTab }, ""); } catch (e) { /* ignorieren */ }
window.addEventListener("popstate", (e) => {
  const tab = e.state && e.state.tab;
  if (!tab) return;
  if (tabHistory.length) tabHistory.pop();
  currentTab = tab;
  closeModal();
  render();
});

let undoToastTimer = null;
/** Zeigt unten einen kurzen Hinweis mit "Rückgängig"-Button (ca. 9 Sekunden). */
function showUndoToast(message, undoFn) {
  let el = document.getElementById("undo-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "undo-toast";
    el.className = "undo-toast";
    document.body.appendChild(el);
  }
  el.innerHTML = '<span class="undo-toast-text"></span><button type="button" class="undo-toast-btn"><i class="ti ti-arrow-back-up"></i> Rückgängig</button>';
  el.querySelector(".undo-toast-text").textContent = message;
  el.classList.add("visible");
  const hide = () => el.classList.remove("visible");
  el.querySelector(".undo-toast-btn").onclick = () => {
    hide();
    if (undoToastTimer) clearTimeout(undoToastTimer);
    undoFn();
  };
  if (undoToastTimer) clearTimeout(undoToastTimer);
  undoToastTimer = setTimeout(hide, 9000);
}

// ===========================================================
// HILFSFUNKTIONEN
// ===========================================================

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("Service Worker fehlgeschlagen:", e));
  }
}

window.addEventListener("DOMContentLoaded", main);
