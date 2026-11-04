# Testbericht 0.B2

Stand: 4. November 2026. Automatisierte Konten, Verifizierungs-E-Mails und GPS-Koordinaten sind ausschließlich lokale Testdaten. Die produktive Datenbankprüfung verwendet weder Testkonten noch erfundene Erfolge.

## Tatsächlich lokal ausgeführt

- 296 Unit-, API-, Engine- und PostgreSQL-/RLS-Fälle bestanden.
- Alle zehn bestehenden Admin-/Simulations-/Feedback-Browserfälle bestanden, angepasst an die neue Icon-Interaktion.
- Drei neue Profil-Browserfälle bestanden, inklusive mehrerer echter lokaler Sitzungen, 320 und 1440 Pixeln, verzögerungsfreiem Speichern und erneutem Laden.
- Produktionsbuilds für Spiel und Adminportal sowie TypeScript bestanden.

## Neue Akzeptanzfälle

| ID | Voraussetzungen und Schritte | Erwartetes und tatsächliches Ergebnis | Status |
| --- | --- | --- | --- |
| PROFILE-B2-320 | Drei isolierte registrierte Benutzer; Freundschaft bestätigen; reguläres Testspiel abschließen; Feedback mit ausgelassenen Einzelfragen absenden; Profil öffnen | Verdientes Badge oben als farbiges SVG-Icon; mindestens 44px Touchfläche; Name/Erklärung erst nach Klick, Escape gibt Fokus zurück | BESTANDEN |
| PROFILE-B2-1440 | Derselbe Ablauf am Desktop | Gleiche Funktionen, kein horizontales Überlaufen | BESTANDEN |
| PROFILE-B2-ART | Ausdrückliche lokale UI-Fixture mit allen fünf Emblemen und Stufen I, II, III und X; Details öffnen | Alle Farben/Motive, richtiger Stufenname und Fortschritt, maximales Level, reduzierte Animationen, schmale Anzeige funktionieren | BESTANDEN |
| PROFILE-B2-SQL-01 | Echter Migrationsstand in isolierter PostgreSQL-Instanz; Freundesprofil lesen, Badge ausblenden/einblenden, direkte Client-Schreibversuche | Nur sichtbare, freigeschaltete Badges; keine privaten Badge-Zähler; Fortschritt erhalten; Hauptbadge beim Ausblenden entfernt; direkte Änderungen abgelehnt | BESTANDEN |
| PROFILE-B2-SQL-02 | Als Freund lesen; beide Blockierungsrichtungen, gelöschte Freundschaft und deaktiviertes Zielkonto prüfen | Zugriff jeweils entzogen | BESTANDEN |
| PROFILE-B2-SQL-03 | Gesperrtes Badge und Gastkonto manipulieren; verborgenes verdientes Badge als Hauptbadge wählen | Gesperrte/Gast-Vergabe abgelehnt; bewusste Hauptauswahl aktiviert Sichtbarkeit | BESTANDEN |
| PROFILE-B2-API | Gäste, falsche Boolean-Werte, fremde Benutzer-ID im Payload und ungültige Profil-ID senden | Abgewiesen; Identität stammt ausschließlich aus der geprüften Sitzung | BESTANDEN |

Die Browserfälle prüfen zusätzlich: grün/graue Schalter in Einstellungen, Persistenz nach Neuladen, ausgeblendete Badges auch in roher API-Antwort entfernt, fremde/unauthentifizierte Profile gesperrt, keine gesperrte Sammlung auf Freundesprofilen und bestehende Beta-Tester-Vergabe unverändert.

Ein durch die neuen Rollentests sichtbar gewordener Fehler im lokalen SQL-Testhelfer wurde korrigiert: Service-Role-Aufrufe verwenden jetzt passende Service-Role-JWT-Claims statt einer zuvor simulierten Benutzeridentität. Produktionsauthentifizierung wurde dafür nicht verändert.

## Produktive Datenbank

Migration erfolgreich angewendet; die neue Tabelle hat RLS. Profil- und Sichtbarkeitsfunktionen sind `SECURITY INVOKER`; nur die Serverrolle besitzt EXECUTE. Die vorhandenen fünf Badge-Definitionen bleiben lesbar. Es wurden keine produktiven Benutzer, Freundschaften oder Badges für Testzwecke angelegt.

## Veröffentlichung und Prüfgrenzen

Die abschließenden Vercel-Deploymentdaten und der vollständige GitHub-Testlauf werden im Veröffentlichungsbericht bestätigt. Ein Build zählt nicht als Online-Test. Persönliche Konten und reale Outdoor-Geräte wurden für diese UI-Änderung nicht verwendet. Die bereits bekannte externe Wegdatenprobe ist gemäß Nutzerpriorisierung zurückgestellt und kein Nachweis dieses Updates.
