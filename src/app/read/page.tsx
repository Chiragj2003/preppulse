import type { Metadata } from "next";
import Link from "next/link";

import { SubmitButton } from "@/components/ui/submit-button";
import { Surface } from "@/components/ui/surface";
import { requireOnboardedUser } from "@/lib/session";
import { listPieces, startReading } from "./actions";

export const metadata: Metadata = { title: "Read aloud" };

const KIND_LABEL = {
  tongue_twister: "Tongue twister",
  passage: "Passage",
} as const;

/**
 * The pieces, grouped by what they train. Twisters first: they are short, they
 * are the reason most people open this screen, and finishing one takes fifteen
 * seconds — which is the right first taste of a new mode.
 */
export default async function ReadingIndexPage() {
  await requireOnboardedUser("/read");
  const pieces = await listPieces();

  const twisters = pieces.filter((p) => p.kind === "tongue_twister");
  const passages = pieces.filter((p) => p.kind === "passage");

  return (
    <div className="mx-auto max-w-4xl px-5 pt-28 pb-24 sm:px-6">
      <header className="rise">
        <p className="t-micro mb-6">Read aloud</p>
        <h1 className="t-display max-w-[14ch]">
          Say it exactly <span className="text-ink-3">as written.</span>
        </h1>
        <p className="t-lead mt-8 max-w-xl">
          We have the text, so we can check it word by word — which words you landed, which ones
          came out as something else, and whether you held your pace to the end.
        </p>
      </header>

      {[
        { label: "Tongue twisters", blurb: "Short, awkward, and unforgiving of a rush.", items: twisters },
        { label: "Passages", blurb: "Sustained delivery over a paragraph.", items: passages },
      ].map((group, groupIndex) => (
        <section
          key={group.label}
          className="rise mt-16"
          style={{ animationDelay: `${80 + groupIndex * 60}ms` }}
        >
          <div className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="t-micro">{group.label}</p>
            <p className="t-meta text-ink-4">{group.blurb}</p>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {group.items.map((piece) => (
              <li key={piece.id}>
                <form action={startReading} className="h-full">
                  <input type="hidden" name="pieceId" value={piece.id} />
                  <Surface
                    material="liquid"
                    radius="md"
                    className="flex h-full flex-col gap-4 p-6"
                  >
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="t-heading">{piece.title}</p>
                      <span className="t-micro shrink-0 text-ink-4">{piece.difficulty}</span>
                    </div>

                    <p className="t-body line-clamp-2 text-ink-3">{piece.body}</p>

                    {piece.focus && <p className="t-meta text-ink-4">{piece.focus}</p>}

                    <div className="mt-auto flex items-center justify-between gap-4 border-t border-line pt-4">
                      <span className="t-micro">
                        {KIND_LABEL[piece.kind]}
                        <span className="mx-2 text-ink-4">/</span>
                        {piece.paceMin}-{piece.paceMax} wpm
                      </span>
                      <SubmitButton variant="glass">Read it</SubmitButton>
                    </div>
                  </Surface>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="mt-16 text-center">
        <Link href="/practice" className="t-micro transition-colors hover:text-ink-2">
          Back to practice
        </Link>
      </p>
    </div>
  );
}
