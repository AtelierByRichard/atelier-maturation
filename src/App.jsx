import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Pigs from './pages/Pigs.jsx';
import PigDetail from './pages/PigDetail.jsx';
import StockOut from './pages/StockOut.jsx';
import Forecast from './pages/Forecast.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
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
