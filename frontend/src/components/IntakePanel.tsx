import { useRef, useState } from 'react';
import { errorMessage } from '../api';
import type { IntakeDraft, IntakeRecord, IntakeRoute } from '../api';

export interface IntakePanelProps {
  route: IntakeRoute; enabled: boolean; stateVersion: number; drafts: IntakeDraft[];
  initialRecords?: IntakeRecord[];
  onIntake: (route: IntakeRoute, body: Record<string, unknown>) => Promise<IntakeDraft>;
}
const encode = (rows: IntakeRecord[]) => JSON.stringify(rows, null, 2);
type EntryKind = 'transaction' | 'receipt' | 'subscription';
interface EntryForm {
  kind: EntryKind; identity: string; receiptId: string; name: string; date: string;
  amount: string; category: string; trial: boolean; trialEnd: string; previousAmount: string;
}
const euros = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) ? `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}` : '';
// Parse decimal digits, never round a floating point amount into a different fact.
function cents(value: string): number | null {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.replace(',', '.').split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount <= 10000000 ? amount : null;
}
function formFrom(row?: IntakeRecord): EntryForm {
  const kind = row?.kind === 'receipt' || row?.kind === 'subscription' ? row.kind : 'transaction';
  const value = (key: string) => typeof row?.[key] === 'string' ? row[key] as string : '';
  return { kind, identity: value(kind === 'subscription' ? 'subscription_id' : 'transaction_id'),
    receiptId: value('receipt_id'), name: value(kind === 'subscription' ? 'service_name' : 'merchant'),
    date: value(kind === 'subscription' ? 'last_billed' : 'date'),
    amount: euros(row?.[kind === 'subscription' ? 'monthly_cents' : 'amount_cents']),
    category: value('category') || (kind === 'subscription' ? 'Productivity' : 'Home'),
    trial: row?.is_trial === true, trialEnd: value('trial_end_date'), previousAmount: euros(row?.previous_monthly_cents) };
}
function recordFrom(form: EntryForm): IntakeRecord {
  if (form.kind === 'subscription') return {
    kind: form.kind, subscription_id: form.identity, service_name: form.name, last_billed: form.date,
    monthly_cents: cents(form.amount), category: form.category, is_trial: form.trial,
    ...(form.trial ? { trial_end_date: form.trialEnd } : {}),
    ...(form.previousAmount ? { previous_monthly_cents: cents(form.previousAmount) } : {}),
  };
  return { kind: form.kind, transaction_id: form.identity, merchant: form.name, date: form.date,
    amount_cents: cents(form.amount), ...(form.kind === 'receipt' ? { receipt_id: form.receiptId } : { category: form.category }) };
}
function formError(form: EntryForm): string | null {
  if (!form.identity.trim() || !form.name.trim() || !form.date || (form.kind === 'receipt' && !form.receiptId.trim())) return 'Fill in the ID, merchant or service, date, and receipt reference if needed.';
  if (!form.amount) return 'Amount is not provided. Enter the documented amount in EUR.';
  if (cents(form.amount) === null) return 'Use an EUR amount with at most two decimal places, up to 100000.00. Amounts are never rounded.';
  if (cents(form.amount) === 0) return 'The entered amount is EUR 0.00. A positive documented amount is required to import.';
  if (form.kind === 'subscription' && form.trial && !form.trialEnd) return 'Enter the trial end date.';
  if (form.kind === 'subscription' && form.previousAmount && (cents(form.previousAmount) ?? 0) <= 0) return 'Previous monthly amount must be positive with at most two decimal places, or left blank if unknown.';
  return null;
}
function singleRecord(rows: IntakeRecord[]): boolean {
  if (rows.length !== 1 || !['transaction', 'receipt', 'subscription'].includes(String(rows[0].kind))) return false;
  const row = rows[0], represented = recordFrom(formFrom(row));
  // Unsupported facts or invalid field types must stay visible in the advanced editor.
  return Object.entries(row).every(([key, value]) => represented[key] === value);
}

