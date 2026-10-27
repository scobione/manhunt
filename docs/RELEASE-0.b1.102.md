# MANHUNT — erste Beta 0.b1.102

Produktionsadresse: **https://manhunt-pwa.vercel.app**. Quellcode und automatische Builds: https://github.com/scobione/manhunt.

## Kartenkorrektur

GPS-Punkte behalten beim Zoomen, Verschieben und Drehen ihre geografische Position. Die eigene Markerklasse hatte MapLibres absolute Positionierung mit `position: relative` überschrieben. Im Browser war dadurch ein Versatz von 30 Pixeln reproduzierbar; je nach Zoom entspricht das einer anderen Entfernung auf der Karte. Die Marker liegen jetzt wieder absolut am von MapLibre berechneten Kartenpunkt. Profilbilder sind ebenfalls exakt um diesen Punkt zentriert. Der Puls-Effekt verändert nur den äußeren Ring.

Die öffentliche Versionskennung lautet überall **0.b1.102**, einschließlich Seitenmenü und API-Healthcheck. Das npm-Paket verwendet dafür die gültige SemVer-Version `0.1.102-beta.1`; `releaseVersion` enthält die gewünschte öffentliche Schreibweise.

Dieser Release benötigt keine Datenbankmigration und verändert keine Spielregeln, gespeicherten Accounts oder Matchzustände. Die zuvor bereinigte Startseite und die Vercel-Datenschutzhinweise bleiben enthalten.

## Regressionstest der GPS-Marker

Die Tests in `tests/map-zoom.spec.ts` laufen mit drei isolierten Testkonten, einem lokalen Spielserver und ausdrücklich simulierten GPS-Koordinaten. Eigener Standort, Spieler-Pins und ein Profilbild liegen auf derselben bekannten Koordinate wie ein separat dargestellter XP-Marker. Gemessen werden die tatsächlich gerenderten Mittelpunkte im Browser, nicht nur CSS-Eigenschaften. Echte MapLibre-Projektion und WebGL bleiben aktiv; externe Karten- und Avatarabrufe werden in diesem Test isoliert.

| Test-ID | Schritte | Erwartung | Ergebnis |
| --- | --- | --- | --- |
| MAP-ZOOM-MOBILE | 390 px Touch-Ansicht, GPS-Einwilligung, hinein-/herauszoomen, Mausrad, Karte verschieben/drehen, Zwei-Finger-Zoom, Fenstergröße ändern | Alle Marker und das Profilbild liegen bei jeder geprüften Kameraposition innerhalb von 1,5 Pixeln um denselben geografischen Punkt; die Karte verschiebt sich tatsächlich | BESTANDEN |
| MAP-ZOOM-DESKTOP | 1280 px Desktop-Ansicht mit reduzierten Animationen, GPS-Einwilligung, hinein-/herauszoomen, Mausrad, Karte verschieben/drehen, Fenstergröße ändern | Dieselbe Positionsprüfung ohne Animationsabhängigkeit | BESTANDEN |

Vor der Korrektur schlugen beide Positionsprüfungen mit 30 Pixeln Abweichung fehl. Nach der Korrektur bestanden beide. Das ist eine Browserprüfung mit synthetischem GPS, kein Test der GPS-Hardware eines physischen iPhones oder Android-Geräts.

## Prüfung der Beta

Am 27.10.2026 tatsächlich ausgeführt:

| Prüfung | Ergebnis |
| --- | --- |
| TypeScript und Produktionsbuild (Frontend, Node und Supabase Edge) | BESTANDEN |
| Unit-, API-, Engine- und PostgreSQL-Tests | 190 BESTANDEN |
| Browser: Edge-Multiplayer, GPS, Karte, Zonen, Chats und Teams | 24 BESTANDEN |
| Browser: Socket.IO-Multiplayer | 8 BESTANDEN |
| Browser: Produktionsbundle und isolierte Auth-Abläufe | 18 BESTANDEN |
| Browser: Weiterleitungsseite | 4 BESTANDEN |
| Produktionsabhängigkeiten: npm audit | 0 gemeldete Schwachstellen |
| Live-Supabase: Healthcheck, Versionskennung, erlaubte Origin | BESTANDEN, HTTP 200 und 0.b1.102 |
| Live-Supabase: privates Profil ohne Sitzung / fremde Origin | BESTANDEN, HTTP 401 / 403 |

Damit bestehen **244 lokale automatisierte Tests** (190 Unit/Integration und 54 Browserfälle), ohne fehlgeschlagene oder übersprungene Fälle in diesen abschließenden Läufen. Lokale Auth-Antworten, GPS-Koordinaten und XP-Fußwegdaten sind ausdrücklich Testfixtures. Die GitHub-Actions-Läufe und Prüfungen der veröffentlichten Website sind zusätzlich direkt am jeweiligen Commit nachvollziehbar.

## Bestehende Prüfgrenzen

Die ausführliche frühere Endabnahme steht im [Abnahmebericht b.0.69.48](ACCEPTANCE-b.0.69.48.md): 126 von 134 Akzeptanz-IDs bestanden, 8 blockiert. Dieser Kartenfix erklärt diese offenen Punkte nicht nachträglich für bestanden. Insbesondere sind ein positiver Live-Nachweis externer XP-Fußwegdaten, eigene E-Mail-Zustellung und Prüfungen auf physischen Mobilgeräten davon getrennt. Hintergrund-GPS und Push hängen weiterhin vom Betriebssystem und der jeweiligen Gerätefreigabe ab.

Nach Veröffentlichung die bestehende Webapp neu laden beziehungsweise vollständig schließen und wieder öffnen. Im Seitenmenü muss **0.b1.102** stehen; eine Neuinstallation oder neue Registrierung ist nicht erforderlich.
