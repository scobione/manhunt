# MANHUNT b.0.69.48

MANHUNT läuft auf **https://manhunt-pwa.vercel.app**, mit dem bestehenden Supabase-Projekt als Datenbank, Authentifizierung und Spielserver. Die bisherige Sites-Adresse zeigt die veröffentlichte Zehn-Sekunden-Weiterleitung. Der Umzug erstellt keine neue Benutzerdatenbank. Quellcode: https://github.com/scobione/manhunt.

**Dies ist eine veröffentlichte Beta, keine vollständig bestandene Endabnahme.** Die verbleibenden Prüfungen stehen im [Abnahmebericht](ACCEPTANCE-b.0.69.48.md). Insbesondere fehlt ein positiver Live-Nachweis der externen XP-Wegdaten sowie die Prüfung eigener E-Mail-Konten und physischer Mobilgeräte.

## Änderungen

- Normal als Grundlage, unabhängig kombinierbare Zombie-, Apokalypse- und XP-Jagd-Regeln. Einstellungen werden serverseitig validiert, gespeichert und synchronisiert.
- XP-Jagd mit getrenntem Matchfortschritt, aktiver Punkt-ID, Sammelradius, frischen GPS-Prüfungen, Rand-/Sperrzonenabständen, OSM-Fußwegkandidaten und zusätzlicher Hostbestätigung. Gleichzeitige Sammelanfragen zählen einmal. Keine ungeprüften Ersatzpunkte bei fehlenden Wegdaten.
- Dauerhafte Account-XP, Level und Statistiken für qualifizierte Spiele registrierter Benutzer. Eindeutige Buchungen je Match/Account, Mindestdauer, Tages- und Rundenlimits. Kein rückwirkendes Erfinden historischer XP.
- Bis zu 30 nummerierte Sperrzonen: Kreis, Viereck und Polygon; bearbeiten, verschieben, aktivieren, deaktivieren, löschen und synchronisieren. Zufällige Achteck-Ecken je Schrumpfphase und wählbare Endzone bleiben innerhalb des sicheren Spielfelds.
- Serverseitige Teamauslosung, erneute Auslosung und manuelle Rollen. All-Chat, private Teamchats, ungelesene Nachrichten und Host-Stummschaltung. Teamwechsel entziehen alte Chat-/Standortberechtigungen sofort.
- Eigene Teammitglieder mit Namen, Rollenfarbe und Zeitstempel auf der Karte; Gegner nur nach freigegebenen Pinregeln. Standortfreigabe bleibt ausdrücklich zustimmungspflichtig.
- Host-Pause, Fortsetzen und ungewertetes Beenden. Keine frühere Notfallpause mit Offenlegung aller GPS-Positionen.
- Größere mobile Schieberegler, Modulkarten, XP-Anzeige, Levelprofil und Chatoberfläche. Push-Einladung pro Gerät auch für Nicht-Hosts und Gäste; Systemberechtigung erst nach bewusstem Antippen.
- E-Mail und Gastbeitritt bleiben. Google-Anmeldung ist auch beim direkten Supabase-OAuth-Aufruf ausgeschaltet. Bestehende Google-Konten bleiben erhalten und können dieselbe verifizierte E-Mail über die Recovery-Funktion verwenden.
- Kontolöschung unter der echten Supabase-Auth-Rolle repariert, ohne Zugriff auf private Spielzustände zu erweitern. Wiederholte Änderungen fertiger Checkpoints vergeben keine XP erneut.
- QR-Codes werden als scharfe SVG-Grafiken dargestellt. Ein zweiter lokaler Bilddecoder liest schwierige mobile Screenshots. Zwei konkrete CI-Fehlerbilder, neun wiederholte QR-Testläufe und der öffentliche Vercel-Scanner sind geprüft; Fremdmatch-Codes bleiben gesperrt.

Die E-Mail-Vorlagen verweisen auf das Logo auf Vercel. Die alte Domain liefert ihre bisherigen Icons weiterhin, damit auch ältere E-Mails ihre Bilder behalten. Vorschau: https://manhunt-pwa.vercel.app/email-templates/.

## Nachweise und Grenzen

190 Unit-/API-/Engine-/PostgreSQL-Tests und 52 verschiedene lokale Browserfälle bestanden. Browserprüfungen umfassen Socket.IO, Edge-Synchronisierung, mehrere getrennte Sitzungen, lokale Auth-Testantworten, Touch-Eingabe und Weiterleitung. Die [maschinelle Ergebnissammlung](verification-b.0.69.48.json) und der [Bericht je Test-ID](ACCEPTANCE-b.0.69.48.md) trennen Simulation und tatsächliche Integration.

Auf Vercel wurden echte anonyme Supabase-Sitzungen, Beitritte, Teamchat, freigegebener GPS-Testpin, Zombie-Swipe, Pause/Fortsetzen/Reload, Matchende und Kontolöschung geprüft. Nur diese eigens erzeugten QA-Konten wurden gelöscht. Die Host-Lobby dieses Tests wurde ausdrücklich als private Testfixture angelegt; das ist kein Live-Nachweis einer E-Mail-Registrierung oder registrierten Host-Erstellung. Diese Abläufe sind lokal automatisiert geprüft.

Die Produktionsabfrage nach XP-Fußwegpunkten lieferte keinen sicheren Kandidaten. Die App zeigte die vorgesehene Fehlermeldung; der positive Online-XP-Ablauf ist damit **noch nicht abgenommen**. Öffentliche Overpass-Dienste antworteten aus der Entwicklungsumgebung mit Ablehnungen bzw. Timeouts. Ein Host darf den Abruf erneut versuchen. OSM ist keine Garantie für aktuelle Betretungsrechte oder Gefahrenfreiheit; vor Ort prüfen.

Hintergrund-GPS, Push-Zustellung und PWA-Installation bleiben von Browser, Betriebssystem und Einwilligung abhängig. Auf der neuen Domain sind Anmeldung, Standort-/Push-Freigabe und gegebenenfalls Homescreen-Installation erneut nötig. Anonyme Gastsitzungen können nicht automatisch zwischen Browserursprüngen übertragen werden; bestehende registrierte Accounts bleiben in Supabase erhalten.

Keine kostenpflichtige Ressource wurde angelegt. Kostenlose Anbieter haben Kontingente und keine zugesicherte Dauerverfügbarkeit. GPS-Spoofing wird durch eine Webapp nicht vollständig verhindert. Der Dependency-Audit meldete null bekannte Schwachstellen in Produktionsabhängigkeiten; dies ersetzt keinen unabhängigen vollständigen Sicherheitsreview.

## Noch notwendige manuelle Abnahme

1. Auf Vercel mit der eigenen E-Mail anmelden, Verifizierung/Recovery einlösen und das bestehende Profil prüfen. Bei einem früheren reinen Google-Konto dieselbe bestätigte Adresse verwenden.
2. Mit iPhone und Android draußen GPS, Zonenrückkehr, Hintergrund/Rückkehr, QR-Kamera und Push pro Gerät prüfen. Echte Geräte und ein eigenes Postfach sind hier nicht zugänglich.
3. Falls noch nicht hinterlegt: tatsächliche Betreiberangaben für Impressum/Datenschutz ergänzen. Keine Identität oder Anschrift wurde erfunden.

Die ausstehende positive XP-Wegdatenprüfung ist eine technische Integrationsgrenze, kein erledigter Test und kein Bedarf an zusätzlichen geheimen Zugangsdaten.
