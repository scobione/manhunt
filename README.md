# MANHUNT

**Deine Stadt. Dein Spielfeld.** Ein quelloffenes GPS-Verfolgungsspiel für private Gruppen — React, TypeScript, Socket.IO, Supabase und MapLibre. MIT-lizenziert.

> **Stand b.0.69.46:** Der Multiplayer-Server läuft als Supabase Edge Function und speichert autoritative Spielstände in PostgreSQL. Die React-App bleibt auf der bestehenden Sites-Adresse. Der Edge-Betrieb synchronisiert per authentifizierten HTTPS-Anfragen im Abstand von etwa zwei Sekunden; das Node-/Socket.IO-Backend bleibt als alternative Betriebsart erhalten. 27 Tabellen verwenden RLS, Profilbilder liegen in privatem Storage. E-Mail/Passwort und Gastbeitritt nutzen Supabase Auth. Mailzustellung und Profilbilder wurden vom Nutzer bestätigt; physische Kamera-, Push- und GPS-Prüfungen bleiben geräteabhängig. Keine künstlichen Spieler oder simulierten Standorte im Produktivbetrieb.

**Veröffentlichte Oberfläche:** [MANHUNT öffnen](https://manhunt-fieldgame.scobione.chatgpt.site). **Quellcode und CI:** [scobione/manhunt](https://github.com/scobione/manhunt). Die Zone führt nach dem Speichern zur Lobby-Erstellung. Danach Code teilen, Zone bestätigen, alle bereit melden und Match starten.

## Funktionen

- **Identität & Crew:** Supabase E-Mail/Passwort mit PKCE, Verifizierungscode und anonyme Gastsitzungen, eindeutige Benutzernamen, private Avatar-Uploads, Freundescodes, Anfragen, Blockieren, Einladungen, Datenschutz bei Online-Status, Benachrichtigungen, Profile und Matchhistorie.
- **Private Lobbys:** kryptografisch zufällige sechsstellige Codes, Einladungslinks, Bereitschaft, Host-Übertragung, Entfernen, Rollen-/Teamzuweisung, Regeln und gespeicherte Presets.
- **Autoritative Engine:** serverseitige Rollenauslosung, Vorbereitung und Hider-Vorsprung, periodische Pins, Bestätigungs-/Code-/GPS-Fänge, Infektionen, Ergebnisse und Wiederverbindung.
- **Acht Modi:** Normal, Zombie, Apokalypse, Hide & Seek, Last Survivor, Team Hunt, Infection Rush und Custom. Team Hunt erfordert mindestens vier Personen, zwei Hunter und je einen Hider pro Team. Last Survivor erfordert mindestens zwei Hider.
- **Karte & Zonen:** MapLibre, GeoJSON und Turf; Kreis, Viereck, Achteck; verschiebbare Eckpunkte, Radius, Rotation, Sperrbereiche, Sicherheitsbestätigung, lokale Zonen, GeoJSON-Export und validierter Import mit erneuter Sicherheitsbestätigung. Schrumpfende Zonen werden auf das bestätigte Gebiet begrenzt.
- **GPS-Regeln:** Pin-Intervalle in Minuten oder frei konfigurierbar, erste Meldung nach dem Vorsprung, auf Wunsch laufend aktualisierte Hunter-Positionen und deutlich markierte Ersatz-Pins mit dem Alter der letzten Ortung.
- **Outdoor-Sicherheit:** ausdrückliche GPS-Freigabe, Stoppen der Freigabe, Vollbild-Zonenwarnung mit GPS-geprüfter Rückkehr per Swipe und standardmäßig 60 Sekunden Toleranz, stabiler Countdown bei GPS-Aussetzern, Notfallpause mit Standortkarte für alle Spieler, Host-Wiederaufnahme, sicheres Verlassen, Genauigkeitsprüfung, Sprungerkennung und keine blinde Eliminierung bei ausbleibenden GPS-Proben.
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

Frontend: `http://localhost:5173`. API: `http://localhost:3001`. Vite leitet `/api` und `/socket.io` an das Backend weiter. Der Produktionsbuild verwendet die öffentliche Projektkonfiguration unter `src/public-config.json`; eigene `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` überschreiben sie. Entwicklungs- und Testbuilds verwenden diese Produktionsvorgabe nicht. Ohne Supabase-Konfiguration bleibt die Anmeldung deaktiviert; Spielmodi, Sicherheitsinformationen und Zonenplanung sind bereits nutzbar.

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

Die Google-OAuth-Client-ID und das Client-Secret werden bei Supabase hinterlegt. Das Secret gehört weder in dieses Repository noch in eine `VITE_`-Variable. `src/public-config.json` enthält ausschließlich Projekt-URL und Publishable-Key: Dieser Schlüssel ist ausdrücklich für Browser vorgesehen und erlaubt keine privilegierten Serverzugriffe. Service-Role- und OAuth-Secrets sind dort verboten.

## Tests

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
PLAYWRIGHT_CHROMIUM_PATH="$(node --input-type=module -e "import { chromium } from '@playwright/test'; console.log(chromium.executablePath())")" npm run test:e2e
npm run test:edge:e2e
npx playwright test -c playwright.public.config.ts
```

Unter Linux wird standardmäßig `/usr/bin/chromium` genutzt; `PLAYWRIGHT_CHROMIUM_PATH` überschreibt den Pfad. Der erste Browser-Testlauf startet eine isolierte Test-API und einen gebauten Frontend-Teststand ohne Entwicklungs-HMR selbst. Kein produktiver Server darf dabei auf Port 3001/5173 laufen.

**Testidentitäten und simulierte GPS-Koordinaten existieren ausschließlich in automatisierten Tests.** Der Backend-Bypass setzt gleichzeitig `NODE_ENV=test` und `TEST_AUTH=true` voraus. Im Frontend sind zusätzlich der Vite-Modus `test` und `VITE_TEST_AUTH=true` notwendig. Ein Produktionsserver verweigert den Start mit aktiviertem `TEST_AUTH`.

Die SQL-Regressionstests führen alle eingecheckten Migrationen unverändert in echtem PostgreSQL als WASM (PGlite) aus. Minimale Auth-/Storage-Testschemas bilden ausschließlich die Plattformverträge ab. Google OAuth, Supabase Storage-Bytes, reale Geräteortung und der Betrieb auf Render benötigen zusätzliche Tests nach Einrichtung der echten Dienste.

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
- **Optionale Funktionen:** QR-Fangscanning, Fangcode und Bestätigung sind implementiert. Der Edge-Server verwaltet VAPID und zeitgesteuerte Web-Push-Zustellung. Browserfreigabe ist erforderlich; ein Push signalisiert keine verlässliche Hintergrundortung.
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

## Aktuelle Veröffentlichung

[Release b.0.69.43](docs/RELEASE-b.0.69.43.md) beschreibt die Bereitstellung, Prüfgrenzen und den vom Nutzer gewünschten späteren Codex-Security-Check. [Edge-Betrieb](docs/EDGE-DEPLOYMENT.md) erklärt Zustandsabgleich, Wiederverbindung und Free-Tier-Grenzen.

Aktuelle Änderungen und Auth-Dashboard-Schritte: [Release b.0.69.46](docs/RELEASE-b.0.69.46.md).
