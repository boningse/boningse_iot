interface IAppOption {
  globalData: {
    unreadCount: number;
  };
  refreshUnreadCount?: () => Promise<void>;
  handleWorkOrderUpdate?: () => Promise<void>;
  refreshVisibleWorkOrderPage?: () => Promise<void>;
  activateWorkOrderSync?: () => void;
  deactivateWorkOrderSync?: () => void;
  startWorkOrderPolling?: () => void;
  stopWorkOrderPolling?: () => void;
  workOrderPollTimer?: number | null;
}

declare namespace WechatMiniprogram {
  interface Wx {
    env: {
      USER_DATA_PATH: string;
    };
  }
}
