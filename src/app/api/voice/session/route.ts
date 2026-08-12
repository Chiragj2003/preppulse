import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUserApi } from "@/lib/session";
import { GD_PERSONAS, MODERATOR, STAGE_BRIEF, type DebateStage } from "@/lib/gd-metrics";
import { PERSONA_LABELS, type InterviewerPersona } from "@/lib/types";

const VoiceSessionSchema = z.object({
  sessionId: z.string().uuid(),
  mode: z.enum(["group_discussion", "debate", "interview", "conversation", "scenario"]),
  persona: z.string().optional(),
  topic: z.string().optional(),
  stance: z.enum(["for", "against"]).optional(),
  stage: z.string().optional(),
  language: z.enum(["en", "hinglish", "hi"]).optional().default("en"),
});

export async function POST(request: Request) {
  try {
    const user = await requireUserApi();
    const body = await request.json();
    const input = VoiceSessionSchema.parse(body);

    let systemPrompt = "";
    let personaDetails: Record<string, unknown> = {};

    switch (input.mode) {
      case "group_discussion": {
        const personas = GD_PERSONAS.slice(0, 4);
        const roster = personas.map((p) => `- ${p.name} (${p.trait}): ${p.instruction}`).join("\n");
        systemPrompt = `You are modulating a real-time group discussion on topic: "${input.topic || "General Discussion"}".
Panel:
${roster}
- Moderator: ${MODERATOR.instruction}
Rule: Keep responses under 3 sentences. React directly to what the candidate says. Speak in natural spoken conversational tone.`;
        personaDetails = { panel: personas.map((p) => ({ id: p.id, name: p.name, trait: p.trait })) };
        break;
      }

      case "debate": {
        const opponentStance = input.stance === "for" ? "AGAINST" : "FOR";
        const currentStage = (input.stage as DebateStage) || "opening";
        systemPrompt = `You are a sharp debate opponent arguing ${opponentStance} the motion: "${input.topic || "the motion"}".
Candidate stance: ${input.stance?.toUpperCase() || "FOR"}.
Stage: ${currentStage} (${STAGE_BRIEF[currentStage] || ""}).
Rule: Firm, well-reasoned, concise (2-3 sentences max). Engage their points directly. Never concede.`;
        personaDetails = { stance: opponentStance, stage: currentStage };
        break;
      }

      case "interview": {
        const personaKey = (input.persona as InterviewerPersona) || "professional";
        const personaLabel = PERSONA_LABELS[personaKey] || "Professional";
        systemPrompt = `You are a ${personaLabel} interviewer conducting a mock interview for role: "${input.topic || "Candidate"}".
Style: ${personaKey}. Ask clear structured questions, probe specifics, and keep spoken commentary direct and clear (2-3 sentences max).`;
        personaDetails = { persona: personaKey, label: personaLabel };
        break;
      }

      default: {
        systemPrompt = `You are an AI practice partner for "${input.topic || "conversational practice"}". Keep turns natural and concise.`;
        personaDetails = {};
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        sessionId: input.sessionId,
        mode: input.mode,
        userId: user.id,
        language: input.language,
        systemPrompt,
        personaDetails,
        initializedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to initialize voice session";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
