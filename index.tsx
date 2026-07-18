import './src/index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './src/App';
import { createThemeController } from './src/theme/themeStorage';

const rootElement = document.getElementById('root');

// Hydrate theme variables before the first React render to avoid a color flash.
export const themeController = createThemeController({
  root: document.documentElement,
  storage: localStorage,
  media: window.matchMedia('(prefers-color-scheme: dark)'),
});

const font = localStorage.getItem('chat_font') || 'default';
const density = localStorage.getItem('ui_density') || 'compact';
document.documentElement.setAttribute('data-chat-font', font);
document.documentElement.setAttribute('data-ui-density', density);

if (import.meta.hot) {
  import.meta.hot.dispose(() => themeController.dispose());
}

if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
