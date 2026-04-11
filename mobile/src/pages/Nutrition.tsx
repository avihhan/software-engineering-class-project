import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  apiAddFavoriteItem,
  apiCreateNutritionLog,
  apiGetFavoriteIds,
  apiGetNutritionLogs,
  apiRemoveFavoriteItem,
  invalidateApiCache,
  type NutritionLogEntry,
  type NutritionTargets,
} from '../lib/api';

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

function TargetRing({
  label,
  consumed,
  target,
  unit,
}: {
  label: string;
  consumed: number;
  target: number | null;
  unit: string;
}) {
  const size = 142;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = target && target > 0 ? Math.min(consumed / target, 1) : 0;
  const dashOffset = circumference - (progress * circumference);

  return (
    <div className="nutrition-ring-card">
      <div className="nutrition-ring-visual">
        <svg width={size} height={size} className="nutrition-ring-svg" role="img" aria-label={label}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            className="nutrition-ring-track"
            strokeWidth={stroke}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            className="nutrition-ring-progress"
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            fill="none"
          />
        </svg>
        <div className="nutrition-ring-value">
          <strong>{Math.round(consumed)}</strong>
          <span>{unit}</span>
          <p className="nutrition-ring-label">{label}</p>
        </div>
      </div>
      <p className="nutrition-ring-target">
        {target && target > 0 ? `Target: ${target} ${unit}` : 'Set Body Metrics questionnaire'}
      </p>
    </div>
  );
}

