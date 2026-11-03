# Testbericht 0.b1.110

Stand: 3. November 2026. Alle nachfolgend als bestanden bezeichneten Tests wurden ausgeführt. Die automatisierten Tests verwenden ausschließlich isolierte Testidentitäten, lokale Datenbanken beziehungsweise kontrollierte Auth-Antworten und ausdrücklich simulierte GPS-Daten. Ein lokaler Browser-Test ist kein Nachweis einer echten E-Mail-Zustellung, eines physischen Smartphones oder eines bereits authentifiziert geprüften Produktions-Admins.

## Ausgeführte Prüfungen

- 278 Unit-, Engine-, API- und Datenbanktests bestanden.
- 9 Socket-Multiplayer-Browsertests bestanden.
- 31 Edge-Browserfälle bestanden; der Karten-Popup-Fall nach Korrektur. Der gezielte Nachlauf umfasst zusätzlich die bereits enthaltenen beiden Zoom- und beiden GPS-Datenschutzfälle.
- 10 Admin-Browserfälle bestanden; der Passwort-Reset nach präziser Auswahl des Testkontos. Der Feedback-Fall prüft zusätzlich das Speichern einer Badge-Definition, den Frageneditor und die Erhaltung alter Fragebogentexte.
- 25 Frontend-/Auth-Browserfälle bestanden, darunter Gastbeitritt und Reset-Abläufe mit kontrolliertem lokalem Auth-Provider.
- 4 Weiterleitungs-Browserfälle bestanden.

**357 unterschiedliche automatisierte Tests bestanden; keine offenen Fehlschläge nach den gezielten Nachprüfungen.** Wiederholungen werden nicht doppelt gezählt. Beide Produktionsbuilds und TypeScript-Prüfungen bestanden. Beide Produktionsabhängigkeitsprüfungen meldeten null bekannte Sicherheitslücken. Vorhandene Build-Hinweise betreffen große Karten-Chunks und den gemischten statischen/dynamischen Push-Import.

Supabase: Beide Migrationen erfolgreich angewendet, alle 45 öffentlichen Anwendungstabellen mit RLS. Die Serverrolle kann die neuen Lese-RPCs ausführen; ein unbekannter Benutzer gilt nicht als registriert. Anonyme direkte Tabellenabfragen werden abgewiesen. Edge-Revision 18 ist ACTIVE; der echte Health-Endpunkt meldet `0.b1.110`. Die neuen Admin- und Badge-Endpunkte antworten ohne Anmeldung mit 401. Es wurden keine Testkonten oder Testmatches in der Produktion angelegt.

Die Prüfung der neuen Vercel-Bereitstellungen erfolgt nach dem Git-Push; der Abschlussbericht nennt deren tatsächlich erreichten Status. Ein erfolgreicher lokaler Build wird nicht als Online-Deployment gezählt.

## Neue Akzeptanzprüfungen

Voraussetzung für SIM-01 bis SIM-12: lokale `SimulationService`-Instanz mit dem regulären `GameEngine` und isoliertem Persistenzadapter. Für SQL-Fälle: alle echten Migrationen in einer isolierten PostgreSQL/PGlite-Instanz, getrennte `authenticated`-/`service_role`-Rollen. Für Browserfälle: Chromium mit unabhängigen Sitzungen, laufender HTTP-Spielserver und Adminportal.

