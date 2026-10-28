# Manhunt Admin — 0.b1.103

Eigenständige React/Vite-PWA im Verzeichnis `admin/`, separat deploybar. Spiel und Admin verwenden dasselbe bestehende Supabase-Projekt; es wird keine zweite Benutzerdatenbank angelegt.

- Spiel: https://manhunt-pwa.vercel.app
- Admin-Projekt / Produktionsadresse: https://manhunt-admin-scobione.vercel.app
- Die verschachtelte Adresse `admin.manhunt-pwa.vercel.app` konnte diesem Vercel-Konto nicht zugewiesen werden (403). `manhunt-admin.vercel.app` ist bereits vergeben. Die gewählte Alternative wurde über das Vercel-Plugin zugewiesen und verifiziert. Es ist kein Domainkauf erforderlich.

## Verwendung

1. Im Admin-Portal mit dem vom Betreiber freigegebenen bestehenden E-Mail-Konto und dessen eigenem Passwort anmelden. Es gibt kein voreingestelltes Admin-Passwort.
2. Unter **Account erstellen** eine neue E-Mail-Adresse eingeben. Die einmalig angezeigten Zugangsdaten kopieren und dem vorgesehenen Spieler persönlich übergeben. Beim Ausblenden, Wechseln der Seite oder nach fünf Minuten verschwindet das vorläufige Passwort.
3. Im Spiel muss der Spieler das Passwort ersetzen, einen eindeutigen Benutzernamen wählen und die Profileinrichtung abschließen. Das wird durch die API und zusätzliche RLS-Policies erzwungen.
4. **Benutzerverwaltung** bietet Suche, Statusfilter, Details, Deaktivieren, Reaktivieren und Passwort-Reset per E-Mail. Profile, Freundschaften und Spielstatistiken werden beim Deaktivieren nicht gelöscht.
5. **Einstellungen** erlaubt einen zusätzlichen Zugangscode ab zwölf Zeichen. Er ersetzt niemals den persönlichen Admin-Account. Änderungen widerrufen alle Verwaltungssitzungen.

Auf iOS: in Safari öffnen → Teilen → Zum Home-Bildschirm. Auf Android: Browsermenü → App installieren. Die Admin-PWA hat eigene Icons und ein eigenes Manifest. Sie speichert ausschließlich Offline-Hinweis und Icons im Service-Worker-Cache, niemals Kontolisten, API-Antworten oder Passwörter. Auth-Sitzungen liegen im `sessionStorage`; die zusätzliche Adminfreigabe bleibt ausschließlich im Arbeitsspeicher und läuft nach 20 Minuten ab.

## Registrierung und E-Mail-Besitz

Die normale Registrierung bleibt E-Mail + Benutzername + eigenes Passwort, anschließend sechsstelliger Supabase-E-Mail-Code. Die Oberfläche unterstützt Wiederholung mit Wartezeit und lehnt andere Codelängen ab. Ablauf, einmalige Verwendung und serverseitige Fehlversuchsgrenzen übernimmt Supabase Auth. Google bleibt deaktiviert. Vorhandene Accounts werden weder ersetzt noch zusammengeführt.

Die manuelle Erstellung verwendet `auth.admin.createUser` und versendet **keine E-Mail**. Supabase benötigt für die direkte Passwortanmeldung `email_confirm: true`; hier bedeutet das ausschließlich administrative Loginfreigabe. `account_controls.source='admin'`, `admin_approved_at` und ein **leeres** `email_verified_at` unterscheiden diese Freigabe ausdrücklich von nachgewiesenem E-Mail-Besitz. Portal und Ersteinrichtung zeigen „Nicht verifiziert · administrativ freigegeben“. Die globale E-Mail-Verifizierung wird nicht abgeschaltet. Der Ablauf darf nicht als Nachweis des Mailboxbesitzes verwendet werden.

Passwort-Reset bleibt vom Maildienst und dessen Kontingent abhängig. Die neue manuelle Kontoerstellung funktioniert ohne dieses Kontingent. Bereits bestehende E-Mail-Adressen werden nicht überschrieben. Bei verlorenen einmaligen Zugangsdaten eines bereits angelegten Kontos muss der Besitzer den normalen Passwort-Reset nutzen; ein vorhandenes Passwort kann nicht ausgelesen werden.

## Sicherheit und Datenmodell

