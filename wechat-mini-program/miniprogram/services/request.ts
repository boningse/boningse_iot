import { env } from "../config/env";
import type { ApiEnvelope, Query, QueryValue } from "../models/api";
import { session } from "./session";

export class ApiError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode = 0, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  data?: unknown;
  query?: Query;
  header?: Record<string, string>;
  skipAuth?: boolean;
  skipRefresh?: boolean;
  timeout?: number;
}

let refreshPromise: Promise<string> | null = null;

const encodeQuery = (query?: Query): string => {
  if (!query) return "";
  const parts = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value as QueryValue))}`);
  return parts.length ? `?${parts.join("&")}` : "";
};

const requestId = (): string => {
  const random = Math.random().toString(16).slice(2);
  return `wx-${Date.now()}-${random}`;
};

const rawRequest = <T>(
  path: string,
  options: RequestOptions = {}
): Promise<WechatMiniprogram.RequestSuccessCallbackResult<ApiEnvelope<T>>> => {
  const token = session.getAccessToken();
  return new Promise((resolve, reject) => {
    wx.request<ApiEnvelope<T>>({
      url: `${env.apiBaseUrl}${path}${encodeQuery(options.query)}`,
      method: (options.method || "GET") as WechatMiniprogram.RequestOption["method"],
      data: options.data as WechatMiniprogram.IAnyObject,
      timeout: options.timeout || env.requestTimeout,
      header: {
        "Content-Type": "application/json",
        "X-Client-Type": "mini_program",
        "X-Request-ID": requestId(),
        ...(!options.skipAuth && token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.header || {})
      },
      success: resolve,
      fail: (error) => reject(new ApiError(error.errMsg || "网络连接失败"))
    });
  });
};

const refreshAccessToken = async (): Promise<string> => {
  if (refreshPromise) return refreshPromise;
  const refreshToken = session.getRefreshToken();
  if (!refreshToken) throw new ApiError("登录已过期", 401);

  refreshPromise = (async () => {
    const response = await rawRequest<{ token: string }>("/auth/refresh", {
      method: "POST",
      data: { refreshToken },
      skipAuth: true,
      skipRefresh: true
    });
    const token = response.data?.data?.token;
    if (response.statusCode !== 200 || !response.data?.success || !token) {
      throw new ApiError(response.data?.message || "登录已过期", response.statusCode);
    }
    session.saveAccessToken(token);
    return token;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
};

const redirectToLogin = () => {
  session.clear();
  const pages = getCurrentPages();
  const current = pages[pages.length - 1]?.route;
  if (current !== "pages/login/index") {
    wx.reLaunch({ url: "/pages/login/index" });
  }
};

export const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  let response = await rawRequest<T>(path, options);

  if (response.statusCode === 401 && !options.skipAuth && !options.skipRefresh) {
    try {
      await refreshAccessToken();
      response = await rawRequest<T>(path, { ...options, skipRefresh: true });
    } catch (error) {
      redirectToLogin();
      throw error;
    }
  }

  const envelope = response.data;
  if (response.statusCode < 200 || response.statusCode >= 300 || !envelope?.success) {
    if (response.statusCode === 401) redirectToLogin();
    throw new ApiError(envelope?.message || "请求失败", response.statusCode, envelope);
  }

  return envelope.data as T;
};

export const absoluteApiUrl = (path: string): string => (
  path.startsWith("http") ? path : `${env.apiBaseUrl.replace(/\/api$/, "")}${path}`
);
