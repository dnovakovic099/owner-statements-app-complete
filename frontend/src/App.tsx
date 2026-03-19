import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/ui/toast';
import Dashboard from './components/Dashboard';
import Login from './components/Login';
import AcceptInvite from './components/AcceptInvite';
import { useVersionCheck } from './hooks/useVersionCheck';
import './App.css';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function LoginRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <Login />;
}

function AcceptInviteRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <AcceptInvite onSuccess={() => navigate('/login')} />;
}

function DashboardRoute() {
  const { user, logout } = useAuth();
  return <Dashboard user={user} onLogout={logout} />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/accept-invite" element={<AcceptInviteRoute />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardRoute />
          </ProtectedRoute>
        }
      />
      <Route
        path="*"
        element={
          <ProtectedRoute>
            <DashboardRoute />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function App() {
  const { updateAvailable, refresh } = useVersionCheck();

  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          {updateAvailable && (
            <div className="fixed top-0 left-0 right-0 z-[9999] bg-blue-600 text-white text-center py-2 px-4 text-sm flex items-center justify-center gap-3 shadow-lg">
              <span>A new version is available.</span>
              <button
                onClick={refresh}
                className="bg-white text-blue-600 font-semibold px-3 py-0.5 rounded hover:bg-blue-50 transition-colors"
              >
                Refresh now
              </button>
            </div>
          )}
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
