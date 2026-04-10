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

  useEffect(() => {
    if (!accessToken) return;
    apiFetch('/api/admin/members', accessToken)
      .then((r) => r.json())
      .then((d) => setMembers(d.members ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accessToken]);

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
                    <Link to={`/members/${m.id}/report`} className="report-link">
                      Report
                    </Link>
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
