const Joi = require('joi');

/**
 * 通用验证中间件
 * @param {Object} schema - Joi验证模式
 * @param {string} property - 要验证的属性 ('body', 'query', 'params')
 */
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false, // 返回所有错误
      allowUnknown: true, // 允许未知字段
      stripUnknown: true, // 移除未知字段
      convert: true // 启用类型转换
    });

    if (error) {
      const errorMessages = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context.value
      }));

      // 添加详细的验证错误日志
      console.error('参数验证失败:', {
        property,
        requestData: req[property],
        errors: errorMessages
      });

      return res.status(400).json({
        success: false,
        message: '参数验证失败',
        errors: errorMessages
      });
    }

    // 将验证后的值替换原始值
    req[property] = value;
    next();
  };
};

// 用户相关验证模式
const userSchemas = {
  // 用户注册
  register: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required()
      .messages({
        'string.alphanum': '用户名只能包含字母和数字',
        'string.min': '用户名至少3个字符',
        'string.max': '用户名最多30个字符',
        'any.required': '用户名是必填项'
      }),
    email: Joi.string().email().required()
      .messages({
        'string.email': '请输入有效的邮箱地址',
        'any.required': '邮箱是必填项'
      }),
    password: Joi.string().min(6).max(128).required()
      .messages({
        'string.min': '密码至少6个字符',
        'string.max': '密码最多128个字符',
        'any.required': '密码是必填项'
      }),
    real_name: Joi.string().max(50).optional(),
    phone: Joi.string().pattern(/^1[3-9]\d{9}$/).optional()
      .messages({
        'string.pattern.base': '请输入有效的手机号码'
      }),
    tenant_id: Joi.string().uuid().allow(null).optional()
      .messages({
        'string.uuid': '租户ID必须是有效的UUID格式'
      })
  }),

  // 用户登录
  login: Joi.object({
    username: Joi.string().required()
      .messages({
        'any.required': '用户名是必填项'
      }),
    password: Joi.string().required()
      .messages({
        'any.required': '密码是必填项'
      })
  }),

  // 更新用户信息
  update: Joi.object({
    real_name: Joi.string().max(50).optional(),
    phone: Joi.string().pattern(/^1[3-9]\d{9}$/).optional()
      .messages({
        'string.pattern.base': '请输入有效的手机号码'
      }),
    email: Joi.string().email().optional()
      .messages({
        'string.email': '请输入有效的邮箱地址'
      })
  }),

  // 管理员更新用户信息
  adminUpdate: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).optional()
      .messages({
        'string.alphanum': '用户名只能包含字母和数字',
        'string.min': '用户名至少3个字符',
        'string.max': '用户名最多30个字符'
      }),
    email: Joi.string().email().optional()
      .messages({
        'string.email': '请输入有效的邮箱地址'
      }),
    role: Joi.string().valid('admin', 'tenant_admin', 'user', 'building_user', 'group_user', 'operator', 'viewer').optional()
      .messages({
        'any.only': '角色必须是admin、tenant_admin、user、building_user、group_user、operator或viewer之一'
      }),
    tenant_id: Joi.alternatives().try(
      Joi.string().uuid(),
      Joi.number().integer().positive()
    ).allow(null).optional()
      .messages({
        'string.uuid': '租户ID必须是有效的UUID格式',
        'number.positive': '租户ID必须是正整数'
      }),
    profile: Joi.object().optional(),
    status: Joi.string().valid('active', 'inactive', 'locked').optional()
      .messages({
        'any.only': '状态必须是active、inactive或locked之一'
      })
  }),

  // 修改密码
  changePassword: Joi.object({
    oldPassword: Joi.string().required()
      .messages({
        'any.required': '原密码是必填项'
      }),
    newPassword: Joi.string().min(6).max(128).required()
      .messages({
        'string.min': '新密码至少6个字符',
        'string.max': '新密码最多128个字符',
        'any.required': '新密码是必填项'
      })
  })
};

