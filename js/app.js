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
// Welches Item gerade eine offene Erinnerungs-Bearbeitung hat (Item-ID oder null)
let editingReminderId = null;
// Wetter-Cache pro Ferien-ID: { ort, current, daily, fetchedAt }
const weatherCache = {};
// Drag&Drop-Status beim Verschieben von Listeneinträgen
let dragState = null;

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

  wireTabBar();
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

function wireTabBar() {
  // ".nav-tab" existiert zweimal im HTML: einmal in der unteren Tab-Leiste
  // (Handy) und einmal in der Seitenleiste (PC, siehe style.css). Beide
  // Sätze von Buttons werden hier gemeinsam bedient und synchron gehalten.
  document.querySelectorAll(".nav-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentTab = btn.dataset.tab;
      document.querySelectorAll(".nav-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === currentTab));
      render();
    });
  });
}

function getCurrentTrip() {
  const data = getData();
  return data.ferien.find((f) => f.id === currentTripId) || null;
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

  const el = document.getElementById("tab-content");

  if (currentTab === "start") return renderStartTab(el, trip);
  if (currentTab === "ferien") return renderFerienTab(el, trip);
  if (currentTab === "mehr") return renderMehrTab(el);

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

  const aktiveMerkmale = MERKMALE_DEFS.filter((m) => trip.merkmale && trip.merkmale[m.key]);

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
      <h2>Merkmale von "${escapeHtml(trip.titel)}"</h2>
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
    const chipRow = document.getElementById("merkmale-chips");
    MERKMALE_DEFS.forEach((m) => {
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
  data.ferien.push({
    id,
    titel,
    von: "",
    bis: "",
    merkmale: {},
    packliste: [],
    todo: [],
    unterkuenfte: [],
  });
  saveChange();
  currentTripId = id;
  render();
}
// ===========================================================
// TAB: PACKLISTE / TO-DO (kategorisierte Liste mit Filtern)
// ===========================================================

function renderListTab(el, trip, key, icon, placeholder) {
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
// TAB: MEHR
// ===========================================================

function renderMehrTab(el) {
  const theme = getTheme();
  const notifSupported = typeof Notification !== "undefined";
  const notifPermission = notifSupported ? Notification.permission : "nicht unterstützt";
  const notifLabel = { granted: "aktiviert", denied: "blockiert (in Browser-Einstellungen ändern)", default: "noch nicht aktiviert" }[notifPermission] || notifPermission;

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
  document.getElementById("theme-light").onclick = () => { setTheme("light"); renderMehrTab(el); };
  document.getElementById("theme-dark").onclick = () => { setTheme("dark"); renderMehrTab(el); };
  const enableBtn = document.getElementById("enable-notif");
  if (enableBtn) {
    enableBtn.onclick = async () => {
      await Notification.requestPermission();
      renderMehrTab(el);
      checkReminders();
    };
  }
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
