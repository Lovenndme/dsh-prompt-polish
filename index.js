/**
 * Host half of the prompt-polish bundle.
 *
 * The Client button in the composer asks for one rewrite through the `polish`
 * human command: the draft arrives as the command's raw input, the Host
 * streams one auxiliary model request on the Session's current route, and the
 * settled text travels back as the command result. No model turn is opened and
 * the Client renders no command row, so a rewrite never enters the conversation.
 */

/** Command name without the leading slash. */
const COMMAND_NAME = 'polish'

/** Longest draft accepted for one rewrite, in UTF-16 characters. */
const MAX_DRAFT_CHARS = 24000

/** Output-token cap for the auxiliary rewrite request. */
const MAX_POLISH_TOKENS = 4096

/**
 * Rewrite instructions. They follow the conventions the installed
 * documentation uses for its own prompts: a stated goal, concrete context,
 * ordered requirements, hard constraints, and verifiable acceptance, written
 * with the real references and capabilities of this Harness.
 */
const POLISH_INSTRUCTIONS = `You rewrite rough drafts into prompts for a DeepSeek Harness (DSH) coding agent.

# Output discipline
- Output only the rewritten prompt. No greeting, preamble, commentary, or closing remark, and never wrap the whole answer in a code fence.
- Write in the draft's own language: a Chinese draft stays Chinese, an English draft stays English, and headings use that language (目标, 背景, 要求, 约束, 验收 / Goal, Context, Requirements, Constraints, Acceptance).
- Preserve every fact the draft already states: paths, file names, commands, flags, URLs, numbers, proper nouns, code snippets, @file references, and /slash commands.
- Never invent facts the user did not supply. When a detail is missing, keep the user's own wording or leave it out; at most one clearly marked "TODO:" when the omission would block the work. Never emit angle-bracket placeholders: the result must be usable as typed.
- Never name a tool, command, or file the draft does not imply and DSH does not have.
- Size matters: if the draft is already specific and actionable, return a cleaned version at about the same length with NO headings. Use the sectioned shape only when the draft contains several distinct deliverables or its intent is genuinely ambiguous.
- Delete filler such as "think carefully", "you are a brilliant engineer", or restated politeness.

# Shape (only when the draft needs it)
1. Goal: one imperative sentence naming the deliverable.
2. Context: why the work happens and which files or modules it touches, written as backticked relative paths (for example \`src/index.ts\`). Choose backticks rather than @references unless the user already wrote @.
3. Requirements: an ordered list of concrete steps, one action per item.
4. Constraints: rules that must hold, parts that must not change, style and dependency limits.
5. Acceptance: verifiable completion conditions, such as what must run, where output goes, and its format.

# DSH conventions
- Reference workspace files as backticked relative paths; reference slash commands as /name (for example /compact or /plan).
- Mention a capability only when the task needs it, and then use a real one: read, edit, write, grep, glob, bash, todo_write, subagent, web_search, web_fetch, skill, office_*.
- Do not ask for a plan first unless the draft implies exploration across several files; the agent already asks when it needs to.
- The agent already follows workspace instructions and installed skills; do not restate generic good behavior it already covers.

# Typography
- Markdown with short headings, lists, and code blocks where useful; avoid long prose paragraphs.
- Use the punctuation of the draft's language.`

/** Human-readable command summary shown in the slash catalog. */
const COMMAND_DESCRIPTION =
  'Rewrite the composer draft into a ready-to-run DSH prompt with the session model.'

/**
 * Register the command that the composer button calls.
 * @param ctx - plugin Context carrying the command registry and the LLM service.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.commands.register({
    name: COMMAND_NAME,
    description: COMMAND_DESCRIPTION,
    // Declaring input keeps `/polish <text>` a claimed command instead of an
    // ordinary message that would reach the agent.
    input: { hint: 'draft to polish' },
    // The draft is user content the rewrite replaces; keep one copy in the log at most.
    recordInput: false,
    handler: (invocation) => polish(ctx, invocation),
  }), 'prompt-polish: command')
}

/** Services this plugin cannot run without. */
export const inject = ['commands', 'llm']

/**
 * Rewrite one draft through the Session's current model route.
 * @param ctx - plugin Context carrying the LLM service.
 * @param invocation - command invocation carrying the draft, the Agent, and cancellation.
 * @returns the settled command result.
 */