// 租户相关验证模式
const tenantSchemas = {
  // 创建租户
  create: Joi.object({
    name: Joi.string().min(2).max(100).required()
      .messages({
        'string.min': '租户名称至少2个字符',
        'string.max': '租户名称最多100个字符',
        'any.required': '租户名称是必填项'
      }),
    code: Joi.string().alphanum().min(2).max(50).required()
      .messages({
        'string.alphanum': '租户编码只能包含字母和数字',
        'string.min': '租户编码至少2个字符',
        'string.max': '租户编码最多50个字符',
        'any.required': '租户编码是必填项'
      }),
    type: Joi.string().valid('enterprise', 'individual').default('enterprise'),
    contact_person: Joi.string().max(50).optional(),
    contact_phone: Joi.string().pattern(/^1[3-9]\d{9}$/).optional()
      .messages({
        'string.pattern.base': '请输入有效的联系电话'
      }),
    contact_email: Joi.string().email().optional()
      .messages({
        'string.email': '请输入有效的联系邮箱'
      }),
    address: Joi.string().max(500).optional(),
    device_limit: Joi.number().integer().min(1).max(10000).default(100)
      .messages({
        'number.min': '设备限制至少为1',
        'number.max': '设备限制最多为10000'
      }),
    expire_date: Joi.date().greater('now').optional()
      .messages({
        'date.greater': '到期时间必须大于当前时间'
      }),
    description: Joi.string().max(1000).allow('').optional(),
    settings: Joi.object({
      devicePostUrl: Joi.string().uri().optional()
        .messages({
          'string.uri': '设备通信接口必须是有效的URL地址'
        })
    }).optional()
  }),

  // 更新租户
  update: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    contact_person: Joi.string().max(50).optional(),
    contact_phone: Joi.string().pattern(/^1[3-9]\d{9}$/).optional(),
    contact_email: Joi.string().email().optional(),
    address: Joi.string().max(500).optional(),
    device_limit: Joi.number().integer().min(1).max(10000).optional(),
    expire_date: Joi.date().greater('now').optional(),
    status: Joi.string().valid('active', 'inactive', 'suspended').optional(),
    description: Joi.string().max(1000).allow('').optional(),
    settings: Joi.object({
      devicePostUrl: Joi.string().uri().optional()
        .messages({
          'string.uri': '设备通信接口必须是有效的URL地址'
        })
    }).optional()
  })
};

