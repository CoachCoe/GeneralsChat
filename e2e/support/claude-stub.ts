import { createServer, type Server } from 'http';

/**
 * Minimal stand-in for the Anthropic Messages API.
 *
 * The app calls Claude server-side, so a Playwright page.route() mock can
 * never intercept it -- with a real key the suite spent real money and got
 * nondeterministic text, and without one every response was swallowed into
 * canned filler. (TEST-3)
 *
 * The app points at this via ANTHROPIC_BASE_URL. Responses are deterministic
 * and shaped by the request so tests can assert on specific text.
 */

export const STUB_REPLY =
  'Thank you for reporting this. Based on district policy, notify the superintendent within 24 hours and document the incident in PowerSchool.';

function classificationJson() {
  return JSON.stringify({
    type: 'bullying',
    severity: 'high',
    reasoning: 'Repeated targeting of a student by a peer.',
    requiredActions: [
      { description: 'Notify the superintendent', dueInHours: 24 },
      { description: 'Complete the investigation report', dueInHours: 240 },
    ],
    timeline: ['Immediate: begin investigation'],
    stakeholders: ['Administrator', 'Parents'],
  });
}

function replyFor(body: { system?: string; max_tokens?: number }): string {
  const system = body.system ?? '';
  if (system.includes('classification expert')) return classificationJson();
  // generateIncidentTitle asks for a short title and nothing else.
  if (system.includes('title')) return 'Playground Bullying Report';
  return STUB_REPLY;
}

export function startClaudeStub(port: number): Promise<Server> {
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        /* fall through to the default reply */
      }
      const text = replyFor(body as { system?: string; max_tokens?: number });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'msg_stub',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-4-20250514',
          content: [{ type: 'text', text }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 120, output_tokens: 60 },
        })
      );
    });
  });

  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
