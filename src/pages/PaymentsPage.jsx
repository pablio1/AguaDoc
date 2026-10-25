// src/pages/PaymentsPage.jsx
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import Modal from '../components/ui/Modal';
import { showToast } from '../components/ui/Toast';
import { apiAddPayment, apiUpdateCustomer } from '../api';

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
    Cash:   'bg-indigo-100 text-indigo-800',
    GCash:  'bg-green-100 text-green-800',
    Online: 'bg-blue-100 text-blue-800',
    Xendit: 'bg-cyan-100 text-cyan-800',
  };

  return (
    <div>
      <div className="agua-card p-4 mb-4">

        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="text-[15px] font-bold">💳 Payment & Billing</div>
            <div className="text-xs text-gray-500 mt-0.5">Record payments and monitor outstanding debts.</div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-accent text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-accent2 transition cursor-pointer"
          >
            + Record Payment
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-green-100 rounded-xl p-3.5 flex items-center gap-3">
            <span className="text-3xl">💰</span>
            <div>
              <div className="text-xs text-green-700 font-semibold">Total Collected</div>
              <div className="text-[22px] font-black text-green-800">₱{totalCollected.toFixed(2)}</div>
              <div className="text-xs text-green-700">{state.payments.length} transactions</div>
            </div>
          </div>
          <div className="bg-red-100 rounded-xl p-3.5 flex items-center gap-3">
            <span className="text-3xl">🛡</span>
            <div>
              <div className="text-xs text-red-700 font-semibold">Total Outstanding Debt</div>
              <div className="text-[22px] font-black text-red-800">₱{totalDebt.toFixed(2)}</div>
              <div className="text-xs text-red-700">{debtorCount} customers with debt</div>
            </div>
          </div>
        </div>

        {/* Two columns: Unpaid + History */}
        <div className="grid grid-cols-2 gap-4">

          {/* Unpaid Balances */}
          <div>
            <div className="text-[11.5px] font-bold text-gray-500 uppercase tracking-wide mb-2.5">
              Unpaid Balances
            </div>
            {unpaidCustomers.length === 0 ? (
              <div className="text-center text-gray-400 text-xs py-4">No unpaid balances 🎉</div>
            ) : (
              <div className="max-h-[360px] overflow-y-auto pr-1">
              {unpaidCustomers.map(c => (
                <div key={c.id} className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2.5 mb-2">
                  <div>
                    <div className="text-[13.5px] font-semibold">{c.fullName}</div>
                    <div className="text-[11.5px] text-gray-500">{c.phone}</div>
                  </div>
                  <div className="text-base font-black text-red-600">₱{c.balance}</div>
                </div>
              ))}
              </div>
            )}
          </div>

          {/* Payment History */}
          <div>
            <div className="flex justify-between items-center mb-2.5">
              <div className="text-[11.5px] font-bold text-gray-500 uppercase tracking-wide">
                Payment History
              </div>
              <span className="text-accent text-[11px]">{state.payments.length} records</span>
            </div>
            <div className="max-h-[360px] overflow-y-auto border border-gray-100 rounded-lg">
            <table className="w-full text-[13px] border-collapse">
              <thead className="sticky top-0 bg-white z-10">
                <tr>
                  {['Customer', 'Method', 'Amount', 'Date', ''].map((h, i) => (
                    <th key={i} className="text-left px-2 py-1.5 text-[11.5px] font-semibold text-gray-500 border-b-2 border-gray-100">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
            {paymentHistory.map(p => {
               const customer =
               (state.customers || []).find(c => String(c.id) === String(p.custId)) ||
               (state.users     || []).find(u => String(u.id) === String(p.custId));
               const custName = customer?.fullName ?? '?';
            return (
               <tr key={p.id} className="hover:bg-gray-50 border-b border-gray-100 last:border-b-0">
                <td className="px-2 py-2.5 font-medium">{custName}</td>
                 <td className="px-2 py-2.5">
                   <span className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-semibold ${methodBadge[p.method]}`}>
                   {p.method}
                   </span>
                 </td>
                     <td className="px-2 py-2.5 font-bold text-green-600">+₱{parseFloat(p.amount).toFixed(2)}</td>
                       <td className="px-2 py-2.5 text-gray-500">{p.date}</td>
                         <td className="px-2 py-2.5">
                           <button
                             onClick={() => showToast(`🧾 Receipt: ₱${parseFloat(p.amount).toFixed(2)} - ${p.method}`)}
                             className="border border-gray-200 rounded w-7 h-7 flex items-center justify-center text-[13px] hover:bg-gray-50 cursor-pointer"
                               >
                              🧾
                            </button>
                         </td>
                       </tr>
                    );
                })}
              </tbody>
            </table>
            </div>
          </div>

        </div>
      </div>

      {/* ── Record Payment Modal ── */}
      {showModal && (
        <Modal title="💳 Record New Payment" onClose={() => setShowModal(false)}>
          <div className="mb-3">
            <label className="block text-[12.5px] font-semibold mb-1">Select Customer</label>
            <select
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] outline-none focus:border-accent"
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
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] outline-none focus:border-accent"
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
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] outline-none focus:border-accent"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-[12.5px] font-semibold hover:bg-gray-50 cursor-pointer">
              Cancel
            </button>
            <button onClick={handleRecordPayment} className="px-4 py-2 bg-green-600 text-white rounded-lg text-[12.5px] font-semibold hover:bg-green-700 cursor-pointer">
              ✅ Confirm Payment
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
