import { useState } from 'react';
import { apiRegister } from '../api';
import { Eye, EyeOff, User, Lock, Mail, Phone, MapPin, Users, ArrowRight } from 'lucide-react';
import { TermsModal, TERMS_VERSION } from '../components/TermsContent';
import AuthShell from '../components/AuthShell';

function Field({ label, icon: Icon, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">{label}</label>
      <div className="flex items-center gap-2 rounded-[0.9rem] border border-slate-200/80 bg-white px-3 py-2.5 focus-within:border-accent focus-within:ring-4 focus-within:ring-cyan-500/15">
        <Icon size={16} className="shrink-0 text-slate-400" />
        {children}
      </div>
    </div>
  );
}

export default function RegisterPage({ onGoLogin, onLogin }) {
  const [form, setForm] = useState({
    username: '', password: '', confirmPassword: '',
    email: '', phone: '', address: '', gender: '',
  });
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [readTerms, setReadTerms] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!form.username || !form.password || !form.email) {
      setError('Please fill in all required fields');
      return;
    }
    if (!agreed) {
      setError('Please read and accept the Terms & Agreement to continue');
      return;
    }
    setLoading(true);
    try {
      const result = await apiRegister({
        username: form.username,
        password: form.password,
        email: form.email,
        phone: form.phone,
        address: form.address,
        gender: form.gender,
        fullName: form.username,
        termsAccepted: true,
        termsVersion: TERMS_VERSION,
      });
      if (result.success) onLogin(result.user);
      else setError(result.message || 'Registration failed');
    } catch {
      setError('Cannot connect to server. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="Join AguaDoc to request deliveries and track your water orders.">
      <form onSubmit={handleSubmit} className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
        <Field label="Username" icon={User}>
          <input type="text" value={form.username} onChange={set('username')}
            placeholder="yourname" className="flex-1 bg-transparent text-sm outline-none" />
        </Field>

        <Field label="Password" icon={Lock}>
          <input type={showPass ? 'text' : 'password'} value={form.password} onChange={set('password')}
            placeholder="••••••••" className="flex-1 bg-transparent text-sm outline-none" />
          <button type="button" onClick={() => setShowPass(!showPass)} className="text-slate-400">
            {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </Field>

        <Field label="Confirm password" icon={Lock}>
          <input type={showConfirm ? 'text' : 'password'} value={form.confirmPassword} onChange={set('confirmPassword')}
            placeholder="••••••••" className="flex-1 bg-transparent text-sm outline-none" />
          <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="text-slate-400">
            {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </Field>

        <Field label="Email" icon={Mail}>
          <input type="email" value={form.email} onChange={set('email')}
            placeholder="you@email.com" className="flex-1 bg-transparent text-sm outline-none" />
        </Field>

        <Field label="Phone" icon={Phone}>
          <input type="tel" value={form.phone} onChange={set('phone')}
            placeholder="+63 9XX XXX XXXX" className="flex-1 bg-transparent text-sm outline-none" />
        </Field>

        <Field label="Address" icon={MapPin}>
          <textarea value={form.address} onChange={set('address')}
            placeholder="Basak, Lapu-Lapu City, Cebu"
            rows={2} className="flex-1 resize-none bg-transparent text-sm outline-none" />
        </Field>

        <Field label="Gender" icon={Users}>
          <select value={form.gender} onChange={set('gender')} className="flex-1 bg-transparent text-sm outline-none">
            <option value="">Select gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </Field>

        <div className="rounded-2xl border border-slate-200/80 bg-foam/80 p-3.5">
          <label className={`flex items-start gap-2 text-xs ${readTerms ? 'cursor-pointer text-slate-600' : 'cursor-not-allowed text-slate-400'}`}>
            <input
              type="checkbox"
              checked={agreed}
              disabled={!readTerms}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 accent-[#12b8c9]"
            />
            <span>
              I have read and agree to the{' '}
              <button type="button" onClick={() => setShowTerms(true)} className="font-semibold text-accent2 hover:underline">
                Terms & Agreement
              </button>
              , including paying any balance I take on credit (utang).
            </span>
          </label>
          {!readTerms && (
            <p className="ml-5 mt-1.5 text-[11px] text-slate-400">Open Terms & Agreement first to unlock the checkbox.</p>
          )}
        </div>

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-center text-xs font-medium text-red-600 ring-1 ring-red-100">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading || !agreed} className="agua-btn agua-btn-primary w-full">
          {loading ? 'Creating account…' : 'Create account'}
          {!loading && <ArrowRight size={16} />}
        </button>
      </form>

      {showTerms && (
        <TermsModal
          onClose={() => setShowTerms(false)}
          onAccept={() => { setReadTerms(true); setShowTerms(false); }}
          acceptLabel="I have read this"
        />
      )}

      <p className="mt-5 text-center text-sm text-muted">
        Already have an account?{' '}
        <button type="button" onClick={onGoLogin} className="font-semibold text-accent2 hover:underline">
          Sign in
        </button>
      </p>
    </AuthShell>
  );
}
