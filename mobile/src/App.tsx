import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

const MobileLayout = lazy(() => import('./components/MobileLayout'));
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Workouts = lazy(() => import('./pages/Workouts'));
const Nutrition = lazy(() => import('./pages/Nutrition'));
const Profile = lazy(() => import('./pages/Profile'));
const BodyMetrics = lazy(() => import('./pages/BodyMetrics'));
const Goals = lazy(() => import('./pages/Goals'));
const AIPlans = lazy(() => import('./pages/AIPlans'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Billing = lazy(() => import('./pages/Billing'));
const ContentFeed = lazy(() => import('./pages/ContentFeed'));
const Favorites = lazy(() => import('./pages/Favorites'));

function RouteFallback() {
  return (
    <div className="route-fallback">
      <div className="route-fallback__spinner" aria-hidden />
      <p>Loading…</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <MobileLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="workouts" element={<Workouts />} />
              <Route path="nutrition" element={<Nutrition />} />
              <Route path="body-metrics" element={<BodyMetrics />} />
              <Route path="goals" element={<Goals />} />
              <Route path="ai-plans" element={<AIPlans />} />
              <Route path="calendar" element={<Calendar />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="content" element={<ContentFeed />} />
              <Route path="favorites" element={<Favorites />} />
              <Route path="profile" element={<Profile />} />
            </Route>

            <Route
              path="/billing"
              element={
                <ProtectedRoute>
                  <Billing />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
