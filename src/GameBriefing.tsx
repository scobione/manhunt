import type {Settings,Zone} from '../shared/types';
import {modeLabel} from '../shared/rules';
import {matchRuleRows} from './gameplay-guidance';
export default function GameBriefing({settings,zone}:{settings:Settings;zone:Zone|null}){
 return <section className="game-rule-briefing" data-testid="lobby-rules-summary" aria-label="Gewählte Spielregeln"><h2>{modeLabel(settings)}</h2><p>Diese Regeln gelten für alle Spieler.</p><dl>{matchRuleRows(settings,zone).map(row=><div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl></section>;
}
