// src/pages/OrdersPage.jsx
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import Modal from '../components/ui/Modal';
import { showToast } from '../components/ui/Toast';
import { apiUpdateOrder, apiAddOrder, apiAssignRider } from '../api';
import PageHeader from '../components/admin/PageHeader';
import SectionCard from '../components/admin/SectionCard';
import FilterPills from '../components/admin/FilterPills';
import { TABLE_BODY_ROW, TABLE_HEAD_ROW } from '../components/admin/tableStyles';

const PRICE = 40;

export default function OrdersPage() {
  const { state, dispatch } = useApp();
  const [filter, setFilter]           = useState('All');
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [assignOrder, setAssignOrder] = useState(null); // order being assigned
  const [selectedRiderId, setSelectedRiderId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [form, setForm] = useState({
    custId: '', type: 'Delivery', gallons: 1,
    date: new Date().toISOString().slice(0, 10),
  });

  const riders = (state.users || []).filter(u => u.role === 'rider');

  // ── Filter ──
  const filtered = (state.orders || []).filter(o => {
    if (['Pending', 'Assigned', 'Processing', 'Out for Delivery', 'Delivered', 'Cancelled'].includes(filter)) return o.status === filter;
    if (filter === 'Delivery') return isDeliveryOrder(o);
    if (filter === 'Walk-in')  return isWalkinOrder(o);
    if (filter === 'Unassigned') {
      return isDeliveryOrder(o) && !o.riderId && !['Delivered', 'Cancelled', 'Ready to Go'].includes(o.status);
    }
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

  function openAssign(o) {
    setAssignOrder(o);
    setSelectedRiderId(o.riderId || '');
  }

  async function handleAssignRider() {
    if (!assignOrder || !selectedRiderId) {
      showToast('⚠ Select a rider.');
      return;
    }
    setAssigning(true);
    try {
      const updated = await apiAssignRider(assignOrder.id, selectedRiderId);
      dispatch({ type: 'UPDATE_ORDER', payload: updated });
      const name = riders.find(r => String(r.id) === String(selectedRiderId))?.fullName || 'rider';
      showToast(`🛵 Assigned ${assignOrder.ref || assignOrder.id} to ${name}`);
      setAssignOrder(null);
      setSelectedRiderId('');
    } catch (e) {
      showToast(`❌ ${e.message || 'Failed to assign rider.'}`);
    } finally {
      setAssigning(false);
    }
  }

  function getRiderName(o) {
    if (o.riderName) return o.riderName;
    if (!o.riderId) return null;
    const rider = riders.find(r => String(r.id) === String(o.riderId));
    return rider?.fullName || rider?.username || 'Rider';
  }

  function isWalkinOrder(o) {
    const t = String(o?.type || '').toLowerCase();
    return t.includes('walk');
  }

  function isDeliveryOrder(o) {
    return !isWalkinOrder(o);
  }

  function canAssignRider(o) {
    // Any non-walk-in order that is still open can be assigned a rider
    return isDeliveryOrder(o) && !['Delivered', 'Cancelled', 'Ready to Go'].includes(o.status);
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

  const pendingDeliveries = (state.orders || []).filter(o => o.status === 'Pending' && isDeliveryOrder(o));
  const unassignedCount = (state.orders || []).filter(o => canAssignRider(o) && !o.riderId).length;

  const statusBadge = {
    'Delivered':          'bg-green-100 text-green-800',
    'Ready to Go':        'bg-green-100 text-green-700',
    'Assigned':           'bg-indigo-100 text-indigo-800',
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

  const tabs = ['All', 'Unassigned', 'Pending', 'Assigned', 'Out for Delivery', 'Processing', 'Delivered', 'Cancelled', 'Delivery', 'Walk-in'];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Order management"
        subtitle={
          <>
            Assign riders, track fulfillment, and manage walk-in vs delivery orders.
            {unassignedCount > 0 && (
              <span className="ml-1 font-semibold text-amber-600">· {unassignedCount} unassigned</span>
            )}
          </>
        }
      >
        <button
          type="button"
          onClick={() => setFilter('Unassigned')}
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
        >
          Unassigned ({unassignedCount})
        </button>
        <button
          type="button"
          onClick={() => setShowRouteModal(true)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-ink hover:bg-slate-50"
        >
          Smart routing
        </button>
        <button type="button" onClick={() => setShowOrderModal(true)} className="agua-btn agua-btn-primary !py-2 !text-xs">
          New order
        </button>
      </PageHeader>

      <FilterPills options={tabs} value={filter} onChange={setFilter} className="!mb-0" />

      <SectionCard title="Orders" description={`${filtered.length} shown · filter: ${filter}`} bodyClassName="max-h-[540px] overflow-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className={TABLE_HEAD_ROW}>
              {['Order ID', 'Customer', 'Type', 'Gallons', 'Amount', 'Payment', 'Rider', 'Date', 'Status', 'Actions'].map(
                (h) => (
                  <th key={h} className={`whitespace-nowrap px-3 py-3 ${h === 'Order ID' ? 'pl-5' : ''} ${h === 'Actions' ? 'pr-5' : ''}`}>
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-5 py-10 text-center text-sm text-muted">
                  No orders match this filter.
                </td>
              </tr>
            ) : (
              filtered.map((o) => (
                <tr key={o.id} className={TABLE_BODY_ROW}>
                  <td className="px-5 py-3.5 font-mono text-xs font-semibold text-muted">
                    {o.ref || `#${String(o.id).slice(-6)}`}
                  </td>
                  <td className="px-3 py-3.5 font-semibold text-ink">{getCustomerName(o)}</td>
                  <td className="px-3 py-3.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-semibold ${typeBadge[o.type] || 'bg-gray-100 text-gray-500'}`}>
                      {o.type}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-muted">{o.quantity ?? o.gallons ?? '—'}</td>
                  <td className="px-3 py-3.5 font-bold text-ink">₱{o.total ?? o.amount ?? '—'}</td>
                  <td className="px-3 py-3.5">
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
                  <td className="whitespace-nowrap px-3 py-3.5">
                    {getRiderName(o) ? (
                      <button
                        type="button"
                        onClick={() => canAssignRider(o) && openAssign(o)}
                        className="cursor-pointer text-[12px] font-semibold text-blue-600 hover:underline"
                      >
                        {getRiderName(o)}
                      </button>
                    ) : canAssignRider(o) ? (
                      <button
                        type="button"
                        onClick={() => openAssign(o)}
                        className="text-[11.5px] text-amber-700 font-semibold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full hover:bg-amber-100 cursor-pointer"
                      >
                        Unassigned — Assign
                      </button>
                    ) : isDeliveryOrder(o) ? (
                      <span className="text-[11.5px] text-amber-600 font-semibold">Unassigned</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-muted">
                    {o.date ? new Date(o.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </td>
                  <td className="px-3 py-3.5">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusBadge[o.status] || 'bg-slate-100 text-slate-600'}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="sticky right-0 bg-white px-5 py-3.5 shadow-[-6px_0_8px_rgba(0,0,0,0.04)]">
                    <div className="flex gap-1 flex-wrap min-w-[150px]">
                      {canAssignRider(o) ? (
                        <button
                          type="button"
                          onClick={() => openAssign(o)}
                          className="cursor-pointer rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
                        >
                          {o.riderId ? 'Reassign' : 'Assign'}
                        </button>
                      ) : null}
                      {o.status === 'Pending' && (
                        <button
                          type="button"
                          onClick={() => handleMarkProcessing(o)}
                          className="bg-blue-500 text-white text-[11px] font-semibold px-2 py-1 rounded cursor-pointer hover:bg-blue-600"
                        >
                          Process
                        </button>
                      )}
                      {(o.status === 'Processing' || o.status === 'Assigned' || o.status === 'Out for Delivery') && (
                        <button
                          type="button"
                          onClick={() => handleMarkDone(o)}
                          className="bg-green-600 text-white text-[11px] font-semibold px-2 py-1 rounded cursor-pointer hover:bg-green-700"
                        >
                          Done
                        </button>
                      )}
                      {!['Delivered', 'Ready to Go', 'Cancelled'].includes(o.status) && (
                        <button
                          type="button"
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
      </SectionCard>

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

      {/* ── Assign Rider Modal ── */}
      {assignOrder && (
        <Modal title="🛵 Assign Rider" onClose={() => { setAssignOrder(null); setSelectedRiderId(''); }}>
          <p className="text-[13px] text-gray-500 mb-3">
            Assign a rider to deliver <span className="font-semibold text-gray-700">{assignOrder.ref || assignOrder.id}</span>
            {' '}for <span className="font-semibold text-gray-700">{getCustomerName(assignOrder)}</span>.
          </p>
          {assignOrder.address && (
            <p className="text-xs text-gray-400 mb-3">📍 {assignOrder.address}</p>
          )}
          <label className="block text-[12.5px] font-semibold mb-1">Select Rider</label>
          <select
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] outline-none focus:border-accent mb-3"
            value={selectedRiderId}
            onChange={e => setSelectedRiderId(e.target.value)}
          >
            <option value="">-- Choose rider --</option>
            {riders.map(r => (
              <option key={r.id} value={r.id}>
                {r.fullName || r.username} ({r.phone || r.email || 'no contact'})
              </option>
            ))}
          </select>
          {riders.length === 0 && (
            <p className="text-xs text-amber-600 mb-3">
              No rider accounts found. Create a user with role <strong>rider</strong> first (seed: rider / rider123).
            </p>
          )}
          <div className="flex gap-2 justify-end mt-2">
            <button
              onClick={() => { setAssignOrder(null); setSelectedRiderId(''); }}
              className="px-4 py-2 border border-gray-200 rounded-lg text-[12.5px] font-semibold hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleAssignRider}
              disabled={assigning || !selectedRiderId}
              className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-[12.5px] font-semibold hover:bg-indigo-600 cursor-pointer disabled:opacity-50"
            >
              {assigning ? 'Assigning…' : 'Confirm Assign'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}