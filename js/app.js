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
// Einmalig/Fix-Wahl für die Inline-Erfassung auf der Reisetag-Seite (pro Liste)
const reisetagNeuErfassungsTyp = { todo: "einmalig", packliste: "einmalig" };

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
  merkmale: { icon: "ti-tags", label: "Merkmale" },
};
const FIXED_FIRST_TABS = ["start", "ferien"];
const FIXED_LAST_TAB = "einstellungen";
const DEFAULT_SORTABLE_TABS = ["reisetag", "packliste", "todo", "artikel", "programm", "finanzen", "merkmale"];

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
  const order = [...FIXED_FIRST_TABS, ...getSortableTabs()];
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
    btn.onclick = () => {
      currentTab = btn.dataset.tab;
      render();
    };
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
function setCurrentTrip(id) {
  currentTripId = id;
  const data = getData();
  data.lastTripId = id;
  saveChange();
}

/** Liefert die Ferien, deren Zeitraum (von-bis) das heutige Datum umfasst,
 *  falls es genau eine solche gibt - sonst null. Für Ferien ohne Bis-Datum
 *  gilt: von <= heute reicht (offenes Ende). */
function findDateCurrentTrip(data) {
  const today = new Date(new Date().toDateString());
  return data.ferien.find((f) => {
    if (!f.von) return false;
    const von = new Date(f.von);
    if (today < von) return false;
    if (f.bis) {
      const bis = new Date(f.bis);
      if (today > bis) return false;
    }
    return true;
  }) || null;
}

/** Bestimmt, welche Ferien beim App-Start vorausgewählt wird: zuerst eine
 *  datumsmässig gerade laufende Ferien, sonst die zuletzt angezeigte
 *  (data.lastTripId), sonst die erste vorhandene Ferien. */
function determineInitialTripId(data) {
  if (!data.ferien.length) return null;
  const dateCurrent = findDateCurrentTrip(data);
  if (dateCurrent) return dateCurrent.id;
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

  select.innerHTML = sorted.map((f) => `<option value="${f.id}">${escapeHtml(f.titel)}</option>`).join("");
  select.value = currentTripId;
  select.onchange = () => {
    setCurrentTrip(select.value);
    render();
  };
}

function itemVisible(item, trip) {
  if (!item.nurWenn || item.nurWenn.length === 0) return true;
  return item.nurWenn.some((k) => trip.merkmale && trip.merkmale[k]);
}

/** Prüft, ob ein Packliste-/To-Do-Item zum aktuell gewählten Status-Filter
 *  passt. "offen" (Standardansicht) blendet sowohl erledigte als auch als
 *  "nicht relevant" markierte Punkte aus. */
function matchesFilter(item, filter, trip) {
  if (filter === "erledigt") return !!item.erledigt;
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
}
function closeModal() {
  const existing = document.getElementById("app-modal-overlay");
  if (existing) existing.remove();
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
    if (window.scrollY > 400) btn.classList.add("visible");
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
  const trip = getCurrentTrip();
  document.getElementById("header-title").textContent = trip ? trip.titel : "Ferien-App";
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
  el.appendChild(nav);

  // --- To-Dos ---
  const todoSection = document.createElement("section");
  todoSection.className = "panel";
  const todoHeadingRow = document.createElement("div");
  todoHeadingRow.className = "panel-header-row";
  todoHeadingRow.innerHTML = `<h2 style="margin:0">✅ To-Dos</h2>`;
  const todoLinkBtn = document.createElement("button");
  todoLinkBtn.type = "button";
  todoLinkBtn.className = "icon-btn";
  todoLinkBtn.title = "Zur To-Do-Liste";
  todoLinkBtn.innerHTML = `<i class="ti ti-external-link"></i>`;
  todoLinkBtn.onclick = () => { currentTab = "todo"; render(); };
  todoHeadingRow.appendChild(todoLinkBtn);
  todoSection.appendChild(todoHeadingRow);
  const todosForDay = trip.todo.filter((i) => reisetagItemMatches(i, trip, reisetagOffset, reisetagShowAllOpen));
  if (!todosForDay.length) {
    const hint = document.createElement("p");
    hint.className = "hint-empty";
    hint.textContent = "Keine To-Dos zu sehen.";
    todoSection.appendChild(hint);
  } else {
    todosForDay.forEach((item) => todoSection.appendChild(reisetagItemRow(item, onChange)));
  }
  todoSection.appendChild(renderReisetagQuickAddForm(trip, "todo", reisetagOffset, onChange));
  el.appendChild(todoSection);

  // --- Packliste: kein eigenes Termin-Feld, gilt daher immer als "ohne Datum" ---
  const packSection = document.createElement("section");
  packSection.className = "panel";
  const packHeadingRow = document.createElement("div");
  packHeadingRow.className = "panel-header-row";
  packHeadingRow.innerHTML = `<h2 style="margin:0">🎒 Packliste</h2>`;
  const packLinkBtn = document.createElement("button");
  packLinkBtn.type = "button";
  packLinkBtn.className = "icon-btn";
  packLinkBtn.title = "Zur Packliste";
  packLinkBtn.innerHTML = `<i class="ti ti-external-link"></i>`;
  packLinkBtn.onclick = () => { currentTab = "packliste"; render(); };
  packHeadingRow.appendChild(packLinkBtn);
  packSection.appendChild(packHeadingRow);
  const openPack = trip.packliste.filter((i) => reisetagItemMatches(i, trip, reisetagOffset, reisetagShowAllOpen));
  if (!openPack.length) {
    const empty = document.createElement("p");
    empty.className = "hint-empty";
    empty.textContent = "Alles gepackt!";
    packSection.appendChild(empty);
  } else {
    openPack.forEach((item) => packSection.appendChild(reisetagItemRow(item, onChange)));
  }
  packSection.appendChild(renderReisetagQuickAddForm(trip, "packliste", reisetagOffset, onChange));
  el.appendChild(packSection);
}

