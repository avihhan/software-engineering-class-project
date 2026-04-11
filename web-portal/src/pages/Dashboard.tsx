import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  apiFetch,
  apiOwnerGetClientsReport,
  type ClientsReportResponse,
} from '../lib/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Analytics {
  total_members: number;
  total_workouts: number;
  active_subscriptions: number;
}

export default function Dashboard() {
  const { user, tenant, accessToken } = useAuth();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportData, setReportData] = useState<ClientsReportResponse | null>(null);
  const [downloading, setDownloading] = useState(false);

  const defaultEnd = useMemo(() => new Date(), []);
  const defaultStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return d;
  }, []);
  const [startDate, setStartDate] = useState(defaultStart.toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(defaultEnd.toISOString().slice(0, 10));

  useEffect(() => {
    if (!accessToken) return;
    apiFetch('/api/admin/analytics', accessToken)
      .then((r) => r.json())
      .then(setAnalytics)
      .catch(() => {});
  }, [accessToken]);

  async function handleGenerateReport() {
    if (!accessToken) return;
    setReportLoading(true);
    setReportError('');
    try {
      const data = await apiOwnerGetClientsReport(accessToken, {
        startDate,
        endDate,
      });
      setReportData(data);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Failed to generate report');
      setReportData(null);
    } finally {
      setReportLoading(false);
    }
  }

  function handleDownloadPdf() {
    if (!reportData) return;
    setDownloading(true);
    try {
      const doc = new jsPDF();
      const titleColor = [51, 51, 51] as [number, number, number];
      const headerFill = [245, 245, 245] as [number, number, number];

      doc.setFontSize(20);
      doc.setTextColor(...titleColor);
      doc.text(`${reportData.tenant.name} — Clients Report`, 14, 20);

      doc.setFontSize(11);
      doc.setTextColor(90, 90, 90);
      doc.text(
        `Window: ${reportData.window.start_date} to ${reportData.window.end_date}`,
        14,
        28,
      );
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 34);

      autoTable(doc, {
        startY: 42,
        head: [['Members', 'Workouts', 'Nutrition Logs', 'Open Goals', 'Completed Goals']],
        body: [[
          String(reportData.totals.members),
          String(reportData.totals.workouts),
          String(reportData.totals.nutrition_logs),
          String(reportData.totals.goals_open),
          String(reportData.totals.goals_completed),
        ]],
        theme: 'striped',
        headStyles: { fillColor: headerFill, textColor: [51, 51, 51] },
      });

      autoTable(doc, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        startY: ((doc as any).lastAutoTable?.finalY ?? 52) + 8,
        head: [[
          'Member',
          'Joined',
          'Workouts',
          'Active Days',
          'Avg Calories',
          'Avg Protein(g)',
          'Latest Weight',
          'Weight Δ',
          'Open/Done Goals',
        ]],
        body: reportData.members.map((m) => [
          m.email,
          m.created_at ? m.created_at.slice(0, 10) : '-',
          String(m.workouts.count),
          String(m.workouts.active_days),
          m.nutrition.avg_calories == null ? '-' : String(m.nutrition.avg_calories),
          m.nutrition.avg_protein_g == null ? '-' : String(m.nutrition.avg_protein_g),
          m.body_metrics.latest_weight_lbs == null
            ? '-'
            : String(m.body_metrics.latest_weight_lbs),
          m.body_metrics.weight_change_lbs == null
            ? '-'
            : String(m.body_metrics.weight_change_lbs),
          `${m.goals.open}/${m.goals.completed}`,
        ]),
        theme: 'striped',
        headStyles: { fillColor: headerFill, textColor: [51, 51, 51] },
        styles: { fontSize: 8, cellPadding: 2 },
      });

      const safeTenant = (reportData.tenant.name || 'organization')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const stamp = new Date().toISOString().slice(0, 10);
      doc.save(`clients-report-${safeTenant || 'organization'}-${stamp}.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  const stats = [
    { label: 'Active Members', value: analytics?.total_members ?? '\u2014' },
    { label: 'Total Workouts', value: analytics?.total_workouts ?? '\u2014' },
    { label: 'Active Subscriptions', value: analytics?.active_subscriptions ?? '\u2014' },
  ];

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>
            Welcome back
            {user?.email ? `, ${user.email.split('@')[0]}` : ''}
          </h1>
          <p className="dashboard-subtitle">
            {tenant?.name ?? 'Your Organization'} &middot; Admin Dashboard
          </p>
        </div>
      </header>

      <div className="stats-grid">
        {stats.map((s) => (
          <div key={s.label} className="stat-card">
            <span className="stat-value">{s.value}</span>
            <span className="stat-label">{s.label}</span>
          </div>
        ))}
      </div>

      <section className="dashboard-section">
        <h2>Recent Activity</h2>
        <div className="empty-state">
          <p>
            Activity feed will show recent member signups, workouts, and
            milestones.
          </p>
        </div>
      </section>

      <section className="dashboard-section" style={{ marginTop: '1rem' }}>
        <h2>Client PDF Report</h2>
        <p style={{ color: '#555', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
          Generate a combined, presentation-ready report for all clients.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.8rem' }}>
            Start date
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="settings-value"
              style={{ padding: '0.35rem 0.5rem' }}
            />
          </label>
          <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.8rem' }}>
            End date
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="settings-value"
              style={{ padding: '0.35rem 0.5rem' }}
            />
          </label>
          <button
            className="login-btn"
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.8125rem' }}
            onClick={handleGenerateReport}
            disabled={reportLoading}
          >
            {reportLoading ? 'Generating…' : 'Generate Client PDF Report'}
          </button>
          <button
            className="login-btn"
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.8125rem' }}
            onClick={handleDownloadPdf}
            disabled={!reportData || downloading}
          >
            {downloading ? 'Preparing…' : 'Download PDF'}
          </button>
        </div>

        {reportError && (
          <p style={{ color: '#b91c1c', marginTop: '0.75rem', fontSize: '0.85rem' }}>
            {reportError}
          </p>
        )}

        {reportData && (
          <div style={{ marginTop: '1rem' }}>
            <p className="dashboard-subtitle" style={{ marginBottom: '0.5rem' }}>
              Preview for {reportData.tenant.name} ({reportData.window.start_date} to {reportData.window.end_date})
            </p>
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-value">{reportData.totals.members}</span>
                <span className="stat-label">Members</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{reportData.totals.workouts}</span>
                <span className="stat-label">Workouts</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{reportData.totals.nutrition_logs}</span>
                <span className="stat-label">Nutrition Logs</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{reportData.totals.goals_open}/{reportData.totals.goals_completed}</span>
                <span className="stat-label">Open/Done Goals</span>
              </div>
            </div>

            {reportData.members.length === 0 ? (
              <div className="empty-state"><p>No members found in this date range.</p></div>
            ) : (
              <table className="data-table" style={{ marginTop: '0.75rem' }}>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Joined</th>
                    <th>Workouts</th>
                    <th>Avg Calories</th>
                    <th>Avg Protein (g)</th>
                    <th>Latest Weight</th>
                    <th>Weight Δ</th>
                    <th>Goals Open/Done</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.members.map((m) => (
                    <tr key={m.id}>
                      <td>{m.email}</td>
                      <td>{m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}</td>
                      <td>{m.workouts.count} ({m.workouts.active_days} days)</td>
                      <td>{m.nutrition.avg_calories ?? '—'}</td>
                      <td>{m.nutrition.avg_protein_g ?? '—'}</td>
                      <td>{m.body_metrics.latest_weight_lbs ?? '—'}</td>
                      <td>{m.body_metrics.weight_change_lbs ?? '—'}</td>
                      <td>{m.goals.open}/{m.goals.completed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
