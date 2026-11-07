// src/pages/PredictionsPage.jsx
import { useEffect, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Chart } from 'chart.js/auto';
import PageHeader from '../components/admin/PageHeader';
import SectionCard from '../components/admin/SectionCard';
import { TABLE_BODY_ROW, TABLE_HEAD_ROW } from '../components/admin/tableStyles';
import EmptyState from '../components/admin/EmptyState';
import { Users } from 'lucide-react';
import { formatMoney } from '../lib/money';

const HISTORY_DAYS = 14; // how many past days feed the trend line
const FORECAST_DAYS = 7; // how many days ahead we project

function dateKey(d) {
  return new Date(d).toISOString().slice(0, 10); // YYYY-MM-DD, local-agnostic bucket key
}
function shortLabel(d) {
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

// Ordinary least-squares fit: given y-values at x = 0..n-1, returns { slope, intercept }.
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

export default function PredictionsPage() {
  const { state }  = useApp();   // read-only — no dispatch needed
  const canvasRef  = useRef(null);
  const chartRef   = useRef(null);

  // ── Real daily sales history, built from actual Delivered orders ──
  const { actualDays, actualTotals, predictedTotals, predToday, predWeek, predMonth } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Bucket every Delivered order's total under the calendar day it was placed.
    const byDay = {};
    state.orders
      .filter(o => o.status === 'Delivered')
      .forEach(o => {
        const key = dateKey(o.date);
        byDay[key] = (byDay[key] || 0) + (parseFloat(o.total) || 0);
      });

    // Build the last HISTORY_DAYS as a zero-filled series (oldest → today).
    const actualDays = [];
    const actualTotals = [];
    for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      actualDays.push(d);
      actualTotals.push(byDay[dateKey(d)] || 0);
    }

    // 7-day moving average — "today's" forecast, a real average of real recent days.
    const last7 = actualTotals.slice(-7);
    const predToday = Math.round(last7.reduce((a, b) => a + b, 0) / last7.length);

    // Linear trend fitted on the same HISTORY_DAYS window, projected forward.
    const { slope, intercept } = linearRegression(actualTotals);
    const predictedTotals = [];
    for (let i = 0; i < FORECAST_DAYS; i++) {
      const x = HISTORY_DAYS + i; // continues the same x-axis used for the fit
      predictedTotals.push(Math.max(0, Math.round(slope * x + intercept)));
    }
    const predWeek  = predictedTotals.reduce((a, b) => a + b, 0);
    // Scaled from the weekly figure rather than a separate 30-day fit — a trend line
    // extrapolated a full month out from 14 days of data gets unreliable fast.
    const predMonth = Math.round((predWeek / FORECAST_DAYS) * 30);

    return { actualDays, actualTotals, predictedTotals, predToday, predWeek, predMonth };
  }, [state.orders]);

  // Debt risk per customer (replaces riskTable logic)
  const riskData = state.customers.map(c => {
    const score    = c.balance > 300 ? 92 : c.balance > 100 ? 58 : c.balance > 0 ? 30 : 5;
    const risk     = score > 70 ? 'High' : score > 40 ? 'Medium' : 'Low';
    const barColor = score > 70 ? '#e53e3e' : score > 40 ? '#f59e0b' : '#38a169';
    const bgColor  = score > 70 ? '#fee2e2' : score > 40 ? '#fef3c7' : '#d1fae5';
    const badgeStyle = score > 70 ? 'bg-red-50 text-red-700' : score > 40 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700';
    return { ...c, score, risk, barColor, bgColor, badgeStyle };
  });

  // Prediction chart — real actual history + real trend-projected forecast
  useEffect(() => {
    if (chartRef.current) chartRef.current.destroy();
    const ctx = canvasRef.current.getContext('2d');

    const forecastDays = [];
    for (let i = 1; i <= FORECAST_DAYS; i++) {
      const d = new Date(actualDays[actualDays.length - 1]);
      d.setDate(d.getDate() + i);
      forecastDays.push(d);
    }
    const labels = [...actualDays, ...forecastDays].map(shortLabel);

    // Predicted series starts at the last actual point so the two lines visually connect.
    const predictedSeries = [
      ...Array(actualTotals.length - 1).fill(null),
      actualTotals[actualTotals.length - 1],
      ...predictedTotals,
    ];
    const actualSeries = [...actualTotals, ...Array(FORECAST_DAYS).fill(null)];

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Actual', data: actualSeries, borderColor: '#3B82F6', backgroundColor: 'rgba(59,130,246,.06)', tension: 0.3, borderWidth: 2, pointRadius: 2, spanGaps: false },
          { label: 'Predicted', data: predictedSeries, borderColor: '#94a3b8', borderDash: [5, 4], tension: 0.3, borderWidth: 2, pointRadius: 2, spanGaps: false },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
          y: { ticks: { font: { size: 10 }, callback: (v) => formatMoney(v) } },
        },
      },
    });
    return () => chartRef.current?.destroy();
  }, [actualDays, actualTotals, predictedTotals]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI Predictions"
        subtitle={`Forecasts from the last ${HISTORY_DAYS} days of delivered orders (moving average + trend line).`}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Predicted today', value: formatMoney(predToday), note: 'Average of last 7 actual days' },
          { label: 'Predicted this week', value: formatMoney(predWeek), note: 'Trend line projected 7 days ahead' },
          { label: 'Predicted this month', value: formatMoney(predMonth), note: 'Weekly forecast scaled to 30 days' },
        ].map((p) => (
          <div key={p.label} className="agua-card px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">{p.label}</p>
            <p className="mt-2 font-display text-2xl font-bold text-ink">{p.value}</p>
            <p className="mt-1 text-xs text-muted">{p.note}</p>
          </div>
        ))}
      </div>

      <SectionCard title="Sales forecast" description="Actual history vs. projected trend" bodyClassName="px-5 pb-5 pt-2">
        <div className="relative h-[200px]">
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

      <SectionCard title="Debt risk" description="Walk-in customers ranked by balance-based risk score" bodyClassName="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className={TABLE_HEAD_ROW}>
              {['Customer', 'Balance', 'Risk score', 'Risk level'].map((h) => (
                <th key={h} className={`px-3 py-3 ${h === 'Customer' ? 'pl-5' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {riskData.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <EmptyState
                    icon={Users}
                    title="No walk-in customers"
                    description="Debt risk scores appear when walk-in accounts exist in Debt Management."
                  />
                </td>
              </tr>
            ) : null}
            {riskData.map((c) => (
              <tr key={c.id} className={TABLE_BODY_ROW}>
                <td className="px-5 py-3.5 font-semibold text-ink">{c.fullName}</td>
                <td className={`px-3 py-3.5 font-bold ${Number(c.balance) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {formatMoney(c.balance)}
                </td>
                <td className="px-3 py-3.5">
                  <div className="mb-0.5 h-1.5 w-full max-w-[140px] rounded-full" style={{ background: c.bgColor }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${c.score}%`, background: c.barColor }} />
                  </div>
                  <span className="text-[11px] text-muted">{c.score}%</span>
                </td>
                <td className="px-3 py-3.5">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${c.badgeStyle}`}>
                    {c.risk}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}
