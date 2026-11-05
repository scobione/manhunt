# Erweiterung 0.B2.1

[Releasebericht](RELEASE-0.B2.1.md). Vor dem Backend-/Frontend-Update in dieser Reihenfolge die additiven Migrationen `rematch_and_achievement_metrics`, `community_library_reports` und `profile_customization_and_badge_order` anwenden. Die Änderungen erhalten dieselben Benutzer und bisherigen Ergebnisse. Anschließend `npm run build:edge` und die Funktion `manhunt-api` aktualisieren; beide Git-verknüpften Vercel-Projekte aus demselben Commit bauen. Keine neuen Umgebungsvariablen erforderlich. Profilbanner und Berichtsbilder liegen in privaten Storage-Buckets; bei Kontolöschung werden diese Objekte wie Avatare entfernt.

# Erweiterung 0.B2

Neue Spielerprofile und Badge-Sichtbarkeit: [Releasebericht](RELEASE-0.B2.md). Vor dem Backend-/Frontend-Update die additive Migration `profile_badge_visibility` anwenden. Sie erweitert dieselbe Supabase-Datenbank um eine RLS-geschützte Präferenztabelle und zwei servergebundene Profilfunktionen. Keine neuen Variablen oder Dienste. Die gespeicherten Benutzer und Erfolge bleiben erhalten. Die CLI-generierte lokale Migration ist im Repository enthalten; für dieses bestehende Projekt werden Migrationen über die verbundene Supabase-Integration angewendet.

# Erweiterung 0.b1.111

Automatisch aktive XP-Punkte, fünf persönliche Meldungen nicht erreichbarer Punkte pro Match und weiter entfernte Ersatzpunkte: [Releasebericht](RELEASE-0.b1.111.md), [Tests](TEST-REPORT-0.b1.111.md). Bestehende Vercel-Projekte und Supabase-Checkpoints bleiben erhalten; keine Migration oder neuen Geheimnisse. Der Backend-Deploy muss vor beziehungsweise zusammen mit dem neuen Frontend erfolgen. Für den tatsächlichen Live-Stand gelten die Vercel-Deploymentdaten und `/api/health` der Edge Function.

# Erweiterung 0.b1.110

Simulation, Feedback für alle Teilnehmer und Badge-Stufen I–X: [Releasebericht](RELEASE-0.b1.110.md), [ausgeführte Tests](TEST-REPORT-0.b1.110.md). Bestehende Domains: https://manhunt-pwa.vercel.app und https://manhunt-admin-scobione.vercel.app. Zwei additive Datenbankmigrationen, 45 RLS-geschützte Anwendungstabellen, Supabase-Edge-Revision 18 (ACTIVE, Health `0.b1.110`). Keine neuen Geheimnisse oder kostenpflichtigen Dienste.

Das Admin-Vercel-Projekt hat `sourceFilesOutsideRootDirectory` aktiviert, Root Directory `admin`, Install `npm ci --prefix .. && npm ci`, Build `npm run build`, Ausgabe `dist`. Dadurch verwendet die geschützte Simulationsansicht dieselbe Engine und dieselben UI-Komponenten wie das Spiel. Beide Projekte bleiben mit GitHub `scobione/manhunt`, Branch `main`, verbunden. Live-Verifikation der Frontends folgt auf den Git-Push; deren Abschlussstatus steht im Veröffentlichungsbericht des ausführenden Agenten.

# Erweiterung 0.b1.108

Fünfsekündiger Vollbild-Countdown vor der Rollenanzeige. Weiterhin dasselbe Vercel-Spielprojekt und Supabase-Projekt; keine Migration, neuen Variablen oder Dienste. Siehe [Releasebericht](RELEASE-0.b1.108.md).

# Erweiterung 0.b1.107

