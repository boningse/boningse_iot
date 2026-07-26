import { authApi } from "../../api/auth";
import type { User } from "../../models/user";
import { session } from "../../services/session";
import { roleLabel } from "../../utils/permission";

Page({
  data: {
    user: null as User | null,
    displayName: "",
    initial: "用",
    account: "",
    tenantName: "",
    roleText: "",
    scopeText: "",
    showPasswordForm: false,
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
    saving: false
  },

  onShow() {
    this.syncLocalUser();
    void this.refreshUser();
  },

  syncLocalUser() {
    const user = session.getUser();
    if (!user) return;
    this.setData({
      user,
      displayName: user.real_name || user.profile?.real_name || user.username,
      initial: (user.real_name || user.profile?.real_name || user.username || "用").slice(0, 1),
      account: user.username,
      tenantName: user.tenant?.name || "全部租户",
      roleText: roleLabel(user.role),
      scopeText: this.scopeLabel(user)
    });
  },

  scopeLabel(user: User): string {
    if (user.role === "admin") return "所有租户";
    if (user.role === "building_user") return "指定建筑";
    if (user.role === "group_user") return "指定项目分组";
    return user.tenant?.name || "当前租户";
  },

  async refreshUser() {
    try {
      const result = await authApi.me();
      session.saveUser(result.user);
      this.syncLocalUser();
    } catch (_) {
      // The request layer handles expired sessions.
    }
  },

  togglePasswordForm() {
    this.setData({
      showPasswordForm: !this.data.showPasswordForm,
      oldPassword: "",
      newPassword: "",
      confirmPassword: ""
    });
  },

  onPasswordInput(event: WechatMiniprogram.Input) {
    const field = String(event.currentTarget.dataset.field);
    this.setData({ [field]: event.detail.value });
  },

  async changePassword() {
    const { oldPassword, newPassword, confirmPassword } = this.data;
    if (!oldPassword || !newPassword) {
      wx.showToast({ title: "请完整填写密码", icon: "none" });
      return;
    }
    if (newPassword.length < 8) {
      wx.showToast({ title: "新密码至少 8 位", icon: "none" });
      return;
    }
    if (newPassword !== confirmPassword) {
      wx.showToast({ title: "两次密码不一致", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    try {
      await authApi.changePassword(oldPassword, newPassword);
      wx.showToast({ title: "密码已更新", icon: "success" });
      this.togglePasswordForm();
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "修改失败", icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  },

  async logout() {
    const result = await wx.showModal({
      title: "退出登录",
      content: "退出后需要重新输入账号和密码。",
      confirmText: "退出",
      confirmColor: "#B33636"
    });
    if (!result.confirm) return;
    try {
      await authApi.logout();
    } catch (_) {
      // Local logout still proceeds when the server is unavailable.
    }
    session.clear();
    wx.reLaunch({ url: "/pages/login/index" });
  }
});
