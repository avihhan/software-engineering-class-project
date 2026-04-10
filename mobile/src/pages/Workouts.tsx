import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  apiAddWorkoutExercise,
  apiCreateWorkout,
  apiGetWorkoutDetail,
  apiFetchJson,
  getApiCache,
  invalidateApiCache,
  type WorkoutExercise,
  type WorkoutLog,
} from '../lib/api';

export default function Workouts() {
  const { accessToken } = useAuth();
  const location = useLocation();
  const [workouts, setWorkouts] = useState<WorkoutLog[]>([]);
  const [expandedWorkoutId, setExpandedWorkoutId] = useState<number | null>(null);
  const [detailsByWorkout, setDetailsByWorkout] = useState<Record<number, WorkoutExercise[]>>({});
  const [detailsLoadingId, setDetailsLoadingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [exName, setExName] = useState('');
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function parseWeightToOneDecimal(raw: string): number | undefined {
    if (!raw.trim()) return undefined;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return undefined;
    return Math.round(parsed * 10) / 10;
  }

  function formatWeight(weightValue: number | null): string {
    if (weightValue === null || Number.isNaN(weightValue)) return '--';
    return `${weightValue.toFixed(1)} lbs`;
  }

  function fetchWorkouts() {
    if (!accessToken) return;
    const cached = getApiCache<{ workouts?: WorkoutLog[] }>(
      '/api/workouts',
      accessToken,
      45000,
    );
    if (cached) {
      setWorkouts(cached.data.workouts ?? []);
      setLoading(false);
    }

    apiFetchJson<{ workouts?: WorkoutLog[] }>('/api/workouts', accessToken, {
      forceRefresh: true,
      retries: 1,
    })
      .then((d) => setWorkouts(d.workouts ?? []))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load workouts');
      })
      .finally(() => setLoading(false));
  }

  useEffect(fetchWorkouts, [accessToken]);
  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    if (qs.get('logToday') === '1') {
      setShowForm(true);
      setDate(new Date().toISOString().slice(0, 10));
    }
  }, [location.search]);

  async function toggleWorkoutDetails(workoutId: number) {
    if (!accessToken) return;
    if (expandedWorkoutId === workoutId) {
      setExpandedWorkoutId(null);
      return;
    }
    setExpandedWorkoutId(workoutId);
    if (detailsByWorkout[workoutId]) return;
    setDetailsLoadingId(workoutId);
    try {
      const detail = await apiGetWorkoutDetail(accessToken, workoutId);
      setDetailsByWorkout((prev) => ({ ...prev, [workoutId]: detail.exercises }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load workout detail');
    } finally {
      setDetailsLoadingId(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accessToken || !date) return;
    setSaving(true);
    setError('');

    try {
      const workout = await apiCreateWorkout(accessToken, {
        workout_date: date,
        notes: notes || undefined,
      });
      const workoutId = workout.id;

      if (workoutId && exName.trim()) {
        await apiAddWorkoutExercise(accessToken, workoutId, {
          exercise_name: exName.trim(),
          sets: sets ? Number(sets) : undefined,
          reps: reps ? Number(reps) : undefined,
          weight: parseWeightToOneDecimal(weight),
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
      setExpandedWorkoutId(workoutId);
      setDetailsByWorkout((prev) => ({
        ...prev,
        [workoutId]: exName.trim()
          ? [
              {
                id: -1,
                workout_log_id: workoutId,
                exercise_name: exName.trim(),
                sets: sets ? Number(sets) : null,
                reps: reps ? Number(reps) : null,
                weight: parseWeightToOneDecimal(weight) ?? null,
                duration_minutes: null,
                rpe: null,
              },
            ]
          : [],
      }));
      fetchWorkouts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save workout');
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

      {error && (
        <section className="section">
          <p className="empty-text" style={{ color: '#fca5a5' }}>{error}</p>
        </section>
      )}

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
                <input
                  id="w-wt"
                  type="number"
                  step="0.1"
                  min="0"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  disabled={saving}
                  placeholder="Weight (lbs)"
                />
                <span className="form-hint">Weight (lbs), optional, one decimal allowed.</span>
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
        workouts.map((w) => {
          const isOpen = expandedWorkoutId === w.id;
          const exercises = detailsByWorkout[w.id] || [];
          return (
            <div
              key={w.id}
              className="card workout-log-card"
              style={{ marginBottom: '0.75rem', cursor: 'pointer' }}
              onClick={() => void toggleWorkoutDetails(w.id)}
            >
              <div className="workout-log-header">
                <span className="card-label">{w.workout_date}</span>
                <span className="text-muted">{isOpen ? 'Hide details' : 'View details'}</span>
              </div>
              {w.notes && <span className="card-note">{w.notes}</span>}
              {isOpen && (
                <div className="workout-log-details">
                  {detailsLoadingId === w.id ? (
                    <p className="form-hint">Loading exercise details…</p>
                  ) : exercises.length === 0 ? (
                    <p className="form-hint">No exercises added for this workout.</p>
                  ) : (
                    exercises.map((ex, idx) => (
                      <div key={`${w.id}-${ex.id}-${idx}`} className="workout-exercise-row">
                        <div>
                          <strong>{ex.exercise_name}</strong>
                          <p className="form-hint" style={{ margin: '0.2rem 0 0' }}>
                            {ex.sets ?? '--'} sets · {ex.reps ?? '--'} reps
                          </p>
                        </div>
                        <span className="workout-weight-chip">{formatWeight(ex.weight)}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
