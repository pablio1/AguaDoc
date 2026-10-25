// src/pages/DashboardPage.jsx
import { useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chart } from 'chart.js/auto';
import { useApp } from '../context/AppContext';

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
  const totalSales    = state.orders
    .filter(o => o.status === 'Delivered')
    .reduce((sum, o) => sum + (parseFloat(o.total ?? o.amount) || 0), 0);

  const totalDebt     = state.customers
    .reduce((sum, c) => sum + c.balance, 0);

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
      alerts.push({ type: 'danger', msg: `${c.fullName} has an overdue balance of ₱${c.balance}.` })
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
            borderColor: '#1eb8c8',
            backgroundColor: 'rgba(30,184,200,.1)',
            tension: 0.4,
            fill: true,
            borderWidth: 2,
            pointRadius: 3,
          },
          {
            label: 'Predicted',
            data: fitted,
            borderColor: '#6b46c1',
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
          y: { ticks: { font: { size: 11 }, callback: v => '₱' + v } },
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

  return (
    <div>

      {/* ── Welcome Banner ── */}
      <div className="agua-dark-mesh mb-4 flex flex-col gap-4 rounded-[1.5rem] px-6 py-5 text-white shadow-xl shadow-slate-900/10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-200/70">Operations</p>
          <h2 className="mt-1 font-display text-xl font-bold tracking-tight">Welcome back, Admin</h2>
          <p className="mt-0.5 text-xs text-white/55">Live pulse of sales, debt, and inventory.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/reports')}
          className="agua-btn agua-btn-primary cursor-pointer text-xs"
        >
          Generate Report
        </button>
      </div>

      {/* ── 4 Stat Cards ── */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">

        <div className="agua-card p-4">
          <div className="mb-1 text-xs text-muted">Total Sales (This Week)</div>
          <div className="font-display text-[22px] font-bold text-ink">₱{totalSales}</div>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold
            ${weekChangePct >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {weekChangePct >= 0 ? '+' : ''}{weekChangePct}% vs last week
          </span>
        </div>

        <div className="agua-card p-4">
          <div className="mb-1 text-xs text-muted">Outstanding Debt</div>
          <div className="font-display text-[22px] font-bold text-ink">₱{totalDebt}</div>
          <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">
            Needs attention
          </span>
        </div>

        <div className="agua-card p-4">
          <div className="mb-1 text-xs text-muted">Pending Orders</div>
          <div className="font-display text-[22px] font-bold text-ink">{pendingOrders}</div>
          <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
            Active
          </span>
        </div>

        <div className="agua-card p-4">
          <div className="mb-1 text-xs text-muted">Available Gallons</div>
          <div className="font-display text-[22px] font-bold text-ink">{availGallons}</div>
          <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full font-semibold mt-1
            ${availGallons < 50 ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
            {availGallons < 50 ? '⚠ Low Stock' : '✓ Good'}
          </span>
        </div>

      </div>

      {/* ── Chart + Alerts Row ── */}
      <div className="grid grid-cols-[3fr_2fr] gap-3.5 mb-3.5">

        {/* Sales Chart */}
        <div className="agua-card p-4">
          <div className="font-display text-[15px] font-bold">Sales Prediction vs Actual</div>
          <div className="mb-3 mt-0.5 text-xs text-muted">Actual daily sales vs. this week's trend line, based on real orders</div>
          <div className="relative h-[200px]">
            <canvas ref={canvasRef} />
          </div>
          <div className="flex gap-4 mt-2 text-xs text-gray-500">
            <span>
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-accent mr-1" />
              Actual
            </span>
            <span>
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-purple-600 mr-1" />
              Predicted
            </span>
          </div>
        </div>

        {/* System Alerts */}
        <div className="agua-card p-4">
          <div className="mb-3 font-display text-[15px] font-bold">System Alerts</div>
          {alerts.length === 0 ? (
            <div className="text-center text-gray-400 text-xs py-6">No alerts 🎉</div>
          ) : (
            alerts.map((alert, i) => (
              <div key={i} className={`flex gap-2.5 p-2.5 rounded-lg mb-2 text-[13px] ${alertStyle[alert.type]}`}>
                <div>
                  <div>{alert.msg}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">Today</div>
                </div>
              </div>
            ))
          )}
        </div>

      </div>

      {/* ── Best Customers + Recent Orders Row ── */}
      <div className="grid grid-cols-2 gap-3.5">

        {/* Best Customers */}
        <div className="agua-card p-4">
          <div className="font-display text-[15px] font-bold">Best Customers</div>
          <div className="mb-3 mt-0.5 text-xs text-muted">Ranked by total amount paid</div>
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                {['#', 'Customer', 'Orders', 'Total Paid'].map(h => (
                  <th key={h} className="text-left px-2.5 py-2 text-[11.5px] font-semibold text-gray-500 border-b-2 border-gray-100">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bestCustomers.map((c, i) => (
                <tr key={c.id} className="hover:bg-gray-50 border-b border-gray-100 last:border-b-0">
                  <td className="px-2.5 py-2.5 text-gray-400 font-semibold">{i + 1}</td>
                  <td className="px-2.5 py-2.5 font-medium">{c.fullName}</td>
                  <td className="px-2.5 py-2.5 text-gray-500">{c.ordersCount}</td>
                  <td className="px-2.5 py-2.5 font-semibold text-gray-700">
                    ₱{c.totalPaid}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recent Orders */}
        <div className="agua-card p-4">
          <div className="text-[15px] font-bold mb-3">📦 Recent Orders</div>
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr>
                {['Customer', 'Gallons', 'Amount', 'Status'].map(h => (
                  <th key={h} className="text-left px-2.5 py-2 text-[11.5px] font-semibold text-gray-500 border-b-2 border-gray-100">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentOrders.map(o => {
                // Orders from the customer portal use userId; admin-created orders use custId
                const id = o.userId || o.custId;
                const customer =
                  (state.users     || []).find(u => String(u.id) === String(id)) ||
                  (state.customers || []).find(c => String(c.id) === String(id));
                return (
                  <tr key={o.id} className="hover:bg-gray-50 border-b border-gray-100 last:border-b-0">
                    <td className="px-2.5 py-2.5 font-medium">
                      {customer?.fullName || '—'}
                    </td>
                    <td className="px-2.5 py-2.5 text-gray-500">{o.quantity ?? o.gallons ?? '—'}</td>
                    <td className="px-2.5 py-2.5 font-semibold">₱{o.total ?? o.amount ?? '—'}</td>
                    <td className="px-2.5 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11.5px] font-semibold
                        ${o.status === 'Delivered'
                          ? 'bg-green-100 text-green-800'
                          : o.status === 'Cancelled'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'}`}>
                        {o.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
