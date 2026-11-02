import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import PqcActivity from './components/crypto/PqcActivity';
import AdminPage from './pages/AdminPage';

const isAdminPage = window.location.pathname.replace(/\/+$/, '') === '/admin';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {isAdminPage ? <AdminPage /> : <App />}
    {!isAdminPage && <PqcActivity />}
  </React.StrictMode>
);
