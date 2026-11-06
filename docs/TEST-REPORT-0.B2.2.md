# Prüfbericht 0.B2.2

Stand: 6. November 2026. Browseridentitäten, Mailboxen, GPS und Wegdaten sind ausdrücklich isolierte Testdaten auf localhost. Die Produktion erhielt keine Testkonten, simulierten Spielresultate oder erfundenen Belohnungen.

## Ausgeführte lokale Prüfungen

| Suite | Bestandene unterschiedliche Fälle | Ausführung |
| --- | ---: | --- |
| Vitest, Backend und PostgreSQL/PGlite | 381 | Ein vollständiger Lauf in 33 Dateien; echte Migrationen, RLS, Spiellogik und negative Berechtigungsfälle. |
| Socket.IO-Multiplayer | 9 | Vollständiger gemeinsamer Browserlauf; mehrere unabhängige Sitzungen, GPS, Infektion, Zone, Offline-Wiederkehr. |
| Edge-Multiplayer und neue Spielansicht | 53 | Vollständiger Lauf 51/51 plus zwei zusätzliche neue GPS-/Signal-Fälle. Nach dem letzten HTTP-Fix erneut drei relevante Synchronisierungs-/Hunter-Fälle erfolgreich ausgeführt. Jeder Fall wird einmal gezählt. |
| Admin, Profile und Ergebnisse | 22 | Vollständiger gemeinsamer Lauf; einschließlich echter lokaler Registrierung, Belohnungsledger-Abfrage, optionalem Feedback, Profilbildern, Revanche und Simulationstrennung. |
| Produktionsbundle und Auth | 25 | Vollständiger Lauf ohne eingebauten Test-Login; Auth-Provider/Mailboxen ausschließlich in gekennzeichneten lokalen Tests simuliert. |
| Weiterleitungsseite | 4 | Vollständiger Lauf mit kontrollierter Uhr und echten Navigationsprüfungen. |
| **Summe** | **494** | Builds und Abhängigkeitsprüfungen werden nicht als zusätzliche bestandene Tests gezählt. |

### Neue beziehungsweise erweiterte Akzeptanzfälle

| Test-ID | Voraussetzungen und Schritte | Erwartetes und beobachtetes Ergebnis | Status |
| --- | --- | --- | --- |
| EXP-HUD-320/390/1440 | Zwei Testspieler starten echtes Engine-Match; Browser zunächst ohne Ortung, dann explizite Freigabe. Rechtecke der Karte, Restzeit, Pinzeit und des Live-Bereichs mit der Bildschirm-/Navigationsgrenze vergleichen. 320 px zusätzlich mit vergrößerter Schrift. | Essentials im ersten sichtbaren Bereich, kein horizontaler Überlauf, kein Sensorzugriff vor Zustimmung. | BESTANDEN |
| EXP-GPS-GUIDANCE | Frische 3-m-Ortung auf 80 m verschlechtern, Watch und Ersatzabfragen schweigen lassen, reale 15 Sekunden abwarten, anschließend frische Ortung liefern. | Genauigkeit und Alter wahrheitsgemäß; konkrete sichere Empfangshinweise; keine blinde Eliminierung; Erholung nach frischer Messung. | BESTANDEN |
| GPS-OBSERVER | Frische Watch-Daten, ausbleibende Messung, Hintergrund/Pause und spätes Callback nach Stop simulieren. | Keine redundante Einzelabfrage bei frischem Watch; neue Fixes nach Wiederkehr; alte Callbacks können keine Freigabe wiederherstellen. Serverseitige Frische bleibt unverändert. | BESTANDEN |
| MAP-DISPLAY / MAP-ZOOM | Sonnenlicht umschalten, Genauigkeitskreis wirklich rendern/entfernen, verschieben und rückzentrieren; zoomen, drehen, vergrößern. Screenshot-Ausschnitt des Kreises vergleichen. | Echte Layeränderung und gespeicherte Anzeigepräferenz; 44-px-Bedienflächen; eigener Standort und Spieler bleiben geografisch verankert. | BESTANDEN |
| MAP-CROWD | Freigegebene Team-Pins gruppieren, Details bei 240 px Kartenhöhe öffnen und zoomen, Pins entziehen. | Karte passt Kamera an, Details und Aktionen bleiben erreichbar, entzogene Pins verschwinden; keine Koordinatenänderung. | BESTANDEN |
| EXP-SIGNALS-UI / GAME-SIGNALS | Schalter zunächst aus; echte Browser-Geste aktiviert WebAudio; Vibration unterstützt/nicht unterstützt darstellen; speichern, neu laden und ausschalten. Neue und alte Ereignisse im Tracker auswerten. | Freiwillige getrennte Einstellungen; Persistenz; keine historischen oder simulierten Echtspiel-Signale. WebAudio ist echt, Vibrationshardware ausdrücklich im Test ersetzt. | BESTANDEN |
| EXP-RULES | Host und Gast sehen synchronisierte Sonderregeln und kombinierte Modi. Nicht-Host versucht Start über API. | Gewählte Werte einschließlich Intervallen, Fangregel und Verzögerungen; fremder Start abgelehnt. | BESTANDEN |
| EXP-RELEASE | Konfigurierter 12-Sekunden-Vorsprung; Team-/Rollenanzeige prüfen und Fang vor Freigabe versuchen. | Verbleibende Freigabe sichtbar, echte Fangaktion bis zum Serverzeitpunkt blockiert und danach bedienbar. | BESTANDEN |
| EXP-XP-REFUSAL | Hider außerhalb des Radius versucht Sammeln; Hunter versucht direkten API-Aufruf. | Echte verständliche Serverablehnung, kein Fortschritt, kein Rollen-Bypass. | BESTANDEN |
| EXP-XP-REPLACEMENTS | Einen passenden Ersatz erzeugen, weiteren unmöglichen Ersatz melden und neu laden. | Restkontingent 5 → 4; erfolgreicher Ersatz begründet; Fehler verbraucht nichts, Punkt und Kontingent bleiben gespeichert. | BESTANDEN |
| QR-TORCH-01–06 | Echter Canvas-Videostream mit ausdrücklich isolierten Hardwarefähigkeiten; Licht schalten, Ablehnung, Stop/Neustart, Schließen, verspätete Kameraantwort und echten QR-Pixelcode testen. | Nur unterstützte Kamera bietet Licht an; sichere Freigabe und Fehlerbehandlung; unveränderte echte QR-Inhaltsprüfung. | BESTANDEN |
| EXP-RECONNECT / RECONNECTION | Offline/Online, gehaltene Antwort vor der Unterbrechung, frische Synchronisierung und ausstehende Mutation. | Verbindung und Bestätigung erst nach frischem autoritativem Zustand; genau eine Bestätigung; keine automatisch wiederholte Mutation und kein Wiederöffnen geschlossener Sitzung. | BESTANDEN |
| RESULT-B22-320/1440 | Lokale registrierte Spieler beenden gültiges Match mit Fang. Eigene Ledger lesen, Fortschritte, Verlauf, Feedback und Revanche bedienen. | Tatsächlich gebuchte 60 Test-XP, korrekte Badge-Beiträge und Ereignisse; keine Schätzung; nur persönliche Daten im erlaubten Match. | BESTANDEN |
| RESULT-REVIEW | Fremdes/unfertiges Match, ungültige Methode, Gäste, kurze Runde, Simulation und XP+Zombie mit Hunter-Zeitlimit auswerten. | Eigene abgeschlossene Mitgliedschaft erforderlich; keine Belohnungsschreibvorgänge; passende Erklärungen und korrektes Zombie-Siegerteam. | BESTANDEN |
| FEED-ISSUES-SQL | Ganze Migrationskette ausführen; neue Version, alten Angebotssnapshot, Wiederholung und eigene volle Kataloge prüfen. | Alte Antworten/Fragen unverändert, neue Auswahl optional, keine abgeschnittenen eigenen Optionen; idempotent. | BESTANDEN |

