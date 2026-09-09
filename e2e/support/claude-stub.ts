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

/**
 * What the stub answers a vague report with -- a clarifying question and
 * nothing else, which is what the real advisor does with one.
 *
 * Steered by "not sure" in the administrator's own words, so a test asks for
 * this turn the way a person would rather than by setting a flag.
 */
export const STUB_QUESTION_REPLY =
  'Before I can tell you which policy applies, can you describe what actually happened between them?';

/** Classifies from the incident text so tests can steer the category set. */
function classificationJson(userText: string) {
  const type = /fight|altercation|punch|assault|weapon/i.test(userText)
    ? 'violence'
    : /sexual|title ix|harass/i.test(userText)
      ? 'title_ix'
      : 'bullying';
  return JSON.stringify({
    type,
    severity: 'high',
    reasoning: 'Deterministic stub classification.',
    requiredActions: [
      { description: 'Notify the superintendent', dueInHours: 24 },
      { description: 'Complete the investigation report', dueInHours: 240 },
    ],
    timeline: ['Immediate: begin investigation'],
    stakeholders: ['Administrator', 'Parents'],
  });
}

interface StubRequest {
  system?: string;
  max_tokens?: number;
  messages?: { role: string; content: string }[];
}

function replyFor(body: StubRequest): string {
  const system = body.system ?? '';
  const userMessages = (body.messages ?? [])
    .filter(m => m.role === 'user')
    .map(m => m.content);
  const userText = userMessages.join(' ');
  // The turn being answered, as opposed to everything said so far. A steer
  // read from the joined history keeps firing on every later turn -- the
  // clarifying-question steer below did exactly that, so a conversation that
  // opened vaguely could never reach a guidance turn.
  const latestUserText = userMessages[userMessages.length - 1] ?? '';

  // Unique wording, not common words: 'title' also appears in the coverage-gap
  // instruction via 'title_ix', which routed a compliance call to the title
  // branch. An unmatched prompt throws rather than answering as something
  // else. (TEST-32)
  if (system.includes('school incident classification expert')) {
    return classificationJson(userText);
  }
  if (system.includes('concise, descriptive titles for school incident reports')) {
    return 'Playground Bullying Report';
  }
  // Obligation derivation. Attribute the first obligation to excerpt [1] when
  // the prompt actually contains one, and leave the second unattributed, so the
  // suite exercises both the policy-backed and the unverified path. The excerpt
  // number is only honoured if the route can resolve it, which is the point.
  if (system.includes('list the actions the administrator must take')) {
    const hasExcerpt = /\[1\]/.test(userText);
    return JSON.stringify({
      obligations: [
        {
          description: 'Notify the superintendent',
          dueInHours: 24,
          sourceExcerpt: hasExcerpt ? 1 : null,
        },
        { description: 'Complete the investigation report', dueInHours: 240, sourceExcerpt: null },
      ],
    });
  }

  if (system.includes('school district attorney reviewing an incident consultation')) {
    return 'SUMMARY: consultation summary for the incident file.';
  }
  if (!system.includes('Available Policy Context:')) {
    throw new Error(`claude-stub: unrecognised system prompt: ${system.slice(0, 160)}`);
  }

  // Echo which jurisdictions appeared in the injected policy context, and
  // whether the coverage-gap instruction was present, so tests can assert on
  // what the server actually put in the system prompt rather than guessing.
  const seen = ['FEDERAL', 'STATE', 'DISTRICT', 'SCHOOL'].filter((j) =>
    system.includes(`${j} POLICY:`)
  );
  const gap = system.includes('POLICY COVERAGE GAP') ? ' GAP' : '';

  // Label the turn, because the real model is instructed to. A stub that
  // always omitted the marker would exercise only the unlabelled fallback --
  // which resolves to `guidance` -- so the suppression path would never run
  // here at all, and the same reasoning applies as to the thinking block
  // above: a stub that is easier to handle than the real thing tests the
  // wrong system.
  if (/not sure/i.test(latestUserText)) {
    return `[[TURN: question]]\n${STUB_QUESTION_REPLY}`;
  }
  return `[[TURN: guidance]]\n${STUB_REPLY} [context: ${seen.join(',') || 'none'}${gap}]`;
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
      const text = replyFor(body as StubRequest);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'msg_stub',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-5',
          // A thinking block ahead of the text, because that is the shape the
          // real API returns. The stub used to reply with a lone text block, so
          // the suite passed while production read `content[0]`, found a
          // thinking block, and stored an empty string as the assistant's
          // answer. A stub that is easier to parse than the real thing tests
          // the wrong system.
          content: [
            { type: 'thinking', thinking: '', signature: 'stub' },
            { type: 'text', text },
          ],
          stop_reason: 'end_turn',
          usage: { input_tokens: 120, output_tokens: 60 },
        })
      );
    });
  });

  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
