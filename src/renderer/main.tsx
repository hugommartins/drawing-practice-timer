import { createRoot } from 'react-dom/client';
import { App } from './app';
import { StoreProvider } from './store';

createRoot(document.getElementById('root')!).render(
  <StoreProvider>
    <App />
  </StoreProvider>,
);
