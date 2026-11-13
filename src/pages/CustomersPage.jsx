// src/pages/CustomersPage.jsx
// NOTE: This list is for WALK-IN customers who don't have (or won't create) an account.
// Registered app customers aren't added here — their debt tracking can be wired up later
// via apiGetAvailableCustomers() / apiLinkCustomer() in api.js if that's ever needed.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Modal from '../components/ui/Modal';
import { showToast } from '../components/ui/Toast';
import { apiAddCustomer, apiUpdateCustomer } from '../api';
import { printAgreement } from '../components/TermsContent';
import PageHeader from '../components/admin/PageHeader';
import SectionCard from '../components/admin/SectionCard';
import FilterPills from '../components/admin/FilterPills';
import { TABLE_BODY_ROW, TABLE_HEAD_ROW } from '../components/admin/tableStyles';
import EmptyState from '../components/admin/EmptyState';
import { Users, Send, MessageCircle } from 'lucide-react';
import { formatMoney, roundMoney, sumMoney } from '../lib/money';

const PRICE_PER_GALLON = 40; // walk-ins pick up in person — no delivery fee added

export default function CustomersPage() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const [showAddModal, setShowAddModal]   = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null); // customer object being edited, or null
  const [filter, setFilter]               = useState('All');
  const [saving, setSaving]               = useState(false);
  const [form, setForm]                   = useState({ name: '', phone: '', addr: '' });
  const [editForm, setEditForm]           = useState({ name: '', phone: '', addr: '', orders: '', agreementSigned: false });

  // Replaces filterCustomers()
  const totalDebt = sumMoney(state.customers, 'balance');
  const debtorCount = state.customers.filter((c) => Number(c.balance) > 0).length;

  const filtered = state.customers.filter(c => {
    if (filter === 'Debtors') return c.balance > 0;
    if (filter === 'Cleared') return c.balance === 0;
    return true;
  });

  const settlementHistory = useMemo(() => {
    return [...(state.payments || [])]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 20)
      .map((p) => {
        const customer = state.customers.find((c) => String(c.id) === String(p.custId));
        return { ...p, customerName: customer?.fullName || '—' };
      });
  }, [state.payments, state.customers]);

  function handleSmsReminders() {
    navigate('/sms');
  }

  // Persists a new walk-in customer, then reflects the confirmed row locally.
  async function handleAddCustomer() {
    if (!form.name || !form.phone || !form.addr) return alert('Please fill all fields.');
    setSaving(true);
    try {
      const saved = await apiAddCustomer({
        fullName: form.name,
        email: null,
        phone: form.phone,
        address: form.addr,
        balance: 0,
      });
      dispatch({ type: 'ADD_CUSTOMER', payload: saved });
      showToast(`✅ ${form.name} added!`);
      setForm({ name: '', phone: '', addr: '' });
      setShowAddModal(false);
    } catch (err) {
      showToast(`❌ ${err.message || 'Failed to save customer.'}`);
    } finally {
      setSaving(false);
    }
  }

  function openEdit(c) {
    setEditingCustomer(c);
    setEditForm({
      name: c.fullName ?? '',
      phone: c.phone ?? '',
      addr: c.address ?? '',
      orders: c.orders ?? 0,
      agreementSigned: !!c.agreementSignedAt,
    });
  }

  // Saves name/phone/address/orders — the balance is always derived from gallons taken on
  // credit (orders × ₱40), never typed in directly, so it can't drift out of sync.
  async function handleSaveEdit() {
    if (!editForm.name || !editForm.phone || !editForm.addr) return alert('Please fill all fields.');
    if (editForm.orders === '' || isNaN(editForm.orders) || Number(editForm.orders) < 0) {
      return alert('Orders (gallons) must be a valid number, 0 or more.');
    }
    setSaving(true);
    try {
      const orders  = Number(editForm.orders);
      const balance = roundMoney(orders * PRICE_PER_GALLON);
      const updated = await apiUpdateCustomer(editingCustomer.id, {
        fullName: editForm.name,
        email: editingCustomer.email || null,
        phone: editForm.phone,
        address: editForm.addr,
        balance,
        orders,
        agreementSigned: editForm.agreementSigned,
      });
      dispatch({ type: 'UPDATE_CUSTOMER', payload: updated });
      showToast(`✅ ${editForm.name} updated!`);
      setEditingCustomer(null);
    } catch (err) {
      showToast(`❌ ${err.message || 'Failed to update customer.'}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Debt Management (Utang Tracker)"
        subtitle="Track customer outstanding balances, send SMS payment reminders, and settle accounts."
      >
        <button
          type="button"
          onClick={handleSmsReminders}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-ink shadow-sm hover:bg-slate-50"
        >
          <Send size={14} /> Send SMS Reminders
        </button>
        <button type="button" onClick={() => setShowAddModal(true)} className="agua-btn agua-btn-primary !py-2 !text-xs">
          New customer
        </button>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="agua-card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">Walk-in accounts</p>
          <p className="mt-2 font-display text-2xl font-bold text-ink">{state.customers.length}</p>
        </div>
        <div className="agua-card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">With balance</p>
          <p className="mt-2 font-display text-2xl font-bold text-amber-700">{debtorCount}</p>
        </div>
        <div className="agua-card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">Total outstanding</p>
          <p className="mt-2 font-display text-2xl font-bold text-red-600">{formatMoney(totalDebt)}</p>
        </div>
      </div>

      <FilterPills options={['All', 'Debtors', 'Cleared']} value={filter} onChange={setFilter} className="!mb-0" />

      <SectionCard
        title="Active Debt Customers"
        bodyClassName="max-h-[480px] overflow-x-auto overflow-y-auto"
      >
        <table className="w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className={TABLE_HEAD_ROW}>
              {['Customer Name', 'Contact Number', 'Total Outstanding Balance', 'Status', 'Agreement', 'Actions'].map((h) => (
                <th key={h} className={`px-3 py-3 ${h === 'Customer Name' ? 'pl-5' : ''} ${h === 'Actions' ? 'pr-5 text-right' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className={TABLE_BODY_ROW}>
                <td className="px-5 py-3.5">
                  <p className="font-semibold text-ink">{c.fullName}</p>
                  <p className="mt-0.5 max-w-[200px] truncate text-[11px] text-muted">{c.address}</p>
                </td>
                <td className="px-3 py-3.5 text-muted">{c.phone}</td>
                <td className={`px-3 py-3.5 font-bold ${Number(c.balance) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {formatMoney(c.balance)}
                </td>
                <td className="px-3 py-3.5">
                  {c.balance > 0 ? (
                    <span className="inline-flex rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700">
                      Walk-in Balance (Utang)
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                      Cleared
                    </span>
                  )}
                </td>
                <td className="px-3 py-3.5">
                  {c.agreementSignedAt ? (
                    <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                      Signed
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                      Not signed
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-5 py-3.5 text-right">
                  <div className="inline-flex items-center justify-end gap-2">
                    {c.balance > 0 && (
                      <button
                        type="button"
                        onClick={() => navigate('/payments')}
                        className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                      >
                        Settle Payment
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEdit(c)}
                      className="text-[11px] font-semibold text-slate-500 hover:text-ink"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => printAgreement(c)}
                      title="Print the credit agreement for this customer to sign"
                      className="rounded-lg p-1 text-blue-600 hover:bg-blue-50"
                    >
                      <MessageCircle size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon={Users}
                    title={filter === 'All' ? 'No walk-in customers yet' : 'No matches for this filter'}
                    description={
                      filter === 'All'
                        ? 'Add a walk-in account to track credit and outstanding balances.'
                        : 'Try another filter or add a new customer.'
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title="Debt Payment Settlement History" bodyClassName="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className={TABLE_HEAD_ROW}>
              <th className="px-5 py-3">Date Settled</th>
              <th className="px-3 py-3">Customer Name</th>
              <th className="px-3 py-3">Amount Paid</th>
              <th className="px-3 py-3">Payment Method</th>
              <th className="px-5 py-3">Reference Number</th>
            </tr>
          </thead>
          <tbody>
            {settlementHistory.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    icon={Users}
                    title="No settlements recorded"
                    description="Payments logged on Payments & Billing appear here."
                  />
                </td>
              </tr>
            ) : (
              settlementHistory.map((p) => (
                <tr key={p.id} className={TABLE_BODY_ROW}>
                  <td className="whitespace-nowrap px-5 py-3.5 text-muted">
                    {p.date
                      ? new Date(p.date).toLocaleString('en-PH', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </td>
                  <td className="px-3 py-3.5 font-semibold text-ink">{p.customerName}</td>
                  <td className="px-3 py-3.5 font-bold text-emerald-600">{formatMoney(p.amount)}</td>
                  <td className="px-3 py-3.5 text-muted">{p.method || 'Cash'}</td>
                  <td className="px-5 py-3.5 text-xs font-medium text-violet-600">
                    {p.orderId ? `ORD-${String(p.orderId).slice(-6)}` : 'N/A'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </SectionCard>

      {/* Modal: add new walk-in */}
      {showAddModal && (
        <Modal title="Register new customer" onClose={() => setShowAddModal(false)}>
          <div className="space-y-3">
            <div>
              <label className="agua-label">Full Name</label>
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="agua-input mt-1"
                placeholder="e.g. Juan Dela Cruz"
              />
            </div>
            <div>
              <label className="agua-label">Phone Number</label>
              <input
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                className="agua-input mt-1"
                placeholder="09123456789"
              />
            </div>
            <div>
              <label className="agua-label">Delivery Address</label>
              <input
                value={form.addr}
                onChange={e => setForm({ ...form, addr: e.target.value })}
                className="agua-input mt-1"
                placeholder="e.g. Liloan, Cebu"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-5">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[12.5px] font-semibold text-ink hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddCustomer}
              disabled={saving}
              className="agua-btn agua-btn-primary !py-2 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save customer'}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal: edit existing customer, including balance */}
      {editingCustomer && (
        <Modal title={`Edit ${editingCustomer.fullName}`} onClose={() => setEditingCustomer(null)}>
          <div className="space-y-3">
            <div>
              <label className="agua-label">Full Name</label>
              <input
                value={editForm.name}
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                className="agua-input mt-1"
              />
            </div>
            <div>
              <label className="agua-label">Phone Number</label>
              <input
                value={editForm.phone}
                onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                className="agua-input mt-1"
              />
            </div>
            <div>
              <label className="agua-label">Delivery Address</label>
              <input
                value={editForm.addr}
                onChange={e => setEditForm({ ...editForm, addr: e.target.value })}
                className="agua-input mt-1"
              />
            </div>
            <div>
              <label className="agua-label">Orders (gallons on credit)</label>
              <input
                type="number"
                min="0"
                value={editForm.orders}
                onChange={e => setEditForm({ ...editForm, orders: e.target.value })}
                className="agua-input mt-1"
                placeholder="0"
              />
              <p className="mt-1.5 text-[11px] text-muted">
                = {formatMoney((Number(editForm.orders) || 0) * PRICE_PER_GALLON)} balance ({formatMoney(PRICE_PER_GALLON)}/gallon).
                Payments & Billing reduces both this gallon count and the balance when you record a collection.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
              <label className="flex cursor-pointer items-start gap-2 text-[12.5px] text-ink">
                <input
                  type="checkbox"
                  checked={editForm.agreementSigned}
                  onChange={e => setEditForm({ ...editForm, agreementSigned: e.target.checked })}
                  className="mt-0.5 accent-blue-500"
                />
                <span>Signed paper agreement received from this customer</span>
              </label>
              {Number(editForm.orders) > 0 && !editForm.agreementSigned && (
                <p className="ml-5 mt-1.5 text-[11px] font-medium text-amber-700">
                  This customer has credit but no signed agreement on file. Use Agreement to print one for them to sign.
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-5">
            <button
              type="button"
              onClick={() => setEditingCustomer(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[12.5px] font-semibold text-ink hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={saving}
              className="agua-btn agua-btn-primary !py-2 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
