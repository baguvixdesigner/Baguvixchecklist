import { StructuredTask } from './ai.service';

/**
 * Parses Claude's reply into a StructuredTask. The model is instructed to
 * respond with bare JSON but may still wrap it in prose or markdown fences,
 * so this pulls out the first {...} block before parsing, and degrades to
 * treating the whole reply as the description if it isn't valid JSON at all.
 */
export function parseStructuredResponse(raw: string): StructuredTask {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[0] : raw;
  try {
    const parsed = JSON.parse(jsonText) as { deadline?: string | null; description?: string };
    return {
      deadlineRaw: parsed.deadline ?? null,
      description: (parsed.description ?? '').trim() || raw.trim(),
    };
  } catch {
    return { deadlineRaw: null, description: raw.trim() };
  }
}
