// src/components/TermsContent.jsx
// Credit (utang) Terms & Agreement — ONE source of truth, used by:
//   • RegisterPage            → must be opened and ticked before an account can be created
//   • Customer portal         → the ⓘ reminder, plus a one-time gate for accounts made before this existed
//   • CustomersPage (admin)   → the printable paper agreement walk-in customers sign
//
// NOTE: this is a plain-language template, not legal advice. Edit TERMS_CONFIG to match how your
// station really handles credit, and have your adviser (or a legal reviewer) check the final wording.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from './ui/Modal';

export const TERMS_VERSION = '1.0'; // bump this if you change the wording in a meaningful way

export const TERMS_CONFIG = {
  storeName: 'AguaDoc Water Refilling Station',
  pricePerGallon: 40,
  dueDays: 7,      // how many days a customer has to pay after taking water on credit
  lateFee: null,   // e.g. 'A late fee of ₱20 may be added for every week past the due date.'  (null = no fee)
};

export function getTermsSections() {
  const { storeName, pricePerGallon, dueDays, lateFee } = TERMS_CONFIG;
  return [
    {
      title: 'Credit is a favor, not a right',
      body: `Taking water on credit ("utang") means you receive water now and pay later. ${storeName} allows this at its own discretion and may refuse or stop credit for any customer at any time.`,
    },
    {
      title: 'What you owe',
      body: `The amount you owe is the number of gallons you take multiplied by ₱${pricePerGallon} per gallon, plus the delivery fee if the order is delivered. Every credit is recorded in AguaDoc, and you may ask the staff for your current balance at any time.`,
    },
    {
      title: 'When you must pay',
      body: `You agree to pay the full balance within ${dueDays} days from the date you take the water, in cash or through GCash/Maya.`,
    },
    {
      title: 'Late payment',
      body: lateFee || 'No interest or penalty is charged unless the station tells you in writing beforehand.',
    },
    {
      title: 'Our records are proof',
      body: 'You agree that AguaDoc\'s order, payment, and balance records are valid proof of what you owe, unless you can show proof of payment (such as a receipt or a GCash/Maya reference number).',
    },
    {
      title: 'Reminders',
      body: 'You agree to receive reminders about your balance by SMS, phone call, or in-app notification, using the contact details you gave us.',
    },
    {
      title: 'If a balance is not paid',
      body: 'If a balance stays unpaid after the due date, the station may stop giving you credit, ask for advance payment or cash on delivery on your next orders, and take lawful steps to collect, including asking the barangay to help settle the matter.',
    },
    {
      title: 'Your information',
      body: 'You confirm that your name, contact number, and address are true and correct. Your information is used only for orders, deliveries, and balance collection, and is handled in line with the Data Privacy Act of 2012.',
    },
    {
      title: 'Your agreement',
      body: 'By ticking the box or signing below, you confirm that you have read, understood, and agree to these terms.',
    },
  ];
}

