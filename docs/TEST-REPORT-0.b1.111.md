# Testbericht 0.b1.111

Stand: 4. November 2026. Alle hier als bestanden verzeichneten Tests wurden lokal ausgeführt. Ausschließlich isolierte Testidentitäten, simuliertes GPS, feste Fußweg-Testdaten und lokale Persistenzadapter; keine erfundenen Spieler im Produktivbetrieb.

## Ausgeführt

- 289 Unit-, Engine-, API-, Datenbank-, Feedback-, Badge- und Simulationstests: bestanden.
- Vier gezielte Chromium-Browserfälle: bestanden. Zwei XP-Abläufe mit getrennten Hider-Sitzungen bei 320 und 1440 Pixeln sowie Kartenzoom auf Smartphone- und Desktopgröße.
- Produktionsbuilds für Spiel und Adminportal einschließlich TypeScript: bestanden.
- Keine Datenbankmigration für diese Änderung erforderlich.

Die GitHub-Pipeline führt bei diesem Release zusätzlich sämtliche vorhandenen Socket-, Edge-, Admin-, Auth- und Weiterleitungs-Browsertests sowie die Abhängigkeitsprüfungen aus: [CI-Läufe](https://github.com/scobione/manhunt/actions). Dieser Bericht unterscheidet ausgeführte lokale Prüfungen von dem anschließend erzeugten CI-Lauf; dessen Ergebnis und die Live-Bereitstellung werden im Veröffentlichungsbericht bestätigt.

## Akzeptanzfälle

Voraussetzung für Engine-Fälle: isolierte Spielengine, drei Testspieler, XP-Jagd, synthetische Wegpunkte. Für CAS: dieselben HTTP-Handler wie in Produktion mit isoliertem revisioniertem Store. Für Browser: laufender lokaler HTTP-Server, echte Chromium-Sitzungen, simulierte GPS-Berechtigung und Koordinaten.

| ID | Schritte | Erwartetes und tatsächliches Ergebnis | Status |
| --- | --- | --- | --- |
| XP-AUTO-01 | Starten, als Hider am Ziel sammeln, ohne Host-Bestätigung | Erster und nachfolgender Punkt sind aktiv; genau ein Fortschritt | BESTANDEN |
| XP-AUTO-02 | Alten Checkpoint mit unbestätigtem Punkt wiederherstellen und sammeln | Derselbe Punkt wird aktiv; Match und Fortschritt bleiben erhalten | BESTANDEN |
| XP-REPORT-01 | Fünf weiter entfernte Ersetzungen, jeweils Checkpoint neu laden; sechster Versuch | Fünf Ersetzungen, sechste gesperrt; anderer Nutzer bleibt bei 0; keine Punktebelohnung | BESTANDEN |
| XP-REPORT-02 | Ausschließlich ungeeignete Ersatzkandidaten bereitstellen | Verständlicher Fehler, Ziel und Zähler unverändert | BESTANDEN |
| XP-REPORT-03 | Dieselbe Punkt-ID zweimal melden | Nur erste Meldung verarbeitet, zweite als veraltet abgelehnt | BESTANDEN |
| XP-REPORT-04 | Fehlendes, veraltetes, ungenaues oder entzogenes GPS verwenden | Keine Ersetzung und kein Kontingentverbrauch | BESTANDEN |
| XP-REPORT-05 | Als Hunter, infizierter Hider/Zombie oder ausgeschiedener Spieler melden | Alle nicht berechtigten Rollen abgelehnt | BESTANDEN |
| XP-REPORT-06 | Als Host einen aktiven Punkt regenerieren; während Pause und nach Ende melden | Kein Umgehen des Limits; keine Ersetzung in Pause/Endzustand | BESTANDEN |
| XP-REPORT-07 | Kandidaten in Sperrzone und außerhalb der aktiven Grenze anbieten | Kein ungeprüfter Ersatz | BESTANDEN |
| XP-REPORT-08 | Eigene Koordinaten oder Zähler im Meldebefehl mitsenden | Strenge Eingabevalidierung lehnt Anfrage ab | BESTANDEN |
| XP-REPORT-CAS | Zwei identische Meldungen gleichzeitig mit erzwungenen Revisionskonflikten senden | Ein Erfolg, eine Ablehnung; genau ein Ersatz und ein Verbrauch | BESTANDEN |
| XP-AUTO-BROWSER-320 | GPS freigeben, melden, erfolglos erneut melden, neu laden, zweiter Hider sammelt | Automatische Punkte, weiter entferntes Ziel, beständiger persönlicher Zähler, synchroner Teamfortschritt; kein horizontales Überlaufen | BESTANDEN |
| XP-AUTO-BROWSER-1440 | Derselbe Ablauf am Desktop | Dasselbe Ergebnis | BESTANDEN |
| MAP-ZOOM-MOBILE | Zoom, Ziehen, Drehen, Touch-Zoom, Größenwechsel; GPS-Marker hinter Kartenbutton ziehen und klicken | Marker bleiben verankert und Kartenbutton bleibt klickbar | BESTANDEN |
| MAP-ZOOM-DESKTOP | Derselbe Kartenablauf mit Maus | Marker bleiben verankert und Kartenbutton bleibt klickbar | BESTANDEN |

Die bisherigen XP-Akzeptanztests prüfen weiterhin Sammlung, Doppelsammlung, Radius/GPS, Zombie-Rechte, Siegbedingungen, Schrumpfzonen und fehlende Wegdaten. Die normale Host-Bestätigung ist dort nicht mehr Voraussetzung.

## Prüfgrenzen

Keine Aussage über physische iPhone-/Android-GPS-Hardware, tatsächliche Fußwegzugänglichkeit, echte E-Mail-Zustellung oder persönliche Admin-Anmeldung in Produktion. Für diese Punkte liegt hier kein Geräte- beziehungsweise Accountzugriff vor. Ein erfolgreicher Build ersetzt diese Prüfungen nicht. Die vorherige CI-Version 0.b1.110 hatte einen mobilen Kartenbutton-Fehler; der konkrete Überlappungsfall ist jetzt Bestandteil beider ausgeführten Kartentests.
