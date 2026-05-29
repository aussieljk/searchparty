// ============================================================================
// FEATURE: AI META SUGGESTIONS — backend route.
//
// POST /api/ai/suggest  { url?, title?, description?, h1?, ogImageAlt?, issues? }
//   -> uses @anthropic-ai/sdk (claude-opus-4-8) with a forced JSON-schema tool
//      to produce an improved title (<=60), meta description (<=155), og:image
//      alt text, and a one-line rationale.
//
// If ANTHROPIC_API_KEY is unset we return HTTP 200 {available:false} so the UI
// can render a graceful "set ANTHROPIC_API_KEY to enable" state instead of an
// error. The static system/instructions block is cached via prompt caching.
// ============================================================================
import Anthropic from "@anthropic-ai/sdk";
import type { Route, RouteCtx } from "../routeCtx.ts";

/** Shape Claude returns and we relay to the UI. */
export interface AiSuggestion {
  title: string;
  description: string;
  ogImageAlt: string;
  rationale: string;
}

const MODEL = "claude-opus-4-8";

// Frozen instruction block — kept byte-stable so prompt caching can reuse it
// across requests (cache_control breakpoint sits on this block).
const SYSTEM_INSTRUCTIONS = `You are an expert technical SEO and social-sharing copywriter.
Given a web page's current metadata, you write improved replacements that maximise
click-through from search results and social cards while staying truthful to the page.

Hard rules:
- title: <= 60 characters. Front-load the primary keyword. No clickbait, no trailing site name unless it adds value.
- description: <= 155 characters. One or two sentences, active voice, includes a concrete value proposition or call to action.
- ogImageAlt: a concise, descriptive alt text for the page's social preview image (<= 120 characters). Describe what the image should convey for this page; do not invent specific visual details you cannot know.
- rationale: ONE short line explaining the single most impactful change you made.

Always return values even when the current metadata is already good — in that case, return a lightly refined version and say so in the rationale. Never exceed the character limits.`;

// Forced tool = structured output. The model MUST call this with valid args.
const SUGGEST_TOOL: Anthropic.Tool = {
  name: "emit_suggestions",
  description: "Return the improved page metadata suggestions.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Improved <title>, <= 60 chars." },
      description: {
        type: "string",
        description: "Improved meta description, <= 155 chars.",
      },
      ogImageAlt: {
        type: "string",
        description: "Alt text for the og:image / social preview, <= 120 chars.",
      },
      rationale: {
        type: "string",
        description: "One short line: the most impactful change made.",
      },
    },
    required: ["title", "description", "ogImageAlt", "rationale"],
  },
};

interface SuggestBody {
  url?: string;
  title?: string;
  description?: string;
  h1?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImageAlt?: string;
  issues?: string[];
}

/** Build the volatile, per-page user prompt (kept AFTER the cached prefix). */
function buildUserPrompt(b: SuggestBody): string {
  const lines: string[] = [];
  lines.push("Here is the page's current metadata. Suggest improvements.");
  lines.push("");
  if (b.url) lines.push(`URL: ${b.url}`);
  lines.push(`Current title: ${b.title?.trim() || "(missing)"}`);
  lines.push(`Current meta description: ${b.description?.trim() || "(missing)"}`);
  if (b.h1) lines.push(`Page H1: ${b.h1.trim()}`);
  if (b.ogTitle) lines.push(`Current og:title: ${b.ogTitle.trim()}`);
  if (b.ogDescription) lines.push(`Current og:description: ${b.ogDescription.trim()}`);
  lines.push(`Current og:image alt: ${b.ogImageAlt?.trim() || "(missing)"}`);
  if (b.issues?.length) {
    lines.push("");
    lines.push("Flagged SEO issues:");
    for (const issue of b.issues) lines.push(`- ${issue}`);
  }
  return lines.join("\n");
}

function clamp(s: unknown, max: number): string {
  const str = typeof s === "string" ? s.trim() : "";
  return str.length > max ? str.slice(0, max).trimEnd() : str;
}

async function handler(req: Request, _url: URL, _ctx: RouteCtx): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Graceful degradation: 200 + available:false so the UI shows a setup hint.
    return Response.json({ available: false, reason: "ANTHROPIC_API_KEY not set" });
  }

  let body: SuggestBody;
  try {
    body = (await req.json()) as SuggestBody;
  } catch {
    return Response.json({ available: true, error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return Response.json({ available: true, error: "Invalid body" }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_INSTRUCTIONS,
          cache_control: { type: "ephemeral" }, // cache the frozen instructions block
        },
      ],
      tools: [SUGGEST_TOOL],
      tool_choice: { type: "tool", name: SUGGEST_TOOL.name }, // force structured output
      messages: [{ role: "user", content: buildUserPrompt(body) }],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) {
      return Response.json(
        { available: true, error: "Model did not return a suggestion" },
        { status: 502 },
      );
    }

    const raw = toolUse.input as Record<string, unknown>;
    const suggestion: AiSuggestion = {
      title: clamp(raw.title, 60),
      description: clamp(raw.description, 155),
      ogImageAlt: clamp(raw.ogImageAlt, 120),
      rationale: clamp(raw.rationale, 280),
    };

    return Response.json({ available: true, suggestion });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json({ available: false, reason: "Invalid ANTHROPIC_API_KEY" });
    }
    const message =
      err instanceof Anthropic.APIError
        ? `Anthropic API error ${err.status}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    return Response.json({ available: true, error: message }, { status: 502 });
  }
}

export const route: Route = {
  method: "POST",
  path: "/api/ai/suggest",
  handler,
};

export default route;
