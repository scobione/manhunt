# MANHUNT 0.b1.105

## Änderungen

- Ein serverseitiger Supabase-Admin-Passwortwechsel beendet bereits alle Auth-Sitzungen. Der zusätzliche, fehlschlagende Logout wurde entfernt. Der Einrichtungsschritt wird gespeichert und das Spiel meldet den Nutzer mit seinem gerade gewählten Passwort erneut an. Bei einer Verbindungsstörung bleibt das neue Passwort gültig; eine spätere Anmeldung setzt beim nächsten Einrichtungsschritt fort.
- E-Mail-Resets öffnen `/auth/recovery`, auch wenn Supabase zunächst auf `/` zurückleitet. Die App verarbeitet sowohl den PKCE-Rückweg aus dem Spiel als auch den impliziten Recovery-Link aus dem Adminportal. Die an den Nutzer gebundene Recovery-Absicht bleibt innerhalb des Tabs beim Neuladen erhalten. Ungültige Links erlauben keinen Passwortwechsel mit einer zufällig vorhandenen Sitzung.
- Passwortfelder im Spiel und Adminportal besitzen beschriftete Anzeigen/Verbergen-Schaltflächen. Sie sind anfangs verdeckt, bei ausgeblendeter App werden sie wieder verdeckt. Auch neu generierte vorläufige Passwörter können während ihrer einmaligen Anzeige sichtbar gemacht werden. Bestehende Benutzerpasswörter werden weder ausgelesen noch im Klartext gespeichert.
- Verbrauchsdaten sind ausschließlich im Adminportal sichtbar. Spieler können ihre eigenen aggregierten Messwerte senden, aber keine Verbrauchsübersichten lesen. API und PostgreSQL prüfen den Lesezugriff unabhängig voneinander. Keine Verbrauchsanzeige in Spiel oder Ergebnissen.

Die Migration `admin_only_traffic` ersetzt ausschließlich die Leseberechtigungsprüfung einer bestehenden Datenbankfunktion. Accounts, Passwörter, Freundschaften, laufende Spiele und Statistiken werden durch die Veröffentlichung nicht verändert.

## Ausgeführte lokale Prüfungen

236 Unit-/Integrationstests bestanden. 21 Tests gegen das Produktions-Frontend bestanden. Sieben Admin-/Mehrbrowserabläufe bestanden (sechs im Gesamtlauf, zusätzlich RESET-REG-04 im gezielten Lauf). Spiel- und Admin-Produktionsbuild erfolgreich. Die vollständige CI führt auch die bestehenden Socket-, Edge- und Weiterleitungs-Browsertests aus.

