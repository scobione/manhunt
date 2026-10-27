# Abnahmebericht MANHUNT b.0.69.48

Stand: 27.10.2026. Öffentliche Anwendung: https://manhunt-pwa.vercel.app. Die alte Sites-Adresse ist als Weiterleitung veröffentlicht und im Browser geprüft.

**134 geforderte Akzeptanztests: 126 BESTANDEN, 0 FEHLGESCHLAGEN, 8 BLOCKIERT, 0 NICHT AUSGEFÜHRT.** Eine vollständige Endabnahme liegt wegen der blockierten Tests nicht vor.

## Aussagekraft

BESTANDEN bezeichnet den angegebenen tatsächlich ausgeführten Test und dessen Umfang. Engine-/API-Tests benutzen isolierte Testidentitäten, Zeit und GPS; PostgreSQL-Tests führen die Migrationen in PGlite mit testweisen Supabase-Auth-/Storage-Verträgen aus. Lokale Auth-Browsertests verwenden ausdrücklich simulierte Anbieterantworten. Dies sind keine Nachweise echter E-Mail-Zustellung oder physischer Ortung.

Echte Integration: öffentliche Vercel-Seiten, drei getrennte Browser mit echten anonymen Supabase-Konten in einer privaten QA-Lobby, Teamchat, veröffentlichter Testpin, Zombie-Wechsel, Host-Pause/Fortsetzen/Ende, Kontolöschung und serverseitig deaktiviertes Google. Die Host-Lobby war eine ausdrücklich angelegte Testfixture. Reale registrierte Host-Erstellung und E-Mail-Einlösung werden dadurch nicht behauptet. Alle eigens angelegten Testkonten wurden entfernt; bestehende Benutzerkonten wurden erhalten.

Simulierte GPS-Koordinaten wurden ausschließlich in automatisierten, gekennzeichneten Tests verwendet. Bei XP-Wegpunkten fehlt ein positiver Live-Nachweis: die externe Abfrage lieferte keinen sicheren Kandidaten. Die App erzeugt dann keinen ungeprüften Ersatzpunkt.

190 Unit-/Integrationstests und 52 verschiedene lokale Browserfälle sind bestanden: 8 Socket.IO, 22 Edge, 18 Oberfläche/Auth und 4 Weiterleitung. Der vollständige 22er-Edge-Lauf einschließlich Offline-XP-Wiederverbindung ist bestanden. Zusätzlich bestanden 4 öffentliche Produktionstests, 4 veröffentlichte Weiterleitungstests und zwei Navigationen mit echter Wartezeit/echtem Ziel. Mobile Viewports ersetzen keine Geräteprüfung. [Rohzusammenfassung](verification-b.0.69.48.json); [maschinenlesbare Testmatrix](acceptance-b.0.69.48.json).

