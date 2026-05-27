'use client';
// ════════════════════════════════════════════════════════════
// src/components/arena/PaymentButton.tsx
// FIXED: QR code now uses qrcode-generator (loaded from CDN)
//        instead of the deprecated Google Charts API.
// ════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import type { User, Contest }          from '@/types/database';

interface PaymentButtonProps {
  contest:   Contest;
  user:      User;
  onSuccess: (txnId: string) => void;
  onError:   (msg: string)   => void;
}

// ── QR Code rendered onto a canvas using qrcode-generator ───
// Loaded once from CDN and cached on window.
declare global {
  interface Window {
    qrcode?: (typeNumber: number, errorCorrectionLevel: string) => {
      addData: (data: string) => void;
      make: () => void;
      createImgTag: (cellSize?: number, margin?: number) => string;
      getModuleCount: () => number;
      isDark: (row: number, col: number) => boolean;
    };
    _qrScriptLoaded?: boolean;
    _qrScriptCallbacks?: Array<() => void>;
  }
}

function loadQrScript(cb: () => void) {
  if (typeof window === 'undefined') return;
  if (window._qrScriptLoaded) { cb(); return; }
  if (!window._qrScriptCallbacks) window._qrScriptCallbacks = [];
  window._qrScriptCallbacks.push(cb);
  if (document.getElementById('qrcode-script')) return; // already loading
  const s = document.createElement('script');
  s.id  = 'qrcode-script';
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  s.onload = () => {
    window._qrScriptLoaded = true;
    window._qrScriptCallbacks?.forEach(fn => fn());
    window._qrScriptCallbacks = [];
  };
  document.head.appendChild(s);
}

