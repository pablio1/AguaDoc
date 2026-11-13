import { useMemo, useState } from 'react';
import { Package, Plus, AlertTriangle, Box, Droplets, Wrench, ClipboardList } from 'lucide-react';
import { useApp } from '../context/AppContext';
import Modal from '../components/ui/Modal';
import { showToast } from '../components/ui/Toast';
import { apiRestockItem, apiUpdateInventory } from '../api';
import PageHeader from '../components/admin/PageHeader';
import SectionCard from '../components/admin/SectionCard';
import EmptyState from '../components/admin/EmptyState';
import { TABLE_BODY_ROW, TABLE_HEAD_ROW } from '../components/admin/tableStyles';
import { formatMoney } from '../lib/money';

const CATEGORY_META = {
  Containers: { icon: Box, iconBg: 'bg-sky-50 text-sky-600' },
  'Water Refill': { icon: Droplets, iconBg: 'bg-blue-50 text-blue-600' },
  Accessories: { icon: Wrench, iconBg: 'bg-amber-50 text-amber-600' },
};

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function currentAdminName() {
  try {
    const saved = JSON.parse(localStorage.getItem('aguadoc_user') || 'null');
    return saved?.fullName || saved?.username || 'Admin';
  } catch {
    return 'Admin';
  }
}

