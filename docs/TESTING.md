# Verifikation — 22.10.2026

Die folgenden Prüfungen wurden in der Entwicklungsumgebung und in GitHub Actions tatsächlich ausgeführt. Kein echter Google-Login, kein reales Outdoor-GPS und keine Render-Bereitstellung werden daraus abgeleitet. Die separat geprüfte echte Supabase-Einrichtung ist unten dokumentiert.

| Prüfung | Ergebnis |
| --- | --- |
| TypeScript `npm run typecheck` | erfolgreich |
| Produktionsbuild `npm run build` | erfolgreich; React/Vite-Frontend und Node-Bundle erstellt |
| Engine-Regressionsfälle | 54 bestanden |
| Authentifizierte REST-/Socket-Integration | 18 bestanden |
| SQL-Migrationen / PostgreSQL-RLS | 10 bestanden |
| Zonenimport, Export und fehlerhafte Dateien | 10 bestanden |
| Chromium mit 2–3 getrennten Browser-Sitzungen | 8 Szenarien bestanden |
| Chromium gegen Produktionsbundle ohne Testauthentifizierung | 3 Szenarien bestanden |
| Chromium gegen die veröffentlichte HTTPS-Website | 3 Szenarien bestanden; Screenshots als GitHub-Artefakt gespeichert |
| `npm audit` einschließlich Entwicklungsabhängigkeiten | 0 gemeldete Advisories |
| Scan auf bekannte Secret-/Privatschlüssel-Muster | keine Treffer; nur `.env.example` eingecheckt |

## Was die Tests abdecken

**Engine:** alle acht Spielmodi; zufällige und manuelle Rollen; Rollen-/Hostberechtigungen; Vorbereitung/Vorsprung; Pin-Intervalle, Sichtfenster und Ablauf; Schutz fremder Koordinaten und Fangcodes; Fangbestätigung, Fangcode, Näheprüfung, doppelte Fänge und Fehlversuche; serverseitige Infektion; Teamziele und Siegbedingungen; Zeitlimits; Zonen und Schrumpfen; Grenzunsicherheit, alte GPS-Proben, Sprünge und serverseitige Empfangszeit; Notfallpause, Wiederaufnahme, Unterbrechungen; Löschung veralteter privater Zustände.

**API/Socket:** anonyme Anfragen, beide Testmodus-Schranken, Supabase-Verifikationsfehler und abgelaufene Token, Profilisolation, eindeutige Namen, Avatarpfade, Empfängerberechtigung bei Freundschaftsanfragen, Blockieren, private Presets, Origin-Prüfung, gefilterte Zustände, dauerhafte Speicherung verworfener GPS-/Fangversuche, Ergebnisse nach Matchende, Verlassen abgeschlossener Matches, fehlschlagende Persistenz und Kontolöschung. Tests ersetzen Supabase-Auth durch explizite Testidentitäten; der echte OAuth-Provider ist nicht eingerichtet.

**SQL:** PostgreSQL als WASM (PGlite) führt alle Migrationen in Reihenfolge mit `pgcrypto` aus. Geprüft werden RLS auf allen 21 Anwendungstabellen (18 angeforderte plus 3 Hilfstabellen), Profil-Trigger, fehlende Client-Schreibrechte, Freundschafts-/Blocktransaktionen, private GPS-/Rollenabfragen, atomare Checkpoints und Versionsschutz, Bereinigung am Matchende, Einladungen, private Avatar-Policies, Erasure und Ablauf. Auth- und Storage-Plattformschemas sind klar gekennzeichnete Testfixtures. Ein realer Supabase-Storage-Upload und reale OAuth-Rückleitungen sind hiermit noch nicht verifiziert.

**E2E:** echte Chromium-Prozesse mit getrennten Browser-Kontexten bedienen die App. Anlegen, Beitreten, Bereitschaft, Start, Fanganfrage und Bestätigung erfolgen über sichtbare Controls. Zombie-Bestätigung wird über den Swipe-Regler mit Tastatureingabe geprüft. Weitere Szenarien prüfen Apokalypse, ungenaues GPS, Freunde/Einladungen/Blocks, Mobilansicht, Offline-Anzeige und Wiederverbindung. Ein eigener Test aktiviert die Browser-Geolocation erst nach ausdrücklicher Zustimmung und stoppt sie wieder. GPS und Konten sind dabei ausschließlich als automatisierte Testdaten simuliert.

**Produktionsbundle:** Startseite, acht Modi, ehrlicher Hinweis auf fehlende Dienste, fehlende Testanmeldung, Datenschutz/Sicherheit, Mobilnavigation, PWA-Manifest, reduzierte Animationen und tatsächliches Zeichnen/Speichern/Exportieren/Importieren von Zonen; ungültige Dateien verändern den vorhandenen Entwurf nicht und jede importierte Zone muss erneut bestätigt werden. Der MapLibre-Worker wird lokal gebündelt, damit kein fehlender Workerpfad nach dem Vite-Build entsteht. Der Karten-Code wird erst auf den benötigten Seiten geladen.

