import type { LoginResult, User } from "../models/user";

const ACCESS_TOKEN = "accessToken";
const REFRESH_TOKEN = "refreshToken";
const USER_PROFILE = "userProfile";

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
    return Boolean(this.getAccessToken());
  },

  saveLogin(result: LoginResult) {
    wx.setStorageSync(ACCESS_TOKEN, result.token);
    wx.setStorageSync(REFRESH_TOKEN, result.refreshToken);
    wx.setStorageSync(USER_PROFILE, result.user);
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
  }
};
