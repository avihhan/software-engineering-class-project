import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
import Exercises from './pages/Exercises';
import Settings from './pages/Settings';
import AIPlans from './pages/AIPlans';
import ContentResources from './pages/ContentResources';
import MemberReport from './pages/MemberReport';
import PlatformDashboard from './pages/PlatformDashboard';
import TenantManagement from './pages/TenantManagement';
import { ROLES } from './lib/api';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Owner + Super Admin routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute allowedRoles={[ROLES.OWNER, ROLES.SUPER_ADMIN]}>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="members" element={<Members />} />
            <Route path="members/:memberId/report" element={<MemberReport />} />
            <Route path="exercises" element={<Exercises />} />
            <Route path="ai-plans" element={<AIPlans />} />
            <Route path="content-resources" element={<ContentResources />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          {/* Platform admin routes */}
          <Route
            path="/platform-admin"
            element={
              <ProtectedRoute allowedRoles={[ROLES.SUPER_ADMIN]}>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route
              index
              element={<Navigate to="/platform-admin/dashboard" replace />}
            />
            <Route path="dashboard" element={<PlatformDashboard />} />
            <Route path="tenants" element={<TenantManagement />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
