export class PaginatedResult<T> {
  constructor(
    public readonly items: T[],
    public readonly limit: number,
    public readonly nextCursor: string | null,
  ) {}
}
