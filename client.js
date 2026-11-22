/**
 * Client half of the prompt-polish bundle.
 *
 * - `conversation.input.right`: one compact control before the model selector
 *   that rewrites the current draft and writes the result back into it.
 * - `conversation.chat.commandview`: the `polish` command's own row renders
 *   nothing, so a rewrite never adds content to the conversation flow. The
 *   empty row collapses because the flow treats an empty node as zero height.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-prompt-polish',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'promptPolish'
    /** Host command the button invokes. */
    const COMMAND = 'polish'
    /** How long a settled state stays on the button, in milliseconds. */
    const STATUS_MS = 4000
    /** Client-side patience limit for one rewrite, in milliseconds. */
    const TIMEOUT_MS = 180000

    const DICTS = {
      zh: {
        label: '润色',
        busy: '润色中',
        success: '已润色',
        failed: '润色失败',
        emptyHint: '先输入要润色的提示词',
        lockedHint: '消息发送中，稍后再试',
        failedHint: '润色失败，请重试',
        busyHint: '正在用当前会话的模型润色提示词',
        readyHint: '用当前会话的模型把草稿改写成可直接执行的提示词',
        changed: '草稿在润色期间有改动，已放弃这次结果',
        timeout: '润色超时，请重试',
      },
      en: {
        label: 'Polish',
        busy: 'Polishing',
        success: 'Polished',
        failed: 'Polish failed',
        emptyHint: 'Write a prompt first',
        lockedHint: 'A message is being sent; try again shortly',
        failedHint: 'The polish request failed; try again',
        busyHint: 'Polishing the draft with this session\u2019s model',
        readyHint: 'Rewrite the draft as a ready-to-run prompt with this session\u2019s model',
        changed: 'The draft changed while polishing, so that result was discarded',
        timeout: 'The polish request took too long; try again',
      },
    }

    const FOCUS_CSS = 'button[data-prompt-polish]:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}'

    const SPARKLE = h('svg', {
      'aria-hidden': true,
      viewBox: '0 0 16 16',
      width: 13,
      height: 13,
      style: { display: 'block', flex: '0 0 auto' },
    }, h('path', {
      d: 'M8 1.4l1.35 3.75L13.1 6.5 9.35 7.85 8 11.6 6.65 7.85 2.9 6.5l3.75-1.35z',
      fill: 'currentColor',
    }))

    const HOVER_TINT = 'color-mix(in srgb, var(--dsw-alias-label-secondary) 12%, transparent)'

    /**
     * Re-render on locale changes so localized labels follow the UI language.
     * @param locale - Client locale service.
     */
    function useLocaleVersion(locale) {
      const [, bump] = React.useReducer((count) => count + 1, 0)
      React.useEffect(() => {
        if (typeof locale?.subscribe !== 'function') return undefined
        return locale.subscribe(() => bump())
      }, [locale])
    }

    /**
     * One composer control that polishes the draft in place.
     * @param props - session-scope slot props plus this plugin's own additions.
     */
    function PolishButton(props) {
      const { useInput, inputActions, sessionId, getCommands, t, locale } = props
      useLocaleVersion(locale)
      const draft = useInput((state) => state.draft)
      const phase = useInput((state) => state.phase)
      const draftRev = useInput((state) => state.draftRev)
      const [busy, setBusy] = React.useState(false)
      const [status, setStatus] = React.useState(null)
      const [hover, setHover] = React.useState(false)
      const alive = React.useRef(true)
      const latest = React.useRef({ draftRev, phase })
      latest.current = { draftRev, phase }
      React.useEffect(() => () => { alive.current = false }, [])
      React.useEffect(() => {
        if (status === null) return undefined
        const timer = setTimeout(() => setStatus(null), STATUS_MS)
        return () => clearTimeout(timer)
      }, [status])

      const empty = typeof draft !== 'string' || draft.trim() === ''
      const locked = phase !== 'plain'
      const disabled = busy || empty || locked

      const run = React.useCallback(async () => {
        if (busy || locked) return
        const text = typeof draft === 'string' ? draft : ''
        if (text.trim() === '') return
        const commands = getCommands()
        if (commands === undefined) {
          setStatus({ kind: 'error', text: t('failed') })
          return
        }
        const started = { draftRev: latest.current.draftRev, phase: latest.current.phase }
        setBusy(true)
        setStatus(null)
        let timer
        const deadline = new Promise((resolve) => {
          timer = setTimeout(() => resolve('timeout'), TIMEOUT_MS)
        })
        try {
          const call = commands.execute(sessionId, '/' + COMMAND + ' ' + text, [])
          // A result that arrives after the patience limit must not surface as an
          // unhandled rejection.
          call.catch(() => {})
          const settled = await Promise.race([call, deadline])
          if (!alive.current) return
          if (settled === 'timeout') {
            setStatus({ kind: 'error', text: t('timeout') })
            return
          }
          if (!settled.ok) {
            const detail = settled.error?.message
            setStatus({ kind: 'error', text: typeof detail === 'string' && detail !== '' ? detail : t('failed') })
            return
          }
          const now = latest.current
          if (now.draftRev !== started.draftRev || now.phase !== started.phase) {
            setStatus({ kind: 'error', text: t('changed') })
            return
          }
          const value = settled.value
          if (value === undefined) {
            setStatus({ kind: 'error', text: t('failed') })
            return
          }
          const result = value.result
          if (result?.kind === 'success' && typeof result.text === 'string' && result.text.trim() !== '') {
            inputActions.setDraft(result.text)
            setStatus({ kind: 'success', text: t('success') })
            return
          }
          setStatus({
            kind: 'error',
            text: result?.kind === 'error' && typeof result.text === 'string' && result.text !== ''
              ? result.text
              : t('failed'),
          })
        } catch (error) {
          if (!alive.current) return
          setStatus({
            kind: 'error',
            text: error instanceof Error && error.message !== '' ? error.message : t('failed'),
          })
        } finally {
          clearTimeout(timer)
          if (alive.current) setBusy(false)
        }
      }, [busy, draft, inputActions, locked, sessionId, getCommands, t])

      const label = busy ? t('busy') : status?.kind === 'success' ? t('success') : status?.kind === 'error' ? t('failed') : t('label')
      const title = busy
        ? t('busyHint')
        : status?.kind === 'error'
          ? status.text + '\n' + t('failedHint')
          : status?.kind === 'success'
            ? t('success')
            : locked
              ? t('lockedHint')
              : empty
                ? t('emptyHint')
                : t('readyHint')

      const tone = status?.kind === 'error'
        ? 'var(--dsw-alias-state-error-primary)'
        : status?.kind === 'success'
          ? 'var(--dsw-alias-state-success-primary)'
          : busy
            ? 'var(--dsw-alias-label-primary)'
            : 'var(--dsw-alias-label-secondary)'

      return h(React.Fragment, null,
        h('style', { key: 'prompt-polish-focus' }, FOCUS_CSS),
        h('button', {
          key: 'prompt-polish-button',
          type: 'button',
          title,
          'aria-label': label,
          'aria-busy': busy ? 'true' : undefined,
          'aria-live': 'polite',
          'data-prompt-polish': '',
          disabled,
          onMouseDown: (event) => { event.preventDefault() },
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
          onClick: run,
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            height: '28px',
            padding: '0 8px',
            margin: '0 2px',
            border: 0,
            borderRadius: '8px',
            background: hover && !disabled ? HOVER_TINT : 'transparent',
            color: tone,
            font: 'inherit',
            fontSize: '13px',
            lineHeight: '20px',
            whiteSpace: 'nowrap',
            cursor: disabled ? 'default' : 'pointer',
            opacity: busy ? 0.75 : disabled ? 0.5 : 1,
            transition: 'background 120ms ease, color 120ms ease, opacity 120ms ease',
          },
        }, h('span', { style: { display: 'inline-flex', opacity: busy ? 0.6 : 1 } }, SPARKLE),
        h('span', null, label)))
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICTS))
        const t = ctx.locale.bind(NS)

        // The command namespace is a Child Service of the Client app; resolve it
        // lazily so a missing namespace disables the action instead of the button.
        let commands
        try {
          commands = ctx.get('remote.commands')
        } catch {
          commands = undefined
        }
        ctx.inject(['remote.commands'], (child) => {
          commands = child.remote?.commands ?? child.get('remote.commands')
        })

        ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
          name: 'conversation.input.right',
          id: 'prompt-polish',
          order: 0,
        }, (props) => h(PolishButton, {
          ...props,
          getCommands: () => commands,
          t,
          locale: ctx.locale,
        })))

        // Own the `polish` command row: it renders nothing, so a rewrite never
        // appears in the conversation flow.
        ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register({
          name: 'conversation.chat.commandview',
          key: COMMAND,
        }, () => null))
      },
    }
  },
})
