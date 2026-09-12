import React, { useRef, useState } from 'react';
import { errorMessage } from '../api';
import type { IntakeDraft, IntakeRecord, IntakeRoute } from '../api';

export interface IntakePanelProps {
  route: IntakeRoute; enabled: boolean; stateVersion: number; drafts: IntakeDraft[];
  initialRecords?: IntakeRecord[];
  onIntake: (route: IntakeRoute, body: Record<string, unknown>) => Promise<IntakeDraft>;
}
const example: IntakeRecord[] = [{ kind: 'transaction', transaction_id: 'manual-tx-1', merchant: 'Your merchant', amount_cents: 5000, date: '2026-09-12', category: 'Home' }];
const encode = (rows: IntakeRecord[]) => JSON.stringify(rows, null, 2);

export const IntakePanel: React.FC<IntakePanelProps> = ({ route, enabled, stateVersion, drafts, initialRecords, onIntake }) => {
  const saved = drafts.filter(d => d.route === route);
  const [id, setId] = useState('');
  const [text, setText] = useState(() => encode(initialRecords ?? example));
  const [reviewedText, setReviewedText] = useState('');
  const [consent, setConsent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const draft = saved.find(d => d.id === id);
  const review = draft?.review;
  const signature = `${id}|${review?.digest}|${stateVersion}|${text}`;
  const currentReview = !!review && reviewedText === text && review.source_version === stateVersion;
  const run = async (input: Record<string, unknown> | (() => Promise<Record<string, unknown>>)) => {
    if (!enabled || lock.current) return;
    lock.current = true; setPending(true); setError(null); setConsent('');
    try {
      const body = typeof input === 'function' ? await input() : input;
      const result = await onIntake(route, body);
      setId(result.id);
      if (body.operation === 'stage') {
        const next = encode(result.review?.corrected_records ?? (result.records.length ? result.records : initialRecords ?? example));
        setText(next); setReviewedText(result.review ? next : '');
      } else if (body.operation === 'review') setReviewedText(text);
    } catch (e) { setError(errorMessage(e)); }
    finally { lock.current = false; setPending(false); }
  };
  const manual = () => {
    try { void run({ operation: id ? 'review' : 'stage', ...(id ? { intake_id: id } : {}), records: JSON.parse(text) }); }
    catch { setError('Enter a JSON array of records, using integer cents.'); }
  };
  const upload = async (file?: File) => {
    setConsent(''); setReviewedText('');
    if (!file) return;
    if (!enabled || lock.current) return;
    if (file.size < 1 || file.size > 16000) { setError('Use a document from 1 to 16000 bytes, or enter facts manually.'); return; }
    const mime = file.type || (file.name.toLowerCase().endsWith('.json') ? 'application/json' : '');
    if (!['image/png', 'application/json'].includes(mime)) { setError('Only simple PNG and JSON are supported. OCR is unavailable.'); return; }
    await run(async () => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return { operation: 'stage', mime_type: mime, document_base64: btoa(String.fromCharCode(...bytes)) };
    });
  };
  const resume = (value: string) => {
    setId(value); setConsent(''); setError(null);
    const stored = saved.find(d => d.id === value);
    const next = encode(stored?.review?.corrected_records ?? (stored?.records.length ? stored.records : initialRecords ?? example));
    setText(next); setReviewedText(stored?.review ? next : '');
  };
  return <section aria-label="Manual document import" className="space-y-3 border-t border-white/20 pt-4 text-xs text-slate-200">
    <h4 className="font-bold text-white">Import documents with manual review</h4>
    <p>OCR is unavailable. Simple PNG (8-bit, no interlacing or metadata chunks, up to 1 million pixels) and JSON are validated up to 16000 bytes. Keep your original document open to transcribe its facts. Only its SHA-256 and reviewed facts are saved; the file is not retained. Records stay in this isolated synthetic session.</p>
    <label className="block">Document bytes (PNG or JSON)
      <input data-testid="intake-file" type="file" accept="image/png,application/json,.json" disabled={!enabled || pending} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} className="block w-full py-2" />
    </label>
    <label className="block">Saved intake / resume after reload
      <select data-testid="intake-history" className="block w-full bg-slate-900 p-2" value={id} disabled={!enabled || pending} onChange={e => resume(e.target.value)}>
        <option value="">New manual entry</option>
        {saved.map(d => <option key={d.id} value={d.id}>{d.status} · {d.input_sha256.slice(0, 12)} · {d.source}</option>)}
      </select>
    </label>
    {draft && <p data-testid="intake-provenance" className="break-all">Source: {draft.source} · {draft.byte_count} bytes · SHA-256 {draft.input_sha256}. OCR unavailable; no confidence score.</p>}
    <details><summary>Record formats</summary>
      <p>Use an array for manual entry. A JSON file must contain an object with a records array. Corrections are reviewed before saving. Supported kinds: transaction, receipt, subscription. IDs must be stable, unique identifiers; matching never guesses by merchant.</p>
      <pre className="whitespace-pre-wrap break-all">{'{"records":[{"kind":"receipt","transaction_id":"out-001","merchant":"Leroy Merlin DIY","amount_cents":8550,"date":"2026-09-04","receipt_id":"MY-RECEIPT"}]}'}</pre>
      <pre className="whitespace-pre-wrap break-all">{'{"kind":"subscription","subscription_id":"my-sub","service_name":"Service","category":"Productivity","monthly_cents":999,"last_billed":"2026-09-12","is_trial":false}'}</pre>
    </details>
    <label className="block">Reviewed records (JSON array; amount_cents uses integer cents)
      <textarea data-testid="intake-records" value={text} rows={9} maxLength={16000} disabled={!enabled || pending || draft?.status === 'committed'} onChange={e => { setText(e.target.value); setConsent(''); }} className="block w-full bg-slate-900 rounded p-2 font-mono" />
    </label>
    {draft?.status !== 'committed' && <button data-testid="intake-review" disabled={!enabled || pending} onClick={manual} className="bg-amber-500 text-slate-950 rounded px-3 py-2 disabled:opacity-50">{id ? 'Review exact changes' : 'Stage manual facts'}</button>}
    {review && <div data-testid="intake-changes" className="space-y-2">
      <p>Original input facts and your corrections are retained with this review. Review version {review.source_version}.</p>
      <details><summary>Original facts</summary><pre className="whitespace-pre-wrap break-all">{encode(review.original_records)}</pre></details>
      {review.changes.map(c => <div key={c.index} className="border border-white/20 rounded p-2">
        <p>Row {c.index + 1}: {c.status} {c.record_id ?? ''} {c.message ?? ''}</p>
        {c.status !== 'error' && <><p>Before</p><pre className="whitespace-pre-wrap break-all">{JSON.stringify(c.before, null, 2)}</pre><p>After</p><pre className="whitespace-pre-wrap break-all">{JSON.stringify(c.after, null, 2)}</pre></>}
      </div>)}
      {draft?.status !== 'committed' && <>
        {!currentReview && <p role="status">Facts or workspace version changed. Review again before confirming.</p>}
        <label className="flex gap-2"><input data-testid="intake-consent" type="checkbox" checked={consent === signature && currentReview} disabled={!enabled || pending || !currentReview} onChange={e => setConsent(e.target.checked ? signature : '')} />I confirm these exact changes: {review.changes.filter(c => c.status === 'ready').length} to import, {review.changes.filter(c => c.status === 'duplicate').length} unchanged duplicates, {review.changes.filter(c => c.status === 'error').length} errors excluded. These are user-reviewed synthetic records, not verified OCR.</label>
        <button data-testid="intake-commit" className="bg-emerald-500 text-slate-950 rounded px-3 py-2 disabled:opacity-50" disabled={!enabled || pending || !currentReview || consent !== signature || !review.changes.some(c => c.status !== 'error')} onClick={() => { void run({ operation: 'commit', intake_id: id, digest: review.digest, confirmed: true }); }}>Confirm reviewed import</button>
      </>}
    </div>}
    {draft?.status === 'committed' && <p role="status" data-testid="intake-result">Saved: {draft.result?.ready} changes, {draft.result?.duplicate} duplicates unchanged, {draft.result?.error} rows excluded. No account connected, no OCR verification, no appliance or claim created.</p>}
    {error && <p role="alert" className="text-rose-300">{error}</p>}
    {!enabled && !pending && <p>Begin or recover your isolated session to import.</p>}
  </section>;
};
