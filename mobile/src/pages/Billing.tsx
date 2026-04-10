import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  apiCreateBillingCheckout,
  apiGetBillingMe,
  type BillingSnapshot,
} from '../lib/api';

function formatMoney(cents: number | null, currency: string) {
  if (cents === null || Number.isNaN(cents)) return '--';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(cents / 100);
}

export default function Billing() {
  const { accessToken, user } = useAuth();
  const [billing, setBilling] = useState<BillingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startingCheckout, setStartingCheckout] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    apiGetBillingMe(accessToken)
      .then((data) => setBilling(data))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load billing info'),
      )
      .finally(() => setLoading(false));
  }, [accessToken]);

  const basePrice = useMemo(
    () => formatMoney(billing?.plan.price_cents ?? null, billing?.plan.currency ?? 'USD'),
    [billing],
  );
  const effectivePrice = useMemo(
    () =>
      formatMoney(
        billing?.plan.effective_price_cents ?? null,
        billing?.plan.currency ?? 'USD',
      ),
    [billing],
  );

  async function handleCheckout() {
    if (!accessToken || !billing) return;
    setStartingCheckout(true);
    setError('');
    try {
      const checkoutUrl = await apiCreateBillingCheckout(accessToken);
      window.location.href = checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start checkout');
      setStartingCheckout(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo">A</div>
          <h1>Complete Your Subscription</h1>
          <p>Continue access to your tenant services.</p>
        </div>

        {loading ? (
          <p className="login-loading">Loading billing details…</p>
        ) : (
          <div className="login-form">
            {error && <div className="login-error">{error}</div>}
            <div className="section" style={{ marginBottom: 0 }}>
              <p className="form-hint" style={{ marginTop: 0 }}>
                Member: {user?.email}
              </p>
              <p className="form-hint">
                Status: {billing?.status ?? 'unknown'}
              </p>
              <p className="form-hint">
                Trial ends: {billing?.trial_ends_at ? new Date(billing.trial_ends_at).toLocaleString() : 'N/A'}
              </p>
              <hr className="form-divider" />
              <p className="form-hint">
                Plan: {billing?.plan.name || 'Subscription'}
              </p>
              {billing?.plan.description && (
                <p className="form-hint">{billing.plan.description}</p>
              )}
              {billing?.plan.offer_description && (
                <p className="form-hint">{billing.plan.offer_description}</p>
              )}
              <p className="form-hint">Base price: {basePrice}</p>
              <p className="form-hint">Price after discounts: {effectivePrice}</p>
            </div>

            <button
              type="button"
              className="login-btn"
              disabled={startingCheckout || !billing?.requires_payment}
              onClick={handleCheckout}
            >
              {startingCheckout ? 'Redirecting…' : 'Continue to Payment'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