## Build und Datenbank

Haupt- und Admin-Build sind erfolgreich. Beide Produktions-Abhängigkeitsprüfungen melden 0 bekannte Schwachstellen. Das ist keine umfassende Sicherheitsfreigabe.

Die additive Migration `targeted_feedback_context` wurde erfolgreich auf das bestehende Supabase-Projekt angewendet und danach gelesen: aktive Fragebogenversion 3 mit 10 freiwilligen Fragen und acht Verbesserungskategorien einschließlich GPS/Standort, Karte, Fangen und Verbindung. Die Versionen 1 und 2 bleiben erhalten; Version 2 behält ihre sechs bisherigen Auswahlmöglichkeiten. Alle 50 öffentlichen Anwendungstabellen besitzen weiterhin RLS. Absichtlich ausschließlich serverzugängliche Tabellen erhielten keine offenen Client-Policies.

Supabase Edge Function `manhunt-api`, Revision 22, ist ACTIVE. Der tatsächliche Health-Endpunkt antwortet mit HTTP 200, `configured: true` und `version: 0.B2.2`. Das neue Ergebnis-API antwortet ohne Anmeldung mit HTTP 401. Positive private Ergebnisabfragen wurden ausschließlich mit den ausdrücklich isolierten Testidentitäten geprüft.

Das neue Ergebnis-API liest ausschließlich vorhandene eigene Belohnungsledger und projizierte Spielereignisse. Es schreibt keine Belohnungen und liefert keine privaten Checkpoints, GPS- oder Chatdaten. Die zusätzliche API-Berechtigungsprüfung wurde gezielt überprüft; dabei gefundene Inkonsistenz beim Zombie-Siegerteam wurde korrigiert und erneut getestet.

## Veröffentlichung und Grenzen

Der abschließende [GitHub-CI-Verlauf](https://github.com/scobione/manhunt/actions?query=branch%3Amain) führt sämtliche Suiten aus dem gepushten Stand nochmals aus. Der endgültige Veröffentlichungsstatus wird erst anhand der tatsächlichen Vercel-Bereitstellungen und dieser Testergebnisse gemeldet.

Physische iPhone-/Android-Geräte stehen hier nicht zur Verfügung. Kameralicht, echte Vibrationshardware, hörbare Lautstärke, GPS im Außeneinsatz und Push bei gesperrtem Bildschirm wurden deshalb **NICHT AUSGEFÜHRT**. Browser-Simulationen ersetzen diese Gerätetests nicht. Es wurde kein realer Akkuverbrauchs- oder Ladezeitvergleich gemessen; geprüft sind die entfernte redundante Arbeit, echte Browserfunktionen und erhaltene Spielregeln.

Der Ereignisverlauf verwendet die noch vorhandenen Checkpoint-Ereignisse. Wenn ältere Einträge fehlen, zeigt die Oberfläche dies an. Eine eigene volle Fragebogensammlung mit 20 Fragen wird nicht überschrieben; diese Sonderkonfiguration benötigt manuelle Auswahl zusätzlicher Kategorien. Die produktive Sammlung enthält 10 Fragen und wurde vollständig aktualisiert.
