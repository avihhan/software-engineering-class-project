import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const routePreloaders: Record<string, () => Promise<unknown>> = {
  '/dashboard': () => import('../pages/Dashboard'),
  '/workouts': () => import('../pages/Workouts'),
  '/nutrition': () => import('../pages/Nutrition'),
  '/body-metrics': () => import('../pages/BodyMetrics'),
  '/goals': () => import('../pages/Goals'),
  '/ai-plans': () => import('../pages/AIPlans'),
  '/calendar': () => import('../pages/Calendar'),
  '/notifications': () => import('../pages/Notifications'),
  '/profile': () => import('../pages/Profile'),
};

export default function MobileLayout() {
  const { logout } = useAuth();

  const navItems = [
    {
      to: '/dashboard',
      label: 'Home',
      mobileOnly: false,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
    {
      to: '/workouts',
      label: 'Workouts',
      mobileOnly: false,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
          <path d="M6 8H5a4 4 0 0 0 0 8h1" />
          <line x1="6" y1="12" x2="18" y2="12" />
        </svg>
      ),
    },
    {
      to: '/nutrition',
      label: 'Nutrition',
      mobileOnly: false,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      ),
    },
    {
      to: '/body-metrics',
      label: 'Metrics',
      mobileOnly: false,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
    },
    {
      to: '/goals',
      label: 'Goals',
      mobileOnly: true,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      ),
    },
    {
      to: '/ai-plans',
      label: 'AI Plans',
      mobileOnly: true,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a4 4 0 0 0-4 4v3H6a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v2a4 4 0 0 0 8 0v-2h2a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z" />
        </svg>
      ),
    },
    {
      to: '/calendar',
      label: 'Calendar',
      mobileOnly: true,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    {
      to: '/notifications',
      label: 'Alerts',
      mobileOnly: true,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      ),
    },
    {
      to: '/profile',
      label: 'Profile',
      mobileOnly: false,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
  ];

  return (
    <div className="mobile-shell">
      <aside className="mobile-brand">
        <div className="mobile-brand__logo">AF</div>
        <div className="mobile-brand__text">
          <strong>Aura Fit</strong>
          <span>Client Portal</span>
        </div>
      </aside>

      <nav className="mobile-tabs" aria-label="Primary navigation">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onMouseEnter={() => {
              const preload = routePreloaders[item.to];
              if (preload) void preload();
            }}
            onFocus={() => {
              const preload = routePreloaders[item.to];
              if (preload) void preload();
            }}
            className={({ isActive }) =>
              `tab${isActive ? ' tab--active' : ''}${item.mobileOnly ? ' tab--desktop-only' : ''}`
            }
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}

        <button className="sidebar-logout-btn" onClick={() => void logout()} type="button" aria-label="Sign out">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Sign out</span>
        </button>
      </nav>

      <main className="mobile-main">
        <Outlet />
      </main>
    </div>
  );
}
