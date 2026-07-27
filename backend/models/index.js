const { Sequelize, DataTypes } = require('sequelize');
const { config } = require('../config/database');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

// 创建 Sequelize 实例
const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect,
    logging: dbConfig.logging,
    pool: dbConfig.pool,
    define: {
      timestamps: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
);

// 定义模型
const db = {};

// Tenant 模型
db.Tenant = sequelize.define('Tenant', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  code: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  type: {
    type: DataTypes.ENUM('enterprise', 'individual', 'government'),
    defaultValue: 'enterprise'
  },
  description: {
    type: DataTypes.TEXT
  },
  contact_person: {
    type: DataTypes.STRING(100)
  },
  contact_phone: {
    type: DataTypes.STRING(20)
  },
  contact_email: {
    type: DataTypes.STRING(255)
  },
  address: {
    type: DataTypes.TEXT
  },
  device_limit: {
    type: DataTypes.INTEGER,
    defaultValue: 100
  },
  expire_date: {
    type: DataTypes.DATE
  },
  settings: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'suspended'),
    defaultValue: 'active'
  },
  created_by: {
    type: DataTypes.UUID
  }
}, {
  tableName: 'tenants'
});

// User 模型
db.User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  profile: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  role: {
    type: DataTypes.ENUM('admin', 'tenant_admin', 'user', 'building_user', 'group_user'),
    defaultValue: 'user'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'locked'),
    defaultValue: 'active'
  },
  last_login_at: {
    type: DataTypes.DATE
  },
  tenant_id: {
    type: DataTypes.UUID,
    references: {
      model: 'tenants',
      key: 'id'
    }
  }
}, {
  tableName: 'users'
});

// DeviceType 模型
db.DeviceType = sequelize.define('DeviceType', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  code: {
    type: DataTypes.STRING(50)
  },
  description: {
    type: DataTypes.TEXT
  },
  protocol: {
    type: DataTypes.STRING(50)
  },
  data_format: {
    type: DataTypes.JSONB
  }
}, {
  tableName: 'device_types'
});

// Device 模型
db.Device = sequelize.define('Device', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  device_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'device_id'
  },
  imei: {
    type: DataTypes.STRING(255),
    // 移除简单的unique约束，改用数据库级别的条件唯一约束
    // 只对非子设备（standalone、gateway）应用IMEI唯一性
    allowNull: true
  },
  manufacturer_code: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT
  },
  location: {
    type: DataTypes.STRING(200)
  },
  status: {
    type: DataTypes.ENUM('online', 'offline', 'fault', 'maintenance'),
    defaultValue: 'online'
  },
  last_seen_at: {
    type: DataTypes.DATE
  },
  tenant_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'tenants',
      key: 'id'
    }
  },
  device_type_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'device_types',
      key: 'id'
    }
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  mqtt_config: {
    type: DataTypes.JSONB,
    defaultValue: {
      subscribe_topics: [],
      publish_topics: [],
      heartbeat_interval: 60,
      offline_timeout: 300,
      auto_subscribe: true,
      enabled: true,
      subscription_type: 'middle',
      subscribe_topic: '',
      publish_topic: ''
    }
  },
  protocol_config_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'protocol_configs',
      key: 'id'
    },
    comment: '设备使用的协议配置ID'
  },
  device_category: {
    type: DataTypes.ENUM('standalone', 'gateway', 'sub_device'),
    defaultValue: 'standalone',
    comment: '设备分类：独立设备、网关设备、子设备'
  },
  is_thermostat: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: '是否已加入温控管理'
  },
  is_lighting: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: '是否已加入照明控制管理'
  },
  is_switch: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: '是否已加入定时开关管理'
  },
  is_air_conditioner: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: '是否已加入分散空调管理'
  },
  parent_device_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'devices',
      key: 'id'
    },
    comment: '父设备ID（用于子设备关联到网关）'
  },
  project_building_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'project_buildings',
      key: 'id'
    },
    comment: '所属建筑ID'
  },
  project_group_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'project_groups',
      key: 'id'
    },
    comment: '所属项目分组ID'
  },
  connection_config: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: '连接配置（MQTT、Modbus等）'
  },
  sub_device_sequence: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '子设备序列号，用于标识同一网关下的不同子设备（如1,2,3,4,5,6等）'
  }
}, {
  tableName: 'devices'
});

