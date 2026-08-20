export type EnvironmentName = "production" | "development";

const current: EnvironmentName = "production";

const environments = {
  production: {
    apiBaseUrl: "https://bnyk.boningse.com/api",
    websocketUrl: "wss://bnyk.boningse.com/ws"
  },
  development: {
    apiBaseUrl: "http://192.168.10.155/api",
    websocketUrl: "ws://192.168.10.155/ws"
  }
} as const;

export const env = {
  name: current,
  ...environments[current],
  requestTimeout: 15000,
  controlConfirmTimeout: 12000,
  pageSize: 20
};