/** Entscheidet, ob ein Item im Reisetag-Register angezeigt wird: offene Positionen
 *  mit aktuellem/vergangenem Termin oder ganz ohne Termin (Packliste hat nie ein
 *  Termin-Feld, gilt also immer als "ohne Datum"); per Toggle auch alle offenen
 *  Positionen unabhängig vom Termin (z. B. auch zukünftige). */
function reisetagItemMatches(item, trip, offset, showAllOpen) {
  if (!itemVisible(item, trip)) return false;
  if (item.erledigt || item.nichtRelevant) return false;
  if (showAllOpen) return true;
  if (item.termin === undefined || item.termin === null || item.termin === "") return true;
  return Number(item.termin) <= offset;
}

/** Leichte Zeilen-Darstellung fürs Reisetag-Register: greift direkt auf
 *  dasselbe Item-Objekt wie Packliste/To-Do zu (keine Kopie), daher ist
 *  das Abhaken hier automatisch bidirektional synchron. */
function reisetagItemRow(item, onChange) {
  const row = document.createElement("div");
  row.className = "item-row" + (item.erledigt ? " done" : "") + (item.nichtRelevant ? " not-relevant" : "") + (item.prioritaet ? " priority" : "");

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = item.erledigt;
  cb.addEventListener("change", () => {
    item.erledigt = cb.checked;
    if (item.erledigt) item.nichtRelevant = false;
    saveChange();
    onChange();
  });
  row.appendChild(cb);

  if (item.prioritaet) {
    const flag = document.createElement("i");
    flag.className = "ti ti-flag-filled";
    flag.style.color = "var(--amber-dark)";
    row.appendChild(flag);
  }

  const span = document.createElement("span");
  span.style.flex = "1";
  span.textContent = item.text;
  if (item.termin !== undefined && item.termin !== null && item.termin !== "") {
    const badge = document.createElement("span");
    badge.className = "termin-badge";
    badge.style.marginLeft = "6px";
    badge.textContent = formatTermin(Number(item.termin));
    span.appendChild(badge);
  }
  row.appendChild(span);

  return row;
}

/** Inline-Erfassungsformular direkt auf der Reisetag-Seite: neue To-Dos landen
 *  mit Termin = aktuell angezeigter Tag, neue Packliste-Punkte ohne Termin -
 *  in beiden Fällen mit Wahl Einmalig/Fix (Fix wandert zusätzlich in die
 *  zentrale Vorlage, siehe ensureArtikelDatenbank()/ensureTodoVorlage()). */
function renderReisetagQuickAddForm(trip, key, offset, onChange) {
  const isTodo = key === "todo";
  const wrap = document.createElement("form");
  wrap.className = "add-form";
  wrap.style.marginTop = "10px";
  wrap.innerHTML = `
    <input type="text" placeholder="${isTodo ? "Neues To-Do für diesen Tag ..." : "Neuer Artikel ..."}" required />
    <button type="submit"><i class="ti ti-plus"></i></button>
  `;
  const chipRow = document.createElement("div");
  chipRow.className = "chip-row";
  chipRow.style.marginTop = "6px";
  const chipEinmalig = document.createElement("button");
  chipEinmalig.type = "button";
  chipEinmalig.className = "chip" + (reisetagNeuErfassungsTyp[key] === "einmalig" ? " active" : "");
  chipEinmalig.innerHTML = `<i class="ti ti-bolt"></i>Einmalig`;
  const chipFix = document.createElement("button");
  chipFix.type = "button";
  chipFix.className = "chip" + (reisetagNeuErfassungsTyp[key] === "fix" ? " active" : "");
  chipFix.innerHTML = `<i class="ti ti-pin"></i>Fix (in Vorlage übernehmen)`;
  chipEinmalig.onclick = () => {
    reisetagNeuErfassungsTyp[key] = "einmalig";
    chipEinmalig.classList.add("active");
    chipFix.classList.remove("active");
  };
  chipFix.onclick = () => {
    reisetagNeuErfassungsTyp[key] = "fix";
    chipFix.classList.add("active");
    chipEinmalig.classList.remove("active");
  };
  chipRow.appendChild(chipEinmalig);
  chipRow.appendChild(chipFix);
  wrap.appendChild(chipRow);

  wrap.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = wrap.querySelector("input[type=text]");
    const text = input.value.trim();
    if (!text) return;
    const erfassungsTyp = reisetagNeuErfassungsTyp[key];
    const kategorie = "Allgemein";
    const newItem = {
      id: "i" + Date.now() + Math.random().toString(36).slice(2, 6),
      text,
      erledigt: false,
      kategorie,
      sort: trip[key].length,
      erfassungsTyp,
    };
    if (isTodo) newItem.termin = offset;
    trip[key].push(newItem);
    if (erfassungsTyp === "fix") {
      if (key === "packliste") {
        const katalog = ensureArtikelDatenbank();
        katalog.push({ id: "art" + Date.now() + Math.random().toString(36).slice(2, 6), kategorie, text, bemerkung: "", merkmale: [] });
      } else {
        const vorlage = ensureTodoVorlage();
        vorlage.push({ id: "tv" + Date.now() + Math.random().toString(36).slice(2, 6), kategorie, text, merkmale: [] });
      }
    }
    saveChange();
    onChange();
  });

  return wrap;
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

/** Formular zum Bearbeiten von Titel und Zeitraum der aktuellen Ferien
 *  (bislang liess sich das nur beim Anlegen per Prompt setzen). */
