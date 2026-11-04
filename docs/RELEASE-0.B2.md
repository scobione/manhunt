# MANHUNT 0.B2 – Profile und farbige Badges

Der Profilkopf zeigt Profilbild, Namen, Account-Level und freigegebene Badges als kleine farbige Embleme. Fünf eigene SVG-Motive mit individuellen Farbverläufen: Beta-Tester, Hunter, Hider, Veteran und XP-Scout. Antippen öffnet ein fokussierbares Detailfenster mit Name, römischer Stufe, individuellem Stufennamen, Beschreibung und Freischaltdatum. Escape und Schließen bringen den Fokus zurück zum Icon; reduzierte Animationen werden unterstützt.

Im eigenen Profil bleibt die Sammlung als aufklappbarer Bereich erreichbar. Gesperrte Badges und persönlicher Fortschritt erscheinen dort als kompakte Symbole mit Details auf Anfrage. Die normale Profilansicht enthält keine großen Badge-Karten mehr. Im Bearbeitungsbereich und den Einstellungen steuern grüne/graue Schalter, welche freigeschalteten Badges gezeigt werden. Die Auswahl bleibt nach Abmeldung und erneutem Anmelden gespeichert. Ausblenden löscht keinen Fortschritt; ein verborgenes Hauptbadge wird zugleich aus der Lobby-Auswahl entfernt. Erneutes Auswählen als Hauptbadge macht es sichtbar.

Freunde können über die Freundesliste das eigenständige Spielerprofil öffnen. Dort erscheinen ausschließlich freigegebene, tatsächlich freigeschaltete Icons. Es gibt keine Liste gesperrter Badges oder persönlicher Fortschrittsziele. Details erscheinen erst beim Antippen. Nicht befreundete und blockierte Konten erhalten keinen Profilzugriff. E-Mail-Adressen, Freundescodes und Standorte gehören nicht zur Profilantwort. Profilansichten aktualisieren sich beim Zurückkehren zur App und während geöffneter Ansicht regelmäßig.

## Daten und Veröffentlichung

Eine additive Migration ergänzt `badge_visibility` mit RLS und ausschließlich serverseitigen Änderungen. Neue, schmale Serverfunktionen geben nur erlaubte Freundesprofile zurück. Bestehende Accounts, Erfolge, Spielregeln, Profile und Spielfortschritte bleiben erhalten. Kein zusätzlicher Dienst oder Geheimschlüssel erforderlich. Das bestehende Vercel-Spielprojekt und die Supabase Edge Function werden aktualisiert; das separate Adminportal verwendet weiterhin dieselben freigegebenen Komponenten für seine Simulation.

Spiel: https://manhunt-pwa.vercel.app · Admin: https://manhunt-admin-scobione.vercel.app

[Testbericht](TEST-REPORT-0.B2.md). Die Wegdaten-Thematik ist entsprechend der Priorisierung des Nutzers zurückgestellt.
