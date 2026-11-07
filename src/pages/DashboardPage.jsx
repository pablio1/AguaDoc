// src/pages/DashboardPage.jsx
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import PageHeader from '../components/admin/PageHeader';
import SectionCard from '../components/admin/SectionCard';
import { TABLE_BODY_ROW, TABLE_HEAD_ROW } from '../components/admin/tableStyles';
import EmptyState from '../components/admin/EmptyState';
import {
  Banknote, TrendingUp, AlertTriangle, Users, Sparkles, Plus,
  ShoppingBag, Truck,
} from 'lucide-react';
import { formatMoney, sumMoney } from '../lib/money';

const HISTORY_DAYS = 14;
const FORECAST_DAYS = 7;

function dateKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function linearRegression(values) {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0 };
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  values.forEach((y, x) => {
    num += (x - xMean) * (y - yMean);
    den += (x - xMean) ** 2;
  });
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: yMean - slope * xMean };
}

function resolveCustomer(state, id) {
  if (!id) return null;
  return (
    (state.users || []).find((u) => String(u.id) === String(id)) ||
    (state.customers || []).find((c) => String(c.id) === String(id))
  );
}

function orderItemsLabel(o) {
  const qty = o.quantity ?? o.gallons ?? 1;
  const type = String(o.type || 'Delivery');
  if (type.toLowerCase().includes('walk')) {
    return `Gallon Refill x ${qty}`;
  }
  return `Water Delivery x ${qty} gal`;
}

function paymentStatusLabel(o) {
  if (o.paymentStatus === 'paid' || o.checkoutSessionId) {
    return 'Online Payment (GCash/Maya)';
  }
  if (o.payMethod === 'Cash on Delivery') {
    return 'Cash on Delivery (COD)';
  }
  if (String(o.type || '').toLowerCase().includes('walk')) {
    return 'Walk-in / Over-the-Counter (Utang)';
  }
  return o.payMethod || 'Pay on arrival';
}