Die Migration `20261027180042_admin_portal_account_onboarding.sql` ergänzt `account_controls`, `admin_security` und `admin_sessions`; alle sind für Browserrollen gesperrt. Bestehende Konten werden als fertig eingerichtet übernommen. Administratorrollen werden ausschließlich in serverseitig geschützten Daten vergeben, niemals anhand von `user_metadata`, E-Mail-Domain oder einem gemeinsamen Code. Die Erstfreigabe erfolgt für ein ausdrücklich vom Betreiber benanntes, vorhandenes und bestätigtes Konto; personenbezogene Adminzuordnungen stehen nicht im öffentlichen Quellcode.

Jede Adminaktion prüft Supabase-Identität, tatsächliche `auth.sessions`-Sitzung, aktuellen Kontostatus, Adminrolle und eine zusätzliche, an diese Identität gebundene Verwaltungssitzung. Verwaltungstokens werden nur gehasht gespeichert. Der optionale Zugangscode verwendet PBKDF2-SHA256 mit 210.000 Iterationen und zufälligem Salt. Fünf Entsperrversuche pro Minute sowie weitere Aktionslimits werden über die bestehende atomare Datenbankquote erzwungen.

Vorläufige Passwörter enthalten 144 zufällige Bits plus Zeichenklassen. Nur Supabase Auth speichert den Passwortprüfwert; der Einrichtungsstatus hält zeitweilig einen SHA-256-Abgleichswert gegen Wiederverwendung. Klartextpasswörter werden weder in Tabellen noch in Auditlogs gespeichert. Nach dem Passwortwechsel werden andere Auth-Sitzungen widerrufen. API und RLS prüfen die tatsächlich fortbestehende Sitzung. Schritte werden unter Sperren/atomaren Datenbankübergängen abgeschlossen.

Neu gewählte registrierte Namen erfüllen `[A-Za-z0-9_.]{3,20}` und sind ohne Beachtung der Groß-/Kleinschreibung eindeutig. Historische Namen bis 24 Zeichen sowie bestehende automatisch erzeugte Gastnamen mit zur Identität passendem Suffix bleiben kompatibel.

## Deployment und lokale Prüfung

Vercel-Spielprojekt: Repository-Wurzel, `npm ci`, `npm run build`, Ausgabe `dist`.
Vercel-Adminprojekt: Root Directory `admin`, `npm ci`, `npm run build`, Ausgabe `dist`, Node 22. Beide Projekte sind mit demselben GitHub-Repository verbunden. Vercel-Preview-Schutz bleibt eingeschaltet. Die produktive Admin-Origin ist in der Supabase-Edge-Allowlist enthalten.

Die Frontends verwenden ausschließlich öffentliche Supabase-Konfiguration. Service-Role-Keys bleiben in den Supabase Edge Secrets. Die Admin-Anmeldung per Passwort benötigt keinen neuen OAuth-Redirect. Passwort-Reset führt weiterhin auf die bereits zugelassene Spieladresse `/auth/callback`.

```bash
npm ci
npm --prefix admin ci
npm run build
npm --prefix admin run build
npm test
npx playwright test -c playwright.admin.config.ts
npm run test:edge:e2e
npm run test:e2e
npm run test:public
npx playwright test -c playwright.redirect.config.ts
```

Die Admin-Browsertests starten drei isolierte lokale Ursprünge. Produktions- und Testbuilds benutzen getrennte Ausgabeverzeichnisse. Testidentitäten, simulierte Mailbox und lokale Auth-Server sind ausschließlich Testdateien und werden nicht deployt.

## Verbleibende externe Prüfungen

Die echte Zustellung und Einlösung einer Registrierungs-E-Mail benötigen ein kontrolliertes Postfach. Die verfügbare Supabase-Integration kann SMTP, OTP-Länge und E-Mail-Templates nicht verwalten. Prüfen unter [Auth Providers](https://supabase.com/dashboard/project/dxoleuqmhcnqnjyqdqvw/auth/providers): Confirm Email aktiviert, OTP-Länge sechs. Unter [E-Mail-Templates](https://supabase.com/dashboard/project/dxoleuqmhcnqnjyqdqvw/auth/templates) muss die Bestätigung `{{ .Token }}` enthalten; gestaltete Vorlagen liegen bereits unter `supabase/templates/`. Kein neues kostenpflichtiges Mail-Abo wurde eingerichtet.

Der Betreiber muss seinen persönlichen Admin-Login und die Installation auf seinem iPhone/Android-Gerät abschließend prüfen. Automatisierte Chromium-Tests mit mobiler Bildschirmgröße ersetzen keine echte Geräteinstallation.
