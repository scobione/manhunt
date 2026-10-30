# MANHUNT 0.b1.107 — Freigaben in der Lobby

## Änderungen

Jeder aktive Teilnehmer aktiviert seinen Standort im Warteraum. Erst eine aktuelle, ausreichend genaue GPS-Probe erlaubt „Bereit“ und den Spielstart. Die Engine prüft das auch bei direkten API-/Socket-Aufrufen für alle aktiven Teilnehmer; Zuschauer benötigen keinen Standort. Die Genauigkeitsgrenze entspricht der Lobbyeinstellung. Die Prüfung läuft nach 30 Sekunden ab. Ungenaue/alte Proben, Widerruf und Verbindungsabbruch setzen die Bereitschaft zurück.

Die Freigabe gilt für dieselbe Lobby und den anschließenden Spielstart. Die App fragt vor dem ersten Zugriff ausdrücklich nach, zeigt den Zustand und erlaubt jederzeit den Widerruf. Beim Verlassen der Spielseiten, Wechsel von Konto/Lobby, bei Eliminierung und am Matchende beendet sie die Ortung. Ein Neuladen aktiviert sie nicht stillschweigend. Verspätete GPS-Callbacks nach Widerruf oder Navigation dürfen keine Standortdaten mehr senden.

Im Warteraum gehen Position, Genauigkeit und Messzeit an den Spielserver zur Bereitschaftsprüfung. In Checkpoints landen ausschließlich Prüfzeit, Messzeit und Genauigkeit, keine Lobby-Koordinaten. Andere Spieler sehen nur den Bereitschaftsstatus. Standortprüfungen unterliegen der GPS-Ratebegrenzung und erzeugen keine fortlaufenden Audit-Einträge. Erst während des Spiels gilt die bestehende rollenabhängige Standort- und Pin-Sichtbarkeit.

Push kann jeder Mitspieler einschließlich Gästen direkt in der Lobby aktivieren. Der Browserdialog wird erst durch den eigenen Klick angefordert. Push ist freiwillig und blockiert den Start nicht. Auf iOS gelten weiterhin die Voraussetzungen für installierte Webapps und die Einschränkungen von Hintergrundortung und Push-Zustellung.

Nach der ausdrücklichen Freigabe der 70 ursprünglichen Vorschläge sind insgesamt 94 Text-/Informationsänderungen umgesetzt. 88 Behalten-Texte bleiben unverändert. R-16 wurde zusätzlich an die ausdrücklich angeforderte Standortprüfung in der Lobby angepasst. Drei rechtliche Positionen benötigen noch Betreiber-/Altersangaben und eine endgültige Textfreigabe. Dazu gehören die Nutzungsbedingungen und deren Verlinkung. Ein konkreter Entwurf liegt vor; eine unvollständige AGB-Seite wurde nicht veröffentlicht. Einzelheiten: [Textentscheidungen](TEXTENTSCHEIDUNGEN-0.b1.107.md).

Keine Änderung an Admin-Anwendung, Adminrollen, Konten oder gespeicherten Ergebnissen. Keine Migration und kein zusätzlicher Dienst. Laufende Matches werden durch die neue Startsperre nicht beendet oder neu gestartet. Lediglich die isolierten Testvorbereitungen wurden um gültige GPS-Proben und eine fortschreitende Testuhr ergänzt.

Die Verbrauchsdiagnose ist jetzt pro Konto und Browser standardmäßig aus. Erst nach freiwilliger Zustimmung in den Einstellungen werden ein Diagnosebeobachter, Verbindungsart, Zähler und Diagnosekennung erzeugt. Beim Widerruf werden Beobachter entfernt, Zähler verworfen und laufende Diagnose-Uploads abgebrochen. Verspätete Antworten können keine neuen Zähler oder Berichte erzeugen. Verbrauchswerte bleiben ausschließlich für Administratoren sichtbar.

Die Ersteinrichtung hat keine Pflichtcheckbox für das Lesen der Datenschutzhinweise mehr. Der bewusste Abschluss bestätigt nur den technischen Einrichtungsschritt; Passwort- und Benutzernamensprüfung bleiben unverändert. Datenschutz, Impressum und Sicherheit sind in jedem Einrichtungsschritt erreichbar. Gastformular und Standortfreigabe enthalten direkte Datenschutzhinweise.

## Neue Prüfungen

Alle Identitäten und Koordinaten der folgenden automatisierten Tests sind lokale, ausdrücklich gekennzeichnete Fixtures. Die echte Spiellogik und beide bestehenden Transportwege werden verwendet. Keine Produktionsspieler erhalten künstliche GPS-Daten.

