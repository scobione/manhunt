# MANHUNT

**Deine Stadt. Dein Spielfeld.** Ein quelloffenes GPS-Verfolgungsspiel für private Gruppen — React, TypeScript, Socket.IO, Supabase und MapLibre. MIT-lizenziert.

> **Stand:** Die Anwendung ist implementiert und lokal mit isolierten Mehrspieler-Browsertests geprüft. Supabase, Google OAuth und Render sind auf Wunsch des Projektinhabers noch nicht verbunden. Eine veröffentlichte Oberfläche ist deshalb noch kein online spielbarer Multiplayer-Dienst. Keine Gastkonten, künstlichen Spieler oder simulierten Standorte im Produktivbetrieb.

## Funktionen

- **Identität & Crew:** Supabase Google OAuth mit PKCE, eindeutige Benutzernamen, private Avatar-Uploads, Freundescodes, Anfragen, Blockieren, Einladungen, Datenschutz bei Online-Status, Benachrichtigungen, Profile und Matchhistorie.
- **Private Lobbys:** kryptografisch zufällige sechsstellige Codes, Einladungslinks, Bereitschaft, Host-Übertragung, Entfernen, Rollen-/Teamzuweisung, Regeln und gespeicherte Presets.
- **Autoritative Engine:** serverseitige Rollenauslosung, Vorbereitung und Hider-Vorsprung, periodische Pins, Bestätigungs-/Code-/GPS-Fänge, Infektionen, Ergebnisse und Wiederverbindung.
- **Acht Modi:** Normal, Zombie, Apokalypse, Hide & Seek, Last Survivor, Team Hunt, Infection Rush und Custom. Team Hunt erfordert mindestens vier Personen, zwei Hunter und je einen Hider pro Team. Last Survivor erfordert mindestens zwei Hider.
- **Karte & Zonen:** MapLibre, GeoJSON und Turf; Kreis, Viereck, Achteck; verschiebbare Eckpunkte, Radius, Rotation, Sperrbereiche, Sicherheitsbestätigung, lokale Zonen und GeoJSON-Export. Schrumpfende Zonen werden auf das bestätigte Gebiet begrenzt.
- **Outdoor-Sicherheit:** ausdrückliche GPS-Freigabe, Stoppen der Freigabe, Notfallpause für alle Spieler, Host-Wiederaufnahme, sicheres Verlassen, Genauigkeitsprüfung, Sprungerkennung und keine blinde Eliminierung bei ausbleibenden GPS-Proben.
- **Mobil:** responsive Oberfläche, PWA-Manifest, Symbole, Service Worker mit Offline-Hinweis, Infektions-Swipe, reduzierte Bewegung und optionale Web-Push-Einladungen.
- **Schutz & Betrieb:** validierte APIs/Sockets, Rate Limits, gefilterte Zustände pro Spieler, RLS, private Storage-Policies, atomare Datenbank-Checkpoints, Wiederaufnahme nach Neustart, Löschroutinen und Audit-Logs ohne GPS-/Tokeninhalte.

## Lokal starten

Node.js **22.12 oder neuer** und npm installieren:

```bash
npm ci
cp .env.example .env
# Die echten Werte des eigenen Supabase-Projekts in .env eintragen.
npm run dev
```

Frontend: `http://localhost:5173`. API: `http://localhost:3001`. Vite leitet `/api` und `/socket.io` an das Backend weiter. Ohne Supabase bleibt die Anmeldung deaktiviert; Spielmodi, Sicherheitsinformationen und Zonenplanung sind bereits nutzbar.

### Umgebungsvariablen

| Variable | Wo | Zweck |
| --- | --- | --- |
| `SUPABASE_URL` | Backend | Supabase-Projekt-URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend, geheim | Datenbankzugriff; niemals im Browser verwenden |
| `FRONTEND_URL` | Backend | exakte erlaubte Frontend-Origin; mehrere mit Komma trennen |
| `TRUST_PROXY=1` | Backend auf Render | genau ein Reverse-Proxy-Hop |
| `VITE_SUPABASE_URL` | Frontend, öffentlich | Supabase-Projekt-URL |
| `VITE_SUPABASE_ANON_KEY` | Frontend, öffentlich | Publishable-/Anon-Key |
| `VITE_API_URL` | Frontend, öffentlich | Backend-Origin; lokal leer lassen |
| `VITE_OPERATOR_NAME/ADDRESS/EMAIL` | Frontend | tatsächliche Betreiberangaben |
| `VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT` | Backend | optionale eigene Web-Push-Konfiguration |

Die Google-OAuth-Client-ID und das Client-Secret werden bei Supabase hinterlegt. Das Secret gehört weder in dieses Repository noch in eine `VITE_`-Variable.

