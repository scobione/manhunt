# Prüfbericht 0.B2.1

Stand: 5. November 2026. Alle Identitäten, Positionsströme und Mailboxen der lokalen Browserprüfungen sind ausdrücklich isolierte Testdaten. In der Produktion wurden keine Testspieler, Feedback-Antworten oder Erfolge angelegt.

## Automatisierte Prüfungen

Der vollständige Vitest-Lauf hat **344 Tests in 26 Dateien bestanden**. Das umfasst die bestehende Spielengine und die unten genannten neuen API- und SQL-Prüfungen. Die Datenbankfälle führen die echten Migrationen in isoliertem PostgreSQL/PGlite aus und prüfen Rollen und RLS; sie sind keine Behauptung über einen realen E-Mail-Versand.

| Prüfung | Ablauf und erwartetes Ergebnis | Ergebnis |
| --- | --- | --- |
| REMATCH-Engine / REMATCH-SQL | Reguläres Match beenden, als Host Revanche starten, alte Anfrage wiederholen, alte/neue Runde speichern. Neuer Matchschlüssel, gleicher Code, identisches altes Ergebnis, nur eine Nachfolgerunde. | BESTANDEN |
| REMATCH-Edge / Socket | Zwei Teilnehmer; konkurrierende Edge-Anfragen und tatsächliche Socket-Verbindungen. Beide erhalten die neue Runde; Nicht-Host und fremde Match-ID abgewiesen; Blockprüfung bezieht sich auf aktive Runde. | BESTANDEN |
| SIM-REMATCH | Virtuelle Runde beenden, Revanche starten und erneut GPS prüfen. Neue Runde und getrennte Testfortschritte ohne echte Belohnungen. | BESTANDEN |
| ACH-NEW-01–03 | Gültige Siege und überlebende Hider auswerten, wiederholen sowie kurze/abgebrochene/historische Matches prüfen. Zählung genau einmal, keine rückwirkend erfundenen Erfolge. | BESTANDEN |
| PROFILE-CUSTOMIZATION / SQL | Farbe/Banner speichern, fremde Pfade und falsche Bildbytes senden, Reihenfolge mit verdienten/gesperrten/duplizierten Badges ändern. Nur eigener validierter Upload und freigeschaltete Badges zulässig. | BESTANDEN |
| PROFILE-PRIVACY | Freundesprofil erst nach Freundschafts-/Blockprüfung dekorieren. Verborgene Badges auch aus der Reihenfolge entfernen; Gast-/Client-Schreibversuche zurückweisen. | BESTANDEN |
| COMMUNITY-SQL-01 | 30 eigene Zonen speichern, 31. und fremde ID versuchen; andere Rolle lesen/schreiben lassen. Limit und Eigentum geschützt; Sicherheitsbestätigung zurückgesetzt. | BESTANDEN |
| COMMUNITY-SQL-02–03 | Bericht wiederholen, fünf Meldungen pro Stunde überschreiten, fremdes Match/Preset anhängen. Wiederholung einmalig; Limit, Mitgliedschaft und Presetbesitz durchgesetzt. | BESTANDEN |
| B21-REPORT-01–03 | Manuelle Meldung ohne Bild, mit eigenem/fremdem Screenshot und unerlaubten GPS-/Chatfeldern senden. Keine automatische private Zusatzinformation; ungültige Felder abgewiesen. | BESTANDEN |
| MAP-CROWD-Unit | Dichte erlaubte Marker gruppieren, entfernte Marker einzeln lassen, Koordinaten und stabile Gruppen prüfen. Keine Änderung ursprünglicher Koordinaten. | BESTANDEN |

## Browser-Endstand

**93 unterschiedliche Browserfälle bestanden; zusammen mit Vitest 437 Prüfungen.** Die Tabelle zählt jeden Fall einmal. Fehlgeschlagene Erstläufe wurden untersucht, korrigiert und die betroffenen Fälle erneut ausgeführt.

