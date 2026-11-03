// src/pages/CustomersPage.jsx
// NOTE: This list is for WALK-IN customers who don't have (or won't create) an account.
// Registered app customers aren't added here — their debt tracking can be wired up later
// via apiGetAvailableCustomers() / apiLinkCustomer() in api.js if that's ever needed.
import { useState } from 'react';
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
  const filtered = state.customers.filter(c => {
    if (filter === 'Debtors') return c.balance > 0;
    if (filter === 'Cleared') return c.balance === 0;
    return true;
  });

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
      const balance = orders * PRICE_PER_GALLON;
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
        subtitle="Track customer outstanding balances, settle accounts, and manage walk-in credit."
      >
        <button type="button" onClick={() => setShowAddModal(true)} className="agua-btn agua-btn-primary !py-2 !text-xs">
          New customer
        </button>
      </PageHeader>

      <FilterPills options={['All', 'Debtors', 'Cleared']} value={filter} onChange={setFilter} className="!mb-0" />

      <SectionCard
        title="Active Debt Customers"
        description={`${filtered.length} account${filtered.length === 1 ? '' : 's'} · filter: ${filter}`}
        bodyClassName="max-h-[560px] overflow-auto"
      >
        <table className="w-full min-w-[780px] text-sm">
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
                <td className={`px-3 py-3.5 font-bold ${c.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  ₱{Number(c.balance || 0).toLocaleString()}
                </td>
                <td className="px-3 py-3.5">
                  {c.balance > 0 ? (
                    <span className="inline-flex rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700">
                      Overdue Balance
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
                  {c.balance > 0 && (
                    <button
                      type="button"
                      onClick={() => navigate('/payments')}
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                    >
                      Settle Payment
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openEdit(c)}
                    className={`${c.balance > 0 ? 'ml-3' : ''} text-xs font-semibold text-slate-600 hover:text-ink`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => printAgreement(c)}
                    title="Print the credit agreement for this customer to sign"
                    className="ml-3 text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Agreement
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted">
                  No walk-in customers yet — add one with New customer.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </SectionCard>

      {/* Modal: add new walk-in */}
      {showAddModal && (
        <Modal title="Register new customer" onClose={() => setShowAddModal(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-[12.5px] font-semibold text-gray-600">Full Name</label>
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="agua-input mt-1"
                placeholder="e.g. Juan Dela Cruz"
              />
            </div>
            <div>
              <label className="text-[12.5px] font-semibold text-gray-600">Phone Number</label>
              <input
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                className="agua-input mt-1"
                placeholder="09123456789"
              />
            </div>
            <div>
              <label className="text-[12.5px] font-semibold text-gray-600">Delivery Address</label>
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
              <label className="text-[12.5px] font-semibold text-gray-600">Full Name</label>
              <input
                value={editForm.name}
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                className="agua-input mt-1"
              />
            </div>
            <div>
              <label className="text-[12.5px] font-semibold text-gray-600">Phone Number</label>
              <input
                value={editForm.phone}
                onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                className="agua-input mt-1"
              />
            </div>
            <div>
              <label className="text-[12.5px] font-semibold text-gray-600">Delivery Address</label>
              <input
                value={editForm.addr}
                onChange={e => setEditForm({ ...editForm, addr: e.target.value })}
                className="agua-input mt-1"
              />
            </div>
            <div>
              <label className="text-[12.5px] font-semibold text-gray-600">Orders (gallons on credit)</label>
              <input
                type="number"
                min="0"
                value={editForm.orders}
                onChange={e => setEditForm({ ...editForm, orders: e.target.value })}
                className="agua-input mt-1"
                placeholder="0"
              />
              <p className="text-[11px] text-gray-400 mt-1.5">
                = ₱{(Number(editForm.orders) || 0) * PRICE_PER_GALLON} balance (₱{PRICE_PER_GALLON}/gallon, no delivery fee for walk-ins).
                Recording an actual payment on the Payments page reduces this automatically instead.
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <label className="flex items-start gap-2 text-[12.5px] text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editForm.agreementSigned}
                  onChange={e => setEditForm({ ...editForm, agreementSigned: e.target.checked })}
                  className="mt-0.5 accent-[#0ea5c9]"
                />
                <span>Signed paper agreement received from this customer</span>
              </label>
              {Number(editForm.orders) > 0 && !editForm.agreementSigned && (
                <p className="text-[11px] text-yellow-700 mt-1.5 ml-5">
                  ⚠ This customer has credit but no signed agreement on file. Use "🖨 Agreement" to print one for them to sign.
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
