# b.0.69.46 — QR, Gastbeitritt, E-Mail und Web-Push

- Ohne Registrierung einer privaten Lobby beitreten: Anzeigename und Lobbycode oder QR. Supabase erstellt eine echte anonyme Sitzung; der Server verifiziert sie mit `getUser`. Keine E-Mail und kein Passwort erforderlich. Gäste dürfen keine neuen Lobbys erstellen. Die Sitzung bleibt auf diesem Gerät gespeichert, kann aber nach gelöschten Browserdaten nicht wiederhergestellt werden. Der Nutzer hat Anonymous Sign-Ins aktiviert; der öffentliche Auth-Endpunkt bestätigt dies.
- Lobby-QR im Warteraum, Kamerascanner und lokale Bildauswahl. Gescannte Links werden auf die eigene Origin und das Lobbyformat begrenzt. Einladungen bleiben über die E-Mail-Anmeldung hinweg erhalten.
- QR-Fang als Standard neuer Lobbys: Hider zeigen ihren Code, Hunter scannen ihn; keine zusätzliche Anfrage. Serverseitige HMAC-Codes wechseln alle 30 Sekunden und gelten höchstens 60 Sekunden. Rollen, Teams, Matchphase, Fehlversuche und bereits erfolgte Fänge werden weiterhin geprüft. Ein Foto oder Weitergeben des Codes beweist keine physische Nähe. Bestehende Lobbys behalten ihre gewählten Fangregeln.
- Google-Button entfernt. E-Mail/Passwort und Bestätigung per eingegebenem E-Mail-Code bleiben. Bestehende Provider-Rückleitungen werden aus Kompatibilitätsgründen weiterhin sicher verarbeitet.
- Web-Push im aktiven Edge-Betrieb: Erinnerungen etwa zehn Sekunden vor einem Pin, neue sichtbare Hider-Pins für Hunter/Zombies, Fänge, Infektion, Eliminierung, Start/Ende, Zonen, Notfallpause und soziale Benachrichtigungen. Gerätefreigabe ist erforderlich. Ereignisse werden auch bei geöffnetem Client versendet. Notfallmeldungen bleiben von der normalen Lobby-Meldungseinstellung unabhängig.
- Dauerhafte Warteschlange mit eindeutigen Ereignissen, Leasing, Wiederholungen, Ablauf und Löschung ungültiger Endpunkte. Supabase Cron prüft alle zehn Sekunden und ruft den Worker nur bei fälliger Arbeit für abonnierte Geräte auf. Keine Koordinaten, Fangcodes oder Spielernamen in Push-Inhalten. Schlüssel und Einmal-Tickets sind ausschließlich serverseitig gespeichert und für Clientrollen gesperrt.
- Vier HTML-Mailvorlagen mit MANHUNT-Logo, dunklem Layout und klaren Aktionen. Bestätigung enthält `{{ .Token }}` und den originalen Supabase-Bestätigungslink. Vorschau und Kopierhilfe: https://manhunt-fieldgame.scobione.chatgpt.site/email-templates/

## Einrichtung auf dem Gerät

MANHUNT neu öffnen. Im Warteraum oder unter Einstellungen „Push aktivieren“ und die Systemberechtigung bestätigen. Auf iOS muss die Website zuerst zum Home-Bildschirm hinzugefügt werden. „Test-Push senden“ prüft die Zustellung auf dem eigenen Gerät. Hintergrundortung und Push-Zustellung sind nicht garantiert; Fokusmodus, Betriebssystem und Netz beeinflussen sie.

## Noch erforderliche Auth-Dashboard-Schritte

Die verbundene Supabase-Integration bietet in dieser Sitzung keinen Zugriff auf die Auth-Konfiguration. Folgende Änderungen sind deshalb vorbereitet, aber nicht als gespeichert behauptet:

1. Unter https://supabase.com/dashboard/project/dxoleuqmhcnqnjyqdqvw/auth/templates die vier Vorlagen samt Betreff aus der Kopierhilfe übernehmen. Die zugesandte Design-Vorschau ist noch keine Änderung an tatsächlich versendeten Mails.
2. Unter https://supabase.com/dashboard/project/dxoleuqmhcnqnjyqdqvw/auth/providers Google deaktivieren. Nach der Nutzerbestätigung meldete der öffentliche Endpunkt Anonymous Sign-Ins aktiv, Google jedoch weiterhin aktiv; in der Oberfläche ist Google entfernt.

Alternativ wendet `scripts/configure-auth.mjs` dieselben nicht geheimen Felder über die Management API an und prüft das Ergebnis. Dafür muss ein geeigneter Management-Token sicher als Umgebungsvariable bereitstehen. Keine Secrets in Chat oder Repository eintragen.

## E-Mail-Kontingent

Laut aktueller Supabase-Dokumentation erlaubt der eingebaute Versand **zwei E-Mails pro Stunde pro Projekt**, nicht zwei pro Spieler und kein einmaliges Guthaben. Er ist offiziell auf Team-Adressen beschränkt und nicht für öffentliche Registrierung gedacht. Eigener SMTP-Versand hat dessen Anbietergrenzen und ein konfigurierbares Supabase-Limit. E-Mail-Empfang und Profilbilder wurden vom Nutzer als funktionierend bestätigt. Die tatsächlich hinterlegten SMTP-Einstellungen konnten hier nicht eingesehen werden.

Quellen: https://supabase.com/docs/guides/auth/rate-limits und https://supabase.com/docs/guides/auth/auth-smtp (25.10.2026).

## Verifikation

143 Unit-/API-/SQL-/Engine-Tests erfolgreich. Browserprüfungen decken echte QR-Bilddekodierung, direkten QR-Fang, anonyme Anmeldung ohne Passwort/Adresse, Gastbeitritt mit Namensvergabe und Neuladen, E-Mail-Codebestätigung sowie die bisherigen GPS-/Multiplayer-Abläufe ab. Insgesamt 34 lokale Browserszenarien: 8 Socket.IO, 9 Edge/GPS/QR und 17 Produktionsbundle/Auth. Ein QR-Screenshot war zunächst durch die feste Mobilnavigation verdeckt; nach korrekter Zentrierung bestand die tatsächliche Bilddekodierung. Keine Testidentitäten oder künstlichen GPS-Daten im Produktivbetrieb.

Physische Kamera-/Push-/GPS-Tests auf iPhone und Android bleiben zusätzlich nötig. Dies ist kein neuer vollständiger Codex-Security-Scan. Anonyme Nutzer sind absichtlich authentifizierte Gastidentitäten; bestehende Eigentümer-/Mitgliedschaftsprüfungen bleiben bestehen. Der Supabase-Advisor weist deshalb auf Policies hin, die auch diesen Gastidentitäten erlaubte eigene Daten anzeigen.
