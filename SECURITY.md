# Sicherheitsrichtlinien

MANHUNT verarbeitet sensible Echtzeitstandorte. Melde Sicherheitsprobleme vertraulich über die Security-Advisory-Funktion des tatsächlichen GitHub-Repositories, sobald es veröffentlicht ist. Solange kein privater Meldekanal eingerichtet wurde, keine personenbezogenen Daten oder Exploit-Zugangsdaten in öffentlichen Issues veröffentlichen.

## Vertrauensgrenzen

- Supabase validiert OAuth-Sitzungen. API und Socket-Verbindung müssen einen gültigen Access Token vorlegen. Der Server ist für Rollen, Fänge, Zeitablauf und Ergebnisse maßgeblich.
- Service-Role-Schlüssel sind ausschließlich Server-Secrets. `VITE_`-Variablen sind öffentlich. Row Level Security schützt Tabellen und private Avatarobjekte; Checkpoints sind ausschließlich für den Server zugänglich.
- Ein Browser-GPS ist ein unzuverlässiges Sensorsignal, kein fälschungssicherer Beweis. Sprungerkennung reduziert Missbrauch, verhindert GPS-Spoofing nicht. Fangbestätigung oder Fangcode sind die empfohlenen Spielregeln.
- Jeder Spieler erhält einen individuell gefilterten Zustand. Versteckte Live-Standorte und fremde Fangcodes dürfen nie an andere Spieler übertragen werden.
- Bei ungenauem, altem oder ausbleibendem GPS darf keine ungeprüfte Zoneneliminierung erfolgen. Notfallpause und Beenden der Freigabe haben Vorrang.
- Testauthentifizierung setzt gleichzeitig `NODE_ENV=test` und `TEST_AUTH=true` voraus. Niemals diese Kombination in einem öffentlich erreichbaren Dienst aktivieren.

## Betrieb

Ein einzelner autoritativer Spielserver ist vorgesehen. Mehrere aktive Serverinstanzen benötigen vorab eine verteilte Sperre/Spielzustandsautorität und Socket-Adapter. Supabase-Migrationen, Standortlöschung, Tokenprüfung und Origin-Allowlist sind vor Freigabe zu prüfen. Keine sensiblen HTTP-Header, GPS-Koordinaten oder Sitzungen protokollieren.

Automatisierte Tests sind keine unabhängige Sicherheitsprüfung und keine Zusicherung, dass keine Schwachstellen existieren. Abhängigkeiten und RLS-Policies müssen bei Änderungen erneut geprüft werden.
