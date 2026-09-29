import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './styles/prototype-navigation.css';
import './styles/prototype-tools.css';
import './styles/prototype-reader.css';
import './styles/prototype-player.css';
import './styles/button-system.css';
import { PrototypeTooltipLayer } from './components/PrototypeTooltipLayer';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <PrototypeTooltipLayer />
  </StrictMode>,
);
