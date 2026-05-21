import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth.js';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Pigs from './pages/Pigs.jsx';
import PigDetail from './pages/PigDetail.jsx';
import StockOut from './pages/StockOut.jsx';
import Forecast from './pages/Forecast.jsx';
import Settings from './pages/Settings.jsx';

function ProtectedRoutes() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  return (
    <Layout session={session} />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProtectedRoutes />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"  element={<Dashboard />} />
          <Route path="pigs"       element={<Pigs />} />
          <Route path="pigs/:id"   element={<PigDetail />} />
          <Route path="stock-out"  element={<StockOut />} />
          <Route path="forecast"   element={<Forecast />} />
          <Route path="settings"   element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
