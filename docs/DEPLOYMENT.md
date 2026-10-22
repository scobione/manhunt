# Deployment

Die Quellen sind für Render (ein Node-Webservice und eine Static Site) und Supabase vorbereitet. Kein Testmodus auf einem öffentlich erreichbaren Server. Konfigurationswerte in `.env.example` sind bewusst leer; keine erfundenen Zugangsdaten.

## Bereits eingerichtet — 22.10.2026

[MANHUNT auf Supabase](https://supabase.com/dashboard/project/dxoleuqmhcnqnjyqdqvw) läuft im Free-Tarif in Frankfurt (`eu-central-1`). Beide Migrationen sind angewendet, alle 21 Tabellen verwenden RLS, der Bucket `avatars` ist privat (2 MB, JPEG/PNG/WebP). Der Auth-Einstellungsendpunkt bestätigt jetzt `google: true`. Der OAuth-Start antwortet mit HTTP 302 zu Google und dem korrekten Supabase-Callback. Ein vollständiger Login mit einem echten Google-Konto muss noch vom Kontoinhaber bestätigt werden. Keine echten Konten oder Standortdaten wurden für die Einrichtung angelegt.

Die bestehende Website-Adresse kann bleiben. Sites liefert derzeit den statischen React-Build; der vorhandene Node-/Express-/Socket.IO-Prozess läuft dort nicht. Render ist optional: Ein anderer geeigneter Node-Host mit WebSockets funktioniert ebenfalls. Für Sites wäre ein eigener Worker-Transport samt dauerhaft koordinierter Spielzustände erforderlich; die lokale Entwicklungsumgebung ist kein Produktionshost. Supabase Edge Functions sind kein unveränderter Ersatz für diesen Prozess: Im Free-Tarif endet ein Worker spätestens nach 150 Sekunden ([Laufzeitgrenzen](https://supabase.com/docs/guides/functions/limits)). Für die vorhandene Site wird kein zweites Frontend benötigt.

## 1. Supabase für eine eigene Installation

1. Ein **Free**-Projekt in einer europäischen Region erstellen. Kein kostenpflichtiges Upgrade wählen.
2. Alle Dateien unter `supabase/migrations/` in Reihenfolge mit der Supabase CLI `supabase db push` anwenden. Im bereits eingerichteten MANHUNT-Projekt nicht erneut ausführen. Die Migrationen aktivieren RLS, Profil-Trigger, private Avatarablage und serverseitige RPCs. Die SQL-Tests unter `tests/database.test.ts` erläutern die Invarianten.
3. Projekt-URL und Publishable-/Anon-Key im Frontend konfigurieren. Den Service-Role-Key ausschließlich beim Backend hinterlegen.
4. Unter Auth → URL Configuration die echte HTTPS-Adresse der Frontend-Site als Site URL und erlaubte Redirect URL konfigurieren. Bei lokaler Entwicklung `http://localhost:5173` explizit ergänzen. Keine Wildcard für fremde Domains.
5. Unter Auth → Providers → Google aktivieren. Den OAuth-Client im eigenen Google-Cloud-Projekt erstellen. Die von Supabase angegebene `https://<project-ref>.supabase.co/auth/v1/callback`-Adresse als erlaubte Google-Redirect-URI eintragen. Client-ID und Client-Secret nur in Supabase speichern. Für externe Nutzer gegebenenfalls den Consent-Screen veröffentlichen; bei Google-Testbetrieb Testnutzer hinzufügen.

Offizielle Anleitung: [Supabase Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google).

## 2. Render Free

Das Repository `https://github.com/scobione/manhunt` in Render als **Blueprint** verbinden. `render.yaml` legt ausschließlich einen Free-Webservice und eine kostenlose Static Site an. Beim Bestätigen nochmals kontrollieren, dass keine kostenpflichtige Ressource hinzugefügt wird.

Backend-Konfiguration:

- `SUPABASE_URL`: Projekt-URL.
- `SUPABASE_SERVICE_ROLE_KEY`: ausschließlich serverseitiger Schlüssel.
- `FRONTEND_URL`: exakte Origin der tatsächlich verwendeten Frontend-Site (inklusive `https://`, ohne abschließenden Pfad).
- `NODE_ENV=production`; niemals `TEST_AUTH=true`.

Frontend-Konfiguration:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`: öffentliche Supabase-Konfiguration.
- `VITE_API_URL`: HTTPS-Origin des Render-Backends, ohne `/api` am Ende.
- `VITE_OPERATOR_NAME`, `VITE_OPERATOR_ADDRESS`, `VITE_OPERATOR_EMAIL`: tatsächliche Betreiberinformationen.

`VITE_`-Werte werden beim Build eingebettet. Nach Änderungen neu deployen. Die vom Blueprint erzeugten URLs können je nach Namensverfügbarkeit abweichen; keine angenommene `onrender.com`-Adresse verwenden. Erst nach Erzeugung die tatsächlichen Adressen in CORS und OAuth-Allowlist übernehmen.

Push ist optional. Eigene VAPID-Schlüssel erzeugen (`npx web-push generate-vapid-keys`) und `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:<Betreiberkontakt>` nur im Backend konfigurieren. Schlüssel nicht committen. Ohne VAPID bleiben In-App-Benachrichtigungen verfügbar.

GitHub Actions prüft TypeScript, Engine/API, Build, Bibliotheks-Advisories und isolierte Chromium-E2E-Tests. Render ist auf Deployments nach erfolgreichen Checks eingestellt. Die Verbindung zwischen Render und GitHub muss vom Kontoinhaber einmal freigegeben werden.

## 3. Funktion nach der Einrichtung wirklich prüfen

- Zwei echte Google-Konten auf getrennten Geräten anmelden.
- Profilbild ändern, Freundescode senden, Anfrage annehmen, Lobby-Einladung öffnen.
- Mit zwei Geräten dieselbe Lobby betreten, Zone bestätigen, bereit melden, starten.
- Standortfreigabe bewusst erlauben. Tatsächliche Geräte-GPS-Funktion draußen prüfen; simulierte Playwright-Koordinaten ersetzen diesen Schritt nicht.
- Normal-Fang mit Bestätigung, Zombie-Wechsel und Apokalypse-Zonenwechsel prüfen.
- App in Hintergrund schicken und zurückholen; Warnhinweis und Synchronisierung prüfen.
- Freigabe stoppen, Notfallpause, Verlassen, Konto- und Standortdatenlöschung prüfen.
- iPhone Safari/Home-Screen und Android Chrome/Home-Screen getrennt prüfen.

## Grenzen kostenloser Dienste — geprüft am 20.10.2026

Render-Free-Webservices schlafen nach 15 Minuten ohne eingehenden Verkehr ein; ein Workspace erhält 750 Free-Instanzstunden pro Monat. Ein Neustart kann Wartezeit verursachen. Dateisystemänderungen sind nicht dauerhaft. Die App speichert Spielzustände in Supabase und braucht nach Unterbrechungen eine sichere Wiederaufnahme. Es wird kein künstlicher Keepalive-Dienst eingesetzt. Render weist auf zusätzliche Gebühren bei Überschreitung bestimmter Bandbreitenkontingente hin: vor Aktivierung die aktuellen Workspace-Limits und Abrechnungseinstellungen prüfen. Eine Zusage „unter allen Umständen kostenlos“ wäre falsch. [Render Free](https://render.com/docs/free)

Supabase Free umfasst derzeit 500 MB Datenbank und 1 GB Dateiablage. Nutzung und aktuelle Limits im Dashboard beobachten; keinen kostenpflichtigen Tarif automatisch aktivieren. [Supabase Billing](https://supabase.com/docs/guides/platform/billing-on-supabase)

OSM-Kacheln benötigen dauerhaft sichtbare Attribution. Kein Offline-Kachelpaket und kein Massen-Prefetch. Für größere öffentliche Nutzung einen geeigneten Tile-Anbieter oder selbst gehostete Kacheln wählen. [OSM Tile Policy](https://operations.osmfoundation.org/policies/tiles/)

## Sites-Veröffentlichung

Die Static Site unter [manhunt-fieldgame.scobione.chatgpt.site](https://manhunt-fieldgame.scobione.chatgpt.site) wurde am 21.10.2026 veröffentlicht und enthält dieselbe React-Oberfläche. Google-Anmeldung ist ab Version 0.2.1 verbunden. Nach der Rückleitung verifiziert die App die Sitzung über Supabase und bietet Abmelden an. Ohne Node-Backend bleiben Spielprofile, Freunde, Lobbys und Online-Spiele noch nicht verfügbar. Das ist kein Ersatz für das vollständige Render/Supabase-Deployment. Der Zonenplaner und die öffentlichen Informationsseiten funktionieren ohne Konto. Es werden keine Spieler, Statistiken oder GPS-Signale simuliert.

Der GitHub-Workflow **Published frontend smoke** öffnet diese HTTPS-Adresse mit Chromium und speichert Screenshots. Er lässt sich unter Actions erneut starten. Seine Prüfungen umfassen die öffentlichen Seiten und den Beginn des PKCE-Anmeldewegs. Dafür wird der Autorisierungsrequest im Browser geprüft, ohne eine Google-Sitzung zu simulieren. Authentifizierte Live-Prüfungen mit echten Konten bleiben erforderlich. Lokale, ausdrücklich simulierte Sitzungstests laufen nur in `auth.spec.ts`, niemals gegen die öffentliche Website.

## Noch notwendige externe Einrichtung

Die vorhandene Supabase-Verbindung erlaubt Tabellen, Migrationen, Storage und Prüfungen. Sie bietet hier kein Werkzeug zum Bearbeiten der Google-Providerkonfiguration; ein Google-Cloud-Zugang und ein Node-Hosting-Zugang sind ebenfalls nicht verbunden. Deshalb bleiben genau diese Einrichtungsschritte offen:

1. Google ist bereits aktiviert. Für spätere Änderungen oder weitere Testnutzer: Eigenen Google-OAuth-Webclient erstellen und unter [Supabase Auth Providers](https://supabase.com/dashboard/project/dxoleuqmhcnqnjyqdqvw/auth/providers) konfigurieren. Google-Redirect-URI: `https://dxoleuqmhcnqnjyqdqvw.supabase.co/auth/v1/callback`. Unter Supabase URL Configuration die Site `https://manhunt-fieldgame.scobione.chatgpt.site` und Redirect `https://manhunt-fieldgame.scobione.chatgpt.site/auth/callback` erlauben.
2. Geeigneten Node-Host verbinden; den serverseitigen Supabase-Schlüssel ausschließlich als Server-Umgebungsvariable setzen. Backend-URL danach im Frontend konfigurieren und neu veröffentlichen. Der öffentliche Supabase-Schlüssel kann über die vorhandene Verbindung gelesen werden.
3. Tatsächliche Betreiberangaben hinterlegen und Anmeldung/Multiplayer mit realen Konten und mobilen Geräten prüfen.

Die Dateien der ersten Migration wurden auf die tatsächlich auf Supabase gespeicherte Version `20261022061735` umbenannt; ihr SQL-Inhalt blieb identisch. Die Performance-Migration ist `20261022062300`. Bereits früher mit der alten lokalen Versionsnummer eingerichtete Fremdinstallationen müssen ihren Migrationsverlauf abgleichen, bevor `db push` läuft; die erste Migration nicht doppelt anwenden.

Die öffentliche Supabase-Projektkonfiguration ist unter `src/public-config.json` hinterlegt und wird nur in Produktionsbuilds als Vorgabe verwendet. Die privaten Server-/OAuth-Schlüssel bleiben vollständig außerhalb des Frontends.
