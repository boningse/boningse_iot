const {
  buildDa51kdCommand,
  parseDa51kdWriteAck
} = require('../utils/da51kdProtocol');

describe('DA51KD protocol', () => {
  test('builds a complete register write for a temperature change', () => {
    const command = buildDa51kdCommand(
      { action: 'set_temperature', target_temperature: 26 },
      { power_status: false, mode: 'cool', fan_speed: 'medium', target_temperature: 25 }
    );

    expect(command.hex).toBe('011001080004080000000201040002ED18');
    expect(command.state).toEqual({
      power_status: false,
      mode: 'cool',
      target_temperature: 26,
      fan_speed: 'medium'
    });
  });

  test('recognizes the device write acknowledgement', () => {
    expect(parseDa51kdWriteAck({ data: 'ARABCAAEQfQ=' })).toEqual({
      acknowledged: true,
      start_register: 0x0108,
      register_count: 4,
      raw_hex: '01100108000441F4'
    });
  });

  test('does not classify an active report as a write acknowledgement', () => {
    expect(parseDa51kdWriteAck({
      data: 'AUEBADIAAQEh/wAFsmpU61L/zQBjAAEAAgDwAAAAAAAAAAABSwAAA0EAAAAAAAAAAAAAAAAAAOT7'
    })).toBeNull();
  });
});
