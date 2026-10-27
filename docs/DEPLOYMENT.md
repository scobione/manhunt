# Deployment: Vercel und Supabase

Stand: 27.10.2026, b.0.69.48 veröffentlicht; 126/134 Akzeptanz-IDs bestanden, 8 blockiert.

- Produktionsdomain: https://manhunt-pwa.vercel.app
- Vercel-Projekt: `manhunt-pwa`, Hobby; GitHub `scobione/manhunt`, Produktion `main`.
- Bestehende Datenbank und Auth: Supabase `dxoleuqmhcnqnjyqdqvw`, Frankfurt, Free.
- API: https://dxoleuqmhcnqnjyqdqvw.supabase.co/functions/v1/manhunt-api
- Bisherige Website: https://manhunt-fieldgame.scobione.chatgpt.site

b.0.69.48 wurde als geschützte Vorschau geprüft und auf der Produktionsdomain veröffentlicht. Tatsächliche Bereitstellungen und verbleibende Abnahmegrenzen stehen im [Releasebericht](RELEASE-b.0.69.48.md). Die Produktion verwendet den bestehenden Supabase-Server, Version 9, mit 29 RLS-geschützten Anwendungstabellen.

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

Sites-Version 13, Deployment `appgdep_6adfcbd5c6948191b0a719314aaa08ff`, succeeded. Die öffentliche alte Domain wurde erst nach erfolgreichen Produktions-Browser- und Multiplayer-Prüfungen umgestellt. Vier Online-Weiterleitungstests und zwei echte Navigationen (10 Sekunden und Sofort-Button) bestanden. Die Weiterleitung verwendet ausschließlich https://manhunt-pwa.vercel.app.
