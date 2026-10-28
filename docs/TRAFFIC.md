# Datenverbrauch — 0.b1.104

Im [Admin-Portal](https://manhunt-admin-scobione.vercel.app/#traffic) öffnet **Datenverbrauch** die paginierte Matchliste. Ein Match zeigt die gemeldeten Mengen je Spieler, aufgeteilt in WLAN, Mobilfunk, Kabel und nicht erkennbare Verbindung. Im Spiel und auf dem Ergebnisbildschirm gibt es **Datenverbrauch dieses Matches** für die Teilnehmer dieses Matches.

## Was die Werte bedeuten

- Browser Resource Timing erfasst verfügbare Download-Transfergrößen (einschließlich der vom Browser angegebenen Headergröße). Erkennbar aus dem Cache geladene Ressourcen werden nicht als Netzwerk-Download gezählt.
- Fehlen lesbare Timing-Größen für Spiel-API-Antworten, werden die UTF-8-Nutzdaten als **geschätzter Download** erfasst. Uploads zählen JSON-Nutzdaten; Socket-Nutzdaten werden ebenfalls geschätzt. Dies ist keine Paketmessung und keine Mobilfunkabrechnung.
- Sichtbare Ressourcen wie Kartenbilder werden per PerformanceObserver mitgezählt. Fremde Antworten ohne Timing-Freigabe erscheinen als **unmessbare Anfragen**; sie fehlen in der Byte-Summe. Nicht im Hauptfenster sichtbare Worker-Anfragen, TLS/TCP-Overhead, Betriebssystem-Hintergrundverkehr und andere Apps sind nicht erfasst.
- Nur `navigator.connection.type` bestimmt den Verbindungstyp. `effectiveType=4g` ist eine Geschwindigkeitsklasse und wird ausdrücklich **nicht** als Mobilfunk interpretiert. iPhone/Safari liefert meist keine Typinformation. Übergänge zwischen Verbindungen zählen als „Nicht erkennbar“.
- Messbeginn ist der Empfang eines gestarteten Matches mit dieser App-Version; Lobby, Login und vorherige Downloads gehören nicht dazu. Frühere Matches werden nicht nachträglich mit erfundenen Werten gefüllt.
- Meldungen erfolgen alle 30 Sekunden sowie beim Ausblenden/Verlassen/Matchende bestmöglich. Nicht bestätigte Zähler werden mit der nächsten kumulativen Meldung erneut gesendet. Ein hartes Beenden/offline Neuladen kann die letzten, nur im Arbeitsspeicher gehaltenen Zähler verlieren. Ein neuer Tab/Reload hat eine eigene Mess-ID und wird addiert; Wiederholungen derselben Meldung werden nicht doppelt addiert.
- Die kleine Messmelde-API selbst ist ausgeschlossen. Das Öffnen der Verbrauchsübersicht trägt ebenfalls keine API-Byte-Messung bei. Die Werte bleiben ausdrücklich Näherungen.

## Schutz und Speicherung

`match_traffic` enthält ausschließlich Match-, Spieler-, zufällige Mess-ID, Netzwerkklasse, Sequenz und Zähler. Keine URLs, SSIDs, IP-Adressen, Inhalte oder neuen Standortdaten. 30 Tage sichtbare Aufbewahrung; ältere Datensätze werden bei der nächsten Messmeldung gelöscht. Löschen eines Accounts entfernt zugehörige Messdaten über Foreign Keys. Noch keine Messung ist ein eigener Zustand, kein angeblicher Nullverbrauch.

Das Backend leitet die Spieler-ID aus der authentifizierten Sitzung ab und prüft Spielteilnahme, aktuellen Accountstatus sowie die echte Auth-Sitzung. Spieler lesen nur ihr eigenes Match, Administratoren die Übersicht nach dem bestehenden Admin-Ticket und erneuter serverseitiger Rollenprüfung. Direkter Browserzugriff auf Tabelle/RPCs ist gesperrt; RLS bleibt aktiviert. Metriken sind untrusted Clientdiagnostik und beeinflussen keine Rollen, Resultate oder XP. Eingaben, Datenmengen und Meldungsfrequenz sind begrenzt; SQL verarbeitet kumulative Zähler atomar und monoton.

Die additive Migration ändert keine Accounts, Freundschaften, Lobbys oder Spielstatistiken. Gemeinsame Darstellung und Typen liegen unter `admin/shared`, damit das separate Vercel-Projekt ohne Dateien außerhalb seiner Projektwurzel gebaut werden kann; das Spiel verwendet dieselben Module.

## Automatisierte Prüfungen

| IDs | Schritte / Erwartung | Ergebnis |
| --- | --- | --- |
| TRAFFIC-01 | Verbindungstypen einschließlich fehlendem iOS-Signal und `4g`-Geschwindigkeitsklasse klassifizieren | BESTANDEN: fehlend/4g bleiben unbekannt |
| TRAFFIC-02 | Netztransfer, Cache und verdeckte Timing-Größen zuführen | BESTANDEN: getrennte Mengen/Zähler |
| TRAFFIC-03 | Netzwechsel, mehrere Snapshots, Upload und Download | BESTANDEN: kumulativ, frühere Snapshots unverändert |
| TRAFFIC-04 | Negative/überhöhte Bytes, fremde Spieler-ID, SSID und ungültige IDs senden | BESTANDEN: Validierung lehnt ab |
| TRAFFIC-05 | Admin-Endpunkt als Spieler/ohne Ticket; melden als deaktivierter, unvollständiger oder ausgeloggter Account | BESTANDEN: Zugriff verweigert |
| TRAFFIC-DB-01 | Echte Migrationen in isoliertem PostgreSQL ausführen; gleiche/veraltete Sequenzen und zweite Mess-ID schreiben | BESTANDEN: kein Doppelzählen, kein Rücksetzen, Spielersummen korrekt |
| TRAFFIC-DB-02 | Fremdes Match, veraltete Admin-Sitzung und direkte SQL/RPC-Zugriffe versuchen | BESTANDEN: verweigert; echte Adminrolle darf lesen |
| TRAFFIC-DB-03 | Ungemessenes Match lesen, Grenzen verletzen, 31 Tage alte Zähler und zu spät beendetes Match verwenden | BESTANDEN: keine Fake-Werte, Grenzen/Löschung/Fristen eingehalten |

| TRAFFIC-E2E | Zwei mobile Browser spielen, senden reale Browser-Zähler und wechseln den simulierten Netztyp; Admin öffnet die Matchdetails | BESTANDEN: beide Spieler, WLAN/Mobilfunk und Spielanzeige; kein horizontales Überlaufen |

Gesamtlauf lokal: **235 Unit-/Integrationsfälle, 6 Admin-/Mehrbrowserfälle und 18 öffentliche Browserfälle bestanden**. Beide Produktionsbuilds erfolgreich.

SQL-Tests verwenden die unveränderten Migrationen mit PGlite. Browserprüfungen benutzen echte React-Clients, API-Routing und Spielengine mit lokal simulierten Auth-, Speicher- und Netzwerktypdaten. Sie ersetzen weder eine Mobilfunkabrechnung noch eine Messung auf einem echten iPhone. Produktive Benutzerpasswörter werden nicht zu Testzwecken geändert.
