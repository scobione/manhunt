# Supabase Edge-Betrieb

Die öffentliche Site bleibt unter https://manhunt-fieldgame.scobione.chatgpt.site erreichbar. Der Spielserver ist `manhunt-api` im vorhandenen Supabase-Free-Projekt `dxoleuqmhcnqnjyqdqvw`:

`https://dxoleuqmhcnqnjyqdqvw.supabase.co/functions/v1/manhunt-api/api/health`

## Ablauf und Zustand

- Das Frontend liest `/api/config` und wählt den HTTP-Transport. Es prüft alle etwa zwei Sekunden `/api/sync`; Kommandos gehen an `/api/events`. Polls und Kommandos laufen clientseitig nacheinander. Unklar quittierte Änderungen werden nicht automatisch wiederholt.
- Jede private Anfrage wird mit `Supabase Auth.getUser(token)` geprüft. Die Plattformoption `verify_jwt=false` ermöglicht öffentliche Health-/Config-Routen; sie deaktiviert **nicht** die eigene Authentifizierung der privaten Routen. Test-Authentifizierung wird beim Edge-Build entfernt. Kein privilegierter Schlüssel gelangt in den Browser.
- Jeder Request erstellt die vorhandene `GameEngine` aus einem konsistenten PostgreSQL-Snapshot. `edge_commit` prüft die Revision und speichert Änderungen und Audit-Eintrag atomar. Veraltete Schreibversuche werden höchstens achtmal auf frischem Zustand neu berechnet. Auch Konto-Löschung und Bereinigung invalidieren alte Snapshots.
- Nur `engine.view(lobbyId,verifiedUserId)` geht an den Browser. Private GPS-Proben, Fangcodes anderer Teilnehmer und Engine-Metadaten werden nicht über Datenbank-Abonnements verteilt. Die Koordinationstabellen und ihre RPCs sind für `anon`/`authenticated` gesperrt.
- Herzschläge gelten 20 Sekunden als aktuell. Nach über 30 Sekunden ohne Verarbeitung eines aktiven Matches pausiert das Match vor dem Nachholen von Fristen am letzten bekannten Serverzeitpunkt. Eine Verbindungslücke wird so nicht ungeprüft zur Eliminierung oder zum Sieg. Der Host setzt nach Wiederverbindung fort.
- Freundesänderungen und Benachrichtigungen erhöhen eine SQL-Revision. Clients laden betroffene Ansichten neu. Online-Präsenz wird nur bei aktivierter Profiloption ausgegeben.
- Ein kostenloser Datenbank-Cronjob führt stündlich die bestehende Löschroutine sowie die Bereinigung alter Quoten und Präsenz aus. Private Checkpoints werden nach 24 Stunden ohne Aktualisierung entfernt; Matchende löscht die Standortspuren im Checkpoint unmittelbar.

## Erneut bereitstellen

1. `npm ci`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run test:edge:e2e` ausführen.
2. Neue SQL-Migrationen mit Supabase anwenden. Bereits angewendete Migrationen nicht bearbeiten.
3. `npm run build` erzeugt Frontend, optionalen Node-Server und das Edge-Bundle unter `supabase/functions/manhunt-api/index.js`. Das Bundle ist generiert und ignoriert; Quelle sind `server/edge-*.ts`, die gemeinsame Engine und das gesperrte Lockfile.
4. `manhunt-api` mit `index.js` und `deno.json` deployen; beim Tool sowohl `entrypoint_path: index.js` als auch `import_map_path: deno.json` angeben. Authentifizierung erfolgt wie oben beschrieben im Handler. Supabase injiziert `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` selbst. Sie weder auslesen noch in GitHub oder Sites kopieren.
5. Health/Config müssen HTTP 200 und `configured:true` liefern. `/api/profile` ohne Bearer muss HTTP 401 liefern. CORS erlaubt ausschließlich die bestehende Site; für einen anderen Betreiber `origins` in `server/edge-entry.ts` bewusst ändern.
6. Das zugehörige Frontend auf Sites veröffentlichen und den GitHub-Live-Workflow ausführen. Öffentliche Tests legen keine Konten, Lobbys oder GPS-Daten an.

## Betriebsgrenzen

Supabase Edge Functions sind kurzlebig (Free derzeit maximal 150 Sekunden pro Worker). Das Spiel hängt deshalb weder von einem dauerhaften Prozess noch von dessen Timern ab. Bei geöffneten Clients werden Fristen bei den Requests ausgewertet; ohne Clients läuft keine kontinuierliche Simulation. PostgreSQL bleibt maßgeblich.

Der Free-Tarif enthält derzeit 500.000 Funktionsaufrufe im Monat. Beispiel: Zehn Spieler mit einem Poll alle zwei Sekunden erzeugen in 30 Minuten rund 9.000 Polls, zusätzlich zu Aktionen und Profilabrufen. Das ist kein unbegrenzter Dienst. Nutzung im [Supabase-Dashboard](https://supabase.com/dashboard/project/dxoleuqmhcnqnjyqdqvw) beobachten; keine automatischen Tarif-Upgrades eingerichtet. Die Edge-Variante ist auf maximal 100 gleichzeitig offene Lobbys begrenzt und verwendet eine gemeinsame Revisionskoordination. Große Last erfordert eine gesonderte Lastprüfung und eine Aufteilung der Koordination.

OSM-Kacheln, Google-Konfiguration und E-Mail-Versand haben eigene Regeln. Supabases Standard-Mailversand ist stark begrenzt; öffentliche Registrierung braucht geeigneten SMTP-Versand. Hintergrund-GPS auf iOS/Android bleibt unzuverlässig. Optionale externe Push-Zustellung ist ohne VAPID-Konfiguration nicht aktiv; In-App-Benachrichtigungen funktionieren bei geöffneter App.

Offizielle Quellen: [Laufzeitgrenzen](https://supabase.com/docs/guides/functions/limits), [Auth](https://supabase.com/docs/guides/functions/auth), [Secrets](https://supabase.com/docs/guides/functions/secrets), [Billing](https://supabase.com/docs/guides/platform/billing-on-supabase).
