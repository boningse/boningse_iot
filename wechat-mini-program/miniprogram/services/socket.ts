import { env } from "../config/env";
import { session } from "./session";

type SocketListener = (payload: unknown) => void;

class RealtimeService {
  private task: WechatMiniprogram.SocketTask | null = null;
  private listeners = new Map<string, Set<SocketListener>>();
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private reconnectCount = 0;
  private manuallyClosed = false;

  connect() {
    if (this.task || !session.hasToken()) return;
    this.manuallyClosed = false;
    const separator = env.websocketUrl.includes("?") ? "&" : "?";
    const url = `${env.websocketUrl}${separator}token=${encodeURIComponent(session.getAccessToken())}`;
    this.task = wx.connectSocket({
      url,
      header: {
        Authorization: `Bearer ${session.getAccessToken()}`
      }
    });

    this.task.onOpen(() => {
      this.reconnectCount = 0;
      this.send({
        type: "subscribe",
        topics: [
          "device_status_update",
          "device_offline",
          "device_data",
          "device_response",
          "device_event",
          "lighting_switch_status",
          "work_order_updated",
          "work_order_assigned"
        ]
      });
      this.startHeartbeat();
      this.emit("connected", null);
    });

    this.task.onMessage((event) => {
      try {
        const message = JSON.parse(String(event.data)) as { type?: string; payload?: unknown };
        if (message.type) this.emit(message.type, message.payload);
      } catch (_) {
        // Ignore malformed external messages.
      }
    });

    this.task.onClose(() => {
      this.task = null;
      this.stopHeartbeat();
      this.emit("disconnected", null);
      if (!this.manuallyClosed) this.scheduleReconnect();
    });

    this.task.onError(() => {
      this.emit("error", null);
    });
  }

  disconnect() {
    this.manuallyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopHeartbeat();
    this.task?.close({ code: 1000, reason: "page hidden" });
    this.task = null;
  }

  on(type: string, listener: SocketListener) {
    const set = this.listeners.get(type) || new Set<SocketListener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  off(type: string, listener: SocketListener) {
    this.listeners.get(type)?.delete(listener);
  }

  private emit(type: string, payload: unknown) {
    this.listeners.get(type)?.forEach((listener) => listener(payload));
  }

  private send(payload: unknown) {
    this.task?.send({ data: JSON.stringify(payload) });
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: "ping", timestamp: Date.now() });
    }, 30000) as unknown as number;
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private scheduleReconnect() {
    if (this.reconnectCount >= 5 || this.reconnectTimer) return;
    const delay = Math.min(3000 * (2 ** this.reconnectCount), 30000);
    this.reconnectCount += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay) as unknown as number;
  }
}

export const realtime = new RealtimeService();
