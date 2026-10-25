// src/pages/NotificationsPage.jsx
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { showToast } from '../components/ui/Toast';
import { apiMarkNotificationRead, apiMarkAllNotificationsRead } from '../api';

const TABS = ['all', 'unread'];

const DOT_STYLE = {
  Order:     'bg-blue-500',
  Payment:   'bg-green-500',
  Debt:      'bg-red-500',
  Inventory: 'bg-orange-500',
  System:    'bg-gray-400',
};
const BADGE_STYLE = {
  Order:     'bg-blue-100 text-blue-800',
  Payment:   'bg-green-100 text-green-800',
  Debt:      'bg-red-100 text-red-800',
  Inventory: 'bg-orange-100 text-orange-800',
  System:    'bg-gray-100 text-gray-700',
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
    ? smsTemplate.replace('[Name]', firstDebtor.fullName).replace('[Amount]', '₱' + firstDebtor.balance)
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
    <div>
      <div className="agua-card p-4">

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-[15px] font-bold flex items-center gap-2">
              🔔 Notifications & SMS Center
              {unread > 0 && (
                <span className="bg-red-100 text-red-800 text-[11px] font-semibold px-2 py-0.5 rounded-full">{unread}</span>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              Automatic alerts for new orders, order status changes, payments, and low stock or high debt risk.
            </div>
          </div>
          <button
            onClick={handleMarkAllRead}
            disabled={unread === 0}
            className="bg-accent hover:bg-accent2 disabled:opacity-40 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer"
          >
            ✔ Mark All Read
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">

          {/* Left: Notification List */}
          <div>
            {/* Tabs */}
            <div className="flex border-b-2 border-gray-200 mb-3">
              {TABS.map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-1.5 text-[13px] font-medium cursor-pointer border-b-2 -mb-0.5 transition capitalize
                    ${tab === t ? 'text-accent border-accent' : 'text-gray-500 border-transparent hover:text-accent'}`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Notification Rows */}
            <div className="max-h-[420px] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="text-center text-gray-400 text-xs py-6">No notifications.</div>
              ) : filtered.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleMarkRead(n)}
                  className={`flex gap-2.5 p-2.5 rounded-lg mb-1.5 cursor-pointer border transition hover:bg-gray-50
                    ${n.read ? 'border-transparent' : 'bg-blue-50 border-blue-200'}`}
                >
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${DOT_STYLE[n.type] || DOT_STYLE.System}`} />
                  <div className="flex-1">
                    <div className="text-[13px]">{n.message}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[11px] text-gray-400">{timeAgo(n.createdAt)}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${BADGE_STYLE[n.type] || BADGE_STYLE.System}`}>
                        {n.type}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: SMS Panel (preview only — no real SMS gateway wired up yet) */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-[13px] font-bold mb-1">📱 SMS Blast Campaign</div>
            <div className="text-xs text-gray-500 mb-3">Preview a reminder message for customers with outstanding balances.</div>

            <div className="text-[11.5px] font-bold text-gray-500 uppercase tracking-wide mb-2">Overdue Debtors</div>
            {debtors.length === 0 ? (
              <div className="text-xs text-gray-400 py-2">No debtors 🎉</div>
            ) : debtors.map(c => (
              <div key={c.id} className="flex justify-between items-center py-1.5 text-[13px] border-b border-gray-200 last:border-b-0">
                <span>{c.fullName}</span>
                <span className="text-red-600 font-bold">₱{c.balance}</span>
              </div>
            ))}

            <div className="mt-3">
              <label className="block text-[12.5px] font-semibold mb-1">Message Template</label>
              <textarea
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] outline-none focus:border-accent resize-none bg-white"
                value={smsTemplate}
                onChange={e => setSmsTemplate(e.target.value)}
              />
            </div>

            <div className="text-xs font-semibold text-gray-500 mt-2 mb-1">Preview</div>
            <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-[12.5px] text-gray-500 min-h-[50px]">
              {smsPreview}
            </div>
            <button
              disabled
              title="Not connected to a real SMS gateway yet"
              className="mt-2 w-full bg-gray-300 text-white text-xs font-semibold py-2 rounded-lg cursor-not-allowed"
            >
              📤 Send SMS Blast (not connected)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
