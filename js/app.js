// ===========================================================
// HAUPT-APP-LOGIK
// ===========================================================

let currentTripId = null;
let currentTab = "start";
// Pro Liste merken wir uns, ob erledigte Punkte gerade eingeblendet sind
// (nur im Speicher, nicht gespeichert - beim Neuladen wieder eingeklappt).
const showDone = { packliste: false, todo: false };
// Wonach gruppiert wird: "kategorie" oder (nur beim To-Do) "termin"
const groupBy = { packliste: "kategorie", todo: "kategorie" };
// Sortierung innerhalb einer Gruppe: "manuell" (per Drag&Drop/Pfeile) oder "az"
const sortMode = { packliste: "manuell", todo: "manuell" };
// Welche Kategorien gerade eingeklappt sind (Set von "liste:kategorie")
const collapsed = new Set();
// Welche Unterkunft gerade im Bearbeiten-Formular offen ist:
// null = kein Formular offen, "__neu__" = neue Unterkunft, sonst deren id
let editingUnterkunftId = null;
// true = das Formular zum Bearbeiten von Titel/Zeitraum der aktuellen Ferien ist offen
let editingTrip = false;
// Welches Item gerade eine offene Erinnerungs-Bearbeitung hat (Item-ID oder null)
let editingReminderId = null;
// Wetter-Cache pro Ferien-ID: { ort, current, daily, fetchedAt }
const weatherCache = {};
// Drag&Drop-Status beim Verschieben von Listeneinträgen
let dragState = null;

// ===========================================================
// NAVIGATION (Kacheln) - vom Nutzer sortierbar, siehe Einstellungen
// ===========================================================
// "start"/"ferien" und "einstellungen" sind fest (immer zuerst bzw. immer
// zuletzt), alle anderen Kacheln kann der Nutzer in "Einstellungen" per
// Pfeiltasten umsortieren (data.tabOrder).
const TAB_DEFS = {
  start: { icon: "ti-home", label: "Start" },
  ferien: { icon: "ti-beach", label: "Ferien" },
  packliste: { icon: "ti-checkbox", label: "Packliste" },
  todo: { icon: "ti-list-check", label: "To-Do" },
  artikel: { icon: "ti-list-details", label: "Artikel-DB" },
  programm: { icon: "ti-calendar-event", label: "Programm" },
  finanzen: { icon: "ti-cash", label: "Finanzen" },
  merkmale: { icon: "ti-tags", label: "Merkmale" },
};
const FIXED_FIRST_TABS = ["start", "ferien"];
const FIXED_LAST_TAB = "einstellungen";
const DEFAULT_SORTABLE_TABS = ["packliste", "todo", "artikel", "programm", "finanzen", "merkmale"];

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
  if (sidebar) sidebar.innerHTML = `<p class="sidebar-title">Verwalten</p>${buttonsHtml}`;
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

  const data = getData();
  if (!currentTripId && data.ferien.length > 0) {
    currentTripId = data.ferien[0].id;
  }

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
    currentTripId = select.value;
    render();
  };
}

