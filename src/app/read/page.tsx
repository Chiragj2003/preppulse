import type { Metadata } from "next";
import Link from "next/link";

import { requireOnboardedUser } from "@/lib/session";
import { listPieces, startReading } from "./actions";

export const metadata: Metadata = { title: "Read aloud" };

/**
 * A whole card that submits.
 *
 * `.material .m-liquid` rather than the `Surface` component because Surface
 * renders a div, and a div wrapping a submit button is two targets pretending
 * to be one. A real `<button type="submit">` gets keyboard focus, Enter and
 * Space for free — none of which a clickable div does.
 *
 * No `transition-colors` and no `hover:border-*` here, deliberately. `.material`
 * draws its edge as a masked specular hairline and sets no border-width, so a
 * hover border-colour is a no-op; and a Tailwind `transition-colors` utility
 * outranks `.liftable`'s `transition: transform, box-shadow`, which would make
 * the hover lift snap instead of glide. The system's affordance here is depth,
 * not colour — `.liftable` and `.pressable` already carry it.
 */
function CardButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="material m-liquid liftable pressable flex h-full w-full flex-col gap-4 rounded-[var(--radius-md)] p-6 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {children}
    </button>
  );
}

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
                {/* The whole card submits, not a button in the corner of it.
                    A card that looks like one object should behave like one —
                    and `.pressable` puts the feedback on pointer-down rather
                    than waiting for the click to land. */}
                <form action={startReading} className="h-full">
                  <input type="hidden" name="pieceId" value={piece.id} />
                  <CardButton>
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
                      <span className="t-micro text-accent">Read it</span>
                    </div>
                  </CardButton>
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
