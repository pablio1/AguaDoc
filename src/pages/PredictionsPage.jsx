// src/pages/PredictionsPage.jsx
import { useEffect, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Chart } from 'chart.js/auto';

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
    const badgeStyle = score > 70 ? 'bg-red-100 text-red-800' : score > 40 ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800';
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
          { label: 'Actual', data: actualSeries, borderColor: '#1eb8c8', tension: 0.3, borderWidth: 2, pointRadius: 2, spanGaps: false },
          { label: 'Predicted', data: predictedSeries, borderColor: '#f59e0b', borderDash: [5, 4], tension: 0.3, borderWidth: 2, pointRadius: 2, spanGaps: false },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
          y: { ticks: { font: { size: 10 }, callback: v => '₱' + v } },
        },
      },
    });
    return () => chartRef.current?.destroy();
  }, [actualDays, actualTotals, predictedTotals]);

  return (
    <div>

      {/* Sales Prediction Card */}
      <div className="agua-card p-4 mb-3.5">
        <div className="text-[15px] font-bold">📈 Sales Prediction</div>
        <div className="text-xs text-gray-500 mt-0.5 mb-3">
          Forecast based on your last {HISTORY_DAYS} days of actual delivered orders (moving average + trend line) — not a trained ML model.
        </div>

        {/* 3 prediction values */}
        <div className="grid grid-cols-3 gap-3 mb-3.5">
          {[
            { label: 'Predicted Today',      value: `₱${predToday}`, note: 'Average of last 7 actual days' },
            { label: 'Predicted This Week',   value: `₱${predWeek}`,  note: 'Trend line projected 7 days ahead' },
            { label: 'Predicted This Month',  value: `₱${predMonth}`, note: 'Weekly forecast scaled to 30 days' },
          ].map(p => (
            <div key={p.label} className="bg-gray-50 rounded-xl p-3.5">
              <div className="text-[11.5px] text-gray-500 font-semibold uppercase tracking-wide mb-1">{p.label}</div>
              <div className="text-[20px] font-black text-gray-800">{p.value}</div>
              <div className="text-xs text-gray-400 mt-0.5">{p.note}</div>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="relative h-[180px]">
          <canvas ref={canvasRef} />
        </div>
        <div className="flex gap-4 mt-2 text-xs text-gray-500">
          <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-accent mr-1" />Actual Sales</span>
          <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-yellow-400 mr-1" />Predicted</span>
        </div>
      </div>

      {/* Debt Risk Table */}
      <div className="agua-card p-4">
        <div className="text-[15px] font-bold">⚠ Debt Risk Prediction</div>
        <div className="text-xs text-gray-500 mt-0.5 mb-3">Customers likely to default on payment</div>
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr>
              {['Customer','Balance','Risk Score','Risk Level'].map(h => (
                <th key={h} className="text-left px-2 py-1.5 text-[11.5px] font-semibold text-gray-500 border-b-2 border-gray-100">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {riskData.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 border-b border-gray-100 last:border-b-0">
                <td className="px-2 py-2.5 font-medium">{c.fullName}</td>
                <td className={`px-2 py-2.5 font-bold ${c.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>₱{c.balance}</td>
                <td className="px-2 py-2.5">
                  <div className="rounded h-1.5 w-full mb-0.5" style={{ background: c.bgColor }}>
                    <div className="h-1.5 rounded" style={{ width: `${c.score}%`, background: c.barColor }} />
                  </div>
                  <small className="text-gray-400 text-[11px]">{c.score}%</small>
                </td>
                <td className="px-2 py-2.5">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-semibold ${c.badgeStyle}`}>{c.risk}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
