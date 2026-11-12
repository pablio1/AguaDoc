import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  Map as MapIcon,
  MessageSquareText,
  RefreshCw,
  Save,
  Shield,
  Wifi,
  WifiOff,
} from 'lucide-react';
import PageHeader from '../components/admin/PageHeader';
import { showToast } from '../components/ui/Toast';
import { apiGetSettings, apiUpdateSettings } from '../api';

const FIELD_HELP = {
  xendit_secret_key:
    'From Xendit Dashboard → Settings → API Keys. Enables GCash / Maya / card checkout.',
  xendit_webhook_token:
    'From Xendit Dashboard → Settings → Webhooks → Verification token. Confirms paid orders.',
  backend_public_url:
    'Public HTTPS URL of this backend (ngrok or production). Used for checkout return + webhooks.',
  semaphore_api_key: 'From Semaphore Dashboard → API. Used for delivery and blast SMS.',
  semaphore_sender_name: 'Approved Semaphore sender name customers will see (optional).',
  geoapify_api_key:
    'From Geoapify Console → Projects → API keys. Powers MapLibre maps, routing, and geocoding.',
};

const ICONS = {
  xendit_secret_key: KeyRound,
  xendit_webhook_token: Shield,
  backend_public_url: Link2,
  semaphore_api_key: MessageSquareText,
  semaphore_sender_name: Wifi,
  geoapify_api_key: MapIcon,
};

