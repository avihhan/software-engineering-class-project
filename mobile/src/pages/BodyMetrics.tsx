import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  apiFetch,
  apiFetchJson,
  getApiCache,
  invalidateApiCache,
} from '../lib/api';

const BodyMetricsChart = lazy(() => import('../components/charts/BodyMetricsChart'));

interface Metric {
  id: number;
  weight: number | null;
  height: number | null;
  body_fat_percentage: number | null;
  recorded_at: string;
}

export default function BodyMetrics() {
  const { accessToken } = useAuth();
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [saving, setSaving] = useState(false);

  function fetchMetrics() {
    if (!accessToken) return;
    const cached = getApiCache<{ body_metrics?: Metric[] }>(
      '/api/body-metrics',
      accessToken,
      45000,
    );
    if (cached) {
      setMetrics(cached.data.body_metrics ?? []);
      setLoading(false);
    }

    apiFetchJson<{ body_metrics?: Metric[] }>('/api/body-metrics', accessToken, {
      forceRefresh: true,
      retries: 1,
    })
      .then((d) => setMetrics(d.body_metrics ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(fetchMetrics, [accessToken]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setSaving(true);

    await apiFetch('/api/body-metrics', accessToken, {
      method: 'POST',
      body: JSON.stringify({
        recorded_at: new Date().toISOString(),
        weight: weight ? Number(weight) : undefined,
        height: height ? Number(height) : undefined,
        body_fat_percentage: bodyFat ? Number(bodyFat) : undefined,
      }),
    });

    setWeight('');
    setHeight('');
    setBodyFat('');
    setSaving(false);
    setShowForm(false);
    invalidateApiCache('/api/body-metrics', accessToken);
    fetchMetrics();
  }

  const chartData = [...metrics]
    .reverse()
    .map((m) => ({
      date: m.recorded_at?.slice(5, 10),
      weight: m.weight,
      bf: m.body_fat_percentage,
    }));

  return (
    <div className="page">
      <header className="page-header page-header-row">
        <h1>Body Metrics</h1>
        <button className="action-btn" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Log'}
        </button>
      </header>

      {showForm && (
        <section className="section">
          <form onSubmit={handleSubmit} className="mobile-form">
            <div className="form-row-3">
              <div className="form-group">
                <label htmlFor="bm-wt">Weight</label>
                <input id="bm-wt" type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} disabled={saving} />
              </div>
              <div className="form-group">
                <label htmlFor="bm-ht">Height</label>
                <input id="bm-ht" type="number" step="0.1" value={height} onChange={(e) => setHeight(e.target.value)} disabled={saving} />
              </div>
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

      {chartData.length > 1 && (
        <section className="section">
          <h2>Weight Trend</h2>
          <Suspense fallback={<div className="skeleton-chart" />}>
            <BodyMetricsChart data={chartData} />
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
            <div key={m.id} className="log-row">
              <div>
                <span className="log-primary">{m.recorded_at?.slice(0, 10)}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                {m.weight != null && <span className="log-value">{m.weight} lbs</span>}
                {m.body_fat_percentage != null && (
                  <span className="log-secondary" style={{ marginLeft: '0.5rem' }}>
                    {m.body_fat_percentage}% BF
                  </span>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
