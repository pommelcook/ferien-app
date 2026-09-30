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
    "Dokumente/10  Privat/Ferien + Ausflüge/Ferien - Lager - Weekends/0 Allgemeine Unterlagen/Ferien-App",

  // Berechtigungen (Scopes), die die App beim Login anfragt
  scopes: ["User.Read", "Files.ReadWrite"],
};

// ===========================================================
// VERSION (wird im Tab "Mehr" angezeigt)
// ===========================================================
const APP_VERSION = "0.10.0";
const APP_BUILD_DATE = "2026-09-30";

// ===========================================================
// MERKMALE (1:1 nach dem Register "⚙️ Merkmale" im Excel-Master,
// gruppiert nach den dortigen Überbegriffen)
// ===========================================================
// Jede Ferien hat ein "merkmale"-Objekt mit diesen Schlüsseln (true/false).
// Ein Artikel/To-Do kann optional "nurWenn: [Schlüssel, ...]" tragen -
// dann wird er nur angezeigt, wenn MINDESTENS eines der dort genannten
// Merkmale für die aktuelle Ferien aktiv ist (wie die dynamische
// Packliste im Excel-Master). Kein "nurWenn" -> immer sichtbar.
// Das Feld "gruppe" dient nur der übersichtlichen Anzeige (Überbegriffe
// wie im Master, z. B. "🚗 Transport") und hat keine funktionale Wirkung.
const MERKMALE_DEFS = [
  // 📅 Dauer
  { key: "weekend", label: "Weekend", icon: "ti-calendar-event", gruppe: "📅 Dauer" },
  { key: "woche", label: "Woche", icon: "ti-calendar", gruppe: "📅 Dauer" },
  { key: "lager", label: "Lager", icon: "ti-tent" , gruppe: "📅 Dauer" },
  // 🌍 Land
  { key: "ausland", label: "Ausland", icon: "ti-world", gruppe: "🌍 Land" },
  // 🥾 Ausflug
  { key: "tageswanderung", label: "Tageswanderung", icon: "ti-walk", gruppe: "🥾 Ausflug" },
  { key: "mehrtageswanderung", label: "Mehrtageswanderung", icon: "ti-backpack", gruppe: "🥾 Ausflug" },
  { key: "picknickmitkindern", label: "Picknick mit Kindern", icon: "ti-basket", gruppe: "🥾 Ausflug" },
  { key: "picknickohnekinder", label: "Picknick ohne Kinder", icon: "ti-basket", gruppe: "🥾 Ausflug" },
  // 🏠 Unterkunft
  { key: "fewohotel", label: "FeWo/Hotel", icon: "ti-home", gruppe: "🏠 Unterkunft" },
  { key: "hotel", label: "Hotel", icon: "ti-building", gruppe: "🏠 Unterkunft" },
  { key: "hausboot", label: "Hausboot", icon: "ti-anchor", gruppe: "🏠 Unterkunft" },
  { key: "zelten", label: "Zelten", icon: "ti-tent", gruppe: "🏠 Unterkunft" },
  { key: "ohneuebernachtung", label: "ohne Übernachtung", icon: "ti-moon-off", gruppe: "🏠 Unterkunft" },
  // 🚗 Transport
  { key: "auto", label: "Auto", icon: "ti-car", gruppe: "🚗 Transport" },
  { key: "vwbus", label: "VW-Bus", icon: "ti-bus", gruppe: "🚗 Transport" },
  { key: "flugzeug", label: "Flugzeug", icon: "ti-plane", gruppe: "🚗 Transport" },
  { key: "zugoev", label: "Zug / ÖV", icon: "ti-train", gruppe: "🚗 Transport" },
  // ☀️ Jahreszeit
  { key: "sommer", label: "Sommer", icon: "ti-sun", gruppe: "☀️ Jahreszeit" },
  { key: "winter", label: "Winter", icon: "ti-snowflake", gruppe: "☀️ Jahreszeit" },
  { key: "wintersport", label: "Wintersport", icon: "ti-ski-jumping", gruppe: "☀️ Jahreszeit" },
  // 👪 Mitreisende
  { key: "mithund", label: "Mit Hund", icon: "ti-paw", gruppe: "👪 Mitreisende" },
  { key: "mitkindern", label: "Mit Kindern", icon: "ti-users", gruppe: "👪 Mitreisende" },
  { key: "mitbabykleinkind", label: "Baby/Kleinkind", icon: "ti-baby-carriage", gruppe: "👪 Mitreisende" },
  // 📍 Ort/Aktivität
  { key: "strand", label: "Strand", icon: "ti-beach", gruppe: "📍 Ort/Aktivität" },
  { key: "wandern", label: "Wandern", icon: "ti-mountain", gruppe: "📍 Ort/Aktivität" },
  { key: "stadt", label: "Stadt", icon: "ti-building-skyscraper", gruppe: "📍 Ort/Aktivität" },
];

