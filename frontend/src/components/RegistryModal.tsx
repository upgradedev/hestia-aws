import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api';
import type { BackendAppliance, ExtractHint, IntakeDraft, IntakeRecord } from '../api';
import { IntakePanel } from './IntakePanel';
import type { IntakePanelProps } from './IntakePanel';

export type RegistryTab = 'appliance' | 'repair' | 'paste' | 'file';
export interface RegistryMode { tab: RegistryTab; applianceId?: string; editId?: string }
interface RegistryModalProps {
  isOpen: boolean; mode: RegistryMode; onClose: () => void; appliances: BackendAppliance[]; extractsUsed: number;
  intake: Omit<IntakePanelProps, 'route' | 'initialRecords' | 'initialDraftId' | 'kinds' | 'allowFile' | 'applianceOptions' | 'heading' | 'intro'>;
  onExtract: (text: string, hint: ExtractHint) => Promise<IntakeDraft>;
}
const TABS: ReadonlyArray<readonly [RegistryTab, string]> = [
  ['appliance', 'Add an appliance'], ['repair', 'Report a repair'], ['paste', 'Paste a receipt or order email'], ['file', 'File or JSON'],
];
const ACTIVE_CLAIM = new Set(['open', 'draft', 'review', 'authorized', 'pending_response', 'needs_information']);

function applianceRecord(a: BackendAppliance): IntakeRecord {
  return {
    kind: 'appliance', appliance_id: a.id, item_name: a.item_name, purchase_date: a.purchase_date, seller_name: a.seller_name,
    seller_email: a.seller_email, receipt_reference: a.receipt_reference ?? '', statutory_months: a.statutory_months,
    commercial_months: a.commercial_months, ...(a.brand ? { brand: a.brand } : {}), ...(a.model_number ? { model_number: a.model_number } : {}),
    ...(a.serial_number ? { serial_number: a.serial_number } : {}), ...(a.purchase_price_cents ? { purchase_price_cents: a.purchase_price_cents } : {}),
    ...(a.product_url ? { product_url: a.product_url } : {}), ...(a.manual_url ? { manual_url: a.manual_url } : {}),
    ...(a.quickstart_url ? { quickstart_url: a.quickstart_url } : {}),
  };
}

