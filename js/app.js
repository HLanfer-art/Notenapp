/*
 * app.js — UI-Logik: verbindet Store, FirebaseSync, Parser, Stats,
 * Warnings, ExportImport und Speech zu einer bedienbaren Oberfläche.
 */

(() => {
  const $ = (sel) => document.querySelector(sel);
  const $all = (sel) => Array.from(document.querySelectorAll(sel));

  let currentTab = 'stunde';
  let authMode = 'login';
  let lastFilteredEntries = [];
  let lastSessionEntries = [];
  let lastSessionMeta = null;

  // ---------------------------------------------------------------- utils
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function todayISO() { return new Date().toISOString().slice(0, 10); }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
  }

  function showError(sel, msg) { const el = $(sel); el.textContent = msg; el.hidden = false; }
  function hideError(sel) { $(sel).hidden = true; }

  // Zeigt den hinterlegten Namen (falls vorhanden), sonst nur die Nummer.
  function displayName(klasse, schueler) {
    if (!schueler) return '–';
    const name = Store.getName(klasse, schueler);
    return name ? `${name} (Nr. ${schueler})` : `Nr. ${schueler}`;
  }

  function parseNoteLabel(label) {
    if (!label) return null;
    const m = label.trim().match(/^([1-6])\s*(\+|-)?$/);
    if (m) return Parser.gradeToNumber(parseInt(m[1], 10), m[2] || '');
    const f = parseFloat(label.replace(',', '.'));
    return isNaN(f) ? null : f;
  }

  function notenbereichGuess(kategorie) {
    if (['Referat', 'Klausur', 'Test'].includes(kategorie)) return kategorie;
    return 'Sonstige Mitarbeit';
  }

  // Auswahlliste der Klassenliste für eine Klasse, oder null, falls dort
  // noch keine Liste hinterlegt ist (dann greift der Aufrufer auf ein
  // Freitextfeld zurück, z. B. für Klassen mit reiner Nummern-Diktion).
  function studentSelectHtml(klasse, selectedId, cls) {
    const roster = Store.getRosterList(klasse);
    if (!roster.length) return null;
    const options = roster.map((s) => {
      const label = s.nachname ? `${s.vorname} ${s.nachname}` : s.vorname;
      return `<option value="${escapeHtml(s.id)}" ${s.id === selectedId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
    return `<select class="${cls || 'in-schueler'}"><option value="">– auswählen –</option>${options}</select>`;
  }

  function buildSelect(cls, options, selected, labels) {
    return `<select class="${cls}">` + options.map((o) =>
      `<option value="${escapeHtml(o)}" ${o === selected ? 'selected' : ''}>${escapeHtml(labels ? labels[o] : o)}</option>`
    ).join('') + `</select>`;
  }

  function showScreen(name) {
    ['setup', 'auth', 'main'].forEach((s) => { $('#screen-' + s).hidden = (s !== name); });
  }

  function switchTab(name) {
    currentTab = name;
    $all('#tabs .tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $all('.tabpanel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
    renderCurrentTab();
  }

  function renderCurrentTab() {
    const entries = Store.loadEntries();
    if (currentTab === 'eintraege') renderEintraege(entries);
    if (currentTab === 'auswertung') renderAuswertung(entries);
    if (currentTab === 'warnung') renderWarnungen(entries);
    if (currentTab === 'klassenlisten') renderRosterTable();
  }

  function updateSyncBadge() {
    const b = $('#sync-status');
    if (navigator.onLine) {
      b.className = 'badge badge-ok';
      b.title = 'Online – synchronisiert';
    } else {
      b.className = 'badge badge-off';
      b.title = 'Offline – wird bei Verbindung automatisch synchronisiert';
    }
  }

  // -------------------------------------------------------- Dropdowns/Filter
  function fillDatalist(sel, set) {
    $(sel).innerHTML = Array.from(set).sort((a, b) => a.localeCompare(b, 'de', { numeric: true }))
      .map((v) => `<option value="${escapeHtml(v)}">`).join('');
  }

  function fillSelectPreserve(sel, set, allLabel) {
    const el = $(sel);
    const current = el.value;
    el.innerHTML = `<option value="">${allLabel}</option>` +
      Array.from(set).sort((a, b) => a.localeCompare(b, 'de', { numeric: true }))
        .map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    if (Array.from(set).includes(current)) el.value = current;
  }

  function populateDropdowns(entries) {
    const hist = Store.loadHistory();
    const klassen = new Set(hist.klassen);
    const faecher = new Set(hist.faecher);
    entries.forEach((e) => { if (e.klasse) klassen.add(e.klasse); if (e.fach) faecher.add(e.fach); });
    fillDatalist('#klassen-list', klassen);
    fillDatalist('#faecher-list', faecher);
    fillSelectPreserve('#f-klasse', klassen, 'Alle Klassen');
    fillSelectPreserve('#f-fach', faecher, 'Alle Fächer');
    fillSelectPreserve('#a-klasse', klassen, 'Alle Klassen');
    fillSelectPreserve('#a-fach', faecher, 'Alle Fächer');
    fillSelectPreserve('#f-kategorie', new Set(Parser.KATEGORIEN), 'Alle Kategorien');
  }

  // ================================================== Setup (Firebase-Config)
  function parseFirebaseConfigSnippet(text) {
    const keys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];
    const cfg = {};
    keys.forEach((k) => {
      const re = new RegExp(k + '\\s*:\\s*["\']([^"\']+)["\']');
      const m = text.match(re);
      if (m) cfg[k] = m[1];
    });
    return cfg;
  }

  $('#btn-toggle-anleitung').addEventListener('click', () => {
    $('#setup-anleitung').hidden = !$('#setup-anleitung').hidden;
  });

  $('#btn-setup-weiter').addEventListener('click', () => {
    hideError('#setup-error');
    const cfg = parseFirebaseConfigSnippet($('#setup-snippet').value);
    if (!cfg.apiKey || !cfg.projectId || !cfg.appId) {
      showError('#setup-error', 'Bitte den vollständigen Code-Block einfügen (apiKey, projectId, appId müssen erkennbar sein).');
      return;
    }
    try {
      FirebaseSync.init(cfg);
      showScreen('auth');
    } catch (e) {
      showError('#setup-error', 'Verbindung fehlgeschlagen: ' + e.message);
    }
  });

  async function changeConnection() {
    if (!confirm('Verbindungseinstellung wirklich ändern? Du wirst dabei abgemeldet.')) return;
    try { await FirebaseSync.logout(); } catch (e) { /* ignore */ }
    FirebaseSync.clearConfig();
    location.reload();
  }
  $('#btn-back-setup').addEventListener('click', changeConnection);
  $('#btn-change-firebase').addEventListener('click', changeConnection);

  // ============================================================ Auth
  function setAuthMode(mode) {
    authMode = mode;
    $('#btn-mode-login').classList.toggle('active', mode === 'login');
    $('#btn-mode-register').classList.toggle('active', mode === 'register');
    $('#btn-auth-submit').textContent = mode === 'login' ? 'Anmelden' : 'Registrieren';
    $('#auth-password2').hidden = mode !== 'register';
    $('#auth-password2-label').hidden = mode !== 'register';
    hideError('#auth-error');
  }
  $('#btn-mode-login').addEventListener('click', () => setAuthMode('login'));
  $('#btn-mode-register').addEventListener('click', () => setAuthMode('register'));

  function translateAuthError(e) {
    const map = {
      'auth/email-already-in-use': 'Diese E-Mail ist bereits registriert.',
      'auth/invalid-email': 'Ungültige E-Mail-Adresse.',
      'auth/weak-password': 'Passwort ist zu schwach (mind. 6 Zeichen).',
      'auth/user-not-found': 'Kein Konto mit dieser E-Mail gefunden.',
      'auth/wrong-password': 'Falsches Passwort.',
      'auth/invalid-credential': 'E-Mail oder Passwort falsch.',
      'auth/too-many-requests': 'Zu viele Versuche. Bitte später erneut versuchen.',
    };
    return map[e.code] || e.message || 'Unbekannter Fehler.';
  }

  $('#btn-auth-submit').addEventListener('click', async () => {
    hideError('#auth-error');
    const email = $('#auth-email').value.trim();
    const pw = $('#auth-password').value;
    try {
      if (authMode === 'login') {
        await FirebaseSync.login(email, pw);
      } else {
        const pw2 = $('#auth-password2').value;
        if (pw !== pw2) { showError('#auth-error', 'Passwörter stimmen nicht überein.'); return; }
        if (pw.length < 6) { showError('#auth-error', 'Passwort muss mindestens 6 Zeichen haben.'); return; }
        await FirebaseSync.register(email, pw);
      }
    } catch (e) {
      showError('#auth-error', translateAuthError(e));
    }
  });

  $('#btn-forgot').addEventListener('click', async () => {
    const email = $('#auth-email').value.trim();
    if (!email) { showError('#auth-error', 'Bitte zuerst E-Mail eingeben.'); return; }
    try {
      await FirebaseSync.resetPassword(email);
      toast('E-Mail zum Zurücksetzen des Passworts wurde gesendet.');
    } catch (e) {
      showError('#auth-error', translateAuthError(e));
    }
  });

  $('#btn-logout').addEventListener('click', async () => { await FirebaseSync.logout(); });

  // ============================================================ Tabs
  $all('#tabs .tab').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  // ================================================== Tab: Neue Stunde
  $('#stunde-datum').value = todayISO();

  if (!Speech.isSupported()) {
    $('#btn-mic').disabled = true;
    $('#btn-mic').textContent = '🎙️ nicht verfügbar';
    $('#mic-unsupported').hidden = false;
  }

  let micBaseText = '';
  function updateMicUI(listening) {
    const btn = $('#btn-mic');
    btn.classList.toggle('listening', listening);
    btn.textContent = listening ? '⏹ Aufnahme stoppen' : '🎙️ Aufnahme starten';
  }

  $('#btn-mic').addEventListener('click', () => {
    if (!Speech.isSupported()) return;
    if (Speech.isListening()) {
      Speech.stop();
      return;
    }
    micBaseText = $('#transcript').value.trim();
    updateMicUI(true);
    $('#mic-status').textContent = 'Höre zu…';
    Speech.start({
      onInterim: (interim) => {
        $('#mic-status').textContent = interim ? 'Höre zu: ' + interim : 'Höre zu…';
      },
      onFinalChunk: (fullFinal) => {
        $('#transcript').value = (micBaseText ? micBaseText + ' ' : '') + fullFinal;
      },
      onEnd: () => {
        updateMicUI(false);
        $('#mic-status').textContent = 'Bereit';
      },
      onError: (err) => {
        updateMicUI(false);
        $('#mic-status').textContent = 'Bereit';
        if (err !== 'no-speech' && err !== 'aborted') toast('Spracherkennung: ' + err);
      },
    });
  });

  $('#btn-transcript-clear').addEventListener('click', () => {
    $('#transcript').value = '';
    $('#review-card').hidden = true;
    $('#summary-card').hidden = true;
  });

  function buildReviewRow(r) {
    const tr = document.createElement('tr');
    if (r.unsicher) tr.classList.add('unsicher');
    const klasse = $('#stunde-klasse').value.trim();
    const schuelerCell = studentSelectHtml(klasse, r.schueler)
      || `<input type="text" class="in-schueler" value="${escapeHtml(r.schueler || '')}" style="width:60px" placeholder="Nr.">`;
    tr.innerHTML = `
      <td><input type="checkbox" class="chk" checked></td>
      <td>${schuelerCell}${r.schuelerKandidaten ? '<br><small class="muted">mehrere gleichnamige Kinder – bitte auswählen</small>' : ''}</td>
      <td>${buildSelect('in-kategorie', Parser.KATEGORIEN, r.kategorie)}</td>
      <td><input type="text" class="in-beschreibung" value="${escapeHtml(r.beschreibung || '')}" style="min-width:200px"></td>
      <td><input type="text" class="in-note" value="${escapeHtml(r.noteLabel || '')}" style="width:55px" placeholder="–"></td>
      <td>${buildSelect('in-typ', ['positiv', 'negativ', 'neutral'], r.typ, { positiv: 'Positiv', negativ: 'Negativ', neutral: 'Neutral' })}</td>
      <td>${buildSelect('in-prioritaet', Parser.PRIORITAETEN, r.prioritaet)}</td>
      <td><button type="button" class="row-btn" title="Zeile entfernen">✕</button></td>
    `;
    tr.querySelector('.row-btn').addEventListener('click', () => tr.remove());
    return tr;
  }

  function renderReviewTable(rows) {
    const tbody = $('#review-tbody');
    tbody.innerHTML = '';
    rows.forEach((r) => tbody.appendChild(buildReviewRow(r)));
  }

  $('#btn-analysieren').addEventListener('click', () => {
    const text = $('#transcript').value;
    const klasse = $('#stunde-klasse').value.trim();
    const parsed = Parser.parseTranscript(text, { roster: Store.getRosterList(klasse) });
    if (!parsed.length) { toast('Kein auswertbarer Text gefunden.'); return; }
    renderReviewTable(parsed);
    $('#review-card').hidden = false;
    $('#summary-card').hidden = true;
    $('#review-card').scrollIntoView({ behavior: 'smooth' });
  });

  $('#btn-review-add').addEventListener('click', () => {
    $('#review-tbody').appendChild(buildReviewRow({
      schueler: '', kategorie: 'Sonstiges', beschreibung: '', noteLabel: '', typ: 'neutral', prioritaet: '⚪',
    }));
  });

  function sectionHtml(title, list) {
    if (!list.length) return `<h3>${title}</h3><p class="muted small">– keine –</p>`;
    return `<h3>${title}</h3><ul>` + list.map((e) =>
      `<li>${e.prioritaet} ${escapeHtml(displayName(e.klasse, e.schueler))}: ${escapeHtml(e.beschreibung)}</li>`
    ).join('') + `</ul>`;
  }

  function notenSectionHtml(list) {
    if (!list.length) return `<h3>Noten</h3><p class="muted small">– keine –</p>`;
    return `<h3>Noten</h3><ul>` + list.map((e) =>
      `<li>${escapeHtml(displayName(e.klasse, e.schueler))} — ${escapeHtml(e.notenbereich || e.kategorie)}: Note ${escapeHtml(e.noteLabel || String(e.note))}</li>`
    ).join('') + `</ul>`;
  }

  function renderSummary(entries, meta) {
    const positive = entries.filter((e) => e.typ === 'positiv');
    const negative = entries.filter((e) => e.typ === 'negativ');
    const noten = entries.filter((e) => e.note != null);
    const orga = entries.filter((e) => e.kategorie === 'Organisatorisches' || (e.typ === 'neutral' && e.note == null));

    let html = `<h3>Unterricht</h3><p>${escapeHtml(meta.datum)} · Klasse ${escapeHtml(meta.klasse)} · ${escapeHtml(meta.fach)}</p>`;
    html += sectionHtml('Positive Beobachtungen', positive);
    html += sectionHtml('Auffälligkeiten', negative);
    html += notenSectionHtml(noten);
    html += sectionHtml('Organisatorisches', orga);
    $('#summary-content').innerHTML = html;
    $('#summary-card').hidden = false;
    $('#summary-card').scrollIntoView({ behavior: 'smooth' });
    lastSessionEntries = entries;
    lastSessionMeta = meta;
  }

  $('#btn-review-save').addEventListener('click', async () => {
    const datum = $('#stunde-datum').value || todayISO();
    const klasse = $('#stunde-klasse').value.trim();
    const fach = $('#stunde-fach').value.trim();
    if (!klasse || !fach) { toast('Bitte Klasse und Fach angeben.'); return; }

    const rows = $all('#review-tbody tr');
    const toSave = [];
    rows.forEach((tr) => {
      if (!tr.querySelector('.chk').checked) return;
      const noteLabel = tr.querySelector('.in-note').value.trim();
      const kategorie = tr.querySelector('.in-kategorie').value;
      const note = noteLabel ? parseNoteLabel(noteLabel) : null;
      toSave.push({
        datum, klasse, fach,
        schueler: tr.querySelector('.in-schueler').value.trim(),
        kategorie,
        beschreibung: tr.querySelector('.in-beschreibung').value.trim(),
        note,
        noteLabel,
        notenbereich: note != null ? notenbereichGuess(kategorie) : null,
        typ: tr.querySelector('.in-typ').value,
        prioritaet: tr.querySelector('.in-prioritaet').value,
      });
    });
    if (!toSave.length) { toast('Keine Einträge ausgewählt.'); return; }

    try {
      await Store.addEntries(toSave);
      toast(toSave.length + ' Einträge gespeichert.');
      renderSummary(toSave, { datum, klasse, fach });
      $('#review-card').hidden = true;
    } catch (e) {
      toast('Fehler beim Speichern: ' + e.message);
    }
  });

  $('#btn-export-stunde').addEventListener('click', () => {
    if (!lastSessionEntries.length) return;
    const base = `Klassenbuch_${lastSessionMeta.klasse}_${lastSessionMeta.fach}`.replace(/\s+/g, '_');
    ExportImport.exportToExcel(lastSessionEntries, base);
  });

  // ================================================== Tab: Alle Einträge
  function getFilters() {
    return {
      suche: $('#f-suche').value.trim(),
      klasse: $('#f-klasse').value,
      fach: $('#f-fach').value,
      kategorie: $('#f-kategorie').value,
      typ: $('#f-typ').value,
      prioritaet: $('#f-prioritaet').value,
      von: $('#f-von').value,
      bis: $('#f-bis').value,
    };
  }

  function buildEintragRow(e) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${e.datum}</td><td>${escapeHtml(e.klasse)}</td><td>${escapeHtml(e.fach)}</td><td>${escapeHtml(displayName(e.klasse, e.schueler))}</td><td>${escapeHtml(e.kategorie)}</td><td>${escapeHtml(e.beschreibung)}</td><td>${escapeHtml(e.noteLabel || '')}</td><td>${e.typ}</td><td>${e.prioritaet}</td><td><button class="row-btn btn-edit" title="Bearbeiten">✎</button> <button class="row-btn btn-del" title="Löschen">✕</button></td>`;
    tr.querySelector('.btn-del').addEventListener('click', async () => {
      if (confirm('Eintrag wirklich löschen?')) {
        await Store.deleteEntry(e.id);
        toast('Eintrag gelöscht.');
      }
    });
    tr.querySelector('.btn-edit').addEventListener('click', () => openEditRow(tr, e));
    return tr;
  }

  function openEditRow(tr, e) {
    const schuelerCell = studentSelectHtml(e.klasse, e.schueler, 'ei-schueler')
      || `<input type="text" class="ei-schueler" value="${escapeHtml(e.schueler)}" style="width:50px">`;
    tr.innerHTML = `
      <td><input type="date" class="ei-datum" value="${e.datum}" style="width:120px"></td>
      <td><input type="text" class="ei-klasse" value="${escapeHtml(e.klasse)}" style="width:55px"></td>
      <td><input type="text" class="ei-fach" value="${escapeHtml(e.fach)}" style="width:80px"></td>
      <td>${schuelerCell}</td>
      <td>${buildSelect('ei-kategorie', Parser.KATEGORIEN, e.kategorie)}</td>
      <td><input type="text" class="ei-beschreibung" value="${escapeHtml(e.beschreibung)}" style="min-width:170px"></td>
      <td><input type="text" class="ei-note" value="${escapeHtml(e.noteLabel || '')}" style="width:50px"></td>
      <td>${buildSelect('ei-typ', ['positiv', 'negativ', 'neutral'], e.typ)}</td>
      <td>${buildSelect('ei-prioritaet', Parser.PRIORITAETEN, e.prioritaet)}</td>
      <td><button class="row-btn btn-save" title="Speichern">💾</button></td>
    `;
    tr.querySelector('.btn-save').addEventListener('click', async () => {
      const noteLabel = tr.querySelector('.ei-note').value.trim();
      const kategorie = tr.querySelector('.ei-kategorie').value;
      const note = noteLabel ? parseNoteLabel(noteLabel) : null;
      const patch = {
        datum: tr.querySelector('.ei-datum').value,
        klasse: tr.querySelector('.ei-klasse').value.trim(),
        fach: tr.querySelector('.ei-fach').value.trim(),
        schueler: tr.querySelector('.ei-schueler').value.trim(),
        kategorie,
        beschreibung: tr.querySelector('.ei-beschreibung').value.trim(),
        noteLabel,
        note,
        notenbereich: note != null ? notenbereichGuess(kategorie) : null,
        typ: tr.querySelector('.ei-typ').value,
        prioritaet: tr.querySelector('.ei-prioritaet').value,
      };
      try {
        await Store.updateEntry(e.id, patch);
        toast('Eintrag aktualisiert.');
      } catch (err) {
        toast('Fehler: ' + err.message);
      }
    });
  }

  function renderEintraege(entries) {
    const filtered = Stats.filterEntries(entries, getFilters());
    lastFilteredEntries = filtered;
    $('#eintraege-count').textContent = filtered.length + ' Einträge';
    const tbody = $('#eintraege-tbody');
    tbody.innerHTML = '';
    filtered.forEach((e) => tbody.appendChild(buildEintragRow(e)));
  }

  ['#f-suche', '#f-klasse', '#f-fach', '#f-kategorie', '#f-typ', '#f-prioritaet', '#f-von', '#f-bis'].forEach((sel) => {
    $(sel).addEventListener('input', () => renderEintraege(Store.loadEntries()));
    $(sel).addEventListener('change', () => renderEintraege(Store.loadEntries()));
  });

  $('#btn-filter-reset').addEventListener('click', () => {
    ['#f-suche', '#f-klasse', '#f-fach', '#f-kategorie', '#f-typ', '#f-prioritaet', '#f-von', '#f-bis'].forEach((sel) => { $(sel).value = ''; });
    renderEintraege(Store.loadEntries());
  });

  $('#btn-export-filtered').addEventListener('click', () => {
    ExportImport.exportToExcel(lastFilteredEntries, 'Klassenbuch_Auswahl');
  });

  // ================================================== Tab: Auswertungen
  function statCard(value, label) {
    return `<div class="stat-card"><div class="value">${value ?? '–'}</div><div class="label">${escapeHtml(label)}</div></div>`;
  }

  function renderProfileTable(profiles) {
    const tbody = $('#profile-tbody');
    tbody.innerHTML = '';
    profiles.forEach((p) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escapeHtml(p.klasse)}</td><td>${escapeHtml(displayName(p.klasse, p.schueler))}</td><td>${p.gesamt.avg ?? '–'}</td><td>${p.zeitraum.avg ?? '–'}</td><td>${p.gesamt.count}</td><td>${p.positiv}</td><td>${p.negativ}</td><td>${p.letzterEintrag || ''}</td><td><button class="row-btn btn-report" title="Bericht">📄</button></td>`;
      tr.querySelector('.btn-report').addEventListener('click', () => showReport(p));
      tbody.appendChild(tr);
    });
  }

  function showReport(p) {
    const name = Store.getName(p.klasse, p.schueler);
    $('#report-content').textContent = Stats.studentReport(p, name);
    $('#report-card').hidden = false;
    $('#report-card').scrollIntoView({ behavior: 'smooth' });
  }

  $('#btn-report-copy').addEventListener('click', () => {
    const text = $('#report-content').textContent;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => toast('In Zwischenablage kopiert.')).catch(() => toast('Kopieren nicht möglich.'));
    }
  });

  function renderAuswertung(entries) {
    const filters = { klasse: $('#a-klasse').value, fach: $('#a-fach').value, von: $('#a-von').value, bis: $('#a-bis').value };
    const scoped = Stats.filterEntries(entries, { klasse: filters.klasse, fach: filters.fach });
    const gesamt = Stats.average(scoped);
    const zeitraum = Stats.average(scoped.filter((e) => (!filters.von || e.datum >= filters.von) && (!filters.bis || e.datum <= filters.bis)));
    $('#stat-cards').innerHTML =
      statCard(gesamt.avg, 'Ø gesamt') +
      statCard(zeitraum.avg, 'Ø Zeitraum') +
      statCard(scoped.length, 'Einträge') +
      statCard(gesamt.count, 'Noten gesamt');
    const profiles = Stats.buildStudentProfiles(scoped, { von: filters.von, bis: filters.bis });
    renderProfileTable(profiles);
  }

  ['#a-klasse', '#a-fach', '#a-von', '#a-bis'].forEach((sel) => {
    $(sel).addEventListener('change', () => renderAuswertung(Store.loadEntries()));
  });

  // ================================================== Tab: Frühwarnsystem
  function prioClass(p) { return p === '🔴' ? 'prio-red' : p === '🟠' ? 'prio-orange' : p === '🟢' ? 'prio-green' : ''; }

  function jumpToStudent(klasse, schueler) {
    switchTab('eintraege');
    $('#f-klasse').value = klasse;
    $('#f-suche').value = schueler;
    renderEintraege(Store.loadEntries());
  }

  function renderWarnungen(entries) {
    const warnings = Warnings.computeWarnings(entries);
    const list = $('#warnungen-list');
    if (!warnings.length) {
      list.innerHTML = '<p class="muted">Keine Auffälligkeiten erkannt. 🎉</p>';
      return;
    }
    list.innerHTML = '';
    warnings.forEach((w) => {
      const div = document.createElement('div');
      div.className = 'warning-item ' + prioClass(w.prioritaet);
      div.innerHTML = `<span>${w.prioritaet}</span><span>${escapeHtml(w.text)}</span>`;
      div.addEventListener('click', () => jumpToStudent(w.klasse, w.schueler));
      list.appendChild(div);
    });
  }

  const SETTINGS_FIELDS = [
    ['warnHausaufgabenCount', 'Hausaufgaben: Anzahl'],
    ['warnHausaufgabenTageFenster', 'Hausaufgaben: Zeitfenster (Tage)'],
    ['warnMaterialCount', 'Material/Tablet: Anzahl'],
    ['warnMaterialTageFenster', 'Material/Tablet: Zeitfenster (Tage)'],
    ['warnVerhaltenCount', 'Verhalten: Anzahl'],
    ['warnVerhaltenTageFenster', 'Verhalten: Zeitfenster (Tage)'],
    ['warnNegativCount', 'Negative Einträge: Anzahl'],
    ['warnNegativTageFenster', 'Negative Einträge: Zeitfenster (Tage)'],
    ['warnPositivCount', 'Positive Einträge: Anzahl'],
    ['warnPositivTageFenster', 'Positive Einträge: Zeitfenster (Tage)'],
    ['warnNotentrendDiff', 'Notentrend: Mindestdifferenz'],
  ];

  function renderSettingsForm() {
    const s = Store.loadSettings();
    $('#warn-settings').innerHTML = SETTINGS_FIELDS.map(([key, label]) =>
      `<div><label>${escapeHtml(label)}</label><input type="number" step="0.1" data-key="${key}" value="${s[key]}"></div>`
    ).join('');
  }

  $('#btn-toggle-settings').addEventListener('click', () => {
    const el = $('#warn-settings');
    el.hidden = !el.hidden;
    $('#warn-settings-save-row').hidden = el.hidden;
    if (!el.hidden) renderSettingsForm();
  });

  $('#btn-settings-save').addEventListener('click', () => {
    const s = Store.loadSettings();
    $all('#warn-settings input').forEach((inp) => { s[inp.dataset.key] = parseFloat(inp.value); });
    Store.saveSettings(s);
    toast('Einstellungen gespeichert.');
    renderWarnungen(Store.loadEntries());
  });

  // ================================================== Tab: Klassenlisten
  function buildRosterRow(s) {
    const tr = document.createElement('tr');
    tr.dataset.id = s.id;
    tr.innerHTML = `
      <td><input type="text" class="ro-vorname" value="${escapeHtml(s.vorname || '')}" style="min-width:140px"></td>
      <td><input type="text" class="ro-nachname" value="${escapeHtml(s.nachname || '')}" style="min-width:140px"></td>
      <td><button type="button" class="row-btn" title="Zeile entfernen">✕</button></td>
    `;
    tr.querySelector('.row-btn').addEventListener('click', () => tr.remove());
    return tr;
  }

  // Nächste freie ID unter Berücksichtigung bereits gespeicherter UND
  // gerade erst (noch ungespeichert) in der Tabelle stehender Zeilen.
  function nextRosterIdForTable(klasse) {
    const persisted = Store.getRosterList(klasse).map((s) => parseInt(s.id, 10));
    const inTable = $all('#roster-tbody tr').map((tr) => parseInt(tr.dataset.id, 10));
    const all = persisted.concat(inTable).filter((n) => !isNaN(n));
    return String((all.length ? Math.max(...all) : 0) + 1);
  }

  function renderRosterTable() {
    const klasse = $('#roster-klasse').value.trim();
    const tbody = $('#roster-tbody');
    tbody.innerHTML = '';
    if (!klasse) return;
    Store.getRosterList(klasse).forEach((s) => tbody.appendChild(buildRosterRow(s)));
  }

  $('#roster-klasse').addEventListener('change', renderRosterTable);
  $('#roster-klasse').addEventListener('input', renderRosterTable);

  $('#btn-roster-add').addEventListener('click', () => {
    const klasse = $('#roster-klasse').value.trim();
    if (!klasse) { toast('Bitte zuerst eine Klasse angeben.'); return; }
    $('#roster-tbody').appendChild(buildRosterRow({ id: nextRosterIdForTable(klasse), vorname: '', nachname: '' }));
  });

  $('#btn-roster-bulk-add').addEventListener('click', () => {
    const klasse = $('#roster-klasse').value.trim();
    if (!klasse) { toast('Bitte zuerst eine Klasse angeben.'); return; }
    const geparst = Parser.parseNameList($('#roster-bulk').value);
    if (!geparst.length) { toast('Keine Namen erkannt.'); return; }
    geparst.forEach((s) => {
      $('#roster-tbody').appendChild(buildRosterRow({ id: nextRosterIdForTable(klasse), vorname: s.vorname, nachname: s.nachname }));
    });
    $('#roster-bulk').value = '';
    toast(`${geparst.length} Namen eingelesen — bitte prüfen und speichern.`);
  });

  $('#btn-roster-save').addEventListener('click', async () => {
    const klasse = $('#roster-klasse').value.trim();
    if (!klasse) { toast('Bitte zuerst eine Klasse angeben.'); return; }
    const schuelerListe = [];
    $all('#roster-tbody tr').forEach((tr) => {
      const vorname = tr.querySelector('.ro-vorname').value.trim();
      const nachname = tr.querySelector('.ro-nachname').value.trim();
      if (vorname) schuelerListe.push({ id: tr.dataset.id, vorname, nachname });
    });
    try {
      await Store.saveRosterClass(klasse, schuelerListe);
      $('#roster-status').textContent = `Klassenliste ${klasse} gespeichert (${schuelerListe.length} Namen).`;
      toast('Klassenliste gespeichert.');
    } catch (e) {
      $('#roster-status').textContent = 'Fehler: ' + e.message;
    }
  });

  // ================================================== Tab: Export/Import
  $('#btn-export-all').addEventListener('click', () => {
    ExportImport.exportToExcel(Store.loadEntries(), 'Klassenbuch_Gesamt');
  });

  $('#btn-import').addEventListener('click', async () => {
    const file = $('#import-file').files[0];
    if (!file) { toast('Bitte zuerst eine Datei auswählen.'); return; }
    try {
      const rows = await ExportImport.importFromFile(file);
      await Store.upsertEntries(rows);
      $('#import-status').textContent = rows.length + ' Einträge importiert/zusammengeführt.';
      toast('Import erfolgreich.');
    } catch (e) {
      $('#import-status').textContent = 'Fehler: ' + e.message;
    }
  });

  // ================================================== Bootstrap
  FirebaseSync.onAuthChange((user) => {
    if (user) {
      $('#user-email').textContent = user.email;
      $('#export-user-email').textContent = user.email;
      showScreen('main');
      updateSyncBadge();
    } else if (FirebaseSync.isConfigured()) {
      showScreen('auth');
    }
  });

  FirebaseSync.onEntriesChange((entries) => { Store.setCache(entries); });
  FirebaseSync.onRosterChange((roster) => { Store.setRosterCache(roster); });

  Store.onChange((entries) => {
    populateDropdowns(entries);
    renderCurrentTab();
  });

  // Namen können in mehreren Tabs angezeigt werden (Einträge, Auswertungen,
  // Warnsystem) -> bei Änderung überall neu rendern.
  Store.onRosterChange(() => { renderCurrentTab(); });

  window.addEventListener('online', updateSyncBadge);
  window.addEventListener('offline', updateSyncBadge);

  function bootstrap() {
    updateSyncBadge();
    if (FirebaseSync.isConfigured()) {
      try {
        FirebaseSync.init();
      } catch (e) {
        console.error(e);
        showScreen('setup');
        return;
      }
      // showScreen('main'/'auth') erfolgt über onAuthChange, sobald der
      // Auth-Status feststeht.
    } else {
      showScreen('setup');
    }
  }

  bootstrap();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline first load ohne SW ist ok */ });
    });
  }
})();
