// src/pages/OrdersPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import Modal from '../components/ui/Modal';
import { showToast } from '../components/ui/Toast';
import { apiUpdateOrder, apiAddOrder, apiAssignRider, apiSendRouteToDriver } from '../api';
import PageHeader from '../components/admin/PageHeader';
import SectionCard from '../components/admin/SectionCard';
import FilterPills from '../components/admin/FilterPills';
import EmptyState from '../components/admin/EmptyState';
import {
  ClipboardList, MapPin, Plus, Trash2, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Search, Bike, Package,
} from 'lucide-react';
import { formatMoney } from '../lib/money';

const PRICE = 40;
const PAGE_SIZE_OPTIONS = [10, 25, 50];

export default function OrdersPage() {
  const { state, dispatch } = useApp();
  const [filter, setFilter]           = useState('All');
  const [query, setQuery]             = useState('');
  const [page, setPage]               = useState(1);
  const [pageSize, setPageSize]       = useState(10);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [assignOrder, setAssignOrder] = useState(null); // order being assigned
  const [selectedRiderId, setSelectedRiderId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [routeRiderId, setRouteRiderId] = useState('');
  const [sendingRoute, setSendingRoute] = useState(false);
  const [form, setForm] = useState({
    custId: '', type: 'Delivery', gallons: 1,
    date: new Date().toISOString().slice(0, 10),
  });

  const riders = (state.users || []).filter(u => u.role === 'rider');

  function isWalkinOrder(o) {
    const t = String(o?.type || '').toLowerCase();
    return t.includes('walk');
  }

  function isDeliveryOrder(o) {
    return !isWalkinOrder(o);
  }

  function getCustomerName(o) {
    const id = o.userId || o.custId;
    if (!id) return '—';
    const user = (state.users || []).find(u => String(u.id) === String(id));
    if (user) return user.fullName || user.username || '—';
    const customer = (state.customers || []).find(c => String(c.id) === String(id));
    if (customer) return customer.fullName || customer.name || '—';
    return '—';
  }

  function getCustomerAddress(o) {
    if (o.address) return o.address;
    const id = o.userId || o.custId;
    if (!id) return '';
    const user = (state.users || []).find((u) => String(u.id) === String(id));
    if (user?.address) return user.address;
    const customer = (state.customers || []).find((c) => String(c.id) === String(id));
    return customer?.address || '';
  }

  function canAssignRider(o) {
    return isDeliveryOrder(o) && !['Delivered', 'Cancelled', 'Ready to Go'].includes(o.status);
  }

  function orderItemsText(o) {
    const qty = o.quantity ?? o.gallons ?? 1;
    if (o.productLabel) return `${o.productLabel} × ${qty}`;
    if (o.productId) return `${o.productId} × ${qty}`;
    const walk = isWalkinOrder(o);
    if (walk) return `Gallon Refill × ${qty}`;
    return `Water Delivery × ${qty}`;
  }

  function formatOrderDate(o) {
    if (!o?.date) return '';
    const d = new Date(o.date);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-PH', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  // ── Filter + search ──
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = (state.orders || []).filter((o) => {
      if (['Pending', 'Assigned', 'Processing', 'Out for Delivery', 'Delivered', 'Cancelled'].includes(filter)) {
        if (o.status !== filter) return false;
      } else if (filter === 'Delivery') {
        if (!isDeliveryOrder(o)) return false;
      } else if (filter === 'Walk-in') {
        if (!isWalkinOrder(o)) return false;
      } else if (filter === 'Unassigned') {
        if (!(isDeliveryOrder(o) && !o.riderId && !['Delivered', 'Cancelled', 'Ready to Go'].includes(o.status))) {
          return false;
        }
      }

      if (!q) return true;
      const hay = [
        o.ref,
        o.id,
        o.status,
        o.payMethod,
        o.paymentStatus,
        getCustomerName(o),
        getCustomerAddress(o),
        orderItemsText(o),
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });

    return rows.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [state.orders, state.users, state.customers, filter, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageRows = filtered.slice(pageStart, pageStart + pageSize);
  const rangeFrom = filtered.length === 0 ? 0 : pageStart + 1;
  const rangeTo = Math.min(pageStart + pageSize, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [filter, query, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

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

  async function handleInlineAssign(o, riderId) {
    if (!riderId || String(riderId) === String(o.riderId)) return;
    try {
      const updated = await apiAssignRider(o.id, riderId);
      dispatch({ type: 'UPDATE_ORDER', payload: updated });
      const name = riders.find((r) => String(r.id) === String(riderId))?.fullName || 'rider';
      showToast(`🛵 Assigned ${o.ref || o.id} to ${name}`);
    } catch (e) {
      showToast(`❌ ${e.message || 'Failed to assign rider.'}`);
    }
  }

  function paymentCell(o) {
    if (o.paymentStatus === 'paid') {
      const ref = o.checkoutSessionId ? String(o.checkoutSessionId).slice(-8) : null;
      return (
        <div>
          <p className="text-xs font-medium text-ink">Online Payment (GCash/Maya)</p>
          {ref && <p className="mt-0.5 text-[10px] font-semibold text-violet-600">Ref: GC-{ref}</p>}
        </div>
      );
    }
    if (o.checkoutSessionId) {
      return (
        <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
          Awaiting payment
        </span>
      );
    }
    if (o.payMethod === 'Cash on Delivery') {
      return (
        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
          Cash on Delivery (COD)
        </span>
      );
    }
    if (isWalkinOrder(o)) {
      return (
        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
          Walk-in / Utang
        </span>
      );
    }
    return (
      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
        {o.payMethod || 'Pay on arrival'}
      </span>
    );
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
    Delivered: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
    'Ready to Go': 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
    Assigned: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100',
    Accepted: 'bg-sky-50 text-sky-700 ring-1 ring-sky-100',
    'Out for Delivery': 'bg-cyan-50 text-cyan-800 ring-1 ring-cyan-100',
    Processing: 'bg-blue-50 text-blue-800 ring-1 ring-blue-100',
    Cancelled: 'bg-rose-50 text-rose-700 ring-1 ring-rose-100',
    Pending: 'bg-amber-50 text-amber-800 ring-1 ring-amber-100',
  };

  const tabs = ['All', 'Unassigned', 'Pending', 'Assigned', 'Out for Delivery', 'Processing', 'Delivered', 'Cancelled', 'Delivery', 'Walk-in'];

  function pageButtons() {
    const windowSize = 5;
    let start = Math.max(1, safePage - Math.floor(windowSize / 2));
    let end = Math.min(totalPages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    const pages = [];
    for (let i = start; i <= end; i += 1) pages.push(i);
    return pages;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Orders & Dispatch"
        subtitle="Manage incoming customer orders, assign riders, and fulfill water dispatches."
      >
        {unassignedCount > 0 && (
          <button
            type="button"
            onClick={() => setFilter('Unassigned')}
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
          >
            Unassigned ({unassignedCount})
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowRouteModal(true)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-ink hover:bg-slate-50"
        >
          Smart routing
        </button>
        <button
          type="button"
          onClick={() => setShowOrderModal(true)}
          className="agua-btn agua-btn-primary !gap-1.5 !py-2.5 !text-sm"
        >
          <Plus size={16} /> New Order
        </button>
      </PageHeader>

      <FilterPills options={tabs} value={filter} onChange={setFilter} className="!mb-0" />

      <SectionCard
        title="Incoming & Active Orders"
        description={`${filtered.length} order${filtered.length === 1 ? '' : 's'} · newest first`}
        action={(
          <div className="relative w-full min-w-[200px] max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ref, customer, address…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2 pl-9 pr-3 text-xs font-medium text-ink outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-2 focus:ring-sky-100"
            />
          </div>
        )}
        bodyClassName="!p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-slate-50 via-slate-50/90 to-white text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                {[
                  'Order',
                  'Customer',
                  'Items',
                  'Amount',
                  'Payment',
                  'Rider',
                  'Status',
                  'Actions',
                ].map((h, i) => (
                  <th
                    key={h}
                    className={`whitespace-nowrap border-b border-slate-200/80 px-3 py-3.5 ${i === 0 ? 'pl-5' : ''} ${i === 7 ? 'pr-5' : ''}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-2">
                    <EmptyState
                      icon={ClipboardList}
                      title="No orders match this filter"
                      description="Try another status tab, clear search, or create a new order."
                    />
                  </td>
                </tr>
              ) : (
                pageRows.map((o, idx) => {
                  const completed = o.status === 'Delivered' || o.status === 'Ready to Go';
                  const walk = isWalkinOrder(o);
                  const zebra = idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white';
                  return (
                    <tr
                      key={o.id}
                      className={`group border-b border-slate-100/90 transition hover:bg-sky-50/50 ${zebra}`}
                    >
                      <td className="whitespace-nowrap px-5 py-4 align-top">
                        <div className="flex items-start gap-2.5">
                          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                            walk ? 'bg-violet-50 text-violet-600' : 'bg-sky-50 text-sky-600'
                          }`}>
                            {walk ? <Package size={15} /> : <Bike size={15} />}
                          </span>
                          <div>
                            <p className="font-semibold tracking-tight text-ink">
                              {o.ref || `ORD-${String(o.id).slice(-6)}`}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-400">
                              {formatOrderDate(o) || (walk ? 'Walk-in' : 'Delivery')}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="max-w-[220px] px-3 py-4 align-top">
                        <p className="font-semibold text-ink">{getCustomerName(o)}</p>
                        {getCustomerAddress(o) ? (
                          <p className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-slate-500">
                            <MapPin size={11} className="mt-0.5 shrink-0 text-slate-400" />
                            <span className="line-clamp-2">{getCustomerAddress(o)}</span>
                          </p>
                        ) : (
                          <p className="mt-1 text-[11px] text-slate-300">No address on file</p>
                        )}
                      </td>
                      <td className="px-3 py-4 align-top">
                        <span className="inline-flex rounded-lg bg-slate-100/80 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                          {orderItemsText(o)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 align-top">
                        <p className="font-bold tabular-nums text-ink">{formatMoney(o.total ?? o.amount)}</p>
                      </td>
                      <td className="px-3 py-4 align-top">{paymentCell(o)}</td>
                      <td className="px-3 py-4 align-top">
                        {canAssignRider(o) ? (
                          <select
                            className="max-w-[148px] rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-medium text-ink shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                            value={o.riderId || ''}
                            onChange={(e) => handleInlineAssign(o, e.target.value)}
                          >
                            <option value="">Select rider</option>
                            {riders.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.fullName || r.username}
                              </option>
                            ))}
                          </select>
                        ) : getRiderName(o) ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                            <Bike size={12} className="text-slate-500" />
                            {getRiderName(o)}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-4 align-top">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            completed
                              ? statusBadge.Delivered
                              : statusBadge[o.status] || statusBadge.Pending
                          }`}
                        >
                          {completed ? 'Completed' : o.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 align-top">
                        {completed ? (
                          <span className="text-xs font-semibold text-emerald-600">Done</span>
                        ) : o.status === 'Cancelled' ? (
                          <span className="text-xs text-muted">Cancelled</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {(o.status === 'Processing' ||
                              o.status === 'Assigned' ||
                              o.status === 'Out for Delivery' ||
                              o.status === 'Pending') && (
                              <button
                                type="button"
                                onClick={() =>
                                  o.status === 'Pending' ? handleMarkProcessing(o) : handleMarkDone(o)
                                }
                                className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-slate-800"
                              >
                                {o.status === 'Pending' ? 'Process' : 'Complete'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openAssign(o)}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-ink"
                            >
                              Details
                            </button>
                            {!['Delivered', 'Ready to Go', 'Cancelled'].includes(o.status) && (
                              <button
                                type="button"
                                onClick={() => handleDeleteOrder(o)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                                aria-label="Cancel order"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>
              Showing <span className="font-semibold text-ink">{rangeFrom}</span>
              –<span className="font-semibold text-ink">{rangeTo}</span>
              {' '}of <span className="font-semibold text-ink">{filtered.length}</span>
            </span>
            <label className="inline-flex items-center gap-1.5">
              <span className="text-slate-400">Rows</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-ink outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage(1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="First page"
            >
              <ChevronsLeft size={15} />
            </button>
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft size={15} />
            </button>
            {pageButtons().map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-semibold transition ${
                  n === safePage
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight size={15} />
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage(totalPages)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Last page"
            >
              <ChevronsRight size={15} />
            </button>
          </div>
        </div>
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
        <Modal title="Smart delivery routing" onClose={() => { setShowRouteModal(false); setRouteRiderId(''); }}>
          <p className="mb-3 text-[13px] text-muted">
            Assign today&apos;s pending delivery stops to a rider and notify them in-app.
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
          {riders.length > 0 && (
            <div className="mt-3">
              <label className="agua-label">Send to rider</label>
              <select
                className="agua-input"
                value={routeRiderId}
                onChange={(e) => setRouteRiderId(e.target.value)}
              >
                <option value="">Select rider…</option>
                {riders.map((r) => (
                  <option key={r.id} value={r.id}>{r.fullName || r.username}</option>
                ))}
              </select>
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setShowRouteModal(false); setRouteRiderId(''); }}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[12.5px] font-semibold text-ink hover:bg-slate-50"
            >
              Close
            </button>
            <button
              type="button"
              disabled={sendingRoute || !pendingDeliveries.length}
              onClick={async () => {
                if (!routeRiderId) {
                  showToast('⚠ Select a rider first.');
                  return;
                }
                setSendingRoute(true);
                try {
                  const result = await apiSendRouteToDriver(
                    routeRiderId,
                    pendingDeliveries.map((o) => o.id)
                  );
                  for (const id of result.orderIds || []) {
                    const existing = (state.orders || []).find((o) => o.id === id);
                    if (existing) {
                      dispatch({
                        type: 'UPDATE_ORDER',
                        payload: {
                          ...existing,
                          riderId: result.riderId,
                          status: existing.status === 'Pending' ? 'Assigned' : existing.status,
                        },
                      });
                    }
                  }
                  showToast(`🛵 Route sent to ${result.riderName || 'rider'} (${result.count} stops)`);
                  setShowRouteModal(false);
                  setRouteRiderId('');
                } catch (e) {
                  showToast(`❌ ${e.message || 'Failed to send route.'}`);
                } finally {
                  setSendingRoute(false);
                }
              }}
              className="agua-btn agua-btn-primary !py-2 disabled:opacity-60"
            >
              {sendingRoute ? 'Sending…' : 'Send to driver'}
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
              No rider accounts found. Add one under <strong>Rider Management</strong> in the sidebar.
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