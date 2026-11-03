# MANHUNT 0.b1.110 — Simulation, Feedback und Badges

## Funktionen

Das Adminportal erhält „Spiel simulieren“, „Spielerfeedback“ und „Badges“. Eine Simulation gehört einem berechtigten Administrator und benötigt dessen bestehende, zeitlich begrenzte Admin-Sitzung. Normale Benutzer erhalten weder einen Zugang noch eine Serverberechtigung. Test-Lobbys stehen ausschließlich in `admin_simulations`, verfallen nach 24 Stunden und verwenden virtuelle UUIDs ohne Auth-Konten. Sie erreichen keine echten Match-, Push-, Feedback- oder Belohnungstabellen.

Nach Auswahl von Einstellungen und Zone entstehen automatisch genügend virtuelle Spieler mit sicheren Positionen innerhalb der Zone. Die Simulation verwendet `GameEngine`, den regulären Einstellungs- und Zonen-Editor und dieselbe Spielansicht einschließlich GPS-Warnung, Countdown, Karte, Chat und Swipe-Bestätigungen. Perspektiven und Gruppen können ausgewählt werden. Test-Events verändern den tatsächlichen isolierten Spielzustand: Ortswechsel, Rückkehr, Standort/Pin, Fang, Infektion, Wiederbelebung, Heilung, XP-Sammlung, Phasenwechsel, Zeitablauf, Verbindung, Feedback und Badge-Stufen. Ein Pin-Event spult erforderlichenfalls zum regulären Veröffentlichungstermin vor. Zurücksetzen verwirft alle virtuellen Zustände und Timer; veraltete Requests können die neue Generation nicht überschreiben. Gleichzeitige Änderungen sind durch eine Revisionsprüfung geschützt.

Neue Simulationen und Zurücksetzen übernehmen den aktuellen Fragen- und Badge-Katalog als getrennte Kopie. Virtuelle XP-Wegpunkte sind ausdrücklich Testdaten; die Wegdatenprüfung echter Spiele bleibt erhalten. Zeit und Bewegung werden simuliert, damit echte GPS-Prüfungen nicht umgangen werden müssen. Die Simulation ist kein Nachweis realer GPS-, Kamera-, Push- oder Funknetzqualität.

Nach jedem regulär abgeschlossenen Spiel wird jedem verbliebenen aktiven Teilnehmer, auch Gästen, einmal Feedback angeboten. Es gibt keine Zufallsauswahl und keinen Mindestabstand mehr. Ein abgebrochenes Match erzeugt keine Abfrage. Die freiwillige Abfrage folgt den Ergebnissen und sperrt die Navigation nicht. Modusfragen erscheinen nur bei aktivierten Modulen. Der [Fragenkatalog als Textdatei](MANHUNT-Feedback-Fragen.txt) enthält die tatsächlichen Texte und Antwortmöglichkeiten.

**Jede einzelne Frage darf ausgelassen werden.** „Frage überspringen“ schließt niemanden vom Beta-Tester-Badge aus. „Feedback absenden“ zählt auch dann, wenn alle Fragen einzeln ausgelassen wurden. Nur „Gesamtes Feedback überspringen“ vergibt kein Badge. Gäste können antworten, erhalten aber keine dauerhaften Badges. Die Speicherung der Antwort und die Badge-Vergabe sind atomar; wiederholte Requests erzeugen keine zweite Belohnung. Positive und negative Bewertungen zählen gleich.

Administratoren sehen Antworten samt Fragebogenversion, Spiel, Modulen und Zeitpunkt, können nach Zeitraum, Modus und Bewertung filtern und den aktiven Fragenkatalog bearbeiten. Nicht beantwortete Sternefragen werden nicht als Null-Sterne-Bewertung in den Durchschnitt einbezogen. Frühere Fragebogenversionen bleiben bei den Antworten erhalten.

Die Profile zeigen Beta-Tester sowie die gestuften Badges Hunter, Hider, Veteran und XP-Scout. Gesperrte Badges, Voraussetzungen, Freischaltdatum und Fortschritt sind sichtbar; ein freigeschaltetes Badge kann als Profil-Badge für Lobby und Spiel gewählt werden. Zehn Stufen I–X, Hunter II ab 20 gültigen Fängen, individuelle Stufennamen und Admin-Konfiguration sind vorhanden. Spiel-Erfolge zählen seit Einführung in gewerteten Matches ab fünf Minuten mit mindestens zwei registrierten Spielern, begrenzt auf fünf Matches pro Tag. Alte Erfolge werden nicht erfunden oder rückwirkend ergänzt. Diese Begrenzung betrifft weder das Feedback-Angebot noch das Beta-Tester-Badge.

Außerdem bleiben geöffnete Karten-Popups bei der laufenden Synchronisierung erhalten. Marker werden anhand ihrer ID aktualisiert und bei entfallender Sichtberechtigung entfernt; MapLibre behält die alleinige Kontrolle über die Position beim Zoomen.

Die vollständige [Badge- und Stufenliste als Textdatei](MANHUNT-Badges-und-Stufen.txt) enthält alle Schwellen und individuellen Stufennamen.

## Daten und Betrieb

Zwei additive Migrationen ergänzen zwölf RLS-geschützte Tabellen und serverseitige Funktionen. Accounts, Freundschaften, Lobbys und bestehende Statistiken bleiben erhalten. Direkte Client-Schreibrechte auf Badges, Zähler, Admin-Simulationen oder Feedbackauswertungen bestehen nicht. Der einzige zusätzliche Definer-Helfer liegt im privaten Schema und liefert ausschließlich die Information, ob ein Account registriert ist; nur die Serverrolle darf ihn aufrufen.

Beide bestehenden Vercel-Projekte und das bestehende Supabase-Projekt bleiben bestehen. Das Admin-Projekt verwendet `admin` als Root Directory mit Zugriff auf gemeinsame Quelldateien; Installation: `npm ci --prefix .. && npm ci`. Das Hauptportal behält sein eigenes Manifest und den bisherigen Service Worker. Die simulierte Spielansicht ist ein eigener Einstiegspunkt auf der Admin-Domain und kann nur von dort eingebettet werden. Sie erhält keine Admin-Zugangstokens. Sensible Antworten und Zugangsdaten werden nicht in den Offline-Cache aufgenommen.

Keine neuen bezahlten Ressourcen, Abonnements oder Umgebungsvariablen erforderlich. Veröffentlichung und Prüfnachweise stehen im [Testbericht](TEST-REPORT-0.b1.110.md).
