import React from 'react';
import { ApplianceWarranty } from '../types';

interface FormalNoticeModalProps {
  appliance: ApplianceWarranty | null;
  isOpen: boolean;
  onClose: () => void;
  onDispatch: (itemId: string) => Promise<any>;
}

export const FormalNoticeModal: React.FC<FormalNoticeModalProps> = ({
  appliance,
  isOpen,
  onClose,
  onDispatch,
}) => {
  if (!isOpen || !appliance) return null;

  const [isDispatching, setIsDispatching] = React.useState(false);
  const [dispatched, setDispatched] = React.useState(false);

  const handleSend = async () => {
    setIsDispatching(true);
    try {
      await onDispatch(appliance.id);
      setDispatched(true);
      setTimeout(() => {
        setIsDispatching(false);
        onClose();
      }, 1400);
    } catch {
      setIsDispatching(false);
    }
  };

  const [copied, setCopied] = React.useState(false);

  const getFullNoticeText = () => {
    return `FORMAL STATUTORY NOTICE OF LACK OF CONFORMITY
Pursuant to Directive (EU) 2019/771 & German Civil Code (BGB) § 437

CLAIMANT (CONSUMER):
Elena Weber, Sendlinger Str. 42, 80331 München

SELLER (COMMERCIAL RESPONDENT):
${appliance.seller_name} (${appliance.seller_email})

SUBJECT: Statutory Warranty Reimbursement Claim: ${appliance.brand} ${appliance.name} (Invoice #${appliance.receipt_id})
LEGAL GROUNDS: Directive (EU) 2019/771, Article 10(1) & Article 13; German Civil Code BGB § 437 Nr. 1, § 439
CLAIM SUM: €185.00 EUR (Statutory Repair Cost Recovery)

Dear Customer Relations Team,

I am writing regarding the ${appliance.brand} ${appliance.name} (Model: ${appliance.model}, Serial: ${appliance.serial_number || 'N/A'}), purchased from your store on ${appliance.purchase_date} under Invoice #${appliance.receipt_id} for €${appliance.price_eur.toFixed(2)}.

The appliance suffered a mechanical failure: "${appliance.defect_description || 'Bearing failure under ordinary domestic operation'}". When reported, store staff stated that the 1-year commercial guarantee had lapsed.

STATUTORY NOTICE: Commercial seller guarantees cannot restrict or waive statutory conformity rights. Under Directive (EU) 2019/771 Article 10(1) and BGB § 438 Abs. 1 Nr. 3, the seller is strictly liable for lack of conformity for a period of 24 months from delivery. The defect occurred within month 22.

Pursuant to Article 13 of Directive 2019/771/EU and BGB § 439 Abs. 2, all costs incurred in bringing the goods into conformity, including diagnostic charges and labor, must be borne free of charge by the seller.

Enclosed is the repair receipt of €185.00 paid under protest to restore basic domestic function. I formally request reimbursement of €185.00 EUR to my IBAN within 14 calendar days.

Sincerely,
Elena Weber`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getFullNoticeText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const element = document.createElement('a');
    const file = new Blob([getFullNoticeText()], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `Hestia-Statutory-Notice-${appliance.brand}-${appliance.receipt_id}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="max-w-2xl w-full bg-[#0d121c] border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Formal Statutory Notice of Lack of Conformity
              </h3>
              <p className="text-[11px] font-mono text-slate-400">
                Muster-Mängelanzeige gem. Richtlinie (EU) 2019/771 & BGB § 437
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="text-slate-400 hover:text-amber-300 p-1.5 rounded-lg hover:bg-white/5 cursor-pointer text-xs flex items-center gap-1 border border-white/10"
              title="Copy to clipboard"
            >
              {copied ? (
                <>
                  <svg className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span className="text-emerald-400 font-sans text-[11px]">Copied!</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span className="font-sans text-[11px]">Copy Text</span>
                </>
              )}
            </button>
            <button
              onClick={handleDownload}
              className="text-slate-400 hover:text-amber-300 p-1.5 rounded-lg hover:bg-white/5 cursor-pointer text-xs flex items-center gap-1 border border-white/10"
              title="Download notice as text"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span className="font-sans text-[11px]">Export .txt</span>
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 cursor-pointer text-lg leading-none ml-2"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Realistic Legal Letter Document Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs font-mono text-slate-300 leading-relaxed bg-[#080b10]">
          {/* Metadata Card */}
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-white/10 grid grid-cols-2 gap-3 text-[11px]">
            <div>
              <span className="text-slate-500 uppercase text-[10px] block">Claimant (Consumer)</span>
              <span className="font-semibold text-slate-200">Elena Weber</span>
              <div className="text-slate-400 text-[10px]">Sendlinger Str. 42, 80331 München</div>
            </div>
            <div>
              <span className="text-slate-500 uppercase text-[10px] block">Seller (Commercial Respondent)</span>
              <span className="font-semibold text-slate-200">{appliance.seller_name}</span>
              <div className="text-slate-400 text-[10px]">{appliance.seller_email}</div>
            </div>
          </div>

          <div className="border-t border-b border-white/10 py-2.5 text-slate-300">
            <div><strong>SUBJECT:</strong> Statutory Warranty Reimbursement Claim: {appliance.brand} {appliance.name} (Invoice #{appliance.receipt_id})</div>
            <div><strong>LEGAL GROUNDS:</strong> Directive (EU) 2019/771, Article 10(1) & Article 13; German Civil Code BGB § 437 Nr. 1, § 439</div>
            <div><strong>CLAIM SUM:</strong> €185.00 EUR (Statutory Repair Cost Recovery)</div>
          </div>

          <div className="space-y-2 text-slate-300">
            <p>Dear Customer Relations Team,</p>
            <p>
              I am writing regarding the <strong>{appliance.brand} {appliance.name}</strong> (Model: {appliance.model}, Serial: {appliance.serial_number}), purchased from your store on <strong>{appliance.purchase_date}</strong> under Invoice #{appliance.receipt_id} for €{appliance.price_eur.toFixed(2)}.
            </p>
            <p>
              The appliance suffered a mechanical failure: <em>"{appliance.defect_description || 'Bearing failure under ordinary domestic operation'}"</em>. When reported, store staff stated that the 1-year commercial guarantee had lapsed.
            </p>
            <p className="bg-amber-500/10 p-2.5 rounded border border-amber-500/20 text-amber-200">
              <strong>STATUTORY NOTICE:</strong> Commercial seller guarantees cannot restrict or waive statutory conformity rights. Under <strong>Directive (EU) 2019/771 Article 10(1)</strong> and <strong>BGB § 438 Abs. 1 Nr. 3</strong>, the seller is strictly liable for lack of conformity for a period of <strong>24 months from delivery</strong>. The defect occurred within month 22.
            </p>
            <p>
              Pursuant to <strong>Article 13 of Directive 2019/771/EU</strong> and <strong>BGB § 439 Abs. 2</strong>, all costs incurred in bringing the goods into conformity, including diagnostic charges and labor, must be borne free of charge by the seller.
            </p>
            <p>
              Enclosed is the repair receipt of €185.00 paid under protest to restore basic domestic function. I formally request reimbursement of <strong>€185.00 EUR</strong> to my IBAN within 14 calendar days.
            </p>
          </div>

          {/* Statutory Self-Help Disclaimer */}
          <div className="p-2.5 rounded-lg bg-slate-950 border border-white/5 text-[10px] text-slate-400">
            <strong>EU Self-Help Standardization Disclaimer:</strong> Notice generated as standardized legal formatting pursuant to Directive 2019/771/EU Article 10. Claimant maintains sole discretion, approval, and agency over dispatch.
          </div>

          <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-500">
            <span>Cryptographic Dispute Hash: <strong className="text-slate-400 font-mono">e3b0c442...8819</strong></span>
            <span>Return-of-Control Certified</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-900 border-t border-white/10 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
          >
            Cancel / Edit Later
          </button>

          <button
            onClick={handleSend}
            disabled={isDispatching || dispatched}
            className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-all"
          >
            {dispatched ? (
              <>
                <svg className="w-4 h-4 text-emerald-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Notice Dispatched & Logged!</span>
              </>
            ) : isDispatching ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Sealing & Dispatching via Lambda...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                <span>1-Click Authorize & Dispatch Notice</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