export default function InventoryPage() {
  const { state, dispatch } = useApp();
  const inventory = state.inventory || { readyGallons: 0, totalGallons: 0, waterLevel: 0, maxCapacity: 10000 };
  const stockItems = Array.isArray(state.stockItems) ? state.stockItems : [];
  const restockLogs = Array.isArray(state.restockLogs) ? state.restockLogs : [];

  const [restockItem, setRestockItem] = useState(null);
  const [restockQty, setRestockQty] = useState(10);
  const [restockNote, setRestockNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [showTankModal, setShowTankModal] = useState(false);
  const [tankForm, setTankForm] = useState({
    waterLevel: inventory.waterLevel,
    maxCapacity: inventory.maxCapacity,
    readyGallons: inventory.readyGallons,
  });

  const lowCount = useMemo(
    () => stockItems.filter((i) => Number(i.stock) <= Number(i.minAlert)).length,
    [stockItems]
  );

  const waterPct = inventory.maxCapacity > 0
    ? Math.round((Number(inventory.waterLevel) / Number(inventory.maxCapacity)) * 100)
    : 0;

  const refillStock = useMemo(
    () => stockItems.filter((i) => i.category === 'Water Refill'),
    [stockItems]
  );
  const refillUnits = useMemo(
    () => refillStock.reduce((sum, i) => sum + (Number(i.stock) || 0), 0),
    [refillStock]
  );

  async function handleRestock() {
    if (!restockItem) return;
    const qty = parseInt(restockQty, 10);
    if (!qty || qty < 1) {
      showToast('⚠ Enter a valid quantity.');
      return;
    }
    setSaving(true);
    try {
      const result = await apiRestockItem(restockItem.id, qty, {
        performedBy: currentAdminName(),
        note: restockNote.trim() || undefined,
      });
      const updated = result?.item || result;
      dispatch({ type: 'UPDATE_STOCK_ITEM', payload: updated });
      if (result?.log) {
        dispatch({ type: 'ADD_RESTOCK_LOG', payload: result.log });
      }
      showToast(`✅ Restocked ${restockItem.name} (+${qty})`);
      setRestockItem(null);
      setRestockQty(10);
      setRestockNote('');
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
        readyGallons: parseInt(tankForm.readyGallons, 10) || 0,
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
    setRestockNote('');
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory & Stocks"
        subtitle={
          <>
            Stock decreases automatically when orders are marked Ready to Go or Delivered.
            {lowCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 font-semibold text-amber-600">
                <AlertTriangle size={13} /> {lowCount} low
              </span>
            )}
          </>
        }
      >
        <button
          type="button"
          onClick={() => stockItems[0] && openRestock(stockItems[0])}
          disabled={!stockItems.length}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-500/25 transition hover:bg-emerald-600 disabled:opacity-50"
        >
          <Plus size={16} /> Restock Item
        </button>
      </PageHeader>

      {/* Station snapshot */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="agua-card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">Tank water</p>
          <p className="mt-2 font-display text-2xl font-bold text-blue-600">
            {Number(inventory.waterLevel).toLocaleString()} L
          </p>
          <p className="mt-1 text-xs text-muted">{waterPct}% of {Number(inventory.maxCapacity).toLocaleString()} L</p>
        </div>
        <div className="agua-card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">Ready gallons</p>
          <p className="mt-2 font-display text-2xl font-bold text-ink">
            {Number(inventory.readyGallons || 0).toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-muted">Filled jugs ready for pickup / delivery</p>
        </div>
        <div className="agua-card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">Refill stock</p>
          <p className="mt-2 font-display text-2xl font-bold text-emerald-600">
            {refillUnits.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-muted">Units across water refill SKUs</p>
        </div>
      </div>

      {/* Summary cards — clean white cards, category / name / qty / icon */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {stockItems.length === 0 ? (
          <div className="agua-card col-span-full">
            <EmptyState
              icon={Package}
              title="No stock items yet"
              description="Run npm run db:migrate in backend/ to seed the inventory catalog."
            />
          </div>
        ) : (
          stockItems.map((item) => {
            const meta = CATEGORY_META[item.category] || CATEGORY_META.Containers;
            const Icon = meta.icon;
            const stock = Number(item.stock) || 0;
            const minAlert = Number(item.minAlert) || 0;
            const low = stock <= minAlert;
            const barMax = Math.max(minAlert * 3, stock, 1);
            const barPct = Math.min(100, Math.round((stock / barMax) * 100));
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openRestock(item)}
                className={`group rounded-2xl border p-4 text-left shadow-[0_8px_24px_rgba(15,42,74,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,42,74,0.08)] ${
                  low ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200/80 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                      {item.category}
                    </p>
                    <p className="mt-1.5 line-clamp-2 text-[13.5px] font-semibold leading-snug text-ink">
                      {item.name}
                    </p>
                    <p className="mt-3 text-[26px] font-bold leading-none tracking-tight text-ink">
                      {stock.toLocaleString()}
                      <span className="ml-1.5 text-xs font-medium text-slate-400">{item.unit || 'units'}</span>
                    </p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all ${
                          low ? 'bg-amber-500' : 'bg-gradient-to-r from-blue-400 to-blue-600'
                        }`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    {low ? (
                      <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                        <AlertTriangle size={11} /> Below min ({minAlert})
                      </p>
                    ) : (
                      <p className="mt-2 text-[11px] text-slate-400">Min alert {minAlert}</p>
                    )}
                  </div>
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.iconBg}`}>
                    <Icon size={18} />
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      <SectionCard
        title="Stock Inventory Table"
        bodyClassName="overflow-x-auto"
      >
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className={TABLE_HEAD_ROW}>
                <th className="px-5 py-3">Item Name</th>
                <th className="px-3 py-3">Category</th>
                <th className="px-3 py-3">Current Stock</th>
                <th className="px-3 py-3">Minimum Alert Level</th>
                <th className="px-3 py-3">Unit Price</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {stockItems.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState icon={Package} title="No stock rows" description="Seed inventory to populate this table." />
                  </td>
                </tr>
              ) : (
                stockItems.map((item) => {
                  const low = Number(item.stock) <= Number(item.minAlert);
                  return (
                    <tr key={item.id} className={TABLE_BODY_ROW}>
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-ink">{item.name}</p>
                        {low && (
                          <p className="mt-0.5 text-[11px] font-semibold text-amber-600">Needs restock</p>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-slate-600">{item.category}</td>
                      <td className="px-3 py-3.5">
                        <span className={`font-bold ${low ? 'text-amber-700' : 'text-ink'}`}>
                          {Number(item.stock).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-slate-500">{Number(item.minAlert).toLocaleString()}</td>
                      <td className="px-3 py-3.5 font-medium text-ink">{formatMoney(item.unitPrice)}</td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => openRestock(item)}
                          className="rounded-full bg-emerald-50 px-3.5 py-1.5 text-[12px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
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
      </SectionCard>

      <SectionCard
        title="Stock movement log"
        description="Restocks (+) and automatic order consumption (−) when deliveries are completed"
        action={
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
            {restockLogs.length} entries
          </span>
        }
        bodyClassName="overflow-x-auto"
      >
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className={TABLE_HEAD_ROW}>
                <th className="px-5 py-3">Date</th>
                <th className="px-3 py-3">Item Name</th>
                <th className="px-3 py-3">Category</th>
                <th className="px-3 py-3">Qty</th>
                <th className="px-3 py-3">Stock Change</th>
                <th className="px-3 py-3">Performed By</th>
                <th className="px-5 py-3">Note</th>
              </tr>
            </thead>
            <tbody>
              {restockLogs.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={ClipboardList}
                      title="No stock activity yet"
                      description="Restock items, or complete an order to see consumption."
                    />
                  </td>
                </tr>
              ) : (
                restockLogs.map((log) => {
                  const qty = Number(log.quantityAdded) || 0;
                  const consumed = qty < 0;
                  return (
                    <tr key={log.id} className={TABLE_BODY_ROW}>
                      <td className="whitespace-nowrap px-5 py-3.5 text-slate-600">
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td className="px-3 py-3.5 font-semibold text-ink">{log.itemName}</td>
                      <td className="px-3 py-3.5 text-slate-500">{log.category || '—'}</td>
                      <td className="px-3 py-3.5">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${
                          consumed
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {consumed ? qty.toLocaleString() : `+${qty.toLocaleString()}`}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-slate-600">
                        {Number(log.stockBefore).toLocaleString()}
                        <span className="mx-1 text-slate-300">→</span>
                        <span className="font-semibold text-ink">{Number(log.stockAfter).toLocaleString()}</span>
                      </td>
                      <td className="px-3 py-3.5 font-medium text-ink">{log.performedBy || 'Admin'}</td>
                      <td className="max-w-[220px] truncate px-5 py-3.5 text-slate-500">
                        {log.note || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
      </SectionCard>

      <div className="agua-card overflow-hidden p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-ink">Station water tank</p>
                <p className="text-xs text-muted">
                  Auto-decreases ~19 L per fulfilled gallon · Ready jugs also drop on complete
                </p>
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
                  waterPct < 20 ? 'bg-red-500' : waterPct < 50 ? 'bg-amber-400' : 'bg-gradient-to-r from-blue-400 to-blue-600'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, waterPct))}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span>
                Tank {Number(inventory.waterLevel).toLocaleString()} / {Number(inventory.maxCapacity).toLocaleString()} L
              </span>
              <span>
                Ready {Number(inventory.readyGallons || 0).toLocaleString()} gal
              </span>
              <span>
                Lifetime filled {Number(inventory.totalGallons || 0).toLocaleString()} gal
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setTankForm({
                waterLevel: inventory.waterLevel,
                maxCapacity: inventory.maxCapacity,
                readyGallons: inventory.readyGallons,
              });
              setShowTankModal(true);
            }}
            className="shrink-0 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-ink hover:bg-slate-50"
          >
            Adjust tank
          </button>
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
              <label className="agua-label">Item</label>
              <select
                className="agua-input"
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

          <div className="mb-3">
            <label className="agua-label">Quantity to add</label>
            <input
              type="number"
              min="1"
              value={restockQty}
              onChange={(e) => setRestockQty(e.target.value)}
              className="agua-input"
            />
          </div>

          <div className="mb-4">
            <label className="agua-label">Note (optional)</label>
            <input
              type="text"
              maxLength={500}
              placeholder="e.g. Weekly supplier delivery"
              value={restockNote}
              onChange={(e) => setRestockNote(e.target.value)}
              className="agua-input"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRestockItem(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
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
          <p className="mb-4 text-xs text-muted">
            Use this for manual corrections (refill from source). Order completion already deducts tank water and ready gallons automatically.
          </p>
          <div className="mb-3">
            <label className="agua-label">Current level (L)</label>
            <input
              type="number"
              min="0"
              value={tankForm.waterLevel}
              onChange={(e) => setTankForm({ ...tankForm, waterLevel: e.target.value })}
              className="agua-input"
            />
          </div>
          <div className="mb-3">
            <label className="agua-label">Max capacity (L)</label>
            <input
              type="number"
              min="1"
              value={tankForm.maxCapacity}
              onChange={(e) => setTankForm({ ...tankForm, maxCapacity: e.target.value })}
              className="agua-input"
            />
          </div>
          <div className="mb-4">
            <label className="agua-label">Ready gallons (filled jugs)</label>
            <input
              type="number"
              min="0"
              value={tankForm.readyGallons}
              onChange={(e) => setTankForm({ ...tankForm, readyGallons: e.target.value })}
              className="agua-input"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowTankModal(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveTank}
              className="agua-btn agua-btn-primary disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