// 设备相关验证模式
const deviceSchemas = {
  // 创建设备
  create: Joi.object({
    name: Joi.string().min(2).max(100).required()
      .messages({
        'string.min': '设备名称至少2个字符',
        'string.max': '设备名称最多100个字符',
        'any.required': '设备名称是必填项'
      }),
    device_category: Joi.string().valid('standalone', 'gateway', 'sub_device').optional(),
    imei: Joi.when('device_category', {
      is: 'sub_device',
      then: Joi.string().allow('', null).empty('').optional(),
      otherwise: Joi.string().pattern(/^[0-9a-zA-Z]{1,255}$/).required()
    }).optional()
      .messages({
        'string.pattern.base': 'IMEI/设备号必须为1-255位字母或数字',
        'any.required': 'IMEI/设备号是必填项'
      }),
    parent_device_id: Joi.string().uuid().when('device_category', {
      is: 'sub_device',
      then: Joi.required(),
      otherwise: Joi.optional().allow(null)
    })
      .messages({
        'string.uuid': '父设备ID必须是有效的UUID格式',
        'any.required': '子设备必须指定父设备ID'
      }),
    sub_device_sequence: Joi.number().integer().min(1).when('device_category', {
      is: 'sub_device',
      then: Joi.required(),
      otherwise: Joi.optional().allow(null)
    })
      .messages({
        'number.min': '子设备序列号必须大于0',
        'any.required': '子设备必须指定序列号'
      }),
    device_type_id: Joi.string().uuid().required()
      .messages({
        'string.uuid': '设备类型ID必须是有效的UUID格式',
        'any.required': '设备类型ID是必填项'
      }),
    protocol_config_id: Joi.string().uuid().allow(null).optional()
      .messages({
        'string.uuid': '协议配置ID必须是有效的UUID格式'
      }),
    project_building_id: Joi.string().uuid().allow(null, '').optional()
      .messages({
        'string.uuid': '建筑ID必须是有效的UUID格式'
      }),
    project_group_id: Joi.string().uuid().allow(null, '').optional()
      .messages({
        'string.uuid': '分组ID必须是有效的UUID格式'
      }),
    manufacturer_code: Joi.string().min(2).max(20).required()
      .messages({
        'string.min': '厂商编号至少2个字符',
        'string.max': '厂商编号最多20个字符',
        'any.required': '厂商编号是必填项'
      }),
    model: Joi.string().max(50).optional(),
    manufacturer: Joi.string().max(50).optional(),
    firmware_version: Joi.string().max(20).optional(),
    location: Joi.string().max(200).optional(),
    latitude: Joi.number().min(-90).max(90).optional()
      .messages({
        'number.min': '纬度必须在-90到90之间',
        'number.max': '纬度必须在-90到90之间'
      }),
    longitude: Joi.number().min(-180).max(180).optional()
      .messages({
        'number.min': '经度必须在-180到180之间',
        'number.max': '经度必须在-180到180之间'
      }),
    description: Joi.string().max(1000).allow('').optional(),
    config: Joi.object().optional(),
    tenant_id: Joi.alternatives().try(
      Joi.string().uuid(),
      Joi.number().integer().positive()
    ).allow(null).optional()
      .messages({
        'string.uuid': '租户ID必须是有效的UUID格式',
        'number.positive': '租户ID必须是正整数'
      }),
    mqtt_config: Joi.object({
      server: Joi.string().allow('').optional(),
      port: Joi.number().integer().min(1).max(65535).optional(),
      username: Joi.string().max(100).allow('').optional(),
      password: Joi.string().max(255).allow('').optional(),
      subscribeTopic: Joi.string().max(200).allow('').optional(),
      publishTopic: Joi.string().max(200).allow('').optional(),
      subscribe_topic: Joi.string().max(200).allow('').optional(),
      publish_topic: Joi.string().max(200).allow('').optional(),
      subscription_type: Joi.string().allow('').optional(),
      subscriptionType: Joi.string().allow('').optional(),
      qos: Joi.number().integer().min(0).max(2).optional(),
      keepAlive: Joi.number().integer().min(10).max(3600).optional()
    }).optional()
  }),

  // 更新设备
  update: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    imei: Joi.string().pattern(/^[0-9a-zA-Z]{1,255}$/).optional()
      .messages({
        'string.pattern.base': 'IMEI/设备号必须为1-255位字母或数字'
      }),
    device_type_id: Joi.string().uuid().optional(),
    protocol_config_id: Joi.string().uuid().allow(null).optional()
      .messages({
        'string.uuid': '协议配置ID必须是有效的UUID格式'
      }),
    project_building_id: Joi.string().uuid().allow(null, '').optional()
      .messages({
        'string.uuid': '建筑ID必须是有效的UUID格式'
      }),
    project_group_id: Joi.string().uuid().allow(null, '').optional()
      .messages({
        'string.uuid': '分组ID必须是有效的UUID格式'
      }),
    manufacturer_code: Joi.string().min(2).max(20).optional(),
    model: Joi.string().max(50).optional(),
    manufacturer: Joi.string().max(50).optional(),
    firmware_version: Joi.string().max(20).optional(),
    status: Joi.string().valid('online', 'offline', 'error', 'maintenance').optional(),
    location: Joi.string().max(200).optional(),
    latitude: Joi.number().min(-90).max(90).optional(),
    longitude: Joi.number().min(-180).max(180).optional(),
    description: Joi.string().max(1000).allow('').optional(),
    config: Joi.object().optional(),
    configuration: Joi.object().optional(),
    metadata: Joi.object().optional(),
    mqtt_config: Joi.object({
      server: Joi.string().allow('').optional(),
      port: Joi.number().integer().min(1).max(65535).optional(),
      username: Joi.string().max(100).allow('').optional(),
      password: Joi.string().max(255).allow('').optional(),
      subscribeTopic: Joi.string().max(200).allow('').optional(),
      publishTopic: Joi.string().max(200).allow('').optional(),
      subscribe_topic: Joi.string().max(200).allow('').optional(),
      publish_topic: Joi.string().max(200).allow('').optional(),
      subscription_type: Joi.string().allow('').optional(),
      subscriptionType: Joi.string().allow('').optional(),
      qos: Joi.number().integer().min(0).max(2).optional(),
      keepAlive: Joi.number().integer().min(10).max(3600).optional()
    }).optional()
  }),

  // 设备命令
  command: Joi.object({
    command: Joi.string().required()
      .messages({
        'any.required': '命令类型是必填项'
      }),
    params: Joi.object().optional()
  })
};

