import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { PlatformErrorLogDoc } from '../../../shared/errors/error-log.service';

export interface QueryErrorLogsDto {
  from?: string;
  to?: string;
  status?: string;
  path?: string;
  code?: string;
  q?: string;
  page?: string;
  pageSize?: string;
}

@Injectable()
export class PlatformErrorLogsService {
  constructor(private readonly firebase: FirebaseService) {}

  private collection() {
    return this.firebase.db.collection(ROOT_COLLECTION.platformErrorLogs);
  }

  async list(query: QueryErrorLogsDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

    let q: FirebaseFirestore.Query = this.collection();

    if (query.status) {
      q = q.where('status', '==', Number(query.status));
    }
    if (query.code) {
      q = q.where('code', '==', query.code);
    }

    const snapshot = await q.get();
    let items = snapshot.docs.map((d) => d.data() as PlatformErrorLogDoc);

    if (query.from) {
      items = items.filter((l) => l.createdAt >= query.from!);
    }
    if (query.to) {
      items = items.filter((l) => l.createdAt <= query.to!);
    }
    if (query.path) {
      const p = query.path.toLowerCase();
      items = items.filter((l) => l.path?.toLowerCase().includes(p));
    }
    if (query.q) {
      const needle = query.q.toLowerCase();
      items = items.filter(
        (l) =>
          l.message?.toLowerCase().includes(needle) ||
          l.path?.toLowerCase().includes(needle) ||
          l.code?.toLowerCase().includes(needle) ||
          l.requestId?.toLowerCase().includes(needle),
      );
    }

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const total = items.length;
    const offset = (page - 1) * pageSize;
    const paged = items.slice(offset, offset + pageSize);

    return {
      items: paged,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getSummary(hours = 24) {
    const threshold = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const snapshot = await this.collection()
      .where('createdAt', '>=', threshold)
      .get();

    const items = snapshot.docs.map((d) => d.data() as PlatformErrorLogDoc);
    const totalErrors = items.length;

    const pathCounts = new Map<string, number>();
    const codeCounts = new Map<string, number>();

    for (const item of items) {
      pathCounts.set(item.path, (pathCounts.get(item.path) || 0) + 1);
      codeCounts.set(item.code, (codeCounts.get(item.code) || 0) + 1);
    }

    const topPaths = Array.from(pathCounts.entries())
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topCodes = Array.from(codeCounts.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);

    return {
      hours,
      totalErrors,
      topPaths,
      topCodes,
    };
  }
}
