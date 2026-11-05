export interface ReleaseNotes {version:string;date:string;title:string;changes:string[];}
/** Published history plus the release shipped with this build. */
export const RELEASE_NOTES:ReleaseNotes[]=[
 {version:'0.B2.1',date:'2026-11-05',title:'Mehr Möglichkeiten für deine Runde',changes:['Eigene Profilbanner, Profilfarben und die Reihenfolge deiner Badges.','Revanche mit derselben Crew und wiederverwendbaren Spielregeln.','Bibliothek für gespeicherte Zonen und Lieblingsregeln.','Sieger und Überlebenskünstler: zwei neue Badges mit jeweils zehn Stufen.','Fehlerberichte mit freiwilligem Screenshot und eine kurze Einführung.','Überarbeitete Lobby, Freundesliste, Ergebnisse und Kartenmarkierungen.']},
 {version:'0.B2',date:'2026-11-04',title:'Profile und Badges',changes:['Farbige Badge-Icons direkt im Profilkopf.','Details per Antippen und eigene Sichtbarkeitsschalter.','Geschützte Freundesprofile mit freigegebenen Badges.']},
 {version:'0.b1.111',date:'2026-11-04',title:'Automatische XP-Jagd',changes:['XP-Punkte werden automatisch aktiv.','Bis zu fünf nicht erreichbare Ziele pro Spieler und Match ersetzen.','Weiter entfernte Ersatzpunkte und bedienbare Kartenbuttons.']},
 {version:'0.b1.110',date:'2026-11-03',title:'Feedback, Erfolge und Simulation',changes:['Admin-Simulation mit getrennten Testdaten.','Freiwilliges Feedback nach jedem regulär abgeschlossenen Spiel.','Dauerhafte Badges und Stufen I bis X.']},
];
