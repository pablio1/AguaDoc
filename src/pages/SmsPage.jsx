import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  MessageSquareText,
  PhoneOff,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  Sparkles,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import PageHeader from '../components/admin/PageHeader';
import EmptyState from '../components/admin/EmptyState';
import { showToast } from '../components/ui/Toast';
import { apiGetSmsPendingDeliveries, apiGetSmsStatus, apiSendSms } from '../api';
import { formatMoney } from '../lib/money';

const DEFAULT_TEMPLATE =
  'Hi [Name], your AguaDoc order [Order] is still [Status]. We will deliver to [Address] soon. Thank you!';

const QUICK_TEMPLATES = [
  {
    id: 'status',
    label: 'Status update',
    text: 'Hi [Name], your AguaDoc order [Order] is still [Status]. We will deliver to [Address] soon. Thank you!',
  },
  {
    id: 'otw',
    label: 'On the way',
    text: 'Hi [Name], your AguaDoc rider is preparing order [Order]. Expect delivery at [Address] shortly. Salamat!',
  },
  {
    id: 'delay',
    label: 'Slight delay',
    text: 'Hi [Name], order [Order] is [Status] and may take a little longer. Pasensya na — we will update you soon.',
  },
];

const TOKENS = [
  { key: '[Name]', tip: 'Customer name' },
  { key: '[Order]', tip: 'Order reference' },
  { key: '[Status]', tip: 'Delivery status' },
  { key: '[Address]', tip: 'Delivery address' },
];

const STATUS_PILL = {
  Pending: 'bg-amber-50 text-amber-800 ring-amber-100',
  Assigned: 'bg-sky-50 text-sky-700 ring-sky-100',
  Accepted: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
  Processing: 'bg-blue-50 text-blue-700 ring-blue-100',
  'Out for Delivery': 'bg-emerald-50 text-emerald-700 ring-emerald-100',
};

function formatWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function initials(name = '') {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || '?';
}

function personalize(template, sample) {
  if (!sample) return 'Select a customer to preview the message.';
  return String(template || '')
    .replace(/\[Name\]/gi, sample.customerName || 'Customer')
    .replace(/\[Status\]/gi, sample.status || '')
    .replace(/\[Order\]/gi, sample.ref || '')
    .replace(/\[Address\]/gi, sample.address || '');
}

function smsSegments(text) {
  const len = [...String(text || '')].length;
  if (len === 0) return { len: 0, parts: 0 };
  // GSM-ish estimate; Semaphore splits automatically past 160
  const parts = len <= 160 ? 1 : Math.ceil(len / 153);
  return { len, parts };
}

async function fetchSmsPageData() {
  const [list, smsStatus] = await Promise.all([
    apiGetSmsPendingDeliveries(),
    apiGetSmsStatus(),
  ]);
  const rows = Array.isArray(list?.recipients) ? list.recipients : [];
  return {
    rows,
    status: smsStatus || { configured: false },
    selected: new Set(rows.filter((r) => r.canSms).map((r) => String(r.orderId))),
  };
}

