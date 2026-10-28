# Admin-Portal: Prüfbericht 28.10.2026

Geprüfter Funktionsstand: 0.b1.103, Quellcode-Commit `4c61e2e1086638c570a5c177faf5829a12c340c6`. Zusatzänderung: getrenntes Offline-Stylesheet für die Content Security Policy, statischer Cache v2 und wiederholbare Live-Tests. Keine Passwörter oder Sitzungstokens sind Bestandteil dieses Berichts.

## Ausgeführte automatisierte Prüfungen

| Prüfgruppe | Tatsächliches Ergebnis | Umgebung |
|---|---:|---|
| Vitest, einschließlich Datenbank/RLS, Accounts und Socket-Sitzungen | 218 bestanden | Lokale Tests; PostgreSQL-WASM mit allen Migrationen; externe Auth simuliert |
| Edge-Multiplayer, GPS, Zonen, Chat, Kartenzoom | 24 bestanden | Chromium, mehrere echte Browserkontexte, ausdrücklich simuliertes GPS/Auth |
| Socket.IO-Multiplayer | 8 bestanden | Lokale Chromium-Sitzungen und echter Socket.IO-Server; Testidentitäten |
| Produktionsbundle / E-Mail-UI | 18 bestanden | Echter Frontendbuild; Auth-Antworten in Authfällen simuliert |
| Weiterleitungsseite | 4 bestanden | Lokaler Browser |
| Admin + Spiel über drei getrennte Ursprünge | 4 bestanden | Unveränderte React-Apps, echte AccountService/Edge-Router, simulierte Supabase-Auth und Mailbox |
| Abhängigkeitsprüfung beider Anwendungen | 0 bekannte gemeldete Schwachstellen | Tatsächlich ausgeführtes `npm audit --omit=dev` |