// DeviceData 模型
db.DeviceData = sequelize.define('DeviceData', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  device_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'devices',
      key: 'id'
    }
  },
  data_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'sensor'
  },
  payload: {
    type: DataTypes.JSONB,
    allowNull: false
  },
  quality: {
    type: DataTypes.INTEGER,
    defaultValue: 100,
    validate: {
      min: 0,
      max: 100
    }
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  received_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'device_data',
  indexes: [
    {
      fields: ['device_id', 'timestamp']
    },
    {
      fields: ['timestamp']
    }
  ]
});

// DeviceCommand 模型
db.DeviceCommand = sequelize.define('DeviceCommand', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  device_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'devices',
      key: 'id'
    }
  },
  command: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  parameters: {
    type: DataTypes.JSONB
  },
  status: {
    type: DataTypes.ENUM('pending', 'sent', 'acknowledged', 'failed', 'timeout'),
    defaultValue: 'pending'
  },
  sent_at: {
    type: DataTypes.DATE
  },
  acknowledged_at: {
    type: DataTypes.DATE
  },
  response: {
    type: DataTypes.JSONB
  },
  created_by: {
    type: DataTypes.UUID,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  tableName: 'device_commands'
});

// DeviceLog 模型 (用于MQTT服务)
db.DeviceLog = sequelize.define('DeviceLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  device_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'devices',
      key: 'id'
    }
  },
  level: {
    type: DataTypes.ENUM('info', 'warning', 'error', 'debug'),
    defaultValue: 'info'
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  data: {
    type: DataTypes.JSONB
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'device_logs',
  indexes: [
    {
      fields: ['device_id', 'timestamp']
    },
    {
      fields: ['level']
    },
    {
      fields: ['timestamp']
    }
  ]
});

// Manufacturer 模型
db.Manufacturer = sequelize.define('Manufacturer', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  code: {
    type: DataTypes.TEXT,
    allowNull: false,
    unique: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  contact: {
    type: DataTypes.STRING(100)
  },
  phone: {
    type: DataTypes.STRING(20)
  },
  email: {
    type: DataTypes.STRING(255)
  },
  address: {
    type: DataTypes.TEXT
  },
  website: {
    type: DataTypes.STRING(255)
  },
  description: {
    type: DataTypes.TEXT
  },
  logo_url: {
    type: DataTypes.STRING(500)
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active'
  },
  subscription_type: {
    type: DataTypes.ENUM('imei_middle', 'imei_last', 'custom'),
    defaultValue: 'imei_middle'
  },
  mqtt_config: {
    type: DataTypes.JSONB,
    defaultValue: {
      subscribeTopics: [],
      publishTopics: []
    }
  },
  created_by: {
    type: DataTypes.UUID,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  tableName: 'manufacturers'
});

// MqttConfig 模型
db.MqttConfig = sequelize.define('MqttConfig', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  broker_url: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  port: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1883
  },
  username: {
    type: DataTypes.STRING(100)
  },
  password: {
    type: DataTypes.STRING(255)
  },
  client_id: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  keep_alive: {
    type: DataTypes.INTEGER,
    defaultValue: 60
  },
  clean_session: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  ssl_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  topics: {
    type: DataTypes.JSONB,
    defaultValue: {
      data: 'device/+/data',
      status: 'device/+/status',
      command: 'device/+/command',
      response: 'device/+/response'
    }
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active'
  },
  tenant_id: {
    type: DataTypes.UUID,
    references: {
      model: 'tenants',
      key: 'id'
    }
  },
  created_by: {
    type: DataTypes.UUID,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  tableName: 'mqtt_configs'
});