function UpiQrCode({ upiUrl, size = 200 }: { upiUrl: string; size?: number }) {
  const divRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [err,   setErr]   = useState(false);

  useEffect(() => {
    if (!upiUrl) return;

    function render() {
      const el = divRef.current;
      if (!el) return;
      el.innerHTML = ''; // clear previous
      try {
        // qrcodejs attaches to window as QRCode constructor
        const QRCode = (window as any).QRCode;
        if (!QRCode) { setErr(true); return; }
        new QRCode(el, {
          text:         upiUrl,
          width:        size,
          height:       size,
          colorDark:    '#000000',
          colorLight:   '#ffffff',
          correctLevel: (QRCode as any).CorrectLevel?.M ?? 0,
        });
        setReady(true);
      } catch {
        setErr(true);
      }
    }

    loadQrScript(render);
  }, [upiUrl, size]);

  if (err) {
    // Fallback: show UPI URL as text the user can copy
    return (
      <div
        style={{ width: size, height: size }}
        className="flex flex-col items-center justify-center bg-white rounded-lg p-3 text-center"
      >
        <span className="text-[10px] text-gray-500 font-mono break-all">{upiUrl}</span>
        <span className="text-[10px] text-gray-400 mt-1">QR unavailable — copy UPI ID below</span>
      </div>
    );
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {!ready && (
        <div
          style={{ width: size, height: size }}
          className="absolute inset-0 bg-white rounded-lg flex items-center justify-center"
        >
          <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {/* qrcodejs renders an <img> or <canvas> into this div */}
      <div ref={divRef} className={ready ? '' : 'opacity-0'} />
    </div>
  );
}

// ── Build UPI deep-link URL ──────────────────────────────────
function buildUpiUrl(upiId: string, amount: number, name: string, note: string) {
  const params = new URLSearchParams({
    pa: upiId,
    pn: name,
    am: String(amount),
    cu: 'INR',
    tn: note,
  });
  return `upi://pay?${params.toString()}`;
}

type Step = 'qr' | 'txn' | 'submitted';

export default function PaymentButton({ contest, user, onSuccess, onError }: PaymentButtonProps) {
  const [step,    setStep]    = useState<Step>('qr');
  const [txnId,   setTxnId]   = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'txn') setTimeout(() => inputRef.current?.focus(), 100);
  }, [step]);

  const upiId  = contest.upi_id?.trim();
  const upiUrl = upiId
    ? buildUpiUrl(upiId, contest.entry_fee, 'BitByBit Arena', `Entry: ${contest.name}`)
    : '';

  async function handleSubmit() {
    const tid = txnId.trim();
    if (!tid) { onError('Please enter your transaction ID'); return; }
    if (tid.length < 6) { onError('Transaction ID seems too short'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/submit-payment', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contestId:   contest.id,
          contestName: contest.name,
          github:      user.github,
          name:        user.name,
          txnId:       tid,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');
      setStep('submitted');
      onSuccess(tid);
    } catch (e: any) {
      onError(e.message || 'Payment submission failed');
    } finally {
      setLoading(false);
    }
  }

  // ── No UPI ID configured ─────────────────────────────────
  if (!upiId) {
    return (
      <div className="w-full py-3 px-4 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-center">
        <p className="text-xs font-mono text-[#666]">⚠ UPI not configured for this contest.<br />Ask the admin to add a UPI ID.</p>
      </div>
    );
  }

  // ── Step 1: QR Code ───────────────────────────────────────
  if (step === 'qr') {
    return (
      <div className="flex flex-col items-center gap-4 p-4 bg-[#0f0f0f] rounded-xl border border-[#1f1f1f]">
        <div className="text-center">
          <p className="text-xs font-mono text-[#666] mb-1">Scan to pay</p>
          <p className="font-mono font-bold text-[#e0e0e0]">₹{contest.entry_fee}</p>
        </div>

        {/* QR Code — rendered client-side via qrcodejs */}
        <div className="bg-white p-3 rounded-xl">
          <UpiQrCode upiUrl={upiUrl} size={180} />
        </div>

        {/* UPI ID text copy */}
        <div className="w-full bg-[#1a1a1a] rounded-lg px-3 py-2 flex items-center justify-between gap-2">
          <span className="text-xs font-mono text-[#888] truncate">{upiId}</span>
          <button
            onClick={() => navigator.clipboard?.writeText(upiId)}
            className="text-[10px] font-mono text-[#00e87a] hover:text-[#00ff88] shrink-0 transition-colors"
          >
            Copy
          </button>
        </div>

        {/* App shortcuts */}
        <a
          href={upiUrl}
          className="w-full text-center text-xs font-mono text-[#a78bfa] hover:text-[#c4b5fd] transition-colors"
        >
          Open in UPI App ↗
        </a>

        <button
          onClick={() => setStep('txn')}
          className="w-full py-2.5 bg-[#00e87a] text-black font-mono font-bold text-sm rounded-lg hover:bg-[#00ff88] transition-all active:scale-[0.98]"
        >
          I've Paid → Enter Transaction ID
        </button>
      </div>
    );
  }

  // ── Step 2: Enter Transaction ID ─────────────────────────
  if (step === 'txn') {
    return (
      <div className="flex flex-col gap-3 p-4 bg-[#0f0f0f] rounded-xl border border-[#1f1f1f]">
        <div>
          <p className="text-xs font-mono text-[#666] mb-1">Enter your UPI transaction ID</p>
          <p className="text-[10px] font-mono text-[#444]">
            Find it in your UPI app under payment history (e.g. 426112345678)
          </p>
        </div>

        <input
          ref={inputRef}
          value={txnId}
          onChange={e => setTxnId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="e.g. 426112345678"
          className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2.5
            text-sm font-mono text-[#e0e0e0] placeholder-[#333]
            focus:outline-none focus:border-[#00e87a40] transition-colors"
        />

        <div className="flex gap-2">
          <button
            onClick={() => setStep('qr')}
            className="flex-1 py-2 bg-[#1a1a1a] text-[#666] font-mono text-sm rounded-lg hover:text-[#e0e0e0] transition-all"
          >
            ← Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !txnId.trim()}
            className={`flex-1 py-2 font-mono font-bold text-sm rounded-lg transition-all
              ${loading || !txnId.trim()
                ? 'bg-[#00e87a40] text-[#00e87a60] cursor-not-allowed'
                : 'bg-[#00e87a] text-black hover:bg-[#00ff88] active:scale-[0.98]'}`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                Submitting…
              </span>
            ) : (
              'Submit for Review →'
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Step 3: Submitted ─────────────────────────────────────
  return (
    <div className="w-full p-4 bg-[#f0b42910] border border-[#f0b42940] rounded-xl text-center">
      <div className="text-2xl mb-2">⏳</div>
      <p className="text-xs font-mono text-[#f0b429] font-bold mb-1">Payment Under Review</p>
      <p className="text-[10px] font-mono text-[#888]">
        Txn: {txnId}
      </p>
      <p className="text-[10px] font-mono text-[#555] mt-1">
        Admin will verify and confirm shortly.
      </p>
    </div>
  );
}