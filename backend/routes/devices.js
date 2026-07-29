const express = require('express');
const multer = require('multer');
const { Op, QueryTypes } = require('sequelize');
const {
  Device,
  DeviceData,
  DeviceLog,
  Tenant,
  User,
  DeviceType,
  Manufacturer,
  ProtocolConfig,
  sequelize
} = require('../models');
const { authenticateToken, checkPermission } = require('../middleware/auth');
const { validateDevice, validateDeviceUpdate } = require('../middleware/validation');
const mqttService = require('../services/mqttService');
const mqttConfigService = require('../services/mqttConfigService');
const websocketService = require('../services/websocketService');
const {
  CLEAR_VALUE,
  buildWorkbook,
  parseWorkbook
} = require('../services/deviceExcelService');

const router = express.Router();
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    const fileName = String(file.originalname || '').toLowerCase();
    if (!fileName.endsWith('.xlsx')) {
      return callback(new Error('只支持 .xlsx 格式的 Excel 文件'));
    }
    callback(null, true);
  }
});

const categoryLabels = {
  standalone: '独立设备',
  gateway: '网关',
  sub_device: '子设备'
};
const categoryValues = {
  '独立设备': 'standalone',
  '独立': 'standalone',
  standalone: 'standalone',
  '网关': 'gateway',
  '网关设备': 'gateway',
  gateway: 'gateway',
  '子设备': 'sub_device',
  sub_device: 'sub_device'
};
const statusLabels = {
  online: '在线',
  offline: '离线',
  fault: '故障',
  error: '故障',
  maintenance: '维护'
};
const statusValues = {
  '在线': 'online',
  online: 'online',
  '离线': 'offline',
  offline: 'offline',
  '故障': 'fault',
  fault: 'fault',
  error: 'fault',
  '维护': 'maintenance',
  maintenance: 'maintenance'
};

const normalizeText = (value) => (
  value === undefined || value === null ? '' : String(value).trim()
);
const normalizeLookup = (value) => normalizeText(value).toLocaleLowerCase('zh-CN');
const hasValue = (value) => normalizeText(value) !== '';
const isClearValue = (value) => normalizeText(value) === CLEAR_VALUE;

const makeLookup = (items, keys, scopeKey = null) => {
  const lookup = new Map();
  for (const item of items) {
    const scope = scopeKey ? `${item[scopeKey]}|` : '';
    for (const key of keys) {
      const value = normalizeLookup(item[key]);
      if (!value) continue;
      const lookupKey = `${scope}${value}`;
      if (!lookup.has(lookupKey)) {
        lookup.set(lookupKey, item);
        continue;
      }
      const existing = lookup.get(lookupKey);
      if (existing === false) continue;
      else if (existing.id !== item.id) lookup.set(lookupKey, false);
    }
  }
  return lookup;
};

const resolveLookup = (lookup, value, label, scope = '') => {
  const item = lookup.get(`${scope}${normalizeLookup(value)}`);
  if (!item) throw new Error(`${label}“${value}”不存在或名称不唯一`);
  return item;
};

const buildExportWhere = (req) => {
  const where = {};
  if (req.user.role !== 'admin') {
    where.tenant_id = req.user.tenant_id;
  } else if (req.query.tenantId) {
    where.tenant_id = req.query.tenantId;
  }
  if (req.query.keyword) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${req.query.keyword}%` } },
      { device_id: { [Op.iLike]: `%${req.query.keyword}%` } },
      { imei: { [Op.iLike]: `%${req.query.keyword}%` } }
    ];
  }
  if (req.query.status) where.status = req.query.status === 'error' ? 'fault' : req.query.status;
  if (req.query.type) where.device_type_id = req.query.type;
  if (req.query.buildingId) where.project_building_id = req.query.buildingId;
  if (req.query.projectGroupId) where.project_group_id = req.query.projectGroupId;
  return where;
};

/**
 * 获取设备列表
 * GET /api/devices
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 1000,
      keyword,
      status,
      type,
      tenantId,
      buildingId,
      projectGroupId,
      isThermostat,
      isLighting,
      isSwitch,
      isAirConditioner,
      excludeGateways
    } = req.query;

    const offset = (page - 1) * pageSize;
    const limit = parseInt(pageSize);

    // 构建查询条件
    const where = {};

    // 根据用户角色过滤数据
    if (req.user.role !== 'admin') {
      where.tenant_id = req.user.tenant_id;
    } else if (tenantId) {
      where.tenant_id = tenantId;
    }

    // 关键字搜索
    if (keyword) {
      where[Op.or] = [
        { name: { [Op.like]: `%${keyword}%` } },
        { imei: { [Op.like]: `%${keyword}%` } }
      ];
    }

    // 状态过滤
    if (status) {
      where.status = status;
    }

    if (buildingId) {
      where.project_building_id = buildingId;
    }

    if (projectGroupId) {
      where.project_group_id = projectGroupId;
    }

    const controlFlagFilters = [
      ['is_thermostat', isThermostat ?? req.query.is_thermostat],
      ['is_lighting', isLighting ?? req.query.is_lighting],
      ['is_switch', isSwitch ?? req.query.is_switch],
      ['is_air_conditioner', isAirConditioner ?? req.query.is_air_conditioner]
    ];
    let hasControlFlagFilter = false;
    for (const [field, value] of controlFlagFilters) {
      if (value !== undefined && value !== '') {
        where[field] = String(value).toLowerCase() === 'true';
        hasControlFlagFilter = true;
      }
    }

    if (hasControlFlagFilter || String(excludeGateways).toLowerCase() === 'true') {
      where.device_category = { [Op.ne]: 'gateway' };
    }

    // 类型过滤
    if (type) {
      where.device_type_id = type;
    }

    // 设备类型名称过滤（用于前端API调用）
    let deviceTypeFilter = null;
    if (req.query.device_type) {
      const deviceType = await DeviceType.findOne({
        where: { name: req.query.device_type }
      });
      if (deviceType) {
        where.device_type_id = deviceType.id;
      }
    }

    // 查询设备列表
    const { count, rows } = await Device.findAndCountAll({
      where,
      attributes: {
        include: [
          [
            sequelize.literal('(SELECT name FROM project_buildings WHERE project_buildings.id = "Device"."project_building_id")'),
            'project_building_name'
          ],
          [
            sequelize.literal('(SELECT name FROM project_groups WHERE project_groups.id = "Device"."project_group_id")'),
            'project_group_name'
          ]
        ]
      },
      include: [
        {
          model: Tenant,
          as: 'tenant',
          attributes: ['id', 'name', 'type']
        },
        {
          model: DeviceType,
          as: 'device_type',
          attributes: ['id', 'name', 'description']
        },
        {
          model: Manufacturer,
          as: 'manufacturer',
          attributes: ['id', 'name', 'code', 'subscription_type']
        },
        {
          model: Device,
          as: 'parent_device',
          attributes: ['id', 'name', 'device_id', 'imei'],
          required: false
        }
      ],
      order: [['created_at', 'DESC']],
      offset,
      limit
    });

    res.json({
      success: true,
      data: {
        list: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          pageSize: limit,
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('获取设备列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取设备列表失败',
      error: error.message
    });
  }
});

/**
 * 获取网关设备列表
 * GET /api/devices/gateways
 */
router.get('/gateways', authenticateToken, async (req, res) => {
  try {
    // 构建查询条件
    const where = {
      device_category: 'gateway'
    };

    // 根据用户角色过滤数据
    if (req.user.role !== 'admin') {
      where.tenant_id = req.user.tenant_id;
    }

    // 查询网关设备列表
    const gateways = await Device.findAll({
      where,
      include: [
        {
          model: Tenant,
          as: 'tenant',
          attributes: ['id', 'name', 'type']
        },
        {
          model: DeviceType,
          as: 'device_type',
          attributes: ['id', 'name', 'description']
        },
        {
          model: Manufacturer,
          as: 'manufacturer',
          attributes: ['id', 'name', 'code', 'subscription_type']
        }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: gateways
    });

  } catch (error) {
    console.error('获取网关设备列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取网关设备列表失败',
      error: error.message
    });
  }
});

/**
 * 下载设备批量导入模板
 * GET /api/devices/import-template
 */
router.get('/import-template', authenticateToken, (req, res) => {
  try {
    const buffer = buildWorkbook();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="device-import-template.xlsx"; filename*=UTF-8''${encodeURIComponent('设备批量导入模板.xlsx')}`
    );
    res.send(buffer);
  } catch (error) {
    console.error('生成设备导入模板失败:', error);
    res.status(500).json({ success: false, message: '生成设备导入模板失败', error: error.message });
  }
});

