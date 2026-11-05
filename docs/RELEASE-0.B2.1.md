# MANHUNT 0.B2.1

## Profil und Erfolge

Eigene Bannerbilder werden vor dem Upload neu gerendert und in einem privaten Bucket gespeichert. Sechs Profilfarben stehen zur Auswahl. Freigeschaltete Badges lassen sich mit beschrifteten Hoch-/Runter-Tasten sortieren; die bestehenden Sichtbarkeitsschalter bleiben erhalten. Freunde erhalten nur freigegebene Badges und die dazugehörige Reihenfolge. Neue Erfolge erscheinen als kurze, bei reduzierter Bewegung ruhige Meldung.

Sieger und Überlebenskünstler ergänzen die vier bisherigen Spiel-Erfolgsreihen und Beta-Tester. Beide neuen Reihen besitzen zehn Stufen. Die Zählung beginnt mit ihrer Einführung; alte Resultate werden nicht erfunden oder nachträglich gewertet. Alle Standardschwellen stehen in [MANHUNT-Badges-und-Stufen.txt](MANHUNT-Badges-und-Stufen.txt).

## Wieder spielen und wiederverwenden

Der Host startet aus den Ergebnissen eine Revanche mit demselben Lobbycode, der Crew, den Regeln und der Zone. Eine neue Match-ID trennt Ergebnisse, Belohnungen und Feedback von der vorigen Runde. Spieler bestätigen Standortfreigabe und Bereitschaft erneut. Alte Feedback-Angebote bleiben im neuen Warteraum erreichbar. Wiederholte Revanche-Anfragen erzeugen keine zusätzlichen Runden.

Registrierte Spieler speichern bis zu 30 persönliche Zonen, inklusive Sperrzonen, Tags und optionaler Regeln, geräteübergreifend. Favoriten und die Suchfunktion vereinfachen die Auswahl. Jede übernommene Zone erfordert erneut die Sicherheitsbestätigung. Regel-Presets können als Favoriten markiert und im Erstellen- und Einstellungsdialog übernommen werden. Die lokale Zonenplanung und Gastspiele bleiben verfügbar.

## Oberfläche

Lobbykarten, Freundesliste und Ergebnisse wurden überarbeitet. Dicht beieinander liegende freigegebene Kartenmarker werden gruppiert; die eigene Position und XP-Ziele bleiben separat. Die Gruppierung ändert keine GPS-Koordinaten und keine Standortberechtigungen. Beim Auflösen der Gruppe liegen Einzelmarker wieder an ihren tatsächlichen Kartenpositionen.

Gemeinsame Dialoge besitzen Fokusführung, Escape-Unterstützung und große Touchflächen. Lade- und Fehlerzustände verwenden dieselbe Darstellung. Eine freiwillige, nicht blockierende Kurzanleitung lässt sich in den Einstellungen erneut öffnen. Die Versionsübersicht ist unter `/updates` erreichbar.

## Fehlerberichte

Im Spiel und in den Einstellungen können Spieler einen Fehler mit Beschreibung und optionalem selbst gewähltem Screenshot melden. Der Upload wird als WebP neu gerendert. Standort, Chat und Anmeldedaten werden nicht automatisch angehängt. Das Backend prüft Dateibesitz, Dateiformat und Matchmitgliedschaft. Höchstens fünf Meldungen je Konto und Stunde sind möglich; wiederholtes Senden derselben Meldung zählt einmal.

Eigene Meldungen sind im Spiel nachlesbar. Im Adminportal gibt es eine eigene, durch Adminidentität und frische Verwaltungssitzung geschützte Übersicht mit zeitlich begrenzten Bildlinks. Simulationen zeigen keine Funktion zum Schreiben echter Fehlerberichte.

## Betrieb

Drei additive Migrationen erweitern dieselbe Datenbank: `rematch_and_achievement_metrics`, `community_library_reports` und `profile_customization_and_badge_order`. Sie legen vier Tabellen mit RLS und zwei private Storage-Buckets an. Es werden keine bestehenden Konten, Freundschaften oder Ergebnisse gelöscht. Die bisherige globale Eindeutigkeit des Lobbycodes wird auf gleichzeitig offene Lobbys begrenzt, damit abgeschlossene Runden denselben Code behalten können.

Keine neuen Dienste, Secrets oder kostenpflichtigen Ressourcen erforderlich. Die Einschränkungen mobiler Hintergrundortung bleiben bestehen. Browserprüfungen mit simulierten Koordinaten ersetzen keinen Feldtest auf einem echten iPhone oder Android-Gerät.

Ausgeführte Prüfungen und Veröffentlichung: [Testbericht](TEST-REPORT-0.B2.1.md).
