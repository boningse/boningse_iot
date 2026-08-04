const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../utils/database');
const logger = require('../utils/logger');

/**
 * JWT令牌验证中间件 - 优化版本，减少401错误
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      // 对于某些公开接口，可能不需要强制认证
      if (req.path.includes('/public') || req.method === 'OPTIONS') {
        return next();
      }
      return res.status(401).json({
        success: false,
        message: '访问令牌缺失',
        code: 'TOKEN_MISSING'
      });
    }

    // 验证JWT令牌
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      // 更详细的JWT错误处理
      if (jwtError.name === 'TokenExpiredError') {
        logger.info('Token expired', {
          ip: req.ip,
          path: req.path,
          expiredAt: jwtError.expiredAt
        });
        return res.status(401).json({
          success: false,
          message: 'Token已过期，请重新登录',
          code: 'TOKEN_EXPIRED'
        });
      }
      
      if (jwtError.name === 'JsonWebTokenError') {
        logger.warn('Invalid JWT token format', {
          error: jwtError.message,
          ip: req.ip,
          path: req.path
        });
        return res.status(401).json({
          success: false,
          message: 'Token格式无效',
          code: 'TOKEN_INVALID'
        });
      }
      
      throw jwtError; // 其他JWT错误继续抛出
    }

    // 获取用户信息 - 优化查询性能
    let userResult;
    try {
      // 兼容不同的token字段名：id 或 userId
      const userId = decoded.id || decoded.userId;
      
      // 添加调试日志
      logger.debug('JWT token验证过程', {
        decodedId: decoded.id,
        decodedUserId: decoded.userId,
        finalUserId: userId,
        tokenPayload: decoded,
        ip: req.ip,
        path: req.path
      });
      
      userResult = await db.query(
        `SELECT u.id, u.username, u.email, u.role, u.status, u.tenant_id, u.profile, u.created_at,
                t.name as tenant_name, t.status as tenant_status 
         FROM users u 
         LEFT JOIN tenants t ON u.tenant_id = t.id 
         WHERE u.id = $1 AND u.status = 'active'`,
        [userId]
      );
      
      // 添加查询结果日志
      logger.debug('用户查询结果', {
        userId: userId,
        rowCount: userResult.rows.length,
        userFound: userResult.rows.length > 0,
        ip: req.ip,
        path: req.path
      });
      
    } catch (dbError) {
      logger.error('Database error during authentication', {
        error: dbError.message,
        userId: decoded.id || decoded.userId,
        ip: req.ip
      });
      return res.status(500).json({
        success: false,
        message: '认证服务暂时不可用',
        code: 'AUTH_SERVICE_ERROR'
      });
    }

    if (userResult.rows.length === 0) {
      const userId = decoded.id || decoded.userId;
      logger.warn('User not found or inactive', {
        userId: userId,
        ip: req.ip,
        path: req.path
      });
      return res.status(401).json({
        success: false,
        message: '用户不存在或已被禁用',
        code: 'USER_NOT_FOUND'
      });
    }

    const user = userResult.rows[0];

    // 检查租户状态（如果用户属于租户）
    if (user.tenant_id && user.tenant_status !== 'active') {
      logger.warn('User from inactive tenant attempted access', {
        userId: user.id,
        tenantId: user.tenant_id,
        tenantStatus: user.tenant_status,
        ip: req.ip
      });
      return res.status(401).json({
        success: false,
        message: '所属租户已被禁用',
        code: 'TENANT_INACTIVE'
      });
    }

    // 异步更新用户最后活跃时间（不阻塞请求）
    setImmediate(async () => {
      try {
        await db.query(
          'UPDATE users SET last_login_at = NOW() WHERE id = $1',
          [user.id]
        );
      } catch (updateError) {
        logger.warn('Failed to update last login time', {
          userId: user.id,
          error: updateError.message
        });
      }
    });

    // 将用户信息添加到请求对象
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      tenant_id: user.tenant_id,
      tenant_name: user.tenant_name,
      tenant_status: user.tenant_status,
      permissions: (user.profile && user.profile.permissions) || [],
      profile: user.profile || {},
      created_at: user.created_at
    };

    // 只在调试模式下记录成功的认证
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Token authenticated successfully', {
        userId: user.id,
        ip: req.ip,
        path: req.path,
        method: req.method
      });
    }

    next();
  } catch (error) {
    logger.error('Unexpected authentication error', {
      error: error.message,
      stack: error.stack,
      ip: req.ip,
      path: req.path
    });

    return res.status(500).json({
      success: false,
      message: '认证过程中发生错误',
      code: 'AUTH_ERROR'
    });
  }
};

// 角色授权中间件
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    const effectiveAllowedRoles = allowedRoles.includes('user')
      ? [...allowedRoles, 'building_user', 'group_user']
      : allowedRoles;

    if (!effectiveAllowedRoles.includes(userRole)) {
      logger.security('Insufficient role permissions', {
        userId: req.user.id,
        userRole,
        requiredRoles: effectiveAllowedRoles,
        ip: req.ip,
        path: req.path
      });

      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

// 权限检查中间件
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // 管理员拥有所有权限
    if (req.user.role === 'admin') {
      return next();
    }

    // tenant_admin 拥有 lighting 权限
    if (req.user.role === 'tenant_admin' && permission === 'lighting') {
      return next();
    }

    const userPermissions = req.user.permissions || [];
    const permissionAliases = {
      lighting: ['switch-control']
    };
    const allowedPermissions = [permission, ...(permissionAliases[permission] || [])];

    if (!allowedPermissions.some(item => userPermissions.includes(item))) {
      logger.security('Insufficient permissions', {
        userId: req.user.id,
        requiredPermission: permission,
        userPermissions,
        ip: req.ip,
        path: req.path
      });

      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

// 兼容性别名
const checkPermission = requireRole;

// 管理员权限检查
const requireAdmin = requireRole(['admin']);

// 租户管理员权限检查
const requireTenantAdmin = requireRole(['admin', 'tenant_admin']);

/**
 * 租户数据访问权限检查
 * 确保用户只能访问自己租户的数据
 */
