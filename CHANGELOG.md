# Änderungen

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
