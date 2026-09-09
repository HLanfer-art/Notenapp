/*
 * exportImport.js — Excel-Export/-Import (immer .xlsx, feste Spaltenstruktur).
 *
 * Spaltenreihenfolge exakt wie in der Projektanweisung gefordert:
 * Datum | Klasse | Fach | Schüler | Kategorie | Beschreibung | Note |
 * Positiv/Negativ | Priorität
 *
 * Eine zusätzliche, ganz links stehende Spalte "ID" wird mitgeführt,
 * damit exportierte Tabellen später wieder eingelesen und verlustfrei
 * mit dem Bestand zusammengeführt werden können (Merge über die ID statt
 * Duplikate).
 */

const ExportImport = (() => {
  const HEADERS = ['ID', 'Datum', 'Klasse', 'Fach', 'Schüler', 'Kategorie', 'Beschreibung', 'Note', 'Positiv/Negativ', 'Priorität', 'Notenbereich'];

  function typLabel(typ) {
    if (typ === 'positiv') return 'Positiv';
    if (typ === 'negativ') return 'Negativ';
    return 'Neutral';
  }

  function typFromLabel(label) {
    const l = (label || '').toLowerCase();
    if (l.startsWith('pos')) return 'positiv';
    if (l.startsWith('neg')) return 'negativ';
    return 'neutral';
  }

  function entriesToRows(entries) {
    return entries.map((e) => ({
      ID: e.id || '',
      Datum: e.datum || '',
      Klasse: e.klasse || '',
      Fach: e.fach || '',
      'Schüler': e.schueler || '',
      Kategorie: e.kategorie || '',
      Beschreibung: e.beschreibung || '',
      Note: e.noteLabel || (e.note != null ? String(e.note) : ''),
      'Positiv/Negativ': typLabel(e.typ),
      'Priorität': e.prioritaet || '',
      Notenbereich: e.notenbereich || '',
    }));
  }

  function buildAveragesSheet(entries) {
    const profiles = Stats.buildStudentProfiles(entries);
    return profiles.map((p) => ({
      Klasse: p.klasse,
      'Schüler': p.schueler,
      'Ø gesamt': p.gesamt.avg ?? '',
      'Anzahl Noten': p.gesamt.count,
      'Ø Referat': p.perBereich['Referat'].avg ?? '',
      'Ø Klausur': p.perBereich['Klausur'].avg ?? '',
      'Ø Test': p.perBereich['Test'].avg ?? '',
      'Ø Sonstige Mitarbeit': p.perBereich['Sonstige Mitarbeit'].avg ?? '',
      'Positive Einträge': p.positiv,
      'Negative Einträge': p.negativ,
    }));
  }

  function exportToExcel(entries, filenameBase) {
    const wb = XLSX.utils.book_new();

    const rows = entriesToRows(entries);
    const ws = XLSX.utils.json_to_sheet(rows, { header: HEADERS });
    ws['!cols'] = [
      { wch: 12 }, { wch: 11 }, { wch: 8 }, { wch: 12 }, { wch: 8 },
      { wch: 16 }, { wch: 40 }, { wch: 6 }, { wch: 14 }, { wch: 8 }, { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Klassenbuch');

    const avgRows = buildAveragesSheet(entries);
    if (avgRows.length) {
      const ws2 = XLSX.utils.json_to_sheet(avgRows);
      XLSX.utils.book_append_sheet(wb, ws2, 'Durchschnitte');
    }

    const today = new Date().toISOString().slice(0, 10);
    const filename = `${filenameBase || 'Klassenbuch_Export'}_${today}.xlsx`;
    XLSX.writeFile(wb, filename);
    return filename;
  }

  function importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target.result);
          const wb = XLSX.read(data, { type: 'array' });
          const sheetName = wb.SheetNames.includes('Klassenbuch') ? 'Klassenbuch' : wb.SheetNames[0];
          const sheet = wb.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

          const entries = rows
            .filter((r) => r['Datum'] || r['Schüler'])
            .map((r) => {
              const noteRaw = String(r['Note'] || '').trim();
              let note = null;
              if (noteRaw) {
                const m = noteRaw.match(/^([1-6])\s*(\+|-)?$/);
                if (m) {
                  note = Parser.gradeToNumber(parseInt(m[1], 10), m[2] === '+' ? '+' : m[2] === '-' ? '-' : '');
                } else if (!isNaN(parseFloat(noteRaw))) {
                  note = parseFloat(noteRaw);
                }
              }
              return {
                id: r['ID'] ? String(r['ID']) : undefined,
                datum: r['Datum'] ? String(r['Datum']).slice(0, 10) : '',
                klasse: String(r['Klasse'] || ''),
                fach: String(r['Fach'] || ''),
                schueler: String(r['Schüler'] || ''),
                kategorie: String(r['Kategorie'] || 'Sonstiges'),
                beschreibung: String(r['Beschreibung'] || ''),
                note,
                noteLabel: noteRaw,
                notenbereich: r['Notenbereich'] ? String(r['Notenbereich']) : null,
                typ: typFromLabel(r['Positiv/Negativ']),
                prioritaet: r['Priorität'] || '⚪',
              };
            });
          resolve(entries);
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  return { exportToExcel, importFromFile, entriesToRows, HEADERS };
})();