const checkTenantAccess = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '用户未认证'
      });
    }

    // 管理员可以访问所有租户数据
    if (req.user.role === 'admin') {
      return next();
    }

    // 检查请求中的租户ID
    const requestedTenantId = req.params.tenantId || req.body.tenant_id || req.query.tenantId;

    if (requestedTenantId && parseInt(requestedTenantId) !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权访问其他租户的数据'
      });
    }

    next();
  } catch (error) {
    console.error('租户访问权限检查失败:', error);
    res.status(500).json({
      success: false,
      message: '权限检查失败',
      error: error.message
    });
  }
};

/**
 * 租户数据访问权限检查
 * 确保用户只能访问自己租户的数据
 */
const requireTenantAccess = (req, res, next) => {
  try {
    if (!req.user) {
      logger.logSecurityEvent('unauthorized_tenant_access_attempt', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });
      return res.status(401).json({
        success: false,
        message: '用户未认证'
      });
    }

    // 管理员可以访问所有租户数据
    if (req.user.role === 'admin') {
      return next();
    }

    // 检查请求中的租户ID
    const requestedTenantId = req.params.tenantId || req.body.tenant_id || req.query.tenantId;

    if (requestedTenantId && parseInt(requestedTenantId) !== req.user.tenant_id) {
      logger.logSecurityEvent('unauthorized_tenant_access', {
        userId: req.user.id,
        userTenantId: req.user.tenant_id,
        requestedTenantId,
        ip: req.ip,
        path: req.path
      });
      return res.status(403).json({
        success: false,
        message: '无权访问其他租户的数据'
      });
    }

    next();
  } catch (error) {
    logger.error('租户访问权限检查失败', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '权限检查失败'
    });
  }
};

/**
 * 设备访问权限检查
 * 确保用户只能访问自己租户下的设备
 */
const requireDeviceAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '用户未认证'
      });
    }

    // 管理员可以访问所有设备
    if (req.user.role === 'admin') {
      return next();
    }

    const deviceId = req.params.deviceId || req.body.device_id || req.query.deviceId;

    if (deviceId) {
      // 检查设备是否属于用户的租户
      const device = await db.query(
        'SELECT tenant_id FROM devices WHERE id = $1',
        [deviceId]
      );

      if (!device.rows.length) {
        return res.status(404).json({
          success: false,
          message: '设备不存在'
        });
      }

      if (device.rows[0].tenant_id !== req.user.tenant_id) {
        logger.logSecurityEvent('unauthorized_device_access', {
          userId: req.user.id,
          userTenantId: req.user.tenant_id,
          deviceId,
          deviceTenantId: device.rows[0].tenant_id,
          ip: req.ip,
          path: req.path
        });
        return res.status(403).json({
          success: false,
          message: '无权访问该设备'
        });
      }
    }

    next();
  } catch (error) {
    logger.error('设备访问权限检查失败', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '权限检查失败'
    });
  }
};