export function IntakePanel({ route, enabled, stateVersion, drafts, initialRecords, onIntake }: IntakePanelProps) {
  const saved = drafts.filter(d => d.route === route);
  const startingForm = () => ({ ...formFrom(initialRecords?.[0]), receiptId: '' });
  const [id, setId] = useState('');
  const [form, setForm] = useState<EntryForm>(startingForm);
  const [text, setText] = useState(() => encode([recordFrom(startingForm())]));
  const [advanced, setAdvanced] = useState(false);
  const [reviewedText, setReviewedText] = useState('');
  const [consent, setConsent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const draft = saved.find(d => d.id === id);
  const review = draft?.review;
  const signature = `${id}|${review?.digest}|${stateVersion}|${text}`;
  const currentReview = !!review && reviewedText === text && review.source_version === stateVersion;
  const formDisabled = !enabled || pending || draft?.status === 'committed';
  const transactions = (initialRecords ?? []).filter(row => typeof row.transaction_id === 'string');
  const editForm = (patch: Partial<EntryForm>) => {
    const next = { ...form, ...patch };
    setForm(next); setText(encode([recordFrom(next)]));
    setConsent(''); setReviewedText(''); setError(null);
  };
  const loadRows = (rows: IntakeRecord[], reviewed: boolean) => {
    const next = encode(rows);
    setText(next); setForm(formFrom(rows[0])); setAdvanced(!singleRecord(rows));
    setReviewedText(reviewed ? next : '');
  };
  const run = async (input: Record<string, unknown> | (() => Promise<Record<string, unknown>>)) => {
    if (!enabled || lock.current) return;
    lock.current = true; setPending(true); setError(null); setConsent('');
    try {
      const body = typeof input === 'function' ? await input() : input;
      const result = await onIntake(route, body);
      setId(result.id);
      if (body.operation === 'stage') {
        loadRows(result.review?.corrected_records ?? (result.records.length ? result.records : [recordFrom(startingForm())]), !!result.review);
      } else if (body.operation === 'review') setReviewedText(text);
    } catch (e) { setError(errorMessage(e)); }
    finally { lock.current = false; setPending(false); }
  };
  const manual = () => {
    if (!advanced) {
      const message = formError(form);
      if (message) { setError(message); setConsent(''); setReviewedText(''); return; }
    }
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
    loadRows(stored?.review?.corrected_records ?? (stored?.records.length ? stored.records : [recordFrom(startingForm())]), !!stored?.review);
  };
  return <section aria-label="Manual document import" className="space-y-3 border-t border-[var(--line)] pt-4 text-sm">
    <h4 className="font-bold">Import documents with manual review</h4>
    <p className="muted">Choose what you want to add, enter the facts from your receipt or statement, then review and confirm. Nothing is imported until you confirm.</p>
    <p className="text-xs faint">OCR is unavailable. Simple PNG (8-bit, no interlacing or metadata chunks, up to 1 million pixels) and JSON are validated up to 16000 bytes. Keep your original document open to transcribe its facts. Only its SHA-256 and reviewed facts are saved; the file is not retained. Records stay in this isolated synthetic session.</p>
    <label className="block font-medium">Document bytes (PNG or JSON)
      <input data-testid="intake-file" type="file" accept="image/png,application/json,.json" disabled={!enabled || pending} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} className="block w-full py-2 text-sm" />
    </label>
    <label className="block font-medium">Saved intake / resume after reload
      <select data-testid="intake-history" aria-label="Saved intake / resume after reload" className="field" value={id} disabled={!enabled || pending} onChange={e => resume(e.target.value)}>
        <option value="">New manual entry</option>
        {saved.map(d => <option key={d.id} value={d.id}>{d.status} · {d.input_sha256.slice(0, 12)} · {d.source}</option>)}
      </select>
    </label>
    {draft && <p data-testid="intake-provenance" className="break-all text-xs muted">Source: {draft.source} · {draft.byte_count} bytes · SHA-256 {draft.input_sha256}. OCR unavailable; no confidence score.</p>}
    {!advanced && <fieldset disabled={formDisabled} data-testid="intake-simple-form" className="space-y-3 min-w-0 inset p-3">
      <legend className="font-bold px-1">Add one record</legend>
      <label className="block font-medium">What are you adding?
        <select aria-label="What are you adding?" className="field" value={form.kind} onChange={e => {
          const kind = e.target.value as EntryKind;
          editForm({ kind, identity: '', receiptId: '', name: '', date: '', amount: '', category: kind === 'subscription' ? 'Productivity' : 'Home', trial: false, trialEnd: '', previousAmount: '' });
        }}>
          <option value="receipt">Receipt for an existing transaction</option><option value="transaction">Transaction from a statement</option><option value="subscription">Subscription or trial</option>
        </select>
      </label>
      {form.kind === 'receipt' && transactions.length > 0 && <label className="block font-medium">Choose a recorded transaction
        <select aria-label="Choose a recorded transaction" className="field" value={transactions.some(row => row.transaction_id === form.identity) ? form.identity : ''} onChange={e => {
          const row = transactions.find(record => record.transaction_id === e.target.value);
          if (row) editForm({ identity: String(row.transaction_id), name: String(row.merchant ?? ''), date: String(row.date ?? ''), amount: euros(row.amount_cents) });
        }}>
          <option value="">Choose a transaction or enter its ID below</option>
          {transactions.map(row => <option key={String(row.transaction_id)} value={String(row.transaction_id)}>{String(row.merchant)} · EUR {euros(row.amount_cents)} · {String(row.date)} · {String(row.transaction_id)}</option>)}
        </select>
      </label>}
      <label className="block font-medium">{form.kind === 'subscription' ? 'Subscription ID' : 'Transaction ID'}
        <input className="field" value={form.identity} maxLength={80} onChange={e => editForm({ identity: e.target.value })} />
      </label>
      <p className="text-xs faint">Use the same ID from your records each time. For a new record, choose a unique reference using letters, numbers, dots, underscores or hyphens.</p>
      {form.kind === 'receipt' && <label className="block font-medium">Receipt reference
        <input className="field" value={form.receiptId} maxLength={80} onChange={e => editForm({ receiptId: e.target.value })} />
      </label>}
      <label className="block font-medium">{form.kind === 'subscription' ? 'Service name' : 'Merchant name'}
        <input className="field" value={form.name} maxLength={200} onChange={e => editForm({ name: e.target.value })} />
      </label>
      <label className="block font-medium">{form.kind === 'subscription' ? 'Last billed date' : 'Transaction date'}
        <input className="field" type="date" value={form.date} onChange={e => editForm({ date: e.target.value })} />
      </label>
      <label className="block font-medium">{form.kind === 'subscription' ? 'Monthly amount (EUR)' : 'Amount (EUR)'}
        <input className="field" inputMode="decimal" placeholder="e.g. 50.25" value={form.amount} maxLength={16} onChange={e => editForm({ amount: e.target.value })} />
      </label>
      <p className="text-xs faint">Enter the documented amount, with at most two decimal places. Blank means unknown; zero is not treated as a missing value.</p>
      {form.kind !== 'receipt' && <label className="block font-medium">Category
        <input className="field" value={form.category} maxLength={200} onChange={e => editForm({ category: e.target.value })} />
      </label>}
      {form.kind === 'subscription' && <>
        <label className="block font-medium">Previous monthly amount (EUR, optional)
          <input className="field" inputMode="decimal" value={form.previousAmount} maxLength={16} onChange={e => editForm({ previousAmount: e.target.value })} />
        </label>
        <label className="flex gap-2 items-center"><input type="checkbox" checked={form.trial} onChange={e => editForm({ trial: e.target.checked })} className="accent-[var(--hearth)]" />This is a trial</label>
        {form.trial && <label className="block font-medium">Trial end date
          <input className="field" type="date" value={form.trialEnd} onChange={e => editForm({ trialEnd: e.target.value })} />
        </label>}
      </>}
    </fieldset>}
    <details open={advanced} data-testid="intake-advanced"><summary onClick={e => { e.preventDefault(); setConsent(''); if (advanced) {
      try {
        const rows = JSON.parse(text) as IntakeRecord[];
        if (!Array.isArray(rows) || !singleRecord(rows)) { setError('Use the advanced editor for multiple records or unsupported facts. No rows have been removed.'); return; }
        setForm(formFrom(rows[0]));
      } catch { setError('Correct the JSON before returning to the simple form.'); return; }
    } setAdvanced(!advanced); }} className="font-semibold">Advanced: JSON and batch records</summary>
      <p className="text-xs faint mt-2">Use an array for manual entry. A JSON file must contain an object with a records array. Corrections are reviewed before saving. Supported kinds: transaction, receipt, subscription. IDs must be stable, unique identifiers; matching never guesses by merchant.</p>
      <pre className="whitespace-pre-wrap break-all text-xs mono inset p-2 mt-2">{'{"records":[{"kind":"receipt","transaction_id":"out-001","merchant":"Leroy Merlin DIY","amount_cents":8550,"date":"2026-09-04","receipt_id":"MY-RECEIPT"}]}'}</pre>
      <pre className="whitespace-pre-wrap break-all text-xs mono inset p-2 mt-2">{'{"kind":"subscription","subscription_id":"my-sub","service_name":"Service","category":"Productivity","monthly_cents":999,"last_billed":"2026-09-12","is_trial":false}'}</pre>
    <label className="block font-medium mt-2">Reviewed records (JSON array; amount_cents uses integer cents)
      <textarea data-testid="intake-records" value={text} rows={9} maxLength={16000} disabled={formDisabled} onChange={e => { setText(e.target.value); setConsent(''); setReviewedText(''); }} className="field mono text-xs" />
    </label>
    </details>
    {draft?.status !== 'committed' && <button data-testid="intake-review" disabled={!enabled || pending} onClick={manual} className="btn btn-secondary btn-sm">{id ? 'Review exact changes' : 'Stage manual facts'}</button>}
    {review && <div data-testid="intake-changes" className="space-y-2">
      <p className="text-xs muted">Original input facts and your corrections are retained with this review. Review version {review.source_version}.</p>
      <details className="text-xs"><summary>Original facts</summary><pre className="whitespace-pre-wrap break-all mono inset p-2 mt-1">{encode(review.original_records)}</pre></details>
      {review.changes.map(c => <div key={c.index} className="inset p-2 text-xs">
        <p className="font-semibold">Row {c.index + 1}: {c.status} {c.record_id ?? ''} {c.message ?? ''}</p>
        {c.status !== 'error' && <><p className="faint mt-1">Before</p><pre className="whitespace-pre-wrap break-all mono">{JSON.stringify(c.before, null, 2)}</pre><p className="faint mt-1">After</p><pre className="whitespace-pre-wrap break-all mono">{JSON.stringify(c.after, null, 2)}</pre></>}
      </div>)}
      {draft?.status !== 'committed' && <>
        {!currentReview && <p role="status" className="note-alert">Facts or workspace version changed. Review again before confirming.</p>}
        <label className="flex gap-2 items-start"><input data-testid="intake-consent" type="checkbox" checked={consent === signature && currentReview} disabled={!enabled || pending || !currentReview} onChange={e => setConsent(e.target.checked ? signature : '')} className="mt-1 accent-[var(--hearth)]" />I confirm these exact changes: {review.changes.filter(c => c.status === 'ready').length} to import, {review.changes.filter(c => c.status === 'duplicate').length} unchanged duplicates, {review.changes.filter(c => c.status === 'error').length} errors excluded. These are user-reviewed synthetic records, not verified OCR.</label>
        <button data-testid="intake-commit" className="btn btn-primary btn-sm" disabled={!enabled || pending || !currentReview || consent !== signature || !review.changes.some(c => c.status !== 'error')} onClick={() => { void run({ operation: 'commit', intake_id: id, digest: review.digest, confirmed: true }); }}>Confirm reviewed import</button>
      </>}
    </div>}
    {draft?.status === 'committed' && <p role="status" data-testid="intake-result" className="note-ok">Saved: {draft.result?.ready} changes, {draft.result?.duplicate} duplicates unchanged, {draft.result?.error} rows excluded. No account connected, no OCR verification, no appliance or claim created.</p>}
    {error && <p role="alert" className="note-alert">{error}</p>}
    {!enabled && !pending && <p className="note">Start or refresh your demo space to import.</p>}
  </section>;
}
