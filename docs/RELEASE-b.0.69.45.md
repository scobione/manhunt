# b.0.69.45

Diese Version behebt die unvollständige Kontolöschung aus dem Befund L-01 der früheren manuellen Sicherheitsprüfung. Sie ergänzt b.0.69.44; GPS-Regeln, Vollbildwarnungen und Notfallpausen bleiben verfügbar.

## Änderung

Bei Last Survivor wurde die Siegerkennung als UUID und der Siegername im Ergebnistext gespeichert. Die bisherige Kontolöschung entfernte nur die Überlebendenliste. Andere Teilnehmer konnten deshalb weiter die gelöschte Identität in ihrer eigenen Matchhistorie lesen. Auch private Engine-Metadaten enthielten noch den entfernten Spieler.

Die neue Migration bereinigt Siegerreferenzen, Ergebnistext, Überlebendenliste und Engine-Metadaten gemeinsam. Die Ergebnisse anderer Spieler bleiben erhalten. Neue Ergebnistexte enthalten keine Benutzernamen. Bereits gelöschte, verwaiste Referenzen werden bei der Migration repariert. Laufende Konten werden dadurch nicht gelöscht.

Der Löschvorgang nutzt dieselbe Sperrreihenfolge wie Edge-Schreibvorgänge, erhöht die globale und betroffene Lobby-Revision und entzieht alten Checkpoints damit die Schreibberechtigung. Der alternative Node-Server lädt anschließend die bereinigten Zustände erneut, statt die Matchhistorie der übrigen Spieler aus seinem Speicher zu verlieren. Die RPCs bleiben für `anon` und `authenticated` gesperrt und laufen mit den vorhandenen Rechten des Backend-Aufrufers.

## Prüfung und Grenzen

Die automatisierten Tests prüfen echte PostgreSQL-Migrationen/RLS in einer isolierten PGlite-Datenbank, den Last-Survivor-Sieg über die Spielengine, eine Migration von alten Daten, gelöschte Gewinner/Nichtgewinner, alte Schreibstände und fehlende Client-Rechte. API- und Browserprüfungen verwenden lokale Testidentitäten. Es werden keine realen Konten zum Testen gelöscht.

Dies ist eine gezielte Fehlerkorrektur mit Regressionstests, kein neuer vollständiger Codex-Security-Scan und keine Garantie umfassender Fehlerfreiheit. Die frühere GPS-Callback-Korrektur und Dependency-Updates aus b.0.69.44 bleiben enthalten. Reale Geräte-Ortung und Provider-Anmeldung werden hierdurch nicht erneut verifiziert.

Die vorhandene Supabase-Free-Installation und Sites-Adresse werden aktualisiert. Es wird kein zusätzlicher kostenpflichtiger Dienst eingerichtet.

- Website: https://manhunt-fieldgame.scobione.chatgpt.site
- Quellcode und CI: https://github.com/scobione/manhunt

## Testergebnis

126 Unit-/Integrations-/Datenbanktests und 30 lokale Browser-Szenarien erfolgreich. TypeScript, Produktionsbuild und Paketprüfung erfolgreich. Die Migration ist auf dem verbundenen Supabase-Projekt installiert; Funktionsrechte und eine zustandslose SQL-Auswertung wurden dort zusätzlich geprüft. Live-Browser- und CI-Ergebnisse sind über die GitHub-Actions-Läufe des Release-Commits einsehbar.