/**
 * 可选的令牌验证中间件
 * 如果提供了令牌则验证，否则继续执行
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 查询用户信息
      const userResult = await db.query(
        `SELECT u.*, t.name as tenant_name, t.status as tenant_status 
         FROM users u 
         LEFT JOIN tenants t ON u.tenant_id = t.id 
         WHERE u.id = $1`,
        [decoded.id]
      );

      if (userResult.rows.length && userResult.rows[0].status === 'active') {
        const user = userResult.rows[0];
        req.user = {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          tenant_id: user.tenant_id,
          status: user.status,
          tenant: {
            id: user.tenant_id,
            name: user.tenant_name,
            status: user.tenant_status
          }
        };
      }
    } catch (tokenError) {
      // 令牌无效，但不阻止请求继续
      logger.warn('可选认证令牌无效', { error: tokenError.message });
    }

    next();
  } catch (error) {
    logger.error('可选认证失败', { error: error.message, stack: error.stack });
    next(); // 继续执行，不阻止请求
  }
};

/**
 * API密钥认证中间件
 */
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API密钥缺失'
      });
    }

    // 查询API密钥
    const keyResult = await db.query(
      `SELECT ak.*, u.id as user_id, u.username, u.role, u.tenant_id, u.status as user_status,
              t.name as tenant_name, t.status as tenant_status
       FROM api_keys ak
       JOIN users u ON ak.user_id = u.id
       LEFT JOIN tenants t ON u.tenant_id = t.id
       WHERE ak.key_hash = $1 AND ak.status = 'active' AND ak.expires_at > NOW()`,
      [apiKey]
    );

    if (!keyResult.rows.length) {
      logger.logSecurityEvent('invalid_api_key_attempt', {
        apiKey: apiKey.substring(0, 8) + '...',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });
      return res.status(401).json({
        success: false,
        message: '无效的API密钥'
      });
    }

    const keyData = keyResult.rows[0];

    // 检查用户状态
    if (keyData.user_status !== 'active') {
      return res.status(401).json({
        success: false,
        message: '用户账户已被禁用'
      });
    }

    // 检查租户状态
    if (keyData.tenant_status !== 'active') {
      return res.status(401).json({
        success: false,
        message: '租户账户已被禁用'
      });
    }

    // 更新API密钥最后使用时间
    await db.query(
      'UPDATE api_keys SET last_used_at = NOW(), usage_count = usage_count + 1 WHERE id = $1',
      [keyData.id]
    );

    // 设置用户信息
    req.user = {
      id: keyData.user_id,
      username: keyData.username,
      role: keyData.role,
      tenant_id: keyData.tenant_id,
      status: keyData.user_status,
      tenant: {
        id: keyData.tenant_id,
        name: keyData.tenant_name,
        status: keyData.tenant_status
      },
      apiKey: {
        id: keyData.id,
        name: keyData.name,
        permissions: keyData.permissions
      }
    };

    req.authMethod = 'api_key';

    logger.logUserBehavior('api_key_used', {
      userId: keyData.user_id,
      apiKeyId: keyData.id,
      apiKeyName: keyData.name,
      ip: req.ip,
      path: req.path
    });

    next();
  } catch (error) {
    logger.error('API密钥认证失败', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '认证失败'
    });
  }
};

/**
 * 生成JWT令牌
 * @param {Object} payload - 令牌载荷
 * @param {string} expiresIn - 过期时间
 */
const generateToken = (payload, expiresIn = process.env.JWT_EXPIRES_IN || '24h') => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

/**
 * 生成刷新令牌
 * @param {Object} payload - 令牌载荷
 */
const generateRefreshToken = (payload, expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d') => {
  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

/**
 * 验证刷新令牌
 * @param {string} token - 刷新令牌
 */
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('无效的刷新令牌');
  }
};

