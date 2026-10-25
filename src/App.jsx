// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { AppProvider } from './context/AppContext';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import CustomerDashboard from './pages/CustomerDashboard';
import RiderDashboard from './pages/RiderDashboard';
import DashboardPage from './pages/DashboardPage';
import CustomersPage from './pages/CustomersPage';
import OrdersPage from './pages/OrdersPage';
import PaymentsPage from './pages/PaymentsPage';
import InventoryPage from './pages/InventoryPage';
import ReportsPage from './pages/ReportsPage';
import NotificationsPage from './pages/NotificationsPage';
import PredictionsPage from './pages/PredictionsPage';
import DeliveryRoutePage from './pages/DeliveryRoutePage';

function App() {
  const [user, setUser]     = useState(() => {
  try {
    const saved = localStorage.getItem('aguadoc_user');
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
});
const [screen, setScreen] = useState('login');

  const handleLogin = (u) => {
  localStorage.setItem('aguadoc_user', JSON.stringify(u));
  setUser(u);
};
const handleLogout = () => {
  localStorage.removeItem('aguadoc_user');
  setUser(null);
  setScreen('login');
};

  // Not logged in
  if (!user) {
    if (screen === 'register') {
      return (
        <RegisterPage
          onGoLogin={() => setScreen('login')}
          onLogin={handleLogin}
        />
      );
    }
    return (
      <LoginPage
        onLogin={handleLogin}
        onGoRegister={() => setScreen('register')}
      />
    );
  }

  // Customer role → customer dashboard
  if (user.role === 'customer') {
    return <CustomerDashboard user={user} onLogout={handleLogout} onUpdateUser={handleLogin} />;
  }

  // Rider role → accept bookings + live map delivery
  if (user.role === 'rider') {
    return <RiderDashboard user={user} onLogout={handleLogout} />;
  }

  // Admin/Staff role → admin panel
  return (
    <AppProvider>
      <BrowserRouter>
        <AppLayout onLogout={handleLogout}>
          <Routes>
            <Route path="/"              element={<Navigate to="/dashboard" />} />
            <Route path="/dashboard"     element={<DashboardPage />} />
            <Route path="/customers"     element={<CustomersPage />} />
            <Route path="/orders"        element={<OrdersPage />} />
            <Route path="/delivery-route" element={<DeliveryRoutePage />} />
            <Route path="/payments"      element={<PaymentsPage />} />
            <Route path="/inventory"     element={<InventoryPage />} />
            <Route path="/reports"       element={<ReportsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/predictions"   element={<PredictionsPage />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;