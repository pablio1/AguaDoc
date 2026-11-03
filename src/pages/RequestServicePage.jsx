// src/pages/RequestServicePage.jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Info, MapPin, Crosshair, LocateFixed, Store, Truck, CheckCircle2,
  CreditCard, Banknote, ArrowRight, ArrowLeft, Minus, Plus, Droplets, Zap,
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiAddOrder, apiCreateCheckout, apiGeocode, apiReverseGeocode } from '../api';
import { TermsModal } from '../components/TermsContent';
import { CARTO_ATTRIBUTION, cartoVoyagerUrl } from '../lib/mapTiles';
import { formatMoney } from '../lib/money';

const PRICE_PER_GALLON = 40;
const DELIVERY_FEE     = 20;
const DEFAULT_CENTER   = { lat: 10.3157, lng: 123.9740 }; // Lapu-Lapu / AguaDoc area

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
    <div className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50 ring-1 ring-slate-100">
      <MapContainer
        center={[pin.lat, pin.lng]}
        zoom={15}
        style={{ height: 240, width: '100%' }}
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
      <div className="pointer-events-none absolute bottom-2 left-2 right-2 z-[1000] flex justify-center">
        <span className="rounded-full bg-white/95 px-3 py-1 text-[11px] font-medium text-muted shadow-sm ring-1 ring-slate-200/80">
          Drag the pin or tap the map to set delivery point
        </span>
      </div>
    </div>
  );
}

