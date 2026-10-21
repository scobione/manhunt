# Beitragen

Node.js 22 oder neuer verwenden. `npm ci`, `.env.example` nach `.env` kopieren und Supabase-Testprojekt konfigurieren. `npm run dev` startet Client und Server. `npm run typecheck`, `npm test`, `npm run build` und `npm run test:e2e` vor einem Pull Request ausführen.

Automatisierte Tests laufen ausschließlich mit isolierten Testkonten und ausdrücklich simulierten GPS-Proben. Keine echten Standorte, Tokens, Profilbilder oder Nutzerexporte in Fixtures, Issues oder Logs einchecken. Produktionsbetrieb hat keine Gastanmeldung und keine Testidentitäten.

Neue Regeln benötigen Tests für unberechtigte Aktionen, Sichtbarkeit privater Daten, unterbrochene Verbindungen und Zeitgrenzen. Änderungen an SQL müssen eine neue Migration statt einer Änderung bereits angewandter Migrationen enthalten.

UI-Texte sind deutsch, berührungstauglich und tastaturbedienbar. Reduzierte Bewegung respektieren. Bei Karten immer Attribution erhalten und keine Tiles massenhaft herunterladen.

Commits sollen abgeschlossene Änderungen beschreiben. Pull Requests nennen das Problem, die neue Funktion und tatsächlich ausgeführte Tests.
