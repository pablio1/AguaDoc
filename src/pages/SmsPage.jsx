import { useEffect, useMemo, useState } from 'react';
import { MessageSquareText, RefreshCw, Send, Smartphone } from 'lucide-react';
import PageHeader from '../components/admin/PageHeader';
import SectionCard from '../components/admin/SectionCard';
import EmptyState from '../components/admin/EmptyState';
import { TABLE_BODY_ROW, TABLE_HEAD_ROW } from '../components/admin/tableStyles';
import { showToast } from '../components/ui/Toast';
import { apiGetSmsPendingDeliveries, apiGetSmsStatus, apiSendSms } from '../api';
import { formatMoney } from '../lib/money';

const DEFAULT_TEMPLATE =
  'Hi [Name], your AguaDoc order [Order] is still [Status]. We will deliver to [Address] soon. Thank you!';

const STATUS_PILL = {
  Pending: 'bg-amber-50 text-amber-800',
  Assigned: 'bg-sky-50 text-sky-700',
  Accepted: 'bg-indigo-50 text-indigo-700',
  Processing: 'bg-blue-50 text-blue-700',
  'Out for Delivery': 'bg-violet-50 text-violet-700',
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
    setReloadKey((k) => k + 1);
  }

  const smsReady = useMemo(() => recipients.filter((r) => r.canSms), [recipients]);
  const selectedReady = useMemo(
    () => recipients.filter((r) => selected.has(String(r.orderId)) && r.canSms),
    [recipients, selected]
  );

  const preview = useMemo(() => {
    const sample = selectedReady[0] || smsReady[0] || recipients[0];
    if (!sample) return 'No pending delivery customers to preview.';
    return template
      .replace(/\[Name\]/gi, sample.customerName || 'Customer')
      .replace(/\[Status\]/gi, sample.status || '')
      .replace(/\[Order\]/gi, sample.ref || '')
      .replace(/\[Address\]/gi, sample.address || '');
  }, [template, selectedReady, smsReady, recipients]);

  function toggleOne(orderId, enabled) {
    if (!enabled) return;
    setSelected((prev) => {
      const next = new Set(prev);
      const key = String(orderId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllReady() {
    setSelected(new Set(smsReady.map((r) => String(r.orderId))));
  }

  function clearSelection() {
    setSelected(new Set());
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

    setSending(true);
    setLastResult(null);
    try {
      const result = await apiSendSms({
        orderIds: selectedReady.map((r) => r.orderId),
        message: template.trim(),
      });
      setLastResult(result);
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
        subtitle="Notify customers with pending or not-yet-delivered orders via Semaphore SMS."
      >
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-ink shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || selectedReady.length === 0}
          className="agua-btn agua-btn-primary !py-2 !text-xs disabled:opacity-40"
        >
          <Send size={14} /> {sending ? 'Sending…' : `Send SMS (${selectedReady.length})`}
        </button>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="agua-card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">
            Pending / undelivered
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-ink">{recipients.length}</p>
        </div>
        <div className="agua-card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">
            SMS-ready numbers
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-sky-700">{smsReady.length}</p>
        </div>
        <div className="agua-card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">
            Semaphore
          </p>
          <p className="mt-2 font-display text-lg font-bold text-ink">
            {status.configured ? 'Connected' : 'Not configured'}
          </p>
          <p className="mt-1 text-[11px] text-muted">
            {status.configured
              ? status.account?.creditBalance != null
                ? `Credits: ${status.account.creditBalance}`
                : status.senderName
                  ? `Sender: ${status.senderName}`
                  : 'API key loaded'
              : 'Set SEMAPHORE_API_KEY in backend/.env'}
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <SectionCard
          title="Pending & undelivered customers"
          description="Orders still waiting for delivery (Pending, Assigned, Processing, Out for Delivery, …)"
          action={
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAllReady}
                className="text-[11px] font-semibold text-blue-600 hover:underline"
              >
                Select all ready
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="text-[11px] font-semibold text-slate-400 hover:underline"
              >
                Clear
              </button>
            </div>
          }
          bodyClassName="overflow-x-auto"
        >
          {loading ? (
            <p className="px-5 py-8 text-sm text-muted">Loading recipients…</p>
          ) : recipients.length === 0 ? (
            <EmptyState
              icon={MessageSquareText}
              title="No pending deliveries"
              description="Customers appear here when an order is not yet delivered."
            />
          ) : (
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className={TABLE_HEAD_ROW}>
                  <th className="px-4 py-3 w-10" />
                  <th className="px-3 py-3">Customer</th>
                  <th className="px-3 py-3">Mobile</th>
                  <th className="px-3 py-3">Order</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Total</th>
                  <th className="px-3 py-3">Placed</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((r) => {
                  const checked = selected.has(String(r.orderId));
                  return (
                    <tr key={r.orderId} className={TABLE_BODY_ROW}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!r.canSms}
                          onChange={() => toggleOne(r.orderId, r.canSms)}
                          className="accent-blue-600"
                          title={r.canSms ? 'Include in SMS blast' : 'Missing/invalid mobile number'}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-ink">{r.customerName}</p>
                        <p className="max-w-[220px] truncate text-[11px] text-muted">
                          {r.address || 'No address'}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        {r.canSms ? (
                          <span className="inline-flex items-center gap-1 font-medium text-ink">
                            <Smartphone size={13} className="text-sky-600" />
                            {r.normalizedPhone}
                          </span>
                        ) : (
                          <span className="text-[12px] font-medium text-rose-500">
                            {r.phone || 'No number'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-semibold text-ink">{r.ref || r.orderId}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            STATUS_PILL[r.status] || 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-semibold">{formatMoney(r.total)}</td>
                      <td className="px-3 py-3 text-muted">{formatWhen(r.date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </SectionCard>

        <SectionCard
          title="Compose message"
          description="Tokens: [Name] [Order] [Status] [Address]"
          bodyClassName="space-y-4 px-5 pb-5 pt-2"
        >
          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-ink">SMS template</label>
            <textarea
              rows={5}
              className="agua-input resize-none"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            />
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold text-muted">Preview</p>
            <div className="min-h-[72px] rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-[12.5px] text-ink">
              {preview}
            </div>
          </div>

          {!status.configured && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-800">
              Add <code className="font-semibold">SEMAPHORE_API_KEY</code> (and optional{' '}
              <code className="font-semibold">SEMAPHORE_SENDER_NAME</code>) to{' '}
              <code className="font-semibold">backend/.env</code>, then restart the backend.
            </div>
          )}

          {lastResult && (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[12px]">
              <p className="font-semibold text-ink">
                Last blast: {lastResult.sent} sent · {lastResult.failed} failed
                {lastResult.skipped ? ` · ${lastResult.skipped} skipped` : ''}
              </p>
              {Array.isArray(lastResult.results) && lastResult.results.some((r) => !r.ok) && (
                <ul className="mt-2 space-y-1 text-rose-600">
                  {lastResult.results
                    .filter((r) => !r.ok)
                    .slice(0, 5)
                    .map((r) => (
                      <li key={`${r.orderId}-err`}>
                        {r.customerName}: {r.error}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleSend}
            disabled={sending || selectedReady.length === 0 || !status.configured}
            className="agua-btn agua-btn-primary w-full !py-2.5 !text-xs disabled:opacity-40"
          >
            <Send size={14} />{' '}
            {sending ? 'Sending via Semaphore…' : `Send to ${selectedReady.length} selected`}
          </button>
        </SectionCard>
      </div>
    </div>
  );
}
