# Prüfung 0.b1.107

326 lokal bestandene Fälle einschließlich 13 neuer GPS-/Berechtigungsfälle und 4 zusätzlicher Diagnose-Einwilligungsfälle: [Release und Testschritte](RELEASE-0.b1.107.md). Neue Browserfälle verwenden ausschließlich isolierte Testidentitäten und GPS-Koordinaten. Umsetzung und offene rechtliche Angaben: [Entscheidungsstand](TEXTENTSCHEIDUNGEN-0.b1.107.md).

# Aktuell: b.0.69.48

Der vollständige [Abnahmebericht mit 134 Test-IDs](ACCEPTANCE-b.0.69.48.md) dokumentiert Voraussetzungen, Schritte, Soll, Ist, Status und Fehler. [Maschinelle Ergebnisse](verification-b.0.69.48.json). [Release und verbleibende Prüfungen](RELEASE-b.0.69.48.md).

Die folgenden Abschnitte sind historische Testergebnisse früherer Versionen:

# Aktuell: b.0.69.47

146 Unit-/API-/SQL-/Engine-Tests und 34 lokale Browserfälle bestanden. Die neuen Regressionen prüfen die einmalige Wiederaufnahme alter Pausen mit Restzeit und Rollen, konkurrierende Edge-Speicherungen, Weiterlaufen bei Verbindungsabbruch, Standortwiderruf ohne Matchpause und die Entfernung der Pausen-Pushmeldungen. [Release](RELEASE-b.0.69.47.md).

Die folgenden Abschnitte dokumentieren frühere Versionen:

# Verifikation b.0.69.46 / 25.10.2026

143 Unit-/API-/SQL-/Engine-Prüfungen sowie 34 lokale Browserszenarien bestanden. Neue Tests prüfen QR-Gültigkeit, Ziel-/Rollenbindung, Wiederverwendung, echte QR-Bilddekodierung, Gastbeitritt ohne E-Mail/Passwort und Sitzungswiederherstellung, E-Mail-Codebestätigung sowie private Push-Queues, Fristen, Pausen, Widerruf, Leasing und Zugriffsschutz. Testergebnisse der Veröffentlichung werden zusätzlich im GitHub-CI protokolliert. Physische Geräte-Push-Zustellung wird nicht daraus abgeleitet. Details: [Release](RELEASE-b.0.69.46.md).

---

# Verifikation — b.0.69.45 / 25.10.2026

- **126** Engine-, API-, Edge-, SQL- und Zonentests bestanden.
- **30** lokale Browser-Szenarien bestanden: 8 Socket.IO, 7 Edge/GPS einschließlich Kontolöschung, 15 Produktionsbundle/Auth. Der GPS-Pausentest verwendet eine eindeutige Auswahl der Teilnehmerliste, weil der Name zusätzlich am Kartenpin erscheint.
- TypeScript und Produktionsbuild erfolgreich; `npm audit --omit=dev --audit-level=high`: 0 bekannte Advisories.
- Migration `20261025104714_complete_account_erasure` auf dem tatsächlichen Supabase-Projekt angewendet. Die vorhandenen Konten bleiben erhalten. Vor und nach der Migration wurden keine verwaisten Siegerreferenzen in den vorhandenen Historien gefunden.
- Die neue Funktion wurde per reiner SQL-Auswertung ohne gespeichertes Testkonto geprüft. `anon` und `authenticated` dürfen weder die Löschfunktion noch ihre Hilfsfunktion ausführen; `service_role` darf beide ausführen. Beide Funktionen verwenden `SECURITY INVOKER`.
- Supabase-Advisor nach der Migration: keine neuen Sicherheitsmeldungen. Der vorhandene Hinweis auf deaktivierten Schutz gegen geleakte Passwörter und die absichtlich fehlenden Client-Policies auf neun ausschließlich serverseitigen Tabellen bleiben unverändert.

Neue Regressionen decken die Anonymisierung persönlicher Sieger in fremden Ergebnissen, den Erhalt fremder Historien, private Engine-Metadaten, gelöschte Nichtgewinner, veraltete Schreibstände, fehlende Client-Rechte und die nachträgliche Migration eines tatsächlich betroffenen Altbestands ab. Browserprüfungen bedienen die Kontolöschung und öffnen anschließend die anonymisierte Ergebnisansicht und Matchhistorie eines anderen Spielers. Alle Konten und GPS-Proben dafür sind lokale Testfixtures; es wurden keine echten Konten zu Testzwecken gelöscht.

---

## Historischer Stand — b.0.69.44 / 24.10.2026

