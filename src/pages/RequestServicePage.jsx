// src/pages/RequestServicePage.jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Info, MapPin, Crosshair, LocateFixed, Store, Truck, CheckCircle2,
  CreditCard, Banknote, ArrowRight, ArrowLeft, Minus, Plus, Droplets, Zap,
  Sparkles, ShieldCheck,
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiAddOrder, apiCreateCheckout, apiGeocode, apiReverseGeocode } from '../api';
import { TermsModal } from '../components/TermsContent';
import { CARTO_ATTRIBUTION, cartoVoyagerUrl } from '../lib/mapTiles';
import { formatMoney } from '../lib/money';

const PRICE_PER_GALLON = 40;
const DELIVERY_FEE = 20;
const DEFAULT_CENTER = { lat: 10.3157, lng: 123.9740 }; // Lapu-Lapu / AguaDoc area

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const pinIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
    background:linear-gradient(135deg,#3b82f6,#2563eb);border:3px solid #fff;
    box-shadow:0 6px 16px rgba(59,130,246,.4);display:flex;align-items:center;justify-content:center;
  "><span style="transform:rotate(45deg);font-size:14px">💧</span></div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 36],
});

function MapClickHandler({ onPick }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function RecenterOnPin({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lng != null) map.panTo([lat, lng], { animate: true });
  }, [lat, lng, map]);
  return null;
}

function DeliveryPinMap({ pin, onPinChange }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner">
      <MapContainer
        center={[pin.lat, pin.lng]}
        zoom={15}
        style={{ height: 280, width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer attribution={CARTO_ATTRIBUTION} url={cartoVoyagerUrl()} />
        <MapClickHandler onPick={onPinChange} />
        <RecenterOnPin lat={pin.lat} lng={pin.lng} />
        <Marker
          position={[pin.lat, pin.lng]}
          icon={pinIcon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const { lat, lng } = e.target.getLatLng();
              onPinChange({ lat, lng });
            },
          }}
        />
      </MapContainer>
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-[1000] flex justify-center">
        <span className="rounded-full bg-white/95 px-3.5 py-1.5 text-[11px] font-semibold text-slate-600 shadow-md ring-1 ring-slate-200/80">
          Drag the pin or tap the map
        </span>
      </div>
    </div>
  );
}

