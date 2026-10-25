// src/pages/ReportsPage.jsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { showToast } from '../components/ui/Toast';
import { Chart } from 'chart.js/auto';

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
        datasets: [{ label: 'Revenue', data, backgroundColor: '#7c3aed', borderRadius: 5 }],
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
    <div>
      <div className="agua-card p-4">

        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="text-[15px] font-bold">📊 Reports & Analytics</div>
            <div className="text-xs text-gray-500 mt-0.5">Generate financial summaries and review transaction histories.</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExportCSV}
              className="border border-gray-200 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              ⬇ Export CSV
            </button>
            <button
              onClick={() => window.print()}
              className="bg-accent text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-accent2 transition cursor-pointer"
            >
              🖨 Print
            </button>
          </div>
        </div>

        {/* Summary Stat Cards */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-green-600 rounded-xl p-3.5 text-white">
            <div className="text-xs opacity-85">Gross Total Sales</div>
            <div className="text-[22px] font-black mt-1">₱{Math.round(grossTotal).toLocaleString()}</div>
          </div>
          <div className="bg-blue-600 rounded-xl p-3.5 text-white">
            <div className="text-xs opacity-85">Actual Collections</div>
            <div className="text-[22px] font-black mt-1">₱{Math.round(collected).toLocaleString()}</div>
          </div>
          <div className="bg-red-500 rounded-xl p-3.5 text-white">
            <div className="text-xs opacity-85">Outstanding Debts</div>
            <div className="text-[22px] font-black mt-1">₱{Math.round(outstanding).toLocaleString()}</div>
          </div>
        </div>

        {/* Weekly / Monthly Toggle */}
        <div className="flex gap-2 mb-3">
          {['weekly', 'monthly'].map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition cursor-pointer
                ${mode === m
                  ? 'bg-accent text-white border-accent'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-accent hover:text-accent'}`}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        {/* Revenue Chart */}
        <div className="text-[11.5px] font-bold text-gray-500 uppercase tracking-wide mb-2">
          {mode === 'weekly' ? 'Weekly' : 'Monthly'} Revenue Breakdown
        </div>
        <div className="relative h-[240px] mb-4">
          <canvas ref={canvasRef} />
        </div>

        {/* Transaction History Table */}
        <div className="text-[11.5px] font-bold text-gray-500 uppercase tracking-wide mb-2">
          Customer Transaction History
        </div>
        <div className="max-h-[360px] overflow-y-auto border border-gray-100 rounded-lg">
        <table className="w-full text-[13px] border-collapse">
          <thead className="sticky top-0 bg-white z-10">
            <tr>
              {['Customer', 'Order ID', 'Gallons', 'Amount', 'Payment', 'Date', 'Status'].map(h => (
                <th key={h} className="text-left px-2.5 py-2 text-[11.5px] font-semibold text-gray-500 border-b-2 border-gray-200 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.orders.map(o => {
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
                <tr key={o.id} className="hover:bg-gray-50 border-b border-gray-100 last:border-b-0">
                  <td className="px-2.5 py-2.5 font-medium">{customer?.fullName ?? '—'}</td>
                  <td className="px-2.5 py-2.5 font-mono text-gray-600">#{String(o.id).padStart(2, '0')}</td>
                  <td className="px-2.5 py-2.5 text-gray-500">{o.quantity ?? o.gallons ?? '—'}</td>
                  <td className="px-2.5 py-2.5 font-semibold">₱{o.total ?? o.amount ?? '—'}</td>
                  <td className="px-2.5 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-semibold
                      ${pay ? (methodBadge[pay.method] ?? 'bg-gray-100 text-gray-600') : 'bg-yellow-100 text-yellow-800'}`}>
                      {pay ? pay.method : 'Unpaid'}
                    </span>
                  </td>
                  <td className="px-2.5 py-2.5 text-gray-500">{displayDate}</td>
                  <td className="px-2.5 py-2.5">
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
        </div>

      </div>
    </div>
  );
}
