# Manueller Passwort-Reset — 0.b1.104

Anforderung: Ein berechtigter Administrator gibt ein vorläufiges Passwort vor; bei der nächsten Anmeldung muss der Benutzer ein eigenes Passwort festlegen. Vorhandene Kontodaten bleiben erhalten.

## Umsetzung

- Separates Formular in den Accountdetails des Admin-Portals. Passwortbestätigung und serverseitige Anforderungen: 12–128 Zeichen, Groß-/Kleinbuchstaben und Zahl.
- `POST /api/admin/users/:id/temporary-password`, geschützt durch aktuelle Adminrolle, gültige Supabase-Sitzung, kurzlebige Verwaltungssitzung und Rate Limit.
- Supabase Admin API ändert nur das Passwort. E-Mail-Bestätigung, Sperrstatus, Profil und Statistiken werden nicht überschrieben.
- Migration `20261028125548_admin_temporary_password_reset.sql`: ursprünglicher Einrichtungsschritt, unterbrechungssicherer Sperrstatus, servicegeschützte RPCs und Widerruf aller betroffenen Sitzungen/Refresh-Grants. Kein vorhandenes Passwort wird durch die Migration geändert.
- Vorläufiges Passwort niemals in API-Antwort, Protokollen oder Klartexttabellen. Ein gesalzener PBKDF2-Prüfwert blockiert Übernahme als endgültiges Passwort.
- Nach Pflichtwechsel sofortige Rückkehr ins Spiel bei bereits eingerichtetem Profil. Andere Konten setzen die zuvor offene Einrichtung fort.

## Tatsächlich ausgeführte Tests

Alle folgenden Fälle bestanden lokal. Datenbanktests führen sämtliche Migrationen in PostgreSQL-WASM aus; Browser testen die echten Anwendungen und den AccountService. **Supabase Auth und Mailversand sind dabei ausdrücklich simuliert. Es wurde kein Passwort eines bestehenden produktiven Kontos zu Testzwecken geändert.**

| ID | Voraussetzungen / Schritte | Erwartet und tatsächlich beobachtet | Status |
|---|---|---|---|
| MRESET-01 | Admin + fertiges Spielerkonto; Passwort vorgeben | Passwort ersetzt, kein Mailaufruf | BESTANDEN |
| MRESET-02 | Vorhandene Spielersitzung; Reset ausführen | Alte Sitzung verliert Zugriff; alter Login scheitert | BESTANDEN |
| MRESET-03 | Neu mit vorläufigem Passwort anmelden; direkt Spiel öffnen; Passwortwechsel | Pflichtwechsel, vorläufiges Passwort nicht wiederverwendbar, Profil unverändert | BESTANDEN |
| MRESET-04 | Normaler Spieler, abgelaufene Adminsitzung, Adminziel oder falsche Bestätigung | Zurückgewiesen | BESTANDEN |
| MRESET-05 | Deaktiviertes / unvollständiges Konto; Reset | Sperre und Verifizierungsstatus unverändert; ursprünglicher Einrichtungsschritt bleibt erhalten | BESTANDEN |
| MRESET-06 | Zwei gleichzeitige Resets; Audit und Antworten prüfen | Nur einer erfolgreich; kein Klartextpasswort in Audit/Antworten | BESTANDEN |
| MRESET-07 | Auth-Update schlägt fehl; Spieler versucht Einrichtung; Admin wiederholt Reset | Kein Umgehen der Sperre; erfolgreicher Retry möglich | BESTANDEN |
| MRESET-08 | Gleiches vorläufiges Passwort mehrfach setzen; vierter Versuch im Zeitfenster | Unterschiedliche gesalzene Prüfwerte; vierter Versuch 429 | BESTANDEN |
| MRESET-DB-01 | RPC als Browserrolle / normaler Benutzer / ohne lebende Adminsitzung | Keine Ausführung/Privilegienumgehung | BESTANDEN |
| MRESET-DB-02 | Mit Test-Admin Transaktionen ausführen, Ziel- und Fremdsitzungen vergleichen | Nur Zielsitzungen gelöscht; fertiges Profil nach Passwortwechsel wieder freigegeben | BESTANDEN |
| MRESET-DB-03 | Fehlgeschlagener Reset, erneuter Versuch, alter Lock | Fehlgeschlagener Zustand bleibt gesperrt; veralteter Lock wird abgewiesen | BESTANDEN |
| MRESET-E2E | Admin- und Spielerbrowser parallel; kompletter Ablauf | Sperre auch bei direkter Spiel-URL; nach eigenem Passwort identischer Benutzername ohne erneute Profilwahl | BESTANDEN |

Gesamte lokale Unit-/Integrationstests: **227 bestanden**. Admin-Browsersuite: **5 bestanden**, öffentliche Frontend-/Auth-Suite: **18 bestanden**. Frühere Testauswahl vor Ablauf der verzögerten Suche wurde durch Warten auf genau einen Treffer korrigiert; der gesamte Ablauf wurde danach erneut ausgeführt. Der vollständige CI-Lauf prüft zusätzlich die bestehenden Multiplayer-, Karten- und Weiterleitungstests.

Der privilegierte produktive Reset wird erst ausgeführt, wenn der angemeldete Administrator einen tatsächlich gewünschten Zielaccount auswählt und das Formular absendet. Für diesen Test wurde kein reales Benutzerpasswort verändert. Normale E-Mail-Verifizierung und Google-Deaktivierung bleiben unverändert.
