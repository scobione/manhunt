import {Component,type ReactNode} from 'react';

/** Keep navigation and the offline banner mounted if a route chunk cannot load.
 * A fresh document retries the failed module and restores the server-held match. */
export class RouteErrorBoundary extends Component<{children:ReactNode;online:boolean},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return{failed:true};}
 componentDidUpdate(previous:{online:boolean}){if(this.state.failed&&this.props.online&&!previous.online)window.location.reload();}
 render(){
  if(this.state.failed)return <section className="panel gate"><h2>Ansicht konnte nicht geladen werden.</h2><p>{this.props.online?'Lade die Ansicht erneut. Dein laufendes Match bleibt auf dem Server erhalten.':'Warte auf die Verbindung. Die Ansicht wird danach neu geladen; dein laufendes Match bleibt erhalten.'}</p><button className="button primary" disabled={!this.props.online} onClick={()=>window.location.reload()}>Ansicht erneut laden</button></section>;
  return this.props.children;
 }
}
