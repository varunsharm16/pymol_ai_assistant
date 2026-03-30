import React from 'react';
import { createRoot } from 'react-dom/client';
import 'molstar/build/viewer/molstar.css';
import './index.css';
import App from './ui/App';
createRoot(document.getElementById('root')!).render(<App />);
