import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic();
  return client;
}

export async function generateLabel(action: string, count: number): Promise<string | null> {
  const c = getClient();
  if (!c) return null;
  try {
    const msg = await c.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 20,
      messages: [
        {
          role: "user",
          content: `Label this counter event with a single word or short phrase (max 20 chars). Action: ${action}, count: ${count}. Reply with only the label.`,
        },
      ],
    });
    const block = msg.content[0];
    if (block?.type !== "text") return null;
    return block.text.trim().slice(0, 20) || null;
  } catch {
    return null;
  }
}
