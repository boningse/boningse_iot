export interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

export interface Pagination {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PageResult<T> {
  list: T[];
  pagination: Pagination;
}

export type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue>;
