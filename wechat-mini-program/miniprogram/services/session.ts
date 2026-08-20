import type { LoginResult, User } from "../models/user";

const ACCESS_TOKEN = "accessToken";
const REFRESH_TOKEN = "refreshToken";
const USER_PROFILE = "userProfile";
const LOGIN_EXPIRES_AT = "loginExpiresAt";
const LOGIN_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export const session = {
  getAccessToken(): string {
    return wx.getStorageSync(ACCESS_TOKEN) || "";
  },

  getRefreshToken(): string {
    return wx.getStorageSync(REFRESH_TOKEN) || "";
  },

  getUser(): User | null {
    return wx.getStorageSync(USER_PROFILE) || null;
  },

  hasToken(): boolean {
    const expiresAt = Number(wx.getStorageSync(LOGIN_EXPIRES_AT));
    if (!this.getAccessToken() || !Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
      this.clear();
      return false;
    }
    return true;
  },

  saveLogin(result: LoginResult) {
    wx.setStorageSync(ACCESS_TOKEN, result.token);
    wx.setStorageSync(REFRESH_TOKEN, result.refreshToken);
    wx.setStorageSync(USER_PROFILE, result.user);
    wx.setStorageSync(LOGIN_EXPIRES_AT, Date.now() + LOGIN_DURATION_MS);
  },

  saveAccessToken(token: string) {
    wx.setStorageSync(ACCESS_TOKEN, token);
  },

  saveUser(user: User) {
    wx.setStorageSync(USER_PROFILE, user);
  },

  clear() {
    wx.removeStorageSync(ACCESS_TOKEN);
    wx.removeStorageSync(REFRESH_TOKEN);
    wx.removeStorageSync(USER_PROFILE);
    wx.removeStorageSync(LOGIN_EXPIRES_AT);
  }
};
