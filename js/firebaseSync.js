/*
 * firebaseSync.js — Geräteübergreifende Synchronisation (iPhone/iPad/MacBook).
 *
 * Nutzt Firebase Authentication (E-Mail/Passwort) + Cloud Firestore.
 * Jede Lehrkraft betreibt ihr EIGENES, kostenloses Firebase-Projekt
 * (Spark-Plan) — es werden keine Zugangsdaten im Code/Repo gespeichert.
 * Firestore bringt eingebauten Offline-Cache mit: Einträge lassen sich
 * ohne Internet erfassen und werden automatisch synchronisiert, sobald
 * wieder eine Verbindung besteht.
 *
 * Datenmodell: users/{uid}/entries/{entryId}
 * Sicherheitsregeln (in der Firebase-Konsole -> Firestore -> Regeln)
 * müssen sicherstellen, dass jede:r Nutzer:in nur eigene Daten lesen/
 * schreiben kann (siehe README.md für die exakten Regeln).
 */

const FirebaseSync = (() => {
  const KEY_CONFIG = 'klassenbuch.firebaseConfig.v1';

  let app = null;
  let auth = null;
  let db = null;
  let unsubscribeSnapshot = null;
  let currentUser = null;

  const listeners = {
    entries: [],   // callback(entries[])
    auth: [],      // callback(user|null)
  };

  function onEntriesChange(cb) { listeners.entries.push(cb); }
  function onAuthChange(cb) { listeners.auth.push(cb); }
  function emitEntries(entries) { listeners.entries.forEach((cb) => cb(entries)); }
  function emitAuth(user) { listeners.auth.forEach((cb) => cb(user)); }

  function loadConfig() {
    try {
      const raw = localStorage.getItem(KEY_CONFIG);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveConfig(cfg) {
    localStorage.setItem(KEY_CONFIG, JSON.stringify(cfg));
  }

  function clearConfig() {
    localStorage.removeItem(KEY_CONFIG);
  }

  function isConfigured() {
    return !!loadConfig();
  }

  function isReady() {
    return !!(app && auth && db);
  }

  // Initialisiert Firebase mit der gespeicherten (oder übergebenen) Konfiguration.
  function init(cfgParam) {
    const cfg = cfgParam || loadConfig();
    if (!cfg || !cfg.apiKey || !cfg.projectId) {
      throw new Error('Keine gültige Firebase-Konfiguration vorhanden.');
    }
    if (cfgParam) saveConfig(cfgParam);

    if (typeof firebase === 'undefined') {
      throw new Error('Firebase-SDK konnte nicht geladen werden (Internetverbindung prüfen).');
    }

    if (!app) {
      app = firebase.initializeApp(cfg);
      auth = firebase.auth();
      db = firebase.firestore();
      // Offline-Persistenz: Einträge bleiben lokal verfügbar (IndexedDB)
      // und werden bei Wiederverbindung automatisch synchronisiert.
      db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
        console.warn('Offline-Persistenz nicht verfügbar:', err.code);
      });

      auth.onAuthStateChanged((user) => {
        currentUser = user;
        emitAuth(user);
        if (user) {
          subscribeEntries();
        } else if (unsubscribeSnapshot) {
          unsubscribeSnapshot();
          unsubscribeSnapshot = null;
        }
      });
    }
    return true;
  }

  function entriesCollection() {
    if (!currentUser) throw new Error('Nicht angemeldet.');
    return db.collection('users').doc(currentUser.uid).collection('entries');
  }

  function subscribeEntries() {
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    unsubscribeSnapshot = entriesCollection().onSnapshot(
      (snap) => {
        const entries = [];
        snap.forEach((doc) => entries.push(Object.assign({ id: doc.id }, doc.data())));
        emitEntries(entries);
      },
      (err) => console.error('Fehler beim Synchronisieren:', err)
    );
  }

  async function register(email, password) {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    return cred.user;
  }

  async function login(email, password) {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    return cred.user;
  }

  async function resetPassword(email) {
    await auth.sendPasswordResetEmail(email);
  }

  async function logout() {
    await auth.signOut();
  }

  function getCurrentUser() {
    return currentUser;
  }

  async function addEntries(newEntries) {
    const col = entriesCollection();
    const batch = db.batch();
    newEntries.forEach((e) => {
      const ref = col.doc(); // Firestore vergibt die ID
      const { id, ...data } = e;
      batch.set(ref, Object.assign({}, data, { erstelltAm: data.erstelltAm || new Date().toISOString() }));
    });
    await batch.commit();
  }

  async function updateEntry(id, patch) {
    await entriesCollection().doc(id).update(patch);
  }

  async function deleteEntry(id) {
    await entriesCollection().doc(id).delete();
  }

  // Upsert für Excel-Import: vorhandene ID -> überschreiben, sonst neu.
  async function upsertEntries(rows) {
    const col = entriesCollection();
    // Firestore-Batches sind auf 500 Operationen begrenzt -> in Blöcken schreiben.
    for (let i = 0; i < rows.length; i += 400) {
      const chunk = rows.slice(i, i + 400);
      const batch = db.batch();
      chunk.forEach((row) => {
        const { id, ...data } = row;
        const ref = id ? col.doc(String(id)) : col.doc();
        batch.set(ref, data, { merge: true });
      });
      await batch.commit();
    }
  }

  return {
    loadConfig,
    saveConfig,
    clearConfig,
    isConfigured,
    isReady,
    init,
    register,
    login,
    resetPassword,
    logout,
    getCurrentUser,
    onAuthChange,
    onEntriesChange,
    addEntries,
    updateEntry,
    deleteEntry,
    upsertEntries,
  };
})();
