const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

/**
 * 数据库配置
 */
const config = {
  development: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'iot_device_management',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    dialect: process.env.DB_DIALECT || 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
      min: parseInt(process.env.DB_POOL_MIN, 10) || 2,
      acquire: parseInt(process.env.DB_CONNECTION_TIMEOUT, 10) || 60000,
      idle: parseInt(process.env.DB_IDLE_TIMEOUT, 10) || 30000,
      evict: parseInt(process.env.DB_POOL_EVICT, 10) || 5000
    },
    dialectOptions: {
      dateStrings: true
    },
    timezone: '+08:00'
  },

  test: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'iot_management_test',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  },

  production: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    dialect: 'postgres',
    logging: false,
    pool: {
      max: parseInt(process.env.DB_POOL_MAX, 10) || 30,
      min: parseInt(process.env.DB_POOL_MIN, 10) || 2,
      acquire: parseInt(process.env.DB_CONNECTION_TIMEOUT, 10) || 60000,
      idle: parseInt(process.env.DB_IDLE_TIMEOUT, 10) || 30000,
      evict: parseInt(process.env.DB_POOL_EVICT, 10) || 5000
    },
    dialectOptions: {
      ssl: process.env.DB_SSL === 'true' ? {
        require: true,
        rejectUnauthorized: false
      } : false
    },
    timezone: '+08:00'
  }
};

// 获取当前环境配置
const env = process.env.NODE_ENV || 'development';
const currentConfig = config[env];

/**
 * 数据库初始化SQL脚本路径
 */
const sqlScriptsPath = path.join(__dirname, '../sql');

/**
 * 读取SQL脚本文件
 * @param {string} filename - SQL文件名
 * @returns {string} SQL内容
 */
const readSqlFile = (filename) => {
  const filePath = path.join(sqlScriptsPath, filename);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8');
  }
  throw new Error(`SQL文件不存在: ${filename}`);
};

/**
 * 获取所有初始化脚本
 * @returns {Array} 脚本列表
 */
const getInitScripts = () => {
  const scripts = [
    '01_create_tables.sql',
    '02_create_indexes.sql',
    '03_insert_default_data.sql',
    '04_create_functions.sql',
    '05_create_triggers.sql'
  ];

  return scripts.map(script => ({
    name: script,
    content: readSqlFile(script)
  }));
};

/**
 * 数据库连接字符串
 */
const getConnectionString = () => {
  const { host, port, database, username, password } = currentConfig;
  return `postgresql://${username}:${password}@${host}:${port}/${database}`;
};

/**
 * 数据库连接配置（用于pg库）
 */
const getPoolConfig = () => {
  return {
    host: currentConfig.host,
    port: currentConfig.port,
    database: currentConfig.database,
    user: currentConfig.username,
    password: currentConfig.password,
    max: currentConfig.pool.max,
    min: currentConfig.pool.min,
    idleTimeoutMillis: currentConfig.pool.idle,
    connectionTimeoutMillis: currentConfig.pool.acquire,
    ssl: currentConfig.dialectOptions?.ssl || false
  };
};

/**
 * 验证数据库配置
 */
const validateConfig = () => {
  const required = ['host', 'port', 'database', 'username', 'password'];
  const missing = required.filter(key => !currentConfig[key]);

  if (missing.length > 0) {
    throw new Error(`缺少必要的数据库配置: ${missing.join(', ')}`);
  }

  return true;
};

/**
 * 创建Sequelize实例
 */
const sequelize = new Sequelize(
  currentConfig.database,
  currentConfig.username,
  currentConfig.password,
  {
    host: currentConfig.host,
    port: currentConfig.port,
    dialect: currentConfig.dialect,
    timezone: currentConfig.timezone,
    logging: currentConfig.logging,
    pool: currentConfig.pool,
    define: {
      timestamps: true, // 自动添加createdAt和updatedAt字段
      underscored: true, // 使用下划线命名
      freezeTableName: true // 禁用表名复数化
    }
  }
);

/**
 * 测试数据库连接
 */
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('数据库连接测试成功');
    return true;
  } catch (error) {
    console.error('数据库连接测试失败:', error.message);
    return false;
  }
};

/**
 * 同步数据库模型
 */
const syncDatabase = async (options = {}) => {
  try {
    const defaultOptions = {
      force: false, // 是否强制重建表
      alter: process.env.NODE_ENV === 'development' // 开发环境下自动修改表结构
    };

    await sequelize.sync({ ...defaultOptions, ...options });
    console.log('数据库模型同步成功');
    return true;
  } catch (error) {
    console.error('数据库模型同步失败:', error.message);
    return false;
  }
};

/**
 * 关闭数据库连接
 */
const closeConnection = async () => {
  try {
    await sequelize.close();
    console.log('数据库连接已关闭');
  } catch (error) {
    console.error('关闭数据库连接失败:', error.message);
  }
};

/**
 * 数据库备份配置
 */
const backupConfig = {
  enabled: process.env.DB_BACKUP_ENABLED === 'true',
  schedule: process.env.DB_BACKUP_SCHEDULE || '0 2 * * *', // 每天凌晨2点
  retention: parseInt(process.env.DB_BACKUP_RETENTION) || 7, // 保留7天
  path: process.env.DB_BACKUP_PATH || path.join(__dirname, '../backups'),
  compress: process.env.DB_BACKUP_COMPRESS === 'true'
};

/**
 * 数据库监控配置
 */
const monitorConfig = {
  enabled: process.env.DB_MONITOR_ENABLED === 'true',
  slowQueryThreshold: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD) || 1000, // 1秒
  connectionCheckInterval: parseInt(process.env.DB_CONNECTION_CHECK_INTERVAL) || 30000, // 30秒
  healthCheckTimeout: parseInt(process.env.DB_HEALTH_CHECK_TIMEOUT) || 5000 // 5秒
};

module.exports = {
  // Sequelize实例
  sequelize,

  // 配置对象
  config,
  currentConfig,
  env,

  // SQL脚本工具
  readSqlFile,
  getInitScripts,

  // 连接配置工具
  getConnectionString,
  getPoolConfig,
  validateConfig,

  // 数据库操作
  testConnection,
  syncDatabase,
  closeConnection,

  // 扩展配置
  backupConfig,
  monitorConfig
};
