// src/pages/CustomersPage.jsx
// NOTE: This list is for WALK-IN customers who don't have (or won't create) an account.
// Registered app customers aren't added here — their debt tracking can be wired up later
// via apiGetAvailableCustomers() / apiLinkCustomer() in api.js if that's ever needed.
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import Modal from '../components/ui/Modal';
import { showToast } from '../components/ui/Toast';
import { apiAddCustomer, apiUpdateCustomer } from '../api';
import { printAgreement } from '../components/TermsContent';

const PRICE_PER_GALLON = 40; // walk-ins pick up in person — no delivery fee added

export default function CustomersPage() {
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
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">👥 Customers & Debt</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-accent text-white px-4 py-2 rounded-lg text-[12.5px] font-semibold hover:bg-accent2 transition"
        >
          + New Customer
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-3">
        {['All', 'Debtors', 'Cleared'].map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition cursor-pointer
              ${filter === tab
                ? 'bg-accent text-white border-accent'
                : 'bg-white text-gray-500 border-gray-200 hover:border-accent hover:text-accent'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="agua-card max-h-[520px] overflow-y-auto">
        <table className="w-full text-[13px] border-collapse">
          <thead className="sticky top-0 bg-white z-10">
            <tr>
              {['Name', 'Phone', 'Address', 'Balance', 'Orders', 'Agreement', 'Actions'].map(h => (
                <th key={h} className="text-left px-3 py-2.5 text-[11.5px] font-semibold text-gray-500 border-b-2 border-gray-200">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 border-b border-gray-100 last:border-b-0">
                <td className="px-3 py-2.5 font-medium">{c.fullName}</td>
                <td className="px-3 py-2.5 text-gray-500">{c.phone}</td>
                <td className="px-3 py-2.5 text-gray-500">{c.address}</td>
                <td className={`px-3 py-2.5 font-bold ${c.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ₱{c.balance}
                </td>
                <td className="px-3 py-2.5 text-gray-500">{c.orders}</td>
                <td className="px-3 py-2.5">
                  {c.agreementSignedAt ? (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-semibold bg-green-100 text-green-800 whitespace-nowrap">
                      ✔ Signed
                    </span>
                  ) : (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-semibold bg-yellow-100 text-yellow-800 whitespace-nowrap">
                      ⚠ Not signed
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <button
                    onClick={() => openEdit(c)}
                    className="border border-gray-200 rounded px-2 py-1 text-xs hover:bg-gray-50"
                  >
                    ✏ Edit
                  </button>
                  <button
                    onClick={() => printAgreement(c)}
                    title="Print the credit agreement for this customer to sign"
                    className="border border-gray-200 rounded px-2 py-1 text-xs hover:bg-gray-50 ml-1.5"
                  >
                    🖨 Agreement
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                  No walk-in customers yet — click "+ New Customer" to add one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: add new walk-in */}
      {showAddModal && (
        <Modal title="👤 Register New Customer" onClose={() => setShowAddModal(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-[12.5px] font-semibold text-gray-600">Full Name</label>
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] mt-1"
                placeholder="e.g. Juan Dela Cruz"
              />
            </div>
            <div>
              <label className="text-[12.5px] font-semibold text-gray-600">Phone Number</label>
              <input
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] mt-1"
                placeholder="09123456789"
              />
            </div>
            <div>
              <label className="text-[12.5px] font-semibold text-gray-600">Delivery Address</label>
              <input
                value={form.addr}
                onChange={e => setForm({ ...form, addr: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] mt-1"
                placeholder="e.g. Liloan, Cebu"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-5">
            <button
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-[12.5px] font-semibold hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAddCustomer}
              disabled={saving}
              className="px-4 py-2 bg-accent text-white rounded-lg text-[12.5px] font-semibold hover:bg-accent2 disabled:opacity-50"
            >
              {saving ? 'Saving...' : '💾 Save Customer'}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal: edit existing customer, including balance */}
      {editingCustomer && (
        <Modal title={`✏ Edit ${editingCustomer.fullName}`} onClose={() => setEditingCustomer(null)}>
          <div className="space-y-3">
            <div>
              <label className="text-[12.5px] font-semibold text-gray-600">Full Name</label>
              <input
                value={editForm.name}
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] mt-1"
              />
            </div>
            <div>
              <label className="text-[12.5px] font-semibold text-gray-600">Phone Number</label>
              <input
                value={editForm.phone}
                onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] mt-1"
              />
            </div>
            <div>
              <label className="text-[12.5px] font-semibold text-gray-600">Delivery Address</label>
              <input
                value={editForm.addr}
                onChange={e => setEditForm({ ...editForm, addr: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] mt-1"
              />
            </div>
            <div>
              <label className="text-[12.5px] font-semibold text-gray-600">Orders (gallons on credit)</label>
              <input
                type="number"
                min="0"
                value={editForm.orders}
                onChange={e => setEditForm({ ...editForm, orders: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] mt-1"
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
              onClick={() => setEditingCustomer(null)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-[12.5px] font-semibold hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={saving}
              className="px-4 py-2 bg-accent text-white rounded-lg text-[12.5px] font-semibold hover:bg-accent2 disabled:opacity-50"
            >
              {saving ? 'Saving...' : '💾 Save Changes'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
