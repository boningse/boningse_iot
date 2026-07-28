const BREAKER_CLOSED_FLAG = 0x20;

const parseZqcSwitchStatus = (item = {}) => {
  const flags = Number(item.flags);
  if (!Number.isInteger(flags)) return null;

  const powerStatus = (flags & BREAKER_CLOSED_FLAG) !== 0;
  return {
    power_status: powerStatus,
    breaker_state: powerStatus ? 'closed' : 'open'
  };
};

module.exports = {
  BREAKER_CLOSED_FLAG,
  parseZqcSwitchStatus
};