// ProtocolConfig 模型
db.ProtocolConfig = sequelize.define('ProtocolConfig', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  version: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: '1.0.0'
  },
  protocol_type: {
    type: DataTypes.ENUM('json', 'modbus'),
    allowNull: false,
    defaultValue: 'json',
    comment: '协议类型：json或modbus'
  },
  manufacturer_code: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  device_type: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT
  },
  data_parsing_config: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: '数据解析配置JSON'
  },
  command_config: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: '命令配置JSON'
  },
  validation_rules: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: '数据验证规则'
  },
  modbus_config: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Modbus协议基础配置'
  },
  modbus_registers: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Modbus寄存器映射配置'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'testing'),
    defaultValue: 'testing'
  },
  is_default: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: '是否为该厂商设备类型的默认协议'
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  tenant_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'tenants',
      key: 'id'
    },
    comment: '所属租户ID（为空表示全局协议）'
  },
  is_global: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: '是否为全局协议'
  }
}, {
  tableName: 'protocol_configs',
  indexes: [
    {
      fields: ['manufacturer_code', 'device_type']
    },
    {
      fields: ['status']
    },
    {
      fields: ['tenant_id']
    },
    {
      unique: true,
      fields: ['tenant_id', 'manufacturer_code', 'device_type', 'is_default'],
      where: {
        is_default: true
      }
    }
  ]
});

// 定义关联关系
// Tenant 和 User
db.Tenant.hasMany(db.User, { foreignKey: 'tenant_id', as: 'users' });
db.User.belongsTo(db.Tenant, { foreignKey: 'tenant_id', as: 'tenant' });

// Tenant 和 Device
db.Tenant.hasMany(db.Device, { foreignKey: 'tenant_id', as: 'devices' });
db.Device.belongsTo(db.Tenant, { foreignKey: 'tenant_id', as: 'tenant' });

db.DeviceType.hasMany(db.Device, { foreignKey: 'device_type_id', as: 'devices' });
db.Device.belongsTo(db.DeviceType, { foreignKey: 'device_type_id', as: 'device_type' });

db.User.hasMany(db.Device, { foreignKey: 'created_by', as: 'created_devices' });
db.Device.belongsTo(db.User, { foreignKey: 'created_by', as: 'creator' });

// 设备层级关系
db.Device.hasMany(db.Device, { foreignKey: 'parent_device_id', as: 'children' });
db.Device.belongsTo(db.Device, { foreignKey: 'parent_device_id', as: 'parent_device' });

db.Device.hasMany(db.DeviceData, { foreignKey: 'device_id', as: 'device_data' });
db.DeviceData.belongsTo(db.Device, { foreignKey: 'device_id', as: 'device' });

db.Device.hasMany(db.DeviceCommand, { foreignKey: 'device_id', as: 'commands' });
db.DeviceCommand.belongsTo(db.Device, { foreignKey: 'device_id', as: 'device' });

db.User.hasMany(db.DeviceCommand, { foreignKey: 'created_by', as: 'created_commands' });
db.DeviceCommand.belongsTo(db.User, { foreignKey: 'created_by', as: 'creator' });

db.Device.hasMany(db.DeviceLog, { foreignKey: 'device_id', as: 'logs' });
db.DeviceLog.belongsTo(db.Device, { foreignKey: 'device_id', as: 'device' });

// Tenant 和 MqttConfig
db.Tenant.hasMany(db.MqttConfig, { foreignKey: 'tenant_id', as: 'mqtt_configs' });
db.MqttConfig.belongsTo(db.Tenant, { foreignKey: 'tenant_id', as: 'tenant' });

// User 和 MqttConfig
db.User.hasMany(db.MqttConfig, { foreignKey: 'created_by', as: 'created_mqtt_configs' });
db.MqttConfig.belongsTo(db.User, { foreignKey: 'created_by', as: 'creator' });

// Manufacturer 和 Device
db.Manufacturer.hasMany(db.Device, { foreignKey: 'manufacturer_code', sourceKey: 'code', as: 'devices' });
db.Device.belongsTo(db.Manufacturer, { foreignKey: 'manufacturer_code', targetKey: 'code', as: 'manufacturer' });