function renderTripEditForm(trip, onChange) {
  const form = document.createElement("form");
  form.className = "field-form panel";
  form.innerHTML = `
    <label>Titel<input type="text" name="titel" value="${escapeHtml(trip.titel)}" required /></label>
    <div class="field-row">
      <label>Von<input type="date" name="von" value="${escapeHtml(trip.von || "")}" /></label>
      <label>Bis<input type="date" name="bis" value="${escapeHtml(trip.bis || "")}" /></label>
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
      ${etappe ? `<p class="u-dates"><i class="ti ti-map-pin"></i> ${escapeHtml(etappe.titel)}</p>` : ""}
      ${zeitraum ? `<p class="u-dates">${escapeHtml(zeitraum)}</p>` : ""}
      ${ortZeile ? `<p class="u-adresse">${escapeHtml(ortZeile)}</p>` : ""}
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
    name: "", adresse: "", plzOrt: "", land: "", von: "", bis: "", checkin: "", checkout: "",
    buchungsnummer: "", vermieterName: "", telefon: "", email: "", zugangscode: "",
    wlanName: "", wlanPasswort: "",
    linkGoogleMaps: "", linkWebseite: "", linkBooking: "", linkAirbnb: "", linkSonstiges: "",
    notizen: "", etappeId: "",
  };

  const form = document.createElement("form");
  form.className = "field-form panel";
  form.innerHTML = `
    <label>Name<input type="text" name="name" value="${escapeHtml(u.name)}" placeholder="z. B. Chalet Alpenblick" required /></label>
    ${(trip.etappen && trip.etappen.length) ? `
    <label>Etappe
      <select name="etappeId">
        <option value="">Keine Etappe</option>
        ${trip.etappen.map((e) => `<option value="${escapeHtml(e.id)}" ${u.etappeId === e.id ? "selected" : ""}>${escapeHtml(e.titel)}</option>`).join("")}
      </select>
    </label>` : ""}
    <div class="field-row">
      <label>Von<input type="date" name="von" value="${escapeHtml(u.von)}" /></label>
      <label>Bis<input type="date" name="bis" value="${escapeHtml(u.bis)}" /></label>
    </div>
    <div class="field-row">
      <label>Check-in<input type="text" name="checkin" value="${escapeHtml(u.checkin)}" placeholder="z. B. ab 15:00" /></label>
      <label>Check-out<input type="text" name="checkout" value="${escapeHtml(u.checkout)}" placeholder="z. B. bis 10:00" /></label>
    </div>
    <label>Strasse / Nr.<input type="text" name="adresse" value="${escapeHtml(u.adresse)}" /></label>
    <div class="field-row">
      <label>PLZ / Ort<input type="text" name="plzOrt" value="${escapeHtml(u.plzOrt)}" /></label>
      <label>Land<input type="text" name="land" value="${escapeHtml(u.land)}" /></label>
    </div>
    <div class="field-row">
      <label>Vermieter (Name)<input type="text" name="vermieterName" value="${escapeHtml(u.vermieterName)}" /></label>
      <label>Telefon<input type="text" name="telefon" value="${escapeHtml(u.telefon)}" /></label>
    </div>
    <div class="field-row">
      <label>E-Mail<input type="email" name="email" value="${escapeHtml(u.email)}" /></label>
      <label>Buchungsnr.<input type="text" name="buchungsnummer" value="${escapeHtml(u.buchungsnummer)}" /></label>
    </div>
    <label>Zugangscode / Schlüsselübergabe<input type="text" name="zugangscode" value="${escapeHtml(u.zugangscode)}" /></label>
    <div class="field-row">
      <label>WLAN-Name<input type="text" name="wlanName" value="${escapeHtml(u.wlanName)}" /></label>
      <label>WLAN-Passwort<input type="text" name="wlanPasswort" value="${escapeHtml(u.wlanPasswort)}" /></label>
    </div>
    <p class="hint-small" style="margin-bottom:2px">🔗 Links</p>
    <label>Google Maps<input type="url" name="linkGoogleMaps" value="${escapeHtml(u.linkGoogleMaps)}" placeholder="https://..." /></label>
    <label>Webseite / Inserat<input type="url" name="linkWebseite" value="${escapeHtml(u.linkWebseite)}" placeholder="https://..." /></label>
    <div class="field-row">
      <label>Booking.com<input type="url" name="linkBooking" value="${escapeHtml(u.linkBooking)}" placeholder="https://..." /></label>
      <label>Airbnb<input type="url" name="linkAirbnb" value="${escapeHtml(u.linkAirbnb)}" placeholder="https://..." /></label>
    </div>
    <label>Sonstiges<input type="url" name="linkSonstiges" value="${escapeHtml(u.linkSonstiges)}" placeholder="https://..." /></label>
    <label>Bemerkung<textarea name="notizen" rows="2">${escapeHtml(u.notizen)}</textarea></label>
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
      <p class="u-name"><i class="ti ti-map-pin"></i>${escapeHtml(etp.titel || "Ohne Namen")}</p>
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
    <label>Titel<input type="text" name="titel" value="${escapeHtml(etp.titel)}" placeholder="z. B. Zermatt" required /></label>
    <div class="field-row">
      <label>Von<input type="date" name="von" value="${escapeHtml(etp.von)}" /></label>
      <label>Bis<input type="date" name="bis" value="${escapeHtml(etp.bis)}" /></label>
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
  }));
  const todo = ensureTodoVorlage().map((t, i) => ({
    id: "i" + Date.now() + Math.random().toString(36).slice(2, 6) + "t" + i,
    text: t.text,
    erledigt: false,
    kategorie: t.kategorie || "Allgemein",
    sort: i,
    ...(t.merkmale && t.merkmale.length ? { nurWenn: t.merkmale } : {}),
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
  }
  return data.merkmaleDefs;
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
  const relevant = items.filter((i) => itemVisible(i, trip) && matchesFilter(i, filterMode[key], trip));
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
        { value: "alle", label: "Alle", icon: "ti-list" },
      ]
    : [];

  el.innerHTML = `
    ${quickFilters.length ? `
    <div class="quick-filter-row">
      ${quickFilters.map((f) => `<button type="button" class="quick-filter-btn${filterMode[key] === f.value ? " active" : ""}" data-filter="${f.value}"><i class="ti ${f.icon}"></i> ${f.label}</button>`).join("")}
    </div>` : ""}
    <div class="list-toolbar">
      <select id="filter-select" title="Status-Filter">
        <option value="offen"${filterMode[key] === "offen" ? " selected" : ""}>Offen</option>
        <option value="erledigt"${filterMode[key] === "erledigt" ? " selected" : ""}>Erledigt</option>
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
    <div id="cat-container"></div>
    <form id="add-form" class="add-form">
      <input type="text" placeholder="${placeholder}" required />
      ${mode === "kategorie" ? `<select id="cat-select"></select>` : ""}
      ${isTodo ? `<input type="number" id="termin-input" placeholder="Tage vor Abreise" title="Tage vor Abreise (z. B. -5, 0 = Abreisetag), optional" style="max-width:110px;" />` : ""}
      <button type="submit"><i class="ti ti-plus"></i></button>
    </form>
    <div class="chip-row" id="erfassungstyp-row" style="margin-top:6px;">
      <button type="button" class="chip erfassungstyp-chip active" data-typ="einmalig"><i class="ti ti-bolt"></i>Einmalig</button>
      <button type="button" class="chip erfassungstyp-chip" data-typ="fix"><i class="ti ti-pin"></i>Fix (in Vorlage übernehmen)</button>
    </div>
  `;

  document.querySelectorAll(".quick-filter-btn").forEach((btn) => {
    btn.onclick = () => {
      filterMode[key] = btn.dataset.filter;
      renderListTab(el, trip, key, icon, placeholder);
    };
  });

  let neuErfassungsTyp = "einmalig";
  document.querySelectorAll(".erfassungstyp-chip").forEach((chip) => {
    chip.onclick = () => {
      neuErfassungsTyp = chip.dataset.typ;
      document.querySelectorAll(".erfassungstyp-chip").forEach((c) => c.classList.toggle("active", c === chip));
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

  let catSelect = null;
  if (mode === "kategorie") {
    catSelect = document.getElementById("cat-select");
    const allCats = groups.map((g) => g.name).length ? groups.map((g) => g.name) : ["Allgemein"];
    allCats.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      catSelect.appendChild(opt);
    });
    const neuOpt = document.createElement("option");
    neuOpt.value = "__neu__";
    neuOpt.textContent = "+ neue Kategorie";
    catSelect.appendChild(neuOpt);
  }

  const catContainer = document.getElementById("cat-container");
  groups.forEach((g) => {
    catContainer.appendChild(renderCategory(trip, key, g.name, g.items, isTodo, () => renderListTab(el, trip, key, icon, placeholder)));
  });

  document.getElementById("add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = e.target.querySelector("input[type=text]");
    const text = input.value.trim();
    if (!text) return;

    let kategorie = "Allgemein";
    if (catSelect) {
      kategorie = catSelect.value;
      if (kategorie === "__neu__") {
        kategorie = prompt("Name der neuen Kategorie:") || "Allgemein";
      }
    }

    const newItem = {
      id: "i" + Date.now() + Math.random().toString(36).slice(2, 6),
      text,
      erledigt: false,
      kategorie,
      sort: items.length,
      erfassungsTyp: neuErfassungsTyp,
    };

    if (isTodo) {
      const terminInput = document.getElementById("termin-input");
      if (terminInput && terminInput.value !== "") {
        newItem.termin = Number(terminInput.value);
      }
    }

    items.push(newItem);

    // "Fix" erfasste Punkte landen zusätzlich in der zentralen Vorlage,
    // damit sie auch bei künftigen Ferien automatisch wieder auftauchen.
    if (neuErfassungsTyp === "fix") {
      if (key === "packliste") {
        const katalog = ensureArtikelDatenbank();
        katalog.push({ id: "art" + Date.now() + Math.random().toString(36).slice(2, 6), kategorie, text, bemerkung: "", merkmale: [] });
      } else if (key === "todo") {
        const vorlage = ensureTodoVorlage();
        vorlage.push({ id: "tv" + Date.now() + Math.random().toString(36).slice(2, 6), kategorie, text, merkmale: [] });
      }
    }

    saveChange();
    renderListTab(el, trip, key, icon, placeholder);
  });
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
  header.innerHTML = `<span><i class="ti ${categoryIcon(groupName)} category-icon"></i> ${escapeHtml(groupName)}</span><i class="ti ti-chevron-${isCollapsed ? "right" : "down"}"></i>`;
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

function itemRow(trip, listKey, item, showTermin, manualSort, siblingList, idx, onChange) {
  const row = document.createElement("div");
  row.className = "item-row" + (item.erledigt ? " done" : "") + (item.nichtRelevant ? " not-relevant" : "") + (item.prioritaet ? " priority" : "");

  if (manualSort) {
    const handle = document.createElement("i");
    handle.className = "ti ti-grip-vertical drag-handle";
    row.appendChild(handle);
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
    row.appendChild(moveButtons);
  }

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = item.erledigt;
  cb.addEventListener("change", () => {
    item.erledigt = cb.checked;
    if (cb.checked) item.nichtRelevant = false;
    saveChange();
    onChange();
  });

  row.appendChild(cb);

  if (showTermin && item.termin !== undefined && item.termin !== null && item.termin !== "") {
    const badge = document.createElement("span");
    badge.className = "termin-badge";
    badge.textContent = formatTermin(item.termin);
    row.appendChild(badge);
  }

  const label = document.createElement("span");
  label.textContent = item.text;
  label.style.flex = "1";
  row.appendChild(label);

  if (item.erfassungsTyp === "einmalig" || item.erfassungsTyp === "fix") {
    const typBadge = document.createElement("span");
    typBadge.className = "erfassungstyp-badge" + (item.erfassungsTyp === "fix" ? " fix" : "");
    typBadge.title = item.erfassungsTyp === "fix" ? "Fix - auch in der zentralen Vorlage" : "Einmalig - nur für diese Ferien";
    typBadge.textContent = item.erfassungsTyp === "fix" ? "Fix" : "Einmalig";
    row.appendChild(typBadge);
  }

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
        renderArtikelForm(katalog, () => { closeModal(); onChange(); }, { text: item.text, kategorie: item.kategorie, merkmale: item.nurWenn || [] }),
        () => { editingArtikelId = null; }
      );
    };
    row.appendChild(dbBtn);
  }

  const bell = document.createElement("button");
  bell.type = "button";
  bell.className = "bell-btn" + (item.erinnerung ? " active" : "");
  bell.innerHTML = `<i class="ti ${item.erinnerung ? "ti-bell-filled" : "ti-bell"}"></i>`;
  bell.title = item.erinnerung ? `Erinnerung: ${new Date(item.erinnerung).toLocaleString("de-CH")}` : "Erinnerung setzen";
  bell.onclick = () => {
    editingReminderId = editingReminderId === item.id ? null : item.id;
    onChange();
  };
  row.appendChild(bell);

  const prioBtn = document.createElement("button");
  prioBtn.type = "button";
  prioBtn.className = "icon-btn priority-btn" + (item.prioritaet ? " active" : "");
  prioBtn.innerHTML = `<i class="ti ${item.prioritaet ? "ti-flag-filled" : "ti-flag"}"></i>`;
  prioBtn.title = item.prioritaet ? "Priorität entfernen" : "Als Priorität markieren";
  prioBtn.onclick = () => {
    item.prioritaet = !item.prioritaet;
    saveChange();
    onChange();
  };
  row.appendChild(prioBtn);

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
  row.appendChild(nrBtn);

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "icon-btn";
  editBtn.innerHTML = `<i class="ti ti-pencil"></i>`;
  editBtn.title = "Text/Kategorie bearbeiten";
  editBtn.onclick = () => {
    const neuerText = prompt("Text:", item.text);
    if (neuerText === null) return;
    const neueKategorie = prompt("Kategorie:", item.kategorie || "Allgemein");
    if (neueKategorie === null) return;
    item.text = neuerText.trim() || item.text;
    item.kategorie = neueKategorie.trim() || "Allgemein";
    saveChange();
    onChange();
  };
  row.appendChild(editBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "icon-btn danger";
  deleteBtn.innerHTML = `<i class="ti ti-trash"></i>`;
  deleteBtn.title = "Löschen";
  deleteBtn.onclick = () => {
    if (!confirm(`"${item.text}" wirklich löschen?`)) return;
    const idx2 = siblingList.findIndex((i) => i.id === item.id);
    if (idx2 !== -1) siblingList.splice(idx2, 1);
    const trip2 = trip;
    trip2[listKey] = trip2[listKey].filter((i) => i.id !== item.id);
    saveChange();
    onChange();
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
    <p class="version-footer">Ferien-App v${APP_VERSION} &middot; Stand ${APP_BUILD_DATE}</p>
  `;
  document.getElementById("logout-button").onclick = logout;
  document.getElementById("theme-light").onclick = () => { setTheme("light"); renderEinstellungenTab(el); };
  document.getElementById("theme-dark").onclick = () => { setTheme("dark"); renderEinstellungenTab(el); };
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

function renderArtikelTab(el) {
  closeModal();
  const katalog = ensureArtikelDatenbank();
  const trip = getCurrentTrip();

  el.innerHTML = `
    <section class="panel">
      <div class="panel-header-row">
        <h2><i class="ti ti-list-details"></i> Artikel-Datenbank</h2>
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
    list.appendChild(renderArtikelMatrix(katalog, trip, () => renderArtikelTab(el)));
  } else {
    const sorted = [...katalog].sort((a, b) => getArtikelKategorien(a).join(",").localeCompare(getArtikelKategorien(b).join(",")) || a.text.localeCompare(b.text, "de"));
    const byKategorie = [];
    const byName = {};
    sorted.forEach((a) => {
      getArtikelKategorien(a).forEach((kat) => {
        if (!byName[kat]) { byName[kat] = { kategorie: kat, items: [] }; byKategorie.push(byName[kat]); }
        byName[kat].items.push(a);
      });
    });
    byKategorie.sort((g1, g2) => g1.kategorie.localeCompare(g2.kategorie, "de"));
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
      g.items.forEach((a) => {
        const merkmaleLabels = (a.merkmale || []).map((k) => (getMerkmaleDefs().find((m) => m.key === k) || {}).label).filter(Boolean);
        const alreadyOnPackliste = !!(trip && trip.packliste.some((p) => p.text === a.text));
        const kategorien = getArtikelKategorien(a);
        const row = document.createElement("div");
        row.className = "item-row";
        row.innerHTML = `
          <span style="flex:1">${escapeHtml(a.text)}${kategorien.length > 1 ? ` <span class="hint-small" style="margin:0">(${kategorien.map(escapeHtml).join(", ")})</span>` : ""}${alreadyOnPackliste ? ` <span class="on-packliste-badge" title="Bereits auf der Packliste von &quot;${escapeHtml(trip.titel)}&quot;"><i class="ti ti-checkbox"></i> auf Packliste</span>` : ""}${merkmaleLabels.length ? `<br /><span class="hint-small" style="margin:0">${merkmaleLabels.map(escapeHtml).join(", ")}</span>` : ""}${a.bemerkung ? `<br /><span class="hint-small" style="margin:0"><i class="ti ti-message-2"></i> ${escapeHtml(a.bemerkung)}</span>` : ""}</span>
        `;
        if (trip) {
          const addBtn = document.createElement("button");
          addBtn.type = "button";
          addBtn.className = "icon-btn";
          addBtn.innerHTML = `<i class="ti ti-plus"></i>`;
          addBtn.title = `Zu Packliste von "${trip.titel}" hinzufügen`;
          addBtn.onclick = () => {
            trip.packliste.push({
              id: "i" + Date.now() + Math.random().toString(36).slice(2, 6),
              text: a.text,
              erledigt: false,
              kategorie: a.kategorie || kategorien[0] || "Allgemein",
              sort: trip.packliste.length,
              ...(a.merkmale && a.merkmale.length ? { nurWenn: a.merkmale } : {}),
            });
            saveChange();
            alert(`"${a.text}" wurde zur Packliste von "${trip.titel}" hinzugefügt.`);
          };
          row.appendChild(addBtn);
        }
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "icon-btn";
        editBtn.innerHTML = `<i class="ti ti-pencil"></i>`;
        editBtn.onclick = () => { editingArtikelId = a.id; renderArtikelTab(el); };
        row.appendChild(editBtn);
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "icon-btn danger";
        delBtn.innerHTML = `<i class="ti ti-trash"></i>`;
        delBtn.onclick = () => {
          if (!confirm(`"${a.text}" wirklich aus dem Katalog löschen?`)) return;
          const data = getData();
          data.artikelDatenbank = data.artikelDatenbank.filter((x) => x.id !== a.id);
          saveChange();
          renderArtikelTab(el);
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
  const wrap = document.createElement("div");
  wrap.className = "matrix-scroll";

  const table = document.createElement("table");
  table.className = "artikel-matrix";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.innerHTML = `<th class="matrix-artikel-col">Artikel</th>`;
  defs.forEach((m) => {
    const th = document.createElement("th");
    th.title = m.label;
    th.innerHTML = `<i class="ti ${m.icon}"></i>`;
    headRow.appendChild(th);
  });
  headRow.innerHTML += `<th></th>`;
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  const sorted = [...katalog].sort((a, b) => getArtikelKategorien(a).join(",").localeCompare(getArtikelKategorien(b).join(",")) || a.text.localeCompare(b.text, "de"));
  const byKategorie = [];
  const byName = {};
  sorted.forEach((a) => {
    getArtikelKategorien(a).forEach((kat) => {
      if (!byName[kat]) { byName[kat] = { kategorie: kat, items: [] }; byKategorie.push(byName[kat]); }
      byName[kat].items.push(a);
    });
  });
  byKategorie.sort((g1, g2) => g1.kategorie.localeCompare(g2.kategorie, "de"));

  byKategorie.forEach((g) => {
    const katRow = document.createElement("tr");
    katRow.className = "matrix-kategorie-row";
    const katCell = document.createElement("td");
    katCell.colSpan = defs.length + 2;
    katCell.innerHTML = `<i class="ti ${categoryIcon(g.kategorie)}"></i> ${escapeHtml(g.kategorie)}`;
    katRow.appendChild(katCell);
    tbody.appendChild(katRow);

    g.items.forEach((a) => {
      const alreadyOnPackliste = !!(trip && trip.packliste.some((p) => p.text === a.text));
      const row = document.createElement("tr");
      const nameCell = document.createElement("td");
      nameCell.className = "matrix-artikel-col";
      nameCell.innerHTML = `${escapeHtml(a.text)}${alreadyOnPackliste ? ` <span class="on-packliste-badge" title="Bereits auf der Packliste von &quot;${escapeHtml(trip.titel)}&quot;"><i class="ti ti-checkbox"></i></span>` : ""}`;
      row.appendChild(nameCell);

      const selected = new Set(a.merkmale || []);
      defs.forEach((m) => {
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
        };
        cell.appendChild(cb);
        row.appendChild(cell);
      });

      const actionsCell = document.createElement("td");
      actionsCell.className = "matrix-actions-col";
      if (trip) {
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "icon-btn";
        addBtn.innerHTML = `<i class="ti ti-plus"></i>`;
        addBtn.title = `Zu Packliste von "${trip.titel}" hinzufügen`;
        addBtn.onclick = () => {
          trip.packliste.push({
            id: "i" + Date.now() + Math.random().toString(36).slice(2, 6),
            text: a.text,
            erledigt: false,
            kategorie: a.kategorie || getArtikelKategorien(a)[0] || "Allgemein",
            sort: trip.packliste.length,
            ...(a.merkmale && a.merkmale.length ? { nurWenn: a.merkmale } : {}),
          });
          saveChange();
          onChange();
        };
        actionsCell.appendChild(addBtn);
      }
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "icon-btn";
      editBtn.innerHTML = `<i class="ti ti-pencil"></i>`;
      editBtn.onclick = () => { editingArtikelId = a.id; onChange(); };
      actionsCell.appendChild(editBtn);
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "icon-btn danger";
      delBtn.innerHTML = `<i class="ti ti-trash"></i>`;
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
  return wrap;
}

function renderArtikelForm(katalog, onChange, prefill) {
  const isNew = editingArtikelId === "__neu__";
  const existing = isNew ? null : katalog.find((a) => a.id === editingArtikelId);
  const a = existing || { text: (prefill && prefill.text) || "", kategorie: "", kategorien: (prefill && prefill.kategorie) ? [prefill.kategorie] : [], merkmale: (prefill && prefill.merkmale) || [], bemerkung: "" };

  const form = document.createElement("form");
  form.className = "field-form";
  form.innerHTML = `
    <label>Artikel<input type="text" name="text" value="${escapeHtml(a.text)}" required /></label>
    <label>Kategorien (Mehrfachauswahl möglich)</label>
    <div class="chip-row" id="artikel-kategorien-chiprow"></div>
    <div class="field-row">
      <input type="text" id="artikel-neue-kategorie" placeholder="Neue Kategorie ..." style="flex:1" />
      <button type="button" id="artikel-kategorie-add" class="secondary"><i class="ti ti-plus"></i></button>
    </div>
    <label>Bemerkung (allgemein)<textarea name="bemerkung" rows="2" placeholder="z. B. Ersatzlinsen, Linsenmittel, Linsenbehälter">${escapeHtml(a.bemerkung || "")}</textarea></label>
    <label>Nur bei Merkmalen (optional)</label>
    <div id="artikel-merkmale-gruppen"></div>
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
    const values = {
      text: fd.get("text").trim(),
      kategorien,
      kategorie: kategorien[0] || "Allgemein",
      bemerkung: fd.get("bemerkung").trim(),
      merkmale: [...selectedMerkmale],
    };
    if (!values.text) return;
    if (isNew) {
      katalog.push({ id: "art" + Date.now() + Math.random().toString(36).slice(2, 6), ...values });
    } else {
      Object.assign(existing, values);
    }
    saveChange();
    editingArtikelId = null;
    onChange();
  });

  form.querySelector("#cancel-artikel").onclick = () => { editingArtikelId = null; onChange(); };
  const deleteBtn = form.querySelector("#delete-artikel");
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      if (!confirm(`"${existing.text}" wirklich löschen?`)) return;
      const data = getData();
      data.artikelDatenbank = data.artikelDatenbank.filter((x) => x.id !== existing.id);
      saveChange();
      editingArtikelId = null;
      onChange();
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
    <label>Bezeichnung<input type="text" name="label" value="${escapeHtml(m.label)}" required /></label>
    <label>Icon (Tabler-Icon-Name, z. B. "ti-sun")<input type="text" name="icon" value="${escapeHtml(m.icon)}" /></label>
    <label>Gruppe (Überbegriff)
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
  tpSection.className = "panel";
  const tpHeaderResult = collapsibleHeader("programm:tagesplan", `📅 Tagesplan (${tagesplanSorted.length})`, () => renderProgrammTab(el, trip));
  tpSection.appendChild(tpHeaderResult.header);
  const tpHint = document.createElement("p");
  tpHint.className = "hint-small";
  tpHint.textContent = "Konkrete Planung mit Datum - was steht wann an?";
  tpSection.appendChild(tpHint);
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
  ideenSection.className = "panel";
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
        ${trip.etappen.map((e) => `<option value="${escapeHtml(e.id)}" ${ideenEtappenFilter === e.id ? "selected" : ""}>${escapeHtml(e.titel)}</option>`).join("")}
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
  if (tpList) tagesplanSorted.forEach((p) => {
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
        ${p.reservation ? ` <i class="ti ti-alarm" title="Reservation nötig"></i>` : ""}
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
        <strong>${escapeHtml(idee.idee)}</strong>${idee.kategorie ? ` <span class="hint-small">(${escapeHtml(idee.kategorie)})</span>` : ""}
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
    toPlanBtn.onclick = () => {
      trip.tagesplan.push({
        id: "tp" + Date.now() + Math.random().toString(36).slice(2, 6),
        datum: "",
        vormittag: idee.idee,
        nachmittag: "",
        abend: "",
        ort: idee.ort || "",
        reservation: false,
        kosten: idee.kosten || "",
        bemerkung: idee.bemerkung || "",
        link: idee.link || idee.googleMaps || "",
      });
      trip.ideen = trip.ideen.filter((x) => x.id !== idee.id);
      saveChange();
      renderProgrammTab(el, trip);
    };
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
  const p = existing || { datum: "", vormittag: "", nachmittag: "", abend: "", ort: "", reservation: false, kosten: "", bemerkung: "", link: "" };

  const form = document.createElement("form");
  form.className = "field-form panel";
  form.innerHTML = `
    <label>Datum<input type="date" name="datum" value="${escapeHtml(p.datum)}" /></label>
    <label>Vormittag<input type="text" name="vormittag" value="${escapeHtml(p.vormittag)}" /></label>
    <label>Nachmittag<input type="text" name="nachmittag" value="${escapeHtml(p.nachmittag)}" /></label>
    <label>Abend<input type="text" name="abend" value="${escapeHtml(p.abend)}" /></label>
    <label>Ort<input type="text" name="ort" value="${escapeHtml(p.ort)}" /></label>
    <label style="display:flex;align-items:center;gap:6px;font-weight:normal">
      <input type="checkbox" name="reservation" ${p.reservation ? "checked" : ""} /> Reservation nötig?
    </label>
    <label>Kosten<input type="text" name="kosten" value="${escapeHtml(p.kosten)}" placeholder="ca. CHF ..." /></label>
    <label>Link<input type="url" name="link" value="${escapeHtml(p.link)}" placeholder="https://..." /></label>
    <label>Bemerkung<textarea name="bemerkung" rows="2">${escapeHtml(p.bemerkung)}</textarea></label>
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
    <label>Idee<input type="text" name="idee" value="${escapeHtml(idee.idee)}" required /></label>
    ${(trip.etappen && trip.etappen.length) ? `
    <div>
      <label style="display:block;margin-bottom:4px;font-weight:600">Etappe(n) - einer, mehreren oder allen Destinationen zuweisen</label>
      <div class="chip-row" id="idee-etappen-chiprow"></div>
    </div>` : ""}
    <label>Kategorie<input type="text" name="kategorie" value="${escapeHtml(idee.kategorie)}" placeholder="z. B. Ausflug, Restaurant, Baden ..." /></label>
    <label>Ort<input type="text" name="ort" value="${escapeHtml(idee.ort)}" /></label>
    <label>Google-Maps-Link<input type="url" name="googleMaps" value="${escapeHtml(idee.googleMaps)}" placeholder="https://maps.google.com/..." /></label>
    <label>Fahrzeit<input type="text" name="fahrzeit" value="${escapeHtml(idee.fahrzeit)}" placeholder="z. B. 25 Min." /></label>
    <label>Kosten ca.<input type="text" name="kosten" value="${escapeHtml(idee.kosten)}" /></label>
    <label>Link<input type="url" name="link" value="${escapeHtml(idee.link)}" placeholder="https://..." /></label>
    <label>Bemerkung<textarea name="bemerkung" rows="2">${escapeHtml(idee.bemerkung)}</textarea></label>
    <div class="form-actions">
      <button type="submit"><i class="ti ti-check"></i> Speichern</button>
      <button type="button" id="cancel-idee" class="secondary">Abbrechen</button>
      ${existing ? `<button type="button" id="delete-idee" class="danger"><i class="ti ti-trash"></i></button>` : ""}
    </div>
  `;

  if (trip.etappen && trip.etappen.length) {
    const chipRow = form.querySelector("#idee-etappen-chiprow");
    const renderChips = () => {
      chipRow.innerHTML = "";
      trip.etappen.forEach((e) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip" + (selectedEtappenIds.has(e.id) ? " active" : "");
        chip.textContent = e.titel;
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
// TAB: FINANZEN (Ausgaben pro Ferien)
// ===========================================================
let editingFinanzId = null;

function renderFinanzenTab(el, trip) {
  if (!trip) {
    el.innerHTML = `
      <p class="hint">Noch keine Ferien angelegt.</p>
    `;
    return;
  }
  trip.finanzen = trip.finanzen || [];

  const sorted = [...trip.finanzen].sort((a, b) => (a.datum || "").localeCompare(b.datum || ""));
  const totals = {};
  sorted.forEach((f) => {
    const w = f.waehrung || "CHF";
    totals[w] = (totals[w] || 0) + (Number(f.betrag) || 0);
  });

  el.innerHTML = `
    <section class="panel">
      <h2><i class="ti ti-cash"></i> Finanzen - ${escapeHtml(trip.titel)}</h2>
      ${Object.keys(totals).length ? `<p class="hint-small">Total: ${Object.entries(totals).map(([w, sum]) => `${sum.toFixed(2)} ${escapeHtml(w)}`).join(" · ")}</p>` : ""}
    </section>
  `;

  const finSection = document.createElement("section");
  finSection.className = "panel";
  const finHeaderResult = collapsibleHeader("finanzen:liste", `Ausgaben (${sorted.length})`, () => renderFinanzenTab(el, trip));
  finSection.appendChild(finHeaderResult.header);
  const listDiv = document.createElement("div");
  listDiv.id = "finanzen-list";
  if (!finHeaderResult.isCollapsed) finSection.appendChild(listDiv);
  const newFinBtn = document.createElement("button");
  newFinBtn.id = "new-finanz-button";
  newFinBtn.className = "secondary";
  newFinBtn.innerHTML = `<i class="ti ti-plus"></i> Neue Ausgabe`;
  finSection.appendChild(newFinBtn);
  el.appendChild(finSection);

  const formContainer = document.createElement("div");
  formContainer.id = "finanzen-form-container";
  el.appendChild(formContainer);

  const list = document.getElementById("finanzen-list");
  if (list && !sorted.length) {
    list.innerHTML = `<p class="hint-empty">Noch keine Ausgaben erfasst.</p>`;
  }
  if (list) sorted.forEach((f) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <span style="flex:1">
        ${f.datum ? `<span class="termin-badge">${formatDate(f.datum)}</span> ` : ""}<strong>${escapeHtml(f.beschreibung)}</strong> - ${Number(f.betrag || 0).toFixed(2)} ${escapeHtml(f.waehrung || "CHF")}
        ${f.bezahltVon || f.kategorie ? `<br /><span class="hint-small" style="margin:0">${[f.kategorie, f.bezahltVon].filter(Boolean).map(escapeHtml).join(" · ")}</span>` : ""}
      </span>
    `;
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "icon-btn";
    editBtn.innerHTML = `<i class="ti ti-pencil"></i>`;
    editBtn.onclick = () => { editingFinanzId = f.id; renderFinanzenTab(el, trip); };
    row.appendChild(editBtn);
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "icon-btn danger";
    delBtn.innerHTML = `<i class="ti ti-trash"></i>`;
    delBtn.onclick = () => {
      if (!confirm(`Eintrag "${f.beschreibung}" wirklich löschen?`)) return;
      trip.finanzen = trip.finanzen.filter((x) => x.id !== f.id);
      saveChange();
      renderFinanzenTab(el, trip);
    };
    row.appendChild(delBtn);
    list.appendChild(row);
  });

  newFinBtn.onclick = () => { editingFinanzId = "__neu__"; renderFinanzenTab(el, trip); };

  if (editingFinanzId) {
    formContainer.appendChild(renderFinanzForm(trip, () => renderFinanzenTab(el, trip)));
  }
}

function renderFinanzForm(trip, onChange) {
  const isNew = editingFinanzId === "__neu__";
  const existing = isNew ? null : trip.finanzen.find((f) => f.id === editingFinanzId);
  const f = existing || { datum: "", beschreibung: "", betrag: "", waehrung: "CHF", kategorie: "", bezahltVon: "", notizen: "" };

  const form = document.createElement("form");
  form.className = "field-form panel";
  form.innerHTML = `
    <label>Beschreibung<input type="text" name="beschreibung" value="${escapeHtml(f.beschreibung)}" required /></label>
    <div class="field-row">
      <label>Datum<input type="date" name="datum" value="${escapeHtml(f.datum)}" /></label>
      <label>Betrag<input type="number" step="0.01" name="betrag" value="${escapeHtml(String(f.betrag))}" /></label>
      <label>Währung<input type="text" name="waehrung" value="${escapeHtml(f.waehrung)}" style="max-width:70px" /></label>
    </div>
    <div class="field-row">
      <label>Kategorie<input type="text" name="kategorie" value="${escapeHtml(f.kategorie)}" placeholder="z. B. Verpflegung" /></label>
      <label>Bezahlt von<input type="text" name="bezahltVon" value="${escapeHtml(f.bezahltVon)}" /></label>
    </div>
    <label>Notizen<textarea name="notizen" rows="2">${escapeHtml(f.notizen)}</textarea></label>
    <div class="form-actions">
      <button type="submit"><i class="ti ti-check"></i> Speichern</button>
      <button type="button" id="cancel-finanz" class="secondary">Abbrechen</button>
      ${existing ? `<button type="button" id="delete-finanz" class="danger"><i class="ti ti-trash"></i></button>` : ""}
    </div>
  `;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const values = Object.fromEntries(fd.entries());
    values.waehrung = (values.waehrung || "").trim() || "CHF";
    if (isNew) {
      trip.finanzen.push({ id: "fin" + Date.now() + Math.random().toString(36).slice(2, 6), ...values });
    } else {
      Object.assign(existing, values);
    }
    saveChange();
    editingFinanzId = null;
    onChange();
  });

  form.querySelector("#cancel-finanz").onclick = () => { editingFinanzId = null; onChange(); };
  const deleteBtn = form.querySelector("#delete-finanz");
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      if (!confirm(`Eintrag "${existing.beschreibung}" wirklich löschen?`)) return;
      trip.finanzen = trip.finanzen.filter((x) => x.id !== existing.id);
      saveChange();
      editingFinanzId = null;
      onChange();
    };
  }

  return form;
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
