# b.0.69.44

Diese Version verbessert GPS-Pins, die konfigurierbaren Spielregeln und die Sicherheitshinweise. Frontend und beide Backend-Varianten verwenden dieselben Regeln. Der Paketname lautet `0.69.44-beta`.

## Bedienung

Im Warteraum öffnet der Host **Regeln konfigurieren**. **Hider-Pin alle** bietet 1, 2, 5, 10, 15, 20 und 30 Minuten sowie einen freien Minutenwert (10 Sekunden bis 60 Minuten). Zusätzlich lassen sich Hunter-Sichtbarkeit, Hunter-Aktualisierung (3–30 Sekunden), Ersatz-Pins und deren maximales Messalter (30 Sekunden bis 60 Minuten) einstellen. Die übrigen Regeln, Custom-Modus, Zonenphasen und Presets bleiben verfügbar. Alle Änderungen setzen die Bereitschaft der Crew zurück.

Jeder Spieler muss seine Standortfreigabe aktiv bestätigen. Nach dem Vorsprung erscheint der erste verfügbare Hider-Pin. Anschließend veröffentlicht der Server nach dem gewählten Intervall; fehlt eine neue Ortung, kann er die letzte bekannte verwenden. Ein Ersatz-Pin trägt den ursprünglichen Messzeitpunkt und die Kennzeichnung **ALT**. Ohne eine zuvor erhaltene Position gibt es keinen Pin. Nach ausdrücklichem Beenden der Freigabe wird kein Ersatz-Pin mehr veröffentlicht. Hunter-Positionen sind standardmäßig für aktive Spieler sichtbar; die letzte Ortung wird mit **LIVE** oder **ALT** markiert.

Außerhalb der bestätigten Zone erscheint eine Vollbildwarnung. Die Standardtoleranz beträgt 60 Sekunden; bestehende Lobbys behalten ihren zuvor gewählten Wert. Unzuverlässiges GPS oder eine Unterbrechung hält die serverseitig gesammelte Zeit an, ohne sie zu löschen. Erst zwei genaue Messungen innerhalb der Zone, mindestens 1,5 Sekunden auseinander, bestätigen die Rückkehr. Danach lässt sich der Hinweis nach rechts wegwischen. Der Swipe allein kann eine Rückkehr nicht vortäuschen. Eine Eliminierung setzt weiterhin eine aktuelle, verlässliche Außenmessung voraus.

Eine Notfallpause öffnet eine Vollbildansicht mit den zuletzt freigegebenen Positionen der Crew, Messalter und Genauigkeit. Die bestehende GPS-Freigabe läuft weiter; Spielfristen bleiben angehalten. Der Host kann fortsetzen, jeder Spieler kann die Standortfreigabe beenden oder das Match verlassen. Die Standortanzeige während einer Pause wird vor Bereitschaft und Freigabe ausdrücklich erklärt.

## Technische Grenzen

- iOS/Android-PWAs können bei gesperrtem Bildschirm oder im Hintergrund keine dauerhafte Ortung garantieren. Die App im Vordergrund halten. Kein künstliches GPS im Produktivbetrieb.
- Der kostenlose Edge-Betrieb synchronisiert Zustände ungefähr alle zwei Sekunden. Hunter-Ortungen werden standardmäßig höchstens alle drei Sekunden gesendet; Netzwerk und Betriebssystem können zusätzliche Verzögerung verursachen.
- Ersatz-Pins und Pausenkarten zeigen nur tatsächlich zuvor empfangene Positionen innerhalb des eingestellten Alterslimits. Fehlende oder widerrufene Standorte werden nicht ersetzt.
- Bestehende Lobbys erhalten fehlende neue Einstellungen beim Laden; individuell gewählte alte Werte werden nicht überschrieben. Für die Standardtoleranz von einer Minute gegebenenfalls **Countdown außerhalb der Zone: 60 Sekunden** speichern oder eine neue Lobby erstellen.
- Echte Geräte-Ortung bleibt zusätzlich vor Ort zu prüfen. Die automatisierten GPS-Szenarien verwenden ausschließlich gekennzeichnete lokale Testdaten.

Es wird keine zusätzliche kostenpflichtige Infrastruktur eingerichtet. Die bestehende Supabase-Edge-Funktion und die bestehende Sites-Veröffentlichung werden aktualisiert. Eine neue SQL-Migration ist für diese Version nicht erforderlich; die zusätzlichen Felder werden in den privaten, versionierten Spielzuständen gespeichert.

## Prüfung

- TypeScript und Produktionsbuild erfolgreich.
- 121 Engine-/API-/Edge-/Datenbank-/Zonentests bestanden.
- 29 lokale Browser-Szenarien bestanden: 8 Socket.IO, 6 Edge/GPS, 15 Produktionsbundle/Auth.
- Paketprüfung: keine bekannten Advisories bei `npm audit --omit=dev --audit-level=high`.
- Auf bekannte private Schlüssel- und Tokenmuster geprüfter Quellstand ohne Treffer. Öffentliche Supabase-Konfiguration bleibt ausdrücklich clientseitig verwendbar.

Öffentliche Anwendung: https://manhunt-fieldgame.scobione.chatgpt.site

Quellcode und veröffentlichte CI-Ergebnisse: https://github.com/scobione/manhunt/actions
