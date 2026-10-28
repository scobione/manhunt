# Sicherheitsrichtlinien

MANHUNT verarbeitet sensible Echtzeitstandorte. Melde Sicherheitsprobleme vertraulich über die Security-Advisory-Funktion des tatsächlichen GitHub-Repositories, sobald es veröffentlicht ist. Solange kein privater Meldekanal eingerichtet wurde, keine personenbezogenen Daten oder Exploit-Zugangsdaten in öffentlichen Issues veröffentlichen.

## Vertrauensgrenzen

- Supabase validiert E-Mail- und Gastsitzungen. API und Socket-Verbindung müssen einen gültigen Access Token vorlegen. Der Server ist für Rollen, Fänge, Zeitablauf und Ergebnisse maßgeblich.
- Service-Role-Schlüssel sind ausschließlich Server-Secrets. `VITE_`-Variablen sind öffentlich. Row Level Security schützt Tabellen und private Avatarobjekte; Checkpoints sind ausschließlich für den Server zugänglich.
- Ein Browser-GPS ist ein unzuverlässiges Sensorsignal, kein fälschungssicherer Beweis. Sprungerkennung reduziert Missbrauch, verhindert GPS-Spoofing nicht. Fangbestätigung oder Fangcode sind die empfohlenen Spielregeln.
- Jeder Spieler erhält einen individuell gefilterten Zustand. Versteckte Live-Standorte und fremde Fangcodes dürfen nie an andere Spieler übertragen werden.
- Bei ungenauem, altem oder ausbleibendem GPS darf keine ungeprüfte Zoneneliminierung erfolgen. Beenden der Freigabe und sicheres Verlassen haben Vorrang.
- Testauthentifizierung setzt gleichzeitig `NODE_ENV=test` und `TEST_AUTH=true` voraus. Niemals diese Kombination in einem öffentlich erreichbaren Dienst aktivieren.

## Betrieb

Produktiv verarbeitet die Supabase Edge Function atomare PostgreSQL-Checkpoints mit Revisionskontrolle. Das alternative Socket.IO-Backend unterstützt einen einzelnen autoritativen Spielserver. Mehrere aktive Serverinstanzen benötigen vorab eine verteilte Sperre/Spielzustandsautorität und Socket-Adapter. Supabase-Migrationen, Standortlöschung, Tokenprüfung und Origin-Allowlist sind vor Freigabe zu prüfen. Keine sensiblen HTTP-Header, GPS-Koordinaten oder Sitzungen protokollieren.

Automatisierte Tests sind keine unabhängige Sicherheitsprüfung und keine Zusicherung, dass keine Schwachstellen existieren. Abhängigkeiten und RLS-Policies müssen bei Änderungen erneut geprüft werden.

## Kontoverwaltung

Adminrechte stammen nur aus der servicegeschützten Tabelle `account_controls`. Jede Verwaltungsaktion benötigt eine bestätigte Supabase-Identität, eine lebende Auth-Sitzung, aktuelle Adminrechte und eine kurzlebige, identitätsgebundene Adminfreigabe. `user_metadata` darf weder Rollen noch Einrichtungsstatus bestimmen. Administrativ freigegebene Accounts sind ausdrücklich kein Nachweis des E-Mail-Besitzes. Einrichtungs- und Deaktivierungssperren gelten in der API und bei direkten Datenbankzugriffen. Neue sicherheitskritische Änderungen benötigen Negativtests.
