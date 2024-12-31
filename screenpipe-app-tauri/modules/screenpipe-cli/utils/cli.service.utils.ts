function getSetupParams(enableBeta: boolean) {
    let args = ['setup']
    if (enableBeta) {
        args.push('--enable-beta')
    }

    return args
}

/**
 * Returns a promise that rejects after a specified time.
 * 
 * @param {number} ms - duration in milliseconds to wait before rejecting the promise.
 * @param {string} message - error message that will be used when the promise is rejected.
 * @returns {Promise<never>} a promise that rejects after the specified time with the provided error message.
 * 
 * @example
 * // Rejects after 15 minutes with the message "setup timed out"
 * const timeoutPromise = timeout(900000, "setup timed out");
 */
function timeout(ms: number, message: string) {
    return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));
  }