async function polish(ctx, invocation) {
  const draft = stripSeparator(invocation.rawInput)
  if (draft.trim() === '') {
    return { kind: 'error', text: 'The composer draft is empty, so there is nothing to polish.' }
  }
  if (draft.length > MAX_DRAFT_CHARS) {
    return { kind: 'error', text: `The draft is longer than ${MAX_DRAFT_CHARS} characters, which this rewrite does not accept.` }
  }
  const route = resolveRoute(ctx, invocation.agent)
  if (route === undefined) {
    return { kind: 'error', text: 'No model route is available for this session, so the draft was not polished.' }
  }
  const signal = invocation.signal
  let text = ''
  try {
    const request = {
      provider: route.provider,
      model: route.model,
      maxTokens: MAX_POLISH_TOKENS,
      system: POLISH_INSTRUCTIONS,
      messages: [{ role: 'user', content: [{ type: 'text', text: draft }] }],
      signal,
    }
    const sessionId = invocation.agent?.session?.id
    if (sessionId !== undefined) request.sessionId = sessionId
    for await (const chunk of ctx.llm.stream(request)) {
      if (chunk.type === 'text-delta') {
        text += chunk.text
      } else if (chunk.type === 'block-end' && text === '' && chunk.block?.type === 'text') {
        text = chunk.block.text
      } else if (chunk.type === 'finish') {
        const reason = chunk.reason
        if (reason?.kind === 'max-tokens') {
          return {
            kind: 'error',
            text: 'The rewrite hit its output limit, so it may be incomplete; the draft was left unchanged.',
          }
        }
        if (reason?.kind === 'error' || reason?.kind === 'aborted') {
          return { kind: 'error', text: reason.failure?.message ?? 'The model request failed before it produced a rewrite.' }
        }
      }
    }
  } catch (error) {
    if (signal?.aborted === true) return { kind: 'error', text: 'The rewrite was cancelled.' }
    return { kind: 'error', text: failureMessage(error) }
  }
  const cleaned = unwrapFence(text).trim()
  if (cleaned === '') {
    return { kind: 'error', text: 'The model returned an empty rewrite, so the draft was left unchanged.' }
  }
  return { kind: 'success', text: cleaned }
}

/**
 * Resolve the route the Session currently uses.
 * @param ctx - plugin Context for the default-selection fallback.
 * @param agent - receiving Agent, or undefined outside an Agent scope.
 * @returns the provider and model to call, or undefined when none is known.
 */
function resolveRoute(ctx, agent) {
  const current = agent?.model?.current?.()
  if (typeof current?.provider === 'string' && typeof current.model === 'string') {
    return { provider: current.provider, model: current.model }
  }
  const header = agent?.session?.requestHeader?.()?.config
  if (typeof header?.provider === 'string' && typeof header.model === 'string') {
    return { provider: header.provider, model: header.model }
  }
  const fallback = ctx.get('agentDefaultModel')?.currentSelection?.()
  if (typeof fallback?.provider === 'string' && typeof fallback.model === 'string') {
    return { provider: fallback.provider, model: fallback.model }
  }
  return undefined
}

/**
 * Drop the single separator the parser retains after the command name while
 * preserving any indentation the draft itself starts with.
 * @param rawInput - text following the command name.
 * @returns the draft.
 */
function stripSeparator(rawInput) {
  if (typeof rawInput !== 'string') return ''
  const text = rawInput.startsWith(' ') ? rawInput.slice(1) : rawInput
  return text.replace(/\s+$/u, '')
}

/**
 * Unwrap a rewrite the model fenced as one whole block.
 * @param text - streamed rewrite.
 * @returns the body without an enclosing fence.
 */
function unwrapFence(text) {
  const trimmed = text.trim()
  const match = /^(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n?\1$/u.exec(trimmed)
  return match === null ? trimmed : match[2]
}

/**
 * Render a thrown failure as one line of user-facing text.
 * @param error - thrown value.
 * @returns the message, or a generic fallback.
 */
function failureMessage(error) {
  if (error instanceof Error && error.message !== '') return `The rewrite failed: ${error.message}`
  return 'The rewrite failed before it produced a result.'
}