// User 和 Manufacturer
db.User.hasMany(db.Manufacturer, { foreignKey: 'created_by', as: 'created_manufacturers' });
db.Manufacturer.belongsTo(db.User, { foreignKey: 'created_by', as: 'creator' });

// User 和 ProtocolConfig
db.User.hasMany(db.ProtocolConfig, { foreignKey: 'created_by', as: 'created_protocols' });
db.ProtocolConfig.belongsTo(db.User, { foreignKey: 'created_by', as: 'creator' });

// Manufacturer 和 ProtocolConfig
db.Manufacturer.hasMany(db.ProtocolConfig, { foreignKey: 'manufacturer_code', sourceKey: 'code', as: 'protocols' });
db.ProtocolConfig.belongsTo(db.Manufacturer, { foreignKey: 'manufacturer_code', targetKey: 'code', as: 'manufacturer' });

// Device 和 ProtocolConfig (设备可以指定使用的协议)
db.Device.belongsTo(db.ProtocolConfig, { foreignKey: 'protocol_config_id', as: 'protocol_config' });
db.ProtocolConfig.hasMany(db.Device, { foreignKey: 'protocol_config_id', as: 'devices' });

// MessageProcessingStats 模型
db.MessageProcessingStat = sequelize.define('MessageProcessingStat', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  device_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'devices',
      key: 'id'
    }
  },
  message_id: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  topic: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  message_type: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  direction: {
    type: DataTypes.ENUM('inbound', 'outbound'),
    allowNull: false
  },
  received_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  processing_started_at: {
    type: DataTypes.DATE
  },
  processing_completed_at: {
    type: DataTypes.DATE
  },
  processing_status: {
    type: DataTypes.ENUM('received', 'processing', 'completed', 'failed'),
    defaultValue: 'received'
  },
  processing_error: {
    type: DataTypes.TEXT
  },
  processing_duration_ms: {
    type: DataTypes.INTEGER
  },
  storage_started_at: {
    type: DataTypes.DATE
  },
  storage_completed_at: {
    type: DataTypes.DATE
  },
  storage_status: {
    type: DataTypes.ENUM('pending', 'storing', 'stored', 'failed'),
    defaultValue: 'pending'
  },
  storage_error: {
    type: DataTypes.TEXT
  },
  storage_duration_ms: {
    type: DataTypes.INTEGER
  },
  storage_location: {
    type: DataTypes.STRING(100)
  },
  message_size: {
    type: DataTypes.INTEGER
  },
  payload_hash: {
    type: DataTypes.STRING(64)
  },
  retry_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  has_anomaly: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  anomaly_type: {
    type: DataTypes.STRING(50)
  },
  anomaly_description: {
    type: DataTypes.TEXT
  },
  anomaly_severity: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical')
  }
}, {
  tableName: 'message_processing_stats',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['device_id']
    },
    {
      fields: ['received_at']
    },
    {
      fields: ['processing_status']
    },
    {
      fields: ['storage_status']
    },
    {
      fields: ['has_anomaly']
    },
    {
      fields: ['direction']
    },
    {
      fields: ['message_type']
    }
  ]
});

// MessageFlowStatistics 模型
db.MessageFlowStatistic = sequelize.define('MessageFlowStatistic', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  time_bucket: {
    type: DataTypes.DATE,
    allowNull: false
  },
  bucket_type: {
    type: DataTypes.ENUM('minute', 'hour', 'day'),
    allowNull: false
  },
  total_received: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  total_processed: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  total_stored: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  total_failed: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  total_sent: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  total_sent_success: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  total_sent_failed: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  total_anomalies: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  anomaly_low: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  anomaly_medium: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  anomaly_high: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  anomaly_critical: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  avg_processing_time_ms: {
    type: DataTypes.DECIMAL(10, 2)
  },
  avg_storage_time_ms: {
    type: DataTypes.DECIMAL(10, 2)
  },
  max_processing_time_ms: {
    type: DataTypes.INTEGER
  },
  max_storage_time_ms: {
    type: DataTypes.INTEGER
  }
}, {
  tableName: 'message_flow_statistics',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['time_bucket', 'bucket_type']
    },
    {
      fields: ['time_bucket']
    },
    {
      fields: ['bucket_type']
    }
  ]
});

