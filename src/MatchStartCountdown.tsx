import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LobbyView } from '../shared/types';
import { FullScreenNotice } from './SafetyOverlays';

const COUNTDOWN_MS = 5000;

/** Presentation only: the server's existing preparation/head-start rules still apply.
 * Use the immutable start event, not startedAt (which moves when a match resumes).
 * No local persistence or new permissions; a reload resumes the same countdown.
 */
export default function MatchStartCountdown({ lobby, children }: { lobby: LobbyView | null; children: ReactNode }) {
  const [, refresh] = useState(0);
  const started = lobby?.events.find(event => event.type === 'match_started');
  // Anchor once per start event. Later poll responses must not move a digit
  // backwards because of network latency. A fresh page gets a fresh snapshot.
  const clock = useMemo(() => ({ serverTime: lobby?.serverTime ?? 0, receivedAt: performance.now() }), [lobby?.id, started?.id]);
  const now = clock.serverTime + performance.now() - clock.receivedAt;
  const seconds = started && lobby && ['preparing', 'active'].includes(lobby.status) && !lobby.self.eliminated
    ? Math.max(0, Math.min(5, Math.ceil((started.at + COUNTDOWN_MS - now) / 1000))) : 0;
  const counting = seconds > 0;

  useEffect(() => {
    if (!counting) return;
    const timer = window.setInterval(() => refresh(value => value + 1), 100);
    const resume = () => refresh(value => value + 1);
    document.addEventListener('visibilitychange', resume);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', resume); };
  }, [counting]);

  if (!counting) return children;
  return <FullScreenNotice title="Spielstart" tone="start">
    <span className="eyebrow">MANHUNT</span>
    <h2>Spiel startet</h2>
    <div className="start-countdown-ring" aria-hidden="true">
      <strong key={seconds} className="start-countdown-number" data-testid="start-countdown">{seconds}</strong>
    </div>
    <p role="status" aria-live="polite" aria-atomic="true">Deine Rolle erscheint in {seconds} {seconds === 1 ? 'Sekunde' : 'Sekunden'}.</p>
  </FullScreenNotice>;
}
