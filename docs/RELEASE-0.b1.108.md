# MANHUNT 0.b1.108 — Vollbild-Countdown

Beim Start zeigt die Spielansicht einen bildschirmfüllenden Countdown von 5 bis 1. Anschließend erscheinen Rolle und Spieloberfläche automatisch. Die Rollenansicht und Karte werden währenddessen nicht gerendert; der modale Dialog sperrt auch die Hintergrundnavigation für Tastatur und Touch.

Die fünf Sekunden beziehen sich auf das bereits vorhandene, unveränderliche serverseitige Ereignis `match_started`. Empfangsverzögerungen verkürzen entsprechend die noch sichtbare Restzeit. Der Client benutzt für den Ablauf eine monotone Uhr statt der möglicherweise falsch eingestellten Gerätezeit. Nachfolgende Synchronisierungen starten den Countdown nicht neu. Reload zeigt die verbleibende Zeit; nach Ablauf oder beim späteren Einstieg erscheint direkt das Spiel.

Es handelt sich um die Startdarstellung, keine zusätzliche Spielphase: bestehende Vorbereitungszeit, Spielzeit und Hider-Vorsprung laufen nach ihren unveränderten Serverregeln. Auch bei Vorbereitungszeit 0 wird die Rolle erst nach dem Countdown angezeigt. Die GPS-Freigabe aus der Lobby läuft weiter. Pause, Spielende und Eliminierung haben Vorrang. Animationen berücksichtigen reduzierte Bewegung. Keine Datenbankänderung, keine neue Berechtigung oder Speicherung. Adminportal und Admin-Konfiguration bleiben unverändert.

## Browserprüfungen

Alle Multiplayer-Prüfungen laufen gegen isolierte lokale Server mit ausdrücklich gekennzeichneten Testidentitäten und GPS-Fixtures. Es werden keine Teststandorte an Produktionsmatches gesendet.

| ID | Voraussetzungen / Schritte | Erwartetes Ergebnis |
| --- | --- | --- |
| COUNTDOWN-01 | Desktop-Host und mobiler Mitspieler in bereiter Lobby; Host startet | Host sieht 5, 4, 3, 2, 1; vor Ablauf keine Rolle oder Karte im DOM; danach Hunter-Ansicht |
| COUNTDOWN-02 | Dasselbe Match im zweiten Browser | Vollbild-Dialog auch beim Mitspieler; danach Hider-Ansicht; bestehende GPS-Freigabe bleibt aktiv |
| COUNTDOWN-03 | Reduzierte Bewegung aktivieren; bei 3 neu laden; nach Ablauf Seite verlassen und zurückkehren | Keine Zahlenanimation; Restzeit höchstens 3; später kein erneuter Countdown; Scrollsperre aufgehoben |
| COUNTDOWN-04 | 30 Sekunden Vorbereitung und 60 Sekunden Vorsprung; während Intro pausieren, später fortsetzen und beenden | Serverzeiten unverändert; Pause verdrängt Intro; Fortsetzen zeigt Vorbereitung ohne erneuten Countdown; Ergebnis erreichbar |

Die ersten beiden Prüfungen sind im bestehenden Browserfall LOBBY-PERM-01 enthalten. Alle vier Akzeptanzprüfungen bestanden. Ein zunächst mehrdeutiger Testselektor für die beiden vorhandenen Fortsetzen-Buttons wurde präzisiert und erfolgreich erneut ausgeführt.

Lokal bestanden 255 Unit-/Engine-/API-/SQL-Tests, 9 Socket-Browserfälle und 28 Edge-Browserfälle: **292 unterschiedliche Tests, 0 verbleibende Fehler**. TypeScript und Produktionsbuild bestanden. Die vier Browserfälle der Lobby-/Countdown-Datei wurden nach dem abschließenden Abgleich der monotonen Uhr nochmals erfolgreich ausgeführt. GitHub führt die gesamte bestehende Pipeline beim Push zusätzlich aus. Die veröffentlichte Vercel-Seite wird anschließend mit echten, ausschließlich lesenden Browserprüfungen geprüft; deren Erfolg wird erst nach der Ausführung gemeldet.

## Weiterhin offene Punkte

Die vorherige Version 0.b1.107 enthält die Standortpflicht vor dem Start, die freiwillige Push-Freigabe im Warteraum sowie die genehmigten Textänderungen. Für vollständige Rechtstexte fehlen weiterhin die zur Veröffentlichung bestimmten Betreiberangaben, die Altersregel und die endgültige Freigabe der Nutzungsbedingungen. Die App wird deshalb nicht als abschließend rechtlich geprüft bezeichnet. Physische iPhone-/Android-Geräte sind für diese Prüfung nicht verfügbar; mobile Bildschirmgrößen und reduzierte Bewegung werden im Browser geprüft.
