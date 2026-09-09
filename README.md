# Digitales Klassenbuch

Eine Web-App zum Diktieren von Noten und Unterrichtsbeobachtungen per Mikrofon
– mit Excel-Export, Suche, Notendurchschnitten und einem Frühwarnsystem.
Läuft als installierbare App (PWA) auf **iPhone, iPad und Mac** und
synchronisiert Einträge geräteübergreifend in Echtzeit über ein eigenes,
kostenloses Firebase-Projekt.

Die App setzt die weiter unten dokumentierte ursprüngliche
Projektanweisung ("Digitales Klassenbuch") technisch um.

## Funktionen

- 🎙️ **Diktierfunktion**: Beobachtungen frei per Mikrofon diktieren (Web
  Speech API), Schüler werden dabei über ihren **Vornamen** angesprochen
  (z. B. „Max Hausaufgaben vergessen"); ein heuristischer Parser gleicht
  gesprochene Namen gegen die hinterlegte Klassenliste ab und zerlegt den
  Text automatisch in einzelne Einträge (Schüler, Kategorie, Note,
  Positiv/Negativ, Priorität) — **immer zur Kontrolle in einer editierbaren
  Tabelle**, bevor gespeichert wird. Gibt es zwei Kinder mit demselben
  Vornamen, zusätzlich den Nachnamen nennen (z. B. „Max Meier") oder in der
  Review-Tabelle per Auswahlliste auflösen. Klassen ohne hinterlegte Liste
  funktionieren weiterhin mit diktierten Nummern.
- 📋 **Alle Einträge**: Volltextsuche + Filter (Klasse, Fach, Kategorie,
  Priorität, Typ, Zeitraum), Inline-Bearbeitung, Löschen.
- 📊 **Auswertungen**: Gesamtdurchschnitt und Durchschnitt für einen frei
  wählbaren Zeitraum, aufgeschlüsselt nach Notenbereich (Referat, Klausur,
  Test, Sonstige Mitarbeit), Schülerprofile mit chronologischem Bericht
  (kopierbar, z. B. für Elternsprechtage/Zeugnisse).
- ⚠️ **Frühwarnsystem**: erkennt automatisch wiederkehrende Muster —
  mehrfach vergessene Hausaufgaben/Material, häufige Unterrichtsstörungen,
  auffällige Häufung negativer Einträge, deutlichen Leistungsabfall oder
  eine deutliche Leistungsverbesserung. Schwellenwerte einstellbar.
- ⇅ **Excel-Export/-Import**: immer als `.xlsx`, feste Spaltenstruktur
  (Datum, Klasse, Fach, Schüler, Kategorie, Beschreibung, Note,
  Positiv/Negativ, Priorität). Mehrere exportierte Tabellen lassen sich
  über die mitgeführte ID wieder verlustfrei zu einem Bestand
  zusammenführen.
- 👥 **Klassenlisten**: Vorname/Nachname pro Klasse direkt in der App
  pflegen (Tab „Klassenlisten") — einzeln oder per **Listen-Import**.
  Unterstützt sowohl „Nachname, Vorname" (eine Person pro Zeile, z. B.
  aus einer Kursliste kopiert) als auch reine Vornamen-Listen, die einfach
  mit Kommas aneinandergereiht sind (z. B. „Max, Lena, Tom, Anna") — auf
  einer oder über mehrere Zeilen verteilt. Diese Liste ist die
  Grundlage für die namensbasierte Diktierfunktion und wird außerdem in
  Tabellen, Auswertungen, Frühwarnsystem, Zusammenfassung, Bericht und
  optional im Excel-Export angezeigt.
- 🔄 **Synchronisation**: Cloud Firestore mit Offline-Cache — Einträge
  lassen sich auch ohne Internet erfassen (z. B. im Klassenzimmer) und
  synchronisieren automatisch, sobald wieder eine Verbindung besteht.
- 🔒 **Datenschutz**: Die App erfindet nie Informationen. Klassenlisten
  und Vornamen werden ausschließlich in deinem **eigenen**, privaten
  Firebase-Projekt gespeichert (nicht bei Anthropic/Claude oder einem
  gemeinsamen Server) und trägst du direkt in der App ein — Namen laufen
  nie durch eine Konversation mit Claude. Wer lieber bei der ursprünglich
  vorgesehenen Nummern-Diktion ohne Klarnamen bleiben möchte, lässt den
  Tab „Klassenlisten" für die betreffende Klasse einfach leer.

## Einrichtung (einmalig, ca. 5–10 Minuten)

Die App braucht ein eigenes, kostenloses Firebase-Projekt (Google,
Spark-Plan, keine Kreditkarte nötig), damit deine Daten zwischen iPhone,
iPad und Mac synchronisieren. Zugangsdaten werden **nicht** im Code/Repo
gespeichert, sondern einmal in der App eingegeben.

1. Gehe zu [console.firebase.google.com](https://console.firebase.google.com)
   und erstelle ein neues Projekt.
2. Klicke auf das Web-Symbol `</>`, um eine Web-App zu registrieren. Du
   bekommst einen Code-Block mit `firebaseConfig = { ... }` — kopiere ihn.
3. **Build → Authentication → Sign-in method** → „E-Mail/Passwort“
   aktivieren.
4. **Build → Firestore Database → Datenbank erstellen** (Region z. B.
   `eur3`/Frankfurt), Start im Produktionsmodus.
5. Unter **Firestore → Regeln** folgendes eintragen und veröffentlichen:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
   (Die Regel gilt pauschal für alle Unter-Sammlungen unter `users/{uid}`
   — also sowohl die Einträge als auch die Klassenlisten — und muss bei
   künftigen Erweiterungen nicht erneut angepasst werden.)
6. App öffnen, Code-Block einfügen, Konto per E-Mail/Passwort anlegen.
7. Auf jedem weiteren Gerät (iPhone/iPad/Mac): App öffnen, denselben
   Code-Block einfügen, mit **denselben Zugangsdaten** anmelden.

Die App führt durch alle Schritte auch direkt im Einrichtungsbildschirm.

> **Bereits eingerichtet?** Falls du dein Firebase-Projekt schon mit der
> alten, engeren Regel (nur `entries`) angelegt hast, aktualisiere sie
> einmalig unter **Firestore → Regeln** auf die obige Fassung, damit die
> neue Klassenlisten-Funktion (siehe unten) ebenfalls gespeichert werden
> kann.

## Nutzung

- **Lokal starten**: In diesem Ordner einen einfachen Webserver starten,
  z. B. `python3 -m http.server 8000` oder `npx serve .`, dann im Browser
  öffnen (Spracherkennung/Mikrofon benötigt eine sichere Herkunft —
  `http://localhost` funktioniert, `file://` nicht zuverlässig).
- **Hosten**: Die App besteht nur aus statischen Dateien (HTML/CSS/JS) und
  lässt sich z. B. über GitHub Pages, Netlify, Vercel oder Firebase
  Hosting kostenlos bereitstellen.
- **Auf dem iPhone/iPad installieren**: Seite in Safari öffnen → Teilen →
  „Zum Home-Bildschirm“. Auf dem Mac: in Safari/Chrome über das
  Installieren-Symbol in der Adressleiste.
- **Browser-Hinweis**: Die Spracherkennung (Mikrofon-Diktat direkt in der
  App) funktioniert zuverlässig in Chrome/Edge. In Safari (iPhone/iPad/
  Mac) gibt es keine unterstützte Web-Speech-API — dort einfach die
  Mikrofon-Taste der System-Tastatur nutzen, um in das Textfeld zu
  diktieren, oder Text eintippen; der Parser arbeitet danach identisch.

## Grenzen des Diktat-Parsers

Der Parser arbeitet **regelbasiert** (Mustererkennung), nicht mit
echtem Sprachverständnis. Er ordnet Schüler, Kategorien und Noten nach
festen Regeln zu (z. B. „5, 11, 19 Hausaufgaben vergessen“ → drei
Einträge). Namen werden **ausschließlich** gegen die hinterlegte
Klassenliste abgeglichen — kein Raten anhand von Großschreibung, da im
Deutschen auch normale Substantive großgeschrieben werden. Ist ein
Vorname in der Klasse mehrfach vergeben und lässt sich auch über den
mitgesprochenen Nachnamen nicht eindeutig auflösen, wird der Eintrag als
unsicher markiert und in der Review-Tabelle per Auswahlliste aufgelöst.
Deshalb werden erkannte Einträge **immer** erst in einer editierbaren
Tabelle angezeigt, bevor sie gespeichert werden — unsicher zugeordnete
Zeilen sind farblich markiert. Klasse, Fach und Datum werden bewusst
**nicht** aus dem Diktat geraten, sondern oben im Formular gesetzt —
das macht die Erkennung der eigentlichen Beobachtungen deutlich
zuverlässiger.

## Technik

Reine Client-Web-App ohne Build-Tool (HTML/CSS/Vanilla-JS):

- `index.html`, `css/style.css` — Oberfläche
- `js/parser.js` — Diktat-Parser
- `js/stats.js` — Durchschnitte, Schülerprofile
- `js/warnings.js` — Frühwarnsystem
- `js/exportImport.js` — Excel-Export/-Import ([SheetJS](https://sheetjs.com), lokal eingebunden, Apache-2.0)
- `js/speech.js` — Web-Speech-API-Anbindung
- `js/firebaseSync.js` — Firebase-Auth/Firestore-Synchronisation
- `js/store.js` — Zugriffsschicht/Cache über den Einträgen
- `js/app.js` — UI-Logik
- `manifest.json`, `sw.js`, `icons/` — PWA (installierbar, Offline-App-Hülle)

## Datenschutz

Die App fügt nie Informationen hinzu, die nicht diktiert/eingegeben
wurden. Verwende wie in der Projektanweisung vorgesehen Schülernummern
statt Klarnamen. Deine Daten liegen ausschließlich in deinem eigenen
Firebase-Projekt (wähle bei der Einrichtung einen Standort in der EU,
z. B. Frankfurt) und werden durch Firestore-Sicherheitsregeln + Anmeldung
geschützt — niemand außer dir hat Zugriff.

---

## Ursprüngliche Projektanweisung

Die App wurde nach folgender, ursprünglich für eine Konversation mit
Claude formulierten Anweisung gebaut:

> ### Digitales Klassenbuch
>
> **Rolle**
>
> Du bist mein persönlicher Assistent für die Unterrichtsdokumentation.
> Ich bin Lehrer und werde dir nach Unterrichtsstunden meine Beobachtungen
> frei diktieren. Deine Aufgabe ist es, daraus eine strukturierte und
> übersichtliche Dokumentation zu erstellen. Arbeite präzise und ergänze
> niemals Informationen, die ich nicht genannt habe.
>
> **Spracheingaben**
>
> Ich werde frei sprechen. Die Reihenfolge der Informationen ist beliebig.
> Statt Klarnamen werde ich voraussichtlich Nummern nennen. Beispielsweise:
> „9a Deutsch. Heute. 17 zweimal dazwischengerufen. 5, 11, 19 Hausaufgaben
> vergessen. 5 Referat zwei plus. 2 sehr gute Mitarbeit, 25 Note 4, 21 Note
> 2, 9 Note 3. 23 Tablet vergessen.“ Erkenne automatisch Datum (sonst
> heutiges Datum), Klasse, Fach, Schülerkürzel, Kategorie, Beschreibung,
> Noten sowie positive/negative Beobachtungen. Frage nur nach, wenn
> wesentliche Angaben fehlen.
>
> **Kategorien**: Mitarbeit, Verhalten, Hausaufgaben, Material, Tablet,
> Referat, Klausur, Test, Mündliche Leistung, Sozialverhalten, Lob,
> Gespräch, Organisatorisches, Sonstiges.
>
> **Priorität**: 🟢 Positiv, ⚪ Neutral, 🟠 Beobachtungswürdig, 🔴 Dringend.
>
> **Noten**: automatisch den Bereichen Referat, Klausur, Test/Diktat,
> Sonstige Mitarbeit bzw. Gruppenarbeit zuordnen.
>
> **Ausgabe nach jeder Unterrichtsstunde**: Zusammenfassung mit Datum,
> Klasse, Fach, Positive Beobachtungen, Auffälligkeiten, Noten,
> Organisatorisches. Anschließend eine Tabelle (immer derselbe Dateityp):
> `Datum | Klasse | Fach | Schüler | Kategorie | Beschreibung | Note |
> Positiv/Negativ | Priorität`.
>
> **Langfristige Dokumentation**: immer dieselbe Struktur/Kategorien,
> damit sich Tabellen später problemlos zusammenführen lassen.
>
> **Auswertungen** (auf Wunsch, über mehrere Dokumentationen hinweg):
> chronologische Übersichten, Statistiken, Notenübersichten,
> Schülerprofile, Zusammenfassungen, Berichte für Elternsprechtage,
> Übersichten für Zeugnisse.
>
> **Frühwarnsystem**: auf wiederkehrende Muster achten — mehrfach
> vergessene Hausaufgaben/Material, häufige Unterrichtsstörungen,
> auffällig viele negative Einträge, deutliche Leistungsverbesserung oder
> Leistungsabfall, besonders positive Entwicklungen — und darauf
> hinweisen.
>
> **Datenschutz**: voraussichtlich Nummern statt Klarnamen; nie
> personenbezogene Informationen ergänzen, die nicht genannt wurden.
>
> **Stil**: sachlich, übersichtlich, gut lesbar, keine langen Fließtexte,
> klare Überschriften, Tabellen und Stichpunkte. Bei jeder neuen
> Unterrichtsdokumentation nach diesem Schema arbeiten.