export function RegistryModal({ isOpen, mode, onClose, appliances, extractsUsed, intake, onExtract }: RegistryModalProps) {
  const [tab, setTab] = useState<RegistryTab>(mode.tab);
  const [text, setText] = useState('');
  const [hint, setHint] = useState<ExtractHint>('order');
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [model, setModel] = useState<{ live: boolean; cap: number | null } | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    if (!isOpen || tab !== 'paste' || model) return;
    let current = true;
    api.health().then(h => { if (current) setModel({ live: h.live_model, cap: h.agent.extract_session_cap }); })
      .catch(() => { if (current) setModel({ live: false, cap: null }); });
    return () => { current = false; };
  }, [isOpen, tab, model]);
  if (!isOpen) return null;
  const repairable = appliances.filter(a => !a.has_repair_claim || !ACTIVE_CLAIM.has(a.claim_status)).map(a => ({ id: a.id, name: a.item_name }));
  const editing = mode.editId ? appliances.find(a => a.id === mode.editId) : undefined;
  const remaining = model?.cap == null ? null : Math.max(0, model.cap - extractsUsed);
  const read = async () => {
    if (lock.current || !intake.enabled || !text.trim()) return;
    lock.current = true; setReading(true); setReadError(null);
    try {
      const draft = await onExtract(text, hint);
      setDraftId(draft.id);
    } catch (error) { setReadError(errorMessage(error)); }
    finally { lock.current = false; setReading(false); }
  };
  return (
    <div className="modal-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="registry-title" className="modal max-w-2xl">
        <div className="modal-head">
          <div>
            <h3 id="registry-title" className="font-bold">Add to your household records</h3>
            <p className="text-xs muted">Public demo: use only fictional, non-sensitive appliances, repairs and receipts. A staged draft is stored before you confirm; only confirmed changes enter the household records.</p>
          </div>
          <button onClick={onClose} aria-label="Close add records" className="btn btn-quiet btn-sm text-lg">&times;</button>
        </div>
        <div className="modal-body space-y-4 text-sm">
          <div role="tablist" aria-label="What to add" className="flex flex-wrap gap-2">
            {TABS.map(([key, label]) => (
              <button key={key} role="tab" aria-selected={tab === key} data-testid={`registry-tab-${key}`} onClick={() => setTab(key)}
                className={`btn btn-sm ${tab === key ? 'btn-primary' : 'btn-secondary'}`}>{label}</button>
            ))}
          </div>
          {tab === 'appliance' && <IntakePanel key={'appliance-' + (mode.editId ?? 'new')} {...intake} route="/api/ingest/sync" kinds={['appliance']} allowFile={false}
            initialRecords={editing ? [applianceRecord(editing)] : undefined}
            heading={editing ? `Correct the details of ${editing.item_name}` : 'Add an appliance you own'}
            intro="Type the facts from the receipt or the order email: what it is, when and where you bought it, and the guarantee. Add the product page, manual and quick start links if you have them, so you never need the paper manual again." />}
          {tab === 'repair' && <IntakePanel key={'repair-' + (mode.applianceId ?? 'any')} {...intake} route="/api/ingest/sync" kinds={['repair']} allowFile={false}
            applianceOptions={repairable} initialRecords={[{ kind: 'repair', appliance_id: mode.applianceId ?? repairable[0]?.id ?? '' }]}
            heading="Report what broke" intro="Choose the appliance, enter the repair date and cost from the invoice, and describe the fault. Hestia then puts it in your decision queue, checks the recorded facts, and prepares the exact notice for you to approve." />}
          {tab === 'paste' && <section aria-label="Paste a receipt or order email" className="space-y-3 border-t border-[var(--line)] pt-4">
            <h4 className="font-bold">Paste the text of a receipt, order confirmation or statement line</h4>
            <p className="muted">The pasted text is sent to Hestia's model on Amazon Bedrock. Hestia stores its hash, model metadata and proposed facts as a draft, but not the raw text. You correct the draft, and only confirmed changes enter the household records.</p>
            <p className="text-xs faint">Paid with cash and no email? Use <button type="button" className="underline" onClick={() => setTab('appliance')}>Add an appliance</button> and type the facts from the paper receipt. Photo scanning (OCR) is not part of this demo.</p>
            {model && !model.live && <p role="status" className="note-alert" data-testid="paste-unavailable">The model is not configured in this environment, so pasted text cannot be read here. Enter the facts manually instead.</p>}
            {model?.live && remaining !== null && <p className="text-xs muted" data-testid="paste-budget">{remaining} of {model.cap} text readings left in this private copy. Model: bounded Claude Haiku 4.5 on Amazon Bedrock through the Strands Agents SDK.</p>}
            <label className="block font-medium">What is it?
              <select data-testid="paste-hint" className="field" value={hint} disabled={reading} onChange={e => setHint(e.target.value as ExtractHint)}>
                <option value="order">Order confirmation email</option><option value="receipt">Receipt</option><option value="statement">Bank or card statement lines</option><option value="auto">Not sure</option>
              </select>
            </label>
            <label className="block font-medium">Pasted text
              <textarea data-testid="paste-text" className="field text-xs" rows={8} maxLength={6000} value={text} disabled={reading || !intake.enabled} onChange={e => { setText(e.target.value); setDraftId(null); setReadError(null); }}
                placeholder={'Order 4711 confirmed\nLiebherr CNsdd 5223 fridge freezer, EUR 899.00\nDelivered 2 November 2025\nSeller: Local Store, service@localstore.example'} />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button data-testid="paste-read" className="btn btn-primary btn-sm" disabled={reading || !intake.enabled || !text.trim() || (model !== null && !model.live)} onClick={() => { void read(); }}>{reading ? 'Hestia is reading the text…' : 'Ask Hestia to read it'}</button>
              <span className="faint text-xs">{text.length} / 6000 characters</span>
            </div>
            {!intake.enabled && <p className="note">Start or refresh your private copy to paste text.</p>}
            {readError && <p role="alert" className="note-alert" data-testid="paste-error">{readError} You can still <button type="button" className="underline" onClick={() => setTab('appliance')}>enter the facts manually</button>.</p>}
            {draftId && <IntakePanel key={'paste-' + draftId} {...intake} route="/api/ingest/sync" initialDraftId={draftId} kinds={['appliance', 'transaction', 'subscription', 'receipt', 'repair']} allowFile={false}
              applianceOptions={repairable} heading="Check what Hestia read" intro="Every field below was proposed by the model from your text and stored as a staged draft. Correct anything that is wrong or missing, then check and confirm the exact changes that may enter the household records." />}
          </section>}
          {tab === 'file' && <>
            <p role="status" className="note">Mailbox and bank sync are not connected in this demo. Import a bounded JSON file of records, a simple PNG, or enter facts manually below.</p>
            <IntakePanel key="file" {...intake} route="/api/ingest/sync" />
          </>}
        </div>
        <div className="modal-foot">
          <button onClick={onClose} className="btn btn-quiet btn-sm">Close</button>
          <span className="faint text-xs">Review drafts are stored; only confirmed changes enter household records</span>
        </div>
      </div>
    </div>
  );
}
