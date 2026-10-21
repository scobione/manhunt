import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from './context';
import App from './App';
import './styles.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><AppProvider><App/></AppProvider></BrowserRouter></React.StrictMode>);
if('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{});});
