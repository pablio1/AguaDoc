// src/pages/InventoryPage.jsx
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import Modal from '../components/ui/Modal';
import { showToast } from '../components/ui/Toast';
import { apiUpdateInventory, apiAddContainer, apiDeleteContainer } from '../api';

export default function InventoryPage() {
  const { state, dispatch } = useApp();
  const inventory  = state.inventory  || { readyGallons: 0, totalGallons: 0 };
  const containers = state.containers || [];
  const orders     = state.orders     || [];

  const [showAdjustModal,   setShowAdjustModal]   = useState(false);
  const [showContainerModal, setShowContainerModal] = useState(false);

  const [adjForm, setAdjForm] = useState({
    readyGallons: inventory.readyGallons,
    totalGallons: inventory.totalGallons,
  });

  const [contForm, setContForm] = useState({
    id: '', status: 'Ready',
    lastRefill: new Date().toISOString().slice(0, 10),
  });

  // ── Derived stats ──
  const inUse      = containers.filter(c => c.status === 'In Use').length;
  const forCleaning = containers.filter(c => c.status === 'For Cleaning').length;
  const ready      = containers.filter(c => c.status === 'Ready').length;
  const totalDelivered = orders.filter(o => o.status === 'Delivered').reduce((sum, o) => sum + (o.quantity || 0), 0);

  // ── Save adjustments ──
  async function handleSaveAdjustments() {
    try {
      const updated = await apiUpdateInventory({
        ...inventory,
        readyGallons: parseInt(adjForm.readyGallons),
        totalGallons: parseInt(adjForm.totalGallons),
      });
      dispatch({ type: 'SET_INVENTORY', payload: updated });
      showToast('✅ Stock levels updated!');
      setShowAdjustModal(false);
    } catch {
      showToast('❌ Failed to update inventory.');
    }
  }

  // ── Add container ──
  async function handleAddContainer() {
    if (!contForm.id.trim()) { showToast('⚠ Enter a container ID.'); return; }
    try {
      const saved = await apiAddContainer({
        id: contForm.id, status: contForm.status, lastRefill: contForm.lastRefill
      });
      dispatch({ type: 'ADD_CONTAINER', payload: saved });

      // auto-update inventory counts
      const newReady = contForm.status === 'Ready'
        ? inventory.readyGallons + 1
        : inventory.readyGallons;
      const updated = await apiUpdateInventory({
        ...inventory,
        totalGallons: inventory.totalGallons + 1,
        readyGallons: newReady,
      });
      dispatch({ type: 'SET_INVENTORY', payload: updated });

      showToast(`✅ Container ${contForm.id} added!`);
      setContForm({ id: '', status: 'Ready', lastRefill: new Date().toISOString().slice(0, 10) });
      setShowContainerModal(false);
    } catch {
      showToast('❌ Failed to add container.');
    }
  }

  // ── Delete container ──
  async function handleDeleteContainer(id) {
    if (!confirm(`Remove container ${id}?`)) return;
    try {
      await apiDeleteContainer(id);
      dispatch({ type: 'DELETE_CONTAINER', id });
      showToast('🗑 Container removed.');
    } catch {
      showToast('❌ Failed to remove container.');
    }
  }

  const readyPct = inventory.totalGallons > 0
    ? Math.round((ready / inventory.totalGallons) * 100)
    : 0;

  const STATUS_COLOR = {
    'Ready':       'bg-green-100 text-green-700',
    'In Use':      'bg-blue-100 text-blue-700',
    'For Cleaning':'bg-yellow-100 text-yellow-700',
  };

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-[#0f172a]">🪣 Inventory & Supply Monitor</h2>
          <p className="text-sm text-gray-400 mt-0.5">Track gallon container availability in real-time.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowContainerModal(true)}
            className="border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2 rounded-xl hover:bg-gray-50 transition"
          >
            + Add Container
          </button>
          <button
            onClick={() => {
              setAdjForm({ readyGallons: inventory.readyGallons, totalGallons: inventory.totalGallons });
              setShowAdjustModal(true);
            }}
            className="bg-[#0ea5c9] hover:bg-[#0284a8] text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
          >
            ⚙ Adjust Stock
          </button>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-4 gap-4">
        <div className="agua-card p-5">
          <div className="text-2xl mb-2">🪣</div>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Total Containers</p>
          <p className="text-3xl font-black text-[#0f172a] mt-1">{inventory.totalGallons ?? 0}</p>
        </div>
        <div className="agua-card p-5">
          <div className="text-2xl mb-2">✅</div>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Ready for Refill</p>
          <p className="text-3xl font-black text-green-600 mt-1">{inventory.readyGallons ?? 0}</p>
        </div>
        <div className="agua-card p-5">
          <div className="text-2xl mb-2">🚚</div>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">In Use / Delivered</p>
          <p className="text-3xl font-black text-blue-500 mt-1">{inUse}</p>
        </div>
        <div className="agua-card p-5">
          <div className="text-2xl mb-2">🧼</div>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">For Cleaning</p>
          <p className="text-3xl font-black text-yellow-500 mt-1">{forCleaning}</p>
        </div>
      </div>

      {/* ── Progress Bar + Summary ── */}
      <div className="agua-card p-5">
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-bold text-[#0f172a]">Gallon Availability</span>
          <span className="text-sm font-semibold text-[#0ea5c9]">{ready} / {inventory.totalGallons ?? 0} ready</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
          <div
            className={`h-4 rounded-full transition-all duration-500 ${
              readyPct < 20 ? 'bg-red-500' : readyPct < 50 ? 'bg-yellow-400' : 'bg-green-500'
            }`}
            style={{ width: `${readyPct}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-400">
          <span>{readyPct}% available</span>
          {readyPct < 20 && <span className="text-red-500 font-semibold">⚠ Low stock — restock soon!</span>}
          <span>{totalDelivered} gallons delivered total</span>
        </div>
      </div>

      {/* ── Container Records Table ── */}
      <div className="agua-card p-5">
        <h3 className="text-sm font-bold text-[#0f172a] mb-4">Container Records</h3>
        {containers.length === 0 ? (
          <div className="text-center text-gray-400 py-10 text-sm">
            No containers yet — click "+ Add Container" to get started.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100">
                <th className="text-left pb-2 font-semibold">Container ID</th>
                <th className="text-left pb-2 font-semibold">Status</th>
                <th className="text-left pb-2 font-semibold">Last Refill</th>
                <th className="text-left pb-2 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {containers.map(c => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                  <td className="py-2.5 font-mono font-semibold text-[#0f172a]">{c.id}</td>
                  <td className="py-2.5">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOR[c.status] || 'bg-gray-100 text-gray-500'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="py-2.5 text-gray-500">{c.lastRefill}</td>
                  <td className="py-2.5">
                    <button
                      onClick={() => handleDeleteContainer(c.id)}
                      className="text-gray-300 hover:text-red-500 transition text-lg"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Adjust Stock Modal ── */}
      {showAdjustModal && (
        <Modal title="⚙ Adjust Stock Levels" onClose={() => setShowAdjustModal(false)}>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ready for Refill (gallons)</label>
            <input type="number" min="0"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#0ea5c9]"
              value={adjForm.readyGallons}
              onChange={e => setAdjForm({ ...adjForm, readyGallons: e.target.value })}
            />
          </div>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Total Containers Tracked</label>
            <input type="number" min="0"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#0ea5c9]"
              value={adjForm.totalGallons}
              onChange={e => setAdjForm({ ...adjForm, totalGallons: e.target.value })}
            />
          </div>
          <div className="flex gap-2 justify-end mt-5">
            <button onClick={() => setShowAdjustModal(false)}
              className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-semibold hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={handleSaveAdjustments}
              className="px-4 py-2 bg-[#0ea5c9] hover:bg-[#0284a8] text-white rounded-xl text-sm font-semibold transition">
              💾 Save
            </button>
          </div>
        </Modal>
      )}

      {/* ── Add Container Modal ── */}
      {showContainerModal && (
        <Modal title="🪣 Add Container" onClose={() => setShowContainerModal(false)}>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Container ID</label>
            <input placeholder="e.g. GAL-010"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#0ea5c9]"
              value={contForm.id}
              onChange={e => setContForm({ ...contForm, id: e.target.value })}
            />
          </div>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Status</label>
            <select
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#0ea5c9]"
              value={contForm.status}
              onChange={e => setContForm({ ...contForm, status: e.target.value })}
            >
              <option>Ready</option>
              <option>In Use</option>
              <option>For Cleaning</option>
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Last Refill Date</label>
            <input type="date"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#0ea5c9]"
              value={contForm.lastRefill}
              onChange={e => setContForm({ ...contForm, lastRefill: e.target.value })}
            />
          </div>
          <div className="flex gap-2 justify-end mt-5">
            <button onClick={() => setShowContainerModal(false)}
              className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-semibold hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={handleAddContainer}
              className="px-4 py-2 bg-[#0ea5c9] hover:bg-[#0284a8] text-white rounded-xl text-sm font-semibold transition">
              💾 Save Container
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}