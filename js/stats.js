/*
 * stats.js — Durchschnittsberechnungen und Schülerprofile.
 *
 * Ein Schüler wird eindeutig über die Kombination Klasse + Schülernummer
 * identifiziert (dieselbe Nummer kann in verschiedenen Klassen für
 * unterschiedliche Kinder stehen).
 */

const Stats = (() => {
  function studentKey(e) {
    return `${e.klasse || ''}#${e.schueler || ''}`;
  }

  function average(entries) {
    const notes = entries.map((e) => e.note).filter((n) => typeof n === 'number');
    if (!notes.length) return { avg: null, count: 0 };
    const sum = notes.reduce((a, b) => a + b, 0);
    return { avg: Math.round((sum / notes.length) * 100) / 100, count: notes.length };
  }

  function inRange(e, von, bis) {
    if (von && e.datum < von) return false;
    if (bis && e.datum > bis) return false;
    return true;
  }

  function filterEntries(entries, f = {}) {
    return entries.filter((e) => {
      if (f.klasse && e.klasse !== f.klasse) return false;
      if (f.fach && e.fach !== f.fach) return false;
      if (f.schueler && e.schueler !== f.schueler) return false;
      if (f.kategorie && e.kategorie !== f.kategorie) return false;
      if (f.prioritaet && e.prioritaet !== f.prioritaet) return false;
      if (f.typ && e.typ !== f.typ) return false;
      if (f.von && e.datum < f.von) return false;
      if (f.bis && e.datum > f.bis) return false;
      if (f.suche) {
        const hay = [e.klasse, e.fach, e.schueler, e.kategorie, e.beschreibung]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(f.suche.toLowerCase())) return false;
      }
      return true;
    });
  }

  const NOTENBEREICHE = ['Referat', 'Klausur', 'Test', 'Sonstige Mitarbeit', 'Gruppenarbeit'];

  // Baut pro Schüler (Klasse+Nummer) ein Profil mit Gesamt- und
  // Zeitraum-Durchschnitt sowie Aufschlüsselung nach Notenbereich.
  function buildStudentProfiles(entries, { von, bis } = {}) {
    const groups = new Map();
    entries.forEach((e) => {
      const key = studentKey(e);
      if (!groups.has(key)) {
        groups.set(key, { klasse: e.klasse, schueler: e.schueler, entries: [] });
      }
      groups.get(key).entries.push(e);
    });

    const profiles = [];
    groups.forEach((g, key) => {
      const gesamt = average(g.entries);
      const zeitraumEntries = von || bis ? g.entries.filter((e) => inRange(e, von, bis)) : g.entries;
      const zeitraum = average(zeitraumEntries);

      const perBereich = {};
      NOTENBEREICHE.forEach((nb) => {
        perBereich[nb] = average(g.entries.filter((e) => e.notenbereich === nb));
      });

      const positiv = g.entries.filter((e) => e.typ === 'positiv').length;
      const negativ = g.entries.filter((e) => e.typ === 'negativ').length;
      const letzterEintrag = g.entries.reduce(
        (max, e) => (!max || e.datum > max ? e.datum : max),
        null
      );

      profiles.push({
        key,
        klasse: g.klasse,
        schueler: g.schueler,
        anzahlEintraege: g.entries.length,
        gesamt,
        zeitraum,
        perBereich,
        positiv,
        negativ,
        letzterEintrag,
        entries: g.entries.slice().sort((a, b) => (a.datum < b.datum ? 1 : -1)),
      });
    });

    profiles.sort((a, b) => (a.klasse + a.schueler).localeCompare(b.klasse + b.schueler, 'de', { numeric: true }));
    return profiles;
  }

  // Formatierte Text-Zusammenfassung für einen einzelnen Schüler
  // (z. B. für Elternsprechtage / Zeugnisvorbereitung) im Stil der
  // Projektanweisung.
  function studentReport(profile) {
    const lines = [];
    lines.push(`Schüler ${profile.schueler} (Klasse ${profile.klasse})`);
    lines.push('');
    lines.push(`Gesamtdurchschnitt: ${profile.gesamt.avg ?? '–'} (${profile.gesamt.count} Note(n))`);
    NOTENBEREICHE.forEach((nb) => {
      const b = profile.perBereich[nb];
      if (b.count) lines.push(`  ${nb}: ${b.avg} (${b.count})`);
    });
    lines.push('');
    lines.push(`Positive Einträge: ${profile.positiv} | Negative Einträge: ${profile.negativ}`);
    lines.push('');
    lines.push('Chronologie:');
    profile.entries.forEach((e) => {
      lines.push(`  ${e.datum} [${e.fach}] ${e.kategorie}: ${e.beschreibung}${e.noteLabel ? ' (Note ' + e.noteLabel + ')' : ''} ${e.prioritaet}`);
    });
    return lines.join('\n');
  }

  return { studentKey, average, filterEntries, buildStudentProfiles, studentReport, NOTENBEREICHE };
})();
