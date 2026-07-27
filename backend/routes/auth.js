const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { User, Tenant } = require('../models');
const {
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  authenticateToken,
  optionalAuth
} = require('../middleware/auth');
const {
  validateUserLogin,
  validateUserRegister,
  validateChangePassword
} = require('../middleware/validation');
const logger = require('../utils/logger');

const router = express.Router();

// 登录速率限制
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 20,
  message: {
    success: false,
    message: '登录尝试次数过多，请15分钟后再试'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true
});

// 注册速率限制
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 10,
  message: {
    success: false,
    message: '注册尝试次数过多，请1小时后再试'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * @route POST /api/auth/login
 * @desc 用户登录
 * @access Public
 */
router.post('/login', loginLimiter, validateUserLogin, async (req, res) => {
  try {
    const { username, password } = req.body;

    // 查找用户（支持用户名或邮箱登录）
    const user = await User.findOne({
      where: {
        [require('sequelize').Op.or]: [
          { username },
          { email: username }
        ]
      },
      include: [{
        model: Tenant,
        as: 'tenant',
        attributes: ['id', 'name', 'code', 'status', 'expire_date']
      }]
    });

    if (!user) {
      logger.warn('Login attempt with invalid username', { username, ip: req.ip });
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }

    // 检查用户状态
    if (user.status !== 'active') {
      logger.warn('Login attempt with inactive user', { userId: user.id, status: user.status });
      return res.status(401).json({
        success: false,
        message: '账户已被禁用，请联系管理员'
      });
    }

    // 验证密码
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      logger.warn('Login attempt with invalid password', { userId: user.id, ip: req.ip });
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }

    // 检查租户状态（如果用户属于某个租户）
    if (user.tenant && user.tenant.status !== 'active') {
      logger.warn('Login attempt with inactive tenant', {
        userId: user.id,
        tenantId: user.tenant.id,
        tenantStatus: user.tenant.status
      });
      return res.status(401).json({
        success: false,
        message: '所属租户已被禁用，请联系管理员'
      });
    }

    // 检查租户是否过期
    if (user.tenant && user.tenant.expire_date && new Date() > user.tenant.expire_date) {
      logger.warn('Login attempt with expired tenant', {
        userId: user.id,
        tenantId: user.tenant.id,
        expireDate: user.tenant.expire_date
      });
      return res.status(401).json({
        success: false,
        message: '所属租户已过期，请联系管理员续费'
      });
    }

    // 更新最后登录时间
    await user.update({
      last_login_at: new Date()
    });

    // 生成令牌
    const userPayload = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    };
    
    // 只有非admin用户才在token中包含tenant_id
    if (user.role !== 'admin') {
      userPayload.tenant_id = user.tenant_id;
    }

    // 确保payload是普通对象
    const plainPayload = JSON.parse(JSON.stringify(userPayload));
    const token = generateToken(plainPayload);
    const refreshToken = generateRefreshToken(plainPayload);

    logger.info('User logged in successfully', {
      userId: user.id,
      username: user.username,
      ip: req.ip
    });

    res.json({
      success: true,
      message: '登录成功',
      data: {
        token,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          real_name: user.profile?.real_name || '',
          role: user.role,
          status: user.status,
          profile: {
            ...user.profile || {},
            permissions: user.profile?.permissions || []
          },
          tenant: user.tenant ? {
            id: user.tenant.id,
            name: user.tenant.name,
            code: user.tenant.code
          } : null,
          last_login_at: user.last_login_at
        }
      }
    });
  } catch (error) {
    logger.error('Login error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '登录失败，请稍后重试'
    });
  }
});

/**
 * @route POST /api/auth/register
 * @desc 用户注册
 * @access Public
 */