/**
 * 从请求头中提取令牌
 * @param {Object} req - 请求对象
 */
const extractToken = (req) => {
  const authHeader = req.headers['authorization'];
  return authHeader && authHeader.split(' ')[1];
};

/**
 * 检查令牌是否即将过期
 * @param {string} token - JWT令牌
 * @param {number} threshold - 阈值（秒），默认1小时
 */
const isTokenExpiringSoon = (token, threshold = 3600) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = decoded.exp - now;

    return timeUntilExpiry <= threshold;
  } catch (error) {
    return false;
  }
};

/**
 * 令牌黑名单中间件（可选实现）
 * 在生产环境中，可以使用Redis等缓存来维护令牌黑名单
 */
const checkTokenBlacklist = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return next();
    }

    // 这里可以检查令牌是否在黑名单中
    // 例如：const isBlacklisted = await redis.get(`blacklist:${token}`);
    // if (isBlacklisted) {
    //   return res.status(401).json({
    //     success: false,
    //     message: '令牌已被撤销'
    //   });
    // }

    next();
  } catch (error) {
    console.error('令牌黑名单检查失败:', error);
    next();
  }
};

/**
 * 创建速率限制中间件
 * @param {Object} options - 配置选项
 */
const createRateLimit = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15分钟
    max = 100, // 最大请求数
    message = '请求过于频繁，请稍后再试',
    keyGenerator = (req) => req.ip,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    skip = null // 新增skip选项
  } = options;

  const requests = new Map();

  return (req, res, next) => {
    // 如果有skip函数且返回true，则跳过限流
    if (skip && skip(req, res)) {
      return next();
    }

    const key = keyGenerator(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    // 清理过期的请求记录
    if (requests.has(key)) {
      const keyRequests = requests.get(key).filter(time => time > windowStart);
      requests.set(key, keyRequests);
    } else {
      requests.set(key, []);
    }

    const keyRequests = requests.get(key);

    if (keyRequests.length >= max) {
      logger.logSecurityEvent('rate_limit_exceeded', {
        key,
        ip: req.ip,
        path: req.path,
        userAgent: req.get('User-Agent'),
        requestCount: keyRequests.length
      });

      return res.status(429).json({
        success: false,
        message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }

    keyRequests.push(now);

    // 记录原始的res.json方法
    const originalJson = res.json;
    res.json = function (body) {
      const statusCode = res.statusCode;

      // 根据配置决定是否跳过计数
      if ((skipSuccessfulRequests && statusCode < 400) ||
        (skipFailedRequests && statusCode >= 400)) {
        keyRequests.pop(); // 移除刚才添加的请求
      }

      return originalJson.call(this, body);
    };

    next();
  };
};

/**
 * 登录速率限制
 */
const loginRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 20,
  message: '登录尝试过于频繁，请15分钟后再试',
  keyGenerator: (req) => `login:${req.ip}`,
  skipSuccessfulRequests: true
});

/**
 * API速率限制
 */
const apiRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 1000, // 每15分钟1000次请求
  keyGenerator: (req) => req.user ? `user:${req.user.id}` : `ip:${req.ip}`
});

/**
 * 严格速率限制（用于敏感操作）
 */
const strictRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 10, // 每小时10次
  message: '敏感操作过于频繁，请1小时后再试',
  keyGenerator: (req) => req.user ? `strict:${req.user.id}` : `strict:${req.ip}`
});

/**
 * 基于用户的速率限制
 */
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  return createRateLimit({
    windowMs,
    max: maxRequests,
    keyGenerator: (req) => req.user ? `user:${req.user.id}` : `ip:${req.ip}`
  });
};

module.exports = {
  // 认证中间件
  authenticateToken,
  authenticateApiKey,
  optionalAuth,

  // 权限检查中间件
  requireRole,
  requirePermission,
  requireAdmin,
  requireTenantAdmin,
  requireTenantAccess,
  requireDeviceAccess,

  // 速率限制中间件
  createRateLimit,
  loginRateLimit,
  apiRateLimit,
  strictRateLimit,
  userRateLimit,

  // 令牌工具函数
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  extractToken,
  isTokenExpiringSoon,
  checkTokenBlacklist,

  // 兼容性别名
  checkPermission,
  checkTenantAccess: requireTenantAccess
};