**Summe: 276 automatisierte Tests bestanden, 0 verbleibende fehlgeschlagene Tests.** Frühere fehlgeschlagene Durchläufe wurden analysiert und korrigiert: überschneidende Admin-Testbuilds, fehlender neuer Benutzername im alten Registrierungstest, Kompatibilität bestehender generierter Gastnamen und Socket-Broadcasts mit tatsächlicher Auth-Sitzung. Die betroffenen Tests wurden erneut ausgeführt. Der unabhängige GitHub-Lauf [40685722406](https://github.com/scobione/manhunt/actions/runs/40685722406) hat alle Build-, Audit- und Testschritte erfolgreich ausgeführt; der veröffentlichte Spiel-Frontend-Smoke [40685722431](https://github.com/scobione/manhunt/actions/runs/40685722431) ist ebenfalls erfolgreich.

## Tatsächliche Integration

- Vercel-Spieldeployment `dpl_H3hWbnRa6fT2qTtqyKLpAdUeNrdZ` und Admin-Deployment `dpl_28XmFRpzK3g1UQ7GmH8YdiYvpcjV`: über das Vercel-Plugin als READY mit Git-Quelle und Produktionsaliases bestätigt. Nachfolgende Offline-Korrekturen werden automatisch aus demselben Repository bereitgestellt.
- Admin-Loginseite mit tatsächlichem HTTPS, CSP, Manifest und Icons bei 390 und 1440 Pixeln im Browser geprüft, ohne Browserfehler oder horizontales Überlaufen.
- Live-API: Health 200 / Version 0.b1.103, Account-Konfiguration aktiv. Ein eigens angelegter echter anonymer Supabase-Testaccount erhielt Account und Profil (200), aber keine Adminfunktionen (403). Direkte RLS-Abfragen der drei neuen Verwaltungstabellen wurden mit 403 abgewiesen. Ohne Token und mit ungültigem Token: 401. Fremde Origin: 403. Antworten tragen `Cache-Control: no-store`.
- Dieser ausdrücklich markierte Testaccount wurde anschließend gezielt gelöscht; keine vorhandenen Benutzer wurden für den Test verändert oder gelöscht.
- Migration tatsächlich eingespielt; alle 11 vorhandenen Accounts und Profile erhalten. 32 Anwendungstabellen haben RLS. Erstadmin ausdrücklich anhand der vom Betreiber genannten, vorhandenen und bereits bestätigten Identität freigegeben. Normale Browserrollen besitzen weder SELECT auf Accountkontrollen noch EXECUTE auf Admin-RPCs.
- Supabase-Advisors: keine ERROR-Befunde; INFO zu ungenutzten Indizes, WARN zum absichtlich erhaltenen Gastzugang sowie zur bereits vorher deaktivierten Leaked-Password-Prüfung. Restriktive Zusatzpolicies vergeben selbst keine neuen Leserechte. [Hinweise zu Gast-Policies](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0012_auth_allow_anonymous_sign_ins), [Passwortschutz](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Keine kostenpflichtige Funktion aktiviert.

Wiederholbare Live-Tests: `npx playwright test -c playwright.admin-live.config.ts`. Diese enthalten keine Testidentitäten und greifen nur lesend auf die veröffentlichte Anwendung zu. Echte Geräteinstallation und persönliche Administratoranmeldung werden dadurch nicht ersetzt.

## Die 16 geforderten Abnahmepunkte

BESTANDEN bezieht sich jeweils auf die ausdrücklich benannte Testumgebung. Eine simulierte Auth-/Mailboxprüfung ist keine bestätigte produktive Supabase-Admin-API oder E-Mail-Zustellung.

| ID / Funktion | Voraussetzungen und Schritte | Erwartet | Tatsächlich | Status / offener Grund |
|---|---|---|---|---|
| ADMIN-01 Eigene URL | Produktionsdomain im Browser öffnen | Separate Admin-Anmeldung | Live HTTP 200, eigene Oberfläche/Manifest | BESTANDEN |
| ADMIN-02 PWA installieren | Echtes iPhone/Android; zum Home-Bildschirm hinzufügen | Eigenständiger Start | Manifest, Icons und SW geprüft; keine physischen Geräte verfügbar | BLOCKIERT — Geräteprüfung |
| ADMIN-03 Normale Benutzer abweisen | Lokalen normalen Benutzer anmelden; echten Gast gegen Live-API prüfen | Kein Dashboard / 403 | Beide Varianten abgewiesen; direkte SQL-/API-Negativtests erfolgreich | BESTANDEN |
| ADMIN-04 Persönlicher Admin-Login | Betreiber meldet sich mit bestehendem Passwort an | Dashboard nur mit tatsächlicher Adminrolle | Lokal vollständiger Login erfolgreich, Rolle live zugeordnet; persönliches Passwort nicht verfügbar | BLOCKIERT — persönlicher Live-Login |
| ADMIN-05 Zusatzcode | Isolierten Admin anmelden; Code setzen, neu laden, falschen/richtigen Code senden | Falscher Code abgewiesen; richtiger entsperrt | Browser- und API-Tests erfolgreich, Rate Limit/Hash/Sitzungsbindung geprüft | BESTANDEN — isolierte Auth |
| ADMIN-06 Account erstellen | Berechtigten Admin anmelden und bisher unbenutzte E-Mail eingeben | Ein Account, ohne Mailversand | Lokaler Gesamtfluss und doppelte/parallele Erstellung geprüft; tatsächlicher privilegierter Auth-API-Aufruf mangels persönlicher Sitzung nicht ausgeführt | BLOCKIERT — Live-Admin-Sitzung |
| ADMIN-07 Einmalige Zugangsdaten | Isoliert Account erstellen, ausblenden, neu laden, Verzeichnis lesen | Passwort nur initial sichtbar | UI entfernt Passwort; Verzeichnis und Audit enthalten es nicht | BESTANDEN — isoliert |
| ADMIN-08 Vorläufiger Spiel-Login | Produktiv manuell angelegten Account im Spiel anmelden | Pflicht-Einrichtung | Zwei lokale Browser erfolgreich; externer Admin-API-Fluss noch nicht mit Betreiber geprüft | BLOCKIERT — abhängig von ADMIN-06 |
| ADMIN-09 Pflicht-Passwortwechsel | Mit Testkonto direkt Spielroute/API aufrufen; Passwort ändern | 428 bis Einrichtung; altes Passwort ungültig | Browser-/API-/RLS-Tests erfolgreich, Widerruf alter Sitzungen geprüft | BESTANDEN — Auth simuliert, echte SQL-Policies |
| ADMIN-10 Eigenen Namen wählen | Ungültigen/vergebenen Namen prüfen, gültigen Namen speichern | 3–20 Zeichen und eindeutig | Syntax, Groß-/Kleinschreibung, Punkt/Unterstrich und DB-Unique geprüft | BESTANDEN |
| ADMIN-11 Einrichtung nicht überspringbar | Direkte API/RPC-Aufrufe und URL-Wechsel vor jedem Schritt | Gesperrt bis vollständigem Abschluss | Alle Negativtests bestanden, atomare Schritte und RLS blockieren Zugriff | BESTANDEN |
| ADMIN-12 Echte Registrierungs-Mail | Kontrolliertes Postfach, neues Konto, Code aus E-Mail einlösen | Zeitlich begrenzter sechsstelliger Code | Lokale Mailboxsimulation erfolgreich; kein Zugriff auf echtes Testpostfach/SMTP-Konfiguration | BLOCKIERT — Mailzustellung und Providerkonfiguration |
| ADMIN-13 Falsche/alte Codes | Lokale Auth-Simulation: falscher, abgelaufener, erneut verwendeter Code | Ablehnung und erneute Anforderung | Drei Negativfälle im Browser erfolgreich | BESTANDEN — ausdrücklich simuliert |
| ADMIN-14 Gemeinsame Daten | Konfigurationen vergleichen; Account im lokalen Admin erstellen und im Spiel öffnen; Live-Gast lesen | Dieselben IDs/Profile | Gleiches produktives Projekt, übergreifender lokaler Browserfluss und Live-Profil erfolgreich | BESTANDEN — externer Erstellungsaufruf separat ADMIN-06 |
| ADMIN-15 Bestehende Daten/Spiel | Vorher-/Nachher-Zählung; vorhandene Spieltests und Live-Smoke | Accounts/Matches erhalten, Spiel bedienbar | 11 Konten/11 Profile erhalten; Regressionstests und Live-Smoke erfolgreich | BESTANDEN |
| ADMIN-16 iPhone/Android/Desktop | Browsergrößen plus echte mobile Geräte | Bedienbar und installierbar | Desktop-Chromium und mobile Viewports erfolgreich; echte Safari-/Android-Geräte nicht verfügbar | BLOCKIERT — reale Geräte |

**Abnahmematrix: 10 BESTANDEN, 0 FEHLGESCHLAGEN, 6 BLOCKIERT, 0 NICHT AUSGEFÜHRT.** In den blockierten Punkten sind lokal bestandene Teilprüfungen ausdrücklich genannt; die Gesamtanforderung wird nicht als abgeschlossen ausgegeben.

## Sicherheitsreview-Grenze

Die Änderungen wurden anhand der Vertrauensgrenzen im Code und durch Negativtests geprüft. Dabei wurde auch der Widerruf bestehender Auth-Sitzungen in API und RLS ergänzt. Ein vollständiger Codex-Security-Plugin-Scan ist **nicht** abgeschlossen: verfügbar war nur dessen TAC-Statuswerkzeug, keine Scan-/Preflight-/Abschlusswerkzeuge; die referenzierte Preflight-Ressource und Terminal-Scanskripte waren nicht zugänglich. Es gibt daher kein behauptetes Codex-Security-Scan-Zertifikat und keine Garantie auf Abwesenheit sämtlicher Schwachstellen.

## Noch notwendige Betreiberprüfung

1. Auf https://manhunt-admin-scobione.vercel.app mit dem freigegebenen bestehenden Account anmelden. Optional einen zusätzlichen Code in den Einstellungen setzen.
2. Einen tatsächlich gewünschten neuen Account anlegen und mit dessen einmaligen Zugangsdaten im Spiel die drei Pflichtschritte durchlaufen. Zugangsdaten ausschließlich an den vorgesehenen Spieler übergeben.
3. Eine normale Registrierung über ein kontrolliertes Postfach samt Code prüfen und die Admin-PWA auf dem eigenen Gerät installieren. Falls die E-Mail keinen sechsstelligen Code enthält, Provider/OTP-Einstellungen und `{{ .Token }}`-Vorlage wie in [ADMIN-PORTAL.md](ADMIN-PORTAL.md) prüfen.