[Releasebericht](RELEASE-0.b1.107.md): Standortpflicht vor dem Spielstart, freiwilliges Push im Warteraum und explizit genehmigte Textänderungen. Frontend: bestehendes Vercel-Spielprojekt. Backend: bestehende Supabase Edge Function. Keine neuen Umgebungsvariablen, Migrationen oder kostenpflichtigen Ressourcen. Laufende Matches bleiben erhalten. Admin-Anwendung und Admin-Konfiguration bleiben unverändert.

# Aktuelle Korrektur 0.b1.106

[Releasebericht](RELEASE-0.b1.106.md): Fehlerbehandlung für abgelaufene E-Mail-Links, direkte erneute Reset-Anforderung und unveränderte Kontodaten. Bestehende Domains und Supabase-Redirects bleiben gültig.

# Aktuelle Erweiterung 0.b1.103

Spiel: https://manhunt-pwa.vercel.app. Eigenständiges Admin-Portal: https://manhunt-admin-scobione.vercel.app. Beide Vercel-Projekte bauen automatisch aus demselben GitHub-Repository; das Admin-Projekt verwendet Root Directory `admin`. Dieselbe Supabase-Datenbank und Auth bleiben erhalten. Details und tatsächliche Prüfgrenzen: [Admin-Betrieb](ADMIN-PORTAL.md), [Admin-Testbericht](ADMIN-TEST-REPORT.md).

# Deployment: Vercel und Supabase

Stand: 27.10.2026, Beta 0.b1.102. Die frühere vollständige Akzeptanzmatrix bleibt bei 126/134 bestandenen und 8 blockierten IDs; die zusätzlichen Kartenprüfungen stehen im aktuellen Releasebericht.

- Produktionsdomain: https://manhunt-pwa.vercel.app
- Vercel-Projekt: `manhunt-pwa`, Hobby; GitHub `scobione/manhunt`, Produktion `main`.
- Bestehende Datenbank und Auth: Supabase `dxoleuqmhcnqnjyqdqvw`, Frankfurt, Free.
- API: https://dxoleuqmhcnqnjyqdqvw.supabase.co/functions/v1/manhunt-api
- Bisherige Website: https://manhunt-fieldgame.scobione.chatgpt.site

Die Migration b.0.69.48 wurde als geschützte Vorschau geprüft und auf der Produktionsdomain veröffentlicht. Beta 0.b1.102 korrigiert die GPS-Marker beim Kartenzoom; Nachweise und verbleibende Abnahmegrenzen stehen im [Releasebericht](RELEASE-0.b1.102.md). Die Produktion verwendet den bestehenden Supabase-Server, Funktionsrevision 10, mit 29 RLS-geschützten Anwendungstabellen. Für diese Beta war keine Datenbankmigration nötig.

## Konfiguration

Vercel verwendet Node 22, `npm ci`, `npm run build` und `dist`. `vercel.json` enthält SPA-Routing und Sicherheitsheader. Keine dauerhaft laufenden Prozesse oder WebSockets auf Vercel erforderlich: der bestehende Supabase-Server übernimmt autoritative Spielzustände und HTTPS-Synchronisierung. Das alternative Node-/Socket.IO-Backend bleibt im Repository.

`src/public-config.json` enthält ausschließlich Supabase-URL, API-URL und den öffentlichen Publishable-Key. Service-Role und VAPID-Private-Key bleiben in Supabase; keine Geheimnisse werden zu Vercel oder in den Browser kopiert.

Supabase-Migrationen in `supabase/migrations/` sind mit dem Live-Projekt abgeglichen. RLS ist auf allen Anwendungstabellen aktiv. Account-XP können nur serverseitig vergeben werden. Das Produktionsbundle entfernt die ausschließlich in Tests erlaubte Authentifizierungsabkürzung.

## E-Mail und Gäste

Google ist serverseitig deaktiviert; direkte OAuth-Starts werden abgelehnt. Keine bestehenden Benutzer wurden gelöscht. Ehemalige Google-Nutzer verwenden dieselbe E-Mail-Adresse und können über „Passwort vergessen“ ein Passwort setzen; Bestätigung erfolgt ausschließlich im eigenen Postfach.