// AnomalyDetectionRules 模型
db.AnomalyDetectionRule = sequelize.define('AnomalyDetectionRule', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  rule_type: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  condition_expression: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  severity: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
    defaultValue: 'medium'
  },
  description: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'anomaly_detection_rules',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['rule_type']
    },
    {
      fields: ['enabled']
    },
    {
      fields: ['severity']
    }
  ]
});

// ElectricMeter 模型 - 电表管理
db.ElectricMeter = sequelize.define('ElectricMeter', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '电表名称'
  },
  meter_number: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: '电表编号（IMEI+电表地址号）'
  },
  meter_address: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: '电表地址号'
  },
  device_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'devices',
      key: 'id'
    },
    comment: '关联设备ID'
  },
  tenant_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'tenants',
      key: 'id'
    },
    comment: '所属租户ID'
  },
  manufacturer_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'manufacturers',
      key: 'id'
    },
    comment: '厂商ID'
  },
  protocol_config_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'protocol_configs',
      key: 'id'
    },
    comment: '协议解析配置ID'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'maintenance', 'fault'),
    defaultValue: 'active',
    comment: '电表状态'
  },
  description: {
    type: DataTypes.TEXT,
    comment: '电表描述'
  },
  collection_interval: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 10,
    comment: '采集频率（分钟）'
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    },
    comment: '创建者ID'
  },
  dtu_device_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'devices',
      key: 'id'
    },
    comment: 'DTU设备ID（用于DTU网关模式）'
  },
  meter_type: {
    type: DataTypes.ENUM('single_phase', 'three_phase', 'smart_meter'),
    defaultValue: 'single_phase',
    comment: '电表类型'
  }
}, {
  tableName: 'electric_meters',
  indexes: [
    {
      fields: ['device_id']
    },
    {
      fields: ['tenant_id']
    },
    {
      fields: ['manufacturer_id']
    },
    {
      fields: ['meter_number']
    },
    {
      fields: ['status']
    }
  ]
});

// 新增关联关系
// Device 和 MessageProcessingStat
db.Device.hasMany(db.MessageProcessingStat, { foreignKey: 'device_id', as: 'processing_stats' });
db.MessageProcessingStat.belongsTo(db.Device, { foreignKey: 'device_id', as: 'device' });

// Device 自关联关系（父子设备）
db.Device.hasMany(db.Device, { foreignKey: 'parent_device_id', as: 'SubDevices' });
db.Device.belongsTo(db.Device, { foreignKey: 'parent_device_id', as: 'ParentDevice' });

