# MANHUNT 0.b1.109 — Swipe-Bestätigungen

Die Zonenwarnung, die bestätigte Rückkehr in die Spielzone und die Zombie-Wiederbelebung verwenden dieselbe neue Komponente `SwipeConfirm`. Die 78–84 Pixel hohe Schiebefläche enthält einen 72–76 Pixel breiten, abgerundeten Pfeilgriff. Bordeaux kennzeichnet die gesperrte Rückkehr, Mintgrün die freigegebene Rückkehr und Limettengrün die Wiederbelebung. Der Text blendet beim Ziehen aus.

Bestätigt wird erst beim Loslassen nach mindestens 95 % des tatsächlich verfügbaren Schiebewegs. Ein Tippen auf die Fläche bestätigt nichts. Pointer Capture hält das Ziehen auch außerhalb des Griffs aufrecht. Vorzeitiges Loslassen, Touch-Abbruch, Fokusverlust und Größenänderungen setzen den Griff zurück. Nur der Griff sperrt Touch-Scrollen; außerhalb bleibt vertikales Scrollen möglich.

Nach einem vollständigen Swipe sperrt die Komponente weitere Eingaben sofort, zeigt eine kurze Rückmeldung und sendet genau eine Bestätigung. Schlägt die Anfrage fehl, erscheinen die Fehlermeldung und ein zurückgesetzter Griff; nur eine neue bewusste Geste startet einen weiteren Versuch. Die bestehende serverseitige GPS-Freigabe und alle Spielregeln bleiben maßgeblich. Eine einzige Rückkehrmessung entsperrt den Regler nicht. Tastatur, Screenreader-Beschriftungen, sichtbarer Fokus und reduzierte Animationen werden unterstützt.

Keine Änderungen am Adminportal, an der Datenbank oder an der Serverlogik. Das vorhandene Backend bleibt unverändert bereitgestellt; diese Version aktualisiert die Spieloberfläche.

## Prüfungen

Die Browserprüfungen verwenden isolierte lokale Spielserver, ausdrücklich gekennzeichnete Testidentitäten und simulierte GPS-Messungen. Die Tests senden keine Teststandorte an Produktionsmatches. Touch-Gesten werden über die Chromium-Eingabeschnittstelle ausgeführt; dies ersetzt keinen Test auf einem physischen Smartphone.

| Test-ID | Schritte | Erwartetes Ergebnis |
| --- | --- | --- |
| SWIPE-320 / SWIPE-1440 | Zonenwarnung öffnen; gesperrten Griff ziehen und Ende-Taste drücken; erst eine, dann zwei gültige Rückkehrmessungen senden | Keine Bestätigung im gesperrten Zustand; Freigabe erst nach bestätigter Rückkehr |
| SWIPE-320 / SWIPE-1440 | Fläche und Griff antippen; auf 93 % ziehen und loslassen | Keine Anfrage; Griff gleitet vollständig zurück |
| SWIPE-320 / SWIPE-1440 | Auf 96 % ziehen, dabei den Griff vertikal verlassen; loslassen; während verzögerter Antwort erneut bestätigen | Der Griff folgt weiter; genau eine Anfrage; weitere Eingaben gesperrt |
| SWIPE-320 | Zombie-Griff per Touch auf 97 % ziehen und Touch abbrechen; außerhalb des Griffs vertikal scrollen; anschließend vollständig wischen | Abbruch ohne Anfrage; normales Scrollen bleibt möglich; erfolgreicher neuer Swipe bestätigt einmal |
| SWIPE-1440 | Pfeiltasten und Home verwenden; reduzierte Bewegung aktivieren; Ende drücken und loslassen; erneut Ende drücken | Fortschritt korrekt, keine Übergangsanimation, einmalige Bestätigung erst beim Loslassen |
| SWIPE-ERROR | Erste Bestätigungsanfrage kontrolliert ablehnen; anschließend erneut bewusst bestätigen | Fehlermeldung, Rücksetzen und erneute Freigabe; keine automatische Wiederholung; zweiter Versuch erfolgreich |

Alle oben aufgeführten Swipe-Prüfungen bestanden. Zusätzlich bestanden lokal 255 Unit-/Engine-/API-/SQL-Tests, 9 Socket-Multiplayer-Tests, 31 Edge-Browserfälle und 25 Frontend-/Authentifizierungstests: **320 unterschiedliche Tests** nach den gezielten Wiederholungen. TypeScript und Produktionsbuild bestanden. Die Authentifizierungsfälle arbeiten lokal mit kontrollierten Auth-Antworten; sie sind kein Nachweis einer tatsächlichen E-Mail-Zustellung.

Ein bestehender Test musste von `fill('100')` auf die Tastaturbedienung des neuen Griffs umgestellt werden. Im ersten parallelen Lauf überschritt ein Mehrspielerfall sein Zeitlimit bei der Bereinigung; ein Karten-Popup-Test verpasste seine Anzeige. Beide bestanden beim separaten Nachtest. Für den bereits zuvor in GitHub fehlgeschlagenen OFFLINE-LOAD-Fall ist der Service Worker nur in diesem Test deaktiviert: Die gezielt unterbrochene Modul-Anfrage soll die Wiederherstellung der Route prüfen, ohne die in Chromium getrennte Netzwerk-Simulation für Seite und Worker zu vermischen. Dieser Fall bestand anschließend zusätzlich dreimal hintereinander. Die Service-Worker-Funktion der App bleibt unverändert.

Die Screenshots wurden bei 320 Pixel und 1440 Pixel Breite visuell geprüft. Der Fehler-/Wiederholungsfall läuft bei 390 Pixel. Echte iPhone-/Android-Geräte waren nicht verfügbar. Veröffentlichung und rein lesende Live-Browserprüfungen werden erst nach tatsächlicher Bereitstellung bestätigt.