function StepBar({ step, isWalkin }) {
  const steps = isWalkin
    ? ['Order type', 'Details']
    : ['Order type', 'Details', 'Review & pay'];

  return (
    <div className="mb-7">
      <div className="mb-3 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        <span>Step {Math.min(step, steps.length)} of {steps.length}</span>
        <span className="text-blue-600">{steps[Math.min(step, steps.length) - 1]}</span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-300"
          style={{ width: `${(Math.min(step, steps.length) / steps.length) * 100}%` }}
        />
      </div>
      <div className="flex items-center gap-2">
        {steps.map((label, i) => {
          const num = i + 1;
          const active = step === num;
          const done = step > num;
          return (
            <div key={label} className="flex flex-1 items-center gap-2 last:flex-none">
              <div className="flex shrink-0 items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition ${
                    done
                      ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/30'
                      : active
                        ? 'bg-blue-50 text-blue-600 ring-2 ring-blue-500'
                        : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {done ? <CheckCircle2 size={15} /> : num}
                </div>
                <span className={`hidden text-xs font-semibold sm:block ${
                  active ? 'text-ink' : done ? 'text-muted' : 'text-slate-300'
                }`}>
                  {label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={`mx-1 h-0.5 flex-1 rounded ${done ? 'bg-blue-500' : 'bg-slate-200'}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OrderTypeCard({ icon: Icon, title, subtitle, hint, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-1 flex-col rounded-2xl border-2 p-5 text-left transition ${
        selected
          ? 'border-blue-500 bg-blue-50/70 shadow-md shadow-blue-500/10'
          : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm'
      }`}
    >
      {selected && (
        <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white">
          <CheckCircle2 size={14} />
        </span>
      )}
      <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${
        selected ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25' : 'bg-slate-100 text-slate-500'
      }`}>
        <Icon size={22} />
      </div>
      <p className="text-base font-bold text-ink">{title}</p>
      <p className={`mt-1 text-sm font-semibold ${selected ? 'text-blue-600' : 'text-muted'}`}>{subtitle}</p>
      {hint && <p className="mt-2 text-xs leading-relaxed text-muted">{hint}</p>}
    </button>
  );
}

function PriorityBadge({ value, label, description, icon: Icon, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`flex flex-1 items-start gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition ${
        selected
          ? 'border-blue-500 bg-blue-50/70 text-ink'
          : 'border-slate-200 bg-white text-muted hover:border-blue-300'
      }`}
    >
      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
        selected ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500'
      }`}>
        <Icon size={16} />
      </span>
      <span>
        <span className="block text-sm font-bold text-ink">{label}</span>
        <span className="mt-0.5 block text-xs text-muted">{description}</span>
      </span>
    </button>
  );
}

function SummaryBlock({ children, total }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Order summary</p>
      </div>
      <div className="space-y-2.5 px-4 py-4 text-sm">{children}</div>
      {total != null && (
        <div className="flex items-center justify-between border-t border-slate-100 bg-blue-50/50 px-4 py-3.5">
          <span className="text-sm font-bold text-ink">Total due</span>
          <span className="font-display text-xl font-bold text-blue-600">{formatMoney(total)}</span>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children, required }) {
  return (
    <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
      {children}
      {required && <span className="ml-1 text-blue-500">*</span>}
    </p>
  );
}

export default function RequestServicePage({ user, onOrderPlaced }) {
  const [step, setStep] = useState(1);
  const [orderType, setOrderType] = useState(''); // 'walkin' | 'delivery'
  const [priority, setPriority] = useState('normal');
  const [quantity, setQuantity] = useState(1);
  const [address, setAddress] = useState(user?.address || '');
  const [notes, setNotes] = useState('');
  const [pin, setPin] = useState(DEFAULT_CENTER);
  const [pinReady, setPinReady] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [payMode, setPayMode] = useState('online'); // 'online' | 'cod'
  const [showTerms, setShowTerms] = useState(false);
  const skipNextGeocode = useRef(false);
  const addressTimer = useRef(null);

  const isWalkin = orderType === 'walkin';
  const isDelivery = orderType === 'delivery';
  const subtotal = quantity * PRICE_PER_GALLON;
  const deliveryFee = isDelivery ? DELIVERY_FEE : 0;
  const total = subtotal + deliveryFee;

  useEffect(() => {
    if (!isDelivery || pinReady) return;
    let cancelled = false;

    async function seed() {
      if (user?.address) {
        const coords = await apiGeocode(user.address);
        if (!cancelled && coords.lat != null && coords.lng != null) {
          setPin({ lat: coords.lat, lng: coords.lng });
          setPinReady(true);
          return;
        }
      }
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (cancelled) return;
            setPin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            setPinReady(true);
          },
          () => { if (!cancelled) setPinReady(true); },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      } else {
        setPinReady(true);
      }
    }

    seed().catch(() => setPinReady(true));
    return () => { cancelled = true; };
  }, [isDelivery, pinReady, user?.address]);

  const applyPin = useCallback(async ({ lat, lng }, { reverse = true } = {}) => {
    setPin({ lat, lng });
    setPinReady(true);
    if (!reverse) return;
    setGeoBusy(true);
    try {
      const data = await apiReverseGeocode(lat, lng);
      if (data.address) {
        skipNextGeocode.current = true;
        setAddress(data.address);
      }
    } catch { /* keep pin even if reverse fails */ }
    finally { setGeoBusy(false); }
  }, []);

  function handleAddressChange(value) {
    setAddress(value);
    if (skipNextGeocode.current) {
      skipNextGeocode.current = false;
      return;
    }
    clearTimeout(addressTimer.current);
    if (!value.trim() || value.trim().length < 6) return;
    addressTimer.current = setTimeout(async () => {
      setGeoBusy(true);
      try {
        const coords = await apiGeocode(value.trim());
        if (coords.lat != null && coords.lng != null) {
          setPin({ lat: coords.lat, lng: coords.lng });
          setPinReady(true);
        }
      } catch { /* ignore */ }
      finally { setGeoBusy(false); }
    }, 700);
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError('Geolocation is not available on this device.');
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyPin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setGeoBusy(false);
        setError('Could not get your location. Allow GPS or drop the pin manually.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function goNext() {
    setError('');
    if (step === 1 && !orderType) { setError('Please select an order type.'); return; }
    if (step === 2 && isDelivery) {
      if (!address.trim()) { setError('Please enter a delivery address.'); return; }
      if (pin.lat == null || pin.lng == null) { setError('Please set a delivery pin on the map.'); return; }
    }
    setStep((s) => s + 1);
  }

  function goBack() { setError(''); setStep((s) => s - 1); }

  async function handleConfirmWalkin() {
    setLoading(true);
    try {
      await apiAddOrder({
        userId: user.id,
        type: 'Walk-in / Pickup',
        priority,
        quantity,
        address: 'Walk-in',
        notes,
        payMethod: 'Pay on arrival',
        total,
        status: 'Pending',
      });
      setSuccess(true);
      onOrderPlaced?.();
    } catch {
      setError('Failed to place order. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmCOD() {
    setLoading(true);
    setError('');
    try {
      await apiAddOrder({
        userId: user.id,
        type: 'Delivery',
        priority,
        quantity,
        address,
        notes,
        payMethod: 'Cash on Delivery',
        total,
        status: 'Pending',
        lat: pin.lat,
        lng: pin.lng,
      });
      setSuccess(true);
      onOrderPlaced?.();
    } catch {
      setError('Failed to place order. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handlePayNow() {
    setLoading(true);
    setError('');
    try {
      const { checkoutUrl } = await apiCreateCheckout({
        userId: user.id,
        type: 'Delivery',
        priority,
        quantity,
        address,
        notes,
        total,
        lat: pin.lat,
        lng: pin.lng,
      });
      window.location.href = checkoutUrl;
    } catch {
      setError('Could not start payment. Please try again.');
      setLoading(false);
    }
  }

  function resetForm() {
    setSuccess(false);
    setStep(1);
    setOrderType('');
    setPriority('normal');
    setQuantity(1);
    setAddress(user?.address || '');
    setNotes('');
    setPayMode('online');
    setPin(DEFAULT_CENTER);
    setPinReady(false);
    setError('');
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="agua-card overflow-hidden text-center">
          <div className="bg-gradient-to-b from-emerald-50 to-white px-6 pb-2 pt-10">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
              <CheckCircle2 size={40} />
            </div>
            <h2 className="font-display text-2xl font-bold text-ink">Order placed</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              {isWalkin
                ? 'Your walk-in order is confirmed. Pay when you arrive at the station.'
                : 'Your delivery is confirmed. Please have cash ready for the rider.'}
            </p>
          </div>
          <div className="space-y-3 px-6 py-6 text-left text-sm">
            <div className="flex justify-between rounded-xl bg-slate-50 px-4 py-3">
              <span className="text-muted">Type</span>
              <span className="font-semibold text-ink">
                {isWalkin ? 'Walk-in / Pickup' : 'Delivery · Cash on delivery'}
              </span>
            </div>
            <div className="flex justify-between rounded-xl bg-slate-50 px-4 py-3">
              <span className="text-muted">Gallons</span>
              <span className="font-semibold text-ink">{quantity}</span>
            </div>
            <div className="flex justify-between rounded-xl bg-blue-50 px-4 py-3">
              <span className="font-semibold text-ink">Total</span>
              <span className="font-display text-lg font-bold text-blue-600">{formatMoney(total)}</span>
            </div>
          </div>
          <div className="border-t border-slate-100 px-6 py-5">
            <button type="button" onClick={resetForm} className="agua-btn agua-btn-primary w-full">
              Place another order
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink">Request service</h2>
          <p className="mt-1 text-sm text-muted">
            Order a refill for pickup or doorstep delivery in a few quick steps.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 self-start rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-100 sm:self-auto">
          <Sparkles size={12} />
          {formatMoney(PRICE_PER_GALLON)} / gallon
        </div>
      </div>

      <div className="agua-card p-5 sm:p-7">
        <StepBar step={step} isWalkin={isWalkin} />

        {/* STEP 1 */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <SectionLabel required>How do you want your water?</SectionLabel>
              <div className="flex flex-col gap-3 sm:flex-row">
                <OrderTypeCard
                  icon={Store}
                  title="Walk-in / Pickup"
                  subtitle="Free · No delivery fee"
                  hint="Order ahead and pay when you arrive at the station."
                  selected={orderType === 'walkin'}
                  onClick={() => { setOrderType('walkin'); setError(''); }}
                />
                <OrderTypeCard
                  icon={Truck}
                  title="Home delivery"
                  subtitle={`+ ${formatMoney(DELIVERY_FEE)} delivery`}
                  hint="We bring gallons to your pin. Track the rider live."
                  selected={orderType === 'delivery'}
                  onClick={() => { setOrderType('delivery'); setError(''); setPinReady(false); }}
                />
              </div>
            </div>

            {orderType && (
              <div className="agua-fade-up">
                <SectionLabel>Priority</SectionLabel>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <PriorityBadge
                    value="normal"
                    label="Normal"
                    description="Standard queue · best value"
                    icon={Droplets}
                    selected={priority === 'normal'}
                    onClick={setPriority}
                  />
                  <PriorityBadge
                    value="priority"
                    label="Priority"
                    description="Handled sooner when possible"
                    icon={Zap}
                    selected={priority === 'priority'}
                    onClick={setPriority}
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600 ring-1 ring-red-100">
                {error}
              </p>
            )}

            <div className="flex justify-end border-t border-slate-100 pt-5">
              <button
                type="button"
                onClick={goNext}
                disabled={!orderType}
                className="agua-btn agua-btn-primary disabled:opacity-40"
              >
                Continue <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <SectionLabel required>How many gallons?</SectionLabel>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-300 hover:text-blue-600"
                  >
                    <Minus size={18} />
                  </button>
                  <div className="min-w-[4.5rem] text-center">
                    <p className="font-display text-3xl font-bold text-ink">{quantity}</p>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">gallons</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => q + 1)}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-300 hover:text-blue-600"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                <div className="rounded-xl bg-white px-3 py-2 text-right shadow-sm ring-1 ring-slate-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Subtotal</p>
                  <p className="font-display text-lg font-bold text-blue-600">{formatMoney(subtotal)}</p>
                </div>
              </div>
            </div>

            {isDelivery && (
              <>
                <div>
                  <SectionLabel required>Delivery address</SectionLabel>
                  <input
                    value={address}
                    onChange={(e) => handleAddressChange(e.target.value)}
                    placeholder="e.g. Purok 3, Brgy. Basak, Lapu-Lapu City"
                    className="agua-input"
                  />
                </div>

                <div>
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <SectionLabel required>Pin on the map</SectionLabel>
                    <button
                      type="button"
                      onClick={useMyLocation}
                      disabled={geoBusy}
                      className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-100 transition hover:bg-blue-100 disabled:opacity-50"
                    >
                      <LocateFixed size={12} />
                      Use my GPS
                    </button>
                  </div>
                  <DeliveryPinMap pin={pin} onPinChange={(p) => applyPin(p)} />
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
                    <Crosshair size={12} className="text-blue-500" />
                    {geoBusy
                      ? 'Updating location…'
                      : `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`}
                  </p>
                </div>

                <div>
                  <SectionLabel>Delivery notes</SectionLabel>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Leave at the gate, call upon arrival…"
                    rows={2}
                    className="agua-input resize-none"
                  />
                </div>
              </>
            )}

            {isWalkin && (
              <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/80 px-4 py-3.5">
                <Store size={18} className="mt-0.5 shrink-0 text-blue-600" />
                <div>
                  <p className="text-sm font-semibold text-ink">Pickup at the station</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Pay on arrival — no online payment needed for walk-in orders.
                  </p>
                </div>
              </div>
            )}

            <SummaryBlock total={total}>
              <div className="flex justify-between text-muted">
                <span>Gallons ({quantity} × {formatMoney(PRICE_PER_GALLON)})</span>
                <span className="font-medium text-ink">{formatMoney(subtotal)}</span>
              </div>
              {isDelivery && (
                <div className="flex justify-between text-muted">
                  <span>Delivery fee</span>
                  <span className="font-medium text-ink">{formatMoney(deliveryFee)}</span>
                </div>
              )}
              {priority === 'priority' && (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                  <Zap size={12} /> Priority handling requested
                </div>
              )}
            </SummaryBlock>

            {error && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600 ring-1 ring-red-100">
                {error}
              </p>
            )}

            <div className="flex justify-between gap-3 border-t border-slate-100 pt-5">
              <button type="button" onClick={goBack} className="agua-btn agua-btn-secondary">
                <ArrowLeft size={16} /> Back
              </button>
              {isWalkin ? (
                <button
                  type="button"
                  onClick={handleConfirmWalkin}
                  disabled={loading}
                  className="agua-btn agua-btn-primary disabled:opacity-60"
                >
                  {loading ? 'Placing…' : 'Confirm order'}
                </button>
              ) : (
                <button type="button" onClick={goNext} className="agua-btn agua-btn-primary">
                  Review & pay <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Truck size={16} className="text-blue-600" />
                <p className="text-sm font-bold text-ink">Delivery overview</p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Address</span>
                  <span className="max-w-[60%] text-right font-medium text-ink">{address || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Map pin</span>
                  <span className="font-mono text-xs text-muted">
                    {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
                  </span>
                </div>
                {notes.trim() && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted">Notes</span>
                    <span className="max-w-[60%] text-right text-ink">{notes}</span>
                  </div>
                )}
              </div>
            </div>

            <SummaryBlock total={total}>
              <div className="flex justify-between text-muted">
                <span>Gallons ({quantity})</span>
                <span className="font-medium text-ink">{formatMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Delivery fee</span>
                <span className="font-medium text-ink">{formatMoney(deliveryFee)}</span>
              </div>
            </SummaryBlock>

            <div>
              <div className="mb-2.5 flex items-center gap-1.5">
                <SectionLabel required>Payment method</SectionLabel>
                <button
                  type="button"
                  onClick={() => setShowTerms(true)}
                  title="Terms & Agreement"
                  className="-mt-2 text-slate-400 transition hover:text-blue-600"
                >
                  <Info size={14} />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPayMode('online')}
                  className={`relative rounded-2xl border-2 p-4 text-left transition ${
                    payMode === 'online'
                      ? 'border-blue-500 bg-blue-50/70 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-blue-300'
                  }`}
                >
                  {payMode === 'online' && (
                    <span className="absolute right-3 top-3 text-blue-500">
                      <CheckCircle2 size={18} />
                    </span>
                  )}
                  <CreditCard size={22} className="mb-3 text-blue-600" />
                  <p className="text-sm font-bold text-ink">Pay online now</p>
                  <p className="mt-1 text-xs text-muted">GCash or Maya via Xendit</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPayMode('cod')}
                  className={`relative rounded-2xl border-2 p-4 text-left transition ${
                    payMode === 'cod'
                      ? 'border-blue-500 bg-blue-50/70 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-blue-300'
                  }`}
                >
                  {payMode === 'cod' && (
                    <span className="absolute right-3 top-3 text-blue-500">
                      <CheckCircle2 size={18} />
                    </span>
                  )}
                  <Banknote size={22} className="mb-3 text-emerald-600" />
                  <p className="text-sm font-bold text-ink">Cash on delivery</p>
                  <p className="mt-1 text-xs text-muted">Pay the rider at your door</p>
                </button>
              </div>

              {payMode === 'online' ? (
                <div className="mt-3 flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
                  <ShieldCheck size={18} className="mt-0.5 shrink-0 text-blue-600" />
                  <div>
                    <p className="text-sm font-semibold text-ink">Secure checkout</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">
                      You&apos;ll open a Xendit page to pay with GCash or Maya. The order confirms only after payment succeeds.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3.5">
                  <Banknote size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="text-sm font-semibold text-ink">Prepare cash</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">
                      Have <span className="font-bold text-ink">{formatMoney(total)}</span> ready when the rider arrives.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600 ring-1 ring-red-100">
                {error}
              </p>
            )}

            <div className="flex justify-between gap-3 border-t border-slate-100 pt-5">
              <button type="button" onClick={goBack} className="agua-btn agua-btn-secondary">
                <ArrowLeft size={16} /> Back
              </button>
              {payMode === 'online' ? (
                <button
                  type="button"
                  onClick={handlePayNow}
                  disabled={loading}
                  className="agua-btn agua-btn-primary disabled:opacity-60"
                >
                  {loading ? 'Redirecting…' : 'Pay now'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmCOD}
                  disabled={loading}
                  className="agua-btn agua-btn-primary disabled:opacity-60"
                >
                  {loading ? 'Placing…' : 'Confirm order'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
    </div>
  );
}
