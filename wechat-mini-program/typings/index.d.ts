interface IAppOption {
  globalData: {
    unreadCount: number;
  };
  refreshUnreadCount?: () => Promise<void>;
}

declare namespace WechatMiniprogram {
  interface Wx {
    env: {
      USER_DATA_PATH: string;
    };
  }
}