export default function DashboardPage() {
  const { state } = useApp();
  const navigate = useNavigate();
  const stockItems = Array.isArray(state.stockItems) ? state.stockItems : [];

  const todayKey = dateKey(new Date());
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const deliveredOrders = (state.orders || []).filter((o) => o.status === 'Delivered');

  const todaysSales = sumMoney(
    deliveredOrders.filter((o) => dateKey(o.date) === todayKey),
    (o) => o.total ?? o.amount
  );

  const monthlyRevenue = sumMoney(
    deliveredOrders.filter((o) => new Date(o.date) >= monthStart),
    (o) => o.total ?? o.amount
  );

  const lowStockCount = stockItems.filter(
    (i) => Number(i.stock) <= Number(i.minAlert)
  ).length;

  const pendingDebts = sumMoney(state.customers, 'balance');

  const { predWeek, predMonth } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const byDay = {};
    const delivered = (state.orders || []).filter((o) => o.status === 'Delivered');
    delivered.forEach((o) => {
      const key = dateKey(o.date);
      byDay[key] = (byDay[key] || 0) + (parseFloat(o.total ?? o.amount) || 0);
    });
    const actualTotals = [];
    for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      actualTotals.push(byDay[dateKey(d)] || 0);
    }
    const { slope, intercept } = linearRegression(actualTotals);
    const predictedTotals = [];
    for (let i = 0; i < FORECAST_DAYS; i++) {
      const x = HISTORY_DAYS + i;
      predictedTotals.push(Math.max(0, Math.round(slope * x + intercept)));
    }
    const predWeek = predictedTotals.reduce((a, b) => a + b, 0);
    const predMonth = Math.round((predWeek / FORECAST_DAYS) * 30);
    return { predWeek, predMonth };
  }, [state.orders]);

  const recentTransactions = state.orders.slice(0, 5);

  const activeDeliveries = useMemo(() => {
    return (state.orders || [])
      .filter((o) => {
        const t = String(o.type || '').toLowerCase();
        return !t.includes('walk') && !['Delivered', 'Cancelled', 'Ready to Go'].includes(o.status);
      })
      .slice(0, 5);
  }, [state.orders]);

  const riders = (state.users || []).filter((u) => u.role === 'rider');

  function getRiderName(o) {
    if (o.riderName) return o.riderName;
    if (!o.riderId) return '—';
    const rider = riders.find((r) => String(r.id) === String(o.riderId));
    return rider?.fullName || rider?.username || 'Rider';
  }

  function getAddress(o) {
    if (o.address) return o.address;
    const id = o.userId || o.custId;
    const c = resolveCustomer(state, id);
    return c?.address || '—';
  }

  const kpiCards = [
    {
      label: "Today's Sales",
      value: formatMoney(todaysSales),
      icon: Banknote,
      iconWrap: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Monthly Revenue',
      value: formatMoney(monthlyRevenue),
      icon: TrendingUp,
      iconWrap: 'bg-sky-50 text-sky-600',
    },
    {
      label: 'Low Stock Items',
      value: String(lowStockCount),
      icon: AlertTriangle,
      iconWrap: 'bg-amber-50 text-amber-600',
      valueClass: lowStockCount > 0 ? 'text-amber-700' : 'text-ink',
    },
    {
      label: 'Pending Debts',
      value: formatMoney(pendingDebts),
      icon: Users,
      iconWrap: 'bg-rose-50 text-rose-600',
      valueClass: pendingDebts > 0 ? 'text-red-600' : 'text-ink',
    },
  ];

  const statusPill = (o) => {
    const label = paymentStatusLabel(o);
    const utang = label.toLowerCase().includes('utang') || label.toLowerCase().includes('walk');
    const online = label.toLowerCase().includes('online') || label.toLowerCase().includes('gcash');
    return (
      <span
        className={`inline-flex max-w-[200px] rounded-full px-2.5 py-1 text-[10px] font-semibold leading-snug ${
          utang
            ? 'bg-emerald-50 text-emerald-700'
            : online
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-slate-100 text-slate-600'
        }`}
      >
        {label}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Station Overview"
        subtitle="Real-time metrics, financial forecasting, and operational status."
      >
        <button
          type="button"
          onClick={() => navigate('/orders')}
          className="agua-btn agua-btn-primary !gap-1.5 !py-2.5 !text-sm"
        >
          <Plus size={16} /> New Station Order
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="agua-card flex items-start justify-between gap-3 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">
                  {k.label}
                </p>
                <p className={`mt-2 text-2xl font-bold tracking-tight ${k.valueClass || 'text-ink'}`}>
                  {k.value}
                </p>
              </div>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${k.iconWrap}`}>
                <Icon size={18} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] px-6 py-6 text-white shadow-lg">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-sky-200">
              <Sparkles size={12} /> AI Sales Forecasting Engine
            </span>
            <h2 className="mt-3 text-lg font-bold">Predicted Revenue Growth</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
              Based on historical order frequency and refill velocity, our forecasting algorithm
              projects upcoming revenue from delivered orders.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[140px] rounded-xl border border-white/10 bg-white/5 px-5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Next 7 days</p>
              <p className="mt-1 text-xl font-bold text-emerald-400">{formatMoney(predWeek)}</p>
            </div>
            <div className="min-w-[140px] rounded-xl border border-white/10 bg-white/5 px-5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Next 30 days</p>
              <p className="mt-1 text-xl font-bold text-sky-300">{formatMoney(predMonth)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Recent Transactions"
          action={
            <Link to="/orders" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
              View All
            </Link>
          }
          bodyClassName="overflow-x-auto"
        >
          <table className="w-full min-w-[360px] text-sm">
            <thead>
              <tr className={TABLE_HEAD_ROW}>
                <th className="px-5 py-3">Customer</th>
                <th className="px-3 py-3">Items</th>
                <th className="px-3 py-3">Total</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentTransactions.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <EmptyState
                      icon={ShoppingBag}
                      title="No transactions yet"
                      description="Recent orders will appear here."
                    />
                  </td>
                </tr>
              ) : (
                recentTransactions.map((o) => {
                  const id = o.userId || o.custId;
                  const customer = resolveCustomer(state, id);
                  return (
                    <tr key={o.id} className={TABLE_BODY_ROW}>
                      <td className="px-5 py-3.5 font-semibold text-ink">
                        {customer?.fullName || '—'}
                      </td>
                      <td className="px-3 py-3.5 text-xs text-muted">{orderItemsLabel(o)}</td>
                      <td className="px-3 py-3.5 font-bold text-ink">
                        {formatMoney(o.total ?? o.amount)}
                      </td>
                      <td className="px-5 py-3.5">{statusPill(o)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </SectionCard>

        <SectionCard
          title="Active Deliveries"
          action={
            <Link to="/delivery-route" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
              View All
            </Link>
          }
          bodyClassName="overflow-x-auto"
        >
          <table className="w-full min-w-[360px] text-sm">
            <thead>
              <tr className={TABLE_HEAD_ROW}>
                <th className="px-5 py-3">Customer</th>
                <th className="px-3 py-3">Address</th>
                <th className="px-3 py-3">Rider</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {activeDeliveries.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <EmptyState
                      icon={Truck}
                      title="No active deliveries"
                      description="Open delivery orders show here with rider assignments."
                    />
                  </td>
                </tr>
              ) : (
                activeDeliveries.map((o) => {
                  const id = o.userId || o.custId;
                  const customer = resolveCustomer(state, id);
                  const done = o.status === 'Delivered';
                  const pending = o.status === 'Pending' || !o.riderId;
                  return (
                    <tr key={o.id} className={TABLE_BODY_ROW}>
                      <td className="px-5 py-3.5 font-semibold text-ink">
                        {customer?.fullName || '—'}
                      </td>
                      <td className="max-w-[140px] truncate px-3 py-3.5 text-xs text-muted" title={getAddress(o)}>
                        {getAddress(o)}
                      </td>
                      <td className="px-3 py-3.5 text-xs font-medium text-ink">{getRiderName(o)}</td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            done
                              ? 'bg-emerald-50 text-emerald-700'
                              : pending
                                ? 'bg-amber-50 text-amber-800'
                                : 'bg-blue-50 text-blue-700'
                          }`}
                        >
                          {o.status === 'Delivered' ? 'Completed' : o.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </SectionCard>
      </div>
    </div>
  );
}
