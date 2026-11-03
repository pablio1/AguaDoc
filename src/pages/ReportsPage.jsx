// src/pages/ReportsPage.jsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { showToast } from '../components/ui/Toast';
import { Chart } from 'chart.js/auto';
import PageHeader from '../components/admin/PageHeader';
import SectionCard from '../components/admin/SectionCard';
import FilterPills from '../components/admin/FilterPills';
import { TABLE_BODY_ROW, TABLE_HEAD_ROW } from '../components/admin/tableStyles';

export default function ReportsPage() {
  const { state } = useApp();
  const [mode, setMode] = useState('weekly');
  const chartRef  = useRef(null);
  const canvasRef = useRef(null);

  // ── Summary totals (replaces renderReports calculations) ──
  const grossTotal  = state.orders.reduce((sum, o) => sum + (parseFloat(o.total ?? o.amount) || 0), 0);
  const collected   = state.payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const outstanding = state.customers.reduce((sum, c) => sum + (parseFloat(c.balance) || 0), 0);

  // ── Real revenue breakdown, built from actual Delivered orders (no hardcoded numbers) ──
  const { weeklyLabels, weeklyData, monthlyLabels, monthlyData } = useMemo(() => {
    const delivered = state.orders.filter(o => o.status === 'Delivered');

    // Last 7 calendar days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weeklyLabels = [];
    const weeklyData   = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const total = delivered
        .filter(o => new Date(o.date).toISOString().slice(0, 10) === key)
        .reduce((sum, o) => sum + (parseFloat(o.total ?? o.amount) || 0), 0);
      weeklyLabels.push(d.toLocaleDateString('en-PH', { weekday: 'short' }));
      weeklyData.push(total);
    }

    // Last 12 calendar months
    const monthlyLabels = [];
    const monthlyData   = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const total = delivered
        .filter(o => {
          const od = new Date(o.date);
          return od.getFullYear() === d.getFullYear() && od.getMonth() === d.getMonth();
        })
        .reduce((sum, o) => sum + (parseFloat(o.total ?? o.amount) || 0), 0);
      monthlyLabels.push(d.toLocaleDateString('en-PH', { month: 'short' }));
      monthlyData.push(total);
    }

    return { weeklyLabels, weeklyData, monthlyLabels, monthlyData };
  }, [state.orders]);

  // ── Revenue chart (replaces renderReports chart) ──
  useEffect(() => {
    if (chartRef.current) chartRef.current.destroy();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const labels = mode === 'weekly' ? weeklyLabels : monthlyLabels;
    const data   = mode === 'weekly' ? weeklyData   : monthlyData;
    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'Revenue', data, backgroundColor: '#3B82F6', borderRadius: 6 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { ticks: { font: { size: 11 }, callback: v => '₱' + v.toLocaleString() } },
        },
      },
    });
    return () => chartRef.current?.destroy();
  }, [mode, weeklyLabels, weeklyData, monthlyLabels, monthlyData]);

  // ── Export CSV (replaces exportCSV) ──
  function handleExportCSV() {
    const rows = [['Customer', 'Order ID', 'Gallons', 'Amount', 'Payment', 'Date', 'Status']];
    state.orders.forEach(o => {
      const id  = o.userId || o.custId;
      const c   =
        (state.users     || []).find(u => String(u.id) === String(id)) ||
        (state.customers || []).find(x => String(x.id) === String(id));
      const pay = state.payments.find(p =>
        (String(p.custId) === String(id) || String(p.userId) === String(id)) && p.orderId === o.id
      );
      rows.push([
        c?.fullName ?? '—',
        '#' + o.id,
        o.quantity ?? o.gallons ?? '—',
        '₱' + (o.total ?? o.amount ?? 0),
        pay ? pay.method : 'Unpaid',
        o.date || o.createdAt || '—',
        o.status,
      ]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'AguaDoc_Report.csv';
    a.click();
    showToast('📥 CSV exported!');
  }

  // ── Payment method badge ──
  const methodBadge = {
    Cash:   'bg-indigo-100 text-indigo-800',
    GCash:  'bg-green-100 text-green-800',
    Online: 'bg-blue-100 text-blue-800',
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Reports & analytics" subtitle="Financial summaries and order-level transaction history.">
        <button
          type="button"
          onClick={handleExportCSV}
          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-ink hover:bg-slate-50"
        >
          Export CSV
        </button>
        <button type="button" onClick={() => window.print()} className="agua-btn agua-btn-primary !py-2 !text-xs">
          Print
        </button>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="agua-card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">Gross total sales</p>
          <p className="mt-2 font-display text-2xl font-bold text-ink">₱{Math.round(grossTotal).toLocaleString()}</p>
        </div>
        <div className="agua-card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">Actual collections</p>
          <p className="mt-2 font-display text-2xl font-bold text-emerald-600">₱{Math.round(collected).toLocaleString()}</p>
        </div>
        <div className="agua-card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">Outstanding debts</p>
          <p className="mt-2 font-display text-2xl font-bold text-red-600">₱{Math.round(outstanding).toLocaleString()}</p>
        </div>
      </div>

      <SectionCard
        title={`${mode === 'weekly' ? 'Weekly' : 'Monthly'} revenue`}
        description="Delivered order revenue for the selected period"
        action={
          <FilterPills
            options={[
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
            ]}
            value={mode}
            onChange={setMode}
            className="!mb-0"
          />
        }
        bodyClassName="px-5 pb-5 pt-2"
      >
        <div className="relative h-[240px]">
          <canvas ref={canvasRef} />
        </div>
      </SectionCard>

      <SectionCard title="Transaction history" description="All orders with payment and status" bodyClassName="max-h-[400px] overflow-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className={TABLE_HEAD_ROW}>
              {['Customer', 'Order ID', 'Gallons', 'Amount', 'Payment', 'Date', 'Status'].map((h) => (
                <th key={h} className={`whitespace-nowrap px-3 py-3 ${h === 'Customer' ? 'pl-5' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.orders.map((o) => {
              const id  = o.userId || o.custId;
              const customer =
                (state.users     || []).find(u => String(u.id) === String(id)) ||
                (state.customers || []).find(x => String(x.id) === String(id));
              const pay = state.payments.find(p =>
                (String(p.custId) === String(id) || String(p.userId) === String(id)) && p.orderId === o.id
              );
              const displayDate = o.date || o.createdAt
                ? new Date(o.date || o.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                : '—';
              return (
                <tr key={o.id} className={TABLE_BODY_ROW}>
                  <td className="px-5 py-3.5 font-semibold text-ink">{customer?.fullName ?? '—'}</td>
                  <td className="px-3 py-3.5 font-mono text-xs text-muted">#{String(o.id).padStart(2, '0')}</td>
                  <td className="px-3 py-3.5 text-muted">{o.quantity ?? o.gallons ?? '—'}</td>
                  <td className="px-3 py-3.5 font-bold text-ink">₱{o.total ?? o.amount ?? '—'}</td>
                  <td className="px-3 py-3.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-semibold
                      ${pay ? (methodBadge[pay.method] ?? 'bg-gray-100 text-gray-600') : 'bg-yellow-100 text-yellow-800'}`}>
                      {pay ? pay.method : 'Unpaid'}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-muted">{displayDate}</td>
                  <td className="px-3 py-3.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-semibold
                      ${o.status === 'Delivered' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
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
  );
}
