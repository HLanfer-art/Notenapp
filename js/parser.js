/*
 * parser.js — Zerlegt einen frei diktierten Text in einzelne, strukturierte
 * Klassenbuch-Einträge (Schüler-Nummer, Kategorie, Beschreibung, Note,
 * Positiv/Negativ, Priorität).
 *
 * Datum, Klasse und Fach werden NICHT aus dem Diktat geraten, sondern
 * einmal pro Unterrichtsstunde über die Formularfelder gesetzt — das macht
 * die Erkennung der eigentlichen Beobachtungen deutlich zuverlässiger.
 *
 * WICHTIG: Der Parser arbeitet heuristisch (Mustererkennung), nicht mit
 * echtem Sprachverständnis. Er liefert einen Vorschlag, der in der App vor
 * dem Speichern immer geprüft/korrigiert werden kann und soll.
 */

const Parser = (() => {
  const KATEGORIEN = [
    'Mitarbeit', 'Verhalten', 'Hausaufgaben', 'Material', 'Tablet', 'Referat',
    'Klausur', 'Test', 'Mündliche Leistung', 'Sozialverhalten', 'Lob',
    'Gespräch', 'Organisatorisches', 'Sonstiges',
  ];

  const PRIORITAETEN = ['🟢', '⚪', '🟠', '🔴'];

  const GRADE_WORDS = {
    eins: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, funf: 5, sechs: 6,
  };

  // Reihenfolge = Priorität der Erkennung (erster Treffer gewinnt).
  const CATEGORY_RULES = [
    { kategorie: 'Hausaufgaben', re: /hausaufgabe/i },
    { kategorie: 'Tablet', re: /tablet|ipad|laptop vergessen/i },
    { kategorie: 'Material', re: /material|heft vergessen|buch vergessen|stifte? vergessen/i },
    { kategorie: 'Klausur', re: /klausur/i },
    { kategorie: 'Referat', re: /referat|präsentation/i },
    { kategorie: 'Test', re: /\btest\b|diktat|vokabeltest|abfrage/i },
    { kategorie: 'Mündliche Leistung', re: /mündlich/i },
    { kategorie: 'Lob', re: /\blob\b|gelobt/i },
    { kategorie: 'Gespräch', re: /gespräch|elterngespräch/i },
    { kategorie: 'Sozialverhalten', re: /sozialverhalten|hilfsbereit|geholfen|gestritten|streit|getröstet|ausgegrenzt/i },
    { kategorie: 'Verhalten', re: /dazwischengerufen|gestört|störung|unruhig|respektlos|handy|beleidigt|geschubst|verspätet|zu spät|geschwätzt|abgelenkt/i },
    { kategorie: 'Organisatorisches', re: /ausflug|klassenfahrt|termin|elternabend|organisator|abgabe|formular|unterschrift/i },
    { kategorie: 'Mitarbeit', re: /mitarbeit|meldet sich|beteiligt|mitgemacht/i },
  ];

  const NEGATIVE_RE = /vergessen|gestört|störung|dazwischengerufen|unruhig|respektlos|gestritten|streit|beleidigt|geschubst|verspätet|zu spät|nicht gemacht|nicht dabei|unentschuldigt|schlecht|abgelenkt|verweigert/i;
  const POSITIVE_RE = /\blob\b|gelobt|super|sehr gut|toll|ausgezeichnet|hilfsbereit|geholfen|engagiert|motiviert|freiwillig|vorbildlich|gut gemacht|klasse gemacht|fleißig/i;
  const SEVERITY_RE = /mehrfach|wiederholt|erneut|schon wieder|massiv|respektlos|eskaliert|geschlagen|geschubst|handgreiflich|sehr schlecht/i;

  function gradeToNumber(base, modifier) {
    let val = base;
    if (modifier === '+' || modifier === 'plus') val -= 0.25;
    if (modifier === '-' || modifier === 'minus') val += 0.25;
    return Math.min(6, Math.max(1, val));
  }

  function gradeLabel(base, modifier) {
    if (modifier === '+' || modifier === 'plus') return base + '+';
    if (modifier === '-' || modifier === 'minus') return base + '-';
    return String(base);
  }

  const GRADE_TOKEN = '(sechs|fünf|funf|vier|drei|zwei|eins|[1-6])';

  function extractGrade(text) {
    // 1) Explizit mit dem Wort "Note"
    let re = new RegExp('\\bNote\\s*[:]?\\s*' + GRADE_TOKEN + '\\s*(\\+|-|plus|minus)?', 'i');
    let m = text.match(re);
    if (!m) {
      // 2) Notenwort/-ziffer am Satzende (z. B. "Referat zwei plus")
      re = new RegExp(GRADE_TOKEN + '\\s*(\\+|-|plus|minus)?\\s*$', 'i');
      m = text.match(re);
    }
    if (!m) return null;
    const rawBase = m[1].toLowerCase();
    const base = GRADE_WORDS[rawBase] !== undefined ? GRADE_WORDS[rawBase] : parseInt(rawBase, 10);
    const modifier = (m[2] || '').toLowerCase();
    return {
      value: gradeToNumber(base, modifier),
      label: gradeLabel(base, modifier),
    };
  }

  function detectKategorie(text) {
    for (const rule of CATEGORY_RULES) {
      if (rule.re.test(text)) return rule.kategorie;
    }
    return null;
  }

  function detectTyp(text, note) {
    const neg = NEGATIVE_RE.test(text);
    const pos = POSITIVE_RE.test(text);
    if (pos && !neg) return 'positiv';
    if (neg && !pos) return 'negativ';
    if (note != null) {
      if (note <= 2) return 'positiv';
      if (note >= 5) return 'negativ';
    }
    return 'neutral';
  }

  function detectPrioritaet(typ, text, note) {
    if (typ === 'positiv') return '🟢';
    if (typ === 'negativ') {
      if (SEVERITY_RE.test(text) || (note != null && note >= 5)) return '🔴';
      return '🟠';
    }
    return '⚪';
  }

  function notenbereichFor(kategorie, text) {
    if (/gruppenarbeit/i.test(text)) return 'Gruppenarbeit';
    if (kategorie === 'Referat' || kategorie === 'Klausur' || kategorie === 'Test') return kategorie;
    return 'Sonstige Mitarbeit';
  }

  // Zerlegt einen Satz in Blöcke von führenden Zahlen ("Schülernummern")
  // gefolgt von einem Beschreibungstext. Mehrere Nummern ohne eigenen Text
  // ("5, 11, 19 Hausaufgaben vergessen") werden gesammelt, bis ein Block
  // mit Text folgt, und teilen sich dann diesen Text.
  function splitSentenceIntoBlocks(sentence) {
    const parts = sentence.split(',').map((p) => p.trim()).filter(Boolean);
    const blocks = [];
    let pending = [];

    const leadingNumRe = /^((?:\d{1,3})(?:\s+und\s+\d{1,3})*)\s*(.*)$/i;

    parts.forEach((part) => {
      const m = part.match(leadingNumRe);
      if (m) {
        const numbers = m[1].split(/\s+und\s+/i).map((n) => n.trim());
        const rest = m[2].trim();
        if (rest === '') {
          pending.push(...numbers);
        } else {
          blocks.push({ numbers: pending.concat(numbers), text: rest });
          pending = [];
        }
      } else if (part) {
        if (pending.length) {
          blocks.push({ numbers: pending, text: part });
          pending = [];
        } else {
          // Kein Schüler-Bezug erkennbar -> allgemeine Beobachtung.
          blocks.push({ numbers: [], text: part });
        }
      }
    });
    // Übrig gebliebene reine Nummern ohne Text (z.B. Versprecher) verwerfen.
    return blocks;
  }

  function parseTranscript(transcript) {
    const text = (transcript || '').trim();
    if (!text) return [];

    const sentences = text
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const results = [];

    sentences.forEach((sentence) => {
      const clean = sentence.replace(/[.!?]+$/, '').trim();
      if (!clean) return;
      const blocks = splitSentenceIntoBlocks(clean);

      blocks.forEach((block) => {
        const grade = extractGrade(block.text);
        let kategorie = detectKategorie(block.text);
        let unsicher = false;

        if (!kategorie) {
          if (grade) {
            kategorie = 'Mündliche Leistung';
          } else if (block.numbers.length === 0) {
            kategorie = 'Organisatorisches';
          } else {
            kategorie = 'Sonstiges';
            unsicher = true;
          }
        }

        const typ = detectTyp(block.text, grade ? grade.value : null);
        const prioritaet = detectPrioritaet(typ, block.text, grade ? grade.value : null);
        const notenbereich = grade ? notenbereichFor(kategorie, block.text) : null;

        const schuelerListe = block.numbers.length ? block.numbers : [''];
        schuelerListe.forEach((nr) => {
          results.push({
            schueler: nr,
            kategorie,
            beschreibung: block.text,
            note: grade ? grade.value : null,
            noteLabel: grade ? grade.label : '',
            notenbereich,
            typ,
            prioritaet,
            unsicher,
            quelle: sentence,
          });
        });
      });
    });

    return results;
  }

  return {
    KATEGORIEN,
    PRIORITAETEN,
    parseTranscript,
    gradeToNumber,
  };
})();
