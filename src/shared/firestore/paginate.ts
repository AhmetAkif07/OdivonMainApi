import { Query } from 'firebase-admin/firestore';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { decodeCursor, encodeCursor, resolveLimit } from '../http/paging.dto';
import { PaginatedResult } from '../http/paginated.result';
import { BaseDocument } from './base-document';

export async function paginateQuery<T extends BaseDocument>(
  query: Query,
  limit?: number,
  cursor?: string,
): Promise<PaginatedResult<T>> {
  const resolved = resolveLimit(limit);
  let q: Query = query.orderBy('createdAt', 'desc').orderBy('id', 'desc').limit(resolved + 1);
  if (cursor) {
    try {
      const payload = decodeCursor(cursor);
      q = q.startAfter(payload.createdAt, payload.id);
    } catch {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Invalid pagination cursor');
    }
  }
  const snapshot = await q.get();
  const docs = snapshot.docs.map((doc) => doc.data() as T);
  const hasMore = docs.length > resolved;
  const items = hasMore ? docs.slice(0, resolved) : docs;
  const last = items.at(-1);
  const nextCursor =
    hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null;
  return new PaginatedResult(items, resolved, nextCursor);
}
