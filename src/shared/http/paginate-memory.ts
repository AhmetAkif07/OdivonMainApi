import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { PaginatedResult } from './paginated.result';
import { decodeCursor, encodeCursor, resolveLimit } from './paging.dto';

export function paginateInMemory<T extends { createdAt: string; id: string }>(
  items: T[],
  limit?: number,
  cursor?: string,
): PaginatedResult<T> {
  const resolved = resolveLimit(limit);
  let start = 0;
  if (cursor) {
    try {
      const payload = decodeCursor(cursor);
      const index = items.findIndex((item) => item.createdAt === payload.createdAt && item.id === payload.id);
      start = index >= 0 ? index + 1 : 0;
    } catch {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Invalid pagination cursor');
    }
  }
  const slice = items.slice(start, start + resolved + 1);
  const hasMore = slice.length > resolved;
  const page = hasMore ? slice.slice(0, resolved) : slice;
  const last = page.at(-1);
  return new PaginatedResult(
    page,
    resolved,
    hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
  );
}