// ===========================================================
// STANDARD-ARTIKEL-KATALOG (aus dem Excel-Master "Artikel-Datenbank"
// übernommen). Wird beim ersten Öffnen der Artikel-Datenbank in die
// Daten kopiert (siehe ensureArtikelDatenbank() in app.js) und dient
// als Vorlage, mit der neue Ferien automatisch eine vollständige,
// nach Merkmalen gefilterte Packliste bekommen (wie im Excel-Master).
// ===========================================================
const DEFAULT_ARTIKEL_DATENBANK = [
  { kategorie: "Gesundheit", text: "Apotheke klein / gross", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Gesundheit", text: "Blasenpflaster", merkmale: ["wandern"] },
  { kategorie: "Gesundheit", text: "Fusscreme", merkmale: ["wandern"] },
  { kategorie: "Gesundheit", text: "Linsen & Co.", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Gesundheit", text: "Medi light (im Necessaire)", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Gesundheit", text: "Moskitonetz", merkmale: ["zelten","ausland"] },
  { kategorie: "Gesundheit", text: "Necessaire / Toiletten-Utensilien", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Gesundheit", text: "On-The-Road-Beutel", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Gesundheit", text: "Schere (klein, im Necessaire)", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Gesundheit", text: "Sonnencreme, Antibrumm", merkmale: ["sommer","winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Hund", text: "Pass/Impfausweis Hund", merkmale: ["ausland","haustier"] },
  { kategorie: "Hund", text: "Hundebox", merkmale: ["ausland","haustier"] },
  { kategorie: "Hund", text: "Hundedecken", merkmale: ["ausland","haustier"] },
  { kategorie: "Hund", text: "Hundeleinen", merkmale: ["ausland","haustier"] },
  { kategorie: "Hund", text: "Hundenapf", merkmale: ["ausland","haustier"] },
  { kategorie: "Hund", text: "Kack-Box", merkmale: ["ausland","haustier"] },
  { kategorie: "Hund", text: "Pfeife", merkmale: ["ausland","haustier"] },
  { kategorie: "Kinder", text: "Baby-Reisebett / Klappbettchen", merkmale: ["baby"] },
  { kategorie: "Kinder", text: "Bettschutzgitter", merkmale: ["baby"] },
  { kategorie: "Kinder", text: "Ergo-Carrier / Tragetuch", merkmale: ["baby"] },
  { kategorie: "Kinder", text: "Kinder-Notfallzettel (Name & Tel-Nr.)", merkmale: ["ausland","kinder","baby"] },
  { kategorie: "Kinder", text: "Kinder-Rucksack", merkmale: ["wandern","kinder"] },
  { kategorie: "Kinder", text: "Kinder-Tragerucksack", merkmale: ["kinder","baby"] },
  { kategorie: "Kinder", text: "Kinderbett / Babybett / Reisebett", merkmale: ["kinder","baby"] },
  { kategorie: "Kinder", text: "Kindergeschirr, Becher, Flaschen", merkmale: ["kinder","baby"] },
  { kategorie: "Kinder", text: "Kindersitz Auto", merkmale: ["kinder"] },
  { kategorie: "Kinder", text: "Kindersitz Auto: Erhöhung", merkmale: ["kinder"] },
  { kategorie: "Kinder", text: "Kindersitz Essen", merkmale: ["kinder"] },
  { kategorie: "Kinder", text: "Kinderwagen inkl. REGENHÜLLE", merkmale: ["kinder"] },
  { kategorie: "Kinder", text: "Lätzli", merkmale: ["kinder","baby"] },
  { kategorie: "Kinder", text: "Musikgeräte (Hörbert, Tigerbox, tiptoi & Co.)", merkmale: ["kinder","baby"] },
  { kategorie: "Kinder", text: "Schoppen & Milchpulver", merkmale: ["kinder","baby"] },
  { kategorie: "Kinder", text: "Schwimmflügeli & Co.", merkmale: ["kinder"] },
  { kategorie: "Kinder", text: "Taschen-/Stirnlampe Kinder", merkmale: ["zelten","kinder"] },
  { kategorie: "Kinder", text: "Windel- und Nuggi-Vorrat", merkmale: ["baby"] },
  { kategorie: "Kinder", text: "Windeln, Wickeltuch, Wickeltasche, Feuchttücher", merkmale: ["kinder","baby"] },
  { kategorie: "Kinder", text: "Zahnpasta / Zahnbürste", merkmale: ["kinder","baby"] },
  { kategorie: "Kinder", text: "Zewi-Decke", merkmale: ["kinder","baby"] },
  { kategorie: "Kleider", text: "Fleecejacke", merkmale: ["winter","wandern"] },
  { kategorie: "Kleider", text: "Handschuhe für Schnee", merkmale: ["winter","auto"] },
  { kategorie: "Kleider", text: "Imprägnierspray", merkmale: ["winter","wandern","auto"] },
  { kategorie: "Kleider", text: "Jacken (Regenjacke, Windstopper, Gilet…)", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Kleider", text: "Kappe", merkmale: [] },
  { kategorie: "Kleider", text: "Kleider", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Kleider", text: "Regenhose", merkmale: ["zelten","wandern"] },
  { kategorie: "Kleider", text: "Schal, Handschuhe, Halsschlauch", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Kleider", text: "Thermokleider", merkmale: ["winter","wandern","auto"] },
  { kategorie: "Kleider", text: "Winterjacke", merkmale: ["winter","auto"] },
  { kategorie: "Kulinarisches & Co.", text: "Abfallsack", merkmale: [] },
  { kategorie: "Kulinarisches & Co.", text: "Abtrocknungs-/Handtüechli", merkmale: [] },
  { kategorie: "Kulinarisches & Co.", text: "Abwaschmaterial", merkmale: ["zelten"] },
  { kategorie: "Kulinarisches & Co.", text: "Alu-/Klarsichtfolie", merkmale: [] },
  { kategorie: "Kulinarisches & Co.", text: "Backpapier", merkmale: [] },
  { kategorie: "Kulinarisches & Co.", text: "Brätelstöcke", merkmale: ["zelten","wandern"] },
  { kategorie: "Kulinarisches & Co.", text: "Espressokanne", merkmale: [] },
  { kategorie: "Kulinarisches & Co.", text: "Gasbrenner", merkmale: ["zelten","wandern"] },
  { kategorie: "Kulinarisches & Co.", text: "Geschirr + Becher", merkmale: ["zelten","wandern"] },
  { kategorie: "Kulinarisches & Co.", text: "Grill (Brändi, gross)", merkmale: ["zelten","wandern"] },
  { kategorie: "Kulinarisches & Co.", text: "Grillkohle", merkmale: ["zelten"] },
  { kategorie: "Kulinarisches & Co.", text: "Haushaltspapier", merkmale: [] },
  { kategorie: "Kulinarisches & Co.", text: "Kocher + Brennstoff", merkmale: ["zelten"] },
  { kategorie: "Kulinarisches & Co.", text: "Kühlbox", merkmale: ["zelten","auto"] },
  { kategorie: "Kulinarisches & Co.", text: "Lappen", merkmale: ["zelten"] },
  { kategorie: "Kulinarisches & Co.", text: "Lunchsäckli", merkmale: [] },
  { kategorie: "Kulinarisches & Co.", text: "Pfännchen (Bus)", merkmale: [] },
  { kategorie: "Kulinarisches & Co.", text: "Picknick-Decke", merkmale: ["zelten","wasser","wandern","auto"] },
  { kategorie: "Kulinarisches & Co.", text: "Rüstzeug", merkmale: ["zelten"] },
  { kategorie: "Kulinarisches & Co.", text: "Tupperware", merkmale: [] },
  { kategorie: "Kulinarisches & Co.", text: "Wäschesäcke", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Kulinarisches & Co.", text: "Zündhölzer/Feuerzeug", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Lebensmittel", text: "Gewürze", merkmale: [] },
  { kategorie: "Lebensmittel", text: "Kaffee (Kapseln, Pulver, Bohnen)", merkmale: [] },
  { kategorie: "Lebensmittel", text: "Proviantbeutel", merkmale: ["zelten","wandern"] },
  { kategorie: "Lebensmittel", text: "Reiseproviant", merkmale: [] },
  { kategorie: "Lebensmittel", text: "Snacks / Energiespender", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Lebensmittel", text: "Varia: …", merkmale: [] },
  { kategorie: "Lebensmittel", text: "Öl & Essig", merkmale: [] },
  { kategorie: "Nacht", text: "Isoliermatte", merkmale: ["zelten"] },
  { kategorie: "Nacht", text: "Kissen", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Nacht", text: "Leintuch", merkmale: [] },
  { kategorie: "Nacht", text: "Molton, Decken + Kissen", merkmale: [] },
  { kategorie: "Nacht", text: "Mätteli", merkmale: ["zelten"] },
  { kategorie: "Nacht", text: "Schlafsack", merkmale: ["zelten"] },
  { kategorie: "Nacht", text: "Zelt", merkmale: ["zelten"] },
  { kategorie: "Praktisches", text: "Feuchttücher fürs Auto", merkmale: ["auto","kinder"] },
  { kategorie: "Praktisches", text: "Grüne Versicherungskarte", merkmale: ["ausland","auto"] },
  { kategorie: "Praktisches", text: "Internationaler Führerschein", merkmale: ["ausland","auto"] },
  { kategorie: "Praktisches", text: "Kartenmaterial", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Praktisches", text: "Krankenkassen-Karte", merkmale: [] },
  { kategorie: "Praktisches", text: "Kreditkarte", merkmale: [] },
  { kategorie: "Praktisches", text: "Navi: Update + Adressen", merkmale: ["auto"] },
  { kategorie: "Praktisches", text: "Passkopien", merkmale: ["ausland"] },
  { kategorie: "Praktisches", text: "Persönliche Adressliste", merkmale: [] },
  { kategorie: "Praktisches", text: "Pumpe", merkmale: ["auto"] },
  { kategorie: "Praktisches", text: "Red Bull", merkmale: ["auto"] },
  { kategorie: "Praktisches", text: "Reiseführer", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Praktisches", text: "Reisestecker", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Praktisches", text: "Reiseversicherung-Unterlagen", merkmale: ["ausland"] },
  { kategorie: "Praktisches", text: "Strassenkarte", merkmale: ["auto"] },
  { kategorie: "Praktisches", text: "Streusalz / Schneeketten", merkmale: ["auto"] },
  { kategorie: "Praktisches", text: "Tablet", merkmale: [] },
  { kategorie: "Praktisches", text: "Tisch + Stühle", merkmale: [] },
  { kategorie: "Praktisches", text: "Verlängerungskabel / Steckleiste", merkmale: ["auto"] },
  { kategorie: "Praktisches", text: "Vignette / Maut-Kleber", merkmale: ["ausland","auto"] },
  { kategorie: "Programm & Co.", text: "Airboards", merkmale: ["winter"] },
  { kategorie: "Programm & Co.", text: "Badehose/Badekleid & Tüechli", merkmale: ["sommer","winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Programm & Co.", text: "Boot, Luftmatratze", merkmale: ["wasser","auto"] },
  { kategorie: "Programm & Co.", text: "Buch", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Programm & Co.", text: "Gamaschen", merkmale: ["winter","wandern"] },
  { kategorie: "Programm & Co.", text: "Instrument und Unterlagen", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Programm & Co.", text: "Outdoor-Spiele", merkmale: ["wasser","auto"] },
  { kategorie: "Programm & Co.", text: "Reiselektüre / Bücher", merkmale: [] },
  { kategorie: "Programm & Co.", text: "Reisespiele / Kartenspiele", merkmale: [] },
  { kategorie: "Programm & Co.", text: "Schlitten", merkmale: ["winter"] },
  { kategorie: "Programm & Co.", text: "Schneeschaufel, Schneesägen", merkmale: ["winter"] },
  { kategorie: "Programm & Co.", text: "Schneeschuhe + Stöcke", merkmale: ["winter"] },
  { kategorie: "Programm & Co.", text: "Skates & Helm", merkmale: ["wasser","auto"] },
  { kategorie: "Programm & Co.", text: "Ski, Skistöcke & Skischuhe", merkmale: ["winter"] },
  { kategorie: "Programm & Co.", text: "Skihelm", merkmale: ["winter"] },
  { kategorie: "Programm & Co.", text: "Spiele & Bücher (inkl. Tiptoi)", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Programm & Co.", text: "Spielsachen Kinder", merkmale: [] },
  { kategorie: "Programm & Co.", text: "Sportsachen Indoor", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Programm & Co.", text: "Sportsachen Outdoor", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Programm & Co.", text: "Strandmatten", merkmale: ["wasser","auto"] },
  { kategorie: "Programm & Co.", text: "Strandzelt", merkmale: ["wasser","auto"] },
  { kategorie: "Programm & Co.", text: "Trottinett / Kickboard", merkmale: ["sommer","auto","kinder"] },
  { kategorie: "Programm & Co.", text: "Velo", merkmale: ["sommer"] },
  { kategorie: "Programm & Co.", text: "Velohelm Erwachsene", merkmale: ["sommer"] },
  { kategorie: "Programm & Co.", text: "Velohelm Kinder", merkmale: ["sommer","kinder"] },
  { kategorie: "Programm & Co.", text: "Wanderstöcke", merkmale: ["zelten","wandern","auto"] },
  { kategorie: "Programm & Co.", text: "Wasser-Luft-Zeug (Ring, etc.)", merkmale: ["wasser","auto"] },
  { kategorie: "Schuhe", text: "bequeme Schuhe / Freizeitschuhe", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Schuhe", text: "Finken", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Schuhe", text: "Flip Flops", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Schuhe", text: "Trekkingschuhe", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Schuhe", text: "Wanderschuhe", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Schuhe", text: "Winterstiefel", merkmale: ["winter"] },
  { kategorie: "Technik", text: "Abschleppseil", merkmale: ["auto"] },
  { kategorie: "Technik", text: "Eiskratzer", merkmale: ["winter","auto"] },
  { kategorie: "Technik", text: "Ersatzbatterien (Taschenlampe etc.)", merkmale: ["zelten"] },
  { kategorie: "Technik", text: "Frostschutzmittel", merkmale: ["winter","auto"] },
  { kategorie: "Technik", text: "Handy", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Technik", text: "Handy-Abo (Roaming)", merkmale: ["ausland"] },
  { kategorie: "Technik", text: "Kabel-Kopfhörer (Kinder / Tablet)", merkmale: ["flug","kinder"] },
  { kategorie: "Technik", text: "Kamera & Zubehör", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Technik", text: "Kopfhörer & Adapter-Stecker", merkmale: [] },
  { kategorie: "Technik", text: "Ladekabel (NB, USB-C, tiptoi, Polar, Handy, …)", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Technik", text: "Notebook", merkmale: ["auto"] },
  { kategorie: "Technik", text: "Radio", merkmale: ["auto"] },
  { kategorie: "Technik", text: "Skiträger / Dachbox", merkmale: ["auto"] },
  { kategorie: "Technik", text: "Sonnenschutz für Scheiben", merkmale: ["auto"] },
  { kategorie: "Technik", text: "Starthilfekabel", merkmale: ["auto"] },
  { kategorie: "Technik", text: "Verbandskasten fürs Auto", merkmale: ["auto"] },
  { kategorie: "Technik", text: "Warndreieck", merkmale: ["auto"] },
  { kategorie: "Technik", text: "Warnweste", merkmale: ["auto"] },
  { kategorie: "Wintersport", text: "Handwärmer", merkmale: [] },
  { kategorie: "Wintersport", text: "Mütze und Ohrwärmer", merkmale: [] },
  { kategorie: "Wintersport", text: "Rückenprotektor", merkmale: [] },
  { kategorie: "Wintersport", text: "Schlittschuhe", merkmale: [] },
  { kategorie: "Wintersport", text: "Ski-Handschuhe + Ersatzhandschuhe", merkmale: [] },
  { kategorie: "Wintersport", text: "Skibrille / Sonnenbrille", merkmale: ["sommer"] },
  { kategorie: "Wintersport", text: "Skihose", merkmale: [] },
  { kategorie: "Wintersport", text: "Skijacke", merkmale: [] },
  { kategorie: "Wintersport", text: "Skisocken", merkmale: [] },
  { kategorie: "Wintersport", text: "Thermo-Unterwäsche", merkmale: [] },
  { kategorie: "Zubehör", text: "2. Autoschlüssel", merkmale: ["auto"] },
  { kategorie: "Zubehör", text: "Campingtisch / Campingstühle", merkmale: ["zelten"] },
  { kategorie: "Zubehör", text: "Ferienportemonnaie", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Zubehör", text: "Fernglas", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Zubehör", text: "Feuer-Anzündmaterial", merkmale: ["zelten","wandern","auto"] },
  { kategorie: "Zubehör", text: "Fremdwährungen", merkmale: ["ausland"] },
  { kategorie: "Zubehör", text: "Frottewäsche", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Zubehör", text: "Gartenhandschuhe", merkmale: [] },
  { kategorie: "Zubehör", text: "Hängematte", merkmale: ["zelten","wasser","auto"] },
  { kategorie: "Zubehör", text: "Pass/ID Erwachsene", merkmale: ["ausland"] },
  { kategorie: "Zubehör", text: "Pass/ID Kinder", merkmale: ["ausland","kinder"] },
  { kategorie: "Zubehör", text: "Kanister", merkmale: ["auto"] },
  { kategorie: "Zubehör", text: "Kerzen", merkmale: ["zelten","wandern","auto"] },
  { kategorie: "Zubehör", text: "Klappsäge", merkmale: ["zelten"] },
  { kategorie: "Zubehör", text: "Kompass", merkmale: ["wandern"] },
  { kategorie: "Zubehör", text: "Ladegerät Autobatterie", merkmale: [] },
  { kategorie: "Zubehör", text: "Laterne", merkmale: ["zelten","auto"] },
  { kategorie: "Zubehör", text: "Nastücher / Feuchttücher", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Zubehör", text: "Oropax", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Zubehör", text: "Regenschirm", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Zubehör", text: "Reise-Waschmittel", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Zubehör", text: "Reisewecker", merkmale: [] },
  { kategorie: "Zubehör", text: "Rucksack (Eintages/Zweitages)", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Zubehör", text: "Schnur", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Zubehör", text: "Schreibzeug: Stifte & Papier", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Zubehör", text: "Sonnen- / Regenschutz", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Zubehör", text: "Sonnenschirm / Sonnen-Zelt", merkmale: [] },
  { kategorie: "Zubehör", text: "Taschen-/Stirnlampe Erwachsene", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Zubehör", text: "Taschen: Freitag, klein (aus Hamburg)", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Zubehör", text: "Taschenmesser", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Zubehör", text: "Trinkflasche", merkmale: ["winter","zelten","wasser","wandern","ausland","auto"] },
  { kategorie: "Zubehör", text: "Wanderkarte", merkmale: ["wandern"] },
  { kategorie: "Zubehör", text: "Yogamatte", merkmale: ["auto"] },
  { kategorie: "Zubehör", text: "Zeltflickzeug / Werkzeug", merkmale: ["zelten"] },
];

// ===========================================================
// STANDARD-TO-DO-VORLAGE (aus dem Excel-Master "To-Do-Liste" Register).
// Wird beim Anlegen einer neuen Ferien automatisch in die To-Do-Liste
// kopiert, "Nur Ausland"/"Nur Auto" wird zu nurWenn/Merkmalen.
// ===========================================================
const DEFAULT_TODO_VORLAGE = [
  { kategorie: "Einige Tage vor Abreise", text: "Zeitung umleiten / unterbrechen", merkmale: [] },
  { kategorie: "Einige Tage vor Abreise", text: "Auslandreisen anmelden: App \"Travel Admin\"  /  www.traveladmin.ch", merkmale: [] },
  { kategorie: "Einige Tage vor Abreise", text: "Post: umleiten / unterbrechen", merkmale: [] },
  { kategorie: "Einige Tage vor Abreise", text: "Blumen giessen / Briefkasten leeren klären", merkmale: [] },
  { kategorie: "Einige Tage vor Abreise", text: "Abwaschmaschine", merkmale: [] },
  { kategorie: "Einige Tage vor Abreise", text: "Navi-Update", merkmale: [] },
  { kategorie: "Einige Tage vor Abreise", text: "Wäsche waschen", merkmale: [] },
  { kategorie: "Einige Tage vor Abreise", text: "andere über Ferienabwesenheit informieren / Adresse hinterlegen", merkmale: [] },
  { kategorie: "Ein Tag vor Abreise", text: "Sauerteig schützen", merkmale: [] },
  { kategorie: "Ein Tag vor Abreise", text: "Wohnung putzen", merkmale: [] },
  { kategorie: "Abreisetag", text: "Heizung auf Ferienmodus", merkmale: [] },
  { kategorie: "Abreisetag", text: "Bodenheizung Bad auf Ferienmodus", merkmale: [] },
  { kategorie: "Abreisetag", text: "Strom / Steckleisten ausstellen: TV, Sonos, Büro", merkmale: [] },
  { kategorie: "Abreisetag", text: "Router ausschalten", merkmale: [] },
  { kategorie: "Abreisetag", text: "Kaffeemaschine reinigen / entleeren", merkmale: [] },
  { kategorie: "Abreisetag", text: "Kühlschrank leeren", merkmale: [] },
  { kategorie: "Abreisetag", text: "Abfall / Kompost", merkmale: [] },
  { kategorie: "Abreisetag", text: "Pflanzen giessen + bereitstellen", merkmale: [] },
  { kategorie: "Abreisetag", text: "Akku Roomba", merkmale: [] },
  { kategorie: "Abreisetag", text: "Bettwäsche wechseln", merkmale: [] },
  { kategorie: "Einige Wochen vor Abreise", text: "Pass / ID auf Gültigkeit prüfen", merkmale: ["ausland"] },
  { kategorie: "Einige Wochen vor Abreise", text: "Reiseversicherung abschliessen (auch medizinische Notfälle)", merkmale: ["ausland"] },
  { kategorie: "Einige Wochen vor Abreise", text: "Kreditkarte: Limite erhöhen / neue beantragen (v. a. für Mietwagen)", merkmale: ["ausland"] },
  { kategorie: "Einige Wochen vor Abreise", text: "Impfungen / Einreisebestimmungen prüfen (eda.admin.ch/reisehinweise)", merkmale: ["ausland"] },
  { kategorie: "Einige Wochen vor Abreise", text: "Online-Registrierung EDA Itineris eintragen", merkmale: ["ausland"] },
  { kategorie: "Einige Tage vor Abreise", text: "Passkopien erstellen, separat vom Original aufbewahren", merkmale: ["ausland"] },
  { kategorie: "Einige Tage vor Abreise", text: "Fahrzeug-Feriencheck machen (z. B. TCS)", merkmale: ["auto"] },
  { kategorie: "Einige Tage vor Abreise", text: "Internationalen Führerschein beantragen, falls nötig", merkmale: ["ausland","auto"] },
  { kategorie: "Einige Tage vor Abreise", text: "Vignette / Maut-Kleber besorgen", merkmale: ["ausland","auto"] },
  { kategorie: "Abreisetag", text: "Stauinfo / Verkehrslage vor Abfahrt prüfen", merkmale: ["auto"] },
  { kategorie: "Abreisetag", text: "Mottenfallen auslegen", merkmale: [] },
  { kategorie: "Abreisetag", text: "Wärmepumpe & Boiler auf Ferienmodus stellen", merkmale: [] },
  { kategorie: "Abreisetag", text: "Lichtautomation aktivieren", merkmale: [] },
  { kategorie: "Abreisetag", text: "Auto startklar machen (tanken, Ölstand, Reifendruck)", merkmale: ["auto"] },
  { kategorie: "Abreisetag", text: "Mäusefallen auslegen", merkmale: [] },
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
    // WICHTIG: "consumers" statt der eigenen Tenant-ID - benz.michael@bluewin.ch
    // ist ein privates Microsoft-Konto (kein Geschäfts-/Schul-Konto). Mit der
    // eigenen (leeren) "Default Directory"-Tenant-ID wurde zwar der Login
    // erfolgreich abgeschlossen, aber Microsoft Graph hat "/me/drive" dann
    // im Kontext dieses leeren Tenants gesucht - der hat keine SharePoint-
    // Lizenz (SPO), daher der Fehler "Tenant does not have a SPO license".
    // Mit "consumers" wird der Token im Kontext des echten privaten
    // Microsoft-Kontos ausgestellt, wo das eigentliche OneDrive liegt.
    authority: "https://login.microsoftonline.com/consumers",
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