| ID | Voraussetzungen und Schritte | Erwartung / tatsächlich beobachtet | Status |
| --- | --- | --- | --- |
| RESET-REG-01 | Isolierter Supabase-Adapter: Passwort erfolgreich ändern; zusätzlicher Logout würde `session_not_found` liefern | Passwortänderung erfolgreich, kein zweiter Logout | BESTANDEN |
| MRESET-E2E | Getrennte Admin-/Spielbrowser: vorgegebenes Passwort setzen, alte Sitzung prüfen, eigenes Passwort wählen, Profil neu laden; Auth-Fixture widerruft beim Wechsel alle Sitzungen | Alte Sitzung und temporäres Passwort ungültig; neue Sitzung aktiv; Passwortschritt genau einmal; Profil bleibt erhalten | BESTANDEN |
| ADMIN-04/06/07, SETUP-08–11 | Admin erstellt lokalen Testaccount; erster Login, Passwort, Benutzername, Profilabschluss | Ersteinrichtung verpflichtend; Passwortwechsel führt zum Benutzernamen statt zur Anmeldeschleife | BESTANDEN |
| RESET-REG-02 | Isolierter Recovery-Link mit Fragment, jeweils auf `/` und `/auth/callback`; Neuladen; Passwort wechseln | Passwortseite erreichbar und nach Reload erhalten; genau ein Änderungsaufruf; Abschluss beendet Recovery | BESTANDEN (2 Browserfälle) |
| RESET-REG-03 | Abgelaufener Recovery-Link bei bereits gespeichertem Account | Fehlermeldung, kein Passwortformular | BESTANDEN |
| RESET-REG-04 | Nach erfolgreichem Passwortwechsel einmalig simulierte 503-Antwort bei automatischer Anmeldung; danach normale Anmeldung | Verständlicher Hinweis; neues Passwort gültig; nächster Einrichtungsschritt statt Passwortschleife | BESTANDEN |
| AUTH-RECOVERY-PKCE | Reset im Spiel anfordern, Code-Rückweg öffnen und verifiziertes Passwort ändern | Erlaubte Callback-Adresse; Passwort gespeichert | BESTANDEN |
| PASSWORD-VISIBILITY | Maskiertes Feld am mobilen Bildschirm anzeigen, verbergen und Formular absenden; vorläufiges Passwort im Adminportal anzeigen | Umschalten verändert den Wert nicht und sendet das Formular nicht; keine horizontale Überbreite | BESTANDEN |
| TRAFFIC-05 | Spieler und Admin ohne Portalticket versuchen Lesezugriffe; reguläre Spieler senden Zähler | Spiel-Leseendpunkt verweigert; Admin-Lesen erfordert Portalticket; gültige Messmeldung möglich | BESTANDEN |
| TRAFFIC-DB-01–03 | Alle Migrationen in isoliertem PostgreSQL ausführen; Spieler-/Adminrollen, doppelte Meldungen, Ablauf und direkte Tabellenzugriffe prüfen | Nur echte Adminrolle mit aktiver Sitzung darf lesen; RLS und bestehende Aggregation bleiben wirksam | BESTANDEN |
| TRAFFIC-E2E | Zwei mobile Browser spielen und melden Bytes; simulierten Verbindungstyp wechseln; Admin öffnet Matchdetails | Keine Spielanzeige, Spieler-GET 403, Admin sieht beide Spieler und Verbindungsklassen | BESTANDEN |

Die Browser-Auth- und Mailzustellung dieser Regressionstests sind ausschließlich lokal simuliert. Datenbankprüfungen verwenden echte Migrationen in PGlite. Echte Benutzerpasswörter werden für Tests nicht zurückgesetzt. Physische iPhone-/Android-Geräte und eine erneute Mailzustellung in ein persönliches Postfach sind hier nicht getestet. Die Live-Verfügbarkeit wird nach dem Deployment gesondert geprüft; der GitHub-Lauf „Published frontend smoke“ veröffentlicht die Browsernachweise.

## Zusätzliche Prüfung nach Veröffentlichung

Acht schreibgeschützte Browserprüfungen auf den echten Produktionsdomains bestanden: vier Spielprüfungen und vier Admin-/API-/PWA-Prüfungen. Passwort-Anzeigen/Verbergen und mobile Breite wurden zusätzlich auf beiden Domains im Browser geprüft, ohne Loginversuch oder Kontoveränderung. Die Datenbank bestätigt Adminprüfung und aktive RLS; direkte Browser-Leserechte fehlen.

Der erste vollständige CI-Lauf fand beim bestehenden Offline-Test ein Zeitfenster: Der Browser ging offline, während die Spielansicht als JavaScript-Modul nachgeladen wurde. Die unaufgefangene Import-Ablehnung entfernte die gesamte React-Oberfläche. Eine Fehlergrenze erhält jetzt Navigation und Offline-Hinweis; nach Wiederverbindung wird die Ansicht neu geladen und das laufende Match wiederhergestellt. Sowohl der bestehende Wiederverbindungstest als auch der neue deterministische Test **OFFLINE-LOAD** (Spielmodul absichtlich offline abbrechen, Warnung prüfen, Verbindung wiederherstellen, dasselbe Match prüfen) sind lokal **BESTANDEN**. Der vollständige CI-Lauf wird mit dieser Korrektur erneut ausgeführt.

## Bereitstellung

- Spiel: https://manhunt-pwa.vercel.app
- Adminportal: https://manhunt-admin-scobione.vercel.app
- Bestehende Supabase Edge Function: `manhunt-api`, `verify_jwt=false` bleibt unverändert; Authentifizierung und Admin-Tickets werden im Funktionscode überprüft.
- Produktionszweig: `main` in https://github.com/scobione/manhunt. Beide bestehenden Vercel-Projekte sind automatisch damit verbunden.
- Supabase-Redirect bleibt `/auth/callback`. Für die interne Passwortseite ist kein neuer Redirect-Eintrag erforderlich.
