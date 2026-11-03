// src/pages/DashboardPage.jsx
import { useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chart } from 'chart.js/auto';
import { useApp } from '../context/AppContext';
import PageHeader from '../components/admin/PageHeader';
import SectionCard from '../components/admin/SectionCard';
import { TABLE_BODY_ROW, TABLE_HEAD_ROW } from '../components/admin/tableStyles';
import EmptyState from '../components/admin/EmptyState';
import { BellRing, ShoppingBag, Users } from 'lucide-react';
import { formatMoney, sumMoney } from '../lib/money';

const PRICE = 50;

function dateKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}
function shortLabel(d) {
  return new Date(d).toLocaleDateString('en-PH', { weekday: 'short' });
}
// Same lightweight least-squares fit used on the Predictions page.
function linearRegression(values) {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0 };
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  values.forEach((y, x) => { num += (x - xMean) * (y - yMean); den += (x - xMean) ** 2; });
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: yMean - slope * xMean };
}

export default function DashboardPage() {
  const { state } = useApp();
  const navigate  = useNavigate();
  const chartRef  = useRef(null);
  const canvasRef = useRef(null);

  // ── Computed values (replaces renderDashboard() calculations) ──
  const totalSales = sumMoney(
    state.orders.filter((o) => o.status === 'Delivered'),
    (o) => o.total ?? o.amount
  );

  const totalDebt = sumMoney(state.customers, 'balance');

  const pendingOrders = state.orders
    .filter(o => o.status === 'Pending').length;

  const availGallons  = state.inventory.readyGallons;
  const waterPct      = Math.round(
    (state.inventory.waterLevel / state.inventory.maxCapacity) * 100
  );

  // ── This week vs last week — real week-over-week comparison, not a fixed badge ──
  const { last7Days, last7Totals, weekChangePct } = useMemo(() => {
    const byDay = {};
    state.orders
      .filter(o => o.status === 'Delivered')
      .forEach(o => {
        const key = dateKey(o.date);
        byDay[key] = (byDay[key] || 0) + (parseFloat(o.total ?? o.amount) || 0);
      });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push({ date: d, total: byDay[dateKey(d)] || 0 });
    }
    const last7Days   = days.slice(7).map(d => d.date);
    const last7Totals = days.slice(7).map(d => d.total);
    const prev7Totals = days.slice(0, 7).map(d => d.total);

    const thisWeekSum = last7Totals.reduce((a, b) => a + b, 0);
    const prevWeekSum = prev7Totals.reduce((a, b) => a + b, 0);
    const weekChangePct = prevWeekSum === 0
      ? (thisWeekSum > 0 ? 100 : 0)
      : Math.round(((thisWeekSum - prevWeekSum) / prevWeekSum) * 100);

    return { last7Days, last7Totals, weekChangePct };
  }, [state.orders]);

  // ── Alerts (replaces the alerts[] array in renderDashboard) ──
  const alerts = [];
  if (waterPct < 20)
    alerts.push({ type: 'warn',   msg: `Low water supply! Current level at ${waterPct}%.` });
  state.customers
    .filter(c => c.balance > 0)
    .slice(0, 2)
    .forEach(c =>
      alerts.push({ type: 'danger', msg: `${c.fullName} has an overdue balance of ${formatMoney(c.balance)}.` })
    );
  if (pendingOrders > 0)
    alerts.push({ type: 'info',   msg: `${pendingOrders} pending order(s) need attention.` });

  // ── Best customers — ranked by real money actually paid, across BOTH walk-ins (state.customers)
  // and registered accounts (state.users) — not just one or the other. Deduplicated by id, since
  // a linked account can technically appear in both. ──
  const bestCustomers = useMemo(() => {
    const byId = new Map();
    [...state.customers, ...state.users.filter(u => u.role === 'customer')].forEach(c => {
      if (!byId.has(String(c.id))) byId.set(String(c.id), c);
    });

    return Array.from(byId.values())
      .map(c => {
        const ordersCount = state.orders.filter(o => String(o.custId ?? o.userId) === String(c.id)).length;
        const totalPaid   = state.payments
          .filter(p => String(p.custId) === String(c.id))
          .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        return { ...c, ordersCount, totalPaid };
      })
      .filter(c => c.ordersCount > 0 || c.totalPaid > 0) // hide accounts with zero activity
      .sort((a, b) => b.totalPaid - a.totalPaid)
      .slice(0, 4);
  }, [state.customers, state.users, state.orders, state.payments]);

  // ── Recent orders — backend already returns newest-first, so just take the top 4 ──
  const recentOrders = state.orders.slice(0, 4);

  // ── Chart: real actual sales for the last 7 days, vs. the trend line's fit for the same days ──
  useEffect(() => {
    if (chartRef.current) chartRef.current.destroy();
    const ctx = canvasRef.current.getContext('2d');

    const { slope, intercept } = linearRegression(last7Totals);
    const fitted = last7Totals.map((_, x) => Math.max(0, Math.round(slope * x + intercept)));

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: last7Days.map(shortLabel),
        datasets: [
          {
            label: 'Actual',
            data: last7Totals,
            borderColor: '#3B82F6',
            backgroundColor: 'rgba(59,130,246,.08)',
            tension: 0.4,
            fill: true,
            borderWidth: 2,
            pointRadius: 3,
          },
          {
            label: 'Predicted',
            data: fitted,
            borderColor: '#94a3b8',
            borderDash: [5, 4],
            tension: 0.4,
            fill: false,
            borderWidth: 2,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { ticks: { font: { size: 11 }, callback: (v) => formatMoney(v) } },
        },
      },
    });
    return () => chartRef.current?.destroy();
  }, [last7Days, last7Totals]);

  // ── Alert style helper ──
  const alertStyle = {
    warn:   'bg-yellow-50 border-l-4 border-yellow-400',
    danger: 'bg-red-50 border-l-4 border-red-400',
    info:   'bg-blue-50 border-l-4 border-blue-400',
  };

  const kpiCards = [
    {
      label: 'Total sales (delivered)',
      value: formatMoney(totalSales),
      badge: `${weekChangePct >= 0 ? '+' : ''}${weekChangePct}% vs last week`,
      badgeClass: weekChangePct >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
    },
    {
      label: 'Outstanding debt',
      value: formatMoney(totalDebt),
      badge: 'Across walk-in accounts',
      badgeClass: 'bg-red-50 text-red-700',
      valueClass: totalDebt > 0 ? 'text-red-600' : 'text-ink',
    },
    {
      label: 'Pending orders',
      value: String(pendingOrders),
      badge: pendingOrders > 0 ? 'Needs dispatch' : 'Queue clear',
      badgeClass: pendingOrders > 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600',
    },
    {
      label: 'Available gallons',
      value: String(availGallons),
      badge: availGallons < 50 ? 'Low stock' : 'Healthy',
      badgeClass: availGallons < 50 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        subtitle="Live pulse of sales, debt, inventory, and delivery activity."
      >
        <button
          type="button"
          onClick={() => navigate('/reports')}
          className="agua-btn agua-btn-primary !py-2 !text-xs"
        >
          Generate report
        </button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpiCards.map((k) => (
          <div key={k.label} className="agua-card px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">{k.label}</p>
            <p className={`mt-2 font-display text-2xl font-bold tracking-tight ${k.valueClass || 'text-ink'}`}>
              {k.value}
            </p>
            <span className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${k.badgeClass}`}>
              {k.badge}
            </span>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <SectionCard
          title="Sales: actual vs trend"
          description="Daily delivered revenue vs. this week's trend line from real orders"
          bodyClassName="px-5 pb-5 pt-4"
        >
          <div className="relative h-[220px]">
            <canvas ref={canvasRef} />
          </div>
          <div className="mt-3 flex gap-5 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" />
              Actual
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-slate-400 bg-slate-200" />
              Predicted
            </span>
          </div>
        </SectionCard>

        <SectionCard title="System alerts" description="Operational items that need a look" bodyClassName="px-5 pb-5 pt-2">
          {alerts.length === 0 ? (
            <EmptyState
              icon={BellRing}
              title="All clear"
              description="No operational alerts at the moment. Low stock and overdue balances will show here."
            />
          ) : (
            <ul className="space-y-2">
              {alerts.map((alert, i) => (
                <li key={i} className={`rounded-xl px-3 py-2.5 text-[13px] ${alertStyle[alert.type]}`}>
                  <p className="font-medium text-ink">{alert.msg}</p>
                  <p className="mt-0.5 text-[11px] text-muted">Today</p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Best customers" description="Ranked by total amount paid" bodyClassName="overflow-x-auto">
          <table className="w-full min-w-[320px] text-sm">
            <thead>
              <tr className={TABLE_HEAD_ROW}>
                <th className="px-5 py-3">#</th>
                <th className="px-3 py-3">Customer</th>
                <th className="px-3 py-3">Orders</th>
                <th className="px-5 py-3">Total paid</th>
              </tr>
            </thead>
            <tbody>
              {bestCustomers.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <EmptyState
                      icon={Users}
                      title="No customer activity yet"
                      description="Top payers appear here once orders or payments are recorded."
                    />
                  </td>
                </tr>
              ) : null}
              {bestCustomers.map((c, i) => (
                <tr key={c.id} className={TABLE_BODY_ROW}>
                  <td className="px-5 py-3.5 font-semibold text-slate-400">{i + 1}</td>
                  <td className="px-3 py-3.5 font-semibold text-ink">{c.fullName}</td>
                  <td className="px-3 py-3.5 text-muted">{c.ordersCount}</td>
                  <td className="px-5 py-3.5 font-bold text-emerald-600">{formatMoney(c.totalPaid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>

        <SectionCard title="Recent orders" description="Latest activity across the station" bodyClassName="overflow-x-auto">
          <table className="w-full min-w-[320px] text-sm">
            <thead>
              <tr className={TABLE_HEAD_ROW}>
                <th className="px-5 py-3">Customer</th>
                <th className="px-3 py-3">Gallons</th>
                <th className="px-3 py-3">Amount</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <EmptyState
                      icon={ShoppingBag}
                      title="No orders yet"
                      description="Recent orders from the station will show up here."
                    />
                  </td>
                </tr>
              ) : null}
              {recentOrders.map((o) => {
                const id = o.userId || o.custId;
                const customer =
                  (state.users || []).find((u) => String(u.id) === String(id)) ||
                  (state.customers || []).find((c) => String(c.id) === String(id));
                return (
                  <tr key={o.id} className={TABLE_BODY_ROW}>
                    <td className="px-5 py-3.5 font-semibold text-ink">{customer?.fullName || '—'}</td>
                    <td className="px-3 py-3.5 text-muted">{o.quantity ?? o.gallons ?? '—'}</td>
                    <td className="px-3 py-3.5 font-bold text-ink">{formatMoney(o.total ?? o.amount)}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          o.status === 'Delivered'
                            ? 'bg-emerald-50 text-emerald-700'
                            : o.status === 'Cancelled'
                              ? 'bg-red-50 text-red-700'
                              : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {o.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </SectionCard>
      </div>
    </div>
  );
}