Der aktuelle Produktionsbuild besteht TypeScript und den vollständigen Build. **121 Engine-, API-, Edge-, SQL- und Zonentests** sowie **29 lokale Playwright-Szenarien** sind erfolgreich: 8 Socket.IO-Multiplayer-, 6 Edge-/GPS- und 15 Produktionsbundle-/Auth-Szenarien. `npm audit --omit=dev --audit-level=high` meldet **0 bekannte Schwachstellen** im geprüften Stand.

Neue Regressionstests prüfen Minuten- und Custom-Einstellungen, den ersten Pin nach dem Vorsprung, Pins mit der letzten bekannten Ortung samt Messalter, laufende Hunter-Positionen bei weiterhin privaten Hider-Ortungen, den Zonentimer bei GPS-Aussetzern, zwei notwendige Innenmessungen vor der Rückkehrbestätigung, Standortwiderruf und den eingefrorenen Timer während einer Pause. Mobile Chromium-Tests prüfen die Vollbildwarnung, den gesperrten und danach nutzbaren Swipe, sichtbare Kartenmarker sowie weiterlaufende Ortung in der Notfallpause. Zwei gesonderte Browserfälle prüfen, dass verspätete GPS-Callbacks nach dem Widerruf oder nach dem Verlassen der Spielansicht nichts mehr senden.

Die Browser-Suiten verwenden getrennte Ergebnisverzeichnisse; parallele Läufe löschen keine fremden Trace-Dateien mehr. GPS-Proben und Testidentitäten bleiben ausschließlich in lokalen Testservern. Ein Test mit realem Outdoor-GPS auf iPhone/Android ist damit nicht ersetzt. Externe OSM-Kacheln können im lokalen Chromium wegen der Umgebung nicht per TLS verifiziert werden; die veröffentlichten Seiten werden deshalb zusätzlich im normalen GitHub-Chromium geprüft. TLS-Prüfungen bleiben aktiv.

Die Ergebnisse und Links der Veröffentlichung stehen im Releasebericht. Frühere Verifikationsstände folgen als **historische Dokumentation**, einschließlich damals noch fehlender Dienste.

---

## Historischer Stand — 22.10.2026

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
| Chromium gegen Produktionsbundle, öffentliche Seiten | 3 Szenarien bestanden |
| Chromium mit isolierten Auth-Sitzungsfixtures | 12 Szenarien; OAuth, E-Mail/Passwort, Registrierung, Versandfehler und Passwort-Rücksetzung |
| Chromium gegen die veröffentlichte HTTPS-Website | 3 Szenarien bestanden; Screenshots als GitHub-Artefakt gespeichert |
| `npm audit` einschließlich Entwicklungsabhängigkeiten | 0 gemeldete Advisories |
| Scan auf bekannte Secret-/Privatschlüssel-Muster | keine Treffer; nur `.env.example` eingecheckt |

## Was die Tests abdecken

**Engine:** alle acht Spielmodi; zufällige und manuelle Rollen; Rollen-/Hostberechtigungen; Vorbereitung/Vorsprung; Pin-Intervalle, Sichtfenster und Ablauf; Schutz fremder Koordinaten und Fangcodes; Fangbestätigung, Fangcode, Näheprüfung, doppelte Fänge und Fehlversuche; serverseitige Infektion; Teamziele und Siegbedingungen; Zeitlimits; Zonen und Schrumpfen; Grenzunsicherheit, alte GPS-Proben, Sprünge und serverseitige Empfangszeit; Notfallpause, Wiederaufnahme, Unterbrechungen; Löschung veralteter privater Zustände.

**API/Socket:** anonyme Anfragen, beide Testmodus-Schranken, Supabase-Verifikationsfehler und abgelaufene Token, Profilisolation, eindeutige Namen, Avatarpfade, Empfängerberechtigung bei Freundschaftsanfragen, Blockieren, private Presets, Origin-Prüfung, gefilterte Zustände, dauerhafte Speicherung verworfener GPS-/Fangversuche, Ergebnisse nach Matchende, Verlassen abgeschlossener Matches, fehlschlagende Persistenz und Kontolöschung. Tests ersetzen Supabase-Auth durch explizite Testidentitäten; der echte OAuth-Provider ist separat eingerichtet; diese API-Tests sind kein Nachweis eines vollständigen Google-Logins.

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
- Supabase ist eingerichtet und die Produktions-RLS-Konfiguration geprüft. Google OAuth ist laut echtem Auth-Einstellungsendpunkt aktiviert und der PKCE-Start ist geprüft; ein Spielserver ist nicht veröffentlicht. Reale Anmeldung, Storage-Uploads und Live-Multiplayer bleiben offen.
- Kein Zugriff auf echte iPhones/Android-Geräte: Homescreen-Installation, Betriebssystem-Push, reale Positionsgenauigkeit und Verhalten bei gesperrtem Bildschirm sind nicht physisch getestet.
- Kein unabhängiges Security-Audit und kein Lasttest für einen öffentlichen Großbetrieb. Ein einzelner Spielserver ist vorgesehen.

