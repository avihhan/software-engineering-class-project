import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  apiGetFavoriteItems,
  apiRemoveFavoriteItem,
  invalidateApiCache,
  type FavoriteItem,
  type NutritionLogEntry,
  type WorkoutLog,
} from '../lib/api';

function isWorkout(item: FavoriteItem): item is FavoriteItem & { item: WorkoutLog } {
  return item.item_type === 'workout';
}

function isNutrition(item: FavoriteItem): item is FavoriteItem & { item: NutritionLogEntry } {
  return item.item_type === 'nutrition';
}

export default function Favorites() {
  const { accessToken } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');

  function loadFavorites() {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    apiGetFavoriteItems(accessToken)
      .then((rows) => setFavorites(rows))
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load favorites'))
      .finally(() => setLoading(false));
  }

  useEffect(loadFavorites, [accessToken]);

  const workouts = useMemo(() => favorites.filter(isWorkout), [favorites]);
  const meals = useMemo(() => favorites.filter(isNutrition), [favorites]);

  async function removeFavorite(itemType: 'workout' | 'nutrition', itemId: number) {
    if (!accessToken) return;
    const key = `${itemType}:${itemId}`;
    if (busyKey === key) return;
    setBusyKey(key);
    setFavorites((prev) => prev.filter((f) => !(f.item_type === itemType && f.item_id === itemId)));
    try {
      await apiRemoveFavoriteItem(accessToken, itemType, itemId);
      invalidateApiCache('/api/favorites', accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove favorite');
      loadFavorites();
    } finally {
      setBusyKey('');
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Favorites</h1>
        <p className="page-subtitle">Saved meals and workouts.</p>
      </header>

      {error && (
        <section className="section">
          <p className="empty-text" style={{ color: '#fca5a5' }}>{error}</p>
        </section>
      )}

      {loading ? (
        <p className="empty-text">Loading favorites…</p>
      ) : (
        <>
          <section className="section">
            <h2>Favorite Workouts</h2>
            {workouts.length === 0 ? (
              <p className="empty-text" style={{ padding: '0.6rem 0' }}>No favorite workouts yet.</p>
            ) : (
              workouts.map((fav) => (
                <div key={`w-${fav.item_id}`} className="card" style={{ marginBottom: '0.6rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.7rem', alignItems: 'center' }}>
                    <div>
                      <span className="log-primary">{fav.item.workout_date}</span>
                      <span className="log-secondary">{fav.item.notes || 'No notes'}</span>
                    </div>
                    <button
                      className="favorite-btn"
                      type="button"
                      disabled={busyKey === `workout:${fav.item_id}`}
                      onClick={() => void removeFavorite('workout', fav.item_id)}
                    >
                      ♥
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>

          <section className="section">
            <h2>Favorite Meals</h2>
            {meals.length === 0 ? (
              <p className="empty-text" style={{ padding: '0.6rem 0' }}>No favorite meals yet.</p>
            ) : (
              meals.map((fav) => (
                <div key={`n-${fav.item_id}`} className="card" style={{ marginBottom: '0.6rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.7rem', alignItems: 'center' }}>
                    <div>
                      <span className="log-primary">{fav.item.meal_type || 'Meal'}</span>
                      <span className="log-secondary">
                        {new Date(fav.item.logged_at).toLocaleString()} · {fav.item.calories ?? 0} kcal
                      </span>
                    </div>
                    <button
                      className="favorite-btn"
                      type="button"
                      disabled={busyKey === `nutrition:${fav.item_id}`}
                      onClick={() => void removeFavorite('nutrition', fav.item_id)}
                    >
                      ♥
                    </button>
                  </div>
                  <p className="text-muted" style={{ marginBottom: 0 }}>{fav.item.meal_items || 'No items'}</p>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