/**
 * 按当前筛选条件导出设备
 * GET /api/devices/export
 */
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const devices = await Device.findAll({
      where: buildExportWhere(req),
      attributes: {
        include: [
          [
            sequelize.literal('(SELECT name FROM project_buildings WHERE project_buildings.id = "Device"."project_building_id")'),
            'project_building_name'
          ],
          [
            sequelize.literal('(SELECT name FROM project_groups WHERE project_groups.id = "Device"."project_group_id")'),
            'project_group_name'
          ]
        ]
      },
      include: [
        { model: Tenant, as: 'tenant', attributes: ['id', 'name', 'code'] },
        { model: DeviceType, as: 'device_type', attributes: ['id', 'name', 'code'] },
        { model: Manufacturer, as: 'manufacturer', attributes: ['id', 'name', 'code'] },
        { model: ProtocolConfig, as: 'protocol_config', attributes: ['id', 'name'], required: false },
        { model: Device, as: 'parent_device', attributes: ['id', 'device_id', 'imei'], required: false }
      ],
      order: [['created_at', 'DESC']]
    });

    const rows = devices.map((device) => ({
      id: device.id,
      name: device.name,
      device_id: device.device_id,
      imei: device.imei,
      tenant: device.tenant?.name || device.tenant_id,
      building: device.get('project_building_name') || '',
      group: device.get('project_group_name') || '',
      device_type: device.device_type?.name || device.device_type_id,
      device_category: categoryLabels[device.device_category] || device.device_category,
      manufacturer_code: device.manufacturer_code,
      protocol: device.protocol_config?.name || '',
      parent_device: device.parent_device?.device_id || device.parent_device?.imei || '',
      sub_device_sequence: device.sub_device_sequence ?? '',
      status: statusLabels[device.status] || device.status,
      location: device.location || '',
      description: device.description || ''
    }));

    const buffer = buildWorkbook(rows);
    const date = new Date().toISOString().slice(0, 10);
    const fileName = `设备清单-${date}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="devices-${date}.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    res.send(buffer);
  } catch (error) {
    console.error('导出设备失败:', error);
    res.status(500).json({ success: false, message: '导出设备失败', error: error.message });
  }
});

/**
 * 批量新增或更新设备
 * POST /api/devices/import
 */
router.post('/import', authenticateToken, excelUpload.single('file'), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, message: '请选择要导入的 Excel 文件' });
    }

    const rows = parseWorkbook(req.file.buffer);
    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: '导入文件中没有设备数据' });
    }
    if (rows.length > 5000) {
      return res.status(400).json({ success: false, message: '单次最多导入 5000 台设备' });
    }

    const [
      tenants,
      deviceTypes,
      manufacturers,
      protocols,
      buildingsResult,
      groupsResult,
      existingDevices
    ] = await Promise.all([
      Tenant.findAll({ attributes: ['id', 'name', 'code'] }),
      DeviceType.findAll({ attributes: ['id', 'name', 'code'] }),
      Manufacturer.findAll({ attributes: ['id', 'name', 'code'] }),
      ProtocolConfig.findAll({ attributes: ['id', 'name', 'manufacturer_code', 'tenant_id'] }),
      sequelize.query(
        'SELECT id, tenant_id, name, code FROM project_buildings WHERE is_active = true',
        { type: QueryTypes.SELECT }
      ),
      sequelize.query(
        'SELECT id, tenant_id, building_id, name, code FROM project_groups WHERE is_active = true',
        { type: QueryTypes.SELECT }
      ),
      Device.findAll({
        attributes: [
          'id',
          'name',
          'device_id',
          'imei',
          'tenant_id',
          'device_type_id',
          'manufacturer_code',
          'protocol_config_id',
          'device_category',
          'parent_device_id',
          'project_building_id',
          'project_group_id',
          'sub_device_sequence',
          'status',
          'location',
          'description'
        ]
      })
    ]);

    const tenantLookup = makeLookup(tenants.map((item) => item.get({ plain: true })), ['id', 'name', 'code']);
    const typeLookup = makeLookup(deviceTypes.map((item) => item.get({ plain: true })), ['id', 'name', 'code']);
    const manufacturerLookup = makeLookup(
      manufacturers.map((item) => item.get({ plain: true })),
      ['id', 'name', 'code']
    );
    const buildingLookup = makeLookup(buildingsResult, ['id', 'name', 'code'], 'tenant_id');
    const groupLookup = makeLookup(groupsResult, ['id', 'name', 'code'], 'tenant_id');
    const protocolItems = protocols.map((item) => item.get({ plain: true }));
    const deviceItems = existingDevices.map((item) => item.get({ plain: true }));
    const devicesById = new Map(deviceItems.map((item) => [item.id, item]));
    const devicesByDeviceId = new Map();
    const devicesByImei = new Map();

    const registerDeviceLookup = (item) => {
      if (item.device_id) devicesByDeviceId.set(item.device_id, item);
      if (item.imei) {
        const matches = devicesByImei.get(item.imei) || [];
        if (!matches.some((match) => match.id === item.id)) matches.push(item);
        devicesByImei.set(item.imei, matches);
      }
      devicesById.set(item.id, item);
    };
    deviceItems.forEach(registerDeviceLookup);

    const findExistingDevice = (row) => {
      if (row.id) {
        const matched = devicesById.get(row.id);
        if (!matched) throw new Error(`系统ID“${row.id}”不存在`);
        return matched;
      }
      const byDeviceId = row.device_id ? devicesByDeviceId.get(row.device_id) : null;
      const imeiMatches = row.imei ? (devicesByImei.get(row.imei) || []) : [];
      const visibleImeiMatches = imeiMatches.filter((item) => (
        req.user.role === 'admin' || item.tenant_id === req.user.tenant_id
      ));
      if (visibleImeiMatches.length > 1 && !byDeviceId) {
        throw new Error('IMEI 对应多个子设备，请填写系统ID或设备ID进行匹配');
      }
      const byImei = visibleImeiMatches[0] || null;
      if (byDeviceId && byImei && byDeviceId.id !== byImei.id) {
        throw new Error('设备ID与IMEI分别匹配到不同设备');
      }
      return byDeviceId || byImei;
    };

    const resolveProtocol = (value, manufacturerCode, tenantId) => {
      if (!hasValue(value)) return null;
      const normalized = normalizeLookup(value);
      const candidates = protocolItems.filter((item) => (
        [item.id, item.name].some((field) => normalizeLookup(field) === normalized)
        && item.manufacturer_code === manufacturerCode
        && (!item.tenant_id || item.tenant_id === tenantId)
      ));
      const tenantProtocol = candidates.find((item) => item.tenant_id === tenantId);
      if (tenantProtocol) return tenantProtocol;
      if (candidates.length === 1) return candidates[0];
      throw new Error(`协议“${value}”不存在、厂商不匹配或名称不唯一`);
    };

    const resolveGateway = (value, tenantId) => {
      const matches = deviceItems.filter((item) => (
        item.tenant_id === tenantId
        && item.device_category === 'gateway'
        && [item.id, item.device_id, item.imei].some((field) => field && field === value)
      ));
      if (matches.length !== 1) throw new Error(`上级网关“${value}”不存在或不唯一`);
      return matches[0];
    };

    const results = { total: rows.length, created: 0, updated: 0, failed: 0, errors: [] };

    for (const row of rows) {
      try {
        const existing = findExistingDevice(row);
        if (existing && req.user.role !== 'admin' && existing.tenant_id !== req.user.tenant_id) {
          throw new Error('无权修改该设备');
        }

        let tenant;
        if (req.user.role !== 'admin') {
          tenant = tenants.find((item) => item.id === req.user.tenant_id)?.get({ plain: true });
          if (!tenant) throw new Error('当前账号未绑定有效租户');
        } else if (hasValue(row.tenant)) {
          tenant = resolveLookup(tenantLookup, row.tenant, '所属租户');
        } else if (existing) {
          tenant = tenants.find((item) => item.id === existing.tenant_id)?.get({ plain: true });
        } else {
          throw new Error('新增设备必须填写所属租户');
        }

        const next = { ...(existing || {}) };
        next.tenant_id = tenant.id;

        if (hasValue(row.name)) next.name = row.name;
        if (!existing && !hasValue(next.name)) throw new Error('新增设备必须填写设备名称');
        if (next.name.length < 2 || next.name.length > 100) throw new Error('设备名称长度必须为 2-100 个字符');

        if (hasValue(row.device_type)) {
          next.device_type_id = resolveLookup(typeLookup, row.device_type, '设备类型').id;
        }
        if (!existing && !next.device_type_id) throw new Error('新增设备必须填写设备类型');
        const selectedType = deviceTypes.find((item) => item.id === next.device_type_id)?.get({ plain: true });

        if (hasValue(row.device_category)) {
          next.device_category = categoryValues[normalizeLookup(row.device_category)];
          if (!next.device_category) throw new Error(`设备分类“${row.device_category}”无效`);
        } else if (!existing) {
          next.device_category = selectedType?.name?.includes('网关') ? 'gateway' : 'standalone';
        }

        if (hasValue(row.manufacturer_code)) {
          next.manufacturer_code = resolveLookup(
            manufacturerLookup,
            row.manufacturer_code,
            '厂商'
          ).code;
        }
        if (!existing && !next.manufacturer_code) throw new Error('新增设备必须填写厂商编号');

        if (hasValue(row.status)) {
          next.status = statusValues[normalizeLookup(row.status)];
          if (!next.status) throw new Error(`设备状态“${row.status}”无效`);
        } else if (!existing) {
          next.status = 'offline';
        }

        if (hasValue(row.building)) {
          next.project_building_id = isClearValue(row.building)
            ? null
            : resolveLookup(buildingLookup, row.building, '所属建筑', `${tenant.id}|`).id;
        }
        let selectedGroup = null;
        if (hasValue(row.group)) {
          if (isClearValue(row.group)) {
            next.project_group_id = null;
          } else {
            selectedGroup = resolveLookup(groupLookup, row.group, '所属分组', `${tenant.id}|`);
            next.project_group_id = selectedGroup.id;
            if (!next.project_building_id) next.project_building_id = selectedGroup.building_id;
            if (next.project_building_id && selectedGroup.building_id !== next.project_building_id) {
              throw new Error('所属分组不属于填写的建筑');
            }
          }
        }

        if (hasValue(row.protocol)) {
          next.protocol_config_id = isClearValue(row.protocol)
            ? null
            : resolveProtocol(row.protocol, next.manufacturer_code, tenant.id).id;
        }

        if (hasValue(row.location)) next.location = isClearValue(row.location) ? null : row.location;
        if (hasValue(row.description)) next.description = isClearValue(row.description) ? null : row.description;

        if (hasValue(row.device_id)) next.device_id = row.device_id;
        if (hasValue(row.imei)) next.imei = row.imei;

        let parent = null;
        if (hasValue(row.parent_device)) {
          next.parent_device_id = isClearValue(row.parent_device)
            ? null
            : resolveGateway(row.parent_device, tenant.id).id;
        }
        if (next.parent_device_id) parent = devicesById.get(next.parent_device_id);

        if (hasValue(row.sub_device_sequence)) {
          const sequence = Number(row.sub_device_sequence);
          if (!Number.isInteger(sequence) || sequence < 1) {
            throw new Error('子设备序号必须是大于 0 的整数');
          }
          next.sub_device_sequence = sequence;
        }

        if (next.device_category === 'sub_device') {
          if (!parent) throw new Error('子设备必须填写有效的上级网关设备ID');
          if (!next.sub_device_sequence) throw new Error('子设备必须填写子设备序号');
          if (!next.device_id) {
            next.device_id = `${parent.device_id}-${String(next.sub_device_sequence).padStart(2, '0')}`;
          }
          if (!next.imei) next.imei = parent.imei || parent.device_id;
        } else {
          next.parent_device_id = null;
          next.sub_device_sequence = null;
          if (!next.device_id && next.imei) next.device_id = next.imei;
          if (!next.imei && next.device_id) next.imei = next.device_id;
          if (!next.device_id || !next.imei) throw new Error('新增设备必须填写设备ID或IMEI');
        }

        if (!/^[0-9a-zA-Z_-]+$/.test(next.device_id) || next.device_id.length > 100) {
          throw new Error('设备ID只能包含数字、大小写字母、下划线或连字符，且最多 100 位');
        }
        if (next.imei && (!/^[0-9a-zA-Z_-]+$/.test(next.imei) || next.imei.length > 255)) {
          throw new Error('IMEI只能包含数字、大小写字母、下划线或连字符，且最多 255 位');
        }

        const duplicateDeviceId = devicesByDeviceId.get(next.device_id);
        if (duplicateDeviceId && duplicateDeviceId.id !== existing?.id) {
          throw new Error(`设备ID“${next.device_id}”已存在`);
        }
        if (next.device_category !== 'sub_device') {
          const duplicateImei = (devicesByImei.get(next.imei) || [])
            .find((item) => item.id !== existing?.id && item.device_category !== 'sub_device');
          if (duplicateImei) throw new Error(`IMEI“${next.imei}”已存在`);
        }
        if (next.device_category === 'sub_device') {
          const duplicateSequence = deviceItems.find((item) => (
            item.id !== existing?.id
            && item.parent_device_id === next.parent_device_id
            && Number(item.sub_device_sequence) === Number(next.sub_device_sequence)
          ));
          if (duplicateSequence) {
            throw new Error(`上级网关下的子设备序号 ${next.sub_device_sequence} 已存在`);
          }
        }

        const writableFields = [
          'name',
          'device_id',
          'imei',
          'tenant_id',
          'device_type_id',
          'manufacturer_code',
          'protocol_config_id',
          'device_category',
          'parent_device_id',
          'project_building_id',
          'project_group_id',
          'sub_device_sequence',
          'status',
          'location',
          'description'
        ];
        const payload = Object.fromEntries(writableFields.map((key) => [key, next[key] ?? null]));

        const previousDeviceId = existing?.device_id;
        const previousImei = existing?.imei;
        const savedDevice = await sequelize.transaction(async (transaction) => {
          let device;
          if (existing) {
            device = await Device.findByPk(existing.id, { transaction });
            await device.update(payload, { transaction });
          } else {
            device = await Device.create(
              { ...payload, created_by: req.user.id },
              { transaction }
            );
          }

          if (!existing && selectedType?.name === '空调温控器') {
            await sequelize.query(`
              INSERT INTO thermostat_properties (
                device_id, current_temperature, target_temp, ac_mode, power_status, created_at, updated_at
              )
              VALUES (:deviceId, 25.0, 24.0, 'cool', false, NOW(), NOW())
              ON CONFLICT (device_id) DO NOTHING
            `, { replacements: { deviceId: device.id }, transaction });
          }

          await DeviceLog.create({
            device_id: device.id,
            log_type: 'info',
            message: existing ? '通过 Excel 批量更新设备' : '通过 Excel 批量创建设备',
            details: mqttService.sanitizeDataForStorage({
              operator: req.user.username,
              import_row: row.rowNumber
            }),
            timestamp: new Date()
          }, { transaction });
          return device;
        });

        const plainDevice = savedDevice.get({ plain: true });
        if (existing) {
          if (previousDeviceId && previousDeviceId !== plainDevice.device_id) {
            devicesByDeviceId.delete(previousDeviceId);
          }
          if (previousImei && previousImei !== plainDevice.imei) {
            const oldMatches = (devicesByImei.get(previousImei) || [])
              .filter((item) => item.id !== plainDevice.id);
            if (oldMatches.length) devicesByImei.set(previousImei, oldMatches);
            else devicesByImei.delete(previousImei);
          }
          Object.assign(existing, plainDevice);
          results.updated += 1;
        } else {
          deviceItems.push(plainDevice);
          results.created += 1;
        }
        registerDeviceLookup(plainDevice);

        if (!existing) {
          try {
            const fullDevice = await Device.findByPk(savedDevice.id, {
              include: [
                { model: Manufacturer, as: 'manufacturer' },
                {
                  model: Device,
                  as: 'parent_device',
                  attributes: ['id', 'name', 'device_id', 'imei', 'device_category'],
                  required: false
                }
              ]
            });
            const generatedConfig = mqttConfigService.buildDeviceConfig(fullDevice);
            await fullDevice.update({ mqtt_config: generatedConfig });
            await mqttService.subscribeNewDevice(fullDevice);
          } catch (mqttError) {
            console.error(`导入设备 ${plainDevice.device_id} 后初始化 MQTT 失败:`, mqttError);
          }
        }

        try {
          websocketService.broadcastToTenant(
            plainDevice.tenant_id,
            existing ? 'device_updated' : 'device_created',
            plainDevice
          );
        } catch (broadcastError) {
          console.error(`广播导入设备 ${plainDevice.device_id} 变更失败:`, broadcastError);
        }
      } catch (error) {
        results.failed += 1;
        results.errors.push({
          row: row.rowNumber,
          device: row.name || row.device_id || row.imei || '',
          message: error.message
        });
      }
    }

    const httpStatus = results.failed === results.total ? 400 : 200;
    res.status(httpStatus).json({
      success: results.failed < results.total,
      message: `导入完成：新增 ${results.created} 台，更新 ${results.updated} 台，失败 ${results.failed} 行`,
      data: results
    });
  } catch (error) {
    console.error('批量导入设备失败:', error);
    res.status(400).json({ success: false, message: '批量导入设备失败', error: error.message });
  }
});

/**
 * 获取设备详情
 * GET /api/devices/:id
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const device = await Device.findByPk(id, {
      include: [
        {
          model: Tenant,
          as: 'tenant',
          attributes: ['id', 'name', 'type', 'contact_person']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'profile']
        },
        {
          model: Manufacturer,
          as: 'manufacturer',
          attributes: ['id', 'name', 'code', 'subscription_type']
        }
      ]
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    // 权限检查
    if (req.user.role !== 'admin' && device.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权访问该设备'
      });
    }

    res.json({
      success: true,
      data: device
    });

  } catch (error) {
    console.error('获取设备详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取设备详情失败',
      error: error.message
    });
  }
});

/**
 * 检查IMEI是否存在
 * GET /api/devices/check-imei/:imei
 */
router.get('/check-imei/:imei', authenticateToken, async (req, res) => {
  try {
    const { imei } = req.params;

    if (!imei) {
      return res.status(400).json({
        success: false,
        message: 'IMEI参数不能为空'
      });
    }

    const existingDevice = await Device.findOne({
      where: { imei: imei },
      attributes: {
        exclude: ['device_category']  // 排除有问题的字段
      }
    });

    res.json({
      success: true,
      exists: !!existingDevice,
      message: existingDevice ? 'IMEI已存在' : 'IMEI可用'
    });
  } catch (error) {
    console.error('检查IMEI失败:', error);
    res.status(500).json({
      success: false,
      message: '检查IMEI失败',
      error: error.message
    });
  }
});

/**
 * 创建设备
 * POST /api/devices
 */
router.post('/', authenticateToken, validateDevice, async (req, res) => {
  try {
    const deviceData = {
      ...req.body,
      created_by: req.user.id
    };

    deviceData.project_building_id = deviceData.project_building_id || null;
    deviceData.project_group_id = deviceData.project_group_id || null;

    // 处理设备分类和父设备关系
    // 如果没有提供device_category，根据设备类型名称自动判断
    if (!deviceData.device_category && deviceData.device_type_id) {
      const deviceType = await DeviceType.findByPk(deviceData.device_type_id);
      if (deviceType && deviceType.name) {
        if (deviceType.name.includes('网关')) {
          deviceData.device_category = 'gateway';
        } else {
          deviceData.device_category = 'standalone';
        }
      } else {
        deviceData.device_category = 'standalone';
      }
    } else if (!deviceData.device_category) {
      // 如果既没有提供device_category也没有device_type_id，默认为独立设备
      deviceData.device_category = 'standalone';
    }

    if (deviceData.device_category) {
      // 验证设备分类
      const validCategories = ['standalone', 'gateway', 'sub_device'];
      if (!validCategories.includes(deviceData.device_category)) {
        return res.status(400).json({
          success: false,
          message: '无效的设备分类'
        });
      }

      // 如果是子设备，必须指定父设备
      if (deviceData.device_category === 'sub_device') {
        if (!deviceData.parent_device_id) {
          return res.status(400).json({
            success: false,
            message: '子设备必须指定父设备'
          });
        }

        // 验证父设备是否存在且为网关设备
        const parentDevice = await Device.findByPk(deviceData.parent_device_id);
        if (!parentDevice) {
          return res.status(400).json({
            success: false,
            message: '指定的父设备不存在'
          });
        }

        if (parentDevice.device_category !== 'gateway') {
          return res.status(400).json({
            success: false,
            message: '父设备必须是网关设备'
          });
        }

        // 权限检查：确保父设备属于同一租户
        if (req.user.role !== 'admin') {
          if (parentDevice.tenant_id !== req.user.tenant_id) {
            return res.status(403).json({
              success: false,
              message: '无权访问指定的父设备'
            });
          }
          // 子设备必须与父设备在同一租户
          deviceData.tenant_id = parentDevice.tenant_id;
        }

        // 验证子设备序号唯一性
        if (deviceData.sub_device_sequence) {
          const existingSubDevice = await Device.findOne({
            where: {
              parent_device_id: deviceData.parent_device_id,
              sub_device_sequence: deviceData.sub_device_sequence
            }
          });

          if (existingSubDevice) {
            return res.status(400).json({
              success: false,
              message: `子设备序号 ${deviceData.sub_device_sequence} 在该网关下已存在，请使用其他序号`
            });
          }
        }
      } else {
        // 非子设备不能有父设备
        deviceData.parent_device_id = null;
      }
    }

    // 处理mqtt_config字段格式转换
    if (deviceData.mqtt_config) {
      const mqttConfig = deviceData.mqtt_config;

      // 转换前端简化格式为系统标准格式
      if (mqttConfig.subscribe_topic || mqttConfig.subscribeTopic) {
        mqttConfig.subscribe_topics = [mqttConfig.subscribe_topic || mqttConfig.subscribeTopic].filter(Boolean);
      }

      if (mqttConfig.publish_topic || mqttConfig.publishTopic) {
        mqttConfig.publish_topics = [mqttConfig.publish_topic || mqttConfig.publishTopic].filter(Boolean);
      }

      // 保持兼容性，同时保留原字段
      if (mqttConfig.subscription_type || mqttConfig.subscriptionType) {
        mqttConfig.subscription_type = mqttConfig.subscription_type || mqttConfig.subscriptionType;
      }

      deviceData.mqtt_config = mqttConfig;
    }

    // 如果不是管理员，只能在自己的租户下创建设备
    if (req.user.role !== 'admin') {
      deviceData.tenant_id = req.user.tenant_id;
    } else {
      // 如果是admin用户但没有指定tenant_id，需要明确指定一个租户
      if (!deviceData.tenant_id) {
        return res.status(400).json({
          success: false,
          message: '管理员添加设备时必须指定租户ID',
          code: 'TENANT_ID_REQUIRED'
        });
      }
    }

    // 处理子设备的IMEI和device_id逻辑
    if (deviceData.device_category === 'sub_device') {
      // 子设备可以没有IMEI，但需要生成唯一的device_id
      if (!deviceData.imei) {
        // 获取父设备信息
        const parentDevice = await Device.findByPk(deviceData.parent_device_id);
        if (!parentDevice) {
          return res.status(400).json({
            success: false,
            message: '指定的父设备不存在'
          });
        }

        // 查找同一父设备下的子设备数量，生成序号
        const siblingCount = await Device.count({
          where: {
            parent_device_id: deviceData.parent_device_id,
            device_category: 'sub_device'
          }
        });

        // 生成虚拟IMEI和device_id
        const subDeviceSequence = String(siblingCount + 1).padStart(2, '0');
        const virtualImei = `${parentDevice.imei || parentDevice.device_id}-${subDeviceSequence}`;
        
        // 检查生成的虚拟IMEI是否已存在
        const existingVirtualDevice = await Device.findOne({
          where: { imei: virtualImei }
        });

        if (existingVirtualDevice) {
          // 如果存在，尝试下一个序号
          let nextSequence = siblingCount + 2;
          let nextVirtualImei;
          do {
            const seqStr = String(nextSequence).padStart(2, '0');
            nextVirtualImei = `${parentDevice.imei || parentDevice.device_id}-${seqStr}`;
            const existingNext = await Device.findOne({
              where: { imei: nextVirtualImei }
            });
            if (!existingNext) break;
            nextSequence++;
          } while (nextSequence < 100); // 最多尝试100个序号

          if (nextSequence >= 100) {
            return res.status(400).json({
              success: false,
              message: '无法为子设备生成唯一的虚拟IMEI'
            });
          }
          virtualImei = nextVirtualImei;
        }

        deviceData.imei = virtualImei;
        deviceData.device_id = virtualImei;
      } else {
        // 子设备提供了IMEI，需要检查唯一性
        const existingDeviceByImei = await Device.findOne({
          where: { imei: deviceData.imei }
        });

        if (existingDeviceByImei) {
          // 获取父设备信息
          const parentDevice = await Device.findByPk(deviceData.parent_device_id);
          
          if (!parentDevice) {
            return res.status(400).json({
              success: false,
              message: '指定的父设备不存在'
            });
          }
          
          // 如果IMEI已存在，检查是否属于父级网关设备
          if (existingDeviceByImei.id === parentDevice.id && 
              existingDeviceByImei.device_category === 'gateway') {
            // 允许子设备使用与父级网关相同的IMEI
            console.log(`子设备允许使用父级网关的IMEI: ${deviceData.imei}`);
          } else {
            // IMEI属于其他设备，不允许使用
            return res.status(400).json({
              success: false,
              message: `IMEI已存在，属于其他设备。子设备只能使用其父网关的IMEI (${parentDevice.imei || parentDevice.device_id})`
            });
          }
        }

        // 设置device_id - 对于子设备，使用特殊格式避免与父设备冲突
        if (!deviceData.device_id) {
          // 为子设备生成唯一的device_id，格式：父设备IMEI-子设备序号
          const parentDevice = await Device.findByPk(deviceData.parent_device_id);
          if (parentDevice && deviceData.sub_device_sequence) {
            deviceData.device_id = `${parentDevice.imei || parentDevice.device_id}-${String(deviceData.sub_device_sequence).padStart(2, '0')}`;
          } else {
            deviceData.device_id = deviceData.imei;
          }
        }
      }
    } else {
      // 非子设备的原有逻辑
      // 设置device_id，如果没有提供则使用IMEI
      if (!deviceData.device_id && deviceData.imei) {
        deviceData.device_id = deviceData.imei;
      }

      // 检查IMEI是否已存在
      if (deviceData.imei) {
        const existingDeviceByImei = await Device.findOne({
          where: { imei: deviceData.imei }
        });

        if (existingDeviceByImei) {
          return res.status(400).json({
            success: false,
            message: 'IMEI已存在'
          });
        }
      }
    }

    // 检查device_id是否已存在
    if (deviceData.device_id) {
      const existingDeviceById = await Device.findOne({
        where: { device_id: deviceData.device_id }
      });

      if (existingDeviceById) {
        return res.status(400).json({
          success: false,
          message: '设备ID已存在'
        });
      }
    }

    // 设备数量限制已移除 - 租户可以添加任意数量的设备

    const device = await Device.create(deviceData);

    // 空调温控器无论是独立设备还是网关子设备，都需要初始化温控属性，
    // 否则温控控制页面不会将其识别为可控温控器。
    try {
      const createdDeviceType = await DeviceType.findByPk(deviceData.device_type_id);
      if (createdDeviceType?.name === '空调温控器') {
        await sequelize.query(`
          INSERT INTO thermostat_properties (
            device_id, current_temperature, target_temp, ac_mode, power_status, created_at, updated_at
          )
          VALUES (:deviceId, 25.0, 24.0, 'cool', false, NOW(), NOW())
          ON CONFLICT (device_id) DO NOTHING
        `, {
          replacements: { deviceId: device.id }
        });
      }
    } catch (thermostatInitError) {
      console.error('初始化温控器属性失败:', thermostatInitError);
    }

    // 获取完整的设备信息
    const fullDevice = await Device.findByPk(device.id, {
      include: [
        {
          model: Tenant,
          as: 'tenant',
          attributes: ['id', 'name', 'type']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'profile']
        },
        {
          model: Manufacturer,
          as: 'manufacturer',
          attributes: ['id', 'name', 'code', 'subscription_type']
        },
        {
          model: Device,
          as: 'parent_device',
          attributes: ['id', 'name', 'device_id', 'imei', 'device_category']
        }
      ]
    });

    // 初始化设备的MQTT配置
    try {
      // 如果前端没有提供mqtt_config或配置不完整，则使用系统默认配置
      if (!fullDevice.mqtt_config ||
        (!fullDevice.mqtt_config.subscribe_topics && !fullDevice.mqtt_config.subscribe_topic && !fullDevice.mqtt_config.subscribeTopic)) {
        const mqttConfig = mqttConfigService.buildDeviceConfig(fullDevice);

        // 如果前端提供了部分配置，则合并配置
        if (fullDevice.mqtt_config) {
          const mergedConfig = { ...mqttConfig, ...fullDevice.mqtt_config };
          await fullDevice.update({ mqtt_config: mergedConfig });
        } else {
          await fullDevice.update({ mqtt_config: mqttConfig });
        }

        console.log(`设备 ${fullDevice.device_id} MQTT配置已初始化:`, {
          manufacturer: fullDevice.manufacturer?.code,
          subscription_type: fullDevice.manufacturer?.subscription_type,
          subscribe_topics: (fullDevice.mqtt_config?.subscribe_topics || mqttConfig.subscribe_topics)?.map(t => t.topic || t)
        });
      }
    } catch (error) {
      console.error('初始化设备MQTT配置失败:', error);
      // 不阻断设备创建流程，只记录错误
    }

    // 为新设备订阅MQTT命令主题
    try {
      if (mqttService) {
        await mqttService.subscribeNewDevice(fullDevice);
      }
    } catch (subscribeError) {
      console.error('为新设备订阅MQTT主题失败:', {
        deviceId: fullDevice.device_id,
        error: subscribeError.message
      });
      // 不影响设备创建流程，只记录错误
    }

    // 记录创建日志
    const logMessage = deviceData.device_category === 'sub_device' 
      ? `子设备创建成功，父设备: ${fullDevice.parent_device?.name || deviceData.parent_device_id}`
      : '设备创建成功';
    
    await DeviceLog.create({
      device_id: device.id,
      log_type: 'info',
      message: logMessage,
      details: mqttService.sanitizeDataForStorage({ 
        creator: req.user.username,
        device_category: deviceData.device_category,
        parent_device_id: deviceData.parent_device_id
      }),
      timestamp: new Date()
    });

    // 设置30分钟后自动将设备状态改为offline
    setTimeout(async () => {
      try {
        const deviceToUpdate = await Device.findByPk(device.id);
        if (deviceToUpdate && deviceToUpdate.status === 'online') {
          await deviceToUpdate.update({ status: 'offline' });
          
          // 记录状态变更日志
          await DeviceLog.create({
            device_id: device.id,
            log_type: 'info',
            message: '设备状态自动变更为离线（30分钟超时）',
            details: { previous_status: 'online', new_status: 'offline', reason: 'auto_timeout' },
            timestamp: new Date()
          });
          
          // 通过WebSocket通知状态变更
          websocketService.broadcastToTenant(device.tenant_id, 'device_status_changed', {
            device_id: device.id,
            status: 'offline',
            reason: 'auto_timeout'
          });
          
          console.log(`设备 ${device.device_id} 已自动设置为离线状态（30分钟超时）`);
        }
      } catch (error) {
        console.error('自动设置设备离线状态失败:', error);
      }
    }, 30 * 60 * 1000); // 30分钟

    res.status(201).json({
      success: true,
      message: '设备创建成功',
      data: fullDevice
    });

  } catch (error) {
    console.error('创建设备失败:', error);
    
    // 处理数据库约束错误
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors[0]?.path;
      let message = '设备创建失败';
      
      if (field === 'imei') {
        message = 'IMEI已存在';
      } else if (field === 'device_id') {
        message = '设备ID已存在';
      }
      
      return res.status(400).json({
        success: false,
        message
      });
    }

    res.status(500).json({
      success: false,
      message: '设备创建失败',
      error: error.message
    });
  }
});

/**
 * 更新设备
 * PUT /api/devices/:id
 */
router.put('/:id', authenticateToken, validateDeviceUpdate, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    if (Object.prototype.hasOwnProperty.call(updateData, 'project_building_id')) {
      updateData.project_building_id = updateData.project_building_id || null;
    }
    if (Object.prototype.hasOwnProperty.call(updateData, 'project_group_id')) {
      updateData.project_group_id = updateData.project_group_id || null;
    }

    const device = await Device.findByPk(id);
    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    // 权限检查
    if (req.user.role !== 'admin' && device.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权修改该设备'
      });
    }

    // 如果更新IMEI，检查是否重复
    if (updateData.imei && updateData.imei !== device.imei) {
      const existingDevice = await Device.findOne({
        where: {
          imei: updateData.imei,
          id: { [Op.ne]: id }
        }
      });

      if (existingDevice) {
        return res.status(400).json({
          success: false,
          message: 'IMEI已存在'
        });
      }
    }

    // 如果更新device_id，检查是否重复
    if (updateData.device_id && updateData.device_id !== device.device_id) {
      const existingDeviceById = await Device.findOne({
        where: {
          device_id: updateData.device_id,
          id: { [Op.ne]: id }
        }
      });

      if (existingDeviceById) {
        return res.status(400).json({
          success: false,
          message: '设备ID已存在'
        });
      }
    }

    // 如果更新了device_type_id，需要重新判断device_category
    if (updateData.device_type_id && updateData.device_type_id !== device.device_type_id) {
      const deviceType = await DeviceType.findByPk(updateData.device_type_id);
      if (deviceType && deviceType.name) {
        if (deviceType.name.includes('网关')) {
          updateData.device_category = 'gateway';
        } else if (!updateData.device_category) {
          // 只有在没有明确指定device_category时才自动设置为standalone
          updateData.device_category = 'standalone';
        }
      }
    }

    // 处理mqtt_config字段格式转换
    if (updateData.mqtt_config) {
      const mqttConfig = updateData.mqtt_config;

      // 转换前端简化格式为系统标准格式
      if (mqttConfig.subscribe_topic || mqttConfig.subscribeTopic) {
        mqttConfig.subscribe_topics = [mqttConfig.subscribe_topic || mqttConfig.subscribeTopic].filter(Boolean);
      }

      if (mqttConfig.publish_topic || mqttConfig.publishTopic) {
        mqttConfig.publish_topics = [mqttConfig.publish_topic || mqttConfig.publishTopic].filter(Boolean);
      }

      // 保持兼容性，同时保留原字段
      if (mqttConfig.subscription_type || mqttConfig.subscriptionType) {
        mqttConfig.subscription_type = mqttConfig.subscription_type || mqttConfig.subscriptionType;
      }

      updateData.mqtt_config = mqttConfig;
    }

    await device.update(updateData);

    // 如果更新了mqtt_config，清除缓存以确保获取最新配置
    if (updateData.mqtt_config) {
      const mqttConfigService = require('../services/mqttConfigService');
      mqttConfigService.clearDeviceCache(device.device_id);
    }

    // 获取更新后的完整设备信息
    const updatedDevice = await Device.findByPk(id, {
      include: [
        {
          model: Tenant,
          as: 'tenant',
          attributes: ['id', 'name', 'type']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'profile']
        },
        {
          model: Manufacturer,
          as: 'manufacturer',
          attributes: ['id', 'name', 'code', 'subscription_type']
        }
      ]
    });

    // 记录更新日志
    await DeviceLog.create({
      device_id: device.id,
      log_type: 'info',
      message: '设备信息更新',
      details: mqttService.sanitizeDataForStorage({
        updater: req.user.username,
        changes: updateData
      }),
      timestamp: new Date()
    });

    // 通过WebSocket通知
    websocketService.broadcastToTenant(device.tenant_id, 'device_updated', updatedDevice);

    res.json({
      success: true,
      message: '设备更新成功',
      data: updatedDevice
    });

  } catch (error) {
    console.error('更新设备失败:', error);
    res.status(500).json({
      success: false,
      message: '更新设备失败',
      error: error.message
    });
  }
});

/**
 * 删除设备
 * DELETE /api/devices/:id
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const device = await Device.findByPk(id, {
      include: [{
        model: Manufacturer,
        as: 'manufacturer',
        attributes: ['code', 'subscription_type']
      }]
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    // 权限检查
    if (req.user.role !== 'admin' && device.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权删除该设备'
      });
    }

    // 取消设备的MQTT订阅
    try {
      if (mqttService) {
        await mqttService.unsubscribeDevice(device);
      }
    } catch (unsubscribeError) {
      console.error('取消设备MQTT订阅失败:', {
        deviceId: device.device_id,
        error: unsubscribeError.message
      });
      // 不影响设备删除流程，只记录错误
    }

    // 记录删除日志
    await DeviceLog.create({
      device_id: device.id,
      log_type: 'warning',
      message: '设备被删除',
      details: {
        deleter: req.user.username,
        device_info: {
          name: device.name,
          imei: device.imei
        }
      },
      timestamp: new Date()
    });

    await device.destroy();

    // 通过WebSocket通知
    websocketService.broadcastToTenant(device.tenant_id, 'device_deleted', {
      id: device.id,
      name: device.name,
      imei: device.imei
    });

    res.json({
      success: true,
      message: '设备删除成功'
    });

  } catch (error) {
    console.error('删除设备失败:', error);
    res.status(500).json({
      success: false,
      message: '删除设备失败',
      error: error.message
    });
  }
});

/**
 * 获取设备数据
 * GET /api/devices/:id/data
 */
router.get('/:id/data', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      page = 1,
      pageSize = 50,
      dataType,
      startTime,
      endTime
    } = req.query;

    const device = await Device.findByPk(id, {
      attributes: {
        exclude: ['device_category']  // 排除有问题的字段
      }
    });
    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    // 权限检查
    if (req.user.role !== 'admin' && device.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权访问该设备数据'
      });
    }

    const offset = (page - 1) * pageSize;
    const limit = parseInt(pageSize);

    // 构建查询条件
    const where = { device_id: id };

    if (dataType) {
      where.data_type = dataType;
    }

    if (startTime && endTime) {
      where.timestamp = {
        [Op.between]: [new Date(startTime), new Date(endTime)]
      };
    } else if (startTime) {
      where.timestamp = {
        [Op.gte]: new Date(startTime)
      };
    } else if (endTime) {
      where.timestamp = {
        [Op.lte]: new Date(endTime)
      };
    }

    const { count, rows } = await DeviceData.findAndCountAll({
      where,
      order: [['timestamp', 'DESC']],
      offset,
      limit
    });

    res.json({
      success: true,
      data: {
        list: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          pageSize: limit,
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('获取设备数据失败:', error);
    res.status(500).json({
      success: false,
      message: '获取设备数据失败',
      error: error.message
    });
  }
});

/**
 * 获取设备日志
 * GET /api/devices/:id/logs
 */
router.get('/:id/logs', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      page = 1,
      pageSize = 20,
      logType,
      level,
      startTime,
      endTime
    } = req.query;

    const device = await Device.findByPk(id, {
      attributes: {
        exclude: ['device_category']  // 排除有问题的字段
      }
    });
    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    // 权限检查
    if (req.user.role !== 'admin' && device.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权访问该设备日志'
      });
    }

    const offset = (page - 1) * pageSize;
    const limit = parseInt(pageSize);

    // 构建查询条件
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const where = {
      device_id: id,
      timestamp: { [Op.gte]: startOfToday }
    };

    if (level) {
      where.level = level;
    }

    if (logType) {
      const messageKeywords = {
        online: ['上线', '连接', 'online'],
        offline: ['下线', '离线', 'offline'],
        data: ['数据', 'data'],
        heartbeat: ['心跳', 'heartbeat'],
        command: ['命令', '发送', 'command'],
        error: ['错误', '失败', 'error']
      };
      const keywords = messageKeywords[logType] || [logType];
      where[Op.and] = [{
        [Op.or]: [
          sequelize.where(sequelize.json('data.messageType'), logType),
          ...keywords.map(keyword => ({
            message: { [Op.iLike]: `%${keyword}%` }
          }))
        ]
      }];
    }

    if (startTime && endTime) {
      const requestedStart = new Date(startTime);
      const requestedEnd = new Date(endTime);
      const effectiveStart = requestedStart > startOfToday
        ? requestedStart
        : startOfToday;
      where.timestamp = {
        [Op.between]: [effectiveStart, requestedEnd]
      };
    } else if (startTime) {
      const requestedStart = new Date(startTime);
      where.timestamp = {
        [Op.gte]: requestedStart > startOfToday
          ? requestedStart
          : startOfToday
      };
    } else if (endTime) {
      where.timestamp = {
        [Op.between]: [startOfToday, new Date(endTime)]
      };
    }

    const { count, rows } = await DeviceLog.findAndCountAll({
      where,
      order: [['timestamp', 'DESC']],
      offset,
      limit
    });

    res.json({
      success: true,
      data: {
        list: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          pageSize: limit,
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('获取设备日志失败:', error);
    res.status(500).json({
      success: false,
      message: '获取设备日志失败',
      error: error.message
    });
  }
});

/**
 * 发送命令到设备
 * POST /api/devices/:id/command
 */
router.post('/:id/command', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { command, params, timestamp, mqttTopic } = req.body;

    const device = await Device.findByPk(id);
    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    // 权限检查
    if (req.user.role !== 'admin' && device.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权控制该设备'
      });
    }

    // 检查设备是否在线（允许离线设备发送命令，但给出警告）
    let statusWarning = null;
    if (device.status !== 'online') {
      statusWarning = '设备当前离线，命令可能无法送达';
    }

    // 直接发送原始命令，不进行任何封装
    let commandData;
    if (typeof command === 'string') {
      // 尝试解析为JSON，如果成功则发送解析后的对象，否则发送原始字符串
      try {
        commandData = JSON.parse(command);
      } catch (parseError) {
        commandData = command;
      }
    } else {
      // 直接使用原始命令对象
      commandData = command;
    }

    // 发送MQTT命令，调试场景允许前端指定本次发送主题
    if (mqttTopic && typeof commandData === 'object' && commandData !== null) {
      commandData.mqttTopic = mqttTopic;
    }
    await mqttService.sendCommandToDevice(device.device_id, commandData, { mqttTopic });

    // 记录命令日志
    await DeviceLog.create({
      device_id: device.id,
      level: 'info',
      message: `发送数据到设备: ${typeof commandData === 'string' ? commandData.substring(0, 50) : JSON.stringify(commandData).substring(0, 50)}${(typeof commandData === 'string' ? commandData.length : JSON.stringify(commandData).length) > 50 ? '...' : ''}`,
      data: {
        direction: 'outgoing',
        source: 'api',
        payload: commandData,
        dataSize: typeof commandData === 'string' ? commandData.length : JSON.stringify(commandData).length,
        timestamp: new Date().toISOString(),
        messageType: 'command',
        sender: req.user.username,
        deviceStatus: device.status,
        deviceImei: device.imei
      }
    });

    const response = {
      success: true,
      message: '数据发送成功',
      data: {
        commandId: `cmd_${Date.now()}`,
        timestamp: new Date().toISOString()
      }
    };

    if (statusWarning) {
      response.warning = statusWarning;
    }

    res.json(response);

  } catch (error) {
    console.error('发送设备命令失败:', error);
    res.status(500).json({
      success: false,
      message: '发送设备命令失败',
      error: error.message
    });
  }
});

/**
 * 获取设备统计信息
 * GET /api/devices/stats
 */
router.get('/stats/overview', authenticateToken, async (req, res) => {
  try {
    const where = {};

    // 根据用户角色过滤数据
    if (req.user.role !== 'admin') {
      where.tenant_id = req.user.tenant_id;
    }

    // 总设备数
    const totalDevices = await Device.count({ where });

    // 在线设备数
    const onlineDevices = await Device.count({
      where: { ...where, status: 'online' }
    });

    // 离线设备数
    const offlineDevices = await Device.count({
      where: { ...where, status: 'offline' }
    });

    // 故障设备数
    const errorDevices = await Device.count({
      where: { ...where, status: 'error' }
    });

    // 按类型统计
    const devicesByType = await Device.findAll({
      where,
      attributes: [
        'device_type_id',
        [Device.sequelize.fn('COUNT', Device.sequelize.col('Device.id')), 'count']
      ],
      group: ['Device.device_type_id', 'device_type.id', 'device_type.name'],
      include: [{
        model: DeviceType,
        as: 'device_type',
        attributes: ['name']
      }]
    });

    res.json({
      success: true,
      data: {
        total: totalDevices,
        online: onlineDevices,
        offline: offlineDevices,
        error: errorDevices,
        byType: devicesByType.reduce((acc, item) => {
          const typeName = item.device_type?.name || `类型${item.device_type_id}`;
          acc[typeName] = parseInt(item.dataValues.count);
          return acc;
        }, {})
      }
    });

  } catch (error) {
    console.error('获取设备统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取设备统计失败',
      error: error.message
    });
  }
});

module.exports = router;
