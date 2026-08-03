import type { LoginResult, User } from "../models/user";
import { request } from "../services/request";

export const authApi = {
  login(username: string, password: string) {
    return request<LoginResult>("/auth/login", {
      method: "POST",
      data: { username, password },
      skipAuth: true,
      skipRefresh: true
    });
  },

  me() {
    return request<{ user: User }>("/auth/me");
  },

  logout() {
    return request<void>("/auth/logout", { method: "POST" });
  },

  changePassword(oldPassword: string, newPassword: string) {
    return request<void>("/auth/password", {
      method: "PUT",
      data: { oldPassword, newPassword }
    });
  }
};
