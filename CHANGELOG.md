# Änderungen

## b.0.69.44 — 24.10.2026

- Pin-Intervalle als Minuten-Auswahl oder freier Wert; zusätzliche Host-Regeln für Hunter-Sichtbarkeit, Aktualisierungsintervall und Ersatz-Pins.
- Erster Pin nach dem Vorsprung; weitere Pins werden serverseitig auch aus der letzten bekannten Ortung veröffentlicht. Alter, Messzeitpunkt und ungenaue/veraltete Daten bleiben sichtbar.
- Hunter-Positionen auf der Karte, soweit freigegeben und vom Host erlaubt. Hider-Positionen bleiben im laufenden Match an die Pin-Regeln gebunden.
- Vollbild-Zonenwarnung mit standardmäßig 60 Sekunden Toleranz. Ungenaue GPS-Messungen halten den Timer an, statt ihn zurückzusetzen. Rückkehr benötigt zwei genaue Messungen und lässt sich anschließend per Swipe bestätigen.
- Vollbild-Notfallpause mit allen verfügbaren, zuletzt freigegebenen Positionen und weiterlaufender Ortung bei bestehender Zustimmung.
- Verspätete GPS-Rückmeldungen senden nach dem Beenden der Freigabe oder Verlassen der Spielansicht keine Position mehr.
- Zod und body-parser aktualisiert; npm audit meldet keine bekannten Advisories im geprüften Abhängigkeitsstand.

## b.0.69.43 — 23.10.2026

- Multiplayer-Backend auf Supabase Edge mit dauerhaften Spielständen und HTTPS-Synchronisierung veröffentlicht. Die bestehende Sites-Adresse bleibt erhalten; Render ist nicht erforderlich.
- Zone-zu-Lobby-Ablauf, Wiederverbindung, Datenbereinigung und konkurrierende Änderungen abgesichert. Details: [Releasebericht](docs/RELEASE-b.0.69.43.md).

## 0.2.2 — 22.10.2026

- E-Mail-/Passwort-Anmeldung, Registrierung mit E-Mail-Bestätigung, erneute Bestätigungsmail sowie Passwort-Zurücksetzen und Ändern ergänzt. Sitzungen werden weiterhin über Supabase verifiziert. SMTP-Versandfehler werden verständlich angezeigt.

- Fehler aus der OAuth-Initialisierung auswerten: Providerfehler, Abbruch und ungültige oder fehlende PKCE-Nachweise verständlich anzeigen. Rohe Providerantworten werden nicht angezeigt; Callback-Parameter werden nach der Verarbeitung aus der Adresszeile entfernt.
- Echten SDK-Codeaustausch mit isolierten Browserfixtures prüfen, einschließlich Fehlerfällen und verlorenem Browser-Speicher.
- Abstand zur iPhone-Statusleiste im Homescreen-Modus berücksichtigen.
- Live-Diagnose: Google lehnt das in Supabase hinterlegte Client Secret ab. Der Kontoinhaber muss das passende Secret beim Google-Anbieter in Supabase ersetzen; ein App-Update allein behebt diese externe Konfiguration nicht.

## 0.2.1 — 22.10.2026

- Aktivierten Google-Anbieter mit dem Frontend verbunden; öffentlicher Publishable-Key mit unveränderten RLS-Rechten.
- Google-Sitzung nach der Rückleitung über Supabase verifizieren und verständlich bestätigen, auch solange der Spielserver fehlt. Abmelden funktioniert unabhängig vom Spielserver.
- Ohne verfügbaren Spielserver keine erfolglosen Profil- oder Socket.IO-Anfragen nach dem Login.
- PKCE-Anmeldebeginn im Browser prüfen; getrennte lokale Tests für gültige, abgelehnte und abgebrochene Sitzungen.

## 0.2.0 — 22.10.2026

- Supabase Free in Frankfurt tatsächlich eingerichtet: 21 Tabellen mit RLS, private Avatarablage und serverseitige RPCs. Produktionsrechte geprüft, Fremdschlüsselindizes und RLS-Abfragepläne verbessert.
- GeoJSON-Zonen einschließlich Sperrbereichen importieren. Fehlerhafte, zu große, mehrdeutige oder geometrisch ungültige Dateien werden abgelehnt, ohne den aktuellen Entwurf zu überschreiben.
- Importierte und erneut geladene geplante Zonen erfordern eine neue Sicherheitsbestätigung. Gespeicherte Form, Größe und Rotation werden im Editor wiederhergestellt.
- Anwendungsversion sichtbar; Migrationsdateien mit dem echten Supabase-Verlauf abgeglichen.
- 92 automatisierte Engine-, API-, SQL- und Zonenprüfungen. Zusätzliche Browserprüfungen für den Import.

Google OAuth und der öffentlich erreichbare Spielserver sind noch nicht eingerichtet. Die bestehende Website-Adresse bleibt; die verfügbaren öffentlichen Seiten sind kein Nachweis funktionierender Online-Matches.
