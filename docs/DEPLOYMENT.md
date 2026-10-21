# Deployment

Die Quellen sind für Render (ein Node-Webservice und eine Static Site) und Supabase vorbereitet. Kein Testmodus auf einem öffentlich erreichbaren Server. Konfigurationswerte in `.env.example` sind bewusst leer; keine erfundenen Zugangsdaten.

## 1. Supabase Free

1. Ein **Free**-Projekt in einer europäischen Region erstellen. Kein kostenpflichtiges Upgrade wählen.
2. `supabase/migrations/202610200001_initial.sql` im SQL-Editor ausführen oder mit der Supabase CLI `supabase db push` anwenden. Die Migration aktiviert RLS, Profil-Trigger, private Avatarablage und serverseitige RPCs. Die SQL-Tests unter `tests/database.test.ts` erläutern die Invarianten.
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

Eine zusätzlich veröffentlichte Static Site enthält dieselbe React-Oberfläche. Solange Supabase und das Node-Backend fehlen, sind Google-Anmeldung und Online-Spiele dort nicht verfügbar. Das ist kein Ersatz für das vollständige Render/Supabase-Deployment. Der Zonenplaner und die öffentlichen Informationsseiten funktionieren ohne Konto. Es werden keine Spieler, Statistiken oder GPS-Signale simuliert.
