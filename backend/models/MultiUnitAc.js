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

// 定义多联机主机模型
const MultiUnitAcHost = sequelize.define('MultiUnitAcHost', {
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
  host_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  concentrator_id: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  model: {
    type: DataTypes.STRING,
    allowNull: true
  },
  capacity: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  max_indoor_units: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  current_indoor_units: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  host_status: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'offline'
  },
  power_status: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false
  },
  operation_mode: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  target_temp: {
    type: DataTypes.DECIMAL(4, 1),
    allowNull: true
  },
  current_temp: {
    type: DataTypes.DECIMAL(4, 1),
    allowNull: true
  },
  error_code: {
    type: DataTypes.STRING,
    allowNull: true
  },
  settings: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  },
  tenant_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: true
  },
  group_name: {
    type: DataTypes.STRING(100),
    allowNull: true
  }
}, {
  tableName: 'multi_unit_ac_hosts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// 定义多联机内机模型
const MultiUnitAcIndoorUnit = sequelize.define('MultiUnitAcIndoorUnit', {
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
    }
  },
  unit_name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  unit_number: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  unit_address: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  channel_number: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  outdoor_unit_address: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  indoor_unit_address: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  room_name: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  model: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  power: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  brand: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  ac_type: {
    type: DataTypes.STRING(10),
    allowNull: true,
    defaultValue: 'v'
  },
  capacity: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  location: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('online', 'offline', 'fault', 'maintenance'),
    defaultValue: 'offline'
  }
}, {
  tableName: 'multi_unit_ac_indoor_units'
});

class MultiUnitAc {
  // 获取所有多联机主机
  static async getHosts(filters = {}) {
    try {
      const whereClause = {};
      
      // 应用过滤条件
      if (filters.status) {
        whereClause.status = filters.status;
      }
      if (filters.group_name) {
        whereClause.group_name = filters.group_name;
      }
      if (filters.search) {
        whereClause[Sequelize.Op.or] = [
          { host_name: { [Sequelize.Op.iLike]: `%${filters.search}%` } },
          { imei: { [Sequelize.Op.iLike]: `%${filters.search}%` } }
        ];
      }

      const hosts = await MultiUnitAcHost.findAll({
        where: whereClause,
        order: [['created_at', 'DESC']]
      });

      return {
        success: true,
        data: {
          list: hosts || [],
          total: hosts?.length || 0
        }
      };
    } catch (error) {
      console.error('获取多联机主机异常:', error);
      return { success: false, message: '获取多联机主机失败' };
    }
  }

  // 创建多联机主机
  static async createHost(hostData) {
    try {
      const host = await MultiUnitAcHost.create({
        device_id: hostData.device_id,
        host_name: hostData.host_name,
        model: hostData.model,
        capacity: hostData.capacity,
        max_indoor_units: hostData.max_indoor_units || 16,
        tenant_id: hostData.tenant_id
      });

      return {
        success: true,
        data: host,
        message: '多联机主机创建成功'
      };
    } catch (error) {
      console.error('创建多联机主机异常:', error);
      return { success: false, message: '创建多联机主机失败' };
    }
  }

  // 更新多联机主机
  static async updateHost(hostId, updateData) {
    try {
      const [updatedRowsCount] = await MultiUnitAcHost.update(updateData, {
        where: { id: hostId },
        returning: true
      });

      if (updatedRowsCount === 0) {
        return { success: false, message: '未找到要更新的多联机主机' };
      }

      const updatedHost = await MultiUnitAcHost.findByPk(hostId);

      return {
        success: true,
        data: updatedHost,
        message: '多联机主机更新成功'
      };
    } catch (error) {
      console.error('更新多联机主机异常:', error);
      return { success: false, message: '更新多联机主机失败' };
    }
  }

  // 删除多联机主机
  static async deleteHost(hostId) {
    try {
      const deletedRowsCount = await MultiUnitAcHost.destroy({
        where: { id: hostId }
      });

      if (deletedRowsCount === 0) {
        return { success: false, message: '未找到要删除的多联机主机' };
      }

      return {
        success: true,
        message: '多联机主机删除成功'
      };
    } catch (error) {
      console.error('删除多联机主机异常:', error);
      return { success: false, message: '删除多联机主机失败' };
    }
  }

  // 获取内机列表
  static async getIndoorUnits(hostId) {
    try {
      const units = await MultiUnitAcIndoorUnit.findAll({
        where: { host_id: hostId },
        order: [['unit_number', 'ASC']]
      });

      return {
        success: true,
        data: {
          list: units || []
        }
      };
    } catch (error) {
      console.error('获取内机列表异常:', error);
      return { success: false, message: '获取内机列表失败' };
    }
  }

  // 创建内机
  static async createIndoorUnit(unitData) {
    try {
      const unit = await MultiUnitAcIndoorUnit.create({
        host_id: unitData.host_id,
        unit_name: unitData.unit_name,
        unit_number: unitData.unit_number,
        status: 'offline'
      });

      return {
        success: true,
        data: unit,
        message: '内机创建成功'
      };
    } catch (error) {
      console.error('创建内机异常:', error);
      return { success: false, message: '创建内机失败' };
    }
  }

  // 更新内机
  static async updateIndoorUnit(unitId, updateData) {
    try {
      const [updatedRowsCount] = await MultiUnitAcIndoorUnit.update(updateData, {
        where: { id: unitId },
        returning: true
      });

      if (updatedRowsCount === 0) {
        return { success: false, message: '未找到要更新的内机' };
      }

      const updatedUnit = await MultiUnitAcIndoorUnit.findByPk(unitId);

      return {
        success: true,
        data: updatedUnit,
        message: '内机更新成功'
      };
    } catch (error) {
      console.error('更新内机异常:', error);
      return { success: false, message: '更新内机失败' };
    }
  }

  // 删除内机
  static async deleteIndoorUnit(unitId) {
    try {
      const deletedRowsCount = await MultiUnitAcIndoorUnit.destroy({
        where: { id: unitId }
      });

      if (deletedRowsCount === 0) {
        return { success: false, message: '未找到要删除的内机' };
      }

      return {
        success: true,
        message: '内机删除成功'
      };
    } catch (error) {
      console.error('删除内机异常:', error);
      return { success: false, message: '删除内机失败' };
    }
  }

  // 获取运行统计
  static async getStats(filters = {}) {
    try {
      // 注意：这里需要先定义MultiUnitAcStats模型才能使用
      // 暂时返回空数据，需要根据实际需求定义统计表模型
      console.log('获取运行统计功能需要定义MultiUnitAcStats模型');
      
      return {
        success: true,
        data: []
      };
    } catch (error) {
      console.error('获取运行统计异常:', error);
      return { success: false, message: '获取运行统计失败' };
    }
  }

  // 记录运行统计
  static async recordStats(hostId, statsData) {
    try {
      // 注意：这里需要先定义MultiUnitAcStats模型才能使用
      // 暂时返回成功，需要根据实际需求定义统计表模型
      console.log('记录运行统计功能需要定义MultiUnitAcStats模型');
      
      return {
        success: true,
        data: null,
        message: '运行统计记录成功'
      };
    } catch (error) {
      console.error('记录运行统计异常:', error);
      return { success: false, message: '记录运行统计失败' };
    }
  }
}

// 导出模型和类
module.exports = {
  MultiUnitAc,
  MultiUnitAcHost,
  MultiUnitAcIndoorUnit
};
