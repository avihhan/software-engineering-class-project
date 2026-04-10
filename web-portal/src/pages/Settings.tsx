import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';

interface Branding {
  id: number;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  custom_domain: string | null;
  registration_code: string | null;
}

interface BillingSettings {
  enabled: boolean;
  provider: 'lemon_squeezy';
  trial_days: number;
  store_id: string;
  product_id: string;
  variant_id: string;
  plan_name: string;
  plan_description: string;
  offer_description: string;
  price_cents: number;
  currency: string;
  discount_type: 'none' | 'percent' | 'amount';
  discount_value: number | null;
}

export default function Settings() {
  const { user, accessToken } = useAuth();
  const [branding, setBranding] = useState<Branding | null>(null);
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#6c63ff');
  const [secondaryColor, setSecondaryColor] = useState('#1a1a2e');
  const [customDomain, setCustomDomain] = useState('');
  const [registrationCode, setRegistrationCode] = useState('');
  const [resettingCode, setResettingCode] = useState(false);
  const [codeStatus, setCodeStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [billing, setBilling] = useState<BillingSettings>({
    enabled: false,
    provider: 'lemon_squeezy',
    trial_days: 7,
    store_id: '',
    product_id: '',
    variant_id: '',
    plan_name: '',
    plan_description: '',
    offer_description: '',
    price_cents: 0,
    currency: 'USD',
    discount_type: 'none',
    discount_value: null,
  });
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingSaved, setBillingSaved] = useState(false);
  const [billingError, setBillingError] = useState('');
  const [summaryStatus, setSummaryStatus] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    apiFetch('/api/admin/branding', accessToken)
      .then((r) => r.json())
      .then((d) => {
        const b = d.branding;
        if (b) {
          setBranding(b);
          setName(b.name ?? '');
          setLogoUrl(b.logo_url ?? '');
          setPrimaryColor(b.primary_color ?? '#6c63ff');
          setSecondaryColor(b.secondary_color ?? '#1a1a2e');
          setCustomDomain(b.custom_domain ?? '');
          setRegistrationCode(b.registration_code ?? '');
        }
      })
      .catch(() => {});

    apiFetch('/api/admin/billing', accessToken)
      .then((r) => r.json())
      .then((d) => {
        const b = d.billing;
        if (!b) return;
        setBilling({
          enabled: Boolean(b.enabled),
          provider: 'lemon_squeezy',
          trial_days: Number(b.trial_days ?? 7),
          store_id: String(b.store_id ?? ''),
          product_id: String(b.product_id ?? ''),
          variant_id: String(b.variant_id ?? ''),
          plan_name: String(b.plan_name ?? ''),
          plan_description: String(b.plan_description ?? ''),
          offer_description: String(b.offer_description ?? ''),
          price_cents: Number(b.price_cents ?? 0),
          currency: String(b.currency ?? 'USD').toUpperCase(),
          discount_type: (b.discount_type ?? 'none') as BillingSettings['discount_type'],
          discount_value: b.discount_value === null || b.discount_value === undefined ? null : Number(b.discount_value),
        });
      })
      .catch(() => {});
  }, [accessToken]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setSaving(true);
    setSaved(false);

    await apiFetch('/api/admin/branding', accessToken, {
      method: 'PUT',
      body: JSON.stringify({
        name: name.trim(),
        logo_url: logoUrl.trim() || null,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        custom_domain: customDomain.trim() || null,
      }),
    });

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleSaveBilling(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setBillingError('');
    setBillingSaving(true);
    setBillingSaved(false);
    try {
      const res = await apiFetch('/api/admin/billing', accessToken, {
        method: 'PUT',
        body: JSON.stringify({
          ...billing,
          store_id: billing.store_id.trim() || null,
          product_id: billing.product_id.trim() || null,
          variant_id: billing.variant_id.trim() || null,
          plan_name: billing.plan_name.trim() || null,
          plan_description: billing.plan_description.trim() || null,
          offer_description: billing.offer_description.trim() || null,
          price_cents: Number.isFinite(billing.price_cents) ? billing.price_cents : 0,
          currency: billing.currency.trim().toUpperCase() || 'USD',
          discount_value:
            billing.discount_type === 'none'
              ? null
              : billing.discount_value === null
                ? 0
                : billing.discount_value,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save billing settings');
      }
      setBillingSaved(true);
      setTimeout(() => setBillingSaved(false), 3000);
    } catch (err) {
      setBillingError(err instanceof Error ? err.message : 'Failed to save billing settings');
    } finally {
      setBillingSaving(false);
    }
  }

  async function handleSendSummaries() {
    if (!accessToken) return;
    setSummaryStatus('Sending...');
    try {
      const res = await apiFetch('/api/admin/weekly-summary', accessToken, {
        method: 'POST',
      });
      const data = await res.json();
      setSummaryStatus(`Sent to ${data.sent}/${data.total_members} members`);
    } catch {
      setSummaryStatus('Failed to send');
    }
    setTimeout(() => setSummaryStatus(''), 5000);
  }

  async function handleResetRegistrationCode() {
    if (!accessToken || resettingCode) return;
    setResettingCode(true);
    setCodeStatus('');
    try {
      const res = await apiFetch('/api/admin/registration-code/reset', accessToken, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.registration_code) {
        throw new Error(data.error || 'Unable to reset code');
      }
      setRegistrationCode(data.registration_code);
      setCodeStatus('Registration code reset');
    } catch {
      setCodeStatus('Failed to reset registration code');
    } finally {
      setResettingCode(false);
      setTimeout(() => setCodeStatus(''), 4000);
    }
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Settings</h1>
        <p className="dashboard-subtitle">
          {branding?.name ?? 'Organization'} configuration
        </p>
      </header>

      <section className="dashboard-section">
        <h2>Account</h2>
        <div className="settings-row">
          <span className="settings-label">Email</span>
          <span className="settings-value">{user?.email}</span>
        </div>
        <div className="settings-row">
          <span className="settings-label">Role</span>
          <span className="settings-value">{user?.role}</span>
        </div>
        <div className="settings-row">
          <span className="settings-label">Tenant ID</span>
          <span className="settings-value">{user?.tenant_id}</span>
        </div>
        <div className="settings-row">
          <span className="settings-label">Member Registration Code</span>
          <span className="settings-value">{registrationCode || 'Not set'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.75rem' }}>
          <button
            type="button"
            className="login-btn"
            style={{ padding: '0.5rem 1rem', fontSize: '0.8125rem' }}
            onClick={handleResetRegistrationCode}
            disabled={resettingCode}
          >
            {resettingCode ? 'Resetting…' : 'Reset Registration Code'}
          </button>
          {codeStatus && <span className="save-badge">{codeStatus}</span>}
        </div>
      </section>

      <section className="dashboard-section" style={{ marginTop: '1rem' }}>
        <h2>Branding</h2>
        <form onSubmit={handleSave} className="settings-form">
          <div className="form-group">
            <label htmlFor="s-name">Organization Name</label>
            <input id="s-name" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
          </div>
          <div className="form-group">
            <label htmlFor="s-logo">Logo URL</label>
            <input id="s-logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." disabled={saving} />
          </div>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label htmlFor="s-pc">Primary Color</label>
              <div className="color-input-wrap">
                <input id="s-pc" type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} disabled={saving} />
                <span className="color-hex">{primaryColor}</span>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="s-sc">Secondary Color</label>
              <div className="color-input-wrap">
                <input id="s-sc" type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} disabled={saving} />
                <span className="color-hex">{secondaryColor}</span>
              </div>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="s-domain">Custom Domain</label>
            <input id="s-domain" value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="app.yourfitness.com" disabled={saving} />
          </div>

          {logoUrl && (
            <div className="logo-preview">
              <img src={logoUrl} alt="Logo preview" onError={(e) => (e.currentTarget.style.display = 'none')} />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button type="submit" className="login-btn" style={{ padding: '0.5rem 1.5rem', fontSize: '0.8125rem' }} disabled={saving}>
              {saving ? 'Saving\u2026' : 'Save Branding'}
            </button>
            {saved && <span className="save-badge">Saved!</span>}
          </div>
        </form>
      </section>

      <section className="dashboard-section" style={{ marginTop: '1rem' }}>
        <h2>Payments</h2>
        <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
          Configure Lemon Squeezy billing for your members after their free trial.
        </p>
        <form onSubmit={handleSaveBilling} className="settings-form">
          {billingError && (
            <div style={{ color: '#fca5a5', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
              {billingError}
            </div>
          )}
          <div className="settings-row">
            <span className="settings-label">Enable Billing</span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={billing.enabled}
                onChange={(e) => setBilling((prev) => ({ ...prev, enabled: e.target.checked }))}
                disabled={billingSaving}
              />
              <span className="settings-value">{billing.enabled ? 'Enabled' : 'Disabled'}</span>
            </label>
          </div>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label htmlFor="pay-trial">Free Trial (Days)</label>
              <input
                id="pay-trial"
                type="number"
                min={0}
                value={billing.trial_days}
                onChange={(e) =>
                  setBilling((prev) => ({ ...prev, trial_days: Math.max(0, Number(e.target.value || 0)) }))
                }
                disabled={billingSaving}
              />
            </div>
            <div className="form-group">
              <label htmlFor="pay-currency">Currency</label>
              <input
                id="pay-currency"
                value={billing.currency}
                onChange={(e) =>
                  setBilling((prev) => ({ ...prev, currency: e.target.value.toUpperCase().slice(0, 3) }))
                }
                disabled={billingSaving}
                placeholder="USD"
              />
            </div>
          </div>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label htmlFor="pay-plan">Plan Name</label>
              <input
                id="pay-plan"
                value={billing.plan_name}
                onChange={(e) => setBilling((prev) => ({ ...prev, plan_name: e.target.value }))}
                disabled={billingSaving}
                placeholder="Monthly Fitness Access"
              />
            </div>
            <div className="form-group">
              <label htmlFor="pay-price">Price (in cents)</label>
              <input
                id="pay-price"
                type="number"
                min={0}
                value={billing.price_cents}
                onChange={(e) =>
                  setBilling((prev) => ({ ...prev, price_cents: Math.max(0, Number(e.target.value || 0)) }))
                }
                disabled={billingSaving}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="pay-plan-desc">Plan Description</label>
            <input
              id="pay-plan-desc"
              value={billing.plan_description}
              onChange={(e) => setBilling((prev) => ({ ...prev, plan_description: e.target.value }))}
              disabled={billingSaving}
              placeholder="What is included in this subscription?"
            />
          </div>
          <div className="form-group">
            <label htmlFor="pay-offer">Offer Description</label>
            <input
              id="pay-offer"
              value={billing.offer_description}
              onChange={(e) => setBilling((prev) => ({ ...prev, offer_description: e.target.value }))}
              disabled={billingSaving}
              placeholder="Special offer, onboarding bonus, etc."
            />
          </div>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label htmlFor="pay-discount-type">Discount Type</label>
              <select
                id="pay-discount-type"
                value={billing.discount_type}
                onChange={(e) =>
                  setBilling((prev) => ({
                    ...prev,
                    discount_type: e.target.value as BillingSettings['discount_type'],
                    discount_value: e.target.value === 'none' ? null : prev.discount_value,
                  }))
                }
                disabled={billingSaving}
              >
                <option value="none">None</option>
                <option value="percent">Percent</option>
                <option value="amount">Amount</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="pay-discount-value">Discount Value</label>
              <input
                id="pay-discount-value"
                type="number"
                min={0}
                step="0.01"
                value={billing.discount_value ?? 0}
                onChange={(e) =>
                  setBilling((prev) => ({ ...prev, discount_value: Number(e.target.value || 0) }))
                }
                disabled={billingSaving || billing.discount_type === 'none'}
                placeholder={billing.discount_type === 'percent' ? '10 for 10%' : '5.00'}
              />
            </div>
          </div>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label htmlFor="pay-store">Lemon Store ID</label>
              <input
                id="pay-store"
                value={billing.store_id}
                onChange={(e) => setBilling((prev) => ({ ...prev, store_id: e.target.value }))}
                disabled={billingSaving}
                placeholder="12345"
              />
            </div>
            <div className="form-group">
              <label htmlFor="pay-product">Lemon Product ID</label>
              <input
                id="pay-product"
                value={billing.product_id}
                onChange={(e) => setBilling((prev) => ({ ...prev, product_id: e.target.value }))}
                disabled={billingSaving}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="pay-variant">Lemon Variant ID</label>
            <input
              id="pay-variant"
              value={billing.variant_id}
              onChange={(e) => setBilling((prev) => ({ ...prev, variant_id: e.target.value }))}
              disabled={billingSaving}
              placeholder="Required for checkout"
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              type="submit"
              className="login-btn"
              style={{ padding: '0.5rem 1.5rem', fontSize: '0.8125rem' }}
              disabled={billingSaving}
            >
              {billingSaving ? 'Saving…' : 'Save Payments'}
            </button>
            {billingSaved && <span className="save-badge">Saved!</span>}
          </div>
        </form>
      </section>

      <section className="dashboard-section" style={{ marginTop: '1rem' }}>
        <h2>Engagement</h2>
        <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
          Send a weekly progress summary email to all your members.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="login-btn" style={{ padding: '0.5rem 1rem', fontSize: '0.8125rem' }} onClick={handleSendSummaries} disabled={summaryStatus === 'Sending...'}>
            {summaryStatus === 'Sending...' ? 'Sending\u2026' : 'Send Weekly Summaries'}
          </button>
          {summaryStatus && summaryStatus !== 'Sending...' && (
            <span className="save-badge">{summaryStatus}</span>
          )}
        </div>
      </section>
    </div>
  );
}
