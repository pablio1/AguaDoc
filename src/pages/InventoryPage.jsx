import { useMemo, useState } from 'react';
import { Package, Plus, AlertTriangle, Droplets, Box, Wrench } from 'lucide-react';
import { useApp } from '../context/AppContext';
import Modal from '../components/ui/Modal';
import { showToast } from '../components/ui/Toast';
import { apiRestockItem, apiUpdateInventory } from '../api';

const CATEGORY_META = {
  Containers: { icon: Box, tint: 'from-sky-400/20 to-cyan-500/10', ring: 'ring-sky-200/60', chip: 'bg-sky-50 text-sky-700' },
  'Water Refill': { icon: Droplets, tint: 'from-cyan-400/20 to-teal-500/10', ring: 'ring-cyan-200/60', chip: 'bg-cyan-50 text-cyan-700' },
  Accessories: { icon: Wrench, tint: 'from-amber-400/15 to-orange-400/10', ring: 'ring-amber-200/60', chip: 'bg-amber-50 text-amber-700' },
};

function formatPeso(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default function InventoryPage() {
  const { state, dispatch } = useApp();
  const inventory = state.inventory || { readyGallons: 0, totalGallons: 0, waterLevel: 0, maxCapacity: 10000 };
  const stockItems = Array.isArray(state.stockItems) ? state.stockItems : [];

  const [restockItem, setRestockItem] = useState(null);
  const [restockQty, setRestockQty] = useState(10);
  const [saving, setSaving] = useState(false);
  const [showTankModal, setShowTankModal] = useState(false);
  const [tankForm, setTankForm] = useState({
    waterLevel: inventory.waterLevel,
    maxCapacity: inventory.maxCapacity,
  });

  const lowCount = useMemo(
    () => stockItems.filter((i) => Number(i.stock) <= Number(i.minAlert)).length,
    [stockItems]
  );

  const waterPct = inventory.maxCapacity > 0
    ? Math.round((Number(inventory.waterLevel) / Number(inventory.maxCapacity)) * 100)
    : 0;

  async function handleRestock() {
    if (!restockItem) return;
    const qty = parseInt(restockQty, 10);
    if (!qty || qty < 1) {
      showToast('⚠ Enter a valid quantity.');
      return;
    }
    setSaving(true);
    try {
      const updated = await apiRestockItem(restockItem.id, qty);
      dispatch({ type: 'UPDATE_STOCK_ITEM', payload: updated });
      showToast(`✅ Restocked ${restockItem.name} (+${qty})`);
      setRestockItem(null);
      setRestockQty(10);
    } catch (e) {
      showToast(`❌ ${e.message || 'Restock failed.'}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTank() {
    setSaving(true);
    try {
      const updated = await apiUpdateInventory({
        ...inventory,
        waterLevel: parseFloat(tankForm.waterLevel) || 0,
        maxCapacity: parseFloat(tankForm.maxCapacity) || inventory.maxCapacity,
        readyGallons: inventory.readyGallons,
        totalGallons: inventory.totalGallons,
      });
      dispatch({ type: 'SET_INVENTORY', payload: updated });
      showToast('✅ Water tank levels updated');
      setShowTankModal(false);
    } catch {
      showToast('❌ Failed to update tank levels.');
    } finally {
      setSaving(false);
    }
  }

  function openRestock(item, defaultQty = 10) {
    setRestockItem(item);
    setRestockQty(defaultQty);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-ink">Inventory & Stocks</h2>
          <p className="mt-0.5 text-sm text-muted">
            Monitor gallon supplies, caps, seals, and refill inventory.
            {lowCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 font-semibold text-amber-600">
                <AlertTriangle size={13} /> {lowCount} low
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => stockItems[0] && openRestock(stockItems[0])}
          disabled={!stockItems.length}
          className="agua-btn agua-btn-primary self-start disabled:opacity-50"
        >
          <Plus size={16} /> Restock Item
        </button>
      </div>

      {/* Summary cards — one per stock line */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {stockItems.length === 0 ? (
          <div className="agua-card col-span-full p-8 text-center text-sm text-muted">
            No stock items yet. Run <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">npm run db:migrate</code> in <code className="text-xs">backend/</code> to seed inventory.
          </div>
        ) : (
          stockItems.map((item) => {
            const meta = CATEGORY_META[item.category] || CATEGORY_META.Containers;
            const Icon = meta.icon;
            const low = Number(item.stock) <= Number(item.minAlert);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openRestock(item)}
                className={`agua-card group relative overflow-hidden p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg ring-1 ${meta.ring}`}
              >
                <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${meta.tint}`} />
                <div className="relative flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{item.category}</p>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-ink">{item.name}</p>
                    <p className="mt-3 font-display text-2xl font-bold text-ink">
                      {Number(item.stock).toLocaleString()}
                      <span className="ml-1 text-xs font-semibold text-muted">{item.unit || 'units'}</span>
                    </p>
                    {low && (
                      <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                        <AlertTriangle size={11} /> Below min ({item.minAlert})
                      </p>
                    )}
                  </div>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80 text-accent2 shadow-sm ring-1 ring-slate-100">
                    <Icon size={16} />
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Water tank strip (station supply — still useful for AguaDoc) */}
      <div className="agua-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-ink">Station water tank</p>
              <p className="text-xs text-muted">Bulk supply level used for refills</p>
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              waterPct < 20 ? 'bg-red-100 text-red-700' : waterPct < 50 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {waterPct}%
            </span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${
                waterPct < 20 ? 'bg-red-500' : waterPct < 50 ? 'bg-amber-400' : 'bg-gradient-to-r from-cyan-400 to-teal-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, waterPct))}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            {Number(inventory.waterLevel).toLocaleString()} / {Number(inventory.maxCapacity).toLocaleString()} L
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setTankForm({ waterLevel: inventory.waterLevel, maxCapacity: inventory.maxCapacity });
            setShowTankModal(true);
          }}
          className="shrink-0 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-ink hover:bg-foam"
        >
          Adjust tank
        </button>
      </div>

      {/* Stock table */}
      <div className="agua-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="font-display text-base font-bold text-ink">Stock Inventory Table</h3>
            <p className="text-xs text-muted">Current counts, alert thresholds, and unit prices</p>
          </div>
          <Package size={18} className="text-slate-300" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-foam/60 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Item Name</th>
                <th className="px-3 py-3">Category</th>
                <th className="px-3 py-3">Current Stock</th>
                <th className="px-3 py-3">Minimum Alert</th>
                <th className="px-3 py-3">Unit Price</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {stockItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted">
                    No stock rows to show.
                  </td>
                </tr>
              ) : (
                stockItems.map((item) => {
                  const meta = CATEGORY_META[item.category] || CATEGORY_META.Containers;
                  const low = Number(item.stock) <= Number(item.minAlert);
                  return (
                    <tr key={item.id} className="border-b border-slate-50 last:border-b-0 hover:bg-foam/40">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-ink">{item.name}</p>
                        {low && (
                          <p className="mt-0.5 text-[11px] font-semibold text-amber-600">Needs restock</p>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${meta.chip}`}>
                          {item.category}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className={`font-bold ${low ? 'text-amber-700' : 'text-ink'}`}>
                          {Number(item.stock).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-muted">{Number(item.minAlert).toLocaleString()}</td>
                      <td className="px-3 py-3.5 font-medium text-ink">{formatPeso(item.unitPrice)}</td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => openRestock(item)}
                          className="rounded-lg bg-cyan-50 px-3 py-1.5 text-[11.5px] font-semibold text-accent2 ring-1 ring-cyan-200/70 transition hover:bg-cyan-100"
                        >
                          Restock
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Restock modal */}
      {restockItem && (
        <Modal title="Restock Item" onClose={() => setRestockItem(null)}>
          <p className="mb-1 text-sm font-semibold text-ink">{restockItem.name}</p>
          <p className="mb-4 text-xs text-muted">
            Current stock: <strong>{Number(restockItem.stock).toLocaleString()}</strong>
            {' · '}Min alert: {Number(restockItem.minAlert).toLocaleString()}
          </p>

          {stockItems.length > 1 && (
            <div className="mb-3">
              <label className="mb-1 block text-xs font-semibold text-muted">Item</label>
              <select
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-accent"
                value={restockItem.id}
                onChange={(e) => {
                  const next = stockItems.find((i) => i.id === e.target.value);
                  if (next) setRestockItem(next);
                }}
              >
                {stockItems.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="mb-4">
            <label className="mb-1 block text-xs font-semibold text-muted">Quantity to add</label>
            <input
              type="number"
              min="1"
              value={restockQty}
              onChange={(e) => setRestockQty(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRestockItem(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-foam"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleRestock}
              className="agua-btn agua-btn-primary disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Confirm Restock'}
            </button>
          </div>
        </Modal>
      )}

      {/* Tank modal */}
      {showTankModal && (
        <Modal title="Adjust Water Tank" onClose={() => setShowTankModal(false)}>
          <div className="mb-3">
            <label className="mb-1 block text-xs font-semibold text-muted">Current level (L)</label>
            <input
              type="number"
              min="0"
              value={tankForm.waterLevel}
              onChange={(e) => setTankForm({ ...tankForm, waterLevel: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="mb-4">
            <label className="mb-1 block text-xs font-semibold text-muted">Max capacity (L)</label>
            <input
              type="number"
              min="1"
              value={tankForm.maxCapacity}
              onChange={(e) => setTankForm({ ...tankForm, maxCapacity: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowTankModal(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-foam">
              Cancel
            </button>
            <button type="button" disabled={saving} onClick={handleSaveTank} className="agua-btn agua-btn-primary disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
