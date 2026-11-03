// src/pages/NotificationsPage.jsx
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { showToast } from '../components/ui/Toast';
import { apiMarkNotificationRead, apiMarkAllNotificationsRead } from '../api';
import PageHeader from '../components/admin/PageHeader';
import SectionCard from '../components/admin/SectionCard';
import EmptyState from '../components/admin/EmptyState';
import { Bell } from 'lucide-react';
import { formatMoney } from '../lib/money';

const TABS = ['all', 'unread'];

const DOT_STYLE = {
  Order:     'bg-blue-500',
  Payment:   'bg-green-500',
  Debt:      'bg-red-500',
  Inventory: 'bg-orange-500',
  System:    'bg-gray-400',
};
const BADGE_STYLE = {
  Order: 'bg-blue-50 text-blue-700',
  Payment: 'bg-emerald-50 text-emerald-700',
  Debt: 'bg-red-50 text-red-700',
  Inventory: 'bg-amber-50 text-amber-800',
  System: 'bg-slate-100 text-slate-600',
};

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationsPage() {
  const { state, dispatch } = useApp();
  const [tab, setTab] = useState('all');

  const filtered = state.notifications.filter(n => tab === 'unread' ? !n.read : true);
  const unread   = state.notifications.filter(n => !n.read).length;
  const debtors  = state.customers.filter(c => c.balance > 0);

  // These are just previewed here — actually sending requires a real SMS gateway (not wired up).
  const [smsTemplate, setSmsTemplate] = useState(
    'Hi [Name], your AguaDoc balance of [Amount] is overdue. Please settle to continue service. Thank you!'
  );
  const firstDebtor = debtors[0];
  const smsPreview  = firstDebtor
    ? smsTemplate.replace('[Name]', firstDebtor.fullName).replace('[Amount]', formatMoney(firstDebtor.balance))
    : 'No customers with balance.';

  async function handleMarkRead(n) {
    if (n.read) return;
    dispatch({ type: 'MARK_NOTIFICATION_READ', id: n.id }); // instant feedback
    try {
      await apiMarkNotificationRead(n.id);
    } catch {
      showToast('❌ Could not update — will retry on next refresh.');
    }
  }

  async function handleMarkAllRead() {
    dispatch({ type: 'MARK_ALL_NOTIFICATIONS_READ' }); // instant feedback
    try {
      await apiMarkAllNotificationsRead('admin');
      showToast('✅ All notifications read.');
    } catch {
      showToast('❌ Could not update — will retry on next refresh.');
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        subtitle={
          <>
            Alerts for orders, payments, debt, and inventory.
            {unread > 0 && (
              <span className="ml-2 inline-flex rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                {unread} unread
              </span>
            )}
          </>
        }
      >
        <button
          type="button"
          onClick={handleMarkAllRead}
          disabled={unread === 0}
          className="agua-btn agua-btn-primary !py-2 !text-xs disabled:opacity-40"
        >
          Mark all read
        </button>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Inbox"
          description="Click a row to mark as read"
          action={
            <div className="flex rounded-lg border border-slate-200 p-0.5">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`cursor-pointer rounded-md px-3 py-1 text-xs font-semibold capitalize transition ${
                    tab === t ? 'bg-blue-500 text-white' : 'text-muted hover:text-ink'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          }
          bodyClassName="max-h-[460px] overflow-y-auto px-3 pb-3 pt-1"
        >
          {filtered.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={tab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
              description={
                tab === 'unread'
                  ? 'You are caught up. Switch to All to browse past alerts.'
                  : 'Order, payment, and inventory alerts will show up here.'
              }
            />
          ) : (
            filtered.map((n) => (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                onClick={() => handleMarkRead(n)}
                onKeyDown={(e) => e.key === 'Enter' && handleMarkRead(n)}
                className={`mb-2 flex cursor-pointer gap-2.5 rounded-xl border px-3 py-2.5 transition hover:bg-slate-50/80 ${
                  n.read ? 'border-transparent' : 'border-blue-100 bg-blue-50/50'
                }`}
              >
                <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_STYLE[n.type] || DOT_STYLE.System}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-ink">{n.message}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[11px] text-muted">{timeAgo(n.createdAt)}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${BADGE_STYLE[n.type] || BADGE_STYLE.System}`}
                    >
                      {n.type}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </SectionCard>

        <SectionCard title="SMS reminders" description="Preview only — no gateway connected yet" bodyClassName="px-5 pb-5 pt-2">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">Overdue debtors</p>
          {debtors.length === 0 ? (
            <p className="text-sm text-muted">No customers with balance.</p>
          ) : (
            <ul className="mb-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
              {debtors.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                  <span className="font-medium text-ink">{c.fullName}</span>
                  <span className="font-bold text-red-600">{formatMoney(c.balance)}</span>
                </li>
              ))}
            </ul>
          )}

          <label className="mb-1 block text-[12.5px] font-semibold text-ink">Message template</label>
          <textarea
            rows={3}
            className="agua-input resize-none"
            value={smsTemplate}
            onChange={(e) => setSmsTemplate(e.target.value)}
          />

          <p className="mb-1 mt-3 text-xs font-semibold text-muted">Preview</p>
          <div className="min-h-[50px] rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-[12.5px] text-muted">
            {smsPreview}
          </div>
          <button
            type="button"
            disabled
            title="Not connected to a real SMS gateway yet"
            className="mt-3 w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 py-2.5 text-xs font-semibold text-slate-400"
          >
            Send SMS blast (not connected)
          </button>
        </SectionCard>
      </div>
    </div>
  );
}
