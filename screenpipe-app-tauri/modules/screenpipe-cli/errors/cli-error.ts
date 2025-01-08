export class CliError extends Error {
    constructor(message: string, options?: ErrorOptions) {
      super(message, options);
    }
}
  