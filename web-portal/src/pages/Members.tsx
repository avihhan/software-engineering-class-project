import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';

interface Member {
  id: number;
  email: string;
  role: string;
  is_email_verified: boolean;
  created_at: string;
}

export default function Members() {
  const { accessToken } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyingMemberId, setVerifyingMemberId] = useState<number | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch('/api/admin/members', accessToken)
      .then((r) => r.json())
      .then((d) => setMembers(d.members ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accessToken]);

  async function handleVerify(memberId: number) {
    if (!accessToken || verifyingMemberId === memberId) return;
    setVerifyingMemberId(memberId);
    try {
      const res = await apiFetch(`/api/admin/members/${memberId}/verify`, accessToken, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.member) return;

      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, is_email_verified: true } : m)),
      );
    } finally {
      setVerifyingMemberId(null);
    }
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Members</h1>
        <p className="dashboard-subtitle">
          {members.length} member{members.length !== 1 ? 's' : ''} in your
          organization
        </p>
      </header>

      {loading ? (
        <div className="empty-state"><p>Loading&hellip;</p></div>
      ) : members.length === 0 ? (
        <div className="empty-state">
          <p>No members yet. Share your Registration Code to invite people.</p>
        </div>
      ) : (
        <section className="dashboard-section">
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Verified</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>{m.email}</td>
                  <td>{m.role}</td>
                  <td>{m.is_email_verified ? 'Yes' : 'No'}</td>
                  <td>{new Date(m.created_at).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <Link to={`/members/${m.id}/report`} className="report-link">
                        Report
                      </Link>
                      {!m.is_email_verified && (
                        <button
                          type="button"
                          className="login-btn"
                          style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
                          onClick={() => handleVerify(m.id)}
                          disabled={verifyingMemberId === m.id}
                        >
                          {verifyingMemberId === m.id ? 'Verifying…' : 'Verify'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