function itemVisible(item, trip) {
  if (!item.nurWenn || item.nurWenn.length === 0) return true;
  return item.nurWenn.some((k) => trip.merkmale && trip.merkmale[k]);
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

  const packOpen = trip.packliste.filter((i) => itemVisible(i, trip) && !i.erledigt).length;
  const packTotal = trip.packliste.filter((i) => itemVisible(i, trip)).length;
  const todoOpen = trip.todo.filter((i) => itemVisible(i, trip) && !i.erledigt).length;
  const todoTotal = trip.todo.filter((i) => itemVisible(i, trip)).length;
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
    .filter((i) => itemVisible(i, trip) && !i.erledigt && i.termin !== undefined && i.termin !== null && i.termin !== "")
    .sort((a, b) => Number(a.termin) - Number(b.termin))
    .slice(0, 3);

  const aktiveMerkmale = getMerkmaleDefs().filter((m) => trip.merkmale && trip.merkmale[m.key]);

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

    ${naechsteToDos.length ? `
    <section class="panel">
      <h2>Als Nächstes fällig</h2>
      <ul class="item-list">
        ${naechsteToDos.map((i) => `<li class="item-row"><span class="termin-badge">${formatTermin(i.termin)}</span><span>${escapeHtml(i.text)}</span></li>`).join("")}
      </ul>
    </section>` : ""}

    <section class="panel" id="weather-section">
      <h2><i class="ti ti-cloud"></i> Wetter</h2>
      <div id="weather-panel"><p class="hint-small">Lade Wettervorhersage...</p></div>
    </section>

    <section class="panel">
      <h2>Aktive Merkmale</h2>
      ${aktiveMerkmale.length ? `<div class="chip-row">${aktiveMerkmale.map((m) => `<span class="chip active"><i class="ti ${m.icon}"></i>${m.label}</span>`).join("")}</div>` : `<p class="hint-small">Keine Merkmale aktiv - im Tab "Ferien" einstellbar.</p>`}
    </section>
  `;

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
// TAB: FERIEN (Reise wählen/anlegen + Merkmale einstellen)
// ===========================================================

function renderFerienTab(el, trip) {
  const data = getData();

  el.innerHTML = `
    <section class="panel">
      <h2>Meine Ferien</h2>
      <ul class="trip-list" id="trip-list"></ul>
      <button id="new-trip-button" class="secondary"><i class="ti ti-plus"></i> Neue Ferien</button>
    </section>

    ${trip ? `
    <section class="panel">
      <div class="panel-header-row">
        <h2>${escapeHtml(trip.titel)}</h2>
        <button id="edit-trip-button" class="link-button"><i class="ti ti-pencil"></i> Bearbeiten</button>
      </div>
      <p class="hint-small">${trip.von || trip.bis ? `${trip.von ? formatDate(trip.von) : "?"} – ${trip.bis ? formatDate(trip.bis) : "?"}` : "Noch kein Zeitraum hinterlegt"}</p>
      <div id="trip-edit-form-container"></div>
    </section>

    <section class="panel">
      <h2>Merkmale</h2>
      <p class="hint-small">Bestimmen, welche Artikel/To-Dos automatisch angezeigt werden.</p>
      <div class="chip-row" id="merkmale-chips"></div>
    </section>

    <section class="panel">
      <h2>Unterkünfte</h2>
      <p class="hint-small">Eine Reise kann mehrere Unterkünfte haben (z. B. bei mehreren Stopps).</p>
      <div class="card-grid" id="unterkunft-cards"></div>
      <div id="unterkunft-form-container"></div>
    </section>` : ""}
  `;

  const list = document.getElementById("trip-list");
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
      currentTripId = f.id;
      render();
    };
    list.appendChild(li);
  });

  document.getElementById("new-trip-button").onclick = createNewTrip;

  if (trip) {
    document.getElementById("edit-trip-button").onclick = () => {
      editingTrip = !editingTrip;
      renderFerienTab(el, trip);
    };
    const formContainer = document.getElementById("trip-edit-form-container");
    if (editingTrip) {
      formContainer.appendChild(renderTripEditForm(trip, () => renderFerienTab(el, trip)));
    }

    const chipRow = document.getElementById("merkmale-chips");
    getMerkmaleDefs().forEach((m) => {
      const active = !!(trip.merkmale && trip.merkmale[m.key]);
      const chip = document.createElement("button");
      chip.className = "chip" + (active ? " active" : "");
      chip.innerHTML = `<i class="ti ${m.icon}"></i>${m.label}`;
      chip.onclick = () => {
        trip.merkmale = trip.merkmale || {};
        trip.merkmale[m.key] = !trip.merkmale[m.key];
        saveChange();
        renderFerienTab(el, trip);
      };
      chipRow.appendChild(chip);
    });

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
    currentTripId = data.ferien.length ? data.ferien[0].id : null;
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
    card.innerHTML = `
      <p class="u-name"><i class="ti ti-home"></i>${escapeHtml(u.name || "Ohne Namen")}</p>
      ${zeitraum ? `<p class="u-dates">${escapeHtml(zeitraum)}</p>` : ""}
      ${u.adresse ? `<p class="u-adresse">${escapeHtml(u.adresse)}</p>` : ""}
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
  }
}

