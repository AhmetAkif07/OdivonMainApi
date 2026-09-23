import { Readable } from 'node:stream';

// google-gax consumes Node streams; Workers fetch provides Web streams.
export default async function nodeFetch(url, options) {
  const response = await globalThis.fetch(url, options);
  let body;
  return new Proxy(response, {
    get(target, key) {
      if (key === 'body') return body ??= target.body ? Readable.fromWeb(target.body) : null;
      if (key === 'buffer') return async () => Buffer.from(await target.arrayBuffer());
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export const { Headers, Request, Response } = globalThis;
