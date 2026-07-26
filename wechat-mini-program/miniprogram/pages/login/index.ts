import { authApi } from "../../api/auth";
import { session } from "../../services/session";

Page({
  data: {
    username: "",
    password: "",
    passwordVisible: false,
    submitting: false
  },

  onLoad() {
    if (session.hasToken()) {
      wx.switchTab({ url: "/pages/control/index" });
    }
  },

  onUsernameInput(event: WechatMiniprogram.Input) {
    this.setData({ username: event.detail.value.trim() });
  },

  onPasswordInput(event: WechatMiniprogram.Input) {
    this.setData({ password: event.detail.value });
  },

  togglePassword() {
    this.setData({ passwordVisible: !this.data.passwordVisible });
  },

  async submit() {
    if (!this.data.username || !this.data.password) {
      wx.showToast({ title: "请输入账号和密码", icon: "none" });
      return;
    }
    if (this.data.submitting) return;

    this.setData({ submitting: true });
    try {
      const result = await authApi.login(this.data.username, this.data.password);
      session.saveLogin(result);
      wx.showToast({ title: "登录成功", icon: "success" });
      setTimeout(() => {
        wx.switchTab({ url: "/pages/control/index" });
      }, 350);
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : "登录失败",
        icon: "none"
      });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
