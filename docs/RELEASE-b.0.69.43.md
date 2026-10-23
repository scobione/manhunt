# b.0.69.43

Ziel dieser Beta ist der vollständige Weg von der Anmeldung über eine bestätigte Spielzone und private Lobby zum Multiplayer-Match. Der Versionsname im npm-Paket lautet `0.69.43-beta`, in der Oberfläche `b.0.69.43`.

## Änderungen

- Supabase-Edge-Backend mit geprüften Benutzer-Sitzungen, autoritativer bestehender Spielengine, dauerhaften PostgreSQL-Checkpoints, atomarer Revisionsprüfung, persistenten Ratenbegrenzungen und automatischer Datenbereinigung.
- HTTP-Synchronisierung für die bestehende Sites-Adresse; Node/Express/Socket.IO als alternative Betriebsart weiterhin vorhanden. Kein Render-Konto erforderlich.
- Profil-, Freundes-, Einladungs-, Lobby-, Spiel-, Ergebnis- und Preset-Routen sind auch im Edge-Betrieb implementiert. Öffentliche Health-Checks melden den tatsächlichen Datenbankstatus.
- Gespeicherte Zonen werden beim erneuten Öffnen wiederhergestellt. Nach der Bestätigung führt „Weiter: Lobby erstellen“ in die Lobby-Erstellung; die Zone wird übernommen und für das konkrete Match erneut bestätigt. „Zone bestätigen & zum Warteraum“ beendet den Editor im Lobby-Kontext.
- Längere Verbindungslücken pausieren vor der Auswertung vergangener Fristen. Gleichzeitige Rückkehr mehrerer Spieler überspringt diese Prüfung nicht.

## Prüfung

Automatisierte Prüfungen decken Engine, beide Transportschichten, SQL/RLS, konkurrierende Änderungen, Konto-Löschung, Wiederverbindung, Berechtigungen, GPS-Genauigkeit, Fänge, Infektionen, Zonen und die mobile Zone-zu-Match-Strecke ab. Browser-Testidentitäten und simulierte GPS-Proben bleiben in isolierten Tests. Veröffentlichte Health-/Auth-Grenzen und öffentliche Browserseiten werden zusätzlich geprüft.

Echte Google-Anmeldung, Registrierung mit zugestellter E-Mail, Hintergrundverhalten und reale iPhone-/Android-Ortung können nur mit entsprechenden Konten und Geräten abschließend getestet werden. Es wird kein erfolgreicher Geräte- oder Mailtest behauptet. Betreiberangaben im Impressum müssen vor öffentlichem Regelbetrieb ergänzt werden. Supabases Hinweis auf deaktivierten Schutz gegen geleakte Passwörter bleibt sichtbar; keine kostenpflichtige Option wurde dafür aktiviert.

## Vom Nutzer gewünschte Folgeaufgabe

Ein **Codex-Security-Check** wird erst gestartet, wenn beide Bedingungen erfüllt sind:

1. b.0.69.43 ist vollständig veröffentlicht.
2. Der Nutzer hat die veröffentlichte Version selbst getestet und dies bestätigt.

Die Prüfung ist bis dahin ausdrücklich vorgemerkt und noch nicht durchgeführt. Normale Entwicklungsprüfungen, RLS-Tests und Supabase-Konfigurationsprüfungen ersetzen diesen späteren Scan nicht.
