import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export interface AiImageInput {
  /** base64-encoded image bytes, no data: prefix */
  base64: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}

export interface StructuredTask {
  /** Free-form deadline text in the source language, or null if none was mentioned. */
  deadlineRaw: string | null;
  /** Rewritten, clear task description, in the source language. */
  description: string;
}

export interface StructureInput {
  text: string;
  images?: AiImageInput[];
  now: Date;
  /** When set, this is an edit: merge the user's instruction into the existing card. */
  editInstruction?: string;
  previous?: StructuredTask;
}

const SYSTEM_PROMPT = `You turn a messy work message (a task, a request, an agreement) into a clean structured task card.

Rules:
- Keep the task content in the SAME language the source text is written in. Never translate it.
- Extract the deadline exactly as implied by the text, resolving relative dates ("by Friday", "tomorrow noon", "until the end of the week") against the current date/time given below, in Asia/Tashkent timezone. Write the deadline back as short free-form text in the source language (e.g. "до пятницы, 13 сентября"). If the text contains no deadline at all, return null for deadline.
- Rewrite the task itself as a short, clear, actionable description in the source language — strip greetings, filler and repetition, keep the actual substance (what needs to be done, key details, links/numbers if present).
- If an image is attached, read any text/handwriting/context in it and fold it into the task the same way.
- Respond with ONLY a single JSON object, no markdown fences, no commentary: {"deadline": string | null, "description": string}`;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.client = new Anthropic({ apiKey: this.config.get<string>('ANTHROPIC_API_KEY') });
    this.model = this.config.get<string>('CLAUDE_MODEL') ?? 'claude-haiku-4-5-20251001';
  }

  async structure(input: StructureInput): Promise<StructuredTask> {
    const content: Anthropic.MessageParam['content'] = [];

    for (const image of input.images ?? []) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: image.mediaType, data: image.base64 },
      });
    }

    const nowIso = input.now.toISOString();
    if (input.editInstruction && input.previous) {
      content.push({
        type: 'text',
        text:
          `Current date/time (UTC): ${nowIso}. Timezone for deadlines: Asia/Tashkent.\n\n` +
          `Existing card:\ndeadline: ${input.previous.deadlineRaw ?? 'null'}\ndescription: ${input.previous.description}\n\n` +
          `User's edit instruction:\n${input.editInstruction}\n\n` +
          `Original source text (for context, may be empty):\n${input.text}`,
      });
    } else {
      content.push({
        type: 'text',
        text: `Current date/time (UTC): ${nowIso}. Timezone for deadlines: Asia/Tashkent.\n\nSource message:\n${input.text}`,
      });
    }

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      const raw = textBlock && 'text' in textBlock ? textBlock.text : '';
      return this.parse(raw);
    } catch (error) {
      this.logger.error(`Claude structuring failed: ${(error as Error).message}`);
      throw error;
    }
  }

  private parse(raw: string): StructuredTask {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : raw;
    try {
      const parsed = JSON.parse(jsonText) as { deadline?: string | null; description?: string };
      return {
        deadlineRaw: parsed.deadline ?? null,
        description: (parsed.description ?? '').trim() || raw.trim(),
      };
    } catch {
      this.logger.warn('Could not parse Claude response as JSON, falling back to raw text');
      return { deadlineRaw: null, description: raw.trim() };
    }
  }
}
