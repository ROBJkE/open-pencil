export type SaveDecision = 'finish' | 'cancel'

export type EditorSaveAnswer = SaveDecision | 'timeout'

/**
 * The software-update window owns no documents. A restart asks the editor to
 * finish or cancel saves first. A clean editor restarts without a prompt.
 */
export async function decideRestart(options: {
  dirty: boolean
  askEditor: () => Promise<EditorSaveAnswer>
  askNative: () => Promise<SaveDecision>
}): Promise<SaveDecision> {
  if (!options.dirty) return 'finish'
  const answer = await options.askEditor()
  if (answer === 'finish' || answer === 'cancel') return answer
  return options.askNative()
}