function renderUnterkunftForm(trip, onChange) {
  const isNew = editingUnterkunftId === "__neu__";
  const existing = isNew ? null : trip.unterkuenfte.find((u) => u.id === editingUnterkunftId);
  const u = existing || { name: "", adresse: "", von: "", bis: "", buchungsnummer: "", kontakt: "", link: "", notizen: "" };

  const form = document.createElement("form");
  form.className = "field-form panel";
  form.innerHTML = `
    <label>Name<input type="text" name="name" value="${escapeHtml(u.name)}" placeholder="z. B. Chalet Alpenblick" required /></label>
    <div class="field-row">
      <label>Von<input type="date" name="von" value="${escapeHtml(u.von)}" /></label>
      <label>Bis<input type="date" name="bis" value="${escapeHtml(u.bis)}" /></label>
    </div>
    <label>Adresse<input type="text" name="adresse" value="${escapeHtml(u.adresse)}" /></label>
    <div class="field-row">
      <label>Buchungsnr.<input type="text" name="buchungsnummer" value="${escapeHtml(u.buchungsnummer)}" /></label>
      <label>Kontakt/Telefon<input type="text" name="kontakt" value="${escapeHtml(u.kontakt)}" /></label>
    </div>
    <label>Link zur Buchung<input type="text" name="link" value="${escapeHtml(u.link)}" placeholder="https://..." /></label>
    <label>Notizen (z. B. Check-in-Infos)<textarea name="notizen" rows="2">${escapeHtml(u.notizen)}</textarea></label>
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
  const todo = DEFAULT_TODO_VORLAGE.map((t, i) => ({
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
    programm: [],
    tagesplan: [],
    ideen: [],
    programmMigriert: true,
    finanzen: [],
  });  
    saveChange();
  currentTripId = id;
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
 *  aus den Standardwerten kopiert), damit sie bearbeitbar wird. */
function ensureMerkmaleDefs() {
  const data = getData();
  if (!data.merkmaleDefs || !data.merkmaleDefs.length) {
    data.merkmaleDefs = MERKMALE_DEFS.map((m) => ({ ...m }));
  }
  return data.merkmaleDefs;
}

/** Stellt sicher, dass der zentrale Artikel-Katalog existiert - beim allerersten
 *  Öffnen wird er aus dem im Excel-Master gepflegten Standard-Katalog befüllt
 *  (DEFAULT_ARTIKEL_DATENBANK aus config.js), danach ist er frei bearbeitbar. */
function ensureArtikelDatenbank() {
  const data = getData();
  if (!data.artikelDatenbank || !data.artikelDatenbank.length) {
    data.artikelDatenbank = DEFAULT_ARTIKEL_DATENBANK.map((a, i) => ({
      id: "art-default-" + i,
      kategorie: a.kategorie,
      text: a.text,
      merkmale: [...(a.merkmale || [])],
    }));
  }
  return data.artikelDatenbank;
}

// ===========================================================
// TAB: PACKLISTE / TO-DO (kategorisierte Liste mit Filtern)
// ===========================================================

function renderListTab(el, trip, key, icon, placeholder) { seedListFromKatalogIfEmpty(trip, key);
  const items = trip[key];
  const relevant = items.filter((i) => itemVisible(i, trip));
  const isTodo = key === "todo";
  const mode = groupBy[key];

  const groups = groupItems(relevant, mode, sortMode[key]);

  el.innerHTML = `
    <div class="list-toolbar">
      ${isTodo ? `
      <button id="toggle-group" class="link-button">
        <i class="ti ti-arrows-sort"></i>
        Gruppiert nach ${mode === "termin" ? "Zeitpunkt" : "Kategorie"}
      </button>` : ""}
      <button id="toggle-sort" class="link-button">
        <i class="ti ${sortMode[key] === "az" ? "ti-sort-ascending-letters" : "ti-grip-vertical"}"></i>
        ${sortMode[key] === "az" ? "A-Z" : "Manuell"}
      </button>
      <button id="toggle-done" class="link-button">
        <i class="ti ${showDone[key] ? "ti-eye-off" : "ti-eye"}"></i>
        Erledigte ${showDone[key] ? "ausblenden" : "anzeigen"}
      </button>
    </div>
    <div id="cat-container"></div>
    <form id="add-form" class="add-form">
      <input type="text" placeholder="${placeholder}" required />
      ${mode === "kategorie" ? `<select id="cat-select"></select>` : ""}
      ${isTodo ? `<input type="number" id="termin-input" placeholder="Tage vor Abreise" title="Tage vor Abreise (z. B. -5, 0 = Abreisetag), optional" style="max-width:110px;" />` : ""}
      <button type="submit"><i class="ti ti-plus"></i></button>
    </form>
  `;
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

  document.getElementById("toggle-done").onclick = () => {
    showDone[key] = !showDone[key];
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
    };

    if (isTodo) {
      const terminInput = document.getElementById("termin-input");
      if (terminInput && terminInput.value !== "") {
        newItem.termin = Number(terminInput.value);
      }
    }

    items.push(newItem);
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
  const open = groupItemsList.filter((i) => !i.erledigt);
  const done = groupItemsList.filter((i) => i.erledigt);
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
    open.forEach((item, idx) => {
      list.appendChild(itemRow(trip, listKey, item, showTermin, manualSort, open, idx, onChange));
      if (editingReminderId === item.id) list.appendChild(reminderForm(item, onChange));
    });
    if (showDone[listKey]) {
      done.forEach((item) => {
        list.appendChild(itemRow(trip, listKey, item, showTermin, false, done, 0, onChange));
        if (editingReminderId === item.id) list.appendChild(reminderForm(item, onChange));
      });
    }
    wrap.appendChild(list);
  }

  return wrap;
}

function reassignSort(list) {
  list.forEach((item, idx) => { item.sort = idx; });
}

function itemRow(trip, listKey, item, showTermin, manualSort, siblingList, idx, onChange) {
  const row = document.createElement("div");
  row.className = "item-row" + (item.erledigt ? " done" : "");

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
    <section class="panel">
      <h2><i class="ti ti-arrows-sort"></i> Kacheln anordnen</h2>
      <p class="hint-small">Lege fest, in welcher Reihenfolge Artikel-Datenbank, Programm, Finanzen usw. in der Navigation erscheinen.</p>
      <div id="tab-order-list" class="tab-order-list"></div>
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
  const orderListEl = document.getElementById("tab-order-list");
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

function renderArtikelTab(el) {
  const katalog = ensureArtikelDatenbank();
  const trip = getCurrentTrip();

  el.innerHTML = `
    <section class="panel">
      <h2><i class="ti ti-list-details"></i> Artikel-Datenbank</h2>
      <p class="hint-small">Zentraler Katalog aller Artikel, unabhängig von einzelnen Ferien. Von hier lässt sich ein Artikel direkt in die Packliste der aktuell gewählten Ferien übernehmen.</p>
      <div id="artikel-list"></div>
      <button id="new-artikel-button" class="secondary"><i class="ti ti-plus"></i> Neuer Artikel</button>
    </section>
    <div id="artikel-form-container"></div>
  `;

  const list = document.getElementById("artikel-list");
  if (!katalog.length) {
    list.innerHTML = `<p class="hint-empty">Noch keine Artikel im Katalog.</p>`;
  } else {
    const sorted = [...katalog].sort((a, b) => (a.kategorie || "").localeCompare(b.kategorie || "") || a.text.localeCompare(b.text, "de"));
    sorted.forEach((a) => {
      const merkmaleLabels = (a.merkmale || []).map((k) => (getMerkmaleDefs().find((m) => m.key === k) || {}).label).filter(Boolean);
      const row = document.createElement("div");
      row.className = "item-row";
      row.innerHTML = `
        <i class="ti ${categoryIcon(a.kategorie)} category-icon"></i>
        <span style="flex:1">${escapeHtml(a.text)}<br /><span class="hint-small" style="margin:0">${escapeHtml(a.kategorie || "Allgemein")}${merkmaleLabels.length ? " · " + merkmaleLabels.map(escapeHtml).join(", ") : ""}</span></span>
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
            kategorie: a.kategorie || "Allgemein",
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
  }

  document.getElementById("new-artikel-button").onclick = () => { editingArtikelId = "__neu__"; renderArtikelTab(el); };

  const formContainer = document.getElementById("artikel-form-container");
  if (editingArtikelId) {
    formContainer.appendChild(renderArtikelForm(katalog, () => renderArtikelTab(el)));
  }
}

