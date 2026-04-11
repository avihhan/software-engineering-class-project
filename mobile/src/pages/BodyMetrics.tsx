import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  apiGetBodyMetricsQuestionnaire,
  apiUpdateBodyMetricsQuestionnaire,
  apiFetch,
  apiFetchJson,
  getApiCache,
  invalidateApiCache,
  type BodyMetricsQuestionnaire,
  type NutritionTargets,
} from '../lib/api';

const BodyMetricsChart = lazy(() => import('../components/charts/BodyMetricsChart'));

interface Metric {
  id: number;
  weight: number | null;
  height: number | null;
  height_feet: number | null;
  height_inches: number | null;
  body_fat_percentage: number | null;
  recorded_at: string;
}

export default function BodyMetrics() {
  const { accessToken } = useAuth();
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [weight, setWeight] = useState('');
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInches, setHeightInches] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [questionnaire, setQuestionnaire] = useState<BodyMetricsQuestionnaire | null>(null);
  const [recommendations, setRecommendations] = useState<NutritionTargets | null>(null);
  const [editingQuestionnaire, setEditingQuestionnaire] = useState(false);
  const [qSaving, setQSaving] = useState(false);
  const [qAge, setQAge] = useState('');
  const [qSex, setQSex] = useState<'male' | 'female'>('male');
  const [qActivity, setQActivity] = useState<'sedentary' | 'light' | 'moderate' | 'very_active' | 'extra_active'>('moderate');
  const [qGoal, setQGoal] = useState<'lose' | 'maintain' | 'gain'>('maintain');

  function fetchMetrics() {
    if (!accessToken) return;
    let hadCached = false;
    const cached = getApiCache<{ body_metrics?: Metric[] }>(
      '/api/body-metrics',
      accessToken,
      45000,
    );
    if (cached) {
      hadCached = true;
      setMetrics(cached.data.body_metrics ?? []);
      setLoading(false);
    }

    apiFetchJson<{ body_metrics?: Metric[] }>('/api/body-metrics', accessToken, {
      forceRefresh: true,
      retries: 1,
    })
      .then((d) => setMetrics(d.body_metrics ?? []))
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Unable to load body metrics';
        const lower = message.toLowerCase();
        const isAbortLike =
          lower.includes('aborted') ||
          lower.includes('aborterror') ||
          lower.includes('signal is aborted');
        if (!isAbortLike || !hadCached) {
          setError(message);
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(fetchMetrics, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    apiGetBodyMetricsQuestionnaire(accessToken)
      .then((data) => {
        setQuestionnaire(data.questionnaire);
        setRecommendations(data.recommendations);
        if (data.questionnaire) {
          setQAge(String(data.questionnaire.age_years ?? ''));
          setQSex(data.questionnaire.sex);
          setQActivity(data.questionnaire.activity_level);
          setQGoal(data.questionnaire.goal);
        } else {
          setEditingQuestionnaire(true);
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Unable to load questionnaire';
        const lower = message.toLowerCase();
        if (
          !(
            lower.includes('aborted') ||
            lower.includes('aborterror') ||
            lower.includes('signal is aborted')
          )
        ) {
          setError(message);
        }
      });
  }, [accessToken]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setSaving(true);
    setError('');

    try {
      await apiFetch('/api/body-metrics', accessToken, {
        method: 'POST',
        body: JSON.stringify({
          recorded_at: new Date().toISOString(),
          weight: weight ? Number(weight) : undefined,
          height_feet: heightFeet ? Number(heightFeet) : undefined,
          height_inches: heightInches ? Number(heightInches) : undefined,
          body_fat_percentage: bodyFat ? Number(bodyFat) : undefined,
        }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save body metric');
    }

    setWeight('');
    setHeightFeet('');
    setHeightInches('');
    setBodyFat('');
    setSaving(false);
    setShowForm(false);
    invalidateApiCache('/api/body-metrics', accessToken);
    fetchMetrics();
    apiGetBodyMetricsQuestionnaire(accessToken)
      .then((data) => {
        setQuestionnaire(data.questionnaire);
        setRecommendations(data.recommendations);
      })
      .catch(() => {});
  }

  async function handleQuestionnaireSave(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    if (!qAge) {
      setError('Age is required in the questionnaire.');
      return;
    }
    setQSaving(true);
    setError('');
    try {
      const response = await apiUpdateBodyMetricsQuestionnaire(accessToken, {
        age_years: Number(qAge),
        sex: qSex,
        activity_level: qActivity,
        goal: qGoal,
      });
      setQuestionnaire(response.questionnaire);
      setRecommendations(response.recommendations);
      setEditingQuestionnaire(false);
      invalidateApiCache('/api/nutrition', accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save questionnaire');
    } finally {
      setQSaving(false);
    }
  }

  const chartData = [...metrics]
    .reverse()
    .map((m) => ({
      date: m.recorded_at?.slice(5, 10),
      weight: m.weight,
      bf: m.body_fat_percentage,
    }));
  const weightChartData = chartData.filter((p) => p.weight != null);
  const latestMetric = metrics[0] ?? null;

  function formatHeight(metric: Metric) {
    if (metric.height_feet != null || metric.height_inches != null) {
      return `${metric.height_feet ?? 0} ft ${metric.height_inches ?? 0} in`;
    }
    if (metric.height != null) {
      return `${metric.height} in`;
    }
    return '--';
  }

  return (
    <div className="page">
      <header className="page-header page-header-row">
        <h1>Body Metrics</h1>
        <button className="action-btn" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Log Weight & Height'}
        </button>
      </header>

      {error && (
        <section className="section">
          <p className="empty-text" style={{ color: '#fca5a5' }}>{error}</p>
        </section>
      )}

      <section className="section">
        <h2>Current Body Measurements</h2>
        <div className="card-grid">
          <div className="card">
            <span className="card-label">Current Weight</span>
            <span className="card-value">
              {latestMetric?.weight != null ? `${latestMetric.weight} lbs` : '--'}
            </span>
          </div>
          <div className="card">
            <span className="card-label">Current Height</span>
            <span className="card-value">{latestMetric ? formatHeight(latestMetric) : '--'}</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="page-header-row" style={{ marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0 }}>Daily Nutrition Recommendation</h2>
          <button
            type="button"
            className="action-btn action-btn--sm"
            onClick={() => setEditingQuestionnaire((prev) => !prev)}
          >
            {editingQuestionnaire ? 'Cancel' : questionnaire ? 'Edit Questionnaire' : 'Fill Questionnaire'}
          </button>
        </div>
        <div className="card-grid" style={{ marginBottom: editingQuestionnaire ? '1rem' : 0 }}>
          <div className="card">
            <span className="card-label">Calories Needed / Day</span>
            <span className="card-value">
              {recommendations?.recommended_calories != null ? recommendations.recommended_calories : '--'}
            </span>
          </div>
          <div className="card">
            <span className="card-label">Protein Needed / Day</span>
            <span className="card-value">
              {recommendations?.recommended_protein_g != null ? `${recommendations.recommended_protein_g}g` : '--'}
            </span>
          </div>
        </div>
        {recommendations?.missing_fields?.length ? (
          <p className="form-hint">
            Missing inputs: {recommendations.missing_fields.join(', ')}. Complete questionnaire and body metrics to calculate targets.
          </p>
        ) : null}
        {editingQuestionnaire && (
          <form className="mobile-form" onSubmit={handleQuestionnaireSave} style={{ marginTop: '0.9rem' }}>
            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="q-age">Age</label>
                <input
                  id="q-age"
                  type="number"
                  min="13"
                  max="120"
                  value={qAge}
                  onChange={(e) => setQAge(e.target.value)}
                  disabled={qSaving}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="q-sex">Sex</label>
                <select
                  id="q-sex"
                  className="form-select"
                  value={qSex}
                  onChange={(e) => setQSex(e.target.value as 'male' | 'female')}
                  disabled={qSaving}
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
            </div>
            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="q-activity">Exercise Frequency</label>
                <select
                  id="q-activity"
                  className="form-select"
                  value={qActivity}
                  onChange={(e) => setQActivity(e.target.value as typeof qActivity)}
                  disabled={qSaving}
                >
                  <option value="sedentary">Sedentary (little/no exercise)</option>
                  <option value="light">Light (1-3 days/week)</option>
                  <option value="moderate">Moderate (3-5 days/week)</option>
                  <option value="very_active">Very active (6-7 days/week)</option>
                  <option value="extra_active">Extra active (2x/day or labor work)</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="q-goal">Goal</label>
                <select
                  id="q-goal"
                  className="form-select"
                  value={qGoal}
                  onChange={(e) => setQGoal(e.target.value as typeof qGoal)}
                  disabled={qSaving}
                >
                  <option value="lose">Lose Weight</option>
                  <option value="maintain">Maintain Weight</option>
                  <option value="gain">Gain Muscle/Weight</option>
                </select>
              </div>
            </div>
            <button type="submit" className="login-btn" disabled={qSaving}>
              {qSaving ? 'Saving...' : 'Save Questionnaire'}
            </button>
          </form>
        )}
      </section>

      {showForm && (
        <section className="section">
          <form onSubmit={handleSubmit} className="mobile-form">
            <div className="form-row-3">
              <div className="form-group">
                <label htmlFor="bm-wt">Weight</label>
                <input id="bm-wt" type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} disabled={saving} />
              </div>
              <div className="form-group">
                <label htmlFor="bm-ft">Height (ft)</label>
                <input id="bm-ft" type="number" min="0" max="9" value={heightFeet} onChange={(e) => setHeightFeet(e.target.value)} disabled={saving} />
              </div>
              <div className="form-group">
                <label htmlFor="bm-in">Height (in)</label>
                <input id="bm-in" type="number" min="0" max="11" value={heightInches} onChange={(e) => setHeightInches(e.target.value)} disabled={saving} />
              </div>
            </div>
            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="bm-bf">Body Fat %</label>
                <input id="bm-bf" type="number" step="0.1" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} disabled={saving} />
              </div>
            </div>
            <button type="submit" className="login-btn" disabled={saving}>
              {saving ? 'Saving\u2026' : 'Save'}
            </button>
          </form>
        </section>
      )}

      {weightChartData.length > 1 && (
        <section className="section">
          <h2>Weight Tracking Graph</h2>
          <Suspense fallback={<div className="skeleton-chart" />}>
            <BodyMetricsChart data={weightChartData} />
          </Suspense>
        </section>
      )}

      {loading ? (
        <section className="section">
          <div className="skeleton-line skeleton-line--lg" />
          <div className="skeleton-line" />
          <div className="skeleton-line" />
        </section>
      ) : metrics.length === 0 ? (
        <section className="section"><p className="empty-text">No metrics logged yet.</p></section>
      ) : (
        <section className="section">
          <h2>History</h2>
          {metrics.slice(0, 20).map((m) => (
            <div key={m.id} className="card" style={{ marginBottom: '0.6rem' }}>
              <div>
                <span className="log-primary">{new Date(m.recorded_at).toLocaleString()}</span>
              </div>
              <div className="metric-row-grid">
                <span className="log-secondary">Weight</span>
                <span className="log-value">{m.weight != null ? `${m.weight} lbs` : '--'}</span>
                <span className="log-secondary">Height</span>
                <span className="log-value">{formatHeight(m)}</span>
                <span className="log-secondary">Body Fat</span>
                <span className="log-value">{m.body_fat_percentage != null ? `${m.body_fat_percentage}%` : '--'}</span>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
