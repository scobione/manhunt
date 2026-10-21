# Verifikation — 21.10.2026

Die folgenden Prüfungen wurden in der Entwicklungsumgebung tatsächlich ausgeführt. Kein echter Google-Login, kein reales Outdoor-GPS und keine Supabase-/Render-Bereitstellung werden daraus abgeleitet.

| Prüfung | Ergebnis |
| --- | --- |
| TypeScript `npm run typecheck` | erfolgreich |
| Produktionsbuild `npm run build` | erfolgreich; React/Vite-Frontend und Node-Bundle erstellt |
| Engine-Regressionsfälle | 54 bestanden |
| Authentifizierte REST-/Socket-Integration | 16 bestanden |
| Unveränderte SQL-Migration / PostgreSQL-RLS | 10 bestanden |
| Chromium mit 2–3 getrennten Browser-Sitzungen | 8 Szenarien bestanden |
| Chromium gegen Produktionsbundle ohne Testauthentifizierung | 3 Szenarien bestanden |
| `npm audit` einschließlich Entwicklungsabhängigkeiten | 0 gemeldete Advisories |
| Scan auf bekannte Secret-/Privatschlüssel-Muster | keine Treffer; nur `.env.example` eingecheckt |

## Was die Tests abdecken

**Engine:** alle acht Spielmodi; zufällige und manuelle Rollen; Rollen-/Hostberechtigungen; Vorbereitung/Vorsprung; Pin-Intervalle, Sichtfenster und Ablauf; Schutz fremder Koordinaten und Fangcodes; Fangbestätigung, Fangcode, Näheprüfung, doppelte Fänge und Fehlversuche; serverseitige Infektion; Teamziele und Siegbedingungen; Zeitlimits; Zonen und Schrumpfen; Grenzunsicherheit, alte GPS-Proben, Sprünge und serverseitige Empfangszeit; Notfallpause, Wiederaufnahme, Unterbrechungen; Löschung veralteter privater Zustände.

**API/Socket:** anonyme Anfragen, beide Testmodus-Schranken, Supabase-Verifikationsfehler und abgelaufene Token, Profilisolation, eindeutige Namen, Avatarpfade, Empfängerberechtigung bei Freundschaftsanfragen, Blockieren, private Presets, Origin-Prüfung, gefilterte Zustände, dauerhafte Speicherung verworfener GPS-/Fangversuche, Ergebnisse nach Matchende, Verlassen abgeschlossener Matches, fehlschlagende Persistenz und Kontolöschung. Tests ersetzen Supabase-Auth durch explizite Testidentitäten; der echte OAuth-Provider ist nicht eingerichtet.

**SQL:** PostgreSQL als WASM (PGlite) führt die gesamte Migration mit `pgcrypto` aus. Geprüft werden RLS auf allen 21 Anwendungstabellen (18 angeforderte plus 3 Hilfstabellen), Profil-Trigger, fehlende Client-Schreibrechte, Freundschafts-/Blocktransaktionen, private GPS-/Rollenabfragen, atomare Checkpoints und Versionsschutz, Bereinigung am Matchende, Einladungen, private Avatar-Policies, Erasure und Ablauf. Auth- und Storage-Plattformschemas sind klar gekennzeichnete Testfixtures. Ein realer Supabase-Storage-Upload und reale OAuth-Rückleitungen sind hiermit noch nicht verifiziert.

**E2E:** echte Chromium-Prozesse mit getrennten Browser-Kontexten bedienen die App. Anlegen, Beitreten, Bereitschaft, Start, Fanganfrage und Bestätigung erfolgen über sichtbare Controls. Zombie-Bestätigung wird über den Swipe-Regler mit Tastatureingabe geprüft. Weitere Szenarien prüfen Apokalypse, ungenaues GPS, Freunde/Einladungen/Blocks, Mobilansicht, Offline-Anzeige und Wiederverbindung. Ein eigener Test aktiviert die Browser-Geolocation erst nach ausdrücklicher Zustimmung und stoppt sie wieder. GPS und Konten sind dabei ausschließlich als automatisierte Testdaten simuliert.

**Produktionsbundle:** Startseite, acht Modi, ehrlicher Hinweis auf fehlende Dienste, fehlende Testanmeldung, Datenschutz/Sicherheit, Mobilnavigation, PWA-Manifest, reduzierte Animationen und tatsächliches Zeichnen/Speichern/Exportieren von Zonen. Der MapLibre-Worker wird lokal gebündelt, damit kein fehlender Workerpfad nach dem Vite-Build entsteht. Der Karten-Code wird erst auf den benötigten Seiten geladen.

## Festgestellte und behobene Fehler

- Private Supabase-Avatarablage war mit öffentlichen Objektadressen vermischt; nun eigene Objektpfade und signierte Leseadressen.
- Fehlerhafte Profilcode-Länge und eine nicht existierende Historien-Spalte wurden angeglichen.
- Transport-Rollback verwarf Sicherheitsinformationen nach abgelehnten GPS-/Fangaktionen; solche Zustandsänderungen werden jetzt gespeichert.
- Abgeschlossene Matches verschwanden bei Synchronisierung und ließen sich nicht sauber verlassen; Ergebnis-Synchronisierung und Verlassen wurden korrigiert.
- MapLibre 6 benötigt einen ausdrücklich gebündelten Worker; der Produktionsbuild enthält ihn jetzt.
- Bekannte MapLibre-/Vitest-Abhängigkeitsadvisories wurden durch Updates beseitigt.
- Veraltete pausierte Spielzustände werden vor Wiederherstellung bereinigt und auch aus dem Speicher entfernt.

## Verbleibende Verifikationsgrenzen

- Chromium vertraut der Entwicklungsumgebungs-Proxy-CA derzeit nicht. Externe HTTPS-Kartenkacheln scheitern deshalb im Testbrowser an `ERR_CERT_AUTHORITY_INVALID`. Die lokale Karte/GeoJSON-Interaktion ist geprüft; der externe Tile-Download ist nicht erfolgreich verifiziert. Eine zusätzliche CA-Vertrauensänderung wurde von der automatischen Freigabeprüfung abgelehnt und nicht durchgeführt.
- Direkte HTTPS-Terminalanfragen funktionieren mit der vorhandenen System-Vertrauenskette. Der OSM-Tile-Dienst kann Anfragen der gemeinsam genutzten Entwicklungsumgebung zusätzlich gemäß seiner Nutzungsrichtlinie blockieren. Es wird keine Tile-Sperre umgangen.
- Supabase, Google Cloud und Render werden gemäß Projektinhaber später eingerichtet. Deshalb sind OAuth, reale Storage-Uploads, Produktions-RLS und Live-Multiplayer noch offen.
- Kein Zugriff auf echte iPhones/Android-Geräte: Homescreen-Installation, Betriebssystem-Push, reale Positionsgenauigkeit und Verhalten bei gesperrtem Bildschirm sind nicht physisch getestet.
- Kein unabhängiges Security-Audit und kein Lasttest für einen öffentlichen Großbetrieb. Ein einzelner Spielserver ist vorgesehen.

Nach dem Anschluss der Dienste sind nur die Live-Prüfungen aus [DEPLOYMENT.md](DEPLOYMENT.md) zu wiederholen. Lokale Testergebnisse dürfen nicht als Nachweis einer bereits spielbaren Onlineinstallation bezeichnet werden.