## Tests

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
PLAYWRIGHT_CHROMIUM_PATH="$(node --input-type=module -e "import { chromium } from '@playwright/test'; console.log(chromium.executablePath())")" npm run test:e2e
npx playwright test -c playwright.public.config.ts
```

Unter Linux wird standardmäßig `/usr/bin/chromium` genutzt; `PLAYWRIGHT_CHROMIUM_PATH` überschreibt den Pfad. Der erste Browser-Testlauf startet eine isolierte Test-API und Vite im Testmodus selbst. Kein produktiver Server darf dabei auf Port 3001/5173 laufen.

**Testidentitäten und simulierte GPS-Koordinaten existieren ausschließlich in automatisierten Tests.** Der Backend-Bypass setzt gleichzeitig `NODE_ENV=test` und `TEST_AUTH=true` voraus. Im Frontend sind zusätzlich der Vite-Modus `test` und `VITE_TEST_AUTH=true` notwendig. Ein Produktionsserver verweigert den Start mit aktiviertem `TEST_AUTH`.

Die SQL-Regressionstests führen die unveränderte Migration in echtem PostgreSQL als WASM (PGlite) aus. Minimale Auth-/Storage-Testschemas bilden ausschließlich die Plattformverträge ab. Google OAuth, Supabase Storage-Bytes, reale Geräteortung und der Betrieb auf Render benötigen zusätzliche Tests nach Einrichtung der echten Dienste.

Details und tatsächlich ausgeführte Ergebnisse: [Testbericht](docs/TESTING.md).

## Deployment

Die vollständige Anleitung steht in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). `render.yaml` definiert genau einen Free-Node-Service und eine kostenlose Static Site. Die Supabase-Migration liegt unter [supabase/migrations](supabase/migrations). GitHub Actions führt Build und Tests aus; Render kann nach erfolgreichen Checks deployen.

Ein einzelner Node-Prozess ist die Spielautorität. Mehrere Instanzen sind ohne zusätzliche verteilte Sperren und Socket-Adapter nicht unterstützt. Der Server speichert Zustände vor erfolgreicher Bestätigung einer Aktion; nach einem Neustart werden laufende Matches sicher pausiert wiederhergestellt.

## Grenzen

- **Hintergrund-GPS:** iOS und Android können eine PWA im Hintergrund anhalten. Während eines Matches muss die App im Vordergrund bleiben. Das ist keine native Hintergrundortungs-App.
- **GPS-Spoofing:** Koordinaten aus einem Browser sind kein fälschungssicherer Beweis. Fangbestätigung oder persönlicher Fangcode sind die empfohlenen Regeln. Standortausfälle führen nicht automatisch zu einer Zoneneliminierung.
- **Kostenlose Dienste:** Render-Free-Server können einschlafen; Supabase/Render haben Kapazitäts- und Nutzungsgrenzen. Kostenfreiheit ist nur innerhalb der jeweiligen Konditionen möglich, nicht für unbegrenzte öffentliche Nutzung garantiert.
- **Karten:** sichtbare OSM-Kacheln werden direkt geladen und korrekt attribuiert. Kein Offline-Prefetch. Tile-Verfügbarkeit hängt vom Anbieter ab. Selbst definierte Zonen ersetzen keine Prüfung von Wegen, Verkehr und Betretungsrechten.
- **Freunde suchen:** per exaktem Freundescode und innerhalb der eigenen Crew; bewusst kein öffentlich durchsuchbares Personenverzeichnis.
- **Optionale Funktionen:** Fangcode und Bestätigung sind implementiert; QR-Fangscanning ist nicht enthalten. Push benötigt VAPID sowie Browserunterstützung; ein Push signalisiert keine verlässliche Hintergrundortung.
- **Sicherheitsstand:** automatisierte Berechtigungs-/RLS-Tests und Abhängigkeitsprüfung sind enthalten. Sie ersetzen keine unabhängige Sicherheitsprüfung und keine Rechtsprüfung der Betreiberangaben.

## Projektaufbau

```text
src/                  React-Oberfläche, Karte, Zonen-Editor
shared/types.ts       Gemeinsame Spielverträge und Standardregeln
server/engine.ts       Autoritativer Spielzustand und Regelwerk
server/app.ts          Authentifizierte REST-/Socket-Schnittstelle
server/repository.ts   Supabase-Persistenz; isolierter Testadapter
supabase/migrations/  Tabellen, RLS, Storage und Transaktionsfunktionen
tests/                Engine-, API-, SQL- und Playwright-Prüfungen
public/               PWA-Symbole, Manifest und Offline-Seite
render.yaml           Free-Deployment-Konfiguration
```

Beiträge: [CONTRIBUTING.md](CONTRIBUTING.md). Sicherheitsmodell: [SECURITY.md](SECURITY.md). Datenbankverträge: [docs/DATABASE.md](docs/DATABASE.md).