export default function SmsPage() {
  const [recipients, setRecipients] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [status, setStatus] = useState({ configured: false, provider: 'Semaphore' });
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // all | ready | missing
  const [confirmSend, setConfirmSend] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSmsPageData()
      .then((data) => {
        if (cancelled) return;
        setRecipients(data.rows);
        setStatus(data.status);
        setSelected(data.selected);
      })
      .catch((err) => {
        if (!cancelled) showToast(`❌ ${err.message || 'Failed to load SMS recipients.'}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function load() {
    setLoading(true);
    setConfirmSend(false);
    setReloadKey((k) => k + 1);
  }

  const smsReady = useMemo(() => recipients.filter((r) => r.canSms), [recipients]);
  const missingPhone = useMemo(() => recipients.filter((r) => !r.canSms), [recipients]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipients.filter((r) => {
      if (filter === 'ready' && !r.canSms) return false;
      if (filter === 'missing' && r.canSms) return false;
      if (!q) return true;
      return [r.customerName, r.phone, r.normalizedPhone, r.ref, r.address, r.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [recipients, query, filter]);

  const selectedReady = useMemo(
    () => recipients.filter((r) => selected.has(String(r.orderId)) && r.canSms),
    [recipients, selected]
  );

  const previewSample = selectedReady[0] || smsReady[0] || null;
  const preview = personalize(template, previewSample);
  const segments = smsSegments(preview);
  const allReadySelected = smsReady.length > 0 && selectedReady.length === smsReady.length;

  function toggleOne(orderId, enabled) {
    if (!enabled) return;
    setConfirmSend(false);
    setSelected((prev) => {
      const next = new Set(prev);
      const key = String(orderId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllReady() {
    setConfirmSend(false);
    setSelected(new Set(smsReady.map((r) => String(r.orderId))));
  }

  function clearSelection() {
    setConfirmSend(false);
    setSelected(new Set());
  }

  function insertToken(token) {
    setTemplate((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${token}`);
  }

  async function handleSend() {
    if (!status.configured) {
      showToast('❌ Add SEMAPHORE_API_KEY in backend/.env first.');
      return;
    }
    if (selectedReady.length === 0) {
      showToast('⚠ Select at least one customer with a valid mobile number.');
      return;
    }
    if (!template.trim()) {
      showToast('⚠ Message cannot be empty.');
      return;
    }
    if (!confirmSend) {
      setConfirmSend(true);
      return;
    }

    setSending(true);
    setLastResult(null);
    try {
      const result = await apiSendSms({
        orderIds: selectedReady.map((r) => r.orderId),
        message: template.trim(),
      });
      setLastResult(result);
      setConfirmSend(false);
      if (result.failed > 0) {
        showToast(`⚠ Sent ${result.sent}, failed ${result.failed}.`);
      } else {
        showToast(`✅ SMS sent to ${result.sent} customer(s) via Semaphore.`);
      }
    } catch (err) {
      showToast(`❌ ${err.message || 'SMS send failed.'}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="SMS Module"
        subtitle="Message customers with pending or undelivered orders through Semaphore."
      >
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-ink shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh list
        </button>
      </PageHeader>

      {/* Connection + stats strip */}
      <div
        className={`relative overflow-hidden rounded-2xl px-5 py-5 text-white shadow-lg sm:px-6 ${
          status.configured
            ? 'bg-gradient-to-br from-[#0f172a] via-[#1e3a5f] to-[#0f172a]'
            : 'bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900'
        }`}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle at 15% 20%, rgba(56,189,248,0.25), transparent 40%), radial-gradient(circle at 85% 70%, rgba(59,130,246,0.2), transparent 45%)',
          }}
        />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                status.configured ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300'
              }`}
            >
              {status.configured ? <Wifi size={20} /> : <WifiOff size={20} />}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
                Semaphore gateway
              </p>
              <p className="mt-0.5 text-lg font-bold tracking-tight">
                {status.configured ? 'Ready to send' : 'API key not configured'}
              </p>
              <p className="mt-1 max-w-xl text-[13px] text-white/60">
                {status.configured
                  ? [
                      status.senderName ? `Sender: ${status.senderName}` : null,
                      status.account?.creditBalance != null
                        ? `Credits: ${status.account.creditBalance}`
                        : 'API key loaded',
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : 'Add SEMAPHORE_API_KEY in backend/.env, then restart the backend.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { label: 'Pending', value: recipients.length, icon: Clock3 },
              { label: 'Ready', value: smsReady.length, icon: Smartphone },
              { label: 'Selected', value: selectedReady.length, icon: Zap },
            ].map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="min-w-[88px] rounded-xl border border-white/10 bg-white/5 px-3 py-3 backdrop-blur-sm"
              >
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">
                  <Icon size={12} /> {label}
                </div>
                <p className="mt-1 font-display text-2xl font-bold tabular-nums">{loading ? '—' : value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
        {/* Recipients */}
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_24px_rgba(15,42,74,0.04)]">
          <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-bold text-ink">Recipients</h2>
                <p className="mt-0.5 text-xs text-muted">
                  Pending & undelivered orders · {filtered.length} shown
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={allReadySelected ? clearSelection : selectAllReady}
                  disabled={smsReady.length === 0}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-ink hover:bg-white disabled:opacity-40"
                >
                  {allReadySelected ? 'Clear selection' : 'Select all ready'}
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 focus-within:border-blue-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-500/10">
                <Search size={15} className="shrink-0 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, mobile, order…"
                  className="w-full bg-transparent text-[13px] outline-none placeholder:text-slate-400"
                />
              </div>
              <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'ready', label: `Ready (${smsReady.length})` },
                  { id: 'missing', label: `No # (${missingPhone.length})` },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    className={`rounded-[0.65rem] px-3 py-1.5 text-[11px] font-semibold transition ${
                      filter === f.id
                        ? 'bg-white text-ink shadow-sm'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="max-h-[min(62vh,720px)] space-y-2 overflow-y-auto overscroll-contain p-3 sm:p-4">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-[88px] animate-pulse rounded-2xl bg-slate-100" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={MessageSquareText}
                title={recipients.length === 0 ? 'No pending deliveries' : 'No matches'}
                description={
                  recipients.length === 0
                    ? 'Customers show up here when an order is not yet delivered.'
                    : 'Try another search or filter.'
                }
              />
            ) : (
              filtered.map((r) => {
                const checked = selected.has(String(r.orderId));
                const disabled = !r.canSms;
                return (
                  <button
                    key={r.orderId}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleOne(r.orderId, r.canSms)}
                    className={`group flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3.5 text-left transition sm:px-4 ${
                      disabled
                        ? 'cursor-not-allowed border-slate-100 bg-slate-50/70 opacity-80'
                        : checked
                          ? 'border-blue-200 bg-blue-50/60 shadow-sm ring-1 ring-blue-100'
                          : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                        checked
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-300 bg-white text-transparent'
                      }`}
                    >
                      <CheckCircle2 size={14} strokeWidth={2.5} />
                    </span>

                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[12px] font-bold ${
                        checked
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {initials(r.customerName)}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[13.5px] font-bold text-ink">
                          {r.customerName}
                        </span>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
                            STATUS_PILL[r.status] || 'bg-slate-100 text-slate-600 ring-slate-200'
                          }`}
                        >
                          {r.status}
                        </span>
                      </span>

                      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                        <span className="inline-flex items-center gap-1 font-medium text-ink">
                          {r.canSms ? (
                            <>
                              <Smartphone size={12} className="text-sky-600" />
                              {r.normalizedPhone}
                            </>
                          ) : (
                            <>
                              <PhoneOff size={12} className="text-rose-500" />
                              <span className="text-rose-600">{r.phone || 'No mobile number'}</span>
                            </>
                          )}
                        </span>
                        <span className="font-semibold text-slate-500">{r.ref || r.orderId}</span>
                        <span>{formatMoney(r.total)}</span>
                        <span>{formatWhen(r.date)}</span>
                      </span>

                      <span className="mt-1 block truncate text-[11px] text-slate-400">
                        {r.address || 'No delivery address on file'}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Composer */}
        <section className="xl:sticky xl:top-3 xl:self-start">
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_24px_rgba(15,42,74,0.04)]">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-ink">Compose SMS</h2>
                  <p className="text-xs text-muted">Personalize with tokens, then send</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                  Quick templates
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTemplate(t.text);
                        setConfirmSend(false);
                      }}
                      className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                        template === t.text
                          ? 'border-blue-500 bg-blue-500 text-white'
                          : 'border-slate-200 bg-slate-50 text-ink hover:border-slate-300 hover:bg-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label className="text-[12.5px] font-semibold text-ink">Message</label>
                  <span className="text-[11px] tabular-nums text-muted">
                    {segments.len} chars
                    {segments.parts > 0 ? ` · ~${segments.parts} SMS` : ''}
                  </span>
                </div>
                <textarea
                  rows={5}
                  className="agua-input min-h-[120px] resize-y leading-relaxed"
                  value={template}
                  onChange={(e) => {
                    setTemplate(e.target.value);
                    setConfirmSend(false);
                  }}
                  placeholder="Write your SMS…"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {TOKENS.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      title={t.tip}
                      onClick={() => insertToken(t.key)}
                      className="rounded-lg border border-dashed border-sky-200 bg-sky-50/70 px-2 py-1 text-[11px] font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-50"
                    >
                      {t.key}
                    </button>
                  ))}
                </div>
              </div>

              {/* Phone preview */}
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                  Live preview
                  {previewSample ? ` · ${previewSample.customerName}` : ''}
                </p>
                <div className="mx-auto max-w-[280px]">
                  <div className="rounded-[1.75rem] border border-slate-800 bg-slate-900 p-2.5 shadow-xl shadow-slate-900/20">
                    <div className="rounded-[1.35rem] bg-[#F2F4F7] px-3 pb-4 pt-3">
                      <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-slate-300/80" />
                      <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        AquaDoc
                      </p>
                      <div className="rounded-2xl rounded-tl-md bg-white px-3.5 py-3 text-[12.5px] leading-relaxed text-ink shadow-sm ring-1 ring-slate-200/80">
                        {preview}
                      </div>
                      <p className="mt-2 text-center text-[10px] text-slate-400">
                        {previewSample?.normalizedPhone || 'Select a recipient'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {!status.configured && (
                <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900">
                  <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                  <p>
                    Semaphore is offline until you set{' '}
                    <code className="font-semibold">SEMAPHORE_API_KEY</code> in{' '}
                    <code className="font-semibold">backend/.env</code>.
                  </p>
                </div>
              )}

              {lastResult && (
                <div
                  className={`rounded-xl border px-3 py-2.5 text-[12px] ${
                    lastResult.failed > 0
                      ? 'border-amber-200 bg-amber-50 text-amber-900'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  }`}
                >
                  <p className="font-semibold">
                    Last blast: {lastResult.sent} sent
                    {lastResult.failed ? ` · ${lastResult.failed} failed` : ''}
                    {lastResult.skipped ? ` · ${lastResult.skipped} skipped` : ''}
                  </p>
                  {Array.isArray(lastResult.results) && lastResult.results.some((r) => !r.ok) && (
                    <ul className="mt-1.5 space-y-0.5 text-rose-700">
                      {lastResult.results
                        .filter((r) => !r.ok)
                        .slice(0, 4)
                        .map((r) => (
                          <li key={`${r.orderId}-err`}>
                            {r.customerName}: {r.error}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              )}

              {confirmSend && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-[12px] text-blue-900">
                  Send personalized SMS to <strong>{selectedReady.length}</strong> customer
                  {selectedReady.length === 1 ? '' : 's'} via Semaphore? Tap send again to confirm.
                </div>
              )}

              <button
                type="button"
                onClick={handleSend}
                disabled={sending || selectedReady.length === 0 || !status.configured}
                className={`group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl px-4 py-3 text-sm font-bold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  confirmSend
                    ? 'bg-emerald-600 shadow-emerald-600/25 hover:bg-emerald-500'
                    : 'bg-[#2563EB] shadow-blue-600/25 hover:bg-blue-600'
                }`}
              >
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition duration-700 group-hover:translate-x-full" />
                {sending ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Sending via Semaphore…
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    {confirmSend
                      ? `Confirm send to ${selectedReady.length}`
                      : `Send to ${selectedReady.length} selected`}
                  </>
                )}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
