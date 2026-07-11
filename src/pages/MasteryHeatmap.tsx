import { useMemo } from "react";
import { DomainId, DOMAIN_LABELS, SessionRecord } from "@/engine/types";
import { getDomain } from "@/domains/registry";
import {
  computeItemMastery,
  ItemMastery,
  MasteryBucket,
} from "@/lib/mastery";

interface Props {
  sessions: SessionRecord[];
  goals: DomainId[];
}

/**
 * Per-item mastery heatmap. One grid per domain the student works in;
 * one cell per item, colored by mastery bucket using the app palette
 * (sage scale = mastery, coral-soft = emerging, line = not enough data).
 *
 * Accessibility: every cell is keyboard-focusable and carries a complete
 * aria-label (item, bucket word, counts, recency), each cell also shows
 * its counts as text, and the legend is text-labeled — color is never
 * the only signal. Loaded lazily from StudentDetail (default export),
 * like the trend chart.
 */
export default function MasteryHeatmap({ sessions, goals }: Props) {
  const mastery = useMemo(() => computeItemMastery(sessions), [sessions]);

  const domains = useMemo(() => {
    const active = new Set<DomainId>([
      ...goals,
      ...sessions.map((s) => s.domain),
    ]);
    // Stable label order regardless of goal order.
    return (Object.keys(DOMAIN_LABELS) as DomainId[]).filter((d) =>
      active.has(d),
    );
  }, [goals, sessions]);

  if (domains.length === 0) return null;

  return (
    <div className="bg-white border border-line rounded-tile p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-lg font-semibold text-ink">Item mastery</h3>
          <p className="text-xs text-muted">
            Every attempt across all sessions, per item. Mastered = 90%+ over
            at least 5 tries.
          </p>
        </div>
        <Legend />
      </div>

      <div className="space-y-4">
        {domains.map((d) => (
          <DomainGrid key={d} domain={d} mastery={mastery} />
        ))}
      </div>
    </div>
  );
}

const BUCKET_LABELS: Record<MasteryBucket, string> = {
  mastered: "Mastered",
  developing: "Developing",
  emerging: "Emerging",
  new: "New",
};

/** Palette tokens only: sage scale, coral-soft, line. */
const BUCKET_STYLES: Record<MasteryBucket, string> = {
  mastered: "bg-sage-500 border-sage-600 text-white",
  developing: "bg-sage-100 border-sage-300 text-ink",
  emerging: "bg-coral-soft border-coral text-ink",
  new: "bg-line/40 border-line text-muted",
};

const NO_DATA: Omit<ItemMastery, "itemId"> = {
  attempts: 0,
  correct: 0,
  accuracy: 0,
  lastSeen: 0,
  bucket: "new",
};

function DomainGrid({
  domain,
  mastery,
}: {
  domain: DomainId;
  mastery: Record<string, ItemMastery>;
}) {
  const items = getDomain(domain).availableForAI();
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="text-sm font-medium text-ink mb-1.5">
        {DOMAIN_LABELS[domain]}
      </h4>
      <ul
        className="grid gap-1.5 list-none"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(6.5rem, 1fr))" }}
        aria-label={`${DOMAIN_LABELS[domain]} item mastery`}
      >
        {items.map((item) => {
          const m = mastery[item.id] ?? { itemId: item.id, ...NO_DATA };
          return <Cell key={item.id} label={item.label} m={m} />;
        })}
      </ul>
    </div>
  );
}

function Cell({ label, m }: { label: string; m: ItemMastery }) {
  const pct = Math.round(m.accuracy * 100);
  const stat = m.attempts === 0 ? "no tries yet" : `${m.correct}/${m.attempts} · ${pct}%`;
  const tooltip =
    m.attempts === 0
      ? `${label} — no attempts yet`
      : `${label} — ${m.correct} of ${m.attempts} correct (${pct}%)`;
  const aria =
    m.attempts === 0
      ? `${label}: no attempts yet.`
      : `${label}: ${BUCKET_LABELS[m.bucket].toLowerCase()} — ${m.correct} of ${
          m.attempts
        } correct, ${pct} percent, last practiced ${lastSeenLabel(m.lastSeen)}.`;
  return (
    <li
      tabIndex={0}
      title={tooltip}
      aria-label={aria}
      className={
        "rounded-lg border px-2 py-1.5 outline-none " +
        "focus-visible:ring-2 focus-visible:ring-sage-600 focus-visible:ring-offset-1 " +
        BUCKET_STYLES[m.bucket]
      }
    >
      <span className="block truncate text-xs font-medium">{label}</span>
      <span className="block text-[10px] tabular-nums opacity-90">{stat}</span>
    </li>
  );
}

function Legend() {
  const order: MasteryBucket[] = ["mastered", "developing", "emerging", "new"];
  return (
    <ul className="flex flex-wrap items-center gap-3 list-none" aria-label="Legend">
      {order.map((b) => (
        <li key={b} className="flex items-center gap-1.5 text-xs text-muted">
          <span
            aria-hidden="true"
            className={"inline-block w-3 h-3 rounded border " + BUCKET_STYLES[b]}
          />
          {BUCKET_LABELS[b]}
        </li>
      ))}
    </ul>
  );
}

function lastSeenLabel(ts: number): string {
  const days = Math.round((Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(ts).toLocaleDateString();
}