function renderArtikelForm(katalog, onChange) {
  const isNew = editingArtikelId === "__neu__";
  const existing = isNew ? null : katalog.find((a) => a.id === editingArtikelId);
  const a = existing || { text: "", kategorie: "", merkmale: [] };

  const form = document.createElement("form");
  form.className = "field-form panel";
  form.innerHTML = `
    <label>Artikel<input type="text" name="text" value="${escapeHtml(a.text)}" required /></label>
    <label>Kategorie<input type="text" name="kategorie" value="${escapeHtml(a.kategorie)}" placeholder="z. B. Kleider" /></label>
    <label>Nur bei Merkmalen (optional)</label>
    <div class="chip-row" id="artikel-merkmale-chips"></div>
    <div class="form-actions">
      <button type="submit"><i class="ti ti-check"></i> Speichern</button>
      <button type="button" id="cancel-artikel" class="secondary">Abbrechen</button>
      ${existing ? `<button type="button" id="delete-artikel" class="danger"><i class="ti ti-trash"></i></button>` : ""}
    </div>
  `;

  const selectedMerkmale = new Set(a.merkmale || []);
  const chipRow = form.querySelector("#artikel-merkmale-chips");
  getMerkmaleDefs().forEach((m) => {
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

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const values = {
      text: fd.get("text").trim(),
      kategorie: fd.get("kategorie").trim() || "Allgemein",
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
      <div id="merkmal-list"></div>
      <button id="new-merkmal-button" class="secondary"><i class="ti ti-plus"></i> Neues Merkmal</button>
    </section>
    <div id="merkmal-form-container"></div>
  `;

  const list = document.getElementById("merkmal-list");
  defs.forEach((m) => {
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
    list.appendChild(row);
  });

  document.getElementById("new-merkmal-button").onclick = () => { editingMerkmalKey = "__neu__"; renderMerkmaleTab(el); };

  const formContainer = document.getElementById("merkmal-form-container");
  if (editingMerkmalKey) {
    formContainer.appendChild(renderMerkmalForm(defs, () => renderMerkmaleTab(el)));
  }
}

function renderMerkmalForm(defs, onChange) {
  const isNew = editingMerkmalKey === "__neu__";
  const existing = isNew ? null : defs.find((m) => m.key === editingMerkmalKey);
  const m = existing || { label: "", icon: "ti-tag" };

  const form = document.createElement("form");
  form.className = "field-form panel";
  form.innerHTML = `
    <label>Bezeichnung<input type="text" name="label" value="${escapeHtml(m.label)}" required /></label>
    <label>Icon (Tabler-Icon-Name, z. B. "ti-sun")<input type="text" name="icon" value="${escapeHtml(m.icon)}" /></label>
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
    if (!label) return;
    if (isNew) {
      const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      defs.push({ key, label, icon });
    } else {
      existing.label = label;
      existing.icon = icon;
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

  const tagesplanSorted = [...trip.tagesplan].sort((a, b) => (a.datum || "").localeCompare(b.datum || ""));
  const ideenSorted = [...trip.ideen].sort((a, b) => (a.kategorie || "").localeCompare(b.kategorie || "") || (a.idee || "").localeCompare(b.idee || ""));

  el.innerHTML = `
    <section class="panel">
      <h2><i class="ti ti-calendar-event"></i> Programm - ${escapeHtml(trip.titel)}</h2>
      <h3 style="margin-top:0">📅 Tagesplan</h3>
      <p class="hint-small">Konkrete Planung mit Datum - was steht wann an?</p>
      <div id="tagesplan-list"></div>
      <button id="new-tagesplan-button" class="secondary"><i class="ti ti-plus"></i> Neuer Tagesplan-Eintrag</button>
    </section>
    <div id="tagesplan-form-container"></div>
    <section class="panel">
      <h3 style="margin-top:0">💡 Ideensammlung</h3>
      <p class="hint-small">Noch nicht eingeplante Ideen - Ausflüge, Restaurants, Aktivitäten ...</p>
      <div id="ideen-list"></div>
      <button id="new-idee-button" class="secondary"><i class="ti ti-plus"></i> Neue Idee</button>
    </section>
    <div id="idee-form-container"></div>
  `;

  const tpList = document.getElementById("tagesplan-list");
  if (!tagesplanSorted.length) {
    tpList.innerHTML = `<p class="hint-empty">Noch kein Tagesplan erfasst.</p>`;
  }
  tagesplanSorted.forEach((p) => {
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

  document.getElementById("new-tagesplan-button").onclick = () => { editingTagesplanId = "__neu__"; renderProgrammTab(el, trip); };
  const tpFormContainer = document.getElementById("tagesplan-form-container");
  if (editingTagesplanId) {
    tpFormContainer.appendChild(renderTagesplanForm(trip, () => renderProgrammTab(el, trip)));
  }

  const ideenList = document.getElementById("ideen-list");
  if (!ideenSorted.length) {
    ideenList.innerHTML = `<p class="hint-empty">Noch keine Ideen erfasst.</p>`;
  }
  ideenSorted.forEach((idee) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <span style="flex:1">
        <strong>${escapeHtml(idee.idee)}</strong>${idee.kategorie ? ` <span class="hint-small">(${escapeHtml(idee.kategorie)})</span>` : ""}
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

  document.getElementById("new-idee-button").onclick = () => { editingIdeeId = "__neu__"; renderProgrammTab(el, trip); };
  const ideeFormContainer = document.getElementById("idee-form-container");
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
  const idee = existing || { idee: "", kategorie: "", ort: "", googleMaps: "", fahrzeit: "", bemerkung: "", link: "", kosten: "" };

  const form = document.createElement("form");
  form.className = "field-form panel";
  form.innerHTML = `
    <label>Idee<input type="text" name="idee" value="${escapeHtml(idee.idee)}" required /></label>
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

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const values = Object.fromEntries(fd.entries());
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
      <div id="finanzen-list"></div>
      <button id="new-finanz-button" class="secondary"><i class="ti ti-plus"></i> Neue Ausgabe</button>
    </section>
    <div id="finanzen-form-container"></div>
  `;

  const list = document.getElementById("finanzen-list");
  if (!sorted.length) {
    list.innerHTML = `<p class="hint-empty">Noch keine Ausgaben erfasst.</p>`;
  }
  sorted.forEach((f) => {
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

  document.getElementById("new-finanz-button").onclick = () => { editingFinanzId = "__neu__"; renderFinanzenTab(el, trip); };

  const formContainer = document.getElementById("finanzen-form-container");
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
    trip.todo = DEFAULT_TODO_VORLAGE.map((t, i) => ({
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
