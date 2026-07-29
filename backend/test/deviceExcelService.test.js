const XLSX = require('@e965/xlsx');
const {
  CLEAR_VALUE,
  buildWorkbook,
  parseWorkbook
} = require('../services/deviceExcelService');

describe('deviceExcelService', () => {
  test('generates import and instruction sheets', () => {
    const workbook = XLSX.read(buildWorkbook(), { type: 'buffer' });

    expect(workbook.SheetNames).toEqual(['设备导入', '填写说明']);
    const headers = XLSX.utils.sheet_to_json(workbook.Sheets['设备导入'], {
      header: 1
    })[0];
    expect(headers).toEqual(expect.arrayContaining([
      '系统ID',
      '设备名称',
      '设备ID',
      'IMEI',
      '所属租户',
      '设备类型',
      '厂商编号'
    ]));
  });

  test('keeps identifiers as text during a workbook round trip', () => {
    const buffer = buildWorkbook([{
      id: '25cdf4e8-eabc-40fb-a343-8daacfdfc550',
      name: '批量设备',
      device_id: 'AbC001',
      imei: '00001234',
      tenant: '测试租户',
      device_type: '定时开关',
      manufacturer_code: 'BNSE',
      location: CLEAR_VALUE
    }]);

    expect(parseWorkbook(buffer)).toEqual([expect.objectContaining({
      rowNumber: 2,
      name: '批量设备',
      device_id: 'AbC001',
      imei: '00001234',
      location: CLEAR_VALUE
    })]);
  });
});
