const normalizeBoolean = (value) => {
  if (value === true || value === false) return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return null;
};

/**
 * 根据协议配置把 runOn 转换为开关机状态和风机运行状态。
 * 未配置或未识别的值返回 null，避免未知状态覆盖设备最后一次有效状态。
 */
const resolveThermostatRunOnState = (value, dataParsingConfig) => {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) return null;

  const mapping = dataParsingConfig?.params_mapping?.runOn?.state_mapping;
  const configuredState = mapping?.[String(numericValue)];
  if (!configuredState || typeof configuredState !== 'object') return null;

  const powerStatus = normalizeBoolean(configuredState.power_status);
  const runningStatus = normalizeBoolean(configuredState.running_status);
  if (powerStatus === null && runningStatus === null) return null;

  return {
    power_status: powerStatus,
    running_status: runningStatus,
    label: configuredState.label || null
  };
};

module.exports = { resolveThermostatRunOnState };
