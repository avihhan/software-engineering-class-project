import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  apiFetch,
  apiFetchJson,
  getApiCache,
  invalidateApiCache,
} from '../lib/api';

interface Workout {
  id: number;
  workout_date: string;
  notes: string | null;
  created_at: string;
}

export default function Workouts() {
  const { accessToken } = useAuth();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [exName, setExName] = useState('');
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  const [saving, setSaving] = useState(false);

  function fetchWorkouts() {
    if (!accessToken) return;
    const cached = getApiCache<{ workouts?: Workout[] }>(
      '/api/workouts',
      accessToken,
      45000,
    );
    if (cached) {
      setWorkouts(cached.data.workouts ?? []);
      setLoading(false);
    }

    apiFetchJson<{ workouts?: Workout[] }>('/api/workouts', accessToken, {
      forceRefresh: true,
      retries: 1,
    })
      .then((d) => setWorkouts(d.workouts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(fetchWorkouts, [accessToken]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accessToken || !date) return;
    setSaving(true);

    try {
      const wRes = await apiFetch('/api/workouts', accessToken, {
        method: 'POST',
        body: JSON.stringify({ workout_date: date, notes: notes || undefined }),
      });
      const wData = await wRes.json();
      const workoutId = wData.workout?.id;

      if (workoutId && exName.trim()) {
        await apiFetch(`/api/workouts/${workoutId}/exercises`, accessToken, {
          method: 'POST',
          body: JSON.stringify({
            exercise_name: exName.trim(),
            sets: sets ? Number(sets) : undefined,
            reps: reps ? Number(reps) : undefined,
            weight: weight ? Number(weight) : undefined,
          }),
        });
      }

      setDate(new Date().toISOString().slice(0, 10));
      setNotes('');
      setExName('');
      setSets('');
      setReps('');
      setWeight('');
      setShowForm(false);
      invalidateApiCache('/api/workouts', accessToken);
      fetchWorkouts();
    } catch {
      /* swallow */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header page-header-row">
        <h1>Workouts</h1>
        <button className="action-btn" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Log'}
        </button>
      </header>

      {showForm && (
        <section className="section">
          <form onSubmit={handleSubmit} className="mobile-form">
            <div className="form-group">
              <label htmlFor="w-date">Date</label>
              <input id="w-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={saving} />
            </div>
            <div className="form-group">
              <label htmlFor="w-notes">Notes</label>
              <input id="w-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" disabled={saving} />
            </div>
            <hr className="form-divider" />
            <p className="form-hint">Add an exercise (optional)</p>
            <div className="form-group">
              <label htmlFor="w-ex">Exercise Name</label>
              <input id="w-ex" value={exName} onChange={(e) => setExName(e.target.value)} placeholder="e.g. Bench Press" disabled={saving} />
            </div>
            <div className="form-row-3">
              <div className="form-group">
                <label htmlFor="w-sets">Sets</label>
                <input id="w-sets" type="number" value={sets} onChange={(e) => setSets(e.target.value)} disabled={saving} />
              </div>
              <div className="form-group">
                <label htmlFor="w-reps">Reps</label>
                <input id="w-reps" type="number" value={reps} onChange={(e) => setReps(e.target.value)} disabled={saving} />
              </div>
              <div className="form-group">
                <label htmlFor="w-wt">Weight</label>
                <input id="w-wt" type="number" value={weight} onChange={(e) => setWeight(e.target.value)} disabled={saving} />
              </div>
            </div>
            <button type="submit" className="login-btn" disabled={saving}>
              {saving ? 'Saving\u2026' : 'Save Workout'}
            </button>
          </form>
        </section>
      )}

      {loading ? (
        <section className="section">
          <div className="skeleton-line skeleton-line--lg" />
          <div className="skeleton-line" />
          <div className="skeleton-line" />
        </section>
      ) : workouts.length === 0 ? (
        <section className="section"><p className="empty-text">No workouts logged yet. Tap + Log to start.</p></section>
      ) : (
        workouts.map((w) => (
          <div key={w.id} className="card" style={{ marginBottom: '0.75rem' }}>
            <span className="card-label">{w.workout_date}</span>
            {w.notes && <span className="card-note">{w.notes}</span>}
          </div>
        ))
      )}
    </div>
  );
}
