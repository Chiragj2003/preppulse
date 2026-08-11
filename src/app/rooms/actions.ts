"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { discussionTurns, practiceSessions } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { gateOrRedirect } from "@/lib/gate";
import { countWordsIn } from "@/lib/gd-metrics";
import { scenarioById } from "@/lib/scenarios";
import { requireUserApi } from "@/lib/session";

const StartInput = z.object({ scenarioId: z.string().min(1).max(60) });

/**
 * Starts a conversation or scenario room.
 *
 * Everything after this is the Phase 4 machinery: the same `discussion_turns`
 * table, the same `speak()` action, the same room at /discuss/[id]. This
 * function only creates the session and seeds the counterpart's opening line.
 */
export async function startScenario(formData: FormData) {
  const user = await requireUserApi();
  const input = StartInput.parse({ scenarioId: formData.get("scenarioId") });

  const scenario = scenarioById(input.scenarioId);
  if (!scenario) throw new AppError("not_found", "That scenario doesn't exist.");

  await gateOrRedirect(user.id, scenario.kind);

  const [session] = await db
    .insert(practiceSessions)
    .values({
      userId: user.id,
      mode: scenario.kind,
      status: "in_progress",
      promptSnapshot: scenario.title,
      config: { scenarioId: scenario.id },
    })
    .returning();

  // The counterpart speaks first. A role-play that opens with a blank box puts
  // the burden of starting the scene on the person practising, which is the
  // hardest part and not the part they came to practise.
  await db.insert(discussionTurns).values({
    sessionId: session.id,
    position: 0,
    speaker: scenario.counterpart.id,
    role: "counterpart",
    content: scenario.openingLine,
    isRebuttal: false,
    wordCount: countWordsIn(scenario.openingLine),
  });

  redirect(`/discuss/${session.id}`);
}