**Öffentliche Website:** [MANHUNT](https://manhunt-fieldgame.scobione.chatgpt.site) wurde erfolgreich veröffentlicht. Der [Live-Browserlauf vom 21.10.2026](https://github.com/scobione/manhunt/actions/runs/39652392680) hat alle drei öffentlichen Szenarien mit Chromium auf GitHub ausgeführt: Desktop, Zonenzeichnen/Export und Mobilansicht. Der gespeicherte Screenshot des Zonen-Editors zeigt geladene OSM-Kacheln, die bestätigte Zone und die Attribution. Direkte HTTPS-Aufrufe einschließlich `/zone`, `/auth/callback`, `/lobby/settings` und `/join?code=…` liefern die App. Elf ausgelieferte JS-/CSS-/Worker-/PWA-Dateien wurden byteweise mit dem getesteten Build verglichen. Geprüfter GitHub-Quellstand: `aa9e979140325e4ba3326848ff3028902d0ae2a9`.

## Festgestellte und behobene Fehler

- Private Supabase-Avatarablage war mit öffentlichen Objektadressen vermischt; nun eigene Objektpfade und signierte Leseadressen.
- Fehlerhafte Profilcode-Länge und eine nicht existierende Historien-Spalte wurden angeglichen.
- Transport-Rollback verwarf Sicherheitsinformationen nach abgelehnten GPS-/Fangaktionen; solche Zustandsänderungen werden jetzt gespeichert.
- Abgeschlossene Matches verschwanden bei Synchronisierung und ließen sich nicht sauber verlassen; Ergebnis-Synchronisierung und Verlassen wurden korrigiert.
- MapLibre 6 benötigt einen ausdrücklich gebündelten Worker; der Produktionsbuild enthält ihn jetzt.
- Bekannte MapLibre-/Vitest-Abhängigkeitsadvisories wurden durch Updates beseitigt.
- Veraltete pausierte Spielzustände werden vor Wiederherstellung bereinigt und auch aus dem Speicher entfernt.
- Direktaufrufe auf dem Static Host lieferten zunächst 404. Der Build erzeugt nun für jede feste App-Route einen HTML-Einstieg; Einladungen nutzen einen Code-Queryparameter.
- Der Entwicklungsserver störte einzelne Offline-Tests durch HMR-Neuladungen. Mehrspieler-E2E nutzt nun einen separat gebauten Teststand mit eigener API, ohne HMR. Produktionsprüfungen haben getrennte Artefaktverzeichnisse und keinen Test-API-Proxy.
- Ein gezielter Regressionstest reproduzierte ein zu kleines IP-Verbindungsbudget für 40 Personen mit Wiederverbindung im selben Netzwerk. Der Transport kombiniert nun ein Gruppenbudget pro IP mit einem zusätzlichen Limit pro verifiziertem Konto. Die CI wiederholt fehlgeschlagene Browserfälle nicht automatisch.

## Verbleibende Verifikationsgrenzen

- Das lokale Chromium vertraut der Entwicklungsumgebungs-Proxy-CA nicht und meldet bei externem HTTPS `ERR_CERT_AUTHORITY_INVALID`. Eine zusätzliche CA-Vertrauensänderung wurde von der automatischen Freigabeprüfung abgelehnt und nicht durchgeführt. Die öffentliche Website und das Laden von OSM-Kacheln wurden anschließend erfolgreich mit dem regulären Chromium-Runner von GitHub geprüft, ohne TLS-Prüfungen abzuschalten.
- Direkte HTTPS-Terminalanfragen funktionieren mit der vorhandenen System-Vertrauenskette. Der OSM-Tile-Dienst kann Anfragen der gemeinsam genutzten Entwicklungsumgebung zusätzlich gemäß seiner Nutzungsrichtlinie blockieren. Es wird keine Tile-Sperre umgangen.
- Supabase ist eingerichtet und die Produktions-RLS-Konfiguration geprüft. Google OAuth ist laut echtem Auth-Einstellungsendpunkt noch deaktiviert; ein Spielserver ist nicht veröffentlicht. Reale Anmeldung, Storage-Uploads und Live-Multiplayer bleiben offen.
- Kein Zugriff auf echte iPhones/Android-Geräte: Homescreen-Installation, Betriebssystem-Push, reale Positionsgenauigkeit und Verhalten bei gesperrtem Bildschirm sind nicht physisch getestet.
- Kein unabhängiges Security-Audit und kein Lasttest für einen öffentlichen Großbetrieb. Ein einzelner Spielserver ist vorgesehen.

Nach dem Anschluss der Dienste sind nur die Live-Prüfungen aus [DEPLOYMENT.md](DEPLOYMENT.md) zu wiederholen. Lokale Testergebnisse dürfen nicht als Nachweis einer bereits spielbaren Onlineinstallation bezeichnet werden.

## Echte Supabase-Prüfung — 22.10.2026

Beide Migrationen sind auf Projekt `dxoleuqmhcnqnjyqdqvw` angewendet und ihr Verlauf entspricht den Dateinamen im Repository. SQL-Abfragen bestätigen RLS auf allen 21 Tabellen und die private Avatarablage mit 2-MB-Limit und JPEG/PNG/WebP-Whitelist. Anonyme Rollen haben keinen Zugriff auf Profile oder GPS-Pins; angemeldete Clients dürfen keine Profile direkt schreiben, Checkpoints lesen oder den Checkpoint-RPC ausführen. Der Service-Role darf den RPC ausführen. Es wurden keine Testkonten in der Produktionsdatenbank angelegt.

Der Supabase-Advisor meldet nach der zweiten Migration keine Warnungen oder Fehler. Zwei Informationsgruppen sind erwartet: [RLS ohne Client-Policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) bei sechs bewusst ausschließlich serverseitigen Tabellen sowie [noch unbenutzte Indizes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) in einer frischen Datenbank. Acht fehlende Fremdschlüsselindizes und die ineffiziente Wiederholung von Auth-Abfragen in Policies sind behoben.