// ElectricMeter 关联关系
db.ElectricMeter.belongsTo(db.Device, { foreignKey: 'device_id', as: 'Device' });
db.ElectricMeter.belongsTo(db.Device, { foreignKey: 'dtu_device_id', as: 'DtuDevice' });
db.ElectricMeter.belongsTo(db.Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
db.ElectricMeter.belongsTo(db.Manufacturer, { foreignKey: 'manufacturer_id', as: 'manufacturer' });
db.ElectricMeter.belongsTo(db.ProtocolConfig, { foreignKey: 'protocol_config_id', as: 'protocol_config' });
db.ElectricMeter.belongsTo(db.User, { foreignKey: 'created_by', as: 'creator' });

// 反向关联
db.Device.hasMany(db.ElectricMeter, { foreignKey: 'device_id', as: 'electric_meters' });
db.Tenant.hasMany(db.ElectricMeter, { foreignKey: 'tenant_id', as: 'electric_meters' });
db.Manufacturer.hasMany(db.ElectricMeter, { foreignKey: 'manufacturer_id', as: 'electric_meters' });
db.User.hasMany(db.ElectricMeter, { foreignKey: 'created_by', as: 'created_electric_meters' });

// 多联机主机模型
db.MultiUnitAcHost = sequelize.define('MultiUnitAcHost', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  host_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '多联机主机名称'
  },
  device_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'devices',
      key: 'id'
    },
    comment: '关联设备ID'
  },
  tenant_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'tenants',
      key: 'id'
    },
    comment: '所属租户ID'
  },
  model: {
    type: DataTypes.STRING(50),
    comment: '主机型号'
  },
  capacity: {
    type: DataTypes.DECIMAL(8, 2),
    comment: '制冷量(kW)'
  },
  max_indoor_units: {
    type: DataTypes.INTEGER,
    defaultValue: 16,
    comment: '最大内机数量'
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    comment: '创建者ID'
  },
  group_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: '分组名称'
  },
  concentrator_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 65535
    },
    comment: '智能控制器索引序号，作为空调四段地址格式中的第一段，与设备uuid一一对应，范围1-65535'
  },
  host_address: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: '主机地址，格式：concentrator_id-channel-outdoor_unit (如：1-1-1)'
  },
  status: {
    type: DataTypes.ENUM('online', 'offline', 'fault'),
    defaultValue: 'offline',
    comment: '主机状态'
  },
  host_status: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: '主机详细状态信息'
  },
  last_heartbeat: {
    type: DataTypes.DATE,
    comment: '最后心跳时间'
  }
}, {
  tableName: 'multi_unit_ac_hosts',
  indexes: [
    { fields: ['device_id'] },
    { fields: ['tenant_id'] },
    { fields: ['host_address'] },
    { fields: ['status'] },
    { fields: ['last_heartbeat'] }
  ]
});

// 多联机内机模型
db.MultiUnitAcIndoorUnit = sequelize.define('MultiUnitAcIndoorUnit', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  unit_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '内机名称'
  },
  host_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'multi_unit_ac_hosts',
      key: 'id'
    },
    comment: '所属主机ID'
  },
  unit_address: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: '内机完整地址，格式：concentrator_id-channel-outdoor_unit-indoor_unit (如：1-1-1-1)'
  },
  channel_number: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '空调通道号，1-8'
  },
  outdoor_unit_address: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '空调外机地址'
  },
  indoor_unit_address: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '空调内机地址'
  },
  room_name: {
    type: DataTypes.STRING(100),
    comment: '房间名称'
  },
  model: {
    type: DataTypes.STRING(50),
    comment: '内机型号'
  },
  power: {
    type: DataTypes.INTEGER,
    comment: '内机容量单位(百瓦)'
  },
  brand: {
    type: DataTypes.INTEGER,
    comment: '空调品牌'
  },
  ac_type: {
    type: DataTypes.STRING(1),
    defaultValue: 'v',
    comment: '空调类型: v=氟机vrv, w=风冷冷水, l=水冷冷水'
  },
  status: {
    type: DataTypes.ENUM('online', 'offline', 'fault'),
    defaultValue: 'offline',
    comment: '内机状态'
  },
  power_status: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: '电源状态'
  },
  operation_mode: {
    type: DataTypes.ENUM('auto', 'cool', 'heat', 'fan', 'dry'),
    defaultValue: 'auto',
    comment: '运行模式'
  },
  fan_speed: {
    type: DataTypes.ENUM('auto', 'low', 'medium', 'high'),
    defaultValue: 'auto',
    comment: '风速'
  },
  target_temp: {
    type: DataTypes.DECIMAL(4, 1),
    comment: '目标温度'
  },
  current_temp: {
    type: DataTypes.DECIMAL(4, 1),
    comment: '当前温度'
  },
  swing_status: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: '摆风状态'
  },
  lock_status: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: '锁定状态'
  },
  fault_code: {
    type: DataTypes.STRING(20),
    comment: '故障代码'
  },
  last_update: {
    type: DataTypes.DATE,
    comment: '最后更新时间'
  }
}, {
  tableName: 'multi_unit_ac_indoor_units',
  indexes: [
    { fields: ['host_id'] },
    { fields: ['unit_address'] },
    { fields: ['status'] },
    { fields: ['host_id', 'unit_address'], unique: true }
  ]
});

