import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROLES, apiGetBillingMe } from '../lib/api';

const WEB_PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'http://localhost:3000';

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, initialized, accessToken, billingGate } = useAuth();
  const location = useLocation();
  const [checkingBilling, setCheckingBilling] = useState(false);
  const [requiresPayment, setRequiresPayment] = useState(false);

  useEffect(() => {
    if (!initialized || !user || !accessToken) return;
    if (user.role !== ROLES.MEMBER) return;

    let active = true;
    setCheckingBilling(true);

    apiGetBillingMe(accessToken)
      .then((billing) => {
        if (!active) return;
        setRequiresPayment(Boolean(billing.requires_payment));
      })
      .catch(() => {
        if (!active) return;
        setRequiresPayment(Boolean(billingGate?.requires_payment));
      })
      .finally(() => {
        if (active) setCheckingBilling(false);
      });

    return () => {
      active = false;
    };
  }, [initialized, user, accessToken, location.pathname, billingGate?.requires_payment]);

  if (!initialized) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">A</div>
        <p>Loading&hellip;</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (checkingBilling) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">A</div>
        <p>Checking your subscription&hellip;</p>
      </div>
    );
  }

  if (user.role === ROLES.OWNER || user.role === ROLES.SUPER_ADMIN) {
    return (
      <div className="role-gate">
        <div className="loading-logo">A</div>
        <h2>Admin Account Detected</h2>
        <p>
          This app is for members. Please use the{' '}
          <a href={WEB_PORTAL_URL}>Admin Portal</a> instead.
        </p>
      </div>
    );
  }

  if (requiresPayment && location.pathname !== '/billing') {
    return <Navigate to="/billing" replace />;
  }

  return <>{children}</>;
}
