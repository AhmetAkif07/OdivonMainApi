import { LegacyRouteConverter } from '@nestjs/core/router/legacy-route-converter';
import { RouterExplorer } from '@nestjs/core/router/router-explorer';
import { ExpressAdapter } from '@nestjs/platform-express';

type RouteHandler = (req: unknown, res: unknown, next: unknown) => unknown;
type CreateCallbackProxy = (this: RouterExplorer, ...args: unknown[]) => RouteHandler;

let installed = false;

/**
 * Registering ~1100 routes is the largest part of the Worker's isolate startup, which Cloudflare
 * caps on CPU time (deploy error 10021). Two parts of it can wait or be skipped:
 *
 * - Nest builds the guard / pipe / interceptor / filter chain of every route up front. Here a
 *   route's chain is built on the first request that reaches it instead: the same chain, built
 *   later and once. Request-scoped controllers keep Nest's own per-request path.
 * - The Express adapter compiles each path with path-to-regexp only to validate it, and Express
 *   compiles it again when the route is added. The second compile throws for an invalid path
 *   just the same, so the first one is skipped.
 */
export function installFastRouteRegistration(): void {
  if (installed) return;
  installed = true;

  const explorer = RouterExplorer.prototype as unknown as { createCallbackProxy: CreateCallbackProxy };
  const createCallbackProxy = explorer.createCallbackProxy;
  explorer.createCallbackProxy = function lazyCallbackProxy(this: RouterExplorer, ...args: unknown[]) {
    // Static routes pass 5 arguments; request-scoped ones add a context id and call it right away.
    if (args.length > 5) return createCallbackProxy.apply(this, args);
    let handler: RouteHandler | null = null;
    return (req: unknown, res: unknown, next: unknown) => {
      handler ??= createCallbackProxy.apply(this, args);
      return handler(req, res, next);
    };
  };

  ExpressAdapter.prototype.normalizePath = function normalizePath(path: string): string {
    return LegacyRouteConverter.tryConvert(path);
  };
}
