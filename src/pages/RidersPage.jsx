import { useMemo, useState } from 'react';
import {
  Bike, Plus, Copy, Check, KeyRound, Pencil, Search, Eye, EyeOff,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import Modal from '../components/ui/Modal';
import { showToast } from '../components/ui/Toast';
import PageHeader from '../components/admin/PageHeader';
import SectionCard from '../components/admin/SectionCard';
import EmptyState from '../components/admin/EmptyState';
import { TABLE_BODY_ROW, TABLE_HEAD_ROW } from '../components/admin/tableStyles';
import { apiCreateRider, apiResetRiderPassword, apiUpdateRider } from '../api';

function formatCreated(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function RidersPage() {
  const { state, dispatch } = useApp();
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ fullName: '', username: '', phone: '', email: '', address: '' });
  const [credentials, setCredentials] = useState(null); // { username, password, fullName }
  const [showPassword, setShowPassword] = useState(true);
  const [copied, setCopied] = useState('');
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ fullName: '', phone: '', email: '', address: '' });
  const [resettingId, setResettingId] = useState(null);

  const riders = useMemo(
    () => (state.users || []).filter((u) => u.role === 'rider'),
    [state.users]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return riders;
    return riders.filter((r) =>
      [r.fullName, r.username, r.phone, r.email, r.address].join(' ').toLowerCase().includes(q)
    );
  }, [riders, query]);

  function openAdd() {
    setForm({ fullName: '', username: '', phone: '', email: '', address: '' });
    setShowAdd(true);
  }

  async function handleCreate() {
    if (!form.fullName.trim() || !form.username.trim() || !form.phone.trim()) {
      showToast('⚠ Name, username, and phone are required.');
      return;
    }
    setSaving(true);
    try {
      const created = await apiCreateRider({
        fullName: form.fullName.trim(),
        username: form.username.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
      });
      const { password, ...rider } = created;
      dispatch({ type: 'ADD_USER', payload: rider });
      setShowAdd(false);
      setCredentials({
        fullName: rider.fullName,
        username: rider.username,
        password,
      });
      setShowPassword(true);
      showToast(`✅ Rider ${rider.fullName} created`);
    } catch (err) {
      showToast(`❌ ${err.message || 'Failed to create rider.'}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword(rider) {
    if (!confirm(`Generate a new password for ${rider.fullName}?`)) return;
    setResettingId(rider.id);
    try {
      const result = await apiResetRiderPassword(rider.id);
      setCredentials({
        fullName: rider.fullName,
        username: result.username || rider.username,
        password: result.password,
      });
      setShowPassword(true);
      showToast('🔑 New password generated');
    } catch (err) {
      showToast(`❌ ${err.message || 'Failed to reset password.'}`);
    } finally {
      setResettingId(null);
    }
  }

  function openEdit(rider) {
    setEditing(rider);
    setEditForm({
      fullName: rider.fullName || '',
      phone: rider.phone || '',
      email: rider.email || '',
      address: rider.address || '',
    });
  }

  async function handleSaveEdit() {
    if (!editing) return;
    if (!editForm.fullName.trim() || !editForm.phone.trim()) {
      showToast('⚠ Name and phone are required.');
      return;
    }
    setSaving(true);
    try {
      const updated = await apiUpdateRider(editing.id, {
        fullName: editForm.fullName.trim(),
        phone: editForm.phone.trim(),
        email: editForm.email.trim(),
        address: editForm.address.trim(),
      });
      dispatch({ type: 'UPDATE_USER', payload: updated });
      setEditing(null);
      showToast(`✅ ${updated.fullName} updated`);
    } catch (err) {
      showToast(`❌ ${err.message || 'Failed to update rider.'}`);
    } finally {
      setSaving(false);
    }
  }

  async function copyText(label, text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(''), 1600);
    } catch {
      showToast('❌ Could not copy to clipboard.');
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rider Management"
        subtitle="Create delivery rider accounts and share generated login passwords."
      >
        <button
          type="button"
          onClick={openAdd}
          className="agua-btn agua-btn-primary !gap-1.5 !py-2.5 !text-sm"
        >
          <Plus size={16} /> Add rider
        </button>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="agua-card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">Active riders</p>
          <p className="mt-2 font-display text-2xl font-bold text-ink">{riders.length}</p>
        </div>
        <div className="agua-card px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-400">How they log in</p>
          <p className="mt-2 text-sm font-medium text-muted">
            Username + alphanumeric password on the rider app
          </p>
        </div>
      </div>

      <SectionCard
        title="Delivery riders"
        description={`${filtered.length} account${filtered.length === 1 ? '' : 's'}`}
        action={(
          <div className="relative w-full min-w-[180px] max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, username, phone…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2 pl-9 pr-3 text-xs font-medium text-ink outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-2 focus:ring-sky-100"
            />
          </div>
        )}
        bodyClassName="overflow-x-auto"
      >
        {filtered.length === 0 ? (
          <EmptyState
            icon={Bike}
            title={riders.length === 0 ? 'No riders yet' : 'No riders match'}
            description={
              riders.length === 0
                ? 'Add a rider account so you can assign deliveries from Orders & Dispatch.'
                : 'Try a different search.'
            }
          />
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className={TABLE_HEAD_ROW}>
                {['Rider', 'Username', 'Phone', 'Created', 'Actions'].map((h, i) => (
                  <th key={h} className={`px-3 py-3 ${i === 0 ? 'pl-5' : ''} ${i === 4 ? 'pr-5' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className={TABLE_BODY_ROW}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                        <Bike size={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{r.fullName}</p>
                        {r.address ? (
                          <p className="mt-0.5 truncate text-[11px] text-muted">{r.address}</p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 font-mono text-xs font-semibold text-ink">@{r.username}</td>
                  <td className="px-3 py-3.5 text-muted">{r.phone || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-xs text-muted">{formatCreated(r.createdAt)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:border-slate-300 hover:text-ink"
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      <button
                        type="button"
                        disabled={resettingId === r.id}
                        onClick={() => handleResetPassword(r)}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                      >
                        <KeyRound size={12} />
                        {resettingId === r.id ? 'Generating…' : 'New password'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* Add rider */}
      {showAdd && (
        <Modal title="Add rider account" onClose={() => setShowAdd(false)}>
          <p className="mb-3 text-[13px] text-muted">
            A random alphanumeric password will be generated. Share it with the rider after creating the account.
          </p>
          <div className="space-y-3">
            <div>
              <label className="agua-label">Full name *</label>
              <input
                className="agua-input"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="e.g. Juan Dela Cruz"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="agua-label">Username *</label>
                <input
                  className="agua-input"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="e.g. juan.rider"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="agua-label">Phone *</label>
                <input
                  className="agua-input"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="09XXXXXXXXX"
                />
              </div>
            </div>
            <div>
              <label className="agua-label">Email (optional)</label>
              <input
                type="email"
                className="agua-input"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="Auto @aguadoc.rider if blank"
              />
            </div>
            <div>
              <label className="agua-label">Address (optional)</label>
              <input
                className="agua-input"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Lapu-Lapu City…"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[12.5px] font-semibold text-ink hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleCreate}
              className="agua-btn agua-btn-primary !py-2 disabled:opacity-60"
            >
              {saving ? 'Creating…' : 'Create & generate password'}
            </button>
          </div>
        </Modal>
      )}

      {/* Edit rider */}
      {editing && (
        <Modal title="Edit rider" onClose={() => setEditing(null)}>
          <div className="space-y-3">
            <div>
              <label className="agua-label">Username</label>
              <input className="agua-input bg-slate-50" value={editing.username} disabled />
            </div>
            <div>
              <label className="agua-label">Full name *</label>
              <input
                className="agua-input"
                value={editForm.fullName}
                onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
              />
            </div>
            <div>
              <label className="agua-label">Phone *</label>
              <input
                className="agua-input"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="agua-label">Email</label>
              <input
                className="agua-input"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
            <div>
              <label className="agua-label">Address</label>
              <input
                className="agua-input"
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-[12.5px] font-semibold text-ink hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveEdit}
              className="agua-btn agua-btn-primary !py-2 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </Modal>
      )}

      {/* Show generated credentials once */}
      {credentials && (
        <Modal title="Rider login credentials" onClose={() => setCredentials(null)}>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-[13px] text-amber-900">
            Copy these now — the password is shown only once. Share privately with{' '}
            <span className="font-semibold">{credentials.fullName}</span>.
          </div>
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Username</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="font-mono text-sm font-bold text-ink">{credentials.username}</p>
                <button
                  type="button"
                  onClick={() => copyText('user', credentials.username)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600"
                >
                  {copied === 'user' ? <Check size={12} /> : <Copy size={12} />}
                  {copied === 'user' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Password</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="font-mono text-sm font-bold tracking-wide text-ink">
                  {showPassword ? credentials.password : '••••••••••'}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyText('pass', credentials.password)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600"
                  >
                    {copied === 'pass' ? <Check size={12} /> : <Copy size={12} />}
                    {copied === 'pass' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setCredentials(null)}
              className="agua-btn agua-btn-primary !py-2"
            >
              Done
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
