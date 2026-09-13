import type { BackendState } from '../api';

interface LandingProps {
  preview: BackendState | null; returning: boolean; expired: boolean; busy: boolean; error: string | null;
  onStart: () => void;
}

export function Landing({ preview, returning, expired, busy, error, onStart }: LandingProps) {
  const repair = preview?.appliances.find(a => a.has_repair_claim);
  const costLine = !preview ? 'The repair bill has arrived.'
    : repair && repair.repair_amount_known !== false ? `The repair cost €${(repair.repair_amount_cents / 100).toFixed(2)}.`
    : 'The repair cost is not recorded yet.';
  return (
    <div className="max-w-6xl mx-auto px-5 py-10 sm:py-16 space-y-14" aria-labelledby="welcome-title">
      <section className="grid lg:grid-cols-[1.15fr_1fr] gap-10 items-center">
        <div className="space-y-6">
          <p className="eyebrow">For households facing a repair bill</p>
          <h1 id="welcome-title" className="title text-4xl sm:text-5xl text-balance">Your receipt is the start. Keep the whole case together.</h1>
          <p className="text-lg muted leading-relaxed max-w-xl">
            Something you own breaks. Hestia keeps the receipt, the guarantee and the repair facts in one place, checks them with its agent,
            and prepares the exact letter to the seller for you to approve. Replies, evidence and the outcome stay in one saved case file.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <button data-testid="launch-cockpit" onClick={onStart} disabled={busy} className="btn btn-primary text-base px-6">
              {busy ? 'Opening your private copy…' : returning ? 'Continue your household case' : expired ? 'Start a new demo space' : 'Start with the sample household'} <span aria-hidden="true">→</span>
            </button>
            <p className="text-sm faint max-w-xs">Opens your private copy of a fictional household for 30 minutes. Add your own appliances to it. Nothing is sent to anyone.</p>
          </div>
          {error && <p role="alert" className="note-alert">{error}</p>}
        </div>
        <div className="card-accent p-6 sm:p-8 space-y-5">
          <div className="flex justify-between items-center gap-3"><span className="eyebrow">Sample repair case</span><span className="chip">For review</span></div>
          <h2 className="text-2xl font-bold leading-snug">The washing machine broke.<br />{costLine}</h2>
          <p className="muted">Can the seller be asked to review it? Hestia starts from the receipt and the repair record, and keeps the request and the eventual outcome connected.</p>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3"><span className="font-extrabold text-[var(--hearth)]">01</span><span>Hestia's agent checks the recorded facts and tells you what is waiting for a decision.</span></li>
            <li className="flex gap-3"><span className="font-extrabold text-[var(--hearth)]">02</span><span>You read the exact notice and approve it yourself. Nothing goes out without you.</span></li>
            <li className="flex gap-3"><span className="font-extrabold text-[var(--hearth)]">03</span><span>Replies, deadlines and evidence stay on one timeline until the case is closed.</span></li>
          </ol>
          <p className="border-t border-[var(--line)] pt-4 text-xs faint">The repair cost is a recorded fact, not a promise of recovery. Legal eligibility needs its own review.</p>
        </div>
      </section>

      <section className="space-y-5" aria-labelledby="usage-title" data-testid="how-you-use-it">
        <div>
          <p className="eyebrow">How you would use it</p>
          <h2 id="usage-title" className="text-2xl font-bold mt-1">Three moments in a household</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <article className="card p-5 space-y-2">
            <span className="chip chip-clay">Something breaks</span>
            <h3 className="font-bold">Report the repair, approve the letter</h3>
            <p className="note">Pick the appliance, enter the repair date and the invoice amount, say what broke. Hestia checks the receipt and guarantee facts, prepares the exact notice to the seller, and you approve it. The case file keeps every reply until it is closed.</p>
          </article>
          <article className="card p-5 space-y-2">
            <span className="chip chip-sky">A new purchase arrives</span>
            <h3 className="font-bold">Paste the order email, or type the receipt</h3>
            <p className="note">Paste the confirmation email and Hestia's model proposes the record: item, seller, date, price. Paid cash with a paper receipt? Type it in. You confirm every fact, and save the product page, manual and quick start links so the paper manual can go.</p>
          </article>
          <article className="card p-5 space-y-2">
            <span className="chip chip-sage">Every week</span>
            <h3 className="font-bold">Ask Hestia what needs a decision</h3>
            <p className="note">The agent reads your appliances, subscriptions and transactions with four bounded tools and lists what is waiting: a trial ending, a price that crept up, a receipt missing for a big purchase. It points; you decide.</p>
          </article>
        </div>
        <p className="card-muted p-4 text-sm muted"><strong className="text-[var(--ink)]">Honest about today:</strong> you add records yourself, by pasting text or typing them. Reading your bank account or mailbox automatically is not part of this demo, and photo scanning of receipts is not either.</p>
      </section>

      <section className="grid md:grid-cols-3 gap-4" aria-label="How Hestia works">
        <div className="card p-5 space-y-2">
          <span className="chip chip-hearth">Strands agent</span>
          <h3 className="font-bold">Reads, then asks</h3>
          <p className="note">An agent built with the Strands Agents SDK calls four bounded tools over your records and writes a short briefing. It explains and points; it never decides eligibility.</p>
        </div>
        <div className="card p-5 space-y-2">
          <span className="chip chip-sky">Human approval</span>
          <h3 className="font-bold">Exact notice, your click</h3>
          <p className="note">The letter is prepared on the server from recorded facts. You see the exact text, recipient and amount before approving it.</p>
        </div>
        <div className="card p-5 space-y-2">
          <span className="chip chip-sage">One timeline</span>
          <h3 className="font-bold">The case stays whole</h3>
          <p className="note">Replies, silence, extra evidence and outcomes are saved with who recorded them and when. Reload and it is still there.</p>
        </div>
      </section>

      <section className="card-muted p-5 text-sm muted flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <p><strong className="text-[var(--ink)]">What runs for real:</strong> AWS Lambda, Amazon S3, and a Strands agent on Amazon Bedrock (Claude Haiku 4.5) for the weekly review and for reading pasted text, with a small per-copy limit.</p>
        <p><strong className="text-[var(--ink)]">What does not:</strong> email, bank or mailbox feeds, receipt OCR, and any money movement. Approvals are recorded simulations.</p>
      </section>
    </div>
  );
}
