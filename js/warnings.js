/*
 * warnings.js — Frühwarnsystem.
 *
 * Erkennt wiederkehrende Muster je Schüler (Klasse+Nummer):
 *  - mehrfach vergessene Hausaufgaben
 *  - mehrfach vergessenes Material/Tablet
 *  - häufige Unterrichtsstörungen (Kategorie Verhalten)
 *  - auffällig viele negative Einträge insgesamt
 *  - deutlicher Leistungsabfall bzw. deutliche Leistungsverbesserung
 *  - besonders positive Entwicklung (viele positive Einträge)
 *
 * Alle Schwellenwerte kommen aus Store.loadSettings() und sind in der
 * App unter "Frühwarnsystem -> Einstellungen" änderbar.
 */

const Warnings = (() => {
  function daysAgo(dateStr, days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10) <= dateStr;
  }

  function withinWindow(entries, days) {
    return entries.filter((e) => daysAgo(e.datum, days));
  }

  function groupByStudent(entries) {
    const groups = new Map();
    entries.forEach((e) => {
      const key = Stats.studentKey(e);
      if (!groups.has(key)) groups.set(key, { klasse: e.klasse, schueler: e.schueler, entries: [] });
      groups.get(key).entries.push(e);
    });
    return groups;
  }

  function computeWarnings(entries, settingsParam) {
    const settings = settingsParam || Store.loadSettings();
    const groups = groupByStudent(entries.filter((e) => e.schueler));
    const warnings = [];

    groups.forEach((g) => {
      const label = `Schüler ${g.schueler} (${g.klasse})`;

      // Hausaufgaben vergessen
      const ha = withinWindow(
        g.entries.filter((e) => e.kategorie === 'Hausaufgaben' && e.typ === 'negativ'),
        settings.warnHausaufgabenTageFenster
      );
      if (ha.length >= settings.warnHausaufgabenCount) {
        warnings.push({
          key: g.klasse + '#' + g.schueler, klasse: g.klasse, schueler: g.schueler,
          typ: 'hausaufgaben', prioritaet: '🟠',
          text: `${label}: ${ha.length}× Hausaufgaben vergessen in den letzten ${settings.warnHausaufgabenTageFenster} Tagen`,
          count: ha.length,
        });
      }

      // Material/Tablet vergessen
      const mat = withinWindow(
        g.entries.filter((e) => (e.kategorie === 'Material' || e.kategorie === 'Tablet') && e.typ === 'negativ'),
        settings.warnMaterialTageFenster
      );
      if (mat.length >= settings.warnMaterialCount) {
        warnings.push({
          key: g.klasse + '#' + g.schueler, klasse: g.klasse, schueler: g.schueler,
          typ: 'material', prioritaet: '🟠',
          text: `${label}: ${mat.length}× Material/Tablet vergessen in den letzten ${settings.warnMaterialTageFenster} Tagen`,
          count: mat.length,
        });
      }

      // Unterrichtsstörungen
      const verh = withinWindow(
        g.entries.filter((e) => e.kategorie === 'Verhalten' && e.typ === 'negativ'),
        settings.warnVerhaltenTageFenster
      );
      if (verh.length >= settings.warnVerhaltenCount) {
        warnings.push({
          key: g.klasse + '#' + g.schueler, klasse: g.klasse, schueler: g.schueler,
          typ: 'verhalten', prioritaet: '🔴',
          text: `${label}: ${verh.length}× Unterrichtsstörungen in den letzten ${settings.warnVerhaltenTageFenster} Tagen`,
          count: verh.length,
        });
      }

      // Allgemeine Häufung negativer Einträge
      const neg = withinWindow(g.entries.filter((e) => e.typ === 'negativ'), settings.warnNegativTageFenster);
      if (neg.length >= settings.warnNegativCount) {
        warnings.push({
          key: g.klasse + '#' + g.schueler, klasse: g.klasse, schueler: g.schueler,
          typ: 'negativHaeufung', prioritaet: '🔴',
          text: `${label}: auffällig viele negative Einträge (${neg.length} in ${settings.warnNegativTageFenster} Tagen)`,
          count: neg.length,
        });
      }

      // Positive Entwicklung
      const pos = withinWindow(g.entries.filter((e) => e.typ === 'positiv'), settings.warnPositivTageFenster);
      if (pos.length >= settings.warnPositivCount) {
        warnings.push({
          key: g.klasse + '#' + g.schueler, klasse: g.klasse, schueler: g.schueler,
          typ: 'positiveEntwicklung', prioritaet: '🟢',
          text: `${label}: besonders positive Entwicklung (${pos.length} positive Einträge in ${settings.warnPositivTageFenster} Tagen)`,
          count: pos.length,
        });
      }

      // Notentrend: letzte 3 Noten vs. die 3 davor (chronologisch)
      const grades = g.entries
        .filter((e) => typeof e.note === 'number')
        .slice()
        .sort((a, b) => (a.datum < b.datum ? -1 : 1));
      if (grades.length >= 4) {
        const letzte = grades.slice(-3);
        const davor = grades.slice(-6, -3);
        if (davor.length) {
          const avgLetzte = letzte.reduce((s, e) => s + e.note, 0) / letzte.length;
          const avgDavor = davor.reduce((s, e) => s + e.note, 0) / davor.length;
          const diff = avgLetzte - avgDavor; // negativ = besser geworden (Notenskala 1=beste)
          if (diff >= settings.warnNotentrendDiff) {
            warnings.push({
              key: g.klasse + '#' + g.schueler, klasse: g.klasse, schueler: g.schueler,
              typ: 'leistungsabfall', prioritaet: '🔴',
              text: `${label}: Leistungsabfall erkennbar (Ø zuletzt ${avgLetzte.toFixed(2)} vs. zuvor ${avgDavor.toFixed(2)})`,
              count: grades.length,
            });
          } else if (diff <= -settings.warnNotentrendDiff) {
            warnings.push({
              key: g.klasse + '#' + g.schueler, klasse: g.klasse, schueler: g.schueler,
              typ: 'leistungsverbesserung', prioritaet: '🟢',
              text: `${label}: deutliche Leistungsverbesserung (Ø zuletzt ${avgLetzte.toFixed(2)} vs. zuvor ${avgDavor.toFixed(2)})`,
              count: grades.length,
            });
          }
        }
      }
    });

    const order = { '🔴': 0, '🟠': 1, '🟢': 2, '⚪': 3 };
    warnings.sort((a, b) => order[a.prioritaet] - order[b.prioritaet]);
    return warnings;
  }

  return { computeWarnings };
})();