| Suite | Bestandene Fälle | Nachweis |
| --- | ---: | --- |
| Socket.IO-Multiplayer | 9 | Voller Lauf 8/9, anschließend Apokalypse-Fall nach eindeutiger Auswahl des Warnungsbuttons und ausreichendem Gesamtbudget erfolgreich wiederholt. Alle fachlichen GPS-Fristen blieben unverändert. |
| Edge-Multiplayer | 35 | Alle unterschiedlichen Fälle über drei Läufe bestanden: kombinierte Modi, private Teamstandorte, Kartencluster, Zoom-Verankerung, große Schrift, Presetübernahme, GPS-Sperren und beide Swipes. |
| Admin/Profile/0.B2.1 | 20 | Ein vollständiger gemeinsamer Lauf 20/20, einschließlich realer Browser-Bildverarbeitung und Uploads an den ausdrücklich isolierten Storage-Testserver. |
| Produktionsbundle/Auth | 25 | Vollständiger Lauf 25/25 ohne eingebauten Test-Login. Provider- und Mailboxsimulationen werden nur in lokalen Auth-Tests verwendet. |
| Alte Weiterleitungsseite | 4 | Vollständiger Lauf 4/4 bei 390, 412 und 1280 px; kontrollierte Uhr prüft zehn Sekunden, Fortschritt und sichere Einladungsweitergabe. |

### Neue Browser-Akzeptanzfälle

| ID | Schritte und überprüftes Ergebnis | Status |
| --- | --- | --- |
| B21-PROFILE-320 / 1440 | Als registrierter Testspieler ein gültiges Match abschließen, Farbe wählen und verdiente Badges verschieben; neu laden und Freundesprofil öffnen. Farbe und Reihenfolge bleiben gespeichert; gesperrte Badges nicht wählbar. | BESTANDEN |
| B21-PRIVATE-IMAGES | Echte PNG-Datei auswählen, per Canvas als WebP hochladen, privates Banner anzeigen und entfernen. Screenshot-Bericht senden; als Admin ansehen. Normale Benutzer 403, Admin ohne Verwaltungssitzung 401; Text als Text dargestellt. | BESTANDEN |
| B21-PROFILE-RACE | Eine alte Profilabfrage verzögern, neue Farbe erfolgreich speichern, alte Antwort freigeben. Neue Farbe bleibt sichtbar. | BESTANDEN |
| B21-LIBRARY-REPORT | Eigene Zone speichern/ändern/favorisieren, fremde Anfrage versuchen, Regeln favorisieren und wiederverwenden. Zone erneut unbestätigt; Löschdialog per Escape schließen und Fokus zurückgeben; anschließend wirklich löschen. | BESTANDEN |
| B21-REMATCH | Zwei Sitzungen beenden ein Match; Host startet Revanche. Gleicher Code, neue ID, gleiche Crew und Regeln, neue Standortzustimmung; altes Ergebnis unverändert und neue Runde nur einmal. | BESTANDEN |
| B21-INTRO-UPDATES | Anleitung überspringen, in Einstellungen wieder öffnen, alle Schritte abschließen und neu laden. Entscheidung bleibt erhalten; Versionsübersicht entspricht der Build-Version. | BESTANDEN |
| B21-PRESET-REUSE | Eigene Siegbedingungen, Hunter-Anzahl, Verzögerung und Custom+Zombie+Apokalypse laden. Erstellte Lobby enthält exakt diese Werte. Bei 320 px und vergrößerter Schrift sind Menü und Einstellungen erreichbar. | BESTANDEN |
| MAP-CROWD-01 / MAP-ZOOM | Mehrere freigegebene Teammarker gruppieren und öffnen; Freigabe entziehen. Eigene Position bleibt separat, entzogene Pins verschwinden. Zoom, Verschieben, Drehung und Größenwechsel versetzen keine Einzelkoordinaten. | BESTANDEN |
| SIM-BROWSER-01 | Einen laufenden Hintergrund-GET gezielt halten; währenddessen Fang klicken. Aktion bleibt bedienbar und läuft genau einmal. GPS-gesperrte Rückkehr und Zombie-Swipe verwenden die echten Anzeigen und Zustandsänderungen. | BESTANDEN |

