// src/pages/PaymentsPage.jsx
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import Modal from '../components/ui/Modal';
import { showToast } from '../components/ui/Toast';
import { apiAddPayment, apiUpdateCustomer } from '../api';
import PageHeader from '../components/admin/PageHeader';
import SectionCard from '../components/admin/SectionCard';
import { TABLE_BODY_ROW, TABLE_HEAD_ROW } from '../components/admin/tableStyles';

export default function PaymentsPage() {
  const { state, dispatch } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ custId: '', method: 'Cash', amount: '' });

  // ── Summary calculations ──
const totalCollected = state.payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
const totalDebt      = state.customers.reduce((sum, c) => sum + (parseFloat(c.balance) || 0), 0);
const debtorCount    = state.customers.filter(c => parseFloat(c.balance) > 0).length;

  // ── Unpaid customers sorted by balance ──
  const unpaidCustomers = [...state.customers]
    .filter(c => c.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  // ── Payment history newest first ──
  const paymentHistory = [...state.payments].reverse();

  // ── Record payment (replaces recordPayment) — now persists, and actually reduces the customer's balance. ──
  async function handleRecordPayment() {
    if (!form.custId || !form.amount || parseInt(form.amount) <= 0) {
      showToast('⚠ Select a customer and enter a valid amount.');
      return;
    }
    const customer = state.customers.find(c => String(c.id) === String(form.custId));
    const amount   = parseInt(form.amount);

    try {
      const savedPayment = await apiAddPayment({
        custId: form.custId,
        orderId: null,
        amount,
        method: form.method,
      });
      dispatch({ type: 'ADD_PAYMENT', payload: savedPayment });

      // Apply the payment against the customer's outstanding balance (never below 0).
      if (customer) {
        const newBalance = Math.max(0, (parseFloat(customer.balance) || 0) - amount);
        const updatedCustomer = await apiUpdateCustomer(customer.id, { ...customer, balance: newBalance });
        dispatch({ type: 'UPDATE_CUSTOMER', payload: updatedCustomer });
      }

      // A "Payment received" notification is created automatically on the backend
      // (only reaches the customer's own dashboard if this customer has a linked account).
      showToast(`✅ Payment of ₱${amount} recorded!`);
      setForm({ custId: '', method: 'Cash', amount: '' });
      setShowModal(false);
    } catch {
      showToast('❌ Failed to save payment.');
    }
  }

  // ── Payment method badge color ──
  const methodBadge = {
    Cash: 'bg-slate-100 text-slate-700',
    GCash: 'bg-emerald-50 text-emerald-700',
    Online: 'bg-blue-50 text-blue-700',
    Xendit: 'bg-sky-50 text-sky-700',
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payments & Billing"
        subtitle="Record collections, settle outstanding balances, and review payment history."
      >
        <button type="button" onClick={() => setShowModal(true)} className="agua-btn agua-btn-primary !py-2 !text-xs">
          Record payment
        </button>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="agua-card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">Total collected</p>
          <p className="mt-2 font-display text-2xl font-bold text-emerald-600">₱{totalCollected.toFixed(2)}</p>
          <p className="mt-1 text-xs text-muted">{state.payments.length} transactions logged</p>
        </div>
        <div className="agua-card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">Outstanding debt</p>
          <p className="mt-2 font-display text-2xl font-bold text-red-600">₱{totalDebt.toFixed(2)}</p>
          <p className="mt-1 text-xs text-muted">{debtorCount} customer{debtorCount === 1 ? '' : 's'} with balance</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Unpaid balances"
          description="Sorted by highest balance first"
          bodyClassName="max-h-[400px] overflow-auto"
        >
          {unpaidCustomers.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">No outstanding balances.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className={TABLE_HEAD_ROW}>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-3 py-3">Phone</th>
                  <th className="px-5 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {unpaidCustomers.map((c) => (
                  <tr key={c.id} className={TABLE_BODY_ROW}>
                    <td className="px-5 py-3.5 font-semibold text-ink">{c.fullName}</td>
                    <td className="px-3 py-3.5 text-muted">{c.phone}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-red-600">₱{c.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        <SectionCard
          title="Debt Payment Settlement History"
          description={`${state.payments.length} settlement${state.payments.length === 1 ? '' : 's'} recorded`}
          bodyClassName="max-h-[400px] overflow-auto"
        >
          <table className="w-full min-w-[520px] text-sm">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className={TABLE_HEAD_ROW}>
                {['Date Settled', 'Customer Name', 'Amount Paid', 'Payment Method', 'Reference'].map((h, i) => (
                  <th key={h} className={`px-3 py-3 ${i === 0 ? 'pl-5' : ''} ${i === 4 ? 'pr-5' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paymentHistory.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-muted">
                    No settlements yet — record a payment to start the history.
                  </td>
                </tr>
              ) : (
                paymentHistory.map((p) => {
                  const customer =
                    (state.customers || []).find((c) => String(c.id) === String(p.custId)) ||
                    (state.users || []).find((u) => String(u.id) === String(p.custId));
                  const custName = customer?.fullName ?? '—';
                  return (
                    <tr key={p.id} className={TABLE_BODY_ROW}>
                      <td className="whitespace-nowrap px-5 py-3.5 text-muted">{p.date || '—'}</td>
                      <td className="px-3 py-3.5 font-semibold text-ink">{custName}</td>
                      <td className="px-3 py-3.5 font-bold text-emerald-600">₱{parseFloat(p.amount).toFixed(2)}</td>
                      <td className="px-3 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${methodBadge[p.method] || 'bg-slate-100 text-slate-600'}`}
                        >
                          {p.method}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-medium text-blue-600">
                        {p.orderId || p.ref || p.reference || 'N/A'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </SectionCard>
      </div>

      {/* ── Record Payment Modal ── */}
      {showModal && (
        <Modal title="Record new payment" onClose={() => setShowModal(false)}>
          <div className="mb-3">
            <label className="block text-[12.5px] font-semibold mb-1">Select Customer</label>
            <select
              className="agua-input"
              value={form.custId}
              onChange={e => setForm({ ...form, custId: e.target.value })}
            >
              <option value="">-- Select Customer --</option>
              {state.customers.map(c => (
                <option key={c.id} value={c.id}>{c.fullName}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2.5 mb-3">
            <div>
              <label className="block text-[12.5px] font-semibold mb-1">Payment Method</label>
              <select
                className="agua-input"
                value={form.method}
                onChange={e => setForm({ ...form, method: e.target.value })}
              >
                <option>Cash</option>
                <option>GCash</option>
                <option>Online</option>
              </select>
            </div>
            <div>
              <label className="block text-[12.5px] font-semibold mb-1">Amount Paid (₱)</label>
              <input
                type="number" min="1" placeholder="0"
                className="agua-input"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[12.5px] font-semibold text-ink hover:bg-slate-50"
            >
              Cancel
            </button>
            <button type="button" onClick={handleRecordPayment} className="agua-btn agua-btn-primary !py-2">
              Confirm payment
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