| Test-ID | Schritte | Erwartetes und beobachtetes Ergebnis |
| --- | --- | --- |
| LOBBY-GPS-01 | Ohne GPS bereit/starten, dann beide Teilnehmer prüfen | Ohne gültige Probe abgelehnt, danach Spielstart |
| LOBBY-GPS-02 | Lobby-Prüfung durchführen; Zustände, Pins und Checkpoints lesen | Keine Lobby-Koordinaten gespeichert oder veröffentlicht |
| LOBBY-GPS-03 (3 Fälle) | Bereit markieren; ungenaue, alte bzw. zu weit zukünftige Probe senden | Abgelehnt; Bereitschaft auch nach Wiederherstellung entzogen |
| LOBBY-GPS-04 | Probe wiederholen und 30 Sekunden verstreichen lassen | Wiederholung verlängert die Prüfung nicht; Start gesperrt |
| LOBBY-GPS-05 | Freigabe beenden; neu prüfen; Verbindung trennen/wiederherstellen | Keine automatische Wiederherstellung der Bereitschaft |
| LOBBY-GPS-06 | Zuschauer ohne GPS; anschließend aktive Rolle zuweisen | Zuschauer ausgenommen; aktive Rolle benötigt GPS |
| LOBBY-GPS-07 | Fremde Identität und manipulierte Zusatzfelder senden | Kein unberechtigter Zugriff oder fremde Freigabe |
| LOBBY-GPS-08 | Match starten, abgelaufene Vorprüfung wiederherstellen | Laufendes Match bleibt erhalten; Vorprüfung im Spiel unzulässig |
| LOBBY-GPS-EDGE | Ungenaue Probe über HTTP; Zustand erneut laden | Ablehnung und Bereitschaftsrücknahme dauerhaft gespeichert |
| LOBBY-PERM-01 | Zwei Browser; ohne Freigabe starten; dann GPS aktivieren; ohne Push starten; Spiel neu laden | Pflicht in UI und API, beide Push-Karten sichtbar, Freigabe überlebt Start, kein stiller GPS-Neustart nach Reload |
| LOBBY-PERM-02 | Ungenaue Probe, Browserwiderruf, verspäteter Callback und Navigation | Gesperrte Bereitschaft; keine Übertragung nach Widerruf |
| NOTIFY-02 | Host und Gast öffnen Lobby und klicken Push | Je eigener Browserdialog, keine Nachfrage vor dem Klick |
| Socket-GPS | Mit Lobby-Freigabe starten, neue Browser-GPS-Probe, Freigabe beenden | Ortung ohne zweite Freigabe; Widerruf beendet nicht das gesamte Match |

## Ausgeführte Ergebnisse

Lokal **326 unterschiedliche Tests bestanden**, 0 verbleibende fehlgeschlagene Fälle: 255 Unit-/Engine-/API-/SQL-/Diagnosetests, 9 Socket-Browserfälle, 26 Edge-Browserfälle, 25 Produktionsbundle-/Auth-Fälle, 7 Admin-/Spiel-Integrationsprüfungen und 4 Weiterleitungsfälle. Die zunächst durch überholte Textselektoren oder Testvorbereitungen fehlgeschlagenen Fälle wurden korrigiert und erneut erfolgreich ausgeführt. Der Diagnose-Browserfall wurde nach dem letzten Widerrufsabgleich nochmals erfolgreich wiederholt. TypeScript und Produktionsbuild sind erfolgreich. `npm audit --omit=dev --audit-level=high`: 0 bekannte Schwachstellen im geprüften Abhängigkeitsstand.

Die zusätzlichen Fälle DIAG-01 bis DIAG-04 prüfen: keine Diagnose-APIs vor Zustimmung, wirksames Entfernen der Beobachter, kein Abschlussbericht nach Widerruf, Abbruch bereits laufender Uploads, Verwerfen verspäteter Antworten und kontobezogene Auswahl einschließlich einer neuen Entscheidung in einem zweiten Tab. Der Browserfall TRAFFIC-E2E prüft zuerst das ausgeschaltete Standardverhalten, aktiviert die Diagnose über die tatsächliche Einstellungsoberfläche, zeigt Werte nur im unveränderten Adminportal und widerruft anschließend im Spiel ohne weitere Berichte.

Die vollständige GitHub-Pipeline wiederholt die Tests nach dem Push. Vercel baut das bestehende Spielprojekt aus `main`; der separate Supabase-Edge-Build enthält keine Testauthentifizierung. Produktionsadresse bleibt https://manhunt-pwa.vercel.app. Der konkrete Bereitstellungsstatus wird nach dem Rollout überprüft; die lokalen Testergebnisse allein sind kein Nachweis einer erfolgreichen Veröffentlichung.

## Grenzen

Kein abschließender Outdoor-Test auf einem physischen iPhone/Android und kein neuer echter Push-Zustelltest. Lokale Browserprüfungen ersetzen diese Prüfungen nicht. Browser-GPS kann technisch manipuliert werden; die App ist kein fälschungssicherer Standortnachweis.

Vollständige Betreiberangaben, Altersregeln und die Endfassung der Nutzungsbedingungen fehlen weiterhin. Die Veröffentlichung bestätigt keine vollständige Rechtssicherheit.
