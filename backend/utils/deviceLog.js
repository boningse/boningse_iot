const normalizeDeviceLogEntry = (entry, persistVerboseLogs = false) => {
  const level = String(entry?.level || 'info').toLowerCase();
  const isRoutineMqttLog = entry?.data?.source === 'mqtt'
    && ['info', 'debug'].includes(level);

  if (!persistVerboseLogs && isRoutineMqttLog) {
    return { ...entry, level: 'debug' };
  }
  return entry;
};

module.exports = { normalizeDeviceLogEntry };
