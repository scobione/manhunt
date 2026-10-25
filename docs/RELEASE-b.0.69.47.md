# MANHUNT b.0.69.47

Die Notfallpause ist entfernt: keine Pausenknöpfe, kein Vollbild-Pausenfenster, keine gemeinsame Anzeige verborgener Spielerpositionen und keine Pausen-Pushmeldungen. Standortfreigabe stoppen und Match verlassen bleiben jederzeit möglich.

Bestehende pausierte Matches werden beim nächsten Serverabgleich genau einmal fortgesetzt. Match-ID, Spieler, Rollen, Zone und verbliebene Spielzeit bleiben erhalten; Start, Ende, Vorsprung, Pin- und Infektionsfristen werden um die tatsächliche Pausendauer verschoben. Abgelaufene Pins bleiben abgelaufen, offene Fangbestätigungen werden verworfen. Dafür müssen nicht alle Geräte gleichzeitig verbunden sein.

Bei Verbindungsabbruch läuft das Match standardmäßig weiter. Alte Pauseneinstellungen werden kompatibel auf Weiterlaufen umgestellt. Die ausdrücklich konfigurierbare Eliminierung nach Verbindungsfrist bleibt verfügbar. Ungenaue oder fehlende GPS-Daten halten weiterhin nur die individuelle Zonenprüfung an. Eine geometrisch unmögliche Schrumpfphase wird übersprungen; die vorherige sichere Zone bleibt erhalten.

Validierung: 146 Unit-/API-/Datenbank-/Engine-Tests bestanden, einschließlich wiederholter Wiederherstellung, konkurrierender Edge-Anfragen, Restzeit, Rollen, Vorbereitung, Infektion und Standortschutz. 34 lokale Browserfälle bestanden (8 Socket.IO, 9 Edge/GPS/QR, 17 Produktionsbundle/Auth). Der geschlossene mobile Menüschatten verdeckt keine QR-Codes mehr; QR-Bilder werden schärfer gerendert. Der GPS-Test wartet auf den abgeschlossenen Seitenabbau. CI prüft zusätzlich die Veröffentlichung.