| Test-ID | Schritte und erwartetes Ergebnis | Tatsächliches Ergebnis | Status |
| --- | --- | --- | --- |
| SIM-01 | Als ein Admin Zone bestätigen, starten; automatisch sechs gültig positionierte Spieler und richtige Rollen | Sechs virtuelle Spieler, ein Hunter, keine echten Auth-Accounts | BESTANDEN |
| SIM-02 | Fremder Admin greift auf Simulations-ID zu | Zugriff abgelehnt | BESTANDEN |
| SIM-03 | Hider außerhalb platzieren, zurücksetzen und Rückkehr bestätigen | Echte GPS-Warnung, Freigabe erst nach gültiger Rückkehr, danach aufgehoben | BESTANDEN |
| SIM-04 | Zombie-Fang und Wiederbelebung auslösen | Rolle und Infektionsstatus durch reguläre Engine geändert | BESTANDEN |
| SIM-05 | Außerhalb verbleiben und Zeit vorspulen | Echte Zonentoleranz läuft ab; Spieler eliminiert | BESTANDEN |
| SIM-06 | Warnung und Test-Badge auslösen, zurücksetzen, alten Request senden | Zustände und Fortschritt gelöscht; alte Generation abgelehnt | BESTANDEN |
| SIM-07 | Timer ablaufen lassen, anschließend Simulation beenden | Feedback für jeden virtuellen Spieler; Testzustand gelöscht | BESTANDEN |
| SIM-08 | XP-Jagd + Zombie + Apokalypse starten; Punkt sammeln, fangen, Phase wechseln | Punkt zählt, Infektion erfolgt, Zone schrumpft; Fortschritt bleibt erhalten | BESTANDEN |
| SIM-09 | Zwei Ereignisse mit derselben Revision parallel senden | Genau eines bestätigt; kein stilles Überschreiben | BESTANDEN |
| SIM-10 | Pin-Event vor dem nächsten Intervall auslösen | Virtuelle Zeit erreicht den echten Veröffentlichungstermin; Pin erscheint | BESTANDEN |
| SIM-11 | Ausgewählten Testspieler Match verlassen lassen | Engine verarbeitet Austritt; andere Perspektive bleibt nutzbar | BESTANDEN |
| SIM-12 | Angepasste Definition und Fragebogenversion vor Simulationsstart bereitstellen | Eigene Kopie des aktuellen Katalogs übernommen | BESTANDEN |
| SIM-AUTH-01 / FEED-AUTH-01 | Nicht-Admin, fehlendes Ticket, fremdes Ticket und abgelaufene Auth-Sitzung verwenden | Sämtliche geschützten Funktionen verweigert | BESTANDEN |
| SIM-DATA-01 | Fertigen Simulationszustand in Testtabelle speichern | Keine Änderung echter Checkpoints, Nachrichten, Antworten oder Badges | BESTANDEN |
| FEED-ALL-01 | Kurzes regulär beendetes Match mit registrierten Spielern und Gast speichern; erneut speichern; nächstes Match beenden | Ein Angebot je Spieler/Match, auch beim Gast und nächsten Match | BESTANDEN |
| FEED-ALL-02 | Zufallswahrscheinlichkeit oder Mindestabstand über Settings senden | Unbekannte Einstellungen abgelehnt; keine Ausnahmen von „alle Spieler“ | BESTANDEN |
| FEED-02 / BADGE-01 | Negative Antwort mehrfach absenden; anderes Feedback vollständig überspringen; Gast antworten | Registrierter Absender erhält Beta-Tester genau einmal; Skip und Gast erhalten kein dauerhaftes Badge | BESTANDEN |
| FEED-SKIP-01 | Teilweise Antworten und leere Antwort nach Einzelfragen-Skips absenden | Beide vergeben Beta-Tester; gesamtes Feedback überspringen vergibt keines | BESTANDEN |
| FEED-03 | Fragenkatalog ändern; alte Antwort lesen; fremde User-Rolle abfragen | Ursprüngliche Version erhalten; fremde Zugriffe gesperrt | BESTANDEN |
| FEED-04 | Nur aktive Module, ungültige Sterne, zu langen Text und unbekannte Fragen prüfen | Passende Fragen; Manipulationen abgelehnt; einzelne Auslassungen erlaubt | BESTANDEN |
| FEED-05 | Fremdes Angebot, falsche Version und doppeltes Absenden versuchen | Fremde/ungültige Anfrage abgelehnt; Antwort idempotent gespeichert | BESTANDEN |
| BADGE-02 / BADGE-03 / BADGE-04 | Null Erfolge, erste Stufe, 20 Fänge, Maximalwert; Match erneut verarbeiten; Badge auswählen | Gesperrt → I → Hunter II → X; keine doppelten Zähler; Auswahl bleibt gespeichert | BESTANDEN |
| BADGE-05 | Alle zentralen Stufendefinitionen validieren | Aufsteigende Schwellen, I–X, Beta-Tester einmalig | BESTANDEN |
| SIM-BROWSER-01 | 320px: einzelner Admin startet; Perspektive wechseln; Zonenwarnung und beide Swipes bedienen | Echte Overlays, GPS-Sperre, Rückkehr und Zombie-Wechsel; kein Seitenüberlauf | BESTANDEN |
| SIM-BROWSER-02 | Ergebnis öffnen, Frage überspringen, negativ bewerten, absenden, neu laden, zurücksetzen | Test-Badge trotz ausgelassener Frage; Testdaten bleiben getrennt und Reset löscht Fortschritt | BESTANDEN |
| FEED-ALL-BROWSER-01 | Zwei Browser bei 390/1440px spielen; einer überspringt komplett, einer bewertet negativ; Profil-Badge wählen; Adminauswertung öffnen | Beide erhalten Angebot, Status bleibt nach Reload, Badge-Auswahl und echte Test-Antworten sichtbar; kein Simulationszugang auf Main-App | BESTANDEN |

## Bekannte Prüfgrenzen

- Kein physisches iPhone oder Android-Gerät angeschlossen. Touch- und schmale Ansichten sind Browserprüfungen.
- Keine echten Standortdaten an Produktionsmatches gesendet; die Simulation verarbeitet ausdrücklich virtuelle Positionen.
- Produktions-Login mit dem persönlichen Admin-Passwort und reale E-Mail-Zustellung werden nicht durch lokale Auth-Fixtures nachgewiesen.
- Lasttests mit vielen echten Nutzern wurden nicht auf den kostenlosen Produktionsdiensten ausgeführt.
- Die PostgreSQL-Sicherheitsprüfung meldete keine ERROR-Einträge. Bereits bestehende Hinweise betreffen erlaubte Gastanmeldungen, die nur serverseitig verwendete Verbrauchstabelle und den nicht aktivierten Schutz vor geleakten Passwörtern. Neue Tabellen haben RLS.

Anfänglich gefundene und korrigierte Probleme: doppelte Router-Instanzen im Admin-Build, zu randnahe virtuelle Rückkehrpositionen, zusätzliche XP-Metadaten in strenger GPS-Validierung und ein gemeinsam verwendetes Browser-Testkonto. Der bisherige Marker-Neuaufbau schloss offene Karten-Popups bei der Synchronisierung; Marker werden jetzt anhand ihrer ID aktualisiert. Die betroffenen Fälle wurden nach den Korrekturen erneut ausgeführt.