[Supabase URL Configuration](https://supabase.com/dashboard/project/dxoleuqmhcnqnjyqdqvw/auth/url-configuration): Site URL `https://manhunt-pwa.vercel.app`, Redirect `https://manhunt-pwa.vercel.app/auth/callback`. Alten Redirect während des Umzugs behalten. Der Nutzer hat die Änderung am 26.10.2026 bestätigt. Die Integrationswerkzeuge können die private Auth-Konfiguration nicht lesen oder bearbeiten. Passwort-Reset und Verifizierungslinks sind erst nach tatsächlicher Zustellung und Einlösung abschließend geprüft.

## Veröffentlichung

1. `npm test`, `npm run build`, Socket-, Edge- und öffentliche Playwright-Tests ausführen.
2. Quellcode auf einen Vorschau-Branch pushen und über das Vercel-Plugin bereitstellen.
3. Nur die tatsächlich zugewiesenen Domains verwenden; exakte Preview-Origin im Backend erlauben. Vorschauen bleiben durch Vercel Authentication geschützt.
4. Supabase-Edge-Bundle bereitstellen; bestehende Checkpoints/Accounts nicht löschen.
5. Vorschau mit echten, eigens angelegten Test-Gastsitzungen prüfen und anschließend diese Testkonten löschen. Simuliertes GPS ausschließlich in ausdrücklich gekennzeichneten automatisierten Tests.
6. Geprüften Commit nach main übernehmen, Produktionsbereitstellung und Live-Tests prüfen.
7. Erst danach Sites-Weiterleitungsartefakt mit Zehn-Sekunden-Countdown veröffentlichen.

## Betriebsgrenzen

PWAs können im Hintergrund angehalten werden. Push benötigt die ausdrückliche Freigabe auf jedem Gerät; auf iOS zusätzlich eine installierte Webapp. Neue Domain bedeutet neue Browserfreigaben und erneute Anmeldung. Gastsitzungen sind an den Browserursprung gebunden und lassen sich nicht automatisch zwischen Sites und Vercel übertragen.

Die Wegdatenprüfung kann bei Ausfall oder Ablehnung des öffentlichen Overpass-Dienstes keinen XP-Punkt liefern. Es gibt keinen ungeprüften Ersatzpunkt. OSM ist keine verbindliche Auskunft über aktuelle Gefahren oder Betretungsrechte; jeder Kandidat muss vor Ort vom Host bestätigt werden.

Keine kostenpflichtigen Ressourcen wurden für diese Migration beauftragt. Es gelten die jeweils aktuellen Kontingente der Anbieter; Lasttests im großen Maßstab wurden nicht auf den kostenlosen Produktionsdiensten durchgeführt.

## Veröffentlichungsnachweis

Geprüftes Vercel-Produktionsdeployment `dpl_HpzkGawe4L4XDqArTR2HW68fx6XV`, App-Code `d7c725407287e2862cfee0fc8f3804aa784f31ab`, READY. Das Vercel-Plugin wurde für Preview und Produktion tatsächlich verwendet. Git-verknüpfte Neubauten wurden ebenfalls nachgewiesen.

Sites-Version 14, Deployment `appgdep_6ae040ed054481919f4e7fea88ac244e`, succeeded. Die öffentliche alte Domain wurde erst nach erfolgreichen Produktions-Browser- und Multiplayer-Prüfungen umgestellt. Vier Online-Weiterleitungstests und zwei echte Navigationen (10 Sekunden und Sofort-Button) bestanden. Die Weiterleitung verwendet ausschließlich https://manhunt-pwa.vercel.app.

Bereits versendete E-Mails verwenden teilweise das Logo auf der alten Domain. Das Weiterleitungsartefakt liefert deshalb weiterhin `icon-192.png` und `icon-512.png`. Neue Vorlagendateien verwenden Vercel; der bestehende Supabase-Mailinhalt wurde über die Integration nicht geändert. Authentifizierungslinks bleiben Supabase-Platzhalter und werden nicht durch eigene Zugangstokens ersetzt.
