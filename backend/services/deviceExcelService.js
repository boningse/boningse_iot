const XLSX = require('@e965/xlsx');

const IMPORT_SHEET_NAME = '设备导入';
const CLEAR_VALUE = '【清空】';

const columns = [
  { header: '系统ID', key: 'id', width: 38, required: false, description: '修改设备时的首选匹配字段；新增设备请留空' },
  { header: '设备名称', key: 'name', width: 24, required: true, description: '新增时必填；修改时留空表示保持原值' },
  { header: '设备ID', key: 'device_id', width: 26, required: false, description: '设备唯一编号，可填写数字或大小写字母' },
  { header: 'IMEI', key: 'imei', width: 26, required: false, description: '设备通信编号；没有独立 IMEI 时可与设备ID相同' },
  { header: '所属租户', key: 'tenant', width: 22, required: true, description: '填写租户名称或租户编号；非 admin 账号固定使用当前租户' },
  { header: '所属建筑', key: 'building', width: 22, required: false, description: `填写同租户下的建筑名称或编号；填写${CLEAR_VALUE}可清除` },
  { header: '所属分组', key: 'group', width: 22, required: false, description: `填写同租户下的分组名称或编号；填写${CLEAR_VALUE}可清除` },
  { header: '设备类型', key: 'device_type', width: 24, required: true, description: '填写设备类型名称或编号' },
  { header: '设备分类', key: 'device_category', width: 16, required: false, description: '独立设备、网关或子设备；新增时默认独立设备' },
  { header: '厂商编号', key: 'manufacturer_code', width: 20, required: true, description: '填写厂商编号或厂商名称' },
  { header: '协议名称', key: 'protocol', width: 28, required: false, description: `填写协议名称或系统ID；填写${CLEAR_VALUE}可清除` },
  { header: '上级网关设备ID', key: 'parent_device', width: 28, required: false, description: `子设备必填，填写上级网关的设备ID、IMEI或系统ID；填写${CLEAR_VALUE}可清除` },
  { header: '子设备序号', key: 'sub_device_sequence', width: 16, required: false, description: '子设备必填，同一网关下不能重复' },
  { header: '设备状态', key: 'status', width: 14, required: false, description: '在线、离线、故障或维护；新增时默认离线' },
  { header: '安装位置', key: 'location', width: 28, required: false, description: `留空保持原值；填写${CLEAR_VALUE}可清除` },
  { header: '描述', key: 'description', width: 36, required: false, description: `留空保持原值；填写${CLEAR_VALUE}可清除` }
];

const headerMap = new Map(columns.map((column) => [column.header, column.key]));

const normalizeCell = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const rowsToWorksheet = (rows) => {
  const data = rows.map((row) => {
    const output = {};
    for (const column of columns) {
      output[column.header] = row[column.key] ?? '';
    }
    return output;
  });
  const worksheet = XLSX.utils.json_to_sheet(data, {
    header: columns.map((column) => column.header),
    skipHeader: false
  });
  worksheet['!cols'] = columns.map((column) => ({ wch: column.width }));
  return worksheet;
};

const buildWorkbook = (rows = []) => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, rowsToWorksheet(rows), IMPORT_SHEET_NAME);

  const instructions = columns.map((column) => ({
    字段: column.header,
    新增要求: column.required ? '必填' : '选填',
    填写说明: column.description
  }));
  const instructionSheet = XLSX.utils.json_to_sheet(instructions);
  instructionSheet['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 76 }];
  XLSX.utils.book_append_sheet(workbook, instructionSheet, '填写说明');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

const parseWorkbook = (buffer) => {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: false,
    cellText: true,
    dense: false
  });
  const sheetName = workbook.SheetNames.includes(IMPORT_SHEET_NAME)
    ? IMPORT_SHEET_NAME
    : workbook.SheetNames[0];
  if (!sheetName) throw new Error('Excel 文件中没有可读取的工作表');

  const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: '',
    raw: false,
    blankrows: false
  });

  return rawRows
    .map((rawRow, index) => {
      const row = { rowNumber: index + 2 };
      for (const [header, value] of Object.entries(rawRow)) {
        const key = headerMap.get(normalizeCell(header));
        if (key) row[key] = normalizeCell(value);
      }
      return row;
    })
    .filter((row) => columns.some((column) => normalizeCell(row[column.key])));
};

module.exports = {
  CLEAR_VALUE,
  buildWorkbook,
  parseWorkbook
};
