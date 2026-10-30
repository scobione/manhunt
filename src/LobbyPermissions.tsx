import { Link } from 'react-router-dom';
import { LocateFixed, Check, Shield } from 'lucide-react';
import { useApp } from './context';
import PushControls from './PushControls';

export default function LobbyPermissions() {
  const { lobby, connected, gps } = useApp();
  if (!lobby || lobby.status !== 'waiting') return null;
  const spectator = lobby.self.role === 'spectator';
  return <div className="lobby-permissions">
    <section className="panel gps-consent" aria-labelledby="lobby-gps-title">
      <div className="panel-heading"><h3 id="lobby-gps-title"><LocateFixed size={20}/> Standort vor dem Spiel</h3><span className="tag">{spectator ? 'ZUSCHAUER' : lobby.self.locationReady && gps.sharing ? 'BEREIT' : 'ERFORDERLICH'}</span></div>
      {spectator ? <p>Als Zuschauer brauchst du keinen Standort. Wenn du aktiv mitspielst, ist die Standortfreigabe erforderlich.</p> : <>
        <p>Aktive Spieler benötigen eine aktuelle, ausreichend genaue GPS-Ortung. Erst danach kannst du dich bereit melden.</p>
        {!gps.sharing ? <><label className="check-row"><input type="checkbox" checked={gps.consented} onChange={event => gps.setConsented(event.target.checked)}/><span>Ich aktiviere meinen Standort für diese Lobby und das anschließende Match. In der Lobby wird nur die GPS-Bereitschaft geprüft. Im Spiel werden Standorte zur Regelprüfung und für berechtigte Mitspieler nach den Spielregeln verarbeitet.</span></label><button type="button" className="button primary" disabled={!gps.consented || !connected} onClick={gps.startSharing}><LocateFixed size={16}/> Standort freigeben</button></> : <>
          <p className="gps-status" role="status">{lobby.self.locationReady ? <><Check size={18}/> Standort geprüft</> : 'Warte auf eine aktuelle, genaue GPS-Ortung…'}</p>
          <div className="button-row"><button type="button" className="button" disabled={!connected} onClick={gps.refreshLocation}>Standort erneut prüfen</button><button type="button" className="button subtle" onClick={gps.endSharing}>Standortfreigabe beenden</button></div>
        </>}
        {gps.gpsError && <p className="form-error" role="status">{gps.gpsError}</p>}
        <p className="fineprint"><Shield size={14}/> In der Lobby werden keine Koordinaten gespeichert oder Mitspielern angezeigt. Du kannst die Freigabe jederzeit beenden; ohne Standort kannst du nicht aktiv starten. <Link to="/privacy">Datenschutz</Link></p>
      </>}
    </section>
    <p className="fineprint">Push-Mitteilungen sind freiwillig. Du kannst auch ohne Push-Freigabe mitspielen.</p>
    <PushControls />
  </div>;
}
