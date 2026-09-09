/*
 * store.js — Zugriffsschicht für Einträge des Digitalen Klassenbuchs.
 *
 * Die eigentliche Speicherung/Synchronisation übernimmt firebaseSync.js
 * (Cloud Firestore, geräteübergreifend: iPhone/iPad/MacBook). Store.js
 * hält einen aktuellen In-Memory-Cache (befüllt über den Echtzeit-Listener
 * von firebaseSync) sowie rein lokale, geräteinterne Daten (Einstellungen,
 * zuletzt benutzte Klassen/Fächer für Autovervollständigung).
 */

const Store = (() => {
  const KEY_SETTINGS = 'klassenbuch.settings.v1';
  const KEY_HISTORY = 'klassenbuch.history.v1';

  const DEFAULT_SETTINGS = {
    warnHausaufgabenCount: 3,
    warnHausaufgabenTageFenster: 30,
    warnMaterialCount: 3,
    warnMaterialTageFenster: 30,
    warnVerhaltenCount: 3,
    warnVerhaltenTageFenster: 14,
    warnNegativCount: 5,
    warnNegativTageFenster: 30,
    warnPositivCount: 3,
    warnPositivTageFenster: 30,
    warnNotentrendDiff: 1.0,
  };

  let cache = [];
  let rosterCache = {}; // { klasse: { nr: name } }
  const cacheListeners = [];
  const rosterListeners = [];

  function onChange(cb) { cacheListeners.push(cb); }
  function notify() { cacheListeners.forEach((cb) => cb(cache)); }
  function onRosterChange(cb) { rosterListeners.push(cb); }
  function notifyRoster() { rosterListeners.forEach((cb) => cb(rosterCache)); }

  // Wird von app.js aufgerufen, sobald firebaseSync neue Daten liefert.
  function setCache(entries) {
    cache = entries.slice().sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0));
    rememberHistory(cache);
    notify();
  }

  function loadEntries() {
    return cache;
  }

  // Wird von app.js aufgerufen, sobald firebaseSync neue Klassenlisten liefert.
  function setRosterCache(roster) {
    rosterCache = roster || {};
    notifyRoster();
  }

  function loadRoster() {
    return rosterCache;
  }

  // Name für Klasse+Nummer, oder null, falls nicht hinterlegt.
  function getName(klasse, schueler) {
    if (!klasse || !schueler) return null;
    const klassenListe = rosterCache[klasse];
    return (klassenListe && klassenListe[schueler]) || null;
  }

  async function saveRosterClass(klasse, namenMap) {
    await FirebaseSync.saveRosterClass(klasse, namenMap);
  }

  async function addEntries(newEntries) {
    await FirebaseSync.addEntries(newEntries);
    // Der Firestore-Listener aktualisiert den Cache automatisch (setCache).
  }

  async function updateEntry(id, patch) {
    await FirebaseSync.updateEntry(id, patch);
  }

  async function deleteEntry(id) {
    await FirebaseSync.deleteEntry(id);
  }

  async function upsertEntries(rows) {
    await FirebaseSync.upsertEntries(rows);
  }

  function rememberHistory(entries) {
    const hist = loadHistory();
    entries.forEach((e) => {
      if (e.klasse) hist.klassen.add(e.klasse);
      if (e.fach) hist.faecher.add(e.fach);
    });
    localStorage.setItem(
      KEY_HISTORY,
      JSON.stringify({ klassen: Array.from(hist.klassen), faecher: Array.from(hist.faecher) })
    );
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(KEY_HISTORY);
      const parsed = raw ? JSON.parse(raw) : { klassen: [], faecher: [] };
      return { klassen: new Set(parsed.klassen || []), faecher: new Set(parsed.faecher || []) };
    } catch (e) {
      return { klassen: new Set(), faecher: new Set() };
    }
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(KEY_SETTINGS);
      return Object.assign({}, DEFAULT_SETTINGS, raw ? JSON.parse(raw) : {});
    } catch (e) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings));
  }

  return {
    setCache,
    onChange,
    loadEntries,
    addEntries,
    updateEntry,
    deleteEntry,
    upsertEntries,
    loadHistory,
    loadSettings,
    saveSettings,
    setRosterCache,
    onRosterChange,
    loadRoster,
    getName,
    saveRosterClass,
    DEFAULT_SETTINGS,
  };
})();
