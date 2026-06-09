import Anthropic from '@anthropic-ai/sdk';
import type { SummarizeRequest, SummarizeResponse } from '../types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function summarize(data: SummarizeRequest): Promise<SummarizeResponse> {
  const commentsBlock = data.comments
    .slice(0, 20)
    .map((c, i) => `Comment ${i + 1}: ${c}`)
    .join('\n');

  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 400,
    messages: [
      {
        role: 'user',
        content: `Summarize this Reddit post. Return ONLY a JSON object, no markdown, no backticks, exactly like this:
    {
      "post": "2-3 sentence summary of what the OP said",
      "community": "1-2 sentence summary of the community reaction"
    }

    Title: ${data.title}
    Post body: ${data.body || '(no body, title only)'}
    Top comments:
    ${commentsBlock || '(no comments)'}`,
          },
        ],
      });

const block = message.content[0];
if (block.type !== 'text') throw new Error('Unexpected response type');

const clean = block.text
  .replace(/```json\n?/g, '')
  .replace(/```\n?/g, '')
  .trim();

const parsed: SummarizeResponse = JSON.parse(clean);

console.log(parsed)
return parsed;;
}