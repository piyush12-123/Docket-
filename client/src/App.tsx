import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import { useAuthStore } from '@/store/authStore';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/AppLayout';

import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Dashboard from '@/pages/Dashboard';
import DocumentsLibrary from '@/pages/DocumentsLibrary';
import DocumentDetail from '@/pages/DocumentDetail';
import Notifications from '@/pages/Notifications';
import Settings from '@/pages/Settings';

function App() {
  const initAuth = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    void initAuth;
  }, [initAuth]);

  return (
    <BrowserRouter>
      <Toaster position="bottom-right" />
      <Routes>
        {/* Root redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected routes wrapped with AppLayout */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/documents" element={<DocumentsLibrary />} />
            <Route path="/documents/:id" element={<DocumentDetail />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
