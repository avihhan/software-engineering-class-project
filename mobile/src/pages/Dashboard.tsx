import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetchJson, getApiCache } from '../lib/api';

const DashboardCaloriesChart = lazy(
  () => import('../components/charts/DashboardCaloriesChart'),
);

interface NutritionLog {
  id: number;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  logged_at: string;
}

interface Workout {
  id: number;
  workout_date: string;
}

interface StreakData {
  current_streak: number;
  longest_streak: number;
  total_workouts: number;
  badges: { key: string; label: string; icon: string }[];
  motivation: string;
}

export default function Dashboard() {
  const { user, tenant, accessToken } = useAuth();
  const [recentMeals, setRecentMeals] = useState<NutritionLog[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [loadingN, setLoadingN] = useState(true);
  const [loadingW, setLoadingW] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
    const cachedNutrition = getApiCache<{ nutrition_logs?: NutritionLog[] }>(
      '/api/nutrition',
      accessToken,
      45000,
    );
    if (cachedNutrition) {
      setRecentMeals(cachedNutrition.data.nutrition_logs ?? []);
      setLoadingN(false);
    }

    const cachedWorkouts = getApiCache<{ workouts?: Workout[] }>(
      '/api/workouts',
      accessToken,
      45000,
    );
    if (cachedWorkouts) {
      setWorkouts(cachedWorkouts.data.workouts ?? []);
      setLoadingW(false);
    }

    let cancelled = false;

    apiFetchJson<{ nutrition_logs?: NutritionLog[] }>('/api/nutrition', accessToken, {
      forceRefresh: true,
      retries: 1,
    })
      .then((d) => {
        if (!cancelled) setRecentMeals(d.nutrition_logs ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingN(false);
      });

    apiFetchJson<{ workouts?: Workout[] }>('/api/workouts', accessToken, {
      forceRefresh: true,
      retries: 1,
    })
      .then((d) => {
        if (!cancelled) setWorkouts(d.workouts ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingW(false);
      });

    apiFetchJson<StreakData>('/api/streaks', accessToken, {
      forceRefresh: true,
      retries: 1,
    })
      .then((d) => {
        if (!cancelled) setStreak(d);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const today = new Date().toISOString().slice(0, 10);
  const todayMeals = recentMeals.filter((m) => m.logged_at?.startsWith(today));
  const totalCals = todayMeals.reduce((s, m) => s + (m.calories ?? 0), 0);
  const totalProtein = todayMeals.reduce((s, m) => s + (m.protein ?? 0), 0);

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    const dayMeals = recentMeals.filter((m) => m.logged_at?.startsWith(key));
    return {
      day: d.toLocaleDateString('en-US', { weekday: 'short' }),
      cal: dayMeals.reduce((s, m) => s + (m.calories ?? 0), 0),
    };
  });

  const thisWeekWorkouts = workouts.filter((w) => {
    const d = new Date(w.workout_date);
    const now = new Date();
    const diffDays = (now.getTime() - d.getTime()) / 86400000;
    return diffDays >= 0 && diffDays < 7;
  });

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h1>
              Hey{user?.email ? `, ${user.email.split('@')[0]}` : ''}
            </h1>
            {tenant?.name && (
              <p className="text-muted" style={{ marginBottom: '0.2rem' }}>
                {tenant.name}
              </p>
            )}
            <p className="text-muted">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>
          <Link
            to="/billing"
            className="login-btn"
            style={{ display: 'inline-block', padding: '0.45rem 0.9rem', fontSize: '0.8125rem', textDecoration: 'none' }}
          >
            Join Premium
          </Link>
        </div>
      </header>

      {(loadingN && loadingW && recentMeals.length === 0 && workouts.length === 0) ? (
        <div className="card-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card skeleton-card" />
          ))}
        </div>
      ) : (
        <div className="card-grid">
          <div className="card">
            <span className="card-label">Calories today</span>
            <span className="card-value">{totalCals}</span>
          </div>
          <div className="card">
            <span className="card-label">Protein today</span>
            <span className="card-value">{totalProtein}g</span>
          </div>
          <div className="card">
            <span className="card-label">Workouts (7d)</span>
            <span className="card-value">{loadingW ? '\u2014' : thisWeekWorkouts.length}</span>
          </div>
          <div className="card">
            <span className="card-label">Meals today</span>
            <span className="card-value">{loadingN ? '\u2014' : todayMeals.length}</span>
          </div>
        </div>
      )}

      {streak && (
        <section className="section">
          <div className="streak-banner">
            <div className="streak-fire">&#128293;</div>
            <div>
              <span className="streak-count">{streak.current_streak}-day streak</span>
              <span className="streak-msg">{streak.motivation}</span>
            </div>
          </div>
          {streak.badges.length > 0 && (
            <div className="badge-row">
              {streak.badges.map((b) => (
                <span key={b.key} className="badge-chip">{b.label}</span>
              ))}
            </div>
          )}
        </section>
      )}

      {last7Days.some((d) => d.cal > 0) && (
        <section className="section">
          <h2>Calorie Intake (7 days)</h2>
          <Suspense fallback={<div className="skeleton-chart" />}>
            <DashboardCaloriesChart data={last7Days} />
          </Suspense>
        </section>
      )}
    </div>
  );
}
