/*
 * parser.js — Zerlegt einen frei diktierten Text in einzelne, strukturierte
 * Klassenbuch-Einträge (Schüler-Nummer, Kategorie, Beschreibung, Note,
 * Positiv/Negativ, Priorität).
 *
 * Datum, Klasse und Fach werden NICHT aus dem Diktat geraten, sondern
 * einmal pro Unterrichtsstunde über die Formularfelder gesetzt — das macht
 * die Erkennung der eigentlichen Beobachtungen deutlich zuverlässiger.
 *
 * Schüler werden über Vornamen erkannt: parseTranscript(text, { roster })
 * bekommt die Klassenliste der aktuell gewählten Klasse (Array aus
 * {id, vorname, nachname}) und gleicht gesprochene Wörter NUR gegen diese
 * bekannten Vornamen ab — kein generisches "großgeschriebenes Wort ist ein
 * Name"-Raten, das im Deutschen wegen der Groß-/Kleinschreibung von
 * Substantiven viel zu viele Fehltreffer produzieren würde. Gibt es zum
 * Vornamen mehrere Kinder in der Klasse, versucht der Parser zusätzlich
 * den folgenden Nachnamen zu lesen; bleibt es mehrdeutig, wird der Eintrag
 * als unsicher markiert (Kandidatenliste), damit er in der Review-Tabelle
 * per Auswahlliste aufgelöst werden kann. Ziffern funktionieren weiterhin
 * als Fallback (z. B. für Klassen ohne hinterlegte Liste).
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

  // Baut aus der Klassenliste einen Namensindex zum schnellen Abgleich.
  function buildNameIndex(roster) {
    const byVorname = new Map(); // lower(vorname) -> [{id,vorname,nachname}]
    const byFullName = new Map(); // lower("vorname nachname") -> {id,vorname,nachname}
    (roster || []).forEach((s) => {
      if (!s || !s.vorname) return;
      const vKey = s.vorname.trim().toLowerCase();
      if (!byVorname.has(vKey)) byVorname.set(vKey, []);
      byVorname.get(vKey).push(s);
      if (s.nachname) {
        byFullName.set(`${s.vorname.trim()} ${s.nachname.trim()}`.toLowerCase(), s);
      }
    });
    return byVorname.size ? { byVorname, byFullName } : null;
  }

  const NAME_TOKEN_RE = /^([A-ZÄÖÜ][\wÀ-ÿ'-]*)\.?\s*/;

  // Versucht am Anfang von `text` genau einen bekannten Vornamen (optional
  // gefolgt vom Nachnamen zur Auflösung von Mehrfachtreffern) zu lesen.
  function extractOneName(text, nameIndex) {
    const m = text.match(NAME_TOKEN_RE);
    if (!m) return null;
    const kandidaten = nameIndex.byVorname.get(m[1].toLowerCase());
    if (!kandidaten) return null;

    const rest = text.slice(m[0].length);
    if (kandidaten.length > 1) {
      const m2 = rest.match(NAME_TOKEN_RE);
      if (m2) {
        const voll = nameIndex.byFullName.get(`${m[1]} ${m2[1]}`.toLowerCase());
        if (voll) return { consumed: m[0].length + m2[0].length, resolved: voll, kandidaten: null };
      }
      return { consumed: m[0].length, resolved: null, kandidaten };
    }
    return { consumed: m[0].length, resolved: kandidaten[0], kandidaten: null };
  }

  // Liest am Anfang von `text` eine Folge von Schüler-Identifikatoren:
  // entweder Ziffern ("5, 11 und 19 ...") oder — falls eine Klassenliste
  // übergeben wurde — bekannte Vornamen ("Max und Lena ..."). Numerisch hat
  // Vorrang, damit bestehende Diktate mit Nummern unverändert funktionieren.
  function extractLeadingIdentifiers(text, nameIndex) {
    const numRe = /^((?:\d{1,3})(?:\s+und\s+\d{1,3})*)\s*(.*)$/i;
    const numMatch = text.match(numRe);
    if (numMatch) {
      const identifiers = numMatch[1].split(/\s+und\s+/i).map((n) => ({
        id: n.trim(), unsicher: false, kandidaten: null,
      }));
      return { identifiers, rest: numMatch[2].trim() };
    }

    if (!nameIndex) return null;

    const identifiers = [];
    let remaining = text;
    for (;;) {
      const found = extractOneName(remaining, nameIndex);
      if (!found) break;
      remaining = remaining.slice(found.consumed);
      identifiers.push(found.resolved
        ? { id: found.resolved.id, unsicher: false, kandidaten: null }
        : { id: null, unsicher: true, kandidaten: found.kandidaten });
      const und = remaining.match(/^und\s+/i);
      if (!und) break;
      remaining = remaining.slice(und[0].length);
    }
    if (!identifiers.length) return null;
    return { identifiers, rest: remaining.trim() };
  }

  // Zerlegt einen Satz in Blöcke von führenden Schüler-Identifikatoren
  // gefolgt von einem Beschreibungstext. Mehrere Identifikatoren ohne
  // eigenen Text ("5, 11, 19 Hausaufgaben vergessen" bzw. "Max, Lena, Tom
  // Hausaufgaben vergessen") werden gesammelt, bis ein Block mit Text
  // folgt, und teilen sich dann diesen Text.
  function splitSentenceIntoBlocks(sentence, nameIndex) {
    const parts = sentence.split(',').map((p) => p.trim()).filter(Boolean);
    const blocks = [];
    let pending = [];

    parts.forEach((part) => {
      const extracted = extractLeadingIdentifiers(part, nameIndex);
      if (extracted) {
        if (extracted.rest === '') {
          pending = pending.concat(extracted.identifiers);
        } else {
          blocks.push({ identifiers: pending.concat(extracted.identifiers), text: extracted.rest });
          pending = [];
        }
      } else if (part) {
        if (pending.length) {
          blocks.push({ identifiers: pending, text: part });
          pending = [];
        } else {
          // Kein Schüler-Bezug erkennbar -> allgemeine Beobachtung.
          blocks.push({ identifiers: [], text: part });
        }
      }
    });
    // Übrig gebliebene reine Identifikatoren ohne Text (z.B. Versprecher) verwerfen.
    return blocks;
  }

  function parseTranscript(transcript, options) {
    const text = (transcript || '').trim();
    if (!text) return [];

    const nameIndex = buildNameIndex(options && options.roster);

    const sentences = text
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const results = [];

    sentences.forEach((sentence) => {
      const clean = sentence.replace(/[.!?]+$/, '').trim();
      if (!clean) return;
      const blocks = splitSentenceIntoBlocks(clean, nameIndex);

      blocks.forEach((block) => {
        const grade = extractGrade(block.text);
        let kategorie = detectKategorie(block.text);
        let unsicher = false;

        if (!kategorie) {
          if (grade) {
            kategorie = 'Mündliche Leistung';
          } else if (block.identifiers.length === 0) {
            kategorie = 'Organisatorisches';
          } else {
            kategorie = 'Sonstiges';
            unsicher = true;
          }
        }

        const typ = detectTyp(block.text, grade ? grade.value : null);
        const prioritaet = detectPrioritaet(typ, block.text, grade ? grade.value : null);
        const notenbereich = grade ? notenbereichFor(kategorie, block.text) : null;

        const schuelerListe = block.identifiers.length ? block.identifiers : [{ id: '', unsicher: false, kandidaten: null }];
        schuelerListe.forEach((ident) => {
          results.push({
            schueler: ident.id || '',
            schuelerUnsicher: ident.unsicher,
            schuelerKandidaten: ident.kandidaten,
            kategorie,
            beschreibung: block.text,
            note: grade ? grade.value : null,
            noteLabel: grade ? grade.label : '',
            notenbereich,
            typ,
            prioritaet,
            unsicher: unsicher || ident.unsicher,
            quelle: sentence,
          });
        });
      });
    });

    return results;
  }

  // Zerlegt eine eingefügte Namensliste (eine Person pro Zeile) in
  // {vorname, nachname}. Erkennt "Nachname, Vorname" (häufig bei
  // alphabetischen Schullisten) ebenso wie "Vorname Nachname" und
  // entfernt vorangestellte Listenzeichen ("1.", "1)", "-", "•").
  // Trennt einen einzelnen Namens-Token in {vorname, nachname}. Enthält der
  // Token noch ein Komma (nur im "Nachname, Vorname"-Modus möglich), wird
  // das als Nachname/Vorname-Paar gelesen; ein überzähliges/einsames Komma
  // (z. B. Zeile endete mit ",") fällt sauber auf einen reinen Vornamen
  // zurück statt einen leeren Vornamen zu erzeugen.
  // Ein Namens-Token ist genau EINE Person. Enthält der Token ein
  // Leerzeichen, wird das erste Wort als Vorname, der Rest als Nachname
  // gelesen (z. B. "Max Meier"); ohne Leerzeichen gibt es nur einen
  // Vornamen.
  function parseNameToken(token) {
    const worte = token.split(/\s+/).filter(Boolean);
    return { vorname: worte[0] || '', nachname: worte.slice(1).join(' ') };
  }

  // Zerlegt eine eingefügte Namensliste in {vorname, nachname}-Objekte.
  // Komma UND Zeilenumbruch trennen dabei IMMER einzelne Personen
  // voneinander — egal ob eine reine Vornamen-Liste mit Kommas
  // aneinandergereiht ("Max, Lena, Tom, Anna", auf einer oder über
  // mehrere Zeilen verteilt) oder eine Liste mit vollständigen Namen
  // ("Max Meier, Lena Schmidt" bzw. je einer pro Zeile) eingefügt wird.
  // Die umgekehrte Reihenfolge "Nachname, Vorname" wird bewusst NICHT
  // gesondert erkannt, da sie sich nicht zuverlässig von zwei durch
  // Komma getrennten Vornamen unterscheiden lässt — stattdessen einfach
  // "Vorname Nachname" schreiben, oder den Nachnamen nach dem Einlesen
  // direkt in der Tabelle ergänzen.
  function parseNameList(text) {
    const cleanToken = (t) => t.replace(/^\s*(?:\d{1,3}[.)]|[-•*])\s*/, '').trim();
    return (text || '')
      .split(/\r?\n|,/)
      .map(cleanToken)
      .filter(Boolean)
      .map(parseNameToken)
      .filter((s) => s.vorname);
  }

  return {
    KATEGORIEN,
    PRIORITAETEN,
    parseTranscript,
    parseNameList,
    gradeToNumber,
  };
})();
