import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Info, Crosshair, LocateFixed, Store, Truck, CheckCircle2,
  CreditCard, Banknote, ArrowRight, ArrowLeft, Minus, Plus,
  Sparkles, ShieldCheck, MapPin, Phone, Clock, Home,
} from 'lucide-react';
import { apiAddOrder, apiCreateCheckout, apiGeocode, apiReverseGeocode } from '../api';
import { TermsModal } from '../components/TermsContent';
import GeoMap from '../components/map/GeoMap';
import BrandMark from '../components/BrandMark';
import { formatMoney } from '../lib/money';
import { DEFAULT_PRODUCT_ID, SERVICE_PRODUCTS, getServiceProduct } from '../lib/products';

const DELIVERY_FEE = 20;
const DEFAULT_CENTER = { lat: 10.3157, lng: 123.9740 };
const GALLON_PRESETS = [1, 2, 3, 5, 10];

const pinHtml = `<div style="
    width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
    background:linear-gradient(135deg,#3b82f6,#2563eb);border:3px solid #fff;
    box-shadow:0 6px 16px rgba(59,130,246,.4);display:flex;align-items:center;justify-content:center;
  "><span style="transform:rotate(45deg);font-size:14px">💧</span></div>`;

function DeliveryPinMap({ pin, onPinChange }) {
  return (
    <div className="relative overflow-hidden rounded-[22px] border border-slate-200/80 bg-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,.6)]">
      <GeoMap
        theme="light"
        center={pin}
        zoom={15}
        className="h-[260px] sm:h-[300px]"
        onMapClick={onPinChange}
        markers={[{
          id: 'pin',
          lat: pin.lat,
          lng: pin.lng,
          html: pinHtml,
          anchor: 'bottom',
          draggable: true,
          onDragEnd: onPinChange,
        }]}
      />
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-[5] flex justify-center">
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
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        <span>Step {Math.min(step, steps.length)} of {steps.length}</span>
        <span className="text-blue-600">{steps[Math.min(step, steps.length) - 1]}</span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-sky-400 transition-all duration-500 ease-out"
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
                <span className={`hidden text-xs font-semibold lg:block ${
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

function OrderTypeCard({ icon: Icon, title, subtitle, included, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex flex-1 flex-col overflow-hidden rounded-[22px] border-2 p-5 text-left transition duration-300 ${
        selected
          ? 'border-blue-500 bg-gradient-to-br from-blue-50 via-white to-sky-50 shadow-lg shadow-blue-500/10'
          : 'border-slate-200/90 bg-white hover:border-blue-300 hover:shadow-md'
      }`}
    >
      {selected && (
        <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white shadow-md shadow-blue-500/30">
          <CheckCircle2 size={14} />
        </span>
      )}
      <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl transition ${
        selected
          ? 'bg-gradient-to-br from-blue-500 to-sky-500 text-white shadow-lg shadow-blue-500/25'
          : 'bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600'
      }`}>
        <Icon size={22} />
      </div>
      <p className="font-display text-lg font-bold text-ink">{title}</p>
      <p className={`mt-1 text-sm font-semibold ${selected ? 'text-blue-600' : 'text-muted'}`}>{subtitle}</p>
      {included?.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {included.map((line) => (
            <li key={line} className="flex items-start gap-1.5 text-xs text-muted">
              <CheckCircle2 size={12} className={`mt-0.5 shrink-0 ${selected ? 'text-blue-500' : 'text-slate-300'}`} />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
    </button>
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

function ProductPicker({ value, onChange }) {
  return (
    <div className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <SectionLabel required>Item &amp; container type</SectionLabel>
        <p className="mt-[-0.35rem] text-xs text-muted">
          Refills are a round-trip (pickup jug → station → return). New jugs are one-way delivery.
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        {SERVICE_PRODUCTS.map((p) => {
          const selected = value === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(p.id)}
              className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition ${
                selected ? 'bg-blue-50/80' : 'bg-white hover:bg-slate-50'
              }`}
            >
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                selected ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300'
              }`}>
                {selected ? <CheckCircle2 size={12} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{p.label}</span>
                <span className="mt-0.5 block text-[11px] text-muted">
                  {p.kind === 'refill'
                    ? 'Round-trip · rider picks up your empty jug, refills, then returns'
                    : 'One-way · new filled container delivered to you'}
                </span>
              </span>
              <span className="shrink-0 text-sm font-bold tabular-nums text-blue-600">
                {formatMoney(p.price)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OrderSummaryPanel({
  orderType,
  quantity,
  unitPrice,
  productLabel,
  subtotal,
  deliveryFee,
  total,
  address,
  compact = false,
}) {
  const isDelivery = orderType === 'delivery';
  const isWalkin = orderType === 'walkin';

  return (
    <aside className={`overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-sm ${compact ? '' : 'lg:sticky lg:top-4'}`}>
      <div className="bg-gradient-to-br from-[#0f172a] via-[#1e3a5f] to-[#0f172a] px-5 py-4 text-white">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-200/80">Order summary</p>
        <p className="mt-1 font-display text-xl font-bold">
          {isWalkin ? 'Walk-in pickup' : isDelivery ? 'Home delivery' : 'Choose a service'}
        </p>
      </div>
      <div className="space-y-3 px-5 py-4 text-sm">
        {productLabel && (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-medium leading-snug text-slate-600">
            {productLabel}
          </p>
        )}
        <div className="flex justify-between gap-3 text-muted">
          <span>Items ({quantity} × {formatMoney(unitPrice)})</span>
          <span className="font-semibold text-ink">{formatMoney(subtotal)}</span>
        </div>
        {isDelivery && (
          <div className="flex justify-between gap-3 text-muted">
            <span>Delivery fee</span>
            <span className="font-semibold text-ink">{formatMoney(deliveryFee)}</span>
          </div>
        )}
        {isWalkin && (
          <div className="flex justify-between gap-3 text-muted">
            <span>Delivery fee</span>
            <span className="font-semibold text-emerald-600">Free</span>
          </div>
        )}
        {isDelivery && address?.trim() && (
          <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-muted">
            <p className="mb-1 flex items-center gap-1 font-semibold text-slate-500">
              <MapPin size={11} /> Drop-off
            </p>
            <p className="line-clamp-2 leading-relaxed text-ink">{address}</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 bg-blue-50/60 px-5 py-4">
        <span className="text-sm font-bold text-ink">Total due</span>
        <span className="font-display text-2xl font-bold text-blue-600">{formatMoney(total)}</span>
      </div>
    </aside>
  );
}

export default function RequestServicePage({ user, onOrderPlaced, onViewOrders }) {
  const [step, setStep] = useState(1);
  const [orderType, setOrderType] = useState('');
  const [productId, setProductId] = useState(DEFAULT_PRODUCT_ID);
  const [quantity, setQuantity] = useState(1);
  const [address, setAddress] = useState(user?.address || '');
  const [notes, setNotes] = useState('');
  const [pin, setPin] = useState(DEFAULT_CENTER);
  const [pinReady, setPinReady] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successPay, setSuccessPay] = useState('');
  const [error, setError] = useState('');
  const [payMode, setPayMode] = useState('online');
  const [showTerms, setShowTerms] = useState(false);
  const skipNextGeocode = useRef(false);
  const addressTimer = useRef(null);

  const isWalkin = orderType === 'walkin';
  const isDelivery = orderType === 'delivery';
  const product = getServiceProduct(productId);
  const unitPrice = product.price;
  const subtotal = quantity * unitPrice;
  const deliveryFee = isDelivery ? DELIVERY_FEE : 0;
  const total = subtotal + deliveryFee;
  const hasSavedAddress = Boolean(user?.address?.trim());
  const hasPhone = Boolean(user?.phone?.trim());

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

  function useSavedAddress() {
    if (!user?.address) return;
    skipNextGeocode.current = false;
    handleAddressChange(user.address);
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
    if (step === 1) {
      if (!orderType) { setError('Please select an order type.'); return; }
      if (!productId) { setError('Please select an item & container type.'); return; }
    }
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
        productId: product.id,
        priority: 'normal',
        quantity,
        address: 'Walk-in',
        notes,
        payMethod: 'Pay on arrival',
        total,
        status: 'Pending',
      });
      setSuccessPay('Pay on arrival');
      setSuccess(true);
      onOrderPlaced?.({ navigate: false });
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
        productId: product.id,
        priority: 'normal',
        quantity,
        address,
        notes,
        payMethod: 'Cash on Delivery',
        total,
        status: 'Pending',
        lat: pin.lat,
        lng: pin.lng,
      });
      setSuccessPay('Cash on Delivery');
      setSuccess(true);
      onOrderPlaced?.({ navigate: false });
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
        productId: product.id,
        priority: 'normal',
        quantity,
        address,
        notes,
        total,
        lat: pin.lat,
        lng: pin.lng,
        returnOrigin: window.location.origin,
      });
      window.location.href = checkoutUrl;
    } catch {
      setError('Could not start payment. Please try again.');
      setLoading(false);
    }
  }

  function resetForm() {
    setSuccess(false);
    setSuccessPay('');
    setStep(1);
    setOrderType('');
    setProductId(DEFAULT_PRODUCT_ID);
    setQuantity(1);
    setAddress(user?.address || '');
    setNotes('');
    setPayMode('online');
    setPin(DEFAULT_CENTER);
    setPinReady(false);
    setError('');
  }

  const summaryProps = {
    orderType,
    quantity,
    unitPrice,
    productLabel: product.label,
    subtotal,
    deliveryFee,
    total,
    address,
  };

  if (success) {
    return (
      <div className="mx-auto max-w-lg agua-fade-up">
        <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-xl shadow-slate-900/5">
          <div className="relative overflow-hidden bg-gradient-to-b from-emerald-50 via-white to-white px-6 pb-2 pt-10 text-center">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.18),_transparent_55%)]" />
            <div className="relative mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
              <CheckCircle2 size={40} />
            </div>
            <h2 className="relative font-display text-2xl font-bold text-ink">Order placed</h2>
            <p className="relative mx-auto mt-2 max-w-sm text-sm text-muted">
              {isWalkin
                ? 'Your walk-in order is confirmed. Pay when you arrive at the station.'
                : 'Your delivery is confirmed. Track it anytime from My Orders.'}
            </p>
          </div>
          <div className="space-y-2.5 px-6 py-6 text-sm">
            <div className="flex justify-between rounded-2xl bg-slate-50 px-4 py-3">
              <span className="text-muted">Type</span>
              <span className="font-semibold text-ink">
                {isWalkin ? 'Walk-in / Pickup' : 'Home delivery'}
              </span>
            </div>
            <div className="flex justify-between rounded-2xl bg-slate-50 px-4 py-3">
              <span className="text-muted">Payment</span>
              <span className="font-semibold text-ink">{successPay || '—'}</span>
            </div>
            <div className="flex justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
              <span className="text-muted">Item</span>
              <span className="max-w-[65%] text-right text-xs font-semibold text-ink">{product.label}</span>
            </div>
            <div className="flex justify-between rounded-2xl bg-slate-50 px-4 py-3">
              <span className="text-muted">Quantity</span>
              <span className="font-semibold text-ink">{quantity}</span>
            </div>
            <div className="flex justify-between rounded-2xl bg-blue-50 px-4 py-3.5">
              <span className="font-semibold text-ink">Total</span>
              <span className="font-display text-xl font-bold text-blue-600">{formatMoney(total)}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2.5 border-t border-slate-100 px-6 py-5 sm:flex-row">
            <button type="button" onClick={resetForm} className="agua-btn agua-btn-secondary flex-1">
              Place another order
            </button>
            <button
              type="button"
              onClick={() => {
                onOrderPlaced?.({ navigate: false });
                onViewOrders?.();
              }}
              className="agua-btn agua-btn-primary flex-1"
            >
              View my orders
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200/70 bg-gradient-to-br from-[#0f172a] via-[#1e3a5f] to-[#0c4a6e] px-5 py-6 text-white shadow-lg shadow-slate-900/10 sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-48 w-48 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-3">
              <div className="overflow-hidden rounded-2xl bg-white/10 p-1.5 ring-1 ring-white/15">
                <BrandMark iconOnly size="sm" />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200/90">
                Request service
              </p>
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Clean refill, pickup or delivery
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
              Order gallons in a few steps. Pin your drop-off for delivery, or reserve a walk-in pickup at the station.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 text-xs font-semibold text-white ring-1 ring-white/15 backdrop-blur">
              <Sparkles size={13} className="text-sky-300" />
              Refill from {formatMoney(25)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 text-xs font-semibold text-white ring-1 ring-white/15 backdrop-blur">
              <Truck size={13} className="text-sky-300" />
              Delivery {formatMoney(DELIVERY_FEE)}
            </span>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
          <StepBar step={step} isWalkin={isWalkin} />

          {/* STEP 1 */}
          {step === 1 && (
            <div key="step-1" className="agua-fade-up space-y-6">
              <div>
                <SectionLabel required>How do you want your water?</SectionLabel>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <OrderTypeCard
                    icon={Store}
                    title="Walk-in / Pickup"
                    subtitle="Free · No delivery fee"
                    included={[
                      'Reserve gallons ahead of time',
                      'Pay when you arrive at the station',
                      'No map pin needed',
                    ]}
                    selected={orderType === 'walkin'}
                    onClick={() => { setOrderType('walkin'); setError(''); }}
                  />
                  <OrderTypeCard
                    icon={Truck}
                    title="Home delivery"
                    subtitle={`+ ${formatMoney(DELIVERY_FEE)} delivery`}
                    included={[
                      'Doorstep drop-off with map pin',
                      'Live rider tracking when out',
                      'Pay online or cash on delivery',
                    ]}
                    selected={orderType === 'delivery'}
                    onClick={() => { setOrderType('delivery'); setError(''); setPinReady(false); }}
                  />
                </div>
              </div>

              {orderType && (
                <div className="agua-fade-up">
                  <ProductPicker value={productId} onChange={(id) => { setProductId(id); setError(''); }} />
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
                  disabled={!orderType || !productId}
                  className="agua-btn agua-btn-primary disabled:opacity-40"
                >
                  Continue <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div key="step-2" className="agua-fade-up space-y-5">
              <div className="rounded-[22px] border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-4 sm:p-5">
                <SectionLabel required>How many?</SectionLabel>
                <div className="mb-4 flex flex-wrap gap-2">
                  {GALLON_PRESETS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setQuantity(n)}
                      className={`min-w-[3rem] rounded-full px-3.5 py-2 text-sm font-bold transition ${
                        quantity === n
                          ? 'bg-blue-500 text-white shadow-md shadow-blue-500/25'
                          : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-blue-300'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
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
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">units</p>
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
                    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                      <SectionLabel required>Delivery address</SectionLabel>
                      {hasSavedAddress && (
                        <button
                          type="button"
                          onClick={useSavedAddress}
                          className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
                        >
                          <Home size={12} /> Use saved address
                        </button>
                      )}
                    </div>
                    <input
                      value={address}
                      onChange={(e) => handleAddressChange(e.target.value)}
                      placeholder="e.g. Purok 3, Brgy. Basak, Lapu-Lapu City"
                      className="agua-input"
                    />
                  </div>

                  <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3.5">
                    <Phone size={16} className={`mt-0.5 shrink-0 ${hasPhone ? 'text-blue-600' : 'text-amber-600'}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">Rider contact number</p>
                      {hasPhone ? (
                        <p className="mt-0.5 text-xs text-muted">
                          We’ll share <span className="font-semibold text-ink">{user.phone}</span> with your rider for this delivery.
                        </p>
                      ) : (
                        <p className="mt-0.5 text-xs text-amber-700">
                          No phone on your profile yet. Add one under Edit Profile so the rider can reach you.
                        </p>
                      )}
                    </div>
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
                      placeholder="e.g. Leave at the gate, call upon arrival, landmark…"
                      rows={2}
                      className="agua-input resize-none"
                    />
                  </div>
                </>
              )}

              {isWalkin && (
                <div className="overflow-hidden rounded-[22px] border border-blue-100 bg-gradient-to-br from-blue-50 to-white">
                  <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500 text-white shadow-md shadow-blue-500/25">
                      <Store size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-ink">Pickup at AguaDoc Station</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted">
                        Serving Lapu-Lapu City. Pay on arrival — no online payment needed for walk-in orders.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                          <Clock size={11} /> Same-day pickup
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                          <Banknote size={11} /> Pay at counter
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="lg:hidden">
                <OrderSummaryPanel {...summaryProps} compact />
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
            <div key="step-3" className="agua-fade-up space-y-5">
              <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 p-4 sm:p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Truck size={16} className="text-blue-600" />
                  <p className="text-sm font-bold text-ink">Delivery overview</p>
                </div>
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted">Address</span>
                    <span className="max-w-[65%] text-right font-medium text-ink">{address || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Map pin</span>
                    <span className="font-mono text-xs text-muted">
                      {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted">Item</span>
                    <span className="max-w-[65%] text-right text-xs font-medium text-ink">{product.label}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted">Quantity</span>
                    <span className="font-medium text-ink">{quantity}</span>
                  </div>
                  {notes.trim() && (
                    <div className="flex justify-between gap-3">
                      <span className="text-muted">Notes</span>
                      <span className="max-w-[65%] text-right text-ink">{notes}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:hidden">
                <OrderSummaryPanel {...summaryProps} compact />
              </div>

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
                    className={`relative rounded-[22px] border-2 p-4 text-left transition ${
                      payMode === 'online'
                        ? 'border-blue-500 bg-blue-50/80 shadow-sm shadow-blue-500/10'
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
                    className={`relative rounded-[22px] border-2 p-4 text-left transition ${
                      payMode === 'cod'
                        ? 'border-blue-500 bg-blue-50/80 shadow-sm shadow-blue-500/10'
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
                        You’ll open a Xendit page to pay with GCash or Maya. The order confirms only after payment succeeds.
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
                    {loading ? 'Redirecting…' : `Pay ${formatMoney(total)}`}
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

        <div className="hidden lg:block">
          <OrderSummaryPanel {...summaryProps} />
        </div>
      </div>

      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
    </div>
  );
}
