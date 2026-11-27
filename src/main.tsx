import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Unregister any active Service Worker fetch interceptors so video/audio streaming buffers never glitch
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => {
      for (const registration of registrations) {
        void registration.unregister();
      }
    })
    .catch(() => {});
}

// Catch and suppress harmless third-party browser extension errors (e.g. MetaMask inpage.js)
const isBrowserExtensionNoise = (text: string) =>
  text.includes('MetaMask') ||
  text.includes('chrome-extension://') ||
  text.includes('moz-extension://') ||
  text.includes('inpage.js');

window.addEventListener(
  'error',
  (event) => {
    const info = `${event.message || ''} ${event.filename || ''} ${event.error?.stack || ''}`;
    if (isBrowserExtensionNoise(info)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true
);

window.addEventListener(
  'unhandledrejection',
  (event) => {
    const reason = `${event.reason?.message || ''} ${event.reason?.stack || ''} ${String(event.reason || '')}`;
    if (isBrowserExtensionNoise(reason)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true
);

createRoot(document.getElementById('root')!).render(<App />);
