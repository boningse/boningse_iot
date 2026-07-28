const {
  BREAKER_CLOSED_FLAG,
  parseZqcSwitchStatus
} = require('../utils/zqcSwitchProtocol');

describe('ZQC V200 switch status', () => {
  test('reads the breaker closed bit from flags', () => {
    expect(BREAKER_CLOSED_FLAG).toBe(0x20);
    expect(parseZqcSwitchStatus({ flags: 164 })).toEqual({
      power_status: true,
      breaker_state: 'closed'
    });
    expect(parseZqcSwitchStatus({ flags: 132 })).toEqual({
      power_status: false,
      breaker_state: 'open'
    });
  });

  test('ignores payloads without a valid flags value', () => {
    expect(parseZqcSwitchStatus({})).toBeNull();
    expect(parseZqcSwitchStatus({ flags: 'invalid' })).toBeNull();
  });
});
