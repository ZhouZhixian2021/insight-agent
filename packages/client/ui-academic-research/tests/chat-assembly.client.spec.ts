// @vitest-environment jsdom
/** Boot the shipped Web dependency closure through the production Client Loader. */
import { expect } from 'vitest'
import { createClientTest, webApp } from '@deepseek-ai/dsh-client-test-runtime/src/assembly/index.ts'
import { academicChatDefinition } from '../src/client/chat-definition.ts'

const self = '@deepseek-ai/dsh-client-ui-academic-research'
const it = createClientTest({ roster: webApp.closure([self]) })
it('loads academic transcript cards through the Web assembly instead of a sidebar dialog', async ({ start }) => {
  const client = await start()
  const slots = client.ctx.get('slots')!
  expect(slots.entries('conversation.chat.node').some(entry => entry.locale === 'academicRun')).toBe(true)
  expect(slots.entries('sidebar.footer.action').some(entry => entry.locale === 'academicRun')).toBe(false)
  expect(client.ctx.get('uiConversation')!.events.entries()).toContain(academicChatDefinition)
})