Nach dem Anschluss der Dienste sind nur die Live-Prüfungen aus [DEPLOYMENT.md](DEPLOYMENT.md) zu wiederholen. Lokale Testergebnisse dürfen nicht als Nachweis einer bereits spielbaren Onlineinstallation bezeichnet werden.

## Echte Supabase-Prüfung — 22.10.2026

Beide Migrationen sind auf Projekt `dxoleuqmhcnqnjyqdqvw` angewendet und ihr Verlauf entspricht den Dateinamen im Repository. SQL-Abfragen bestätigen RLS auf allen 21 Tabellen und die private Avatarablage mit 2-MB-Limit und JPEG/PNG/WebP-Whitelist. Anonyme Rollen haben keinen Zugriff auf Profile oder GPS-Pins; angemeldete Clients dürfen keine Profile direkt schreiben, Checkpoints lesen oder den Checkpoint-RPC ausführen. Der Service-Role darf den RPC ausführen. Es wurden keine Testkonten in der Produktionsdatenbank angelegt.

Der Supabase-Advisor meldet nach der zweiten Migration keine Warnungen oder Fehler. Zwei Informationsgruppen sind erwartet: [RLS ohne Client-Policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) bei sechs bewusst ausschließlich serverseitigen Tabellen sowie [noch unbenutzte Indizes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) in einer frischen Datenbank. Acht fehlende Fremdschlüsselindizes und die ineffiziente Wiederholung von Auth-Abfragen in Policies sind behoben.

## Google-Anmeldung — 0.2.1

Der echte Auth-Einstellungsendpunkt meldet Google aktiviert. Der Autorisierungsendpunkt leitet mit HTTP 302 auf `accounts.google.com/o/oauth2/v2/auth` und verwendet den Callback `https://dxoleuqmhcnqnjyqdqvw.supabase.co/auth/v1/callback`. Der öffentliche Browsertest prüft Provider, PKCE-Challenge und Rücksprungziel des vom Anmeldebutton ausgelösten Requests, ohne Google-Anmeldedaten zu verwenden. Vollständige Anmeldung und Consent mit einem echten Konto bleiben eine separate Prüfung. Lokale Browserfixtures prüfen die serverseitige Verifikation der Sitzung, Ablehnung manipulierter Cache-Identitäten, Abmelden und abgebrochene Anmeldung. Diese Fixtures fangen sämtliche Supabase-Requests ab und schreiben nichts in die Produktionsdatenbank.

Die Google-Weiterleitung wurde zusätzlich bis zur echten Google-Anmeldeseite (`accounts.google.com/v3/signin/identifier`, HTTP 200) verfolgt; keine `invalid_client`- oder `redirect_uri_mismatch`-Fehlermeldung erschien. Dabei wurden keine Google-Kontodaten eingegeben.

## OAuth-Fehlerdiagnose — 0.2.2

Der gemeldete Fehler wurde am 22.10.2026 in Supabase Auth nachvollzogen: Google antwortet beim Callback mit `invalid_client` und lehnt das Client Secret ab. Das ist eine externe Providerkonfiguration. Die bisherigen Prüfungen des OAuth-Starts konnten diesen erst nach der Google-Anmeldung auftretenden Fehler nicht erfassen. Der Betreiber muss das passende Google-Secret ausschließlich in Supabase ersetzen.

Zusätzlich wurde die verschluckte Fehleranzeige mit einem lokalen Browser-Regressionsfall nachgestellt. Die App wertet nun das Ergebnis von `auth.initialize()` aus; `getSession()` allein gibt Initialisierungsfehler nicht weiter. Neue isolierte Fixtures prüfen erfolgreichen und abgelehnten PKCE-Codeaustausch sowie die Rückleitung in einen Browser ohne lokalen Verifier. Es werden weiterhin keine echten Google-Sitzungen simuliert oder Konten in Supabase angelegt. Ein Test auf einem echten iPhone bleibt erforderlich.

E-Mail-Tests fangen ebenfalls sämtliche Supabase-Requests ab. Sie prüfen falsche und gültige Zugangsdaten, Bestätigungspflicht, Bestätigung erneut anfordern, SMTP-Fehler, einen neutralen Reset-Hinweis sowie das Ändern des Passworts nach einem verifizierten Recovery-Callback. Es wurden keine echten E-Mails versandt. Der öffentliche Einstellungsendpunkt bestätigt `email: true`, `disable_signup: false` und `mailer_autoconfirm: false`; das beweist noch keinen funktionierenden SMTP-Versand.