Der vollständige [GitHub-CI-Lauf des App-Codes](https://github.com/scobione/manhunt/actions/runs/40458432717) und der [öffentliche CI-Browserlauf](https://github.com/scobione/manhunt/actions/runs/40458432815) sind erfolgreich. Der danach ergänzte öffentliche QR-Regressionstest wurde zusätzlich lokal und auf Vercel ausgeführt. App-Code: `d7c725407287e2862cfee0fc8f3804aa784f31ab`; spätere Dokumentationsänderungen verändern das Produktverhalten nicht.

## Behobene Fehler während der Prüfung

- Auth-Kontolöschung scheiterte beim internen Revisionstrigger: minimale Rechte für die echte Auth-Serverrolle ergänzt, RLS beibehalten; Live-Löschung und anschließendes 401 geprüft.
- Zwei neue Tests verwendeten einen privaten TypeScript-Zugriff; auf die öffentliche Engine-Schnittstelle korrigiert.
- Zu schmale mobile Regler: Einstellungsraster auf Mobilgeräten einspaltig; echte Touchscreen-Eingabe in Chromium geprüft.
- GitHub-Publikationstest lief vor dem Deployment: erwartet jetzt die veröffentlichte Versionsnummer, bevor er die Seite prüft.
- Zwei unterschiedliche mobile QR-Screenshot-Raster verursachten Decoderfehler in GitHub CI. Die erste reine Skalierungskorrektur reichte für dichte Fangcodes nicht aus. QR-Darstellung auf SVG umgestellt, begrenzte lokale Pixelauswertung mit zweitem Decoder ergänzt. Beide konkreten Fehlerbilder, neun wiederholte QR-Browserfälle und der vollständige Edge-Lauf bestanden. Ein alter Fremdmatch-Code bleibt abgewiesen. Der zusätzliche öffentliche Scanner-Test bestand auch auf Vercel ohne Anlage eines Kontos.
- Lokale Sandbox ohne Loopback-Netzfreigabe verhinderte zuerst 16 API-Tests; nach korrekter Umgebung alle bestanden. Ein Mehrbrowserlauf überschritt unter paralleler Last sein Zeitlimit; separater Lauf und abschließender Gesamt-Edge-Lauf bestanden. Diese früheren Fehlläufe sind nicht als verschwundene Produktfehler gezählt.

## Einzelergebnisse

### MODE-01 — Normal

- **Voraussetzungen:** Isolierte Engine; für MODE-08/-10 drei Browser mit Testkonten.
- **Schritte:** Normal wählen; bereit melden; starten.
- **Erwartet:** Match aktiv; Fang eliminiert Hider.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### MODE-02 — Zombie

- **Voraussetzungen:** Isolierte Engine; für MODE-08/-10 drei Browser mit Testkonten.
- **Schritte:** Zombie einschalten; Hider fangen.
- **Erwartet:** Infektion statt Ausscheiden.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### MODE-03 — Apokalypse

- **Voraussetzungen:** Isolierte Engine; für MODE-08/-10 drei Browser mit Testkonten.
- **Schritte:** Apokalypse einschalten; Phasenzeit vorziehen.
- **Erwartet:** Zone wird kleiner.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### MODE-04 — Zombie + Apokalypse

- **Voraussetzungen:** Isolierte Engine; für MODE-08/-10 drei Browser mit Testkonten.
- **Schritte:** Beide Regeln einschalten; fangen; Phase auslösen.
- **Erwartet:** Infektion und Schrumpfen funktionieren zusammen.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### MODE-05 — XP-Jagd + Zombie

- **Voraussetzungen:** Isolierte Engine; für MODE-08/-10 drei Browser mit Testkonten.
- **Schritte:** XP und Zombie aktivieren; starten; fangen.
- **Erwartet:** XP-Ziel aktiv; gefangener Hider infiziert.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### MODE-06 — XP-Jagd + Apokalypse

- **Voraussetzungen:** Isolierte Engine; für MODE-08/-10 drei Browser mit Testkonten.
- **Schritte:** XP und Apokalypse aktivieren; Phase auslösen.
- **Erwartet:** XP bleibt aktiv; Zone schrumpft.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### MODE-07 — Alle Module

- **Voraussetzungen:** Isolierte Engine; für MODE-08/-10 drei Browser mit Testkonten.
- **Schritte:** Alle Module aktivieren; fangen; Phase auslösen; wiederherstellen.
- **Erwartet:** Regeln gleichzeitig aktiv und erhalten.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### MODE-08 — Regelsynchronisierung

- **Voraussetzungen:** Isolierte Engine; für MODE-08/-10 drei Browser mit Testkonten.
- **Schritte:** Host ändert Regeln; zweiten Browser ohne Reload beobachten.
- **Erwartet:** Neue Kombination erscheint bei Mitspielern.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### MODE-09 — Ungültige Kombination

- **Voraussetzungen:** Isolierte Engine; für MODE-08/-10 drei Browser mit Testkonten.
- **Schritte:** Widersprüchliches Team-Hunt/Last-Survivor-Preset senden.
- **Erwartet:** Server lehnt ab.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### MODE-10 — Zombie-Teamwechsel

- **Voraussetzungen:** Isolierte Engine; für MODE-08/-10 drei Browser mit Testkonten.
- **Schritte:** Fangen; geschützte Daten prüfen; Infektion per Swipe bestätigen.
- **Erwartet:** Hider-Zugriff sofort weg; Hunter-Zugriff nach Bestätigung.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### MODE-11 — Phasenschrumpfung

- **Voraussetzungen:** Isolierte Engine; für MODE-08/-10 drei Browser mit Testkonten.
- **Schritte:** Serveruhr über Phasengrenze setzen; Fläche messen.
- **Erwartet:** Fläche sinkt gemäß Regel.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### MODE-12 — Persistente Modi

- **Voraussetzungen:** Isolierte Engine; für MODE-08/-10 drei Browser mit Testkonten.
- **Schritte:** Checkpoint wiederherstellen; Browser neu laden.
- **Erwartet:** Regeln und Phase erhalten.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### XPJ-01 — Punkt innerhalb Zone

- **Voraussetzungen:** Isolierte Engine/HTTP-Testserver; synthetische GPS- und OSM-Daten, soweit nicht ausdrücklich Live.
- **Schritte:** Kandidaten prüfen; Match starten.
- **Erwartet:** Aktiver Punkt innerhalb Spielzone.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### XPJ-02 — Sperrzonen

- **Voraussetzungen:** Isolierte Engine/HTTP-Testserver; synthetische GPS- und OSM-Daten, soweit nicht ausdrücklich Live.
- **Schritte:** Kandidat in Sperrzone übergeben.
- **Erwartet:** Kandidat verworfen.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### XPJ-03 — Sicherheitsabstände

- **Voraussetzungen:** Isolierte Engine/HTTP-Testserver; synthetische GPS- und OSM-Daten, soweit nicht ausdrücklich Live.
- **Schritte:** Kandidaten nahe Rand und Sperrzone prüfen.
- **Erwartet:** Sammelradius plus Sicherheitsabstände eingehalten.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### XPJ-04 — Echte Wegdaten

- **Voraussetzungen:** Isolierte Engine/HTTP-Testserver; synthetische GPS- und OSM-Daten, soweit nicht ausdrücklich Live.
- **Schritte:** OSM-Fußwege und Gefahren filtern; externen Abruf versuchen.
- **Erwartet:** Erreichbarkeit geprüft oder Hostbestätigung erforderlich.
- **Tatsächlich:** OSM-Fixture-Tests bestanden. Produktionsabfrage lieferte keinen sicheren Kandidaten; XP-Jagd zeigte die vorgesehene Fehlermeldung. Ein positiver Live-Nachweis fehlt.
- **Status:** BLOCKIERT
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** Kein sicherer Fußwegpunkt verfügbar.

### XPJ-05 — Außerhalb Radius

- **Voraussetzungen:** Isolierte Engine/HTTP-Testserver; synthetische GPS- und OSM-Daten, soweit nicht ausdrücklich Live.
- **Schritte:** Hider außerhalb Radius sammeln lassen.
- **Erwartet:** TOO_FAR; Fortschritt unverändert.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### XPJ-06 — Sammeln im Radius

- **Voraussetzungen:** Isolierte Engine/HTTP-Testserver; synthetische GPS- und OSM-Daten, soweit nicht ausdrücklich Live.
- **Schritte:** Host bestätigt; zuverlässige frische Hider-Ortung; sammeln.
- **Erwartet:** Genau ein Punkt gezählt.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### XPJ-07 — Hunter blockieren

- **Voraussetzungen:** Isolierte Engine/HTTP-Testserver; synthetische GPS- und OSM-Daten, soweit nicht ausdrücklich Live.
- **Schritte:** Hunter innerhalb Radius sammelt.
- **Erwartet:** INVALID_ROLE.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### XPJ-08 — Doppelte Sammlung

- **Voraussetzungen:** Isolierte Engine/HTTP-Testserver; synthetische GPS- und OSM-Daten, soweit nicht ausdrücklich Live.
- **Schritte:** Alte Punkt-ID erneut senden.
- **Erwartet:** STALE_POINT; kein zweites Zählen.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### XPJ-09 — Folgepunkt

- **Voraussetzungen:** Isolierte Engine/HTTP-Testserver; synthetische GPS- und OSM-Daten, soweit nicht ausdrücklich Live.
- **Schritte:** Punkt sammeln; aktuellen Zielzustand prüfen.
- **Erwartet:** Genau ein neuer aktiver Punkt.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### XPJ-10 — Teamfortschritt

- **Voraussetzungen:** Isolierte Engine/HTTP-Testserver; synthetische GPS- und OSM-Daten, soweit nicht ausdrücklich Live.
- **Schritte:** Hider sammelt; anderer Hider synchronisiert.
- **Erwartet:** Gleicher Fortschritt.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### XPJ-11 — Zielsieg

- **Voraussetzungen:** Isolierte Engine/HTTP-Testserver; synthetische GPS- und OSM-Daten, soweit nicht ausdrücklich Live.
- **Schritte:** Konfigurierte Zielanzahl sammeln.
- **Erwartet:** Server beendet mit Hider-Sieg.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### XPJ-12 — Alle gefangen

- **Voraussetzungen:** Isolierte Engine/HTTP-Testserver; synthetische GPS- und OSM-Daten, soweit nicht ausdrücklich Live.
- **Schritte:** Alle Hider im Zombie-XP-Match fangen.
- **Erwartet:** Hunter/Infizierte gewinnen.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### XPJ-13 — Timer ohne Sieger

- **Voraussetzungen:** Isolierte Engine/HTTP-Testserver; synthetische GPS- und OSM-Daten, soweit nicht ausdrücklich Live.
- **Schritte:** Matchuhr ablaufen lassen.
- **Erwartet:** Unentschieden als Standard.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### XPJ-14 — Schrumpfung ersetzt Ziel

- **Voraussetzungen:** Isolierte Engine/HTTP-Testserver; synthetische GPS- und OSM-Daten, soweit nicht ausdrücklich Live.
- **Schritte:** Äußeres Ziel aktivieren; Zone schrumpfen.
- **Erwartet:** Ungültiges Ziel ersetzt; Fortschritt erhalten.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### XPJ-15 — Infizierter sammelt nicht

- **Voraussetzungen:** Isolierte Engine/HTTP-Testserver; synthetische GPS- und OSM-Daten, soweit nicht ausdrücklich Live.
- **Schritte:** Hider fangen; Sammelbefehl senden.
- **Erwartet:** INVALID_ROLE; Fortschritt unverändert.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### XPJ-16 — Host regeneriert

- **Voraussetzungen:** Isolierte Engine/HTTP-Testserver; synthetische GPS- und OSM-Daten, soweit nicht ausdrücklich Live.
- **Schritte:** Host und Nicht-Host regenerieren lassen.
- **Erwartet:** Nur Host darf; neuer gültiger Punkt oder klare Fehlermeldung.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### XPJ-17 — Keine sicheren Punkte

- **Voraussetzungen:** Isolierte Engine/HTTP-Testserver; synthetische GPS- und OSM-Daten, soweit nicht ausdrücklich Live.
- **Schritte:** Kandidatenliste leeren; regenerieren.
- **Erwartet:** Kein unsicherer Ersatz; Fehlermeldung.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### XPJ-18 — Manipulation und Parallelität

- **Voraussetzungen:** Isolierte Engine/HTTP-Testserver; synthetische GPS- und OSM-Daten, soweit nicht ausdrücklich Live.
- **Schritte:** Ungültige Rolle/alte ID senden; zwei Hider gleichzeitig sammeln.
- **Erwartet:** Nur ein HTTP-Commit; kein doppelter Punkt.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### LEVEL-01 — Gültige XP-Vergabe

- **Voraussetzungen:** Alle Migrationen in isoliertem PostgreSQL/PGlite; registrierte und anonyme Testidentitäten.
- **Schritte:** Qualifizierten Matchabschluss speichern.
- **Erwartet:** Server schreibt XP und Statistik.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/database.test.ts; tests/acceptance.test.ts
- **Fehler/Blocker:** —

### LEVEL-02 — Farming verhindern

- **Voraussetzungen:** Alle Migrationen in isoliertem PostgreSQL/PGlite; registrierte und anonyme Testidentitäten.
- **Schritte:** Kurze, abgebrochene, Gast- und wiederholte Matches speichern.
- **Erwartet:** Keine unberechtigten XP; Tages-/Matchlimit greift.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/database.test.ts; tests/acceptance.test.ts
- **Fehler/Blocker:** —

### LEVEL-03 — Idempotente Belohnung

- **Voraussetzungen:** Alle Migrationen in isoliertem PostgreSQL/PGlite; registrierte und anonyme Testidentitäten.
- **Schritte:** Denselben Abschluss zweimal schreiben; Account löschen.
- **Erwartet:** Belohnung nur einmal; Löschung vergibt keine XP neu.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/database.test.ts; tests/acceptance.test.ts
- **Fehler/Blocker:** —

### LEVEL-04 — Ab-/Anmeldung

- **Voraussetzungen:** Alle Migrationen in isoliertem PostgreSQL/PGlite; registrierte und anonyme Testidentitäten.
- **Schritte:** Mit realem E-Mail-Konto abmelden und erneut anmelden.
- **Erwartet:** Gleiche XP und Level.
- **Tatsächlich:** Persistenz/RLS in PostgreSQL bestanden; realer Anmeldezyklus mit Postfach nicht ausgeführt.
- **Status:** BLOCKIERT
- **Nachweis:** tests/database.test.ts; tests/acceptance.test.ts
- **Fehler/Blocker:** Persistenz/RLS in PostgreSQL bestanden; realer Anmeldezyklus mit Postfach nicht ausgeführt.

### LEVEL-05 — Levelaufstieg

- **Voraussetzungen:** Alle Migrationen in isoliertem PostgreSQL/PGlite; registrierte und anonyme Testidentitäten.
- **Schritte:** 0 und 100 XP auswerten.
- **Erwartet:** Level 1 bzw. 2.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/database.test.ts; tests/acceptance.test.ts
- **Fehler/Blocker:** —

### LEVEL-06 — Levelanzeige

- **Voraussetzungen:** Alle Migrationen in isoliertem PostgreSQL/PGlite; registrierte und anonyme Testidentitäten.
- **Schritte:** 250 XP auswerten; Profilbalken prüfen.
- **Erwartet:** 50 Prozent bis Level 3.
- **Tatsächlich:** Isoliertes Profil mit 250 Account-XP zeigt Level 2, 150 verbleibende XP und 50 Prozent.
- **Status:** BESTANDEN
- **Nachweis:** tests/database.test.ts; tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### LEVEL-07 — Getrennte XP-Systeme

- **Voraussetzungen:** Alle Migrationen in isoliertem PostgreSQL/PGlite; registrierte und anonyme Testidentitäten.
- **Schritte:** Matchziel und Accountkurve unabhängig auswerten.
- **Erwartet:** Keine Vermischung der Zähler.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/database.test.ts; tests/acceptance.test.ts
- **Fehler/Blocker:** —

### LEVEL-08 — Profilstatistik

- **Voraussetzungen:** Alle Migrationen in isoliertem PostgreSQL/PGlite; registrierte und anonyme Testidentitäten.
- **Schritte:** Gültigen Abschluss und Duplikat schreiben; Statistik lesen.
- **Erwartet:** Teilnahme/Siege/Fänge/Punkte einmal korrekt erhöht.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/database.test.ts; tests/acceptance.test.ts
- **Fehler/Blocker:** —

### ZONE-01 — Kreissperrzone

- **Voraussetzungen:** Mobiler Chromium-Testbrowser, isolierte API und synthetische GPS-Koordinaten.
- **Schritte:** Kreis im Editor anlegen.
- **Erwartet:** Sperrzone sichtbar und speicherbar.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/zones-browser.spec.ts; tests/acceptance.test.ts; tests/gps-safety.spec.ts
- **Fehler/Blocker:** —

### ZONE-02 — Vierecksperrzone

- **Voraussetzungen:** Mobiler Chromium-Testbrowser, isolierte API und synthetische GPS-Koordinaten.
- **Schritte:** Viereck im Editor anlegen.
- **Erwartet:** Vier Ecken; speicherbar.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/zones-browser.spec.ts; tests/acceptance.test.ts; tests/gps-safety.spec.ts
- **Fehler/Blocker:** —

### ZONE-03 — Polygonsperrzone

- **Voraussetzungen:** Mobiler Chromium-Testbrowser, isolierte API und synthetische GPS-Koordinaten.
- **Schritte:** Freie Eckpunkte setzen; schließen.
- **Erwartet:** Polygon gespeichert.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/zones-browser.spec.ts; tests/acceptance.test.ts; tests/gps-safety.spec.ts
- **Fehler/Blocker:** —

### ZONE-04 — Bearbeiten/Verschieben/Löschen

- **Voraussetzungen:** Mobiler Chromium-Testbrowser, isolierte API und synthetische GPS-Koordinaten.
- **Schritte:** Ecke bearbeiten; ganze Zone verschieben; löschen.
- **Erwartet:** Geometrie aktualisiert; gelöschte Zone entfernt.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/zones-browser.spec.ts; tests/acceptance.test.ts; tests/gps-safety.spec.ts
- **Fehler/Blocker:** —

### ZONE-05 — Aktivieren/Deaktivieren

- **Voraussetzungen:** Mobiler Chromium-Testbrowser, isolierte API und synthetische GPS-Koordinaten.
- **Schritte:** Sperrzone ausschalten und wieder einschalten.
- **Erwartet:** Status erhalten und validiert.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/zones-browser.spec.ts; tests/acceptance.test.ts; tests/gps-safety.spec.ts
- **Fehler/Blocker:** —

### ZONE-06 — 30 Sperrzonen

- **Voraussetzungen:** Mobiler Chromium-Testbrowser, isolierte API und synthetische GPS-Koordinaten.
- **Schritte:** 30 Zonen laden/anlegen.
- **Erwartet:** Alle 30 akzeptiert.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/zones-browser.spec.ts; tests/acceptance.test.ts; tests/gps-safety.spec.ts
- **Fehler/Blocker:** —

### ZONE-07 — 31. Sperrzone

- **Voraussetzungen:** Mobiler Chromium-Testbrowser, isolierte API und synthetische GPS-Koordinaten.
- **Schritte:** Weitere Zone hinzufügen; API mit 31 senden.
- **Erwartet:** UI und Server verhindern 31.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/zones-browser.spec.ts; tests/acceptance.test.ts; tests/gps-safety.spec.ts
- **Fehler/Blocker:** —

### ZONE-08 — Sperrzonen live synchron

- **Voraussetzungen:** Mobiler Chromium-Testbrowser, isolierte API und synthetische GPS-Koordinaten.
- **Schritte:** Host ändert Sperrzone; zweiten Browser beobachten.
- **Erwartet:** Geometrie ohne Reload aktualisiert.
- **Tatsächlich:** Zweiter Browser zeigt neu hinzugefügte Sperrzone ohne Neuladen.
- **Status:** BESTANDEN
- **Nachweis:** tests/zones-browser.spec.ts; tests/acceptance.test.ts; tests/gps-safety.spec.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### ZONE-09 — Warnung bei Eintritt

- **Voraussetzungen:** Mobiler Chromium-Testbrowser, isolierte API und synthetische GPS-Koordinaten.
- **Schritte:** Zuverlässigen Punkt in Sperrzone senden.
- **Erwartet:** outsideActive; Vollbildwarnung.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/zones-browser.spec.ts; tests/acceptance.test.ts; tests/gps-safety.spec.ts
- **Fehler/Blocker:** —

### ZONE-10 — Countdown

- **Voraussetzungen:** Mobiler Chromium-Testbrowser, isolierte API und synthetische GPS-Koordinaten.
- **Schritte:** Weiter zuverlässige Außensamples senden.
- **Erwartet:** Serverzeit zählt ab.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/zones-browser.spec.ts; tests/acceptance.test.ts; tests/gps-safety.spec.ts
- **Fehler/Blocker:** —

### ZONE-11 — Rückkehr

- **Voraussetzungen:** Mobiler Chromium-Testbrowser, isolierte API und synthetische GPS-Koordinaten.
- **Schritte:** Zwei zuverlässige Innenmessungen senden.
- **Erwartet:** Warnzustand/Countdown endet bzw. Rückkehr kann bestätigt werden.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/zones-browser.spec.ts; tests/acceptance.test.ts; tests/gps-safety.spec.ts
- **Fehler/Blocker:** —

### ZONE-12 — Strafe nach Ablauf

- **Voraussetzungen:** Mobiler Chromium-Testbrowser, isolierte API und synthetische GPS-Koordinaten.
- **Schritte:** Außerhalb bleiben und zuverlässige Messungen senden.
- **Erwartet:** Server eliminiert nach Toleranz.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/zones-browser.spec.ts; tests/acceptance.test.ts; tests/gps-safety.spec.ts
- **Fehler/Blocker:** —

### ZONE-13 — GPS-Ungenauigkeit

- **Voraussetzungen:** Mobiler Chromium-Testbrowser, isolierte API und synthetische GPS-Koordinaten.
- **Schritte:** Ungenaue Messung zwischen Außensamples senden.
- **Erwartet:** Keine ungeprüfte Eliminierung oder Countdown-Reset.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/zones-browser.spec.ts; tests/acceptance.test.ts; tests/gps-safety.spec.ts
- **Fehler/Blocker:** —

### ZONE-14 — XP-Sperrzonen

- **Voraussetzungen:** Mobiler Chromium-Testbrowser, isolierte API und synthetische GPS-Koordinaten.
- **Schritte:** XP-Kandidat innerhalb aktiver Sperrzone prüfen.
- **Erwartet:** Kandidat abgelehnt.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/zones-browser.spec.ts; tests/acceptance.test.ts; tests/gps-safety.spec.ts
- **Fehler/Blocker:** —

### TEAM-01 — Hunter-Anzahl

- **Voraussetzungen:** Host und drei Testspieler; separate Browser für Synchronisierung.
- **Schritte:** Hunter-Anzahl einstellen und auslosen.
- **Erwartet:** Genau konfigurierte Hunter-Anzahl.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### TEAM-02 — Zufallsverteilung

- **Voraussetzungen:** Host und drei Testspieler; separate Browser für Synchronisierung.
- **Schritte:** Teams auslosen.
- **Erwartet:** Jeder Spieler genau eine Rolle.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### TEAM-03 — Neu auslosen

- **Voraussetzungen:** Host und drei Testspieler; separate Browser für Synchronisierung.
- **Schritte:** Auslosung erneut starten.
- **Erwartet:** Erneut gültige serverseitige Verteilung.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### TEAM-04 — Manuelle Rollen

- **Voraussetzungen:** Host und drei Testspieler; separate Browser für Synchronisierung.
- **Schritte:** Host weist Spielern Rollen zu.
- **Erwartet:** Rollen übernommen.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### TEAM-05 — Teamgrößen

- **Voraussetzungen:** Host und drei Testspieler; separate Browser für Synchronisierung.
- **Schritte:** Hunter/Hider nach Auslosung zählen.
- **Erwartet:** 1 Hunter und 3 Hider.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### TEAM-06 — Nur Host

- **Voraussetzungen:** Host und drei Testspieler; separate Browser für Synchronisierung.
- **Schritte:** Nicht-Host löst Teams aus.
- **Erwartet:** HOST_ONLY.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### TEAM-07 — Ungültige Teams

- **Voraussetzungen:** Host und drei Testspieler; separate Browser für Synchronisierung.
- **Schritte:** Nur Hider zuweisen; Spiel starten.
- **Erwartet:** INVALID_ROLES; kein Matchstart.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### TEAM-08 — Teams synchron

- **Voraussetzungen:** Host und drei Testspieler; separate Browser für Synchronisierung.
- **Schritte:** Rollen setzen; anderen Spielerzustand und Browser prüfen.
- **Erwartet:** Alle sehen gleiche Rollen.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### CHAT-01 — Hunter-Teamchat

- **Voraussetzungen:** Drei Browserrollen; Unit-Negativtests; Live-Prüfung mit echten anonymen Konten.
- **Schritte:** Hunter/Zombie senden und lesen.
- **Erwartet:** Nur berechtigte Hunter erhalten Nachricht.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### CHAT-02 — Hider-Teamchat

- **Voraussetzungen:** Drei Browserrollen; Unit-Negativtests; Live-Prüfung mit echten anonymen Konten.
- **Schritte:** Hider sendet; anderer Hider liest.
- **Erwartet:** Nachricht erscheint.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### CHAT-03 — Hunter liest keine Hider

- **Voraussetzungen:** Drei Browserrollen; Unit-Negativtests; Live-Prüfung mit echten anonymen Konten.
- **Schritte:** Hider-Geheimtext senden; Hunterzustand prüfen.
- **Erwartet:** Kein fremder Teamtext.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### CHAT-04 — Hider liest keine Hunter

- **Voraussetzungen:** Drei Browserrollen; Unit-Negativtests; Live-Prüfung mit echten anonymen Konten.
- **Schritte:** Huntertext senden; Hiderzustand prüfen.
- **Erwartet:** Kein fremder Teamtext.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### CHAT-05 — All-Chat

- **Voraussetzungen:** Drei Browserrollen; Unit-Negativtests; Live-Prüfung mit echten anonymen Konten.
- **Schritte:** All-Nachricht senden; beide Rollen lesen.
- **Erwartet:** Alle berechtigten Spieler sehen Nachricht.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### CHAT-06 — Echtzeit

- **Voraussetzungen:** Drei Browserrollen; Unit-Negativtests; Live-Prüfung mit echten anonymen Konten.
- **Schritte:** Zweiten Browser ohne Reload beobachten.
- **Erwartet:** Nachricht synchronisiert.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### CHAT-07 — Autor/Avatar/Zeit

- **Voraussetzungen:** Drei Browserrollen; Unit-Negativtests; Live-Prüfung mit echten anonymen Konten.
- **Schritte:** Chatzeile im Browser prüfen.
- **Erwartet:** Autor, Avatar und Zeit korrekt.
- **Tatsächlich:** Chatzeile enthält korrekten Namen, Avatar-Fallback und Zeitstempel.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts; scripts/check-live.mjs; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### CHAT-08 — Ungelesene

- **Voraussetzungen:** Drei Browserrollen; Unit-Negativtests; Live-Prüfung mit echten anonymen Konten.
- **Schritte:** Teamnachricht bei geschlossenem Tab empfangen; öffnen.
- **Erwartet:** Badge 1, danach 0.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### CHAT-09 — Wechselberechtigung

- **Voraussetzungen:** Drei Browserrollen; Unit-Negativtests; Live-Prüfung mit echten anonymen Konten.
- **Schritte:** Hider infizieren und bestätigen.
- **Erwartet:** Alter Teamtext entfernt; neuer Teamchat verfügbar.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### CHAT-10 — Stummschalten

- **Voraussetzungen:** Drei Browserrollen; Unit-Negativtests; Live-Prüfung mit echten anonymen Konten.
- **Schritte:** Host mutet Hider; Hider sendet.
- **Erwartet:** MUTED.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### CHAT-11 — Manipulierter Kanal

- **Voraussetzungen:** Drei Browserrollen; Unit-Negativtests; Live-Prüfung mit echten anonymen Konten.
- **Schritte:** Fremden Kanal im API-Befehl angeben.
- **Erwartet:** INVALID_INPUT; keine fremden Daten.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/expanded-browser.spec.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### MAP-01 — Hider sehen Hider

- **Voraussetzungen:** Getrennte Spielerzustände; synthetische Koordinaten nur im isolierten/privaten Testmatch.
- **Schritte:** Hider teilt GPS; Mitspieler synchronisiert.
- **Erwartet:** Eigener Hider-Teamkollege sichtbar.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/e2e.spec.ts; tests/gps-privacy.spec.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### MAP-02 — Hunter sehen Hunter

- **Voraussetzungen:** Getrennte Spielerzustände; synthetische Koordinaten nur im isolierten/privaten Testmatch.
- **Schritte:** Bestätigten Zombie und Hunter GPS teilen lassen.
- **Erwartet:** Hunter-Teamkollege sichtbar.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/e2e.spec.ts; tests/gps-privacy.spec.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### MAP-03 — Keine Gegner-Live-Daten

- **Voraussetzungen:** Getrennte Spielerzustände; synthetische Koordinaten nur im isolierten/privaten Testmatch.
- **Schritte:** Fremde Rolle synchronisiert vor Pinfreigabe.
- **Erwartet:** Kein unfreigegebener Gegnerstandort.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/e2e.spec.ts; tests/gps-privacy.spec.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### MAP-04 — Markerinformationen

- **Voraussetzungen:** Getrennte Spielerzustände; synthetische Koordinaten nur im isolierten/privaten Testmatch.
- **Schritte:** Teammarker ansehen.
- **Erwartet:** Avatar/Icon, Name und Aktualisierungszeit.
- **Tatsächlich:** Teammarker zeigt Name, Rollenfarbe, Zeitstempel und Genauigkeit im Popup.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/e2e.spec.ts; tests/gps-privacy.spec.ts; scripts/check-live.mjs; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### MAP-05 — GPS-Aktualisierung

- **Voraussetzungen:** Getrennte Spielerzustände; synthetische Koordinaten nur im isolierten/privaten Testmatch.
- **Schritte:** Neue zuverlässige Koordinate senden.
- **Erwartet:** Teamliveposition aktualisiert.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/e2e.spec.ts; tests/gps-privacy.spec.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### MAP-06 — Teamwechsel

- **Voraussetzungen:** Getrennte Spielerzustände; synthetische Koordinaten nur im isolierten/privaten Testmatch.
- **Schritte:** Infizieren; Sichtbarkeit vor/nach Swipe prüfen.
- **Erwartet:** Alte Teamdaten entzogen; neue Berechtigung korrekt.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/e2e.spec.ts; tests/gps-privacy.spec.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### MAP-07 — Standortstopp bei Ende

- **Voraussetzungen:** Getrennte Spielerzustände; synthetische Koordinaten nur im isolierten/privaten Testmatch.
- **Schritte:** Match beenden; verzögerte GPS-Antwort auslösen.
- **Erwartet:** Kein weiterer Standortversand.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/e2e.spec.ts; tests/gps-privacy.spec.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### MAP-08 — Nur mit Zustimmung

- **Voraussetzungen:** Getrennte Spielerzustände; synthetische Koordinaten nur im isolierten/privaten Testmatch.
- **Schritte:** Matchseite öffnen; erst später GPS zustimmen.
- **Erwartet:** Vor Zustimmung kein GPS-Watch/Versand.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/acceptance.test.ts; tests/e2e.spec.ts; tests/gps-privacy.spec.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### LOBBY-01 — Lobby erstellen

- **Voraussetzungen:** Isolierte Browser/Engine; Online-Gastmatch mit ausdrücklich serverseitig angelegter QA-Lobby.
- **Schritte:** Angemeldeter Testhost erstellt Lobby.
- **Erwartet:** Eindeutiger sechsstelliger Code.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/e2e.spec.ts; tests/edge-browser.spec.ts; tests/engine.test.ts; tests/acceptance.test.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### LOBBY-02 — Per Code beitreten

- **Voraussetzungen:** Isolierte Browser/Engine; Online-Gastmatch mit ausdrücklich serverseitig angelegter QA-Lobby.
- **Schritte:** Zweiter Browser gibt gültigen Code ein.
- **Erwartet:** Beitritt synchronisiert.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/e2e.spec.ts; tests/edge-browser.spec.ts; tests/engine.test.ts; tests/acceptance.test.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### LOBBY-03 — Ungültiger Code

- **Voraussetzungen:** Isolierte Browser/Engine; Online-Gastmatch mit ausdrücklich serverseitig angelegter QA-Lobby.
- **Schritte:** Unbekannten Code senden.
- **Erwartet:** Beitritt abgelehnt.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/e2e.spec.ts; tests/edge-browser.spec.ts; tests/engine.test.ts; tests/acceptance.test.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### LOBBY-04 — Bereitschaft

- **Voraussetzungen:** Isolierte Browser/Engine; Online-Gastmatch mit ausdrücklich serverseitig angelegter QA-Lobby.
- **Schritte:** Spieler meldet bereit; Host beobachtet.
- **Erwartet:** Status synchron.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/e2e.spec.ts; tests/edge-browser.spec.ts; tests/engine.test.ts; tests/acceptance.test.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### LOBBY-05 — Verbindungsstatus

- **Voraussetzungen:** Isolierte Browser/Engine; Online-Gastmatch mit ausdrücklich serverseitig angelegter QA-Lobby.
- **Schritte:** Browser offline schalten.
- **Erwartet:** Offlinezustand angezeigt.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/e2e.spec.ts; tests/edge-browser.spec.ts; tests/engine.test.ts; tests/acceptance.test.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### LOBBY-06 — Wiederverbindung

- **Voraussetzungen:** Isolierte Browser/Engine; Online-Gastmatch mit ausdrücklich serverseitig angelegter QA-Lobby.
- **Schritte:** Browser wieder online; synchronisieren.
- **Erwartet:** Gleiche Lobby/Spielzustand.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/e2e.spec.ts; tests/edge-browser.spec.ts; tests/engine.test.ts; tests/acceptance.test.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### LOBBY-07 — Keine Duplikate

- **Voraussetzungen:** Isolierte Browser/Engine; Online-Gastmatch mit ausdrücklich serverseitig angelegter QA-Lobby.
- **Schritte:** Identität erneut beitreten lassen.
- **Erwartet:** Nur ein Spielereintrag.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/e2e.spec.ts; tests/edge-browser.spec.ts; tests/engine.test.ts; tests/acceptance.test.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### LOBBY-08 — Nur Host startet

- **Voraussetzungen:** Isolierte Browser/Engine; Online-Gastmatch mit ausdrücklich serverseitig angelegter QA-Lobby.
- **Schritte:** Nicht-Host sendet Start.
- **Erwartet:** HOST_ONLY.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/e2e.spec.ts; tests/edge-browser.spec.ts; tests/engine.test.ts; tests/acceptance.test.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### LOBBY-09 — Pause/Fortsetzen

- **Voraussetzungen:** Isolierte Browser/Engine; Online-Gastmatch mit ausdrücklich serverseitig angelegter QA-Lobby.
- **Schritte:** Host pausiert; Zeit verstreicht; wiederherstellen; fortsetzen.
- **Erwartet:** Timer eingefroren; einmal korrekt verschoben.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/e2e.spec.ts; tests/edge-browser.spec.ts; tests/engine.test.ts; tests/acceptance.test.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### LOBBY-10 — Beenden

- **Voraussetzungen:** Isolierte Browser/Engine; Online-Gastmatch mit ausdrücklich serverseitig angelegter QA-Lobby.
- **Schritte:** Host beendet; Nicht-Host versucht Beenden.
- **Erwartet:** Nur Host; ungewertetes Ergebnis für alle.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/e2e.spec.ts; tests/edge-browser.spec.ts; tests/engine.test.ts; tests/acceptance.test.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### AUTH-01 — Google-Oberfläche entfernt

- **Voraussetzungen:** Lokale Browsertests mit expliziten Auth-Testantworten; Google/Gast zusätzlich echter Supabase-Dienst.
- **Schritte:** Login/Registrierung öffnen.
- **Erwartet:** Keine Google-Schaltfläche.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/auth.spec.ts; tests/database.test.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### AUTH-02 — Google-API aus

- **Voraussetzungen:** Lokale Browsertests mit expliziten Auth-Testantworten; Google/Gast zusätzlich echter Supabase-Dienst.
- **Schritte:** Providerkonfiguration lesen; authorize?provider=google aufrufen.
- **Erwartet:** google=false; HTTP 400.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/auth.spec.ts; tests/database.test.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### AUTH-03 — E-Mail-Registrierung

- **Voraussetzungen:** Lokale Browsertests mit expliziten Auth-Testantworten; Google/Gast zusätzlich echter Supabase-Dienst.
- **Schritte:** Neue eigene Adresse registrieren und Code aus Postfach einlösen.
- **Erwartet:** Echter Account bestätigt.
- **Tatsächlich:** Lokale UI-/Code-Tests bestanden; Zugriff auf ein echtes Testpostfach fehlt.
- **Status:** BLOCKIERT
- **Nachweis:** tests/auth.spec.ts; tests/database.test.ts; scripts/check-live.mjs
- **Fehler/Blocker:** Lokale UI-/Code-Tests bestanden; Zugriff auf ein echtes Testpostfach fehlt.

### AUTH-04 — E-Mail-Anmeldung

- **Voraussetzungen:** Lokale Browsertests mit expliziten Auth-Testantworten; Google/Gast zusätzlich echter Supabase-Dienst.
- **Schritte:** Auf Vercel mit eigenem E-Mail-Konto anmelden.
- **Erwartet:** Verifizierte Sitzung.
- **Tatsächlich:** Mock-Antworten geprüft; eigener Account/Postfach nicht zugänglich.
- **Status:** BLOCKIERT
- **Nachweis:** tests/auth.spec.ts; tests/database.test.ts; scripts/check-live.mjs
- **Fehler/Blocker:** Mock-Antworten geprüft; eigener Account/Postfach nicht zugänglich.

### AUTH-05 — Gastzugang

- **Voraussetzungen:** Lokale Browsertests mit expliziten Auth-Testantworten; Google/Gast zusätzlich echter Supabase-Dienst.
- **Schritte:** Zwei neue echte anonyme Browserkonten treten privater QA-Lobby bei.
- **Erwartet:** Beitritt ohne E-Mail/Passwort.
- **Tatsächlich:** Auf https://manhunt-pwa.vercel.app mit drei echten anonymen Supabase-Sitzungen bestanden; private QA-Lobby, keine bestehenden Benutzer verändert. Testkonten danach gelöscht.
- **Status:** BESTANDEN
- **Nachweis:** tests/auth.spec.ts; tests/database.test.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### AUTH-06 — Accounts erhalten

- **Voraussetzungen:** Lokale Browsertests mit expliziten Auth-Testantworten; Google/Gast zusätzlich echter Supabase-Dienst.
- **Schritte:** Migrationen auf bestehender DB anwenden; Schema/Erasure testen.
- **Erwartet:** Bestehende Accounts nicht migriert/gelöscht.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/auth.spec.ts; tests/database.test.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### AUTH-07 — Daten erhalten

- **Voraussetzungen:** Lokale Browsertests mit expliziten Auth-Testantworten; Google/Gast zusätzlich echter Supabase-Dienst.
- **Schritte:** Persistenz-/RLS- und Checkpointtests ausführen.
- **Erwartet:** Profile/XP/Statistik erhalten; nur eigene Testdaten gelöscht.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/auth.spec.ts; tests/database.test.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### AUTH-08 — Google zu E-Mail

- **Voraussetzungen:** Lokale Browsertests mit expliziten Auth-Testantworten; Google/Gast zusätzlich echter Supabase-Dienst.
- **Schritte:** Bisherige verifizierte Adresse über E-Mail-Recovery verwenden.
- **Erwartet:** Gleicher Account mit neuem Passwort.
- **Tatsächlich:** Recovery-UI lokal geprüft; echter ehemaliger Google-Account nicht für Test verfügbar.
- **Status:** BLOCKIERT
- **Nachweis:** tests/auth.spec.ts; tests/database.test.ts; scripts/check-live.mjs
- **Fehler/Blocker:** Recovery-UI lokal geprüft; echter ehemaliger Google-Account nicht für Test verfügbar.

### AUTH-09 — Kontodaten schützen

- **Voraussetzungen:** Lokale Browsertests mit expliziten Auth-Testantworten; Google/Gast zusätzlich echter Supabase-Dienst.
- **Schritte:** Ohne/fremden Token lesen; gelöschten Token wiederverwenden.
- **Erwartet:** 401/403 bzw. RLS; keine fremden Kontodaten.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/auth.spec.ts; tests/database.test.ts; scripts/check-live.mjs
- **Fehler/Blocker:** —

### GEO-01 — Kreiszone

- **Voraussetzungen:** Chromium/Engine; synthetische GPS-Messungen, kein physisches GPS.
- **Schritte:** Kreis erstellen, Größe ändern, speichern.
- **Erwartet:** Gültiges GeoJSON.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/zones-browser.spec.ts; tests/public.spec.ts; tests/gps-safety.spec.ts; tests/engine.test.ts
- **Fehler/Blocker:** —

### GEO-02 — Viereckzone

- **Voraussetzungen:** Chromium/Engine; synthetische GPS-Messungen, kein physisches GPS.
- **Schritte:** Vier Ecken setzen/verschieben.
- **Erwartet:** Gültige veränderte Zone.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/zones-browser.spec.ts; tests/public.spec.ts; tests/gps-safety.spec.ts; tests/engine.test.ts
- **Fehler/Blocker:** —

### GEO-03 — Achteckzone

- **Voraussetzungen:** Chromium/Engine; synthetische GPS-Messungen, kein physisches GPS.
- **Schritte:** Achteck erstellen; Zufallsecken/Endpunkt wählen.
- **Erwartet:** Acht Ecken und persistente Endzone.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/zones-browser.spec.ts; tests/public.spec.ts; tests/gps-safety.spec.ts; tests/engine.test.ts
- **Fehler/Blocker:** —

### GEO-04 — Pin-Intervall

- **Voraussetzungen:** Chromium/Engine; synthetische GPS-Messungen, kein physisches GPS.
- **Schritte:** Intervall ändern; Serveruhr und GPS vorziehen.
- **Erwartet:** Pins gemäß Regel; Fallback als alt gekennzeichnet.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/zones-browser.spec.ts; tests/public.spec.ts; tests/gps-safety.spec.ts; tests/engine.test.ts
- **Fehler/Blocker:** —

### GEO-05 — Freigegebene Pins

- **Voraussetzungen:** Chromium/Engine; synthetische GPS-Messungen, kein physisches GPS.
- **Schritte:** Hunteransicht vor/nach Frist prüfen.
- **Erwartet:** Nur veröffentlichte Gegnerpins.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/zones-browser.spec.ts; tests/public.spec.ts; tests/gps-safety.spec.ts; tests/engine.test.ts
- **Fehler/Blocker:** —

### GEO-06 — Außerhalb-Warnung

- **Voraussetzungen:** Chromium/Engine; synthetische GPS-Messungen, kein physisches GPS.
- **Schritte:** Zuverlässige Messungen außerhalb senden.
- **Erwartet:** Rote Vollbildwarnung.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/zones-browser.spec.ts; tests/public.spec.ts; tests/gps-safety.spec.ts; tests/engine.test.ts
- **Fehler/Blocker:** —

### GEO-07 — Rückkehr

- **Voraussetzungen:** Chromium/Engine; synthetische GPS-Messungen, kein physisches GPS.
- **Schritte:** Zwei zuverlässige Innenmessungen; Swipe.
- **Erwartet:** Warnung endet.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/zones-browser.spec.ts; tests/public.spec.ts; tests/gps-safety.spec.ts; tests/engine.test.ts
- **Fehler/Blocker:** —

### GEO-08 — Ablauf

- **Voraussetzungen:** Chromium/Engine; synthetische GPS-Messungen, kein physisches GPS.
- **Schritte:** Außenmessungen über Toleranz liefern.
- **Erwartet:** Server eliminiert.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/zones-browser.spec.ts; tests/public.spec.ts; tests/gps-safety.spec.ts; tests/engine.test.ts
- **Fehler/Blocker:** —

### GEO-09 — Ungenaue Messung

- **Voraussetzungen:** Chromium/Engine; synthetische GPS-Messungen, kein physisches GPS.
- **Schritte:** Ungenaue und verzögerte GPS-Samples senden.
- **Erwartet:** Keine Eliminierung allein wegen unsicherer Einzelmessung.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/zones-browser.spec.ts; tests/public.spec.ts; tests/gps-safety.spec.ts; tests/engine.test.ts
- **Fehler/Blocker:** —

### UI-01 — Touchslider

- **Voraussetzungen:** Mobile Chromium-Viewports; keine physischen iPhone-/Android-Geräte.
- **Schritte:** Regler per Touchgeste verschieben.
- **Erwartet:** Wert reagiert und bleibt gültig.
- **Tatsächlich:** Touchscreen-Eingabe im mobilen Chromium verändert und speichert den Wert; 44px Touchbereich geprüft.
- **Status:** BESTANDEN
- **Nachweis:** tests/expanded-browser.spec.ts; tests/public.spec.ts; tests/auth.spec.ts; tests/expanded-browser.spec.ts
- **Fehler/Blocker:** —

### UI-02 — Plus/Minus

- **Voraussetzungen:** Mobile Chromium-Viewports; keine physischen iPhone-/Android-Geräte.
- **Schritte:** Hunter-Anzahl per Plus ändern.
- **Erwartet:** 1 wird 2 und gespeichert.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/expanded-browser.spec.ts; tests/public.spec.ts; tests/auth.spec.ts
- **Fehler/Blocker:** —

### UI-03 — Grenzen

- **Voraussetzungen:** Mobile Chromium-Viewports; keine physischen iPhone-/Android-Geräte.
- **Schritte:** Minimum öffnen; Minus prüfen; Server validiert Grenzen.
- **Erwartet:** Kein Unterschreiten/Überschreiten.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/expanded-browser.spec.ts; tests/public.spec.ts; tests/auth.spec.ts
- **Fehler/Blocker:** —

### UI-04 — Gespeicherter Wert

- **Voraussetzungen:** Mobile Chromium-Viewports; keine physischen iPhone-/Android-Geräte.
- **Schritte:** Slider ändern, Regeln speichern, API lesen.
- **Erwartet:** UI-Wert entspricht Serverwert.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/expanded-browser.spec.ts; tests/public.spec.ts; tests/auth.spec.ts
- **Fehler/Blocker:** —

### UI-05 — Mobile Breite

- **Voraussetzungen:** Mobile Chromium-Viewports; keine physischen iPhone-/Android-Geräte.
- **Schritte:** 390px-Seiten und Spiel öffnen.
- **Erwartet:** Kein horizontaler Überlauf.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/expanded-browser.spec.ts; tests/public.spec.ts; tests/auth.spec.ts
- **Fehler/Blocker:** —

### UI-06 — Dialoge

- **Voraussetzungen:** Mobile Chromium-Viewports; keine physischen iPhone-/Android-Geräte.
- **Schritte:** Zonen-/Regel-/Infektionsdialoge bedienen.
- **Erwartet:** Kernaktionen nutzbar.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/expanded-browser.spec.ts; tests/public.spec.ts; tests/auth.spec.ts
- **Fehler/Blocker:** —

### UI-07 — PWA-Installation

- **Voraussetzungen:** Mobile Chromium-Viewports; keine physischen iPhone-/Android-Geräte.
- **Schritte:** Auf iPhone und Android zum Homescreen hinzufügen.
- **Erwartet:** Installierte PWA startet.
- **Tatsächlich:** Manifest, Icons und Service Worker geprüft; Geräteinstallation nicht möglich.
- **Status:** BLOCKIERT
- **Nachweis:** tests/expanded-browser.spec.ts; tests/public.spec.ts; tests/auth.spec.ts
- **Fehler/Blocker:** Manifest, Icons und Service Worker geprüft; Geräteinstallation nicht möglich.

### UI-08 — Reload

- **Voraussetzungen:** Mobile Chromium-Viewports; keine physischen iPhone-/Android-Geräte.
- **Schritte:** Lobby/Match mit Rolle und Regeln neu laden.
- **Erwartet:** Zustand wiederhergestellt.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/expanded-browser.spec.ts; tests/public.spec.ts; tests/auth.spec.ts
- **Fehler/Blocker:** —

### UI-09 — Lade-/Fehlerzustände

- **Voraussetzungen:** Mobile Chromium-Viewports; keine physischen iPhone-/Android-Geräte.
- **Schritte:** Auth ablehnen, Netzwerk unterbrechen; zurückkehren.
- **Erwartet:** Verständliche Hinweise und Wiederaufnahme.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** tests/expanded-browser.spec.ts; tests/public.spec.ts; tests/auth.spec.ts
- **Fehler/Blocker:** —

### DEPLOY-01 — Build

- **Voraussetzungen:** Verknüpftes Vercel-Hobby-Projekt manhunt-pwa; bestehendes Supabase.
- **Schritte:** npm run build ausführen.
- **Erwartet:** TypeScript, Frontend, Node und Edge bauen.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** Vercel-Plugin; scripts/check-preview.mjs; scripts/check-live.mjs; docs/DEPLOYMENT.md
- **Fehler/Blocker:** —

### DEPLOY-02 — Vercel-Plugin

- **Voraussetzungen:** Verknüpftes Vercel-Hobby-Projekt manhunt-pwa; bestehendes Supabase.
- **Schritte:** create_deployment und get_deployment verwenden.
- **Erwartet:** Tatsächliche Bereitstellung über Plugin.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** Vercel-Plugin; scripts/check-preview.mjs; scripts/check-live.mjs; docs/DEPLOYMENT.md
- **Fehler/Blocker:** —

### DEPLOY-03 — Preview

- **Voraussetzungen:** Verknüpftes Vercel-Hobby-Projekt manhunt-pwa; bestehendes Supabase.
- **Schritte:** Preview bauen und per geschütztem Zugangslink im Browser öffnen.
- **Erwartet:** READY und Browser-Smoke bestanden.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** Vercel-Plugin; scripts/check-preview.mjs; scripts/check-live.mjs; docs/DEPLOYMENT.md
- **Fehler/Blocker:** —

### DEPLOY-04 — Produktion

- **Voraussetzungen:** Verknüpftes Vercel-Hobby-Projekt manhunt-pwa; bestehendes Supabase.
- **Schritte:** Getesteten Commit veröffentlichen; Produktionsdomain prüfen.
- **Erwartet:** Neue Version öffentlich erreichbar.
- **Tatsächlich:** Vercel production READY, App-Code 1f69b23. Öffentliche Chromium-Prüfung 3/3; Live-Multiplayer auf c361d1c, nachfolgende QR-Korrektur separat geprüft.
- **Status:** BESTANDEN
- **Nachweis:** Vercel-Plugin; scripts/check-preview.mjs; scripts/check-live.mjs; docs/DEPLOYMENT.md
- **Fehler/Blocker:** —

### DEPLOY-05 — Anmeldung auf Vercel

- **Voraussetzungen:** Verknüpftes Vercel-Hobby-Projekt manhunt-pwa; bestehendes Supabase.
- **Schritte:** Gast und E-Mail auf neuer Domain anmelden.
- **Erwartet:** Beide funktionieren.
- **Tatsächlich:** Gast auf Preview bestanden; echte E-Mail-Anmeldung noch zu prüfen.
- **Status:** BLOCKIERT
- **Nachweis:** Vercel-Plugin; scripts/check-preview.mjs; scripts/check-live.mjs; docs/DEPLOYMENT.md
- **Fehler/Blocker:** Gast auf Preview bestanden; echte E-Mail-Anmeldung noch zu prüfen.

### DEPLOY-06 — Online-Lobbys

- **Voraussetzungen:** Verknüpftes Vercel-Hobby-Projekt manhunt-pwa; bestehendes Supabase.
- **Schritte:** Drei reale Gastsitzungen gegen Supabase synchronisieren.
- **Erwartet:** Beitritte ohne Reload sichtbar.
- **Tatsächlich:** Auf https://manhunt-pwa.vercel.app mit drei echten anonymen Supabase-Sitzungen bestanden; private QA-Lobby, keine bestehenden Benutzer verändert. Testkonten danach gelöscht.
- **Status:** BESTANDEN
- **Nachweis:** Vercel-Plugin; scripts/check-preview.mjs; scripts/check-live.mjs; docs/DEPLOYMENT.md
- **Fehler/Blocker:** —

### DEPLOY-07 — Chat/GPS auf Vercel

- **Voraussetzungen:** Verknüpftes Vercel-Hobby-Projekt manhunt-pwa; bestehendes Supabase.
- **Schritte:** Geschützten Chat und freigegebenen Testpin online prüfen.
- **Erwartet:** Berechtigungen und Marker funktionieren.
- **Tatsächlich:** Auf https://manhunt-pwa.vercel.app mit drei echten anonymen Supabase-Sitzungen bestanden; private QA-Lobby, keine bestehenden Benutzer verändert. Testkonten danach gelöscht.
- **Status:** BESTANDEN
- **Nachweis:** Vercel-Plugin; scripts/check-preview.mjs; scripts/check-live.mjs; docs/DEPLOYMENT.md
- **Fehler/Blocker:** —

### DEPLOY-08 — Bestehende Daten

- **Voraussetzungen:** Verknüpftes Vercel-Hobby-Projekt manhunt-pwa; bestehendes Supabase.
- **Schritte:** Identische Supabase-Projekt-ID vor/nach Umzug prüfen.
- **Erwartet:** Keine neue DB; vorhandene Accounts erhalten.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** Vercel-Plugin; scripts/check-preview.mjs; scripts/check-live.mjs; docs/DEPLOYMENT.md
- **Fehler/Blocker:** —

### DEPLOY-09 — Geheimnisse

- **Voraussetzungen:** Verknüpftes Vercel-Hobby-Projekt manhunt-pwa; bestehendes Supabase.
- **Schritte:** Öffentliche Config/Bundle prüfen; privilegierte Keys bleiben im Backend.
- **Erwartet:** Keine Service-Secrets im Frontend.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** Vercel-Plugin; scripts/check-preview.mjs; scripts/check-live.mjs; docs/DEPLOYMENT.md
- **Fehler/Blocker:** —

### DEPLOY-10 — Automatische Deployments

- **Voraussetzungen:** Verknüpftes Vercel-Hobby-Projekt manhunt-pwa; bestehendes Supabase.
- **Schritte:** b48-preview-Branch aktualisieren; Vercel-Neubau prüfen.
- **Erwartet:** Neuer Commit wird automatisch gebaut.
- **Tatsächlich:** Erwartung im ausgeführten automatisierten Test erfüllt.
- **Status:** BESTANDEN
- **Nachweis:** Vercel-Plugin; scripts/check-preview.mjs; scripts/check-live.mjs; docs/DEPLOYMENT.md
- **Fehler/Blocker:** —

### REDIRECT-01 — Alte Seite veröffentlicht

- **Voraussetzungen:** Vollständiger lokaler Weiterleitungscode; Veröffentlichung erst nach erfolgreichem Produktionstest.
- **Schritte:** Alte Sites-Adresse öffnen.
- **Erwartet:** Umzugstext sichtbar.
- **Tatsächlich:** Sites-Version 13 öffentlich veröffentlicht. Vier Online-Playwright-Prüfungen sowie echte Wartezeit und echter Sofort-Button bis zur Vercel-Zielseite bestanden.
- **Status:** BESTANDEN
- **Nachweis:** tests/redirect.spec.ts; scripts/check-redirect-live.mjs; Sites deployment appgdep_6adfcbd5c6948191b0a719314aaa08ff
- **Fehler/Blocker:** —

### REDIRECT-02 — Start bei zehn

- **Voraussetzungen:** Vollständiger lokaler Weiterleitungscode; Veröffentlichung erst nach erfolgreichem Produktionstest.
- **Schritte:** Seite laden; Countdown lesen.
- **Erwartet:** 10 Sekunden.
- **Tatsächlich:** Sites-Version 13 öffentlich veröffentlicht. Vier Online-Playwright-Prüfungen sowie echte Wartezeit und echter Sofort-Button bis zur Vercel-Zielseite bestanden.
- **Status:** BESTANDEN
- **Nachweis:** tests/redirect.spec.ts; scripts/check-redirect-live.mjs; Sites deployment appgdep_6adfcbd5c6948191b0a719314aaa08ff
- **Fehler/Blocker:** —

### REDIRECT-03 — Countdown

- **Voraussetzungen:** Vollständiger lokaler Weiterleitungscode; Veröffentlichung erst nach erfolgreichem Produktionstest.
- **Schritte:** Uhr vier Sekunden vorziehen.
- **Erwartet:** Anzeige 6.
- **Tatsächlich:** Sites-Version 13 öffentlich veröffentlicht. Vier Online-Playwright-Prüfungen sowie echte Wartezeit und echter Sofort-Button bis zur Vercel-Zielseite bestanden.
- **Status:** BESTANDEN
- **Nachweis:** tests/redirect.spec.ts; scripts/check-redirect-live.mjs; Sites deployment appgdep_6adfcbd5c6948191b0a719314aaa08ff
- **Fehler/Blocker:** —

### REDIRECT-04 — Fortschritt

- **Voraussetzungen:** Vollständiger lokaler Weiterleitungscode; Veröffentlichung erst nach erfolgreichem Produktionstest.
- **Schritte:** Nach vier Sekunden Fortschrittswert lesen.
- **Erwartet:** Mindestens 40 Prozent.
- **Tatsächlich:** Sites-Version 13 öffentlich veröffentlicht. Vier Online-Playwright-Prüfungen sowie echte Wartezeit und echter Sofort-Button bis zur Vercel-Zielseite bestanden.
- **Status:** BESTANDEN
- **Nachweis:** tests/redirect.spec.ts; scripts/check-redirect-live.mjs; Sites deployment appgdep_6adfcbd5c6948191b0a719314aaa08ff
- **Fehler/Blocker:** —

### REDIRECT-05 — Auto-Weiterleitung

- **Voraussetzungen:** Vollständiger lokaler Weiterleitungscode; Veröffentlichung erst nach erfolgreichem Produktionstest.
- **Schritte:** Zehn Sekunden abwarten.
- **Erwartet:** Echte Vercel-Produktionsdomain.
- **Tatsächlich:** Sites-Version 13 öffentlich veröffentlicht. Vier Online-Playwright-Prüfungen sowie echte Wartezeit und echter Sofort-Button bis zur Vercel-Zielseite bestanden.
- **Status:** BESTANDEN
- **Nachweis:** tests/redirect.spec.ts; scripts/check-redirect-live.mjs; Sites deployment appgdep_6adfcbd5c6948191b0a719314aaa08ff
- **Fehler/Blocker:** —

### REDIRECT-06 — Sofort-Button

- **Voraussetzungen:** Vollständiger lokaler Weiterleitungscode; Veröffentlichung erst nach erfolgreichem Produktionstest.
- **Schritte:** Button anklicken; gültigen Lobbycode prüfen.
- **Erwartet:** Sofort weiter; Auth-Tokens werden nicht weitergegeben.
- **Tatsächlich:** Sites-Version 13 öffentlich veröffentlicht. Vier Online-Playwright-Prüfungen sowie echte Wartezeit und echter Sofort-Button bis zur Vercel-Zielseite bestanden.
- **Status:** BESTANDEN
- **Nachweis:** tests/redirect.spec.ts; scripts/check-redirect-live.mjs; Sites deployment appgdep_6adfcbd5c6948191b0a719314aaa08ff
- **Fehler/Blocker:** —

### REDIRECT-07 — Mobile/Desktop

- **Voraussetzungen:** Vollständiger lokaler Weiterleitungscode; Veröffentlichung erst nach erfolgreichem Produktionstest.
- **Schritte:** 390/412/1280px öffnen; Countdown und Navigation prüfen.
- **Erwartet:** Bedienbar ohne Überlauf.
- **Tatsächlich:** Drei mobile/Desktop-Viewports gegen die veröffentlichte Seite bestanden; echter Zielaufruf ebenfalls bestanden. Physisches iPhone/Android nicht zugänglich.
- **Status:** BLOCKIERT
- **Nachweis:** tests/redirect.spec.ts; redirect/index.html
- **Fehler/Blocker:** Keine physischen Geräte verfügbar.

### REDIRECT-08 — Reihenfolge

- **Voraussetzungen:** Vollständiger lokaler Weiterleitungscode; Veröffentlichung erst nach erfolgreichem Produktionstest.
- **Schritte:** Vercel online testen, danach Sites ersetzen.
- **Erwartet:** Keine vorzeitige Umstellung.
- **Tatsächlich:** Sites-Version 13 öffentlich veröffentlicht. Vier Online-Playwright-Prüfungen sowie echte Wartezeit und echter Sofort-Button bis zur Vercel-Zielseite bestanden.
- **Status:** BESTANDEN
- **Nachweis:** tests/redirect.spec.ts; scripts/check-redirect-live.mjs; Sites deployment appgdep_6adfcbd5c6948191b0a719314aaa08ff
- **Fehler/Blocker:** —

## Zusätzliche Belastungs- und Negativtests

Diese zwölf Prüfungen sind zusätzlich zu den 134 Akzeptanz-IDs erfasst. Sie sind isolierte automatische Tests, keine Lastmessung des kostenlosen Produktionskontingents. Alle zwölf Prüfungen sind BESTANDEN.

| Test | Schritte und erwartetes / tatsächliches Ergebnis | Nachweis |
| --- | --- | --- |
| STRESS-01 | Gleichzeitige Beitritte mit CAS-Konflikten; alle Spieler bleiben genau einmal erhalten. | edge.test.ts |
| STRESS-02 | Zwei Hider sammeln dieselbe Punkt-ID gleichzeitig; genau ein Erfolg. | expanded-browser.spec.ts |
| STRESS-03 | Parallele Rollenänderungen durch Host; beide erhalten, fremde Änderung abgewiesen. | edge.test.ts STRESS-ROLE |
| STRESS-04 | Browser offline/online während Match; Zustand bleibt erhalten. | e2e.spec.ts |
| STRESS-05 | XP-Match nach Sammlung offline/online und Reload; identische Punkt-ID und Fortschritt. | expanded-browser.spec.ts STRESS-XP-RECONNECT |
| STRESS-06 | Vier Chatnachrichten gleichzeitig mit Speicher-Konflikten; jede genau einmal. | edge.test.ts STRESS-CHAT |
| STRESS-07 | Matchende gleichzeitig mit Sammeln; Endzustand unveränderbar, kein Sammeln danach. | edge.test.ts STRESS-END |
| STRESS-08 | Schrumpfphase während ausstehender Wegdatenabfrage; kein ungültiger Außenpunkt und Fortschritt erhalten. | edge.test.ts STRESS-SHRINK |
| STRESS-09 | Standortfreigabe widerrufen und verspäteten GPS-Callback auslösen; kein weiterer Versand. | gps-privacy.spec.ts |
| STRESS-10 | Manipulierte Rollen, Kanäle, Punkt-IDs, Token und GPS-Anfragen; serverseitig abgewiesen. | acceptance.test.ts, api.test.ts, edge.test.ts |
| STRESS-11 | Abschluss mehrfach speichern und später Konto löschen; keine doppelte XP-Buchung. | database.test.ts |
| STRESS-12 | Nicht-Host ändert Einstellungen, Rollen, Zone oder beendet; abgewiesen. | engine.test.ts, acceptance.test.ts |

Für jeden dieser Tests wurden die beschriebenen Assertions ausgeführt und erfüllt; kein verbleibender Fehler in diesen isolierten Prüfungen. Tests auf realen Smartphones, mit eigener E-Mail und positiver externer XP-Generierung bleiben wie oben ausgewiesen offen.