// ── Step indicator ──
function StepBar({ step, isWalkin }) {
  const steps = isWalkin
    ? ['Order type', 'Details']
    : ['Order type', 'Details', 'Review & pay'];
  return (
    <div className="mb-8 flex items-center gap-2">
      {steps.map((label, i) => {
        const num    = i + 1;
        const active = step === num;
        const done   = step > num;
        return (
          <div key={i} className="flex flex-1 items-center gap-2 last:flex-none">
            <div className="flex shrink-0 items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition ${
                done  ? 'border-accent bg-accent text-white'
                : active ? 'border-accent bg-white text-accent2'
                         : 'border-slate-200 bg-white text-slate-400'
              }`}>
                {done ? '✓' : num}
              </div>
              <span className={`hidden text-xs font-semibold sm:block ${
                active ? 'text-accent2' : done ? 'text-muted' : 'text-slate-300'
              }`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`mx-1 h-0.5 flex-1 rounded ${done ? 'bg-accent' : 'bg-slate-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Order type card ──
function OrderTypeCard({ icon: Icon, title, subtitle, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 cursor-pointer rounded-2xl border-2 p-4 text-left transition ${
        selected
          ? 'border-accent bg-mist ring-2 ring-blue-500/15'
          : 'border-slate-200/80 bg-white hover:border-accent/40'
      }`}
    >
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${
        selected ? 'bg-blue-500 text-white shadow-md shadow-blue-500/25' : 'bg-slate-100 text-slate-500'
      }`}>
        <Icon size={20} />
      </div>
      <div className="text-sm font-bold text-ink">{title}</div>
      <div className="mt-0.5 text-xs text-muted">{subtitle}</div>
    </button>
  );
}

// ── Priority badge ──
function PriorityBadge({ value, label, icon: Icon, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`flex cursor-pointer items-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-semibold transition ${
        selected
          ? 'border-accent bg-mist text-accent2'
          : 'border-slate-200/80 bg-white text-muted hover:border-accent/40'
      }`}
    >
      <Icon size={16} />{label}
    </button>
  );
}

function SummaryBlock({ children }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4">
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Order summary</p>
      {children}
    </div>
  );
}

export default function RequestServicePage({ user, onOrderPlaced }) {
  const [step,     setStep]     = useState(1);
  const [orderType, setOrderType] = useState('');   // 'walkin' | 'delivery'
  const [priority,  setPriority]  = useState('normal');
  const [quantity,  setQuantity]  = useState(1);
  const [address,   setAddress]   = useState(user?.address || '');
  const [notes,     setNotes]     = useState('');
  const [pin, setPin] = useState(DEFAULT_CENTER);
  const [pinReady, setPinReady] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [success,   setSuccess]   = useState(false);
  const [error,     setError]     = useState('');
  const [payMode,   setPayMode]   = useState('online'); // 'online' | 'cod' — delivery only
  const [showTerms, setShowTerms]  = useState(false);
  const skipNextGeocode = useRef(false);
  const addressTimer = useRef(null);

  const isWalkin   = orderType === 'walkin';
  const isDelivery = orderType === 'delivery';
  const subtotal   = quantity * PRICE_PER_GALLON;
  const deliveryFee = isDelivery ? DELIVERY_FEE : 0;
  const total      = subtotal + deliveryFee;

  // Seed pin from profile address or device GPS once delivery is chosen
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

  // When the customer edits the address text, move the pin (debounced)
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

  // ── Navigation ──
  function goNext() {
    setError('');
    if (step === 1 && !orderType) { setError('Please select an order type.'); return; }
    if (step === 2 && isDelivery) {
      if (!address.trim()) { setError('Please enter a delivery address.'); return; }
      if (pin.lat == null || pin.lng == null) { setError('Please set a delivery pin on the map.'); return; }
    }
    setStep(s => s + 1);
  }
  function goBack() { setError(''); setStep(s => s - 1); }

  // ── Walk-in: pay on arrival, no gateway involved ──
  async function handleConfirmWalkin() {
  setLoading(true);
  try {
    await apiAddOrder({
      userId:      user.id,
      type:        'Walk-in / Pickup',
      priority,
      quantity,
      address:     'Walk-in',
      notes,
      payMethod:   'Pay on arrival',
      total,
      status:      'Pending',
    });
    setSuccess(true);
    onOrderPlaced?.();
  } catch {
    setError('Failed to place order. Please try again.');
  } finally {
    setLoading(false);
  }
}

  // ── Delivery, Cash on Delivery: pay the rider directly, no gateway involved ──
  async function handleConfirmCOD() {
  setLoading(true);
  setError('');
  try {
    await apiAddOrder({
      userId:      user.id,
      type:        'Delivery',
      priority,
      quantity,
      address,
      notes,
      payMethod:   'Cash on Delivery',
      total,
      status:      'Pending',
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

  // ── Delivery, pay online now: real GCash/Maya payment via Xendit — leaves this page entirely ──
  async function handlePayNow() {
  setLoading(true);
  setError('');
  try {
    const { checkoutUrl } = await apiCreateCheckout({
      userId:   user.id,
      type:     'Delivery',
      priority,
      quantity,
      address,
      notes,
      total,
      lat: pin.lat,
      lng: pin.lng,
    });
    window.location.href = checkoutUrl; // hand off to Xendit's hosted payment page
  } catch {
    setError('Could not start payment. Please try again.');
    setLoading(false);
  }
}

  // ── Success screen (walk-in and COD-delivery only — online-payment success is shown after returning from Xendit) ──
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
          <CheckCircle2 size={40} />
        </div>
        <h2 className="font-display text-xl font-bold text-ink">Order placed</h2>
        <p className="mb-6 mt-2 max-w-sm text-sm text-muted">
          {isWalkin
            ? 'Your walk-in order has been received. Please pay when you arrive.'
            : 'Your delivery order has been received. Please have the payment ready for the rider.'}
        </p>
        <div className="agua-card mb-6 min-w-[260px] space-y-2 px-8 py-5 text-left text-sm">
          <div className="flex justify-between"><span className="text-muted">Type</span><span className="font-semibold">{isWalkin ? 'Walk-in / Pickup' : 'Delivery (Cash on Delivery)'}</span></div>
          <div className="flex justify-between"><span className="text-muted">Gallons</span><span className="font-semibold">{quantity}</span></div>
          <div className="flex justify-between"><span className="text-muted">Total</span><span className="font-bold text-accent2">{formatMoney(total)}</span></div>
        </div>
        <button
          type="button"
          onClick={() => {
            setSuccess(false); setStep(1); setOrderType(''); setPriority('normal'); setQuantity(1);
            setAddress(user?.address || ''); setNotes(''); setPayMode('online');
            setPin(DEFAULT_CENTER); setPinReady(false);
          }}
          className="agua-btn agua-btn-primary"
        >
          Place another order
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5">
        <h2 className="font-display text-2xl font-bold tracking-tight text-ink">Request an order</h2>
        <p className="mt-1 text-sm text-muted">
          {isWalkin ? 'Two steps' : 'Three steps'} — delivery, walk-in, and payment options
        </p>
      </div>

      <div className="agua-card p-5 sm:p-6">
        <StepBar step={step} isWalkin={isWalkin} />

        {/* ── STEP 1: Order Type ── */}
        {step === 1 && (
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Choose order type *</p>
            <div className="mb-6 flex gap-3">
              <OrderTypeCard
                icon={Store}
                title="Walk-in / Pickup"
                subtitle="Free"
                selected={orderType === 'walkin'}
                onClick={() => { setOrderType('walkin'); setError(''); }}
              />
              <OrderTypeCard
                icon={Truck}
                title="Delivery"
                subtitle={`+ ${formatMoney(DELIVERY_FEE)}`}
                selected={orderType === 'delivery'}
                onClick={() => { setOrderType('delivery'); setError(''); setPinReady(false); }}
              />
            </div>

            {orderType && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Priority</p>
                <div className="flex flex-wrap gap-2">
                  <PriorityBadge value="normal" label="Normal" icon={Droplets} selected={priority === 'normal'} onClick={setPriority} />
                  <PriorityBadge value="priority" label="Priority" icon={Zap} selected={priority === 'priority'} onClick={setPriority} />
                </div>
              </div>
            )}

            {error && <p className="mt-3 text-xs font-medium text-red-600">{error}</p>}

            <div className="mt-6 flex justify-end">
              <button type="button" onClick={goNext} disabled={!orderType}
                className="agua-btn agua-btn-primary disabled:opacity-40">
                Next <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Order Details ── */}
        {step === 2 && (
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-wide text-muted">Order details</p>

            <div className="mb-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-muted">
                Quantity of gallons *
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-slate-200 text-slate-600 transition hover:border-accent"
                ><Minus size={18} /></button>
                <span className="w-10 text-center font-display text-xl font-bold text-ink">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity(q => q + 1)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-slate-200 text-slate-600 transition hover:border-accent"
                ><Plus size={18} /></button>
                <span className="ml-1 flex items-center gap-1 text-sm text-muted"><Droplets size={14} /> gallons</span>
              </div>
            </div>

            {isDelivery && (
              <>
                <div className="mb-4">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-muted">
                    Delivery location / complete address *
                  </label>
                  <input
                    value={address}
                    onChange={e => handleAddressChange(e.target.value)}
                    placeholder="e.g. Purok 3, Brgy. Cambaro, Mandaue City"
                    className="agua-input"
                  />
                </div>

                <div className="mb-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
                      <MapPin size={13} className="text-accent2" />
                      Pin delivery point *
                    </label>
                    <button
                      type="button"
                      onClick={useMyLocation}
                      disabled={geoBusy}
                      className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-mist px-2.5 py-1 text-[11px] font-semibold text-accent2 hover:bg-blue-100/80 disabled:opacity-50"
                    >
                      <LocateFixed size={12} />
                      Use my location
                    </button>
                  </div>
                  <DeliveryPinMap pin={pin} onPinChange={(p) => applyPin(p)} />
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted">
                    <Crosshair size={11} />
                    {geoBusy
                      ? 'Updating location…'
                      : `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`}
                  </p>
                </div>

                <div className="mb-4">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-muted">
                    Delivery notes / instructions
                  </label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="e.g. Leave at the gate, call upon arrival..."
                    rows={2}
                    className="agua-input resize-none"
                  />
                </div>
              </>
            )}

            {isWalkin && (
              <div className="mb-4 rounded-xl border border-blue-100 bg-mist px-4 py-3 text-sm text-accent2">
                Walk-in orders are paid upon arrival at the station.
              </div>
            )}

            <SummaryBlock>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-muted">
                  <span>Gallons ({quantity})</span>
                  <span>{formatMoney(subtotal)}</span>
                </div>
                {isDelivery && (
                  <div className="flex justify-between text-muted">
                    <span>Delivery fee</span>
                    <span>{formatMoney(deliveryFee)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-ink">
                  <span>Total</span>
                  <span className="text-accent2">{formatMoney(total)}</span>
                </div>
              </div>
            </SummaryBlock>

            {error && <p className="mb-3 mt-3 text-xs font-medium text-red-600">{error}</p>}

            <div className="mt-6 flex justify-between gap-3">
              <button type="button" onClick={goBack}
                className="agua-btn agua-btn-secondary">
                <ArrowLeft size={16} /> Back
              </button>
              {isWalkin ? (
                <button type="button" onClick={handleConfirmWalkin} disabled={loading}
                  className="agua-btn agua-btn-primary disabled:opacity-60">
                  {loading ? 'Placing…' : 'Confirm order'}
                </button>
              ) : (
                <button type="button" onClick={goNext}
                  className="agua-btn agua-btn-primary">
                  Review & pay <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 3: Review & Pay (Delivery only) ── */}
        {step === 3 && (
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-wide text-muted">Review & payment</p>

            <SummaryBlock>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-muted">
                  <span>Gallons ({quantity})</span><span>{formatMoney(subtotal)}</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Delivery fee</span><span>{formatMoney(deliveryFee)}</span>
                </div>
                <div className="flex justify-between gap-3 text-muted">
                  <span className="shrink-0">Address</span>
                  <span className="max-w-[55%] text-right text-muted">{address}</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Map pin</span>
                  <span className="font-mono text-xs text-muted">{pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-ink">
                  <span>Total</span>
                  <span className="text-accent2">{formatMoney(total)}</span>
                </div>
              </div>
            </SummaryBlock>

            <div className="mb-4 mt-5">
              <div className="mb-3 flex items-center gap-1.5">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">Payment method</p>
                <button
                  type="button"
                  onClick={() => setShowTerms(true)}
                  title="Terms & Agreement (credit / utang)"
                  className="text-slate-400 hover:text-accent2"
                >
                  <Info size={14} />
                </button>
              </div>
              <div className="mb-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => setPayMode('online')}
                  className={`flex flex-1 cursor-pointer rounded-xl border-2 p-3 text-left transition ${
                    payMode === 'online' ? 'border-accent bg-mist ring-2 ring-blue-500/15' : 'border-slate-200/80 bg-white hover:border-accent/40'
                  }`}
                >
                  <CreditCard size={20} className="mb-2 text-accent2" />
                  <div className="text-sm font-bold text-ink">Pay online now</div>
                  <div className="mt-0.5 text-xs text-muted">GCash or Maya</div>
                </button>
                <button
                  type="button"
                  onClick={() => setPayMode('cod')}
                  className={`flex flex-1 cursor-pointer rounded-xl border-2 p-3 text-left transition ${
                    payMode === 'cod' ? 'border-accent bg-mist ring-2 ring-blue-500/15' : 'border-slate-200/80 bg-white hover:border-accent/40'
                  }`}
                >
                  <Banknote size={20} className="mb-2 text-emerald-600" />
                  <div className="text-sm font-bold text-ink">Cash on delivery</div>
                  <div className="mt-0.5 text-xs text-muted">Pay the rider</div>
                </button>
              </div>

              {payMode === 'online' ? (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 text-center">
                  <p className="mb-1 text-sm text-muted">You&apos;ll be taken to a secure Xendit page to pay via</p>
                  <p className="mb-3 text-sm font-bold text-ink">GCash or Maya</p>
                  <p className="text-xs text-muted">Your order is only confirmed once payment goes through — no manual reference number needed.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 text-center">
                  <p className="text-sm text-muted">Have <span className="font-bold text-ink">{formatMoney(total)}</span> ready in cash for the rider when your order arrives.</p>
                </div>
              )}
            </div>

            {error && <p className="mb-3 text-xs font-medium text-red-600">{error}</p>}

            <div className="flex justify-between gap-3">
              <button type="button" onClick={goBack}
                className="agua-btn agua-btn-secondary">
                <ArrowLeft size={16} /> Back
              </button>
              {payMode === 'online' ? (
                <button type="button" onClick={handlePayNow} disabled={loading}
                  className="agua-btn agua-btn-primary disabled:opacity-60">
                  {loading ? 'Redirecting…' : 'Pay now'}
                </button>
              ) : (
                <button type="button" onClick={handleConfirmCOD} disabled={loading}
                  className="agua-btn agua-btn-primary disabled:opacity-60">
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
