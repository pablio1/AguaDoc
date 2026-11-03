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
    setRestockNote('');
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory & stocks"
        subtitle={
          <>
            Monitor gallon supplies, caps, seals, and equipment restock history.
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
          className="agua-btn agua-btn-primary inline-flex items-center gap-2 !py-2.5 !text-sm disabled:opacity-50"
        >
          <Plus size={16} /> Restock item
        </button>
      </PageHeader>

      {/* Summary cards — clean white cards, category / name / qty / icon */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
            const low = Number(item.stock) <= Number(item.minAlert);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openRestock(item)}
                className="group rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-[0_8px_24px_rgba(15,42,74,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,42,74,0.08)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                      {item.category}
                    </p>
                    <p className="mt-1.5 line-clamp-2 text-[13.5px] font-semibold leading-snug text-ink">
                      {item.name}
                    </p>
                    <p className="mt-3 text-[26px] font-bold leading-none tracking-tight text-ink">
                      {Number(item.stock).toLocaleString()}
                      <span className="ml-1.5 text-xs font-medium text-slate-400">{item.unit || 'units'}</span>
                    </p>
                    {low && (
                      <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                        <AlertTriangle size={11} /> Below min ({item.minAlert})
                      </p>
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
        title="Stock inventory"
        description="Current counts, alert thresholds, and unit prices"
        action={<Package size={18} className="text-slate-300" />}
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
                          className="rounded-full bg-blue-50 px-3.5 py-1.5 text-[12px] font-semibold text-blue-700 transition hover:bg-blue-100"
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
        title="Restock history & logs"
        description="Audit trail of stock additions — who restocked what, and by how much"
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
                <th className="px-3 py-3">Qty Added</th>
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
                      title="No restock activity yet"
                      description="Use Restock on any item to start the log."
                    />
                  </td>
                </tr>
              ) : (
                restockLogs.map((log) => (
                  <tr key={log.id} className={TABLE_BODY_ROW}>
                    <td className="whitespace-nowrap px-5 py-3.5 text-slate-600">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-3 py-3.5 font-semibold text-ink">{log.itemName}</td>
                    <td className="px-3 py-3.5 text-slate-500">{log.category || '—'}</td>
                    <td className="px-3 py-3.5">
                      <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-[12px] font-semibold text-emerald-700">
                        +{Number(log.quantityAdded).toLocaleString()}
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
                ))
              )}
            </tbody>
          </table>
      </SectionCard>

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
                waterPct < 20 ? 'bg-red-500' : waterPct < 50 ? 'bg-amber-400' : 'bg-gradient-to-r from-blue-400 to-blue-600'
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
          className="shrink-0 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-ink hover:bg-slate-50"
        >
          Adjust tank
        </button>
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
          <div className="mb-4">
            <label className="agua-label">Max capacity (L)</label>
            <input
              type="number"
              min="1"
              value={tankForm.maxCapacity}
              onChange={(e) => setTankForm({ ...tankForm, maxCapacity: e.target.value })}
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
