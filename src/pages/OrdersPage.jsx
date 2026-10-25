// src/pages/OrdersPage.jsx
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import Modal from '../components/ui/Modal';
import { showToast } from '../components/ui/Toast';
import { apiUpdateOrder, apiAddOrder } from '../api';

const PRICE = 40;

export default function OrdersPage() {
  const { state, dispatch } = useApp();
  const [filter, setFilter]           = useState('All');
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [form, setForm] = useState({
    custId: '', type: 'Delivery', gallons: 1,
    date: new Date().toISOString().slice(0, 10),
  });

  // ── Filter ──
  const filtered = (state.orders || []).filter(o => {
    if (['Pending', 'Processing', 'Delivered', 'Cancelled'].includes(filter)) return o.status === filter;
    if (filter === 'Delivery') return o.type === 'Delivery';
    if (filter === 'Walk-in')  return o.type === 'Walk-in / Pickup';
    return true;
  });

  // ── Resolve customer name ──
  // Orders from customers use userId; orders from admin use custId
  function getCustomerName(o) {
  const id = o.userId || o.custId;
  if (!id) return '—';

  // Check registered users first (customer portal orders)
  const user = (state.users || []).find(u => String(u.id) === String(id));
  if (user) return user.fullName || user.username || '—';

  // Fallback: check customers table (admin-created orders)
  const customer = (state.customers || []).find(c => String(c.id) === String(id));
  if (customer) return customer.fullName || customer.name || '—';

  return '—';
}

  // ── Mark as Processing ──
  async function handleMarkProcessing(o) {
    try {
      const updated = await apiUpdateOrder(o.id, { ...o, status: 'Processing' });
      dispatch({ type: 'UPDATE_ORDER', payload: updated });
      showToast(`⚙️ Order ${o.ref || o.id} is now Processing!`);
    } catch {
      showToast('❌ Failed to update order.');
    }
  }

  // ── Mark as Done (Delivered / Ready to Go) ──
  async function handleMarkDone(o) {
    const isWalkin  = o.type === 'Walk-in / Pickup';
    const newStatus = isWalkin ? 'Ready to Go' : 'Delivered';
    try {
      const updated = await apiUpdateOrder(o.id, { ...o, status: newStatus });
      dispatch({ type: 'UPDATE_ORDER', payload: updated });
      showToast(`✅ Order ${o.ref || o.id} marked as ${newStatus}!`);
    } catch {
      showToast('❌ Failed to update order.');
    }
  }

  // ── Delete order ──
  async function handleDeleteOrder(o) {
    if (!confirm('Delete this order?')) return;
    try {
      await apiUpdateOrder(o.id, { ...o, status: 'Cancelled' });
      dispatch({ type: 'UPDATE_ORDER', payload: { ...o, status: 'Cancelled' } });
      showToast('🗑 Order deleted.');
    } catch {
      showToast('❌ Failed to delete order.');
    }
  }

  // ── Place new order (admin side) ──
  async function handlePlaceOrder() {
    if (!form.custId) { showToast('⚠ Select a customer.'); return; }
    const amount   = parseInt(form.gallons) * PRICE;
    const customer = (state.customers || []).find(c => String(c.id) === String(form.custId));
    try {
      const newOrder = await apiAddOrder({
        custId:   form.custId,
        userId:   form.custId,
        type:     form.type === 'Walk-in' ? 'Walk-in / Pickup' : 'Delivery',
        quantity: parseInt(form.gallons),
        gallons:  parseInt(form.gallons),
        total:    amount,
        amount,
        date:     form.date,
        status:   'Pending',
      });
      dispatch({ type: 'ADD_ORDER', payload: newOrder });
      showToast(`✅ Order placed for ${customer?.fullName || customer?.username || customer?.name || 'customer'}!`);
      setShowOrderModal(false);
      setForm({ custId: '', type: 'Delivery', gallons: 1, date: new Date().toISOString().slice(0, 10) });
    } catch {
      showToast('❌ Failed to place order.');
    }
  }

  const pendingDeliveries = (state.orders || []).filter(o => o.status === 'Pending' && o.type === 'Delivery');

  const statusBadge = {
    'Delivered':          'bg-green-100 text-green-800',
    'Ready to Go':        'bg-green-100 text-green-700',
    'Accepted':           'bg-sky-100 text-sky-800',
    'Out for Delivery':   'bg-emerald-100 text-emerald-800',
    'Processing':         'bg-blue-100 text-blue-800',
    'Cancelled':          'bg-red-100 text-red-800',
    'Pending':            'bg-yellow-100 text-yellow-800',
  };

  const typeBadge = {
    'Delivery':        'bg-blue-100 text-blue-800',
    'Walk-in / Pickup':'bg-green-50 text-green-700',
    'Walk-in':         'bg-green-50 text-green-700',
  };

  const tabs = ['All', 'Pending', 'Processing', 'Delivered', 'Cancelled', 'Delivery', 'Walk-in'];

  return (
    <div>
      <div className="bg-white rounded-xl border border-gray-200 p-4">

        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="text-[15px] font-bold">📋 Order Management</div>
            <div className="text-xs text-gray-500 mt-0.5">Track walk-in, schedule deliveries, manage statuses.</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowRouteModal(true)}
              className="border border-gray-200 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              🚗 Smart Routing
            </button>
            <button
              onClick={() => setShowOrderModal(true)}
              className="bg-accent text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-accent2 transition cursor-pointer"
            >
              + New Order
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 flex-wrap mb-3">
          {tabs.map(tab => (
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

        {/* Orders Table */}
        <div className="max-h-[500px] overflow-y-auto border border-gray-100 rounded-lg">
        <table className="w-full text-[13px] border-collapse">
          <thead className="sticky top-0 bg-white z-10">
            <tr>
              {['Order ID', 'Customer', 'Type', 'Gallons', 'Amount', 'Payment', 'Date', 'Status', 'Actions'].map(h => (
                <th key={h} className="text-left px-2.5 py-2 text-[11.5px] font-semibold text-gray-500 border-b-2 border-gray-200 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-6 text-gray-400 text-xs">No orders found.</td></tr>
            ) : (
              filtered.map(o => (
                <tr key={o.id} className="hover:bg-gray-50 border-b border-gray-100 last:border-b-0">
                  <td className="px-2.5 py-2.5 font-mono font-semibold text-gray-600">
                    {o.ref || `#${String(o.id).slice(-6)}`}
                  </td>
                  <td className="px-2.5 py-2.5 font-medium">{getCustomerName(o)}</td>
                  <td className="px-2.5 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-semibold ${typeBadge[o.type] || 'bg-gray-100 text-gray-500'}`}>
                      {o.type}
                    </span>
                  </td>
                  <td className="px-2.5 py-2.5 text-gray-600">{o.quantity ?? o.gallons ?? '—'}</td>
                  <td className="px-2.5 py-2.5 font-semibold">₱{o.total ?? o.amount ?? '—'}</td>
                  <td className="px-2.5 py-2.5">
                    {o.paymentStatus === 'paid' ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-semibold bg-green-100 text-green-800">
                        ✔ Paid (Xendit)
                      </span>
                    ) : o.checkoutSessionId ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-semibold bg-yellow-100 text-yellow-800">
                        ⏳ Awaiting payment
                      </span>
                    ) : o.payMethod === 'Cash on Delivery' ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-semibold bg-orange-100 text-orange-800">
                        💵 Cash on Delivery
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-semibold bg-gray-100 text-gray-500">
                        Pay on arrival
                      </span>
                    )}
                  </td>
                  <td className="px-2.5 py-2.5 text-gray-500">
                    {o.date ? new Date(o.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </td>
                  <td className="px-2.5 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-semibold ${statusBadge[o.status] || 'bg-gray-100 text-gray-500'}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-2.5 py-2.5">
                    <div className="flex gap-1">
                      {o.status === 'Pending' && (
                        <button
                          onClick={() => handleMarkProcessing(o)}
                          className="bg-blue-500 text-white text-[11px] font-semibold px-2 py-1 rounded cursor-pointer hover:bg-blue-600"
                        >
                          ⚙ Process
                        </button>
                      )}
                      {o.status === 'Processing' && (
                        <button
                          onClick={() => handleMarkDone(o)}
                          className="bg-green-600 text-white text-[11px] font-semibold px-2 py-1 rounded cursor-pointer hover:bg-green-700"
                        >
                          ✔ Done
                        </button>
                      )}
                      {!['Delivered', 'Ready to Go', 'Cancelled'].includes(o.status) && (
                        <button
                          onClick={() => handleDeleteOrder(o)}
                          className="border border-gray-200 rounded w-7 h-7 flex items-center justify-center text-[13px] hover:bg-gray-50 cursor-pointer"
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* ── New Order Modal ── */}
      {showOrderModal && (
        <Modal title="📋 Create New Order" onClose={() => setShowOrderModal(false)}>
          <div className="mb-3">
            <label className="block text-[12.5px] font-semibold mb-1">Select Customer</label>
            <select
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] outline-none focus:border-accent"
              value={form.custId}
              onChange={e => setForm({ ...form, custId: e.target.value })}
            >
              <option value="">-- Select Customer --</option>
              {(state.customers || []).map(c => (
                <option key={c.id} value={c.id}>
                  {c.fullName || c.username || c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2.5 mb-3">
            <div>
              <label className="block text-[12.5px] font-semibold mb-1">Order Type</label>
              <select
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] outline-none focus:border-accent"
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value })}
              >
                <option>Delivery</option>
                <option>Walk-in</option>
              </select>
            </div>
            <div>
              <label className="block text-[12.5px] font-semibold mb-1">Gallons</label>
              <input
                type="number" min="1"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] outline-none focus:border-accent"
                value={form.gallons}
                onChange={e => setForm({ ...form, gallons: e.target.value })}
              />
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-[12.5px] font-semibold mb-1">Scheduled Date</label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] outline-none focus:border-accent"
              value={form.date}
              onChange={e => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div className="bg-teal-50 border border-teal-200 rounded-lg px-3.5 py-2.5 flex justify-between font-bold text-[14px] my-2">
            <span>Total Amount:</span>
            <span>₱{form.gallons * PRICE}</span>
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <button onClick={() => setShowOrderModal(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-[12.5px] font-semibold hover:bg-gray-50 cursor-pointer">
              Cancel
            </button>
            <button onClick={handlePlaceOrder} className="px-4 py-2 bg-accent text-white rounded-lg text-[12.5px] font-semibold hover:bg-accent2 cursor-pointer">
              🚀 Place Order
            </button>
          </div>
        </Modal>
      )}

      {/* ── Smart Route Modal ── */}
      {showRouteModal && (
        <Modal title="🚗 Smart Delivery Routing" onClose={() => setShowRouteModal(false)}>
          <p className="text-[13px] text-gray-500 mb-3">
            Optimized route for today's pending deliveries based on location proximity.
          </p>
          {pendingDeliveries.length === 0 ? (
            <div className="text-center text-gray-400 text-xs py-4">No pending deliveries today.</div>
          ) : (
            pendingDeliveries.map((o, i) => (
              <div key={o.id} className="flex items-center gap-2.5 bg-gray-50 rounded-lg px-3 py-2.5 mb-2">
                <div className="w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {i + 1}
                </div>
                <div>
                  <div className="text-[13.5px] font-semibold">{getCustomerName(o)} ({o.quantity ?? o.gallons} gal)</div>
                  <div className="text-xs text-gray-500">📍 {o.address || 'N/A'}</div>
                </div>
              </div>
            ))
          )}
          <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-2.5 text-[13px] mt-3">
            <strong>Stops:</strong> {pendingDeliveries.length}
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <button onClick={() => setShowRouteModal(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-[12.5px] font-semibold hover:bg-gray-50 cursor-pointer">
              Close
            </button>
            <button
              onClick={() => { showToast('📤 Route sent to driver!'); setShowRouteModal(false); }}
              className="px-4 py-2 bg-accent text-white rounded-lg text-[12.5px] font-semibold hover:bg-accent2 cursor-pointer"
            >
              📤 Send to Driver
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}