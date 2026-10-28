export class RecoveryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RecoveryError'
  }
}
