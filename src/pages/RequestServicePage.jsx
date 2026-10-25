// src/pages/RequestServicePage.jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Info, MapPin, Crosshair, LocateFixed } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiAddOrder, apiCreateCheckout, apiGeocode, apiReverseGeocode } from '../api';
import { TermsModal } from '../components/TermsContent';
import { CARTO_ATTRIBUTION, cartoVoyagerUrl } from '../lib/mapTiles';

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
    background:linear-gradient(135deg,#0ea5c9,#0284a8);border:3px solid #fff;
    box-shadow:0 6px 16px rgba(14,165,201,.45);display:flex;align-items:center;justify-content:center;
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
    <div className="relative overflow-hidden rounded-xl border border-gray-200">
      <MapContainer
        center={[pin.lat, pin.lng]}
        zoom={15}
        style={{ height: 220, width: '100%' }}
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
        <span className="rounded-full bg-white/95 px-3 py-1 text-[11px] font-medium text-gray-600 shadow-sm ring-1 ring-gray-200">
          Drag the pin or tap the map to set delivery point
        </span>
      </div>
    </div>
  );
}

// ── Step indicator ──
function StepBar({ step, isWalkin }) {
  const steps = isWalkin
    ? ['Select Order Type', 'Order Details']
    : ['Select Order Type', 'Order Details', 'Review & Pay'];
  return (
    <div className="flex items-center gap-2 mb-6">
      {steps.map((label, i) => {
        const num    = i + 1;
        const active = step === num;
        const done   = step > num;
        return (
          <div key={i} className="flex items-center gap-2 flex-1 last:flex-none">
            <div className="flex items-center gap-2 shrink-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition
                ${done  ? 'bg-[#0ea5c9] border-[#0ea5c9] text-white'
                : active ? 'bg-white border-[#0ea5c9] text-[#0ea5c9]'
                         : 'bg-white border-gray-200 text-gray-400'}`}>
                {done ? '✓' : num}
              </div>
              <span className={`text-xs font-semibold hidden sm:block ${active ? 'text-[#0ea5c9]' : done ? 'text-gray-500' : 'text-gray-300'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 rounded ${done ? 'bg-[#0ea5c9]' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Order type card ──
function OrderTypeCard({ emoji, title, subtitle, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-2xl border-2 p-4 text-left transition cursor-pointer
        ${selected ? 'border-[#0ea5c9] bg-[#f0fafd]' : 'border-gray-200 bg-white hover:border-[#0ea5c9]/40'}`}
    >
      <div className="text-3xl mb-2">{emoji}</div>
      <div className="font-bold text-sm text-[#0f172a]">{title}</div>
      <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>
    </button>
  );
}

// ── Priority badge ──
function PriorityBadge({ value, label, emoji, selected, onClick }) {
  return (
    <button
      onClick={() => onClick(value)}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition cursor-pointer
        ${selected ? 'border-[#0ea5c9] bg-[#f0fafd] text-[#0ea5c9]' : 'border-gray-200 bg-white text-gray-500 hover:border-[#0ea5c9]/40'}`}
    >
      <span>{emoji}</span>{label}
    </button>
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
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-4xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-[#0f172a] mb-2">Order Placed!</h2>
        <p className="text-gray-500 text-sm mb-6">
          {isWalkin
            ? 'Your walk-in order has been received. Please pay when you arrive.'
            : 'Your delivery order has been received. Please have the payment ready for the rider.'}
        </p>
        <div className="bg-white rounded-2xl shadow-sm px-8 py-5 text-sm text-left space-y-2 min-w-[260px] mb-6">
          <div className="flex justify-between"><span className="text-gray-400">Type</span><span className="font-semibold">{isWalkin ? 'Walk-in / Pickup' : 'Delivery (Cash on Delivery)'}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Gallons</span><span className="font-semibold">{quantity}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Total</span><span className="font-bold text-[#0ea5c9]">₱{total.toFixed(2)}</span></div>
        </div>
        <button
          onClick={() => {
            setSuccess(false); setStep(1); setOrderType(''); setPriority('normal'); setQuantity(1);
            setAddress(user?.address || ''); setNotes(''); setPayMode('online');
            setPin(DEFAULT_CENTER); setPinReady(false);
          }}
          className="bg-[#0ea5c9] hover:bg-[#0284a8] text-white font-semibold px-8 py-3 rounded-xl transition text-sm"
        >
          Place Another Order
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h2 className="font-display text-xl font-bold tracking-tight text-ink">Request an Order</h2>
        <p className="text-sm text-muted">Fill out the {isWalkin ? '2' : '3'}-step form below</p>
      </div>

      <div className="agua-card p-6">
        <StepBar step={step} isWalkin={isWalkin} />

        {/* ── STEP 1: Order Type ── */}
        {step === 1 && (
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Choose Order Type *</p>
            <div className="flex gap-3 mb-6">
              <OrderTypeCard
                emoji="🚶"
                title="Walk-in / Pickup"
                subtitle="Free"
                selected={orderType === 'walkin'}
                onClick={() => { setOrderType('walkin'); setError(''); }}
              />
              <OrderTypeCard
                emoji="🛵"
                title="Delivery"
                subtitle={`+ ₱${DELIVERY_FEE}.00`}
                selected={orderType === 'delivery'}
                onClick={() => { setOrderType('delivery'); setError(''); setPinReady(false); }}
              />
            </div>

            {orderType && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Priority</p>
                <div className="flex gap-2">
                  <PriorityBadge value="normal"  label="Normal"  emoji="🕐" selected={priority === 'normal'}  onClick={setPriority} />
                  <PriorityBadge value="priority" label="Priority" emoji="❤️" selected={priority === 'priority'} onClick={setPriority} />
                </div>
              </div>
            )}

            {error && <p className="text-red-500 text-xs mt-3">{error}</p>}

            <div className="flex justify-end mt-6">
              <button onClick={goNext} disabled={!orderType}
                className="bg-[#0ea5c9] hover:bg-[#0284a8] text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition disabled:opacity-40">
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Order Details ── */}
        {step === 2 && (
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">Order Details</p>

            {/* Quantity */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                Quantity of Gallons *
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="w-9 h-9 rounded-xl border-2 border-gray-200 flex items-center justify-center text-lg font-bold text-gray-600 hover:border-[#0ea5c9] transition"
                >−</button>
                <span className="text-xl font-bold text-[#0f172a] w-8 text-center">{quantity}</span>
                <button
                  onClick={() => setQuantity(q => q + 1)}
                  className="w-9 h-9 rounded-xl border-2 border-gray-200 flex items-center justify-center text-lg font-bold text-gray-600 hover:border-[#0ea5c9] transition"
                >+</button>
                <span className="text-sm text-gray-400 ml-1">🪣 GALLONS</span>
              </div>
            </div>

            {/* Delivery fields */}
            {isDelivery && (
              <>
                <div className="mb-4">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                    Delivery Location / Complete Address *
                  </label>
                  <input
                    value={address}
                    onChange={e => handleAddressChange(e.target.value)}
                    placeholder="e.g. Purok 3, Brgy. Cambaro, Mandaue City"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#0ea5c9]"
                  />
                </div>

                <div className="mb-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wide">
                      <MapPin size={13} className="text-[#0ea5c9]" />
                      Pin delivery point *
                    </label>
                    <button
                      type="button"
                      onClick={useMyLocation}
                      disabled={geoBusy}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#0ea5c9]/30 bg-[#f0fafd] px-2.5 py-1 text-[11px] font-semibold text-[#0ea5c9] hover:bg-[#e0f5fb] disabled:opacity-50"
                    >
                      <LocateFixed size={12} />
                      Use my location
                    </button>
                  </div>
                  <DeliveryPinMap pin={pin} onPinChange={(p) => applyPin(p)} />
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-gray-400">
                    <Crosshair size={11} />
                    {geoBusy
                      ? 'Updating location…'
                      : `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`}
                  </p>
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                    Delivery Notes / Instructions
                  </label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="e.g. Leave at the gate, call upon arrival..."
                    rows={2}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#0ea5c9] resize-none"
                  />
                </div>
              </>
            )}

            {/* Walk-in note */}
            {isWalkin && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-4 text-sm text-blue-600">
                💡 Walk-in orders are paid upon arrival at the station.
              </div>
            )}

            {/* Order Summary */}
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Order Summary</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Gallons ({quantity})</span>
                  <span>₱{subtotal.toFixed(2)}</span>
                </div>
                {isDelivery && (
                  <div className="flex justify-between text-gray-600">
                    <span>Delivery Fee</span>
                    <span>₱{deliveryFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-[#0f172a] pt-2 border-t border-gray-200">
                  <span>TOTAL</span>
                  <span className="text-[#0ea5c9]">₱{total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {error && <p className="text-red-500 text-xs mb-3">{error}</p>}

            <div className="flex justify-between">
              <button onClick={goBack}
                className="border border-gray-200 text-gray-600 font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition">
                ← Back
              </button>
              {isWalkin ? (
                <button onClick={handleConfirmWalkin} disabled={loading}
                  className="bg-[#0ea5c9] hover:bg-[#0284a8] text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition disabled:opacity-60">
                  {loading ? 'Placing...' : '✅ Confirm Order'}
                </button>
              ) : (
                <button onClick={goNext}
                  className="bg-[#0ea5c9] hover:bg-[#0284a8] text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition">
                  Review & Pay →
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 3: Review & Pay (Delivery only) ── */}
        {step === 3 && (
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">Review & Payment</p>

            {/* Order summary */}
            <div className="bg-gray-50 rounded-xl p-4 mb-5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Order Summary</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Gallons ({quantity})</span><span>₱{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Delivery Fee</span><span>₱{deliveryFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600 gap-3">
                  <span className="shrink-0">Address</span>
                  <span className="text-right max-w-[55%] text-gray-500">{address}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Map pin</span>
                  <span className="text-gray-500 text-xs font-mono">{pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}</span>
                </div>
                <div className="flex justify-between font-bold text-[#0f172a] pt-2 border-t border-gray-200">
                  <span>TOTAL</span>
                  <span className="text-[#0ea5c9]">₱{total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Payment method */}
            <div className="mb-4">
              <div className="flex items-center gap-1.5 mb-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Payment Method</p>
                <button
                  type="button"
                  onClick={() => setShowTerms(true)}
                  title="Terms & Agreement (credit / utang)"
                  className="text-gray-400 hover:text-[#0ea5c9]"
                >
                  <Info size={14} />
                </button>
              </div>
              <div className="flex gap-3 mb-3">
                <button
                  onClick={() => setPayMode('online')}
                  className={`flex-1 rounded-xl border-2 p-3 text-left transition cursor-pointer
                    ${payMode === 'online' ? 'border-[#0ea5c9] bg-[#f0fafd]' : 'border-gray-200 bg-white hover:border-[#0ea5c9]/40'}`}
                >
                  <div className="text-lg mb-1">💳</div>
                  <div className="font-bold text-sm text-[#0f172a]">Pay Online Now</div>
                  <div className="text-xs text-gray-500 mt-0.5">GCash or Maya</div>
                </button>
                <button
                  onClick={() => setPayMode('cod')}
                  className={`flex-1 rounded-xl border-2 p-3 text-left transition cursor-pointer
                    ${payMode === 'cod' ? 'border-[#0ea5c9] bg-[#f0fafd]' : 'border-gray-200 bg-white hover:border-[#0ea5c9]/40'}`}
                >
                  <div className="text-lg mb-1">💵</div>
                  <div className="font-bold text-sm text-[#0f172a]">Cash on Delivery</div>
                  <div className="text-xs text-gray-500 mt-0.5">Pay the rider</div>
                </button>
              </div>

              {payMode === 'online' ? (
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <p className="text-sm text-gray-500 mb-1">You'll be taken to a secure Xendit page to pay via</p>
                  <p className="text-sm font-bold text-[#0f172a] mb-3">💙 GCash &nbsp; or &nbsp; 💚 Maya</p>
                  <p className="text-xs text-gray-400">Your order is only confirmed once payment actually goes through — no manual reference number needed.</p>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <p className="text-sm text-gray-500">Have <span className="font-bold text-[#0f172a]">₱{total.toFixed(2)}</span> ready in cash for the rider when your order arrives.</p>
                </div>
              )}
            </div>

            {error && <p className="text-red-500 text-xs mb-3">{error}</p>}

            <div className="flex justify-between">
              <button onClick={goBack}
                className="border border-gray-200 text-gray-600 font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition">
                ← Back
              </button>
              {payMode === 'online' ? (
                <button onClick={handlePayNow} disabled={loading}
                  className="bg-[#0ea5c9] hover:bg-[#0284a8] text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition disabled:opacity-60">
                  {loading ? 'Redirecting...' : '💳 Pay Now'}
                </button>
              ) : (
                <button onClick={handleConfirmCOD} disabled={loading}
                  className="bg-[#0ea5c9] hover:bg-[#0284a8] text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition disabled:opacity-60">
                  {loading ? 'Placing...' : '✅ Confirm Order'}
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