export default function Nutrition() {
  const { accessToken } = useAuth();
  const [logs, setLogs] = useState<NutritionLogEntry[]>([]);
  const [targets, setTargets] = useState<NutritionTargets | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [mealType, setMealType] = useState('Lunch');
  const [mealItems, setMealItems] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fats, setFats] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);
  const [favoriteNutritionIds, setFavoriteNutritionIds] = useState<Set<number>>(new Set());
  const [busyFavoriteNutritionId, setBusyFavoriteNutritionId] = useState<number | null>(null);

  function fetchLogs() {
    if (!accessToken) return;
    setLoading(true);
    apiGetNutritionLogs(accessToken)
      .then((d) => {
        setLogs(d.nutrition_logs ?? []);
        setTargets(d.targets ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load logs'))
      .finally(() => setLoading(false));
  }

  useEffect(fetchLogs, [accessToken]);
  useEffect(() => {
    if (!accessToken) return;
    apiGetFavoriteIds(accessToken)
      .then((rows) => setFavoriteNutritionIds(new Set(rows.nutrition ?? [])))
      .catch(() => {});
  }, [accessToken]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    if (!mealItems.trim() || !calories || !protein) {
      setError('Meal items, calories, and protein are required.');
      return;
    }
    setSaving(true);
    setError('');

    try {
      await apiCreateNutritionLog(accessToken, {
        logged_at: new Date().toISOString(),
        meal_type: mealType,
        meal_items: mealItems.trim(),
        calories: Number(calories),
        protein: Number(protein),
        carbs: carbs ? Number(carbs) : undefined,
        fats: fats ? Number(fats) : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save nutrition log');
    }

    setMealItems('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFats('');
    setSaving(false);
    setShowForm(false);
    invalidateApiCache('/api/nutrition', accessToken);
    fetchLogs();
  }

  async function toggleNutritionFavorite(logId: number) {
    if (!accessToken || busyFavoriteNutritionId === logId) return;
    setBusyFavoriteNutritionId(logId);
    const isFavorite = favoriteNutritionIds.has(logId);
    setFavoriteNutritionIds((prev) => {
      const next = new Set(prev);
      if (isFavorite) next.delete(logId);
      else next.add(logId);
      return next;
    });
    try {
      if (isFavorite) {
        await apiRemoveFavoriteItem(accessToken, 'nutrition', logId);
      } else {
        await apiAddFavoriteItem(accessToken, 'nutrition', logId);
      }
      invalidateApiCache('/api/favorites', accessToken);
    } catch (err) {
      setFavoriteNutritionIds((prev) => {
        const next = new Set(prev);
        if (isFavorite) next.add(logId);
        else next.delete(logId);
        return next;
      });
      setError(err instanceof Error ? err.message : 'Unable to update favorite');
    } finally {
      setBusyFavoriteNutritionId(null);
    }
  }

  const todayLogs = logs.filter(
    (l) => l.logged_at?.startsWith(new Date().toISOString().slice(0, 10)),
  );
  const todayCals = todayLogs.reduce((s, l) => s + (l.calories ?? 0), 0);
  const todayProtein = todayLogs.reduce((s, l) => s + (l.protein ?? 0), 0);
  const todayCarbs = todayLogs.reduce((s, l) => s + (l.carbs ?? 0), 0);
  const todayFats = todayLogs.reduce((s, l) => s + (l.fats ?? 0), 0);

  return (
    <div className="page">
      <header className="page-header page-header-row">
        <h1>Nutrition</h1>
        <button className="action-btn" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Log'}
        </button>
      </header>

      {error && (
        <section className="section">
          <p className="empty-text" style={{ color: '#fca5a5' }}>{error}</p>
        </section>
      )}

      <div className="nutrition-target-grid">
        <TargetRing
          label="Calories Intake"
          consumed={todayCals}
          target={targets?.recommended_calories ?? null}
          unit="kcal"
        />
        <TargetRing
          label="Protein Intake"
          consumed={todayProtein}
          target={targets?.recommended_protein_g ?? null}
          unit="g"
        />
      </div>

      <div className="card-grid" style={{ marginTop: '1rem' }}>
        <div className="card"><span className="card-label">Carbs</span><span className="card-value">{todayCarbs}g</span></div>
        <div className="card"><span className="card-label">Fats</span><span className="card-value">{todayFats}g</span></div>
      </div>

      {showForm && (
        <section className="section">
          <form onSubmit={handleSubmit} className="mobile-form">
            <div className="form-group">
              <label htmlFor="n-meal">Meal</label>
              <select id="n-meal" value={mealType} onChange={(e) => setMealType(e.target.value)} disabled={saving} className="form-select">
                {MEAL_TYPES.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="n-items">Items Ate</label>
              <textarea
                id="n-items"
                rows={3}
                value={mealItems}
                onChange={(e) => setMealItems(e.target.value)}
                disabled={saving}
                placeholder="e.g. 2 eggs, 1 toast, banana"
                required
              />
            </div>
            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="n-cal">Calories (rough)</label>
                <input id="n-cal" type="number" value={calories} onChange={(e) => setCalories(e.target.value)} disabled={saving} required />
              </div>
              <div className="form-group">
                <label htmlFor="n-pro">Protein (g)</label>
                <input id="n-pro" type="number" value={protein} onChange={(e) => setProtein(e.target.value)} disabled={saving} required />
              </div>
            </div>
            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="n-car">Carbs (g)</label>
                <input id="n-car" type="number" value={carbs} onChange={(e) => setCarbs(e.target.value)} disabled={saving} />
              </div>
              <div className="form-group">
                <label htmlFor="n-fat">Fats (g)</label>
                <input id="n-fat" type="number" value={fats} onChange={(e) => setFats(e.target.value)} disabled={saving} />
              </div>
            </div>
            <button type="submit" className="login-btn" disabled={saving}>
              {saving ? 'Saving\u2026' : 'Log Meal'}
            </button>
          </form>
        </section>
      )}

      {loading ? (
        <p className="empty-text">Loading&hellip;</p>
      ) : logs.length === 0 ? (
        <section className="section"><p className="empty-text">No meals logged yet.</p></section>
      ) : (
        <section className="section">
          <h2>Recent Meals</h2>
          {logs.slice(0, 20).map((l) => (
            <div
              key={l.id}
              className="card nutrition-log-card"
              style={{ marginBottom: '0.6rem', cursor: 'pointer' }}
              onClick={() => setExpandedLogId((prev) => (prev === l.id ? null : l.id))}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.6rem' }}>
                <div>
                  <span className="log-primary">{l.meal_type ?? 'Meal'}</span>
                  <span className="log-secondary">{new Date(l.logged_at).toLocaleString()}</span>
                </div>
                <button
                  type="button"
                  className="favorite-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    void toggleNutritionFavorite(l.id);
                  }}
                  disabled={busyFavoriteNutritionId === l.id}
                  aria-label={favoriteNutritionIds.has(l.id) ? 'Unfavorite meal' : 'Favorite meal'}
                >
                  {favoriteNutritionIds.has(l.id) ? '♥' : '♡'}
                </button>
              </div>
              <p className="text-muted" style={{ marginBottom: 0 }}>{l.meal_items || 'No meal items provided'}</p>
              <span className="log-value">{l.calories ?? 0} kcal</span>
              {expandedLogId === l.id && (
                <div className="nutrition-detail-grid">
                  <span className="log-secondary">Protein</span>
                  <span className="log-value">{l.protein ?? 0} g</span>
                  <span className="log-secondary">Carbs</span>
                  <span className="log-value">{l.carbs ?? 0} g</span>
                  <span className="log-secondary">Fats</span>
                  <span className="log-value">{l.fats ?? 0} g</span>
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
