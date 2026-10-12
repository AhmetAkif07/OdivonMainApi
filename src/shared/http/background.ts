type WaitUntil = (promise: Promise<unknown>) => void;

let waitUntil: WaitUntil | null = null;

/** The Worker entry registers its `waitUntil`; on a Node server there is nothing to register. */
export function setBackgroundRunner(runner: WaitUntil | null): void {
  waitUntil = runner;
}

/**
 * Keeps work that a request starts without awaiting (welcome and verification mails) alive after
 * the response is sent. A Cloudflare Worker cancels such work when the response ends unless it is
 * handed to `waitUntil`; a Node server just lets it finish.
 */
export function runInBackground<T>(work: Promise<T>): Promise<T> {
  try {
    waitUntil?.(work.catch(() => undefined));
  } catch {
    // Outside a request (startup, tests) there is no context to extend.
  }
  return work;
}