// MQTT配置验证模式
const mqttSchemas = {
  // 创建MQTT配置
  create: Joi.object({
    name: Joi.string().min(2).max(100).required()
      .messages({
        'any.required': '配置名称是必填项'
      }),
    broker_url: Joi.string().uri().required()
      .messages({
        'string.uri': '请输入有效的MQTT服务器地址',
        'any.required': 'MQTT服务器地址是必填项'
      }),
    port: Joi.number().integer().min(1).max(65535).default(1883)
      .messages({
        'number.min': '端口号必须在1-65535之间',
        'number.max': '端口号必须在1-65535之间'
      }),
    username: Joi.string().max(100).optional(),
    password: Joi.string().max(255).optional(),
    client_id: Joi.string().max(100).optional(),
    keep_alive: Joi.number().integer().min(10).max(3600).default(60)
      .messages({
        'number.min': '保持连接时间至少10秒',
        'number.max': '保持连接时间最多3600秒'
      }),
    clean_session: Joi.boolean().default(true),
    ssl_enabled: Joi.boolean().default(false),
    topics: Joi.object().optional(),
    tenant_id: Joi.string().uuid().allow(null).optional()
      .messages({
        'string.uuid': '租户ID必须是有效的UUID格式'
      })
  }),

  // 更新MQTT配置
  update: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    broker_url: Joi.string().uri().optional(),
    port: Joi.number().integer().min(1).max(65535).optional(),
    username: Joi.string().max(100).optional(),
    password: Joi.string().max(255).optional(),
    client_id: Joi.string().max(100).optional(),
    keep_alive: Joi.number().integer().min(10).max(3600).optional(),
    clean_session: Joi.boolean().optional(),
    ssl_enabled: Joi.boolean().optional(),
    topics: Joi.object().optional(),
    status: Joi.string().valid('active', 'inactive').optional()
  })
};

// 查询参数验证模式
const querySchemas = {
  // 分页查询
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(5000).default(50),
    keyword: Joi.string().max(100).optional(),
    status: Joi.string().optional(),
    type: Joi.string().optional(),
    tenantId: Joi.string().uuid().allow(null).optional()
      .messages({
        'string.uuid': '租户ID必须是有效的UUID格式'
      }),
    startTime: Joi.date().optional(),
    endTime: Joi.date().optional()
  }),

  // 设备数据查询
  deviceData: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(5000).default(50),
    dataType: Joi.string().max(50).optional(),
    startTime: Joi.date().optional(),
    endTime: Joi.date().optional()
  }),

  // 设备日志查询
  deviceLogs: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(20),
    logType: Joi.string().valid('info', 'warning', 'error', 'debug').optional(),
    startTime: Joi.date().optional(),
    endTime: Joi.date().optional()
  })
};

// 导出验证中间件
module.exports = {
  validate,

  // 用户验证
  validateUserRegister: validate(userSchemas.register),
  validateUserLogin: validate(userSchemas.login),
  validateUserUpdate: validate(userSchemas.update),
  validateAdminUserUpdate: validate(userSchemas.adminUpdate),
  validateChangePassword: validate(userSchemas.changePassword),

  // 租户验证
  validateTenant: validate(tenantSchemas.create),
  validateTenantUpdate: validate(tenantSchemas.update),

  // 设备验证
  validateDevice: validate(deviceSchemas.create),
  validateDeviceUpdate: validate(deviceSchemas.update),
  validateDeviceCommand: validate(deviceSchemas.command),

  // MQTT配置验证
  validateMqttConfig: validate(mqttSchemas.create),
  validateMqttConfigUpdate: validate(mqttSchemas.update),

  // 查询参数验证
  validatePagination: validate(querySchemas.pagination, 'query'),
  validateDeviceDataQuery: validate(querySchemas.deviceData, 'query'),
  validateDeviceLogsQuery: validate(querySchemas.deviceLogs, 'query'),

  // 参数验证
  validateId: validate(Joi.object({
    id: Joi.alternatives().try(
      Joi.string().uuid(),
      Joi.number().integer().positive(),
      Joi.string().pattern(/^\d+$/).custom((value, helpers) => {
        const num = parseInt(value, 10)
        if (num <= 0) {
          return helpers.error('number.positive')
        }
        return num
      })
    ).required()
  }), 'params'),

  // 自定义验证函数
  customValidate: (schema, property = 'body') => validate(schema, property),

  // 验证模式对象（供其他地方使用）
  schemas: {
    user: userSchemas,
    tenant: tenantSchemas,
    device: deviceSchemas,
    mqtt: mqttSchemas,
    query: querySchemas
  }
};
