import { Surface } from "@/components/ui/surface";
import { interpretPresence, type PresenceSummary } from "@/lib/presence-scoring";

/**
 * The static, once-per-session read on how someone presented — server
 * rendered on the report, never live. Camera tracking runs continuously
 * across the whole interview now rather than restarting each question, so
 * there is exactly one of these per session, not one per answer that gets
 * thrown away when the next question starts.
 */
export function PresenceSummaryCard({ summary }: { summary: PresenceSummary }) {
  if (summary.samples === 0) return null;

  return (
    <Surface material="liquid" radius="md" className="p-6">
      <p className="t-micro mb-5">How you came across on camera</p>

      <div className="grid grid-cols-3 gap-4">
        <Figure value={`${summary.inFrame}%`} label="in frame" />
        <Figure
          value={summary.lookAways}
          label={summary.lookAways === 1 ? "look away" : "look aways"}
        />
        <Figure value={summary.steadiness} label="steadiness" />
      </div>

      <ul className="mt-5 space-y-2 border-t border-line pt-5">
        {interpretPresence(summary).map((note) => (
          <li key={note} className="t-body text-ink-2">
            {note}
          </li>
        ))}
      </ul>

      {/* Same discipline as the reading-accuracy note: say what the number is
          worth. A seven-class classifier on posed faces is a hint. */}
      {summary.dominant && (
        <p className="t-meta mt-4 text-ink-4">
          Mostly read as {summary.dominant}
          {summary.secondary ? `, then ${summary.secondary}` : ""}. Expression detection is a
          coarse signal — treat it as a hint, not a reading of how you felt.
        </p>
      )}
    </Surface>
  );
}

function Figure({ value, label }: { value: string | number; label: string }) {
  return (
    <div>
      <p className="t-numeric text-[22px] leading-none">{value}</p>
      <p className="t-micro mt-1.5">{label}</p>
    </div>
  );
}