router.post('/register', registerLimiter, validateUserRegister, async (req, res) => {
  try {
    const { username, email, password, real_name, phone, tenant_id } = req.body;

    // 检查用户名是否已存在
    const existingUser = await User.findOne({
      where: {
        [require('sequelize').Op.or]: [
          { username },
          { email }
        ]
      }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: existingUser.username === username ? '用户名已存在' : '邮箱已被注册'
      });
    }

    // 如果指定了租户ID，检查租户是否存在且有效
    let tenant = null;
    if (tenant_id) {
      tenant = await Tenant.findByPk(tenant_id);
      if (!tenant) {
        return res.status(400).json({
          success: false,
          message: '指定的租户不存在'
        });
      }
      if (tenant.status !== 'active') {
        return res.status(400).json({
          success: false,
          message: '指定的租户已被禁用'
        });
      }
    }

    // 加密密码
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 创建用户
    const user = await User.create({
      username,
      email,
      password_hash: hashedPassword,
      profile: {
        real_name: real_name || '',
        phone: phone || ''
      },
      tenant_id: tenant_id || null, // 允许为空
      role: tenant_id ? 'user' : 'admin', // 如果没有租户，默认为管理员
      status: 'active',
      created_by: null // 自注册
    });

    logger.info('User registered successfully', {
      userId: user.id,
      username: user.username,
      tenantId: tenant_id,
      ip: req.ip
    });

    res.status(201).json({
      success: true,
      message: '注册成功',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          real_name: user.profile?.real_name || '',
          role: user.role,
          status: user.status,
          tenant_id: user.tenant_id
        }
      }
    });
  } catch (error) {
    logger.error('Registration error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '注册失败，请稍后重试'
    });
  }
});

/**
 * @route POST /api/auth/refresh
 * @desc 刷新访问令牌
 * @access Public
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: '刷新令牌是必需的'
      });
    }

    // 验证刷新令牌
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: '无效的刷新令牌'
      });
    }

    // 查找用户
    const user = await User.findByPk(decoded.id, {
      include: [{
        model: Tenant,
        as: 'tenant',
        attributes: ['id', 'name', 'code', 'status', 'expire_date']
      }]
    });

    if (!user || user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: '用户不存在或已被禁用'
      });
    }

    // 检查租户状态
    if (user.tenant && user.tenant.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: '所属租户已被禁用'
      });
    }

    // 生成新的访问令牌
    const userPayload = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
    };
    
    // 只有非admin用户才在token中包含tenant_id
    if (user.role !== 'admin') {
      userPayload.tenant_id = user.tenant_id;
    }
    
    const plainPayload = JSON.parse(JSON.stringify(userPayload));
    const newToken = generateToken(plainPayload);

    res.json({
      success: true,
      message: '令牌刷新成功',
      data: {
        token: newToken
      }
    });
  } catch (error) {
    logger.error('Token refresh error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '令牌刷新失败'
    });
  }
});

/**
 * @route POST /api/auth/logout
 * @desc 用户登出
 * @access Private
 */
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // 这里可以实现令牌黑名单功能
    // 目前只是简单的响应

    logger.info('User logged out', {
      userId: req.user.id,
      username: req.user.username,
      ip: req.ip
    });

    res.json({
      success: true,
      message: '登出成功'
    });
  } catch (error) {
    logger.error('Logout error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '登出失败'
    });
  }
});

/**
 * @route GET /api/auth/me
 * @desc 获取当前用户信息
 * @access Private
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] },
      include: [{
        model: Tenant,
        as: 'tenant',
        attributes: ['id', 'name', 'code', 'status', 'expire_date', 'device_limit']
      }]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    res.json({
      success: true,
      data: {
        user
      }
    });
  } catch (error) {
    logger.error('Get user info error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '获取用户信息失败'
    });
  }
});

/**
 * @route PUT /api/auth/password
 * @desc 修改密码
 * @access Private
 */
router.put('/password', authenticateToken, validateChangePassword, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    // 查找用户
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 验证原密码
    const isValidPassword = await bcrypt.compare(oldPassword, user.password_hash);
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        message: '原密码错误'
      });
    }

    // 检查新密码是否与原密码相同
    const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: '新密码不能与原密码相同'
      });
    }

    // 加密新密码
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // 更新密码
    await user.update({
      password_hash: hashedNewPassword,
      updated_at: new Date()
    });

    logger.info('User password changed', {
      userId: user.id,
      username: user.username,
      ip: req.ip
    });

    res.json({
      success: true,
      message: '密码修改成功'
    });
  } catch (error) {
    logger.error('Change password error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      message: '密码修改失败'
    });
  }
});

/**
 * @route GET /api/auth/check
 * @desc 检查令牌有效性
 * @access Private
 */
router.get('/check', optionalAuth, (req, res) => {
  if (req.user) {
    res.json({
      success: true,
      message: '令牌有效',
      data: {
        valid: true,
        user: {
          id: req.user.id,
          username: req.user.username,
          role: req.user.role,
          tenant_id: req.user.tenant_id
        }
      }
    });
  } else {
    res.json({
      success: true,
      message: '令牌无效或已过期',
      data: {
        valid: false
      }
    });
  }
});

module.exports = router;