### Behobene Fehler

- Profilgestaltung konnte durch eine verspätete GET-Antwort überschrieben werden.
- Versteckte Datei-Eingaben verursachten horizontalen Überlauf in den Einstellungen.
- Eine Simulations-Hintergrundabfrage konnte einen Klick durch kurzzeitiges Deaktivieren des Buttons verlieren; alte Antworten konnten die Perspektive zurücksetzen.
- Wiederverwendete Regeln verloren einzelne Sonderwerte oder die Kombination mit Custom.
- Die mobile Navigation war durch sechs Hauptziele zu dicht; die zusätzlichen Seiten bleiben im scrollbar erreichbaren Menü und in den Einstellungen.
- Der Löschdialog der Bibliothek konnte den Fokus beim Abbrechen verlieren.

Weitere Erstfehler lagen in alten Testannahmen: einzelne Pins können jetzt gruppiert sein; End bestätigt den Tastatur-Swipe bereits; statische GPS-Testpositionen benötigen fortlaufende frische Messzeiten. Die Tests wurden entsprechend präzisiert. Serverseitige GPS-Genauigkeit, Frische und Rückkehrbedingungen wurden nicht gelockert.

Beide Vercel-Projekte bleiben Git-verknüpft. Der [GitHub-CI-Verlauf](https://github.com/scobione/manhunt/actions?query=branch%3Amain) führt dieselben Suiten für jeden Push erneut aus. Das Ergebnis eines Builds wird nicht als bestandener Browserfall gezählt.

## Produktive Datenbank und Backend

Alle drei Migrationen wurden erfolgreich auf das vorhandene Supabase-Projekt angewendet. Anschließend geprüft: **50 öffentliche Anwendungstabellen, alle mit RLS**; beide neuen Bild-Buckets sind privat und auf 2 MB begrenzt. Die Mutationsfunktionen für Banner, Badge-Reihenfolge, gespeicherte Zonen und Fehlerberichte erlauben keinen direkten EXECUTE durch normale authentifizierte Clients.

Supabase Edge Function `manhunt-api`, Revision **21**, ist ACTIVE. Der tatsächliche Health-Endpunkt antwortet mit HTTP 200 und Version `0.B2.1`. Ohne Anmeldung antworten Profilgestaltung, Badge-Reihenfolge, Bibliothek, Fehlerberichte und Adminberichte mit HTTP 401.

Haupt- und Admin-Build sowie beide Produktions-Abhängigkeitsprüfungen sind erfolgreich; npm meldet jeweils **0 bekannte Schwachstellen**. Das ersetzt keine umfassende Sicherheitsprüfung. Bestehende Supabase-Hinweise zu erlaubten Gastsitzungen und ausschließlich serverlesbaren Tabellen wurden nicht durch offene Client-Policies abgeschwächt.

## Grenzen der Prüfung

Physische iPhone-/Android-Geräte stehen hier nicht zur Verfügung. Touchbedienung, schmale Ansichten, vergrößerte Schrift und reduzierte Animation werden automatisiert im Browser geprüft; reale Hintergrundortung und Push-Zustellung benötigen weiterhin einen Gerätetest. Die Beschränkungen mobiler Webapps bei inaktivem Bildschirm gelten unverändert.

Die Erreichbarkeit externer OSM-Fußwegdaten wurde in dieser Erweiterung nicht erneut untersucht; ihre bestehende Funktion wurde nicht durch ungeprüfte Zufallspunkte ersetzt. E-Mail-Zustellung und private Spieleraktionen wurden nicht mit erfundenen produktiven Zugangsdaten getestet. Noch fehlende Betreiberangaben im Impressum werden weiterhin ausdrücklich angezeigt.
