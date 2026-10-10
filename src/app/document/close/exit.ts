import { prepareForClose } from '@/app/tabs'

/** Shared approval so the window close handler and the Quit item cannot prompt twice. */
export function createExitApproval(confirmDocuments: () => Promise<boolean>) {
  let approved = false
  let confirmation: Promise<boolean> | null = null

  return {
    isApproved: () => approved,
    confirm: async (): Promise<boolean> => {
      if (approved) return true
      confirmation ??= confirmDocuments()
        .then((agreed) => {
          if (agreed) approved = true
          return agreed
        })
        .finally(() => {
          confirmation = null
        })
      return confirmation
    }
  }
}

const approval = createExitApproval(prepareForClose)

/** True once every open document agreed to close, so later requests skip the prompt. */
export function isExitApproved(): boolean {
  return approval.isApproved()
}

export function confirmAppExit(): Promise<boolean> {
  return approval.confirm()
}

export async function requestAppExit(): Promise<void> {
  await confirmAppExit()
}
