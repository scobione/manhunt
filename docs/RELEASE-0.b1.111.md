# MANHUNT 0.b1.111 — Automatische XP-Punkte

XP-Jagd startet jeden Punkt automatisch. Die manuelle Bestätigung durch Host oder Admin entfällt auch für bereits wartende Punkte in laufenden Matches. Spielstand, Punkte, Rollen und Teilnehmer bleiben erhalten. Die bestehende Prüfung von Fußwegdaten, aktiver Spielzone, Sperrzonen und Sicherheitsabständen bleibt aktiv. Fehlende geeignete Wegdaten erzeugen keinen zufälligen ungeprüften Ersatz.

Aktive Hider sehen „Nicht erreichbar (0/5)“. Pro Spieler und Match sind fünf erfolgreiche Ersetzungen erlaubt, auch für einen Host, der als Hider spielt. Ein Ersatz wird zufällig aus geeigneten Wegpunkten gewählt und liegt mindestens 25 Meter weiter vom meldenden Spieler entfernt als das vorherige Ziel; bei größerer GPS-Ungenauigkeit gilt mindestens die doppelte Messungenauigkeit als zusätzlicher Abstand. Die übliche Mindestentfernung zwischen zwei Zielen gilt ebenfalls.

Der Server benötigt dafür einen höchstens zehn Sekunden alten, zuverlässigen Standort. Ohne passenden weiter entfernten Punkt bleiben bisheriges Ziel und persönliches Kontingent unverändert. Neuladen und Wiederverbinden setzen das Kontingent nicht zurück. Doppelte oder veraltete Meldungen zählen nicht mehrfach. Hunter, Zombies, ausgeschiedene Spieler und Spieler ohne aktive Standortfreigabe dürfen keine Ersetzung anfordern. Meldungen geben keine Matchpunkte, Account-XP oder Badge-Fortschritte.

Der Host kann Wegdaten erneut laden, wenn kein aktives Ziel verfügbar ist. Dieser Knopf kann das Fünfer-Limit nicht durch unbegrenztes Ersetzen eines bestehenden Ziels umgehen. Die Sammlung bleibt durch Rollen-, GPS-, Radius- und Serverzustandsprüfung geschützt. Neue Punkte aktivieren sich ebenfalls nach Sammlung und bei notwendiger Ersetzung durch Apokalypse automatisch.

Das Admin-Simulationsspiel verwendet dieselben Regeln und Komponenten. Feedback und sämtliche Badges aus [0.b1.110](RELEASE-0.b1.110.md) bleiben enthalten. Die vollständigen [Badge-Stufen](MANHUNT-Badges-und-Stufen.txt) und [Feedback-Fragen](MANHUNT-Feedback-Fragen.txt) stehen als Textdateien bereit.

Kartenkorrektur: GPS-Marker bleiben in der Kartenebene; Kartenbuttons können auch dann bedient werden, wenn ein Marker hinter ihnen liegt. Diese Korrektur behebt den im GitHub-CI-Lauf von 0.b1.110 gefundenen mobilen Klickfehler.

Zusätzliche CI-Korrektur: Im optionalen Node-/Socket.IO-Backend teilen erfolgreiche Anfragen mehrerer Spieler im selben WLAN nicht mehr ein einziges kleines IP-Kontingent. Verifizierte Konten bleiben individuell begrenzt; fehlgeschlagene Anfragen und öffentliche Konfigurations-/Benutzernamenabfragen behalten getrennte IP-Limits. Dies behebt den im vollständigen CI-Lauf aufgezeichneten HTTP-429-Fehler beim erneuten Laden der Konfiguration. Das produktive Supabase-Backend verwendet bereits individuelle Quoten.

## Betrieb

Bestehende Vercel-Projekte und Supabase Edge Function, keine neue Datenbankmigration und keine neuen Umgebungsvariablen. Private Zähler werden im bestehenden serverseitigen Match-Checkpoint gespeichert und nur dem jeweiligen Spieler ausgegeben. Keine neuen kostenpflichtigen Dienste. Der automatische GitHub-Deploy baut Spiel und eigenständiges Adminportal.

## Prüfung

Siehe [Testbericht](TEST-REPORT-0.b1.111.md). Karten- und GPS-Prüfungen sind automatisierte Tests mit ausdrücklich simulierten Daten; ein Test auf einem realen Outdoor-Gerät bleibt davon getrennt. OpenStreetMap-Daten können unvollständig sein: Die App garantiert keine tatsächliche Zugänglichkeit eines Wegs. Die bestehenden Hinweise zum Benutzen öffentlicher Wege bleiben sichtbar.
