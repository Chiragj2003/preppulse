import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { discussionTurns, practiceSessions } from "@/db/schema";
import { requireUserApi } from "@/lib/session";
import { countWordsIn } from "@/lib/gd-metrics";

const SaveTranscriptSchema = z.object({
  sessionId: z.string().uuid(),
  speaker: z.string().nullable(),
  role: z.string().default("candidate"),
  content: z.string().min(1).max(8000),
  stage: z.string().nullable().optional(),
  isRebuttal: z.boolean().default(false),
  position: z.number().int().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireUserApi();
    const body = await request.json();
    const input = SaveTranscriptSchema.parse(body);

    const [session] = await db
      .select()
      .from(practiceSessions)
      .where(and(eq(practiceSessions.id, input.sessionId), eq(practiceSessions.userId, user.id)))
      .limit(1);

    if (!session) {
      return NextResponse.json({ ok: false, error: "Session not found or unauthorized" }, { status: 404 });
    }

    const existingTurns = await db
      .select({ id: discussionTurns.id })
      .from(discussionTurns)
      .where(eq(discussionTurns.sessionId, session.id));

    const position = input.position ?? existingTurns.length;
    const wordCount = countWordsIn(input.content);

    const [newTurn] = await db
      .insert(discussionTurns)
      .values({
        sessionId: session.id,
        position,
        speaker: input.speaker,
        role: input.role,
        content: input.content,
        stage: input.stage ?? null,
        isRebuttal: input.isRebuttal,
        wordCount,
      })
      .returning();

    return NextResponse.json({
      ok: true,
      data: {
        turnId: newTurn.id,
        position: newTurn.position,
        wordCount: newTurn.wordCount,
        savedAt: newTurn.createdAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save transcript turn";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