// 多联机控制日志模型
db.MultiUnitAcControlLog = sequelize.define('MultiUnitAcControlLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  host_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'multi_unit_ac_hosts',
      key: 'id'
    },
    comment: '主机ID'
  },
  indoor_unit_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'multi_unit_ac_indoor_units',
      key: 'id'
    },
    comment: '内机ID（为空表示主机操作）'
  },
  operation_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '操作类型'
  },
  operation_params: {
    type: DataTypes.JSONB,
    comment: '操作参数'
  },
  result: {
    type: DataTypes.ENUM('success', 'failed', 'timeout'),
    allowNull: false,
    comment: '执行结果'
  },
  error_message: {
    type: DataTypes.TEXT,
    comment: '错误信息'
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    },
    comment: '操作用户ID'
  },
  source: {
    type: DataTypes.ENUM('manual', 'schedule', 'scene', 'auto'),
    defaultValue: 'manual',
    comment: '操作来源'
  }
}, {
  tableName: 'multi_unit_ac_control_logs',
  indexes: [
    { fields: ['host_id'] },
    { fields: ['indoor_unit_id'] },
    { fields: ['operation_type'] },
    { fields: ['created_at'] }
  ]
});

// 多联机运行统计模型
db.MultiUnitAcRuntimeStat = sequelize.define('MultiUnitAcRuntimeStat', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  host_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'multi_unit_ac_hosts',
      key: 'id'
    },
    comment: '主机ID'
  },
  indoor_unit_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'multi_unit_ac_indoor_units',
      key: 'id'
    },
    comment: '内机ID（为空表示主机统计）'
  },
  stat_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: '统计日期'
  },
  runtime_hours: {
    type: DataTypes.DECIMAL(6, 2),
    defaultValue: 0,
    comment: '运行时长(小时)'
  },
  power_consumption: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    comment: '耗电量(kWh)'
  },
  start_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '启动次数'
  },
  fault_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '故障次数'
  },
  avg_temp: {
    type: DataTypes.DECIMAL(4, 1),
    comment: '平均温度'
  },
  max_temp: {
    type: DataTypes.DECIMAL(4, 1),
    comment: '最高温度'
  },
  min_temp: {
    type: DataTypes.DECIMAL(4, 1),
    comment: '最低温度'
  }
}, {
  tableName: 'multi_unit_ac_runtime_stats',
  indexes: [
    { fields: ['host_id'] },
    { fields: ['indoor_unit_id'] },
    { fields: ['stat_date'] },
    { fields: ['host_id', 'indoor_unit_id', 'stat_date'], unique: true }
  ]
});

// 多联机分组模型
db.MultiUnitAcGroup = sequelize.define('MultiUnitAcGroup', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '分组名称'
  },
  tenant_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'tenants',
      key: 'id'
    },
    comment: '所属租户ID'
  },
  description: {
    type: DataTypes.TEXT,
    comment: '分组描述'
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    comment: '创建者ID'
  }
}, {
  tableName: 'multi_unit_ac_groups',
  indexes: [
    { fields: ['tenant_id'] },
    { fields: ['created_by'] }
  ]
});

// 多联机分组成员模型
db.MultiUnitAcGroupMember = sequelize.define('MultiUnitAcGroupMember', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  group_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'multi_unit_ac_groups',
      key: 'id'
    },
    comment: '分组ID'
  },
  host_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'multi_unit_ac_hosts',
      key: 'id'
    },
    comment: '主机ID'
  },
  indoor_unit_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'multi_unit_ac_indoor_units',
      key: 'id'
    },
    comment: '内机ID'
  }
}, {
  tableName: 'multi_unit_ac_group_members',
  indexes: [
    { fields: ['group_id'] },
    { fields: ['host_id'] },
    { fields: ['indoor_unit_id'] },
    { fields: ['group_id', 'host_id', 'indoor_unit_id'], unique: true }
  ]
});