function currentAdminName() {
  try {
    const saved = JSON.parse(localStorage.getItem('aguadoc_user') || 'null');
    return saved?.fullName || saved?.username || 'Admin';
  } catch {
    return 'Admin';
  }
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({});
  const [groups, setGroups] = useState({});
  const [draft, setDraft] = useState({});
  const [showSecret, setShowSecret] = useState({});
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiGetSettings()
      .then((data) => {
        if (cancelled) return;
        setSettings(data.settings || {});
        setGroups(data.groups || {});
        const nextDraft = {};
        Object.entries(data.settings || {}).forEach(([key, meta]) => {
          nextDraft[key] = meta.secret ? '' : meta.value || '';
        });
        setDraft(nextDraft);
      })
      .catch((err) => {
        if (!cancelled) showToast(`❌ ${err.message || 'Failed to load settings.'}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const paymentReady = useMemo(() => {
    const need = ['xendit_secret_key', 'xendit_webhook_token', 'backend_public_url'];
    return need.every((k) => settings[k]?.configured);
  }, [settings]);

  const smsReady = useMemo(() => Boolean(settings.semaphore_api_key?.configured), [settings]);
  const mapsReady = useMemo(() => Boolean(settings.geoapify_api_key?.configured), [settings]);

  function setField(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(keys) {
    const payload = {};
    keys.forEach((key) => {
      const meta = settings[key];
      const value = draft[key];
      if (meta?.secret) {
        // Blank secret = leave unchanged. Explicit clear uses the Clear button.
        if (value && !String(value).includes('•')) payload[key] = value;
      } else {
        payload[key] = value ?? '';
      }
    });

    if (Object.keys(payload).length === 0) {
      showToast('Nothing new to save for these fields.');
      return;
    }

    setSaving(true);
    try {
      const result = await apiUpdateSettings({
        settings: payload,
        updatedBy: currentAdminName(),
      });
      setSettings(result.settings || {});
      const nextDraft = { ...draft };
      Object.entries(result.settings || {}).forEach(([key, meta]) => {
        if (keys.includes(key)) {
          nextDraft[key] = meta.secret ? '' : meta.value || '';
        }
      });
      setDraft(nextDraft);
      showToast('✅ Settings saved.');
    } catch (err) {
      showToast(`❌ ${err.message || 'Failed to save settings.'}`);
    } finally {
      setSaving(false);
    }
  }

  async function clearSecret(key) {
    setSaving(true);
    try {
      const result = await apiUpdateSettings({
        settings: { [key]: '' },
        updatedBy: currentAdminName(),
      });
      setSettings(result.settings || {});
      setDraft((prev) => ({ ...prev, [key]: '' }));
      showToast('Cleared admin override — falling back to .env if set.');
    } catch (err) {
      showToast(`❌ ${err.message || 'Failed to clear setting.'}`);
    } finally {
      setSaving(false);
    }
  }

  function renderField(key) {
    const meta = settings[key];
    if (!meta) return null;
    const Icon = ICONS[key] || KeyRound;
    const isSecret = meta.secret;
    const visible = showSecret[key];

    return (
      <div key={key} className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sky-600 shadow-sm ring-1 ring-slate-200/80">
              <Icon size={16} />
            </div>
            <div>
              <p className="text-sm font-bold text-ink">{meta.label}</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                {FIELD_HELP[key] || ''}
              </p>
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
              meta.configured
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                : 'bg-amber-50 text-amber-800 ring-1 ring-amber-100'
            }`}
          >
            {meta.configured
              ? `Set (${meta.source === 'admin' ? 'Admin' : '.env'})`
              : 'Not set'}
          </span>
        </div>

        <div className="mt-3">
          <div className="flex items-center gap-2">
            <input
              type={isSecret && !visible ? 'password' : 'text'}
              className="agua-input font-mono text-[13px]"
              value={draft[key] ?? ''}
              onChange={(e) => setField(key, e.target.value)}
              placeholder={
                isSecret
                  ? meta.configured
                    ? `Saved as ${meta.hint} — paste a new key to replace`
                    : 'Paste API key…'
                  : meta.hint || 'https://…'
              }
              autoComplete="off"
              spellCheck={false}
            />
            {isSecret && (
              <button
                type="button"
                onClick={() => setShowSecret((s) => ({ ...s, [key]: !s[key] }))}
                className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 hover:bg-slate-50"
                aria-label={visible ? 'Hide' : 'Show'}
              >
                {visible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            )}
          </div>
          {isSecret && meta.configured && (
            <button
              type="button"
              onClick={() => clearSecret(key)}
              disabled={saving}
              className="mt-2 text-[11px] font-semibold text-rose-600 hover:underline disabled:opacity-40"
            >
              Clear saved key (use .env fallback)
            </button>
          )}
        </div>
      </div>
    );
  }

  function renderGroup(groupKey, accent) {
    const group = groups[groupKey];
    if (!group) return null;
    const ready = groupKey === 'payments' ? paymentReady : groupKey === 'sms' ? smsReady : mapsReady;
    const GroupIcon = groupKey === 'payments' ? CreditCard : groupKey === 'sms' ? MessageSquareText : MapIcon;

    return (
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_24px_rgba(15,42,74,0.04)]">
        <div className={`border-b border-slate-100 px-5 py-4 ${accent}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white">
                <GroupIcon size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">{group.title}</h2>
                <p className="text-[12px] text-white/70">
                  {ready ? 'Ready for live use' : 'Complete the fields below to enable'}
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold text-white">
              {ready ? <CheckCircle2 size={13} /> : groupKey === 'sms' ? <WifiOff size={13} /> : <WifiOff size={13} />}
              {ready ? 'Connected' : 'Needs setup'}
            </span>
          </div>
        </div>

        <div className="space-y-3 p-4 sm:p-5">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : (
            group.keys.map((key) => renderField(key))
          )}

          <button
            type="button"
            disabled={saving || loading}
            onClick={() => handleSave(group.keys)}
            className="agua-btn agua-btn-primary w-full !py-2.5 !text-sm disabled:opacity-50 sm:w-auto"
          >
            <Save size={15} />
            {saving ? 'Saving…' : `Save ${group.title}`}
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Integrations"
        subtitle="Configure GCash (Xendit), Semaphore SMS, and Geoapify maps. Values saved here override .env."
      >
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setReloadKey((k) => k + 1);
          }}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-ink shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="agua-card flex items-center gap-3 px-5 py-4">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${paymentReady ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-700'}`}>
            <CreditCard size={18} />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">GCash / Xendit</p>
            <p className="font-display text-lg font-bold text-ink">{paymentReady ? 'Ready' : 'Setup needed'}</p>
          </div>
        </div>
        <div className="agua-card flex items-center gap-3 px-5 py-4">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${smsReady ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-700'}`}>
            <MessageSquareText size={18} />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">Semaphore SMS</p>
            <p className="font-display text-lg font-bold text-ink">{smsReady ? 'Ready' : 'Setup needed'}</p>
          </div>
        </div>
        <div className="agua-card flex items-center gap-3 px-5 py-4">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${mapsReady ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-700'}`}>
            <MapIcon size={18} />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">Geoapify maps</p>
            <p className="font-display text-lg font-bold text-ink">{mapsReady ? 'Ready' : 'Setup needed'}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {renderGroup('payments', 'bg-gradient-to-br from-[#0f172a] via-[#1e3a5f] to-[#0f172a]')}
        {renderGroup('sms', 'bg-gradient-to-br from-[#0c4a6e] via-[#0369a1] to-[#0c4a6e]')}
        {renderGroup('maps', 'bg-gradient-to-br from-[#14532d] via-[#15803d] to-[#14532d]')}
      </div>

      <p className="text-center text-[11px] text-muted">
        Secrets are stored in MySQL and never shown in full after saving. Leave a secret blank when saving to keep the current key.
      </p>
    </div>
  );
}
