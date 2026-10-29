# MANHUNT 0.b1.106 — E-Mail-Rückwege

## Behobene Fehler

Ein abgelaufener E-Mail-Link kann von Supabase ohne `type=recovery` auf die Site URL zurückgeleitet werden. Zuvor wurde nur die Adresszeile auf `/auth/callback` geändert; der React-Router blieb auf der Startseite. Ein bereits angemeldetes Konto konnte außerdem trotz ungültigem Link eine Erfolgsmeldung sehen.

Die App navigiert jetzt über ihren Router auf die Fehlerseite, erkennt `otp_expired` als abgelaufenen beziehungsweise bereits verwendeten Link und bietet **Neuen Reset-Link anfordern** an. Die erneute Anforderung ist auch mit bereits angemeldetem, geladenem Spielprofil möglich. Eine automatische Erfolgsweiterleitung darf den vom Nutzer gewählten erneuten Reset nicht überholen. Ein neuer Link verwendet weiterhin die freigegebene Supabase-Adresse `/auth/callback`.

Lobby-Einladungscodes wie `/join?code=K7M4XP` werden von Auth-Codes unterschieden. Auch Supabase selbst verarbeitet nur tatsächliche Auth-Rückwege; ein noch vorhandener E-Mail-Verifier darf keinen Lobbycode verbrauchen. Ein fehlender lokaler PKCE-Nachweis bei einem Rückweg auf `/` führt zu einer sichtbaren, handlungsfähigen Fehlermeldung. Rohfehler und Tokens erscheinen nicht im Hinweistext.

Die Datenschutzhinweise nennen die tatsächlich verfügbaren Anmeldearten E-Mail und Gastzugang. Der veraltete Hinweis auf optionales Google-Login wurde entfernt. Google bleibt deaktiviert.

Keine Datenbankmigration, keine Änderung von Benutzerkonten, Passwörtern, Adminrollen, Freundschaften oder laufenden Matches. Verbrauchsdaten bleiben ausschließlich im geschützten Adminportal sichtbar. Kein neuer Dienst und keine kostenpflichtige Ressource.

## Nachweise

Die neuen Browserfälle wurden zunächst gegen 0.b1.105 ausgeführt: alle drei reproduzierten den Fehler. Anschließend wurde die Korrektur geprüft. Alle Auth-, Account- und Maildaten in diesen automatisierten Regressionstests sind ausdrücklich isolierte lokale Testdaten; die Mailzustellung wird abgefangen.

| Test | Voraussetzungen und Schritte | Erwartetes Ergebnis |
| --- | --- | --- |
| RESET-REG-05, ohne Sitzung | Abgelaufenen Link ohne Recovery-Typ auf `/` öffnen; erneut Reset anfordern | Fehlerseite mit Ablaufhinweis; Reset-Formular ohne Navigationsschleife |
| RESET-REG-05, vorhandenes Konto | Gleiches Szenario mit gültiger gespeicherter Auth-Sitzung und vollständig geladenem Spielprofil | Keine falsche Erfolgsmeldung; eigenes Reset-Formular bleibt erreichbar |
| RESET-REG-06 | Auth-Code ohne lokalen Verifier auf `/` öffnen; zur Anmeldung wechseln | Sichtbarer Hinweis zum fehlenden Browsernachweis; Anmeldung bedienbar |
| AUTH-RETURN-05 | Gespeicherten E-Mail-Verifier belassen, Lobby-Einladung öffnen | Kein Code-Austausch mit Auth, Lobbycode und E-Mail-Verifier bleiben erhalten |
| AUTH-RETURN, 4 Unitfälle | Lobbycodes, Auth-Codes, abgelaufene Links ohne `type`/`error` und rohe Tokens klassifizieren | Nur echte Auth-Rückwege werden umgeleitet; keine Geheimnisse in klassifizierten Daten |

**Lokal ausgeführt: 240 Unit-/Integrationstests und 25 Browserfälle BESTANDEN, 0 verbleibende Fehler.** Alle in der Tabelle erwarteten Ergebnisse wurden tatsächlich beobachtet. Der Produktionsbuild ist erfolgreich. Die drei ursprünglich fehlgeschlagenen Regressionstests wurden nach der Korrektur erneut ausgeführt.

Ausführliche Laufprotokolle liegen beim zugehörigen GitHub-Actions-Lauf. Die vollständige Pipeline prüft zusätzlich alle bisherigen Socket-, Edge-, Admin-, Frontend- und Weiterleitungsfälle. Nicht ausgeführte echte Postfach- und physische Gerätetests bleiben als solche ausgewiesen; es wurde kein persönliches Benutzerpasswort zu Testzwecken verändert.

## Adressen

- Spiel: https://manhunt-pwa.vercel.app
- Reset anfordern: https://manhunt-pwa.vercel.app/login?reset=1
- Adminportal: https://manhunt-admin-scobione.vercel.app
- CI: https://github.com/scobione/manhunt/actions

Bestehende Vercel-Projekte, Produktionszweig `main` und Supabase-Projekt bleiben erhalten. Für diese Korrektur sind keine manuellen Supabase-Einstellungen erforderlich.
