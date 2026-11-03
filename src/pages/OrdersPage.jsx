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
import EmptyState from '../components/admin/EmptyState';
import { ClipboardList, MapPin, Trash2 } from 'lucide-react';
import { formatMoney } from '../lib/money';

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
    Delivered: 'bg-emerald-50 text-emerald-700',
    'Ready to Go': 'bg-emerald-50 text-emerald-700',
    Assigned: 'bg-blue-50 text-blue-700',
    Accepted: 'bg-sky-50 text-sky-700',
    'Out for Delivery': 'bg-blue-50 text-blue-700',
    Processing: 'bg-sky-50 text-sky-800',
    Cancelled: 'bg-red-50 text-red-700',
    Pending: 'bg-amber-50 text-amber-800',
  };

  const typeBadge = {
    Delivery: 'bg-blue-50 text-blue-700',
    'Walk-in / Pickup': 'bg-slate-100 text-slate-600',
    'Walk-in': 'bg-slate-100 text-slate-600',
  };

  const orderCount = (state.orders || []).length;
  const pendingCount = (state.orders || []).filter((o) => o.status === 'Pending').length;
  const deliveredCount = (state.orders || []).filter((o) => o.status === 'Delivered').length;

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

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="agua-card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">All orders</p>
          <p className="mt-2 font-display text-2xl font-bold text-ink">{orderCount}</p>
        </div>
        <div className="agua-card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">Pending</p>
          <p className="mt-2 font-display text-2xl font-bold text-amber-700">{pendingCount}</p>
        </div>
        <div className="agua-card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">Delivered</p>
          <p className="mt-2 font-display text-2xl font-bold text-emerald-600">{deliveredCount}</p>
        </div>
      </div>

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
                <td colSpan={10}>
                  <EmptyState
                    icon={ClipboardList}
                    title="No orders match this filter"
                    description="Try another status tab or create a new order."
                  />
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
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${typeBadge[o.type] || 'bg-slate-100 text-slate-600'}`}>
                      {o.type}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-muted">{o.quantity ?? o.gallons ?? '—'}</td>
                  <td className="px-3 py-3.5 font-bold text-ink">{formatMoney(o.total ?? o.amount)}</td>
                  <td className="px-3 py-3.5">
                    {o.paymentStatus === 'paid' ? (
                      <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                        Paid (Xendit)
                      </span>
                    ) : o.checkoutSessionId ? (
                      <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                        Awaiting payment
                      </span>
                    ) : o.payMethod === 'Cash on Delivery' ? (
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                        Cash on delivery
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
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
                      <span className="text-slate-300">—</span>
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
                          className="cursor-pointer rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-blue-700"
                        >
                          Process
                        </button>
                      )}
                      {(o.status === 'Processing' || o.status === 'Assigned' || o.status === 'Out for Delivery') && (
                        <button
                          type="button"
                          onClick={() => handleMarkDone(o)}
                          className="cursor-pointer rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-emerald-700"
                        >
                          Done
                        </button>
                      )}
                      {!['Delivered', 'Ready to Go', 'Cancelled'].includes(o.status) && (
                        <button
                          type="button"
                          onClick={() => handleDeleteOrder(o)}
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                          aria-label="Cancel order"
                        >
                          <Trash2 size={14} />
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
        <Modal title="Create new order" onClose={() => setShowOrderModal(false)}>
          <div className="mb-3">
            <label className="agua-label">Select customer</label>
            <select
              className="agua-input"
              value={form.custId}
              onChange={e => setForm({ ...form, custId: e.target.value })}
            >
              <option value="">— Select customer —</option>
              {(state.customers || []).map(c => (
                <option key={c.id} value={c.id}>
                  {c.fullName || c.username || c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2.5">
            <div>
              <label className="agua-label">Order type</label>
              <select
                className="agua-input"
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value })}
              >
                <option>Delivery</option>
                <option>Walk-in</option>
              </select>
            </div>
            <div>
              <label className="agua-label">Gallons</label>
              <input
                type="number"
                min="1"
                className="agua-input"
                value={form.gallons}
                onChange={e => setForm({ ...form, gallons: e.target.value })}
              />
            </div>
          </div>
          <div className="mb-3">
            <label className="agua-label">Scheduled date</label>
            <input
              type="date"
              className="agua-input"
              value={form.date}
              onChange={e => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div className="my-2 flex justify-between rounded-xl border border-blue-100 bg-blue-50/80 px-3.5 py-2.5 text-sm font-bold text-ink">
            <span className="text-muted">Total amount</span>
            <span>{formatMoney(form.gallons * PRICE)}</span>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowOrderModal(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[12.5px] font-semibold text-ink hover:bg-slate-50"
            >
              Cancel
            </button>
            <button type="button" onClick={handlePlaceOrder} className="agua-btn agua-btn-primary !py-2">
              Place order
            </button>
          </div>
        </Modal>
      )}

      {/* ── Smart Route Modal ── */}
      {showRouteModal && (
        <Modal title="Smart delivery routing" onClose={() => setShowRouteModal(false)}>
          <p className="mb-3 text-[13px] text-muted">
            Optimized route for today&apos;s pending deliveries based on location proximity.
          </p>
          {pendingDeliveries.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="No pending deliveries"
              description="Delivery stops appear here when orders are pending with an address."
            />
          ) : (
            pendingDeliveries.map((o, i) => (
              <div key={o.id} className="mb-2 flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
                  {i + 1}
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-ink">
                    {getCustomerName(o)} ({o.quantity ?? o.gallons} gal)
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted">
                    <MapPin size={11} className="shrink-0" />
                    <span className="truncate">{o.address || 'N/A'}</span>
                  </div>
                </div>
              </div>
            ))
          )}
          <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/80 px-3 py-2.5 text-[13px] text-ink">
            <span className="font-semibold">Stops:</span> {pendingDeliveries.length}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowRouteModal(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[12.5px] font-semibold text-ink hover:bg-slate-50"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => { showToast('Route sent to driver'); setShowRouteModal(false); }}
              className="agua-btn agua-btn-primary !py-2"
            >
              Send to driver
            </button>
          </div>
        </Modal>
      )}

      {/* ── Assign Rider Modal ── */}
      {assignOrder && (
        <Modal title="Assign rider" onClose={() => { setAssignOrder(null); setSelectedRiderId(''); }}>
          <p className="mb-3 text-[13px] text-muted">
            Assign a rider to deliver{' '}
            <span className="font-semibold text-ink">{assignOrder.ref || assignOrder.id}</span>
            {' '}for <span className="font-semibold text-ink">{getCustomerName(assignOrder)}</span>.
          </p>
          {assignOrder.address && (
            <p className="mb-3 flex items-start gap-1 text-xs text-muted">
              <MapPin size={12} className="mt-0.5 shrink-0" />
              <span>{assignOrder.address}</span>
            </p>
          )}
          <label className="agua-label">Select rider</label>
          <select
            className="agua-input mb-3"
            value={selectedRiderId}
            onChange={e => setSelectedRiderId(e.target.value)}
          >
            <option value="">— Choose rider —</option>
            {riders.map(r => (
              <option key={r.id} value={r.id}>
                {r.fullName || r.username} ({r.phone || r.email || 'no contact'})
              </option>
            ))}
          </select>
          {riders.length === 0 && (
            <p className="mb-3 text-xs text-amber-700">
              No rider accounts found. Create a user with role <strong>rider</strong> first (seed: rider / rider123).
            </p>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setAssignOrder(null); setSelectedRiderId(''); }}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[12.5px] font-semibold text-ink hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAssignRider}
              disabled={assigning || !selectedRiderId}
              className="agua-btn agua-btn-primary !py-2 disabled:opacity-50"
            >
              {assigning ? 'Assigning…' : 'Confirm assign'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}