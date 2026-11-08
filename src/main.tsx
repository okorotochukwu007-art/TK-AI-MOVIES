import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Register Service Worker for offline caching & standalone mobile app launch
registerSW({immediate: true});

// Catch and suppress harmless browser extension wallet rejections (e.g. MetaMask)
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason?.message || String(event.reason || '');
  if (reason.includes('Failed to connect to MetaMask') || reason.includes('MetaMask')) {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(<App />);
