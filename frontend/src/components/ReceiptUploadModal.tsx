import React, { useState } from 'react';
import { ApplianceWarranty } from '../types';

interface ReceiptUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReceiptMatched: (matchedOutflowId: string, recoveredAsset: ApplianceWarranty) => void;
}

export const ReceiptUploadModal: React.FC<ReceiptUploadModalProps> = ({
  isOpen,
  onClose,
  onReceiptMatched,
}) => {
  if (!isOpen) return null;

  const [step, setStep] = useState<'select' | 'analyzing' | 'extracted' | 'confirmed'>('select');

  const handleSimulateUpload = () => {
    setStep('analyzing');
    setTimeout(() => {
      setStep('extracted');
    }, 1200);
  };

  const handleConfirmAndLink = () => {
    const newAsset: ApplianceWarranty = {
      id: 'app-004',
      name: 'IKEA BILLY Modular Desk & Bookcase Unit',
      brand: 'IKEA',
      model: 'BILLY-2026-MOD',
      serial_number: 'IKE-ECH-9941',
      purchase_date: '2026-09-09',
      legal_statutory_months: 24,
      statutory_warranty_months: 24,
      commercial_warranty_months: 24,
      seller_name: 'IKEA Deutschland GmbH & Co. KG',
      seller_email: 'kontakt@ikea.de',
      receipt_id: 'IKE-REC-88412',
      price_eur: 85.00,
      status: 'active',
      statutory_basis: 'Directive (EU) 2019/771, Article 10(1) & BGB § 437',
    };

    onReceiptMatched('tx-001', newAsset);
    setStep('confirmed');
    setTimeout(() => {
      onClose();
      setStep('select');
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="max-w-xl w-full bg-[#0d121c] border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Receipt Anti-Join & Proof Vault
              </h3>
              <p className="text-[11px] font-mono text-slate-400">
                Resolve Missing Receipt for &gt;€50 Outlay
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 cursor-pointer text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Target Outflow Card */}
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-300 font-bold">
                TARGET BANK OUTLAY (ANTI-JOIN DETECTED)
              </span>
              <div className="text-sm font-bold text-white mt-0.5">IKEA Eching München</div>
              <div className="text-xs text-slate-300 font-mono">09 Sep 2026 &bull; Debit Card ending ••4892</div>
            </div>
            <div className="text-right">
              <span className="text-base font-bold text-white font-mono">€85.00</span>
              <div className="text-[10px] text-rose-400 font-mono">Unbacked by Receipt</div>
            </div>
          </div>

          {step === 'select' && (
            <div className="space-y-4">
              <div
                onClick={handleSimulateUpload}
                className="border-2 border-dashed border-white/20 hover:border-amber-400/60 rounded-xl p-6 text-center cursor-pointer transition-all bg-slate-900/40 hover:bg-slate-900/80"
              >
                <div className="w-12 h-12 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-slate-300 mx-auto mb-2">
                  <svg className="w-6 h-6 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
                <div className="text-sm font-semibold text-slate-200">
                  Click to simulate uploading IKEA Receipt Photo
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Sample: "IKEA Deutschland - Kassenbon #88412 (€85.00)"
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/70 border border-white/5 text-xs text-slate-300 space-y-1">
                <div className="font-semibold text-slate-200">Why proof matters:</div>
                <p className="text-slate-400 leading-relaxed">
                  Under German BGB § 437 and EU consumer rules, statutory warranty claims require proof of purchase. Thermal receipts fade within 6 months. Hestia permanently archives proof on encrypted AWS S3.
                </p>
              </div>
            </div>
          )}

          {step === 'analyzing' && (
            <div className="py-10 text-center space-y-3">
              <div className="w-10 h-10 border-3 border-amber-400/30 border-t-amber-400 rounded-full animate-spin mx-auto"></div>
              <div className="text-sm font-bold text-white">Amazon Bedrock Multimodal OCR Analyzing...</div>
              <div className="text-xs font-mono text-slate-400">
                Parsing merchant, line items, 19% MwSt, and matching transaction TX-001
              </div>
            </div>
          )}

          {step === 'extracted' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-900 border border-emerald-500/30 space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <span className="text-emerald-400 font-bold uppercase text-[10px]">
                    OCR EXTRACTION SUCCESS (100% CONFIDENCE)
                  </span>
                  <span className="text-[10px] text-slate-400">Bedrock Haiku Model</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                  <div><strong>Merchant:</strong> IKEA Deutschland GmbH</div>
                  <div><strong>Invoice Date:</strong> 2026-09-09</div>
                  <div><strong>Item:</strong> BILLY Bookcase / Desk Unit</div>
                  <div><strong>Total Matched:</strong> €85.00 EUR (incl. MwSt)</div>
                </div>
                <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px]">
                  &bull; Matched against Bank Outlay TX-001 (€85.00) &bull; Eligible for 24-Month Statutory Horizon
                </div>
              </div>

              <button
                onClick={handleConfirmAndLink}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Link Receipt & Convert to Protected Household Asset</span>
              </button>
            </div>
          )}

          {step === 'confirmed' && (
            <div className="py-8 text-center space-y-2 text-emerald-400">
              <svg className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <div className="text-base font-bold text-white">Receipt Successfully Vaulted!</div>
              <div className="text-xs text-slate-300">
                Asset added to inventory. €85.00 added to Protected Household Assets.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
