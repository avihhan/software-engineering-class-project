import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch, apiOwnerCreateBrandingLogoUploadSignUrl } from '../lib/api';

interface Branding {
  id: number;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  background_color: string | null;
  widget_background_color: string | null;
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

interface LemonStore {
  id: string;
  name: string | null;
  status: string | null;
}

interface LemonVariant {
  id: string;
  name: string | null;
  status: string | null;
  product_id: string | null;
}

interface BrandingPreset {
  id: string;
  label: string;
  primary: string;
  secondary: string;
  background: string;
  widget: string;
}

const BRANDING_PRESETS: BrandingPreset[] = [
  {
    id: 'foundation-light',
    label: 'Foundation Light (Default)',
    primary: '#333333',
    secondary: '#f5f5f5',
    background: '#ffffff',
    widget: '#f5f5f5',
  },
  {
    id: 'clean-slate',
    label: 'Clean Slate',
    primary: '#2f2f2f',
    secondary: '#ebebeb',
    background: '#ffffff',
    widget: '#f0f0f0',
  },
  {
    id: 'soft-contrast',
    label: 'Soft Contrast',
    primary: '#3b3b3b',
    secondary: '#ececec',
    background: '#ffffff',
    widget: '#f3f3f3',
  },
  {
    id: 'midnight-minimal',
    label: 'Midnight Minimal',
    primary: '#f5f5f5',
    secondary: '#1f2937',
    background: '#0f172a',
    widget: '#1e293b',
  },
  {
    id: 'ocean-clean',
    label: 'Ocean Clean',
    primary: '#0f4c81',
    secondary: '#dbeafe',
    background: '#eff6ff',
    widget: '#dbeafe',
  },
  {
    id: 'forest-balance',
    label: 'Forest Balance',
    primary: '#1f7a4c',
    secondary: '#dcfce7',
    background: '#f0fdf4',
    widget: '#dcfce7',
  },
  {
    id: 'sunset-slate',
    label: 'Sunset Slate',
    primary: '#7c2d12',
    secondary: '#ffedd5',
    background: '#fff7ed',
    widget: '#ffedd5',
  },
  {
    id: 'violet-frost',
    label: 'Violet Frost',
    primary: '#5b21b6',
    secondary: '#ede9fe',
    background: '#f5f3ff',
    widget: '#ede9fe',
  },
  {
    id: 'teal-clarity',
    label: 'Teal Clarity',
    primary: '#0f766e',
    secondary: '#ccfbf1',
    background: '#f0fdfa',
    widget: '#ccfbf1',
  },
  {
    id: 'rose-neutral',
    label: 'Rose Neutral',
    primary: '#9f1239',
    secondary: '#ffe4e6',
    background: '#fff1f2',
    widget: '#ffe4e6',
  },
];

function findPresetByColors(
  primary: string | null | undefined,
  secondary: string | null | undefined,
  background: string | null | undefined,
  widget: string | null | undefined,
): BrandingPreset | null {
  const n = (v: string | null | undefined) => (v || '').trim().toLowerCase();
  return (
    BRANDING_PRESETS.find(
      (preset) =>
        preset.primary.toLowerCase() === n(primary) &&
        preset.secondary.toLowerCase() === n(secondary) &&
        preset.background.toLowerCase() === n(background) &&
        preset.widget.toLowerCase() === n(widget),
    ) ?? null
  );
}

function publicUrlFromSignedUpload(sign: {
  signed_upload_url: string | null;
  bucket: string;
  object_path: string;
}): string | null {
  if (!sign.signed_upload_url) return null;
  try {
    const parsed = new URL(sign.signed_upload_url);
    return `${parsed.origin}/storage/v1/object/public/${sign.bucket}/${sign.object_path}`;
  } catch {
    return null;
  }
}

export default function Settings() {
  const { user, accessToken } = useAuth();
  const [branding, setBranding] = useState<Branding | null>(null);
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [primaryColor, setPrimaryColor] = useState('#333333');
  const [secondaryColor, setSecondaryColor] = useState('#f5f5f5');
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [widgetBackgroundColor, setWidgetBackgroundColor] = useState('#f5f5f5');
  const [selectedPresetId, setSelectedPresetId] = useState(BRANDING_PRESETS[0].id);
  const [registrationCode, setRegistrationCode] = useState('');
  const [resettingCode, setResettingCode] = useState(false);
  const [codeStatus, setCodeStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [brandingStatus, setBrandingStatus] = useState('');
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
  const [loadingTestAssets, setLoadingTestAssets] = useState(false);
  const [testStores, setTestStores] = useState<LemonStore[]>([]);
  const [testVariants, setTestVariants] = useState<LemonVariant[]>([]);
  const [testAssetStatus, setTestAssetStatus] = useState('');
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
          const preset = findPresetByColors(
            b.primary_color,
            b.secondary_color,
            b.background_color,
            b.widget_background_color,
          );
          const picked = preset ?? BRANDING_PRESETS[0];
          setSelectedPresetId(picked.id);
          setPrimaryColor(picked.primary);
          setSecondaryColor(picked.secondary);
          setBackgroundColor(picked.background);
          setWidgetBackgroundColor(picked.widget);
          setRegistrationCode(b.registration_code ?? '');
          if (!preset) {
            setBrandingStatus('Custom colors detected. Select a preset and save to apply.');
          }
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
    setBrandingStatus('');

    try {
      const res = await apiFetch('/api/admin/branding', accessToken, {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim(),
          logo_url: logoUrl.trim() || null,
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          background_color: backgroundColor,
          widget_background_color: widgetBackgroundColor,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || 'Failed to save branding');
      }
      setSaved(true);
      setBrandingStatus('Branding saved');
      setTimeout(() => setSaved(false), 3000);
      setTimeout(() => setBrandingStatus(''), 3000);
    } catch (err) {
      setBrandingStatus(err instanceof Error ? err.message : 'Failed to save branding');
      setTimeout(() => setBrandingStatus(''), 4000);
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadLogo() {
    if (!accessToken || !logoFile) return;
    setLogoUploading(true);
    try {
      const sign = await apiOwnerCreateBrandingLogoUploadSignUrl(accessToken, logoFile.name);
      if (!sign.signed_upload_url) {
        throw new Error('Signed upload URL was not returned');
      }
      let uploadUrl = sign.signed_upload_url;
      if (sign.token && !uploadUrl.includes('token=')) {
        uploadUrl += `${uploadUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(sign.token)}`;
      }
      const putResp = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': logoFile.type || 'application/octet-stream',
          'x-upsert': 'true',
        },
        body: logoFile,
      });
      if (!putResp.ok) {
        const fallbackResp = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Type': logoFile.type || 'application/octet-stream',
            'x-upsert': 'true',
          },
          body: logoFile,
        });
        if (!fallbackResp.ok) {
          throw new Error('Logo upload failed');
        }
      }
      if (!sign.public_url) {
        const fallbackPublic = publicUrlFromSignedUpload(sign);
        if (!fallbackPublic) {
          throw new Error('Logo upload succeeded but public URL could not be resolved');
        }
        setLogoUrl(fallbackPublic);
      } else {
        setLogoUrl(sign.public_url);
      }
      setLogoFile(null);
      setBrandingStatus('Logo uploaded. Click Save Branding to publish it.');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      setTimeout(() => setBrandingStatus(''), 4000);
    } catch (err) {
      setBrandingStatus(err instanceof Error ? err.message : 'Failed to upload logo');
      setTimeout(() => setBrandingStatus(''), 4000);
    } finally {
      setLogoUploading(false);
    }
  }

  function handlePresetChange(presetId: string) {
    const preset = BRANDING_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setSelectedPresetId(preset.id);
    setPrimaryColor(preset.primary);
    setSecondaryColor(preset.secondary);
    setBackgroundColor(preset.background);
    setWidgetBackgroundColor(preset.widget);
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

  async function handleLoadTestAssets() {
    if (!accessToken) return;
    setLoadingTestAssets(true);
    setTestAssetStatus('');
    try {
      const res = await apiFetch('/api/admin/billing/test-assets', accessToken);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Unable to load Lemon test assets');
      }
      const stores = (data.stores ?? []) as LemonStore[];
      const variants = (data.variants ?? []) as LemonVariant[];
      setTestStores(stores);
      setTestVariants(variants);

      if (!billing.store_id && stores[0]?.id) {
        setBilling((prev) => ({ ...prev, store_id: stores[0].id }));
      }
      if (!billing.variant_id && variants[0]?.id) {
        setBilling((prev) => ({
          ...prev,
          variant_id: variants[0].id,
          product_id: prev.product_id || (variants[0].product_id ?? ''),
        }));
      }
      setTestAssetStatus(
        `Loaded ${stores.length} store(s) and ${variants.length} variant(s) from Lemon test mode`,
      );
    } catch (err) {
      setTestAssetStatus(err instanceof Error ? err.message : 'Failed to load test assets');
    } finally {
      setLoadingTestAssets(false);
      setTimeout(() => setTestAssetStatus(''), 6000);
    }
  }

  async function handleSendSummaries() {
    if (!accessToken) return;
    setSummaryStatus('Sending...');
    try {
      const res = await apiFetch('/api/admin/weekly-summary', accessToken, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send weekly summaries');
      }
      const sent = Number(data.sent ?? 0);
      const total = Number(data.total_members ?? 0);
      const skipped = Number(data.skipped ?? 0);
      const failed = Number(data.failed ?? 0);
      const providers = data.providers && typeof data.providers === 'object'
        ? Object.entries(data.providers)
            .map(([k, v]) => `${k}:${String(v)}`)
            .join(', ')
        : '';
      const firstError =
        Array.isArray(data.errors) && data.errors.length > 0
          ? data.errors[0]?.error || 'unknown error'
          : '';
      setSummaryStatus(
        failed > 0
          ? `Weekly summaries: sent ${sent}/${total} (skipped ${skipped}, failed ${failed})${providers ? ` [${providers}]` : ''}. First error: ${firstError}`
          : `Weekly summaries: sent ${sent}/${total} (skipped ${skipped}, failed ${failed})${providers ? ` [${providers}]` : ''}`,
      );
    } catch (err) {
      setSummaryStatus(err instanceof Error ? err.message : 'Failed to send');
    }
    setTimeout(() => setSummaryStatus(''), 12000);
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
            <label htmlFor="s-logo-file">Logo Upload</label>
            <input
              id="s-logo-file"
              type="file"
              accept="image/*"
              disabled={saving || logoUploading}
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            />
            <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                type="button"
                className="login-btn"
                style={{ padding: '0.45rem 0.9rem', fontSize: '0.75rem' }}
                onClick={() => void handleUploadLogo()}
                disabled={!logoFile || saving || logoUploading}
              >
                {logoUploading ? 'Uploading…' : 'Upload Logo'}
              </button>
              <span className="form-hint">
                {logoFile ? logoFile.name : logoUrl ? 'Current logo saved' : 'No logo uploaded'}
              </span>
            </div>
          </div>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label htmlFor="s-preset">Client Color Theme</label>
              <select
                id="s-preset"
                className="form-select"
                value={selectedPresetId}
                onChange={(e) => handlePresetChange(e.target.value)}
                disabled={saving}
              >
                {BRANDING_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Preset Colors</label>
              <div className="color-input-wrap">
                <span className="color-hex">Primary: {primaryColor}</span>
                <span className="color-hex">Secondary: {secondaryColor}</span>
              </div>
            </div>
          </div>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label>App Background</label>
              <div className="color-input-wrap">
                <span className="color-hex">{backgroundColor}</span>
              </div>
            </div>
            <div className="form-group">
              <label>Widget Background</label>
              <div className="color-input-wrap">
                <span className="color-hex">{widgetBackgroundColor}</span>
              </div>
            </div>
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
            {brandingStatus && <span className="save-badge">{brandingStatus}</span>}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="login-btn"
              style={{ padding: '0.45rem 0.9rem', fontSize: '0.75rem' }}
              onClick={handleLoadTestAssets}
              disabled={loadingTestAssets || billingSaving}
            >
              {loadingTestAssets ? 'Loading Test Assets…' : 'Load Lemon Test Assets'}
            </button>
            {testAssetStatus && (
              <span className="save-badge">{testAssetStatus}</span>
            )}
          </div>
          {testStores.length > 0 && (
            <div className="form-group">
              <label htmlFor="pay-store-select">Detected Test Stores</label>
              <select
                id="pay-store-select"
                value={billing.store_id}
                onChange={(e) => setBilling((prev) => ({ ...prev, store_id: e.target.value }))}
                disabled={billingSaving}
              >
                {testStores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name || 'Store'} ({store.id})
                  </option>
                ))}
              </select>
            </div>
          )}
          {testVariants.length > 0 && (
            <div className="form-group">
              <label htmlFor="pay-variant-select">Detected Test Variants</label>
              <select
                id="pay-variant-select"
                value={billing.variant_id}
                onChange={(e) => {
                  const selected = testVariants.find((v) => v.id === e.target.value);
                  setBilling((prev) => ({
                    ...prev,
                    variant_id: e.target.value,
                    product_id: selected?.product_id || prev.product_id,
                  }));
                }}
                disabled={billingSaving}
              >
                {testVariants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.name || 'Variant'} ({variant.id})
                  </option>
                ))}
              </select>
            </div>
          )}
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
