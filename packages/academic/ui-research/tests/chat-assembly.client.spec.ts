// @vitest-environment jsdom
/** Boot the shipped Web dependency closure through the production Client Loader. */
import { expect } from 'vitest'
import { bundleRoster, createClientTest, WEB_PROFILE_BUNDLES } from '@deepseek-ai/dsh-client-test-runtime/src/assembly/index.ts'
import { academicChatDefinition } from '../src/client/chat-definition.ts'

const self = '@deepseek-ai/dsh-client-ui-academic-research'
const academicWebApp = bundleRoster([...WEB_PROFILE_BUNDLES, '@deepseek-ai/dsh-academic-bundle'], undefined, {
  get: (name: string) => name === 'profileContext' ? { name: 'web' } : undefined,
})
const it = createClientTest({
  roster: academicWebApp.closure([self]),
  // The Remote namespace is built separately; this test only checks UI registrations.
  provide: { '@deepseek-ai/dsh-academic-client-remote': { apply: () => {} } },
})
it('loads academic transcript cards through the Web assembly instead of a sidebar dialog', async ({ start }) => {
  const client = await start()
  const slots = client.ctx.get('slots')!
  expect(slots.entries('conversation.chat.node').some(entry => entry.locale === 'academicRun')).toBe(true)
  expect(slots.entries('sidebar.footer.action').some(entry => entry.locale === 'academicRun')).toBe(false)
  expect(client.ctx.get('uiConversation')!.events.entries()).toContain(academicChatDefinition)
}, 30_000)
