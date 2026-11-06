# MANHUNT 0.B2.2

Die ausgewählten Verbesserungen bauen auf dem bestehenden Spiel auf. Accounts, Spiellogik, Spielmodi und gespeicherte Daten bleiben im vorhandenen System.

## Während des Spiels

Die Live-Ansicht hält Karte, Restzeit, nächste Pin-Abgabe und GPS-Qualität im ersten sichtbaren Bereich. Der Zeitpunkt der Hunter-Freigabe und aktive Rollen beziehungsweise Teams sind sichtbar. Auf Smartphones liegen Schnellaktionen am unteren Rand; Details, Chat und Sicherheitskontrollen bleiben erreichbar. Sicherheitsdialoge und bestehende GPS-Freigaben haben weiterhin Vorrang.

Die Anzeige unterscheidet aktuelle, ungenaue und veraltete Positionen, nennt die tatsächliche Genauigkeit und das Alter und gibt konkrete Empfangshinweise. Das sind Hinweise; Fang-, Sammel- und Zonenprüfungen führt weiterhin der Server aus.

## Karte, Ortung und Scanner

Ein lokal gespeicherter Sonnenlichtmodus erhöht den Kartenkontrast. Der Genauigkeitskreis lässt sich ein- und ausblenden. Nach manuellem Verschieben erscheint „Zu meinem Standort“. XP-Ziele besitzen einen deutlichen, kompakten Marker. Gruppenanzeigen bleiben auch auf niedrigen Karten bedienbar; ihre Kameraanpassung verschiebt keine tatsächlichen Spielerkoordinaten.

Die Karte verwendet höchstens zwei Worker, weniger Animationen und gecachte Quelldaten. Verdeckte Karten pausieren ihre Anzeigetimer. Ein frischer GPS-Watch vermeidet zusätzliche Einzelabfragen; Hintergrund und Pause stoppen den Beobachter, ohne die erteilte Freigabe als widerrufen auszugeben. Nach Rückkehr wird eine frische Ortung verlangt. Die bestehenden Aktualitätsgrenzen, Standortzustimmung und serverseitigen Prüfungen bleiben erhalten.

Ton und Vibration sind standardmäßig aus und freiwillig aktivierbar. Kurze Hinweise beziehen sich auf neue echte Spielereignisse; historische Synchronisierung und Simulationen lösen keine Spielerhinweise aus. Unterstützung und Browserbeschränkungen werden berücksichtigt. QR-Scanner zeigen eine Taschenlampensteuerung ausschließlich bei unterstütztem Kameratrack; Stoppen, Schließen und erfolgreicher Scan geben Kamera und Licht wieder frei.

## Regeln, XP und Wiederverbindung

Die Lobby fasst die tatsächlich synchronisierten Regeln einschließlich aktivierter Module, Startverzögerung und Zone zusammen. XP-Ablehnungen zeigen die echte Servermeldung. Bereits vor einem Versuch erklären Hinweise Radius, Genauigkeit und veraltete Ortung. Restliche Ersatzpunkte und der Grund für einen Ersatz sind sichtbar; ein unmöglicher Ersatz verbraucht weiterhin keinen Versuch.

„Wieder verbunden. Spielstand synchronisiert.“ erscheint nach der übernommenen autoritativen Synchronisierung. Ein verbundener Transport allein genügt nicht. Spielaktionen werden bei Zeitüberschreitungen nicht blind erneut gesendet.

## Nach dem Spiel

Ein Verlauf zeigt gespeicherte Fänge, Infektionen, Heilungen, XP-Punkte und Phasen. Er enthält keine Standortkoordinaten oder Chatnachrichten und kennzeichnet einen unvollständigen gespeicherten Verlauf. Persönliche Highlights stammen aus vertrauenswürdigen Spielereignissen und Engine-Statistiken.

Account-XP kommen aus dem tatsächlich geschriebenen Belohnungsledger. Der aktuelle Levelstand und der gespeicherte Beitrag dieses Matches zu Badges stehen zusammen. Fehlende Wertung, Gäste, Zuschauer, kurze Runden, Limits und Simulationen erhalten passende Erklärungen. Das Lesen schreibt keine neuen Belohnungen. Zombies werden bei einem konfigurierten Hunter-Sieg im XP-Zeitlimit dem richtigen Siegerteam zugeordnet.

Feedback kann konkrete Probleme mit GPS/Standort, Karte, Fangen und Verbindung benennen. Einzelne Fragen bleiben freiwillig. Die Migration erzeugt eine neue aktive Fragebogenversion; alte Angebote und Antworten behalten ihren Fragebogen. Eigene volle Kataloge werden nicht durch gekürzte Auswahlmöglichkeiten überschrieben.

## Betrieb und Prüfung

Eine additive Migration `targeted_feedback_context` erweitert den vorhandenen Fragebogen. Es entstehen keine neuen Dienste oder kostenpflichtigen Ressourcen. Der Quellcode bleibt in demselben Repository. [Ausgeführte Prüfungen](TEST-REPORT-0.B2.2.md).

Reale Akkuwerte, Außeneinsatz, Kameralicht und GPS-/Push-Verhalten auf physischen iPhone-/Android-Geräten benötigen weiterhin Gerätetests. Browser- und Sensortests sind im Prüfbericht ausdrücklich gekennzeichnet.