// 多联机模型关联关系
db.MultiUnitAcHost.belongsTo(db.Device, { foreignKey: 'device_id', as: 'device' });
db.MultiUnitAcHost.belongsTo(db.Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
db.MultiUnitAcHost.belongsTo(db.User, { foreignKey: 'created_by', as: 'creator' });
db.MultiUnitAcHost.hasMany(db.MultiUnitAcIndoorUnit, { foreignKey: 'host_id', as: 'indoor_units' });
db.MultiUnitAcHost.hasMany(db.MultiUnitAcControlLog, { foreignKey: 'host_id', as: 'control_logs' });
db.MultiUnitAcHost.hasMany(db.MultiUnitAcRuntimeStat, { foreignKey: 'host_id', as: 'runtime_stats' });

db.MultiUnitAcIndoorUnit.belongsTo(db.MultiUnitAcHost, { foreignKey: 'host_id', as: 'host' });
db.MultiUnitAcIndoorUnit.hasMany(db.MultiUnitAcControlLog, { foreignKey: 'indoor_unit_id', as: 'control_logs' });
db.MultiUnitAcIndoorUnit.hasMany(db.MultiUnitAcRuntimeStat, { foreignKey: 'indoor_unit_id', as: 'runtime_stats' });

db.MultiUnitAcControlLog.belongsTo(db.MultiUnitAcHost, { foreignKey: 'host_id', as: 'host' });
db.MultiUnitAcControlLog.belongsTo(db.MultiUnitAcIndoorUnit, { foreignKey: 'indoor_unit_id', as: 'indoor_unit' });
db.MultiUnitAcControlLog.belongsTo(db.User, { foreignKey: 'user_id', as: 'user' });

db.MultiUnitAcRuntimeStat.belongsTo(db.MultiUnitAcHost, { foreignKey: 'host_id', as: 'host' });
db.MultiUnitAcRuntimeStat.belongsTo(db.MultiUnitAcIndoorUnit, { foreignKey: 'indoor_unit_id', as: 'indoor_unit' });

db.MultiUnitAcGroup.belongsTo(db.Tenant, { foreignKey: 'tenant_id', as: 'tenant' });
db.MultiUnitAcGroup.belongsTo(db.User, { foreignKey: 'created_by', as: 'creator' });
db.MultiUnitAcGroup.hasMany(db.MultiUnitAcGroupMember, { foreignKey: 'group_id', as: 'members' });

db.MultiUnitAcGroupMember.belongsTo(db.MultiUnitAcGroup, { foreignKey: 'group_id', as: 'group' });
db.MultiUnitAcGroupMember.belongsTo(db.MultiUnitAcHost, { foreignKey: 'host_id', as: 'host' });
db.MultiUnitAcGroupMember.belongsTo(db.MultiUnitAcIndoorUnit, { foreignKey: 'indoor_unit_id', as: 'indoor_unit' });

// 反向关联
db.Device.hasMany(db.MultiUnitAcHost, { foreignKey: 'device_id', as: 'multi_unit_ac_hosts' });
db.Tenant.hasMany(db.MultiUnitAcHost, { foreignKey: 'tenant_id', as: 'multi_unit_ac_hosts' });
db.Tenant.hasMany(db.MultiUnitAcGroup, { foreignKey: 'tenant_id', as: 'multi_unit_ac_groups' });
db.User.hasMany(db.MultiUnitAcHost, { foreignKey: 'created_by', as: 'created_multi_unit_ac_hosts' });
db.User.hasMany(db.MultiUnitAcGroup, { foreignKey: 'created_by', as: 'created_multi_unit_ac_groups' });

// 导入 MultiUnitAc 模型
// 导入 MultiUnitAc 类
const { MultiUnitAc } = require('./MultiUnitAc');
db.MultiUnitAc = MultiUnitAc;

// 添加 Sequelize 实例和 Sequelize 类到 db 对象
db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