// ── The terms text itself ──
export function TermsContent() {
  return (
    <ol className="space-y-3 text-[13px] text-gray-600 leading-relaxed">
      {getTermsSections().map((s, i) => (
        <li key={i}>
          <p className="font-semibold text-[#0f172a]">{i + 1}. {s.title}</p>
          <p>{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

// ── Popup version: used by the register page and the ⓘ reminder buttons ──
// Pass onAccept to show a second button (e.g. "I have read this" on the register page).
export function TermsModal({ onClose, onAccept, acceptLabel = 'I have read this' }) {
  return (
    <Modal title="Terms & Agreement — Credit (Utang)" onClose={onClose}>
      <div className="max-h-[55vh] overflow-y-auto pr-1">
        <TermsContent />
      </div>
      <p className="text-[11px] text-gray-400 mt-3">Version {TERMS_VERSION}</p>
      <div className="flex justify-end gap-2 mt-4">
        <button
          onClick={onClose}
          className="px-4 py-2 border border-gray-200 rounded-lg text-[12.5px] font-semibold hover:bg-gray-50"
        >
          Close
        </button>
        {onAccept && (
          <button
            onClick={onAccept}
            className="px-4 py-2 bg-[#0ea5c9] hover:bg-[#0284a8] text-white rounded-lg text-[12.5px] font-semibold"
          >
            {acceptLabel}
          </button>
        )}
      </div>
    </Modal>
  );
}

// ── Full-screen gate for existing accounts that never accepted the terms ──
export function TermsGate({ onAccept, onDecline, loading }) {
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-md" aria-hidden="true" />
      <div className="relative z-[1] flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-[0_24px_64px_rgba(15,23,42,0.28)]">
        <div className="border-b border-gray-100 p-5">
          <h2 className="text-base font-bold text-[#0f172a]">Terms & Agreement — Credit (Utang)</h2>
          <p className="mt-1 text-xs text-gray-400">
            Please read this before continuing. It explains what happens when you take water on credit.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <TermsContent />
        </div>
        <div className="space-y-3 border-t border-gray-100 p-5">
          <label className="flex cursor-pointer items-start gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 accent-[#0ea5c9]"
            />
            <span>I have read and agree to these terms, including paying any balance I take on credit.</span>
          </label>
          <div className="flex items-center justify-between">
            <button type="button" onClick={onDecline} className="text-xs text-gray-400 hover:text-red-500">
              Sign out instead
            </button>
            <button
              type="button"
              onClick={onAccept}
              disabled={!agreed || loading}
              className="rounded-xl bg-[#0ea5c9] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0284a8] disabled:opacity-40"
            >
              {loading ? 'Saving...' : 'Accept & Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Paper agreement for walk-in customers: opens a print-ready page with signature lines ──
export function printAgreement(customer) {
  const w = window.open('', '_blank', 'width=820,height=900');
  if (!w) {
    alert('Please allow pop-ups for this site so the agreement can open for printing.');
    return;
  }
  const esc = (s = '') =>
    String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const balance = Number(customer.balance) || 0;
  const amountLine = balance > 0
    ? `₱${balance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${esc(customer.orders ?? 0)} gallon/s)`
    : '₱ ____________  (to be filled in when credit is given)';
  const sections = getTermsSections()
    .map((s, i) => `<h3>${i + 1}. ${esc(s.title)}</h3><p>${esc(s.body)}</p>`)
    .join('');

  w.document.write(`<!doctype html>
<html><head><meta charset="utf-8" />
<title>Credit Agreement — ${esc(customer.fullName)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 36px 48px; font-size: 13px; line-height: 1.5; }
  h1 { font-size: 20px; margin: 0; text-align: center; }
  h2 { font-size: 15px; margin: 4px 0 18px; text-align: center; font-weight: normal; letter-spacing: .5px; }
  h3 { font-size: 13px; margin: 12px 0 2px; }
  p  { margin: 0; }
  table.info { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  table.info td { padding: 5px 8px; border: 1px solid #bbb; vertical-align: top; }
  table.info td:first-child { width: 150px; background: #f3f3f3; font-weight: bold; }
  .ack { margin-top: 18px; font-weight: bold; }
  .sign { display: flex; gap: 40px; margin-top: 46px; }
  .sign div { flex: 1; border-top: 1px solid #111; padding-top: 4px; text-align: center; font-size: 12px; }
  @media print { body { margin: 18mm; } }
</style></head>
<body>
  <h1>${esc(TERMS_CONFIG.storeName)}</h1>
  <h2>CREDIT (UTANG) AGREEMENT</h2>
  <table class="info">
    <tr><td>Customer name</td><td>${esc(customer.fullName)}</td></tr>
    <tr><td>Contact number</td><td>${esc(customer.phone)}</td></tr>
    <tr><td>Address</td><td>${esc(customer.address)}</td></tr>
    <tr><td>Date</td><td>${esc(today)}</td></tr>
    <tr><td>Amount on credit</td><td>${amountLine}</td></tr>
    <tr><td>Payment due</td><td>Within ${TERMS_CONFIG.dueDays} days from the date credit is given</td></tr>
  </table>
  ${sections}
  <p class="ack">I, ${esc(customer.fullName)}, have read, understood, and agree to the terms above.</p>
  <div class="sign">
    <div>Customer's signature over printed name</div>
    <div>Date signed</div>
    <div>Received by (staff)</div>
  </div>
</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
