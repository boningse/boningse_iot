<template>
  <div class="thermostat-control">
    <div class="page-header">
      <h2>温控控制</h2>
      <div class="header-actions">
        <el-button type="default" @click="refreshAllDevicesData" :loading="loading">
          <el-icon><Refresh /></el-icon>
          刷新数据
        </el-button>
        <el-button type="success" @click="showSceneDialog = true">
          <el-icon><MagicStick /></el-icon>
          情景模式
        </el-button>
        <el-button type="warning" @click="showScheduleDialog = true">
          <el-icon><Clock /></el-icon>
          策略管理
        </el-button>
        <el-button type="info" @click="showStatsDialog = true">
          <el-icon><DataAnalysis /></el-icon>
          运行统计
        </el-button>
        <el-button type="primary" @click="openAddDialog">
          <el-icon><Plus /></el-icon>
          添加温控器
        </el-button>
      </div>
    </div>

    <!-- 搜索和过滤区域 -->
    <div class="filter-section">
      <div class="filter-row">
        <div class="search-input">
          <el-input
            v-model="searchKeyword"
            placeholder="搜索设备名称..."
            clearable
            @input="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>
        
        <div class="filter-controls">
          <el-select
            v-if="isAdmin"
            v-model="selectedTenant"
            placeholder="所属租户"
            clearable
            filterable
            @change="handleTenantFilter"
            style="width: 150px"
          >
            <el-option label="全部租户" value="" />
            <el-option
              v-for="tenant in tenantList"
              :key="tenant.id"
              :label="tenant.name"
              :value="tenant.id"
            />
          </el-select>
          <el-select v-model="selectedBuilding" placeholder="所属建筑" clearable filterable @change="handleBuildingFilter" style="width: 150px">
            <el-option label="全部建筑" value="" />
            <el-option v-for="building in filteredBuildingOptions" :key="building.id" :label="building.name" :value="building.id" />
          </el-select>
          <el-select v-model="selectedProjectGroup" placeholder="所属分组" clearable filterable @change="handleGroupFilter" style="width: 150px">
            <el-option label="全部分组" value="" />
            <el-option v-for="group in filteredProjectGroupOptions" :key="group.id" :label="group.name" :value="group.id" />
          </el-select>
          <el-select
            v-model="selectedStatus"
            placeholder="设备状态"
            clearable
            @change="handleStatusFilter"
            style="width: 120px"
          >
            <el-option label="全部状态" value="" />
            <el-option label="运行中" value="running" />
            <el-option label="待机" value="standby" />
            <el-option label="离线" value="offline" />
          </el-select>
        </div>
        
        <div class="stats-info">
          <span class="device-count">共 {{ filteredDevices.length }} 个设备</span>
          <span class="online-count">运行中: {{ runningDevicesCount }}</span>
        </div>
      </div>
    </div>

    <!-- 温控器卡片列表 -->
    <div class="device-grid">
      <el-card 
        v-for="device in paginatedDevices" 
        :key="device.id" 
        class="thermostat-card"
        shadow="hover"
      >
        <template #header>
          <div class="modern-card-header">
            <div class="device-identity">
              <div class="device-meta">
                <h3 class="device-title">{{ device.name }}</h3>
                <span class="device-info-line">{{ device.deviceId || device.device_id || device.imei || '-' }}</span>
                <span class="device-info-line device-location">
                  {{ device.projectBuildingName || '-' }} · {{ device.projectGroupName || '-' }}
                </span>
              </div>
            </div>
            <el-tag :type="device.status === 'offline' ? 'info' : 'success'" size="small">
              {{ device.status === 'offline' ? '离线' : '在线' }}
            </el-tag>
          </div>
        </template>

        <!-- 温度显示区域 -->
        <div class="modern-temperature-section">
          <div class="temp-display-grid">
            <div class="temp-card current">
              <div class="temp-icon">
                <el-icon><Thermometer /></el-icon>
              </div>
              <div class="temp-info">
                <div class="temp-value">{{ device.currentTemp || '--' }}°</div>
                <div class="temp-label">当前温度</div>
              </div>
            </div>
            
            <div class="temp-card target">
              <div class="temp-icon">
                <el-icon><Aim /></el-icon>
              </div>
              <div class="temp-info">
                <div class="temp-value">{{ device.targetTemp || '--' }}°</div>
                <div class="temp-label">目标温度</div>
              </div>
            </div>
            
            <div class="temp-card lock" :class="{ 'locked': device.tempLocked }">
              <div class="temp-icon">
                <el-icon>
                  <Fan v-if="device.acMode === 'fan'" />
                  <Snowflake v-else-if="device.acMode === 'cool'" />
                  <Flame v-else-if="device.acMode === 'heat'" />
                  <Droplets v-else-if="device.acMode === 'dehumidify'" />
                  <Refrigerator v-else />
                </el-icon>
              </div>
              <div class="temp-info">
                <div class="temp-status">{{ getAcModeLabel(device.acMode) }}</div>
                <div class="temp-label">{{ getFanSpeedLabel(device.fanSpeed) }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 开关机控制 -->
        <div class="modern-power-section">
          <div class="power-status-card" :class="{ 'active': device.powerStatus }">
            <div class="power-indicator">
              <div class="power-icon">
                <el-icon :class="{ 'fan-rotating': device.powerStatus }"><Fan /></el-icon>
              </div>
              <div class="power-info">
                <div class="power-text">{{ device.powerStatus ? '运行中' : '已关机' }}</div>
                <div class="power-subtitle">设备状态</div>
              </div>
            </div>
            <div class="power-controls">
              <el-button 
                class="power-btn on-btn"
                type="success"
                size="small"
                @click="handlePowerOn(device)"
                :loading="device.loading"
                :disabled="device.powerStatus"
                circle
              >
                <el-icon><VideoPlay /></el-icon>
              </el-button>
              <el-button 
                class="power-btn off-btn"
                type="danger"
                size="small"
                @click="handlePowerOff(device)"
                :loading="device.loading"
                :disabled="!device.powerStatus"
                circle
              >
                <el-icon><VideoPause /></el-icon>
              </el-button>
            </div>
          </div>
        </div>

        <!-- 风速控制与空调模式控制 -->
        <div class="modern-control-section">
          <div class="control-grid">
            <div class="control-panel fan-speed">
              <div class="control-header">
                <el-icon><WindPower /></el-icon>
                <span>风速档位</span>
              </div>
              <div class="control-options">
                <el-select 
                  v-model="device.fanSpeed" 
                  @change="setFanSpeed(device, $event)"
                  :disabled="!device.powerStatus || device.loading"
                  size="small"
                  style="width: 100%"
                >
                  <el-option label="AUTO" :value="0" />
                  <el-option label="1档" :value="1" />
                  <el-option label="2档" :value="2" />
                  <el-option label="3档" :value="3" />
                </el-select>
              </div>
            </div>

            <div class="control-panel ac-mode">
              <div class="control-header">
                <el-icon><Refrigerator /></el-icon>
                <span>空调模式</span>
              </div>
              <div class="control-options">
                <el-select 
                  v-model="device.acMode" 
                  @change="setAcMode(device, $event)"
                  :disabled="!device.powerStatus || device.loading"
                  size="small"
                  style="width: 100%"
                >
                  <el-option label="送风" value="fan">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <el-icon><Fan /></el-icon>
                      <span>送风</span>
                    </div>
                  </el-option>
                  <el-option label="制冷" value="cool">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <el-icon><Snowflake /></el-icon>
                      <span>制冷</span>
                    </div>
                  </el-option>
                  <el-option label="制热" value="heat">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <el-icon><Flame /></el-icon>
                      <span>制热</span>
                    </div>
                  </el-option>
                  <el-option label="除湿" value="dehumidify">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <el-icon><Droplets /></el-icon>
                      <span>除湿</span>
                    </div>
                  </el-option>
                </el-select>
              </div>
            </div>
          </div>
        </div>

        <!-- 温度调节 -->
        <div class="modern-temp-control">
          <div class="temp-adjust-panel">
            <div class="adjust-header">
              <el-icon><Setting /></el-icon>
              <span>温度调节</span>
            </div>
            <div class="temp-adjuster">
              <el-button 
                class="adjust-btn decrease"
                type="primary" 
                size="large" 
                circle
                @click="adjustTemp(device, -1)"
                :loading="device.loading"
                :disabled="!device.powerStatus || device.tempLocked"
              >
                <el-icon><Minus /></el-icon>
              </el-button>
              
              <div class="temp-input-wrapper">
                <el-input-number
                  v-model="device.targetTemp"
                  :min="16"
                  :max="30"
                  :step="1"
                  size="large"
                  @change="setTargetTemp(device)"
                  :disabled="!device.powerStatus || device.tempLocked"
                  :controls="false"
                />
                <span class="temp-unit">°C</span>
              </div>
              
              <el-button 
                class="adjust-btn increase"
                type="primary" 
                size="large" 
                circle
                @click="adjustTemp(device, 1)"
                :loading="device.loading"
                :disabled="!device.powerStatus || device.tempLocked"
              >
                <el-icon><Plus /></el-icon>
              </el-button>
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="modern-action-section">
          <div class="action-grid">
            <el-button 
              class="action-btn lock-btn"
              :type="device.tempLocked ? 'warning' : 'info'"
              size="default" 
              @click="toggleTempLock(device)"
              :loading="device.loading"
            >
              <el-icon><Lock v-if="device.tempLocked" /><Unlock v-else /></el-icon>
              <span>{{ device.tempLocked ? '关闭童锁' : '开启童锁' }}</span>
            </el-button>
            
            <el-button 
              class="action-btn detail-btn"
              type="info" 
              size="default" 
              @click="showDeviceDetail(device)"
              :loading="device.loading"
            >
              <el-icon><View /></el-icon>
              <span>详情</span>
            </el-button>
          </div>
        </div>
      </el-card>
    </div>

    <div v-if="filteredDevices.length > 0" class="device-pagination">
      <el-pagination
        v-model:current-page="deviceCurrentPage"
        v-model:page-size="devicePageSize"
        :page-sizes="[12, 24, 48, 96]"
        :total="filteredDevices.length"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @size-change="handleDevicePageSizeChange"
        @current-change="handleDevicePageChange"
      />
    </div>

    <!-- 情景模式对话框 -->
    <el-dialog 
      v-model="showSceneDialog" 
      title="情景模式" 
      width="600px"
    >
      <div class="scene-modes">
        <el-row :gutter="20">
          <el-col :span="8">
            <el-card class="scene-card" @click="executeScene('powerOn')">
              <div class="scene-icon power-on">
                <el-icon><VideoPlay /></el-icon>
              </div>
              <div class="scene-title">一键开机</div>
              <div class="scene-desc">开启所有温控器</div>
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card class="scene-card" @click="executeScene('powerOff')">
              <div class="scene-icon power-off">
                <el-icon><VideoPause /></el-icon>
              </div>
              <div class="scene-title">一键关机</div>
              <div class="scene-desc">关闭所有温控器</div>
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card class="scene-card" @click="executeScene('unlock')">
              <div class="scene-icon comfort">
                <el-icon><Unlock /></el-icon>
              </div>
              <div class="scene-title">一键解锁</div>
              <div class="scene-desc">解锁所有温度设置</div>
            </el-card>
          </el-col>
        </el-row>
        <el-row :gutter="20" style="margin-top: 20px;">
          <el-col :span="8">
            <el-card class="scene-card" @click="executeScene('summer')">
              <div class="scene-icon energy">
                <el-icon><Lightning /></el-icon>
              </div>
              <div class="scene-title">夏季模式</div>
              <div class="scene-desc">设置为26°C</div>
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card class="scene-card" @click="executeScene('winter')">
              <div class="scene-icon cool">
                <el-icon><Refrigerator /></el-icon>
              </div>
              <div class="scene-title">冬季模式</div>
              <div class="scene-desc">设置为22°C</div>
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card class="scene-card" @click="executeScene('lock')">
              <div class="scene-icon lock">
                <el-icon><Lock /></el-icon>
              </div>
              <div class="scene-title">一键锁定</div>
              <div class="scene-desc">锁定所有温度设置</div>
            </el-card>
          </el-col>
        </el-row>
      </div>
    </el-dialog>

    <!-- 添加温控器对话框 -->
    <el-dialog 
      v-model="showAddDialog" 
      title="添加温控器" 
      width="800px"
    >
      <div class="add-device-container">
        <!-- 搜索栏 -->
        <div class="search-section">
          <el-row :gutter="20">
            <el-col :span="8">
              <el-select
                v-model="selectedTenantForAdd"
                placeholder="选择租户"
                clearable
                @change="loadDevicesByTenant"
                style="width: 100%"
              >
                <el-option
                  v-for="tenant in tenantList"
                  :key="tenant.id"
                  :label="tenant.name"
                  :value="tenant.id"
                />
              </el-select>
            </el-col>
            <el-col :span="8">
              <el-select
                v-model="selectedDeviceTypeForAdd"
                placeholder="选择设备类型"
                clearable
                @change="filterAvailableDevices"
                style="width: 100%"
              >
                <el-option
                  v-for="type in deviceTypeList"
                  :key="type.id"
                  :label="type.name"
                  :value="type.id"
                />
              </el-select>
            </el-col>
            <el-col :span="8">
              <el-input
                v-model="deviceSearchKeyword"
                placeholder="搜索设备名称或IMEI"
                clearable
                @input="searchDevices"
              >
                <template #prefix>
                  <el-icon><Search /></el-icon>
                </template>
              </el-input>
            </el-col>
          </el-row>
        </div>
        
        <!-- 设备列表 -->
        <div class="device-list-section">
          <el-table
            :data="filteredAvailableDevices"
            v-loading="loadingDevices"
            @selection-change="handleDeviceSelection"
            height="300"
          >
            <el-table-column type="selection" width="55" />
            <el-table-column prop="name" label="设备名称" width="150" />
            <el-table-column prop="imei" label="IMEI" width="180" />
            <el-table-column label="所属租户" width="120">
              <template #default="{ row }">
                {{ row.tenant?.name || '--' }}
              </template>
            </el-table-column>
            <el-table-column label="设备类型" width="100">
              <template #default="{ row }">
                {{ row.device_type?.name || '--' }}
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.status === 'online' ? 'success' : 'danger'" size="small">
                  {{ row.status === 'online' ? '在线' : '离线' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showAddDialog = false">取消</el-button>
          <el-button 
            type="primary" 
            @click="addSelectedDevices"
            :disabled="selectedDevices.length === 0"
            :loading="addingDevices"
          >
            添加选中设备 ({{ selectedDevices.length }})
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 温控策略对话框 -->
    <el-dialog 
      v-model="showScheduleDialog" 
      title="温控策略管理"
      width="1080px"
    >
      <div class="schedule-container">
        <div class="strategy-guide">
          <strong>温控运行策略</strong>
          <span>按设备范围设置执行时间、周期和运行参数。策略仅作用于温控控制模块。</span>
        </div>
        <div class="schedule-header">
          <el-button type="primary" @click="showAddScheduleDialog = true">
            <el-icon><Plus /></el-icon>
            新增策略
          </el-button>
        </div>
        
        <el-table :data="scheduleList" v-loading="loadingSchedules" class="strategy-table">
          <el-table-column prop="name" label="策略名称" min-width="150" />
          <el-table-column prop="deviceName" label="设备" min-width="180" />
          <el-table-column label="动作" width="160">
            <template #default="{ row }">
              <div class="schedule-action-tags">
                <el-tag
                  v-if="row.powerAction !== 'none'"
                  :type="row.powerAction === 'on' ? 'success' : 'danger'"
                  size="small"
                >
                  {{ row.powerAction === 'on' ? '开机' : '关机' }}
                </el-tag>
                <el-tag
                  v-if="row.lockAction !== 'none'"
                  :type="row.lockAction === 'lock' ? 'warning' : 'info'"
                  size="small"
                >
                  {{ row.lockAction === 'lock' ? '锁定' : '解锁' }}
                </el-tag>
                <span v-if="row.powerAction === 'none' && row.lockAction === 'none'">无动作</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="time" label="执行时间" width="110" />
          <el-table-column prop="repeatLabel" label="重复" min-width="140" />
          <el-table-column prop="enabled" label="状态" width="90">
            <template #default="{ row }">
              <el-switch 
                v-model="row.enabled" 
                @change="toggleSchedule(row)"
              />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <div class="strategy-actions">
                <el-button type="primary" size="small" @click="editSchedule(row)">
                  编辑
                </el-button>
                <el-button type="danger" size="small" @click="deleteSchedule(row)">
                  删除
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>

    <!-- 添加/编辑计划对话框 -->
    <el-dialog 
      v-model="showAddScheduleDialog" 
      :title="scheduleForm.id ? '编辑温控策略' : '新增温控策略'"
      width="700px"
      :before-close="resetScheduleForm"
    >
      <el-form 
        ref="scheduleFormRef" 
        :model="scheduleForm" 
        :rules="scheduleRules" 
        label-width="120px"
      >
        <div class="strategy-form-section">设备范围</div>
        <el-form-item label="计划名称" prop="name">
          <el-input 
            v-model="scheduleForm.name" 
            placeholder="请输入计划名称"
            maxlength="50"
            show-word-limit
          />
        </el-form-item>
        
        <el-form-item label="选择设备" prop="deviceIds">
          <div class="schedule-device-filters">
            <el-input
              v-model="scheduleDeviceFilters.keyword"
              placeholder="搜索设备名称或设备ID"
              clearable
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <el-select
              v-if="isAdmin"
              v-model="scheduleDeviceFilters.tenantId"
              placeholder="所属租户"
              clearable
              filterable
              @change="handleScheduleTenantChange"
            >
              <el-option
                v-for="tenant in tenantList"
                :key="tenant.id"
                :label="tenant.name"
                :value="tenant.id"
              />
            </el-select>
            <el-select
              v-model="scheduleDeviceFilters.buildingId"
              placeholder="所属建筑"
              clearable
              filterable
              @change="handleScheduleBuildingChange"
            >
              <el-option
                v-for="building in scheduleBuildingOptions"
                :key="building.id"
                :label="building.name"
                :value="building.id"
              />
            </el-select>
            <el-select
              v-model="scheduleDeviceFilters.groupId"
              placeholder="所属分组"
              clearable
              filterable
            >
              <el-option
                v-for="group in scheduleGroupOptions"
                :key="group.id"
                :label="group.name"
                :value="group.id"
              />
            </el-select>
            <el-select
              v-model="scheduleDeviceFilters.status"
              placeholder="设备状态"
              clearable
            >
              <el-option label="运行中" value="running" />
              <el-option label="待机" value="standby" />
              <el-option label="离线" value="offline" />
            </el-select>
          </div>
          <el-select 
            v-model="scheduleForm.deviceIds" 
            multiple 
            filterable
            collapse-tags
            collapse-tags-tooltip
            :max-collapse-tags="3"
            placeholder="请选择一台或多台设备"
            style="width: 100%"
            @change="handleScheduleDeviceChange"
          >
            <el-option
              v-for="device in filteredScheduleDevices"
              :key="device.id"
              :label="getScheduleDeviceLabel(device)"
              :value="device.id"
            />
          </el-select>
          <div class="schedule-device-summary">
            <span>筛选结果 {{ filteredScheduleDevices.length }} 台，已选 {{ scheduleForm.deviceIds.length }} 台</span>
            <div class="schedule-device-actions">
              <el-button
                type="primary"
                link
                :disabled="filteredScheduleDevices.length === 0"
                @click="selectAllFilteredScheduleDevices"
              >
                选择筛选结果
              </el-button>
              <el-button
                link
                :disabled="scheduleForm.deviceIds.length === 0"
                @click="clearScheduleDevices"
              >
                清空已选
              </el-button>
            </div>
          </div>
        </el-form-item>
        
        <div class="strategy-form-section">触发条件</div>
        <el-form-item label="执行时间" prop="executeTime">
          <el-time-picker
            v-model="scheduleForm.executeTime"
            placeholder="选择执行时间"
            format="HH:mm"
            value-format="HH:mm"
            style="width: 200px"
          />
        </el-form-item>
        
        <el-form-item label="重复设置" prop="repeatType">
          <el-radio-group v-model="scheduleForm.repeatType">
            <el-radio label="once">仅执行一次</el-radio>
            <el-radio label="daily">每天</el-radio>
            <el-radio label="weekly">每周</el-radio>
            <el-radio label="custom">自定义</el-radio>
          </el-radio-group>
        </el-form-item>
        
        <el-form-item v-if="scheduleForm.repeatType === 'weekly'" label="重复日期">
          <el-checkbox-group v-model="scheduleForm.weekDays">
            <el-checkbox label="1">周一</el-checkbox>
            <el-checkbox label="2">周二</el-checkbox>
            <el-checkbox label="3">周三</el-checkbox>
            <el-checkbox label="4">周四</el-checkbox>
            <el-checkbox label="5">周五</el-checkbox>
            <el-checkbox label="6">周六</el-checkbox>
            <el-checkbox label="0">周日</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        
        <el-form-item v-if="scheduleForm.repeatType === 'custom'" label="自定义日期">
          <el-date-picker
            v-model="scheduleForm.customDates"
            type="dates"
            placeholder="选择执行日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        
        <div class="strategy-form-section">执行动作</div>
        <el-form-item label="开关机控制">
          <el-radio-group v-model="scheduleForm.powerAction">
            <el-radio label="on">开机</el-radio>
            <el-radio label="off">关机</el-radio>
            <el-radio label="none">不控制</el-radio>
          </el-radio-group>
        </el-form-item>
        
        <template v-if="scheduleForm.powerAction === 'on'">
          <el-form-item label="工作模式">
            <el-radio-group v-model="scheduleForm.acMode">
              <el-radio label="cool">制冷</el-radio>
              <el-radio label="heat">制热</el-radio>
              <el-radio label="fan">送风</el-radio>
              <el-radio label="auto">自动</el-radio>
            </el-radio-group>
          </el-form-item>
          
          <el-form-item label="目标温度">
            <el-input-number
              v-model="scheduleForm.targetTemp"
              :min="16"
              :max="30"
              :step="1"
              controls-position="right"
              style="width: 120px"
            />
            <span style="margin-left: 10px; color: #666;">°C</span>
          </el-form-item>
          
          <el-form-item label="风速档位">
            <el-radio-group v-model="scheduleForm.fanSpeed">
              <el-radio label="1">1档</el-radio>
              <el-radio label="2">2档</el-radio>
              <el-radio label="3">3档</el-radio>
              <el-radio label="auto">自动</el-radio>
            </el-radio-group>
          </el-form-item>
        </template>

        <el-form-item label="现场童锁">
          <el-radio-group v-model="scheduleForm.lockAction">
            <el-radio label="lock">锁定现场操作</el-radio>
            <el-radio label="unlock">解除锁定</el-radio>
            <el-radio label="none">不控制</el-radio>
          </el-radio-group>
        </el-form-item>
        
        <div class="strategy-form-section">策略状态</div>
        <el-form-item label="启用状态">
          <el-switch 
            v-model="scheduleForm.enabled" 
            active-text="启用" 
            inactive-text="禁用"
          />
        </el-form-item>
        
        <el-form-item label="备注">
          <el-input 
            v-model="scheduleForm.description" 
            type="textarea" 
            :rows="3" 
            placeholder="请输入计划备注（可选）"
            maxlength="200"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="resetScheduleForm">取消</el-button>
          <el-button 
            type="primary" 
            @click="submitSchedule"
            :loading="submittingSchedule"
          >
            {{ scheduleForm.id ? '保存修改' : '保存策略' }}
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 运行统计对话框 -->
    <el-dialog 
      v-model="showStatsDialog" 
      title="空调运行时间统计" 
      width="1200px"
      top="5vh"
    >
      <div class="stats-container">
        <div class="stats-filters">
          <el-row :gutter="20">
            <el-col :span="8">
              <el-date-picker
                v-model="statsDateRange"
                type="daterange"
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                @change="loadStatsData"
                style="width: 100%"
              />
            </el-col>
            <el-col :span="6">
              <el-select
                v-model="selectedGroupForStats"
                placeholder="选择分组"
                clearable
                @change="loadStatsData"
                style="width: 100%"
              >
                <el-option label="全部分组" value="" />
                <el-option
                  v-for="group in deviceGroups"
                  :key="group.id"
                  :label="group.name"
                  :value="group.id"
                />
              </el-select>
            </el-col>
            <el-col :span="6">
              <el-select
                v-model="selectedModeForStats"
                placeholder="运行模式"
                clearable
                @change="loadStatsData"
                style="width: 100%"
              >
                <el-option label="全部模式" value="" />
                <el-option label="送风模式" value="fan" />
                <el-option label="制冷模式" value="cool" />
                <el-option label="制热模式" value="heat" />
                <el-option label="除湿模式" value="dehumidify" />
              </el-select>
            </el-col>
            <el-col :span="4">
              <el-button type="primary" @click="exportStatsData" :loading="exportLoading">
                <el-icon><Download /></el-icon>
                导出数据
              </el-button>
            </el-col>
          </el-row>
        </div>
        
        <!-- 统计概览 -->
        <div class="stats-summary" style="margin: 20px 0;">
          <el-row :gutter="20">
            <el-col :span="6">
              <div class="stats-card">
                <div class="stats-title">设备总数</div>
                <div class="stats-value">{{ statsTableData.length }}</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stats-card">
                <div class="stats-title">1档总时间</div>
                <div class="stats-value">{{ formatRuntime(totalSpeed1Runtime) }}</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stats-card">
                <div class="stats-title">2档总时间</div>
                <div class="stats-value">{{ formatRuntime(totalSpeed2Runtime) }}</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stats-card">
                <div class="stats-title">3档总时间</div>
                <div class="stats-value">{{ formatRuntime(totalSpeed3Runtime) }}</div>
              </div>
            </el-col>
          </el-row>
        </div>
        
        <!-- 统计表格 -->
        <div class="stats-table">
          <el-table 
            :data="paginatedStatsData" 
            v-loading="statsLoading"
            border
            stripe
            style="width: 100%"
            :default-sort="{prop: 'totalRuntime', order: 'descending'}"
          >
            <el-table-column prop="deviceName" label="设备名称" width="150" sortable>
              <template #default="{ row }">
                <div class="device-name-cell">
                  <el-tag :type="getStatusTag(row.status)" size="small" style="margin-right: 8px;">
                    {{ getStatusText(row.status) }}
                  </el-tag>
                  {{ row.deviceName }}
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="group" label="分组" width="100" sortable />
            <el-table-column prop="location" label="位置" width="120" sortable />
            <el-table-column prop="runtime_speed1" label="1档运行时间" width="120" sortable>
              <template #default="{ row }">
                <span class="runtime-text">{{ formatRuntime(row.runtime_speed1 || 0) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="runtime_speed2" label="2档运行时间" width="120" sortable>
              <template #default="{ row }">
                <span class="runtime-text">{{ formatRuntime(row.runtime_speed2 || 0) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="runtime_speed3" label="3档运行时间" width="120" sortable>
              <template #default="{ row }">
                <span class="runtime-text">{{ formatRuntime(row.runtime_speed3 || 0) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="stat_date" label="统计日期" width="120" sortable />
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" size="small" @click="viewDeviceDetail(row)">
                  详情
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          
          <!-- 分页 -->
          <div class="pagination-container">
            <el-pagination
              v-model:current-page="statsCurrentPage"
              v-model:page-size="statsPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="statsTableData.length"
              layout="total, sizes, prev, pager, next, jumper"
              @size-change="handleStatsSizeChange"
              @current-change="handleStatsCurrentChange"
            />
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- 设备详情对话框 -->
    <el-dialog 
      v-model="showDetailDialog" 
      title="设备详情" 
      width="800px"
    >
      <div v-if="selectedDevice" class="device-detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="设备名称">{{ selectedDevice.name }}</el-descriptions-item>
          <el-descriptions-item label="IMEI">{{ selectedDevice.imei }}</el-descriptions-item>
          <el-descriptions-item label="所属租户">{{ selectedDevice.tenant?.name || '--' }}</el-descriptions-item>
          <el-descriptions-item label="设备类型">{{ selectedDevice.device_type?.name || '--' }}</el-descriptions-item>
          <el-descriptions-item label="当前状态">
            <el-tag :type="getStatusTag(selectedDevice.status)">
              {{ getStatusText(selectedDevice.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="当前温度">{{ selectedDevice.currentTemp || '--' }}°C</el-descriptions-item>
          <el-descriptions-item label="目标温度">{{ selectedDevice.targetTemp || '--' }}°C</el-descriptions-item>
          <el-descriptions-item label="风速档位">{{ selectedDevice.fanSpeed || '--' }}档</el-descriptions-item>
          <el-descriptions-item label="温度锁定">
            <el-tag :type="selectedDevice.tempLocked ? 'warning' : 'success'">
              {{ selectedDevice.tempLocked ? '已锁定' : '未锁定' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="最后更新">{{ selectedDevice.lastUpdate || '--' }}</el-descriptions-item>
        </el-descriptions>
        
        <!-- 运行时间统计 -->
        <div class="running-stats-detail">
          <h4>运行时间统计</h4>
          <el-row :gutter="20">
            <el-col :span="8">
              <el-card>
                <div class="stat-item-detail">
                  <div class="stat-icon low-speed">1</div>
                  <div class="stat-content">
                    <div class="stat-label">1档运行</div>
                    <div class="stat-value">{{ formatRuntime(selectedDevice.runtime?.speed1 || 0) }}</div>
                  </div>
                </div>
              </el-card>
            </el-col>
            <el-col :span="8">
              <el-card>
                <div class="stat-item-detail">
                  <div class="stat-icon medium-speed">2</div>
                  <div class="stat-content">
                    <div class="stat-label">2档运行</div>
                    <div class="stat-value">{{ formatRuntime(selectedDevice.runtime?.speed2 || 0) }}</div>
                  </div>
                </div>
              </el-card>
            </el-col>
            <el-col :span="8">
              <el-card>
                <div class="stat-item-detail">
                  <div class="stat-icon high-speed">3</div>
                  <div class="stat-content">
                    <div class="stat-label">3档运行</div>
                    <div class="stat-value">{{ formatRuntime(selectedDevice.runtime?.speed3 || 0) }}</div>
                  </div>
                </div>
              </el-card>
            </el-col>
          </el-row>
        </div>
        
        <!-- 运行时间历史图表 -->
        <div class="runtime-chart-section">
          <h4>运行时间趋势分析（最近30天）</h4>
          <div v-loading="deviceRuntimeLoading" class="chart-container">
            <div v-if="!deviceRuntimeLoading && deviceRuntimeHistory.length === 0" class="no-data">
              <el-empty description="暂无运行时间数据" />
            </div>
            <div v-else ref="runtimeChart" class="runtime-chart"></div>
          </div>
        </div>
      </div>
    </el-dialog>

  </div>
</template>

<script>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Search, Plus, Refresh, Close, Loading, VideoPlay, VideoPause,
  Switch, Lock, Unlock, Minus, Clock, DataAnalysis, View,
  MagicStick, Sunny, Lightning, Refrigerator, Setting,
  WindPower, Drizzling, Promotion, Aim
} from '@element-plus/icons-vue'
import { Fan, Snowflake, Flame, Droplets, Thermometer } from 'lucide-vue-next'
import API from '@/api'
import websocketService from '@/utils/websocket'
import * as echarts from 'echarts'

export default {
  name: 'ThermostatControl',
  components: {
    Search, Plus, Refresh, Close, Loading, VideoPlay, VideoPause,
    Switch, Lock, Unlock, Minus, Clock, DataAnalysis, View,
    MagicStick, Sunny, Lightning, Refrigerator, Setting,
    WindPower, Drizzling, Promotion, Thermometer, Aim,
    Fan, Snowflake, Flame, Droplets
  },
  setup() {
    // 响应式数据
    const loading = ref(false)
    const userInfo = ref(JSON.parse(localStorage.getItem('userInfo') || '{}'))
    const isAdmin = computed(() => userInfo.value?.role === 'admin')
    const searchKeyword = ref('')
    const selectedTenant = ref('')
    const selectedBuilding = ref('')
    const selectedProjectGroup = ref('')
    const selectedStatus = ref('')
    const showAddDialog = ref(false)
    const showScheduleDialog = ref(false)
    const showStatsDialog = ref(false)
    const showDetailDialog = ref(false)
    const showAddScheduleDialog = ref(false)
    const showSceneDialog = ref(false)
    
    // 设备相关数据
    const thermostatDevices = ref([])
    const deviceCurrentPage = ref(1)
    const devicePageSize = ref(12)
    const deviceGroups = ref([])
    const buildingOptions = ref([])
    const tenantList = ref([])
    const deviceTypeList = ref([])
    const availableDevices = ref([])
    const selectedDevices = ref([])
    const selectedDevice = ref(null)
    
    // 添加设备相关
    const selectedTenantForAdd = ref('')
    const selectedDeviceTypeForAdd = ref('')
    const deviceSearchKeyword = ref('')
    const loadingDevices = ref(false)
    const addingDevices = ref(false)
    
    // 计划相关
    const scheduleList = ref([])
    const loadingSchedules = ref(false)
    const submittingSchedule = ref(false)
    const scheduleFormRef = ref(null)
    const scheduleDeviceFilters = reactive({
      keyword: '',
      tenantId: '',
      buildingId: '',
      groupId: '',
      status: ''
    })
    
    // 计划表单数据
    const scheduleForm = reactive({
      id: null,
      name: '',
      deviceIds: [],
      executeTime: '',
      repeatType: 'once',
      weekDays: [],
      customDates: [],
      powerAction: 'on',
      acMode: 'cool',
      targetTemp: 24,
      fanSpeed: 'auto',
      lockAction: 'none',
      enabled: true,
      description: ''
    })
    
    // 表单验证规则
    const scheduleRules = {
      name: [
        { required: true, message: '请输入计划名称', trigger: 'blur' },
        { min: 2, max: 50, message: '计划名称长度在 2 到 50 个字符', trigger: 'blur' }
      ],
      deviceIds: [
        { required: true, message: '请选择至少一个设备', trigger: 'change' }
      ],
      executeTime: [
        { required: true, message: '请选择执行时间', trigger: 'change' }
      ],
      repeatType: [
        { required: true, message: '请选择重复类型', trigger: 'change' }
      ]
    }
    
    // 统计相关
    const statsDateRange = ref([])
    const selectedGroupForStats = ref('')
    const selectedModeForStats = ref('')
    const totalStats = ref({})
    const statsLoading = ref(false)
    const exportLoading = ref(false)
    const statsTableData = ref([])
    const statsCurrentPage = ref(1)
    const statsPageSize = ref(20)
    
    // 设备详情运行时间历史数据
    const deviceRuntimeHistory = ref([])
    const deviceRuntimeLoading = ref(false)
    
    // 计算属性
    const filteredDevices = computed(() => {
      let devices = thermostatDevices.value
      console.log('filteredDevices计算开始，原始设备数量:', devices.length)
      console.log('当前过滤条件:', { keyword: searchKeyword.value, tenant: selectedTenant.value, building: selectedBuilding.value, group: selectedProjectGroup.value, status: selectedStatus.value })
      
      if (searchKeyword.value) {
        const beforeFilter = devices.length
        devices = devices.filter(device => 
          device.name.toLowerCase().includes(searchKeyword.value.toLowerCase())
        )
        console.log(`搜索过滤后: ${beforeFilter} -> ${devices.length}`)
      }
      
      if (selectedTenant.value) devices = devices.filter(device => String(device.tenant_id || device.tenantId || '') === String(selectedTenant.value))
      if (selectedBuilding.value) devices = devices.filter(device => String(device.project_building_id || device.projectBuildingId || '') === String(selectedBuilding.value))
      if (selectedProjectGroup.value) devices = devices.filter(device => String(device.project_group_id || device.projectGroupId || '') === String(selectedProjectGroup.value))
      
      if (selectedStatus.value) {
        const beforeFilter = devices.length
        devices = devices.filter(device => device.status === selectedStatus.value)
        console.log(`状态过滤后: ${beforeFilter} -> ${devices.length}`)
      }
      
      console.log('filteredDevices计算完成，最终设备数量:', devices.length)
      console.log('最终设备列表:', devices.map(d => ({ id: d.id, name: d.name, status: d.status, group: d.group })))
      
      return devices
    })

    const filteredBuildingOptions = computed(() => selectedTenant.value
      ? buildingOptions.value.filter(item => String(item.tenant_id) === String(selectedTenant.value))
      : buildingOptions.value)

    const filteredProjectGroupOptions = computed(() => deviceGroups.value.filter(item =>
      (!selectedTenant.value || String(item.tenant_id) === String(selectedTenant.value)) &&
      (!selectedBuilding.value || !item.building_id || String(item.building_id) === String(selectedBuilding.value))
    ))

    const selectedScheduleTenantId = computed(() => {
      const selectedDevice = thermostatDevices.value.find(device =>
        scheduleForm.deviceIds.includes(device.id)
      )
      return selectedDevice?.tenant_id || selectedDevice?.tenantId || ''
    })

    const effectiveScheduleTenantId = computed(() =>
      scheduleDeviceFilters.tenantId || selectedScheduleTenantId.value
    )

    const scheduleBuildingOptions = computed(() => buildingOptions.value.filter(item =>
      !effectiveScheduleTenantId.value ||
      String(item.tenant_id || item.tenantId || '') === String(effectiveScheduleTenantId.value)
    ))

    const scheduleGroupOptions = computed(() => deviceGroups.value.filter(item =>
      (!effectiveScheduleTenantId.value ||
        String(item.tenant_id || item.tenantId || '') === String(effectiveScheduleTenantId.value)) &&
      (!scheduleDeviceFilters.buildingId ||
        !item.building_id ||
        String(item.building_id) === String(scheduleDeviceFilters.buildingId))
    ))

    const filteredScheduleDevices = computed(() => {
      const keyword = scheduleDeviceFilters.keyword.trim().toLowerCase()
      return thermostatDevices.value.filter(device => {
        const tenantId = device.tenant_id || device.tenantId || ''
        const buildingId = device.project_building_id || device.projectBuildingId || ''
        const groupId = device.project_group_id || device.projectGroupId || ''
        const matchesKeyword = !keyword ||
          String(device.name || '').toLowerCase().includes(keyword) ||
          String(device.device_id || device.imei || '').toLowerCase().includes(keyword)

        return matchesKeyword &&
          (!effectiveScheduleTenantId.value ||
            String(tenantId) === String(effectiveScheduleTenantId.value)) &&
          (!scheduleDeviceFilters.buildingId ||
            String(buildingId) === String(scheduleDeviceFilters.buildingId)) &&
          (!scheduleDeviceFilters.groupId ||
            String(groupId) === String(scheduleDeviceFilters.groupId)) &&
          (!scheduleDeviceFilters.status || device.status === scheduleDeviceFilters.status)
      })
    })
    
    const filteredAvailableDevices = computed(() => {
      let devices = availableDevices.value.filter(device =>
        device.device_category !== 'gateway' &&
        device.is_thermostat === false &&
        device.device_type?.name === '空调温控器'
      )
      
      if (selectedTenantForAdd.value) {
        devices = devices.filter(device => device.tenant_id === selectedTenantForAdd.value)
      }
      
      if (selectedDeviceTypeForAdd.value) {
        devices = devices.filter(device => device.device_type_id === selectedDeviceTypeForAdd.value)
      }
      
      if (deviceSearchKeyword.value) {
        devices = devices.filter(device => 
          device.name.toLowerCase().includes(deviceSearchKeyword.value.toLowerCase()) ||
          String(device.imei || '').toLowerCase().includes(deviceSearchKeyword.value.toLowerCase())
        )
      }
      
      return devices
    })

    const paginatedDevices = computed(() => {
      const start = (deviceCurrentPage.value - 1) * devicePageSize.value
      return filteredDevices.value.slice(start, start + devicePageSize.value)
    })

    watch(
      () => filteredDevices.value.length,
      total => {
        const lastPage = Math.max(1, Math.ceil(total / devicePageSize.value))
        if (deviceCurrentPage.value > lastPage) deviceCurrentPage.value = lastPage
      }
    )
    
    const runningDevicesCount = computed(() => {
      return filteredDevices.value.filter(device => device.status === 'running').length
    })
    
    // 统计相关计算属性
    const paginatedStatsData = computed(() => {
      const start = (statsCurrentPage.value - 1) * statsPageSize.value
      const end = start + statsPageSize.value
      return statsTableData.value.slice(start, end)
    })
    
    const totalSpeed1Runtime = computed(() => {
      return statsTableData.value.reduce((total, item) => total + (item.runtime_speed1 || 0), 0)
    })
    
    const totalSpeed2Runtime = computed(() => {
      return statsTableData.value.reduce((total, item) => total + (item.runtime_speed2 || 0), 0)
    })
    
    const totalSpeed3Runtime = computed(() => {
      return statsTableData.value.reduce((total, item) => total + (item.runtime_speed3 || 0), 0)
    })
    
    // 方法
    const loadThermostatDevices = async () => {
      try {
        loading.value = true
        console.log('开始加载温控器设备列表...')
        const params = { pageSize: 5000 }
        console.log('发送的请求参数:', params)
        const response = await API.thermostatAPI.getThermostats(params)
        console.log('API响应:', response)
        console.log('API响应分页信息:', response.data?.pagination)
        
        if (response.success) {
          const rawDevices = response.data.list || []
          console.log('接收到的原始设备数据:', rawDevices)
          console.log('原始设备数量:', rawDevices.length)
          
          thermostatDevices.value = rawDevices.map((device, index) => {
            console.log(`处理设备 ${index + 1}:`, device)
            return {
              ...device,
              // 映射后端字段到前端期望的字段名，确保数据类型正确
              currentTemp: device.current_temperature ? parseFloat(device.current_temperature) : 20,
              targetTemp: device.target_temperature ? parseFloat(device.target_temperature) : 22,
              powerStatus: device.is_on,
              // 离线优先，其余设备再按电源状态区分运行和待机。
              status: device.status === 'offline' ? 'offline' : (device.is_on ? 'running' : 'standby'),
              acMode: device.mode || 'cool',
              // 修复风速初始化：优先使用后端的fan_speed字段，避免默认为0（A档）
              fanSpeed: device.fan_speed !== undefined && device.fan_speed !== null ? device.fan_speed : (device.fanSpeed !== undefined && device.fanSpeed !== null ? device.fanSpeed : 0),
              tempLocked: device.temp_locked || false,
              group: device.project_group_name || device.project_group?.name || '',
              deviceId: device.device_id || device.imei || '',
              projectGroupId: device.project_group_id || '',
              projectGroupName: device.project_group_name || device.project_group?.name || '',
              projectBuildingId: device.project_building_id || '',
              projectBuildingName: device.project_building_name || device.project_building?.name || '',
              loading: false
            }
          })
          
          console.log('处理后的设备数据:', thermostatDevices.value)
          console.log('处理后的设备数量:', thermostatDevices.value.length)
          console.log('设备ID列表:', thermostatDevices.value.map(d => d.id))
          
        } else {
          console.error('API响应失败:', response.message)
          ElMessage.error(response.message || '获取温控器设备列表失败')
          thermostatDevices.value = []
        }
      } catch (error) {
        console.error('加载温控器设备失败:', error)
        ElMessage.error('加载设备列表失败')
      } finally {
        loading.value = false
      }
    }
    
    const loadTenantList = async () => {
      try {
        // 获取当前用户信息
        const userInfoStr = localStorage.getItem('userInfo')
        if (!userInfoStr) {
          console.error('未找到用户信息')
          return
        }
        
        const userInfo = JSON.parse(userInfoStr)
        
        // 如果是管理员，可以获取所有租户列表
        if (userInfo.role === 'admin') {
          const response = await API.tenantAPI.getTenants()
          if (response.success) {
            tenantList.value = response.data.tenants || []
          }
        } else {
          // 非管理员用户只显示自己所属的租户
          if (userInfo.tenant) {
            tenantList.value = [{
              id: userInfo.tenant.id,
              name: userInfo.tenant.name,
              code: userInfo.tenant.code
            }]
          } else {
            tenantList.value = []
          }
        }
      } catch (error) {
        console.error('加载租户列表失败:', error)
        // 如果API调用失败，尝试从用户信息中获取租户
        try {
          const userInfoStr = localStorage.getItem('userInfo')
          if (userInfoStr) {
            const userInfo = JSON.parse(userInfoStr)
            if (userInfo.tenant) {
              tenantList.value = [{
                id: userInfo.tenant.id,
                name: userInfo.tenant.name,
                code: userInfo.tenant.code
              }]
            }
          }
        } catch (parseError) {
          console.error('解析用户信息失败:', parseError)
        }
      }
    }
    
    const loadDeviceTypeList = async () => {
      try {
        const response = await API.deviceTypeAPI.getDeviceTypes()
        if (response.success) {
          deviceTypeList.value = (response.data || []).filter(type => type.name === '空调温控器')
          selectedDeviceTypeForAdd.value = deviceTypeList.value[0]?.id || ''
        }
      } catch (error) {
        console.error('加载设备类型列表失败:', error)
      }
    }
    
    const loadGroups = async () => {
      try {
        const [buildingResponse, groupResponse] = await Promise.all([
          API.projectManagementAPI.getBuildings(),
          API.projectManagementAPI.getGroups()
        ])
        buildingOptions.value = buildingResponse.success ? buildingResponse.data || [] : []
        deviceGroups.value = groupResponse.success ? groupResponse.data || [] : []
      } catch (error) {
        console.error('加载项目建筑和分组失败:', error)
        buildingOptions.value = []
        deviceGroups.value = []
      }
    }
    
    const loadAvailableDevices = async () => {
      try {
        loadingDevices.value = true
        const response = await API.deviceAPI.getDevices({
          page: 1,
          pageSize: 1000,
          isThermostat: false,
          excludeGateways: true
        })
        if (response.success) {
          // 过滤出温控器类型的设备且未被添加到温控器控制的设备
          const allDevices = response.data?.list || response.data || []
          const thermostatDeviceIds = thermostatDevices.value.map(d => d.device_id || d.id)
          availableDevices.value = allDevices.filter(device => 
            !thermostatDeviceIds.includes(device.id) &&
            device.is_thermostat === false &&
            device.device_category !== 'gateway' &&
            device.device_type && 
            device.device_type.name === '空调温控器'
          )
        }
      } catch (error) {
        console.error('加载可用设备失败:', error)
        ElMessage.error('加载可用设备失败')
      } finally {
        loadingDevices.value = false
      }
    }
    
    const refreshAllDevicesData = async () => {
      loading.value = true
      try {
        await loadThermostatDevices()
        // 不再主动查询设备状态，避免发送MQTT命令导致设备进入待机状态
        // 设备状态会通过WebSocket实时更新
        ElMessage.success('设备列表刷新成功，状态数据将通过实时连接自动更新')
      } catch (error) {
        console.error('刷新数据失败:', error)
        ElMessage.error('刷新数据失败')
      } finally {
        loading.value = false
      }
    }
    
    const handleSearch = () => {
      deviceCurrentPage.value = 1
    }
    
    const handleGroupFilter = () => {
      deviceCurrentPage.value = 1
    }

    const handleTenantFilter = () => {
      selectedBuilding.value = ''
      selectedProjectGroup.value = ''
      deviceCurrentPage.value = 1
    }

    const handleBuildingFilter = () => {
      if (selectedProjectGroup.value && !filteredProjectGroupOptions.value.some(item => String(item.id) === String(selectedProjectGroup.value))) selectedProjectGroup.value = ''
      deviceCurrentPage.value = 1
    }
    
    const handleStatusFilter = () => {
      deviceCurrentPage.value = 1
    }

    const handleDevicePageChange = page => {
      deviceCurrentPage.value = page
    }

    const handleDevicePageSizeChange = size => {
      devicePageSize.value = size
      deviceCurrentPage.value = 1
    }
    
    const openAddDialog = async () => {
      showAddDialog.value = true
      await Promise.all([
        loadTenantList(),
        loadDeviceTypeList(),
        loadAvailableDevices()
      ])
    }
    
    const handleDeviceSelection = (selection) => {
      selectedDevices.value = selection
    }
    
    const addSelectedDevices = async () => {
      try {
        addingDevices.value = true
        let successCount = 0
        let failCount = 0
        
        for (const device of selectedDevices.value) {
          try {
            const response = await API.thermostatAPI.addThermostat({
              device_id: device.id,
              name: device.name,
              location: device.location || '',
              target_temperature: 24,
              mode: 'cool',
              humidity: 50,
              is_on: false
            })
            
            if (response.success) {
              // 添加到本地列表
              thermostatDevices.value.push({
                ...device,
                powerStatus: false,
                currentTemp: null,
                targetTemp: 24,
                // 修复：新设备默认风速设为1档而不是A档
                fanSpeed: 1,
                tempLocked: false,
                runtime: {
                  speed1: 0,
                  speed2: 0,
                  speed3: 0
                },
                loading: false
              })
              successCount++
            } else {
              console.error(`添加设备 ${device.name} 失败:`, response.message)
              failCount++
              // 只在真正失败时显示错误，而不是在成功但前端判断错误时显示
              if (response.httpStatus && response.httpStatus >= 400) {
                ElMessage.error(`添加设备 ${device.name} 失败: ${response.message}`)
              } else {
                // 可能是成功但前端判断逻辑有问题，先添加到列表
                thermostatDevices.value.push({
                  ...device,
                  powerStatus: false,
                  currentTemp: null,
                  targetTemp: 24,
                  // 修复：新设备默认风速设为1档而不是A档
                  fanSpeed: 1,
                  tempLocked: false,
                  runtime: {
                    speed1: 0,
                    speed2: 0,
                    speed3: 0
                  },
                  loading: false
                })
                successCount++
              }
            }
          } catch (error) {
            console.error(`添加设备 ${device.name} 异常:`, error)
            failCount++
            ElMessage.error(`添加设备 ${device.name} 失败: ${error.message}`)
          }
        }
        
        if (successCount > 0) {
          ElMessage.success(`成功添加 ${successCount} 个设备${failCount > 0 ? `，${failCount} 个失败` : ''}`)
        } else if (failCount > 0) {
          ElMessage.error(`添加设备失败，共 ${failCount} 个设备添加失败`)
        }
        
        showAddDialog.value = false
        selectedDevices.value = []
        
        // 重新加载设备列表以确保数据同步
        await loadThermostatDevices()
      } catch (error) {
        console.error('添加设备失败:', error)
        ElMessage.error('添加设备失败')
      } finally {
        addingDevices.value = false
      }
    }
    
    const deleteDevice = async (device) => {
      try {
        await ElMessageBox.confirm(
          `确定要删除设备 "${device.name}" 吗？`,
          '确认删除',
          {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
        
        const response = await API.thermostatAPI.deleteThermostat(device.id)
        if (response.success) {
          // 从本地列表中删除
          const index = thermostatDevices.value.findIndex(d => d.id === device.id)
          if (index > -1) {
            thermostatDevices.value.splice(index, 1)
          }
          ElMessage.success('设备删除成功')
        } else {
          ElMessage.error(response.message || '删除设备失败')
        }
      } catch (error) {
        if (error !== 'cancel') {
          console.error('删除设备失败:', error)
          ElMessage.error('删除设备失败')
        }
      }
    }
    
    const turnOnDevice = async (device) => {
      try {
        device.loading = true
        console.log(`正在开启设备: ${device.name} (ID: ${device.id})`)
        
        const response = await API.thermostatAPI.controlPower(device.id, true)
        console.log('开机操作响应:', response)
        
        if (response.success) {
          // 操作成功，立即更新本地状态，确保界面响应
          console.log('开机操作成功，立即更新本地状态')
          
          // 立即更新设备状态，避免界面延迟
          device.powerStatus = true
          device.status = 'running'
          
          console.log(`✅ [开机状态更新] 设备 ${device.name} 状态已更新:`, {
            powerStatus: device.powerStatus,
            status: device.status,
            时间戳: new Date().toLocaleTimeString()
          })
          
          // 显示成功信息
          ElMessage({
            message: `${device.name} 开机成功`,
            type: 'success',
            duration: 3000
          })
          
          // 记录操作日志
          console.log(`设备 ${device.name} 开机成功，当前状态:`, {
            powerStatus: device.powerStatus,
            status: device.status,
            currentTemp: device.currentTemp,
            targetTemp: device.targetTemp
          })
        } else {
          console.error('开机失败，后端响应:', response)
          ElMessage.error(response.message || '开机失败')
        }
      } catch (error) {
        console.error('开机操作异常:', error)
        ElMessage.error(`开机失败: ${error.message || '网络错误'}`)
      } finally {
        device.loading = false
      }
    }
    
    const turnOffDevice = async (device) => {
      try {
        device.loading = true
        console.log(`正在关闭设备: ${device.name} (ID: ${device.id})`)
        
        const response = await API.thermostatAPI.controlPower(device.id, false)
        console.log('关机操作响应:', response)
        
        if (response.success) {
          // 操作成功，立即更新本地状态，确保界面响应
          console.log('关机操作成功，立即更新本地状态')
          
          // 立即更新设备状态，避免界面延迟
          device.powerStatus = false
          device.status = 'standby'
          
          console.log(`✅ [关机状态更新] 设备 ${device.name} 状态已更新:`, {
            powerStatus: device.powerStatus,
            status: device.status,
            时间戳: new Date().toLocaleTimeString()
          })
          
          // 显示成功信息
          ElMessage({
            message: `${device.name} 关机成功`,
            type: 'success',
            duration: 3000
          })
          
          // 记录操作日志
          console.log(`设备 ${device.name} 关机成功，当前状态:`, {
            powerStatus: device.powerStatus,
            status: device.status,
            currentTemp: device.currentTemp,
            targetTemp: device.targetTemp
          })
        } else {
          console.error('关机失败，后端响应:', response)
          ElMessage.error(response.message || '关机失败')
        }
      } catch (error) {
        console.error('关机操作异常:', error)
        ElMessage.error(`关机失败: ${error.message || '网络错误'}`)
      } finally {
        device.loading = false
      }
    }
    
    const handlePowerOn = async (device) => {
      await turnOnDevice(device)
    }
    
    const handlePowerOff = async (device) => {
      await turnOffDevice(device)
    }
    
    const setFanSpeed = async (device, speed) => {
      try {
        device.loading = true
        console.log(`正在设置设备 ${device.name} 风速为: ${speed} (${getFanSpeedLabel(speed)})`)
        
        const response = await API.thermostatAPI.setFanSpeed(device.id, speed)
        console.log('设置风速操作响应:', response)
        
        if (response.success) {
          // 更新设备状态 - 使用后端返回的最新设备数据
          if (response.data && response.data.device) {
            const updatedDevice = response.data.device
            console.log('后端返回的设备数据:', updatedDevice)
            
            // 只更新明确返回的字段，避免undefined覆盖现有状态
            const updateData = {
              fanSpeed: updatedDevice.fan_speed || speed
            }
            
            // 只有当后端明确返回这些字段时才更新
            if (updatedDevice.current_temperature !== undefined) {
              updateData.currentTemp = updatedDevice.current_temperature
            }
            if (updatedDevice.target_temp !== undefined) {
              updateData.targetTemp = updatedDevice.target_temp
            }
            if (updatedDevice.power_status !== undefined) {
              updateData.powerStatus = updatedDevice.power_status
            }
            if (updatedDevice.ac_mode !== undefined) {
              updateData.acMode = updatedDevice.ac_mode
            }
            if (updatedDevice.temp_locked !== undefined) {
              updateData.tempLocked = updatedDevice.temp_locked
            }
            
            Object.assign(device, updateData)
            console.log('🔄 [风速设置] 设备状态更新:', {
              设备名称: device.name,
              更新字段: Object.keys(updateData),
              电源状态: device.powerStatus,
              风速: device.fanSpeed
            })
          } else {
            device.fanSpeed = speed
          }
          
          // 显示详细的成功信息
          ElMessage({
            message: `${device.name} 风速设置成功 - ${getFanSpeedLabel(speed)}`,
            type: 'success',
            duration: 3000
          })
          
          // 记录操作日志
          console.log(`设备 ${device.name} 风速设置成功:`, {
            fanSpeed: device.fanSpeed,
            fanSpeedLabel: getFanSpeedLabel(device.fanSpeed),
            powerStatus: device.powerStatus
          })
        } else {
          console.error('设置风速失败，后端响应:', response)
          ElMessage.error(response.message || '设置风速失败')
        }
      } catch (error) {
        console.error('设置风速操作异常:', error)
        ElMessage.error(`设置风速失败: ${error.message || '网络错误'}`)
      } finally {
        device.loading = false
      }
    }
    
    const adjustTemp = async (device, delta) => {
      const newTemp = (device.targetTemp || 24) + delta
      if (newTemp >= 16 && newTemp <= 30) {
        device.targetTemp = newTemp
        await setTargetTemp(device)
      }
    }
    
    const setTargetTemp = async (device) => {
      try {
        device.loading = true
        console.log(`正在设置设备 ${device.name} 目标温度为: ${device.targetTemp}°C`)
        
        const response = await API.thermostatAPI.setTemperature(device.id, device.targetTemp)
        console.log('设置温度操作响应:', response)
        
        if (response.success) {
          // 更新设备状态 - 使用后端返回的最新设备数据
          if (response.data && response.data.device) {
            const updatedDevice = response.data.device
            console.log('后端返回的设备数据:', updatedDevice)
            
            // 只更新明确返回的字段，避免undefined覆盖现有状态
            const updateData = {
              targetTemp: updatedDevice.target_temp || device.targetTemp
            }
            
            // 只有当后端明确返回这些字段时才更新
            if (updatedDevice.current_temperature !== undefined) {
              updateData.currentTemp = updatedDevice.current_temperature
            }
            if (updatedDevice.power_status !== undefined) {
              updateData.powerStatus = updatedDevice.power_status
            }
            if (updatedDevice.fan_speed !== undefined) {
              updateData.fanSpeed = updatedDevice.fan_speed
            }
            if (updatedDevice.ac_mode !== undefined) {
              updateData.acMode = updatedDevice.ac_mode
            }
            if (updatedDevice.temp_locked !== undefined) {
              updateData.tempLocked = updatedDevice.temp_locked
            }
            
            Object.assign(device, updateData)
            console.log('🔄 [温度设置] 设备状态更新:', {
              设备名称: device.name,
              更新字段: Object.keys(updateData),
              电源状态: device.powerStatus,
              目标温度: device.targetTemp
            })
          }
          
          // 显示详细的成功信息
          const tempDiff = device.currentTemp ? Math.abs(device.targetTemp - device.currentTemp).toFixed(1) : 'N/A'
          ElMessage({
            message: `${device.name} 目标温度设置成功 - ${device.targetTemp}°C (当前温差: ${tempDiff}°C)`,
            type: 'success',
            duration: 3000
          })
          
          // 记录操作日志
          console.log(`设备 ${device.name} 温度设置成功:`, {
            targetTemp: device.targetTemp,
            currentTemp: device.currentTemp,
            tempDiff: tempDiff,
            powerStatus: device.powerStatus
          })
        } else {
          console.error('设置温度失败，后端响应:', response)
          ElMessage.error(response.message || '设置温度失败')
        }
      } catch (error) {
        console.error('设置温度操作异常:', error)
        ElMessage.error(`设置温度失败: ${error.message || '网络错误'}`)
      } finally {
        device.loading = false
      }
    }
    
    // 童锁控制 - 锁定温控器不允许现场操作
    const toggleTempLock = async (device) => {
      try {
        device.loading = true
        const newLockState = !device.tempLocked
        const lockAction = newLockState ? '开启' : '关闭'
        console.log(`正在${lockAction}设备 ${device.name} 的童锁功能`)
        
        const response = await API.thermostatAPI.lockTemperature(device.id, newLockState)
        console.log('童锁操作响应:', response)
        
        if (response.success) {
          // 更新设备状态 - 只更新后端明确返回的字段，避免undefined值覆盖现有状态
          if (response.data && response.data.device) {
            const updatedDevice = response.data.device
            console.log('后端返回的设备数据:', updatedDevice)
            
            // 创建更新对象，只包含后端明确返回的字段
            const updateData = {
              tempLocked: updatedDevice.temp_locked !== undefined ? updatedDevice.temp_locked : newLockState
            }
            
            // 只有当后端明确返回这些字段时才更新
            if (updatedDevice.current_temperature !== undefined) {
              updateData.currentTemp = updatedDevice.current_temperature
            }
            if (updatedDevice.target_temp !== undefined) {
              updateData.targetTemp = updatedDevice.target_temp
            }
            if (updatedDevice.power_status !== undefined) {
              updateData.powerStatus = updatedDevice.power_status
            }
            if (updatedDevice.fan_speed !== undefined) {
              updateData.fanSpeed = updatedDevice.fan_speed
            }
            if (updatedDevice.ac_mode !== undefined) {
              updateData.acMode = updatedDevice.ac_mode
            }
            
            Object.assign(device, updateData)
            console.log('童锁操作 - 设备状态更新:', updateData)
          } else {
            device.tempLocked = newLockState
          }
          
          // 显示详细的成功信息
          const statusText = device.tempLocked ? '现场操作已禁用' : '现场操作已启用'
          ElMessage({
            message: `${device.name} 童锁${device.tempLocked ? '开启' : '关闭'}成功 - ${statusText}`,
            type: 'success',
            duration: 3000
          })
          
          // 记录操作日志
          console.log(`设备 ${device.name} 童锁操作成功:`, {
            tempLocked: device.tempLocked,
            lockStatus: device.tempLocked ? '已锁定' : '已解锁',
            powerStatus: device.powerStatus
          })
        } else {
          console.error('童锁操作失败，后端响应:', response)
          ElMessage.error(response.message || '童锁操作失败')
        }
      } catch (error) {
        console.error('童锁操作异常:', error)
        ElMessage.error(`童锁操作失败: ${error.message || '网络错误'}`)
      } finally {
        device.loading = false
      }
    }
    


    const showDeviceSchedule = (device) => {
      selectedDevice.value = device
      showScheduleDialog.value = true
      // 加载该设备的计划
    }
    
    const loadDeviceRuntimeHistory = async (deviceId) => {
      try {
        if (!deviceRuntimeHistory.value) {
          console.warn('deviceRuntimeHistory 未定义，正在初始化')
          // 如果deviceRuntimeHistory未定义，则初始化它
          deviceRuntimeHistory.value = []
        }
        
        deviceRuntimeLoading.value = true
        // 获取最近30天的运行时间数据
        const endDate = new Date()
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - 30)
        
        const response = await API.thermostatAPI.getRunningStats({
          deviceId: deviceId,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        })
        
        if (response && response.success) {
          deviceRuntimeHistory.value = (response.data || []).map(item => ({
            ...item,
            date: item.date || item.stat_date || '',
            gear1Runtime: Number(item.gear1Runtime ?? item.runtime_speed1 ?? 0),
            gear2Runtime: Number(item.gear2Runtime ?? item.runtime_speed2 ?? 0),
            gear3Runtime: Number(item.gear3Runtime ?? item.runtime_speed3 ?? 0)
          }))

          const runtime = deviceRuntimeHistory.value.reduce((total, item) => ({
            speed1: total.speed1 + item.gear1Runtime,
            speed2: total.speed2 + item.gear2Runtime,
            speed3: total.speed3 + item.gear3Runtime
          }), { speed1: 0, speed2: 0, speed3: 0 })

          if (selectedDevice.value?.id === deviceId) {
            selectedDevice.value.runtime = runtime
          }
          // 数据加载完成后初始化图表
          await nextTick()
          window.requestAnimationFrame(() => initRuntimeChart())
        } else {
          console.error('获取设备运行时间历史数据失败:', response?.message || '未知错误')
          deviceRuntimeHistory.value = []
        }
      } catch (error) {
        console.error('获取设备运行时间历史数据异常:', error)
        deviceRuntimeHistory.value = []
      } finally {
        deviceRuntimeLoading.value = false
      }
    }

    const showDeviceDetail = async (device) => {
      selectedDevice.value = device
      showDetailDialog.value = true
      // 加载该设备的运行时间历史数据
      await loadDeviceRuntimeHistory(device.id)
    }

    // 定义运行时间图表引用
    const runtimeChart = ref(null)
    
    // 初始化运行时间图表
    const initRuntimeChart = () => {
      // 防御性检查
      if (!runtimeChart || !runtimeChart.value) {
        console.warn('图表DOM元素未找到')
        return
      }
      
      if (!deviceRuntimeHistory || !deviceRuntimeHistory.value || deviceRuntimeHistory.value.length === 0) {
        console.warn('没有可用的运行时间历史数据')
        return
      }

      try {
        // 销毁已存在的图表实例
        if (runtimeChart.value) {
          echarts.dispose(runtimeChart.value)
        }
        
        const chart = echarts.init(runtimeChart.value)
        
        // 准备图表数据
        const historyData = deviceRuntimeHistory.value || []
        const dates = historyData.map(item => item?.date || '')
        const gear1Data = historyData.map(item => item?.gear1Runtime || 0)
        const gear2Data = historyData.map(item => item?.gear2Runtime || 0)
        const gear3Data = historyData.map(item => item?.gear3Runtime || 0)
      
      const option = {
        title: {
          text: '设备运行时间趋势',
          left: 'center',
          textStyle: {
            fontSize: 16,
            color: '#333'
          }
        },
        tooltip: {
          trigger: 'axis',
          formatter: function(params) {
            let result = params[0].axisValue + '<br/>'
            params.forEach(param => {
              const hours = Math.floor(param.value / 3600)
              const minutes = Math.floor((param.value % 3600) / 60)
              result += param.marker + param.seriesName + ': ' + hours + '小时' + minutes + '分钟<br/>'
            })
            return result
          }
        },
        legend: {
          data: ['1档运行时间', '2档运行时间', '3档运行时间'],
          top: 30
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          top: '15%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: dates,
          axisLabel: {
            formatter: function(value) {
              return value.substring(5) // 显示月-日
            }
          }
        },
        yAxis: {
          type: 'value',
          name: '运行时间',
          axisLabel: {
            formatter: function(value) {
              const hours = Math.floor(value / 3600)
              const minutes = Math.floor((value % 3600) / 60)
              return hours > 0 ? hours + 'h' + (minutes > 0 ? minutes + 'm' : '') : minutes + 'm'
            }
          }
        },
        series: [
          {
            name: '1档运行时间',
            type: 'line',
            stack: 'Total',
            data: gear1Data,
            smooth: true,
            itemStyle: {
              color: '#67C23A'
            },
            areaStyle: {
              color: 'rgba(103, 194, 58, 0.3)'
            }
          },
          {
            name: '2档运行时间',
            type: 'line',
            stack: 'Total',
            data: gear2Data,
            smooth: true,
            itemStyle: {
              color: '#E6A23C'
            },
            areaStyle: {
              color: 'rgba(230, 162, 60, 0.3)'
            }
          },
          {
            name: '3档运行时间',
            type: 'line',
            stack: 'Total',
            data: gear3Data,
            smooth: true,
            itemStyle: {
              color: '#F56C6C'
            },
            areaStyle: {
              color: 'rgba(245, 108, 108, 0.3)'
            }
          }
        ]
      }
      
      chart.setOption(option)
      
      // 响应式调整
      window.addEventListener('resize', () => {
        chart.resize()
      })
      } catch (error) {
        console.error('初始化运行时间图表失败:', error)
      }
    }
    
    const loadDevicesByTenant = () => {
      filterAvailableDevices()
    }
    
    const filterAvailableDevices = () => {
      // 过滤逻辑已在计算属性中实现
    }
    
    const searchDevices = () => {
      // 搜索逻辑已在计算属性中实现
    }
    
    const loadStatsData = async () => {
      try {
        statsLoading.value = true
        
        const response = await API.thermostatAPI.getRunningStats({
          dateRange: statsDateRange.value,
          groupId: selectedGroupForStats.value,
          mode: selectedModeForStats.value
        })
        
        if (response.success) {
          // 映射后端字段到前端期望的字段名
          statsTableData.value = (response.data || []).map(item => ({
            ...item,
            deviceName: item.device_name || item.deviceName,
            group: item.group_name || item.group || '未分组'
          }))
          statsCurrentPage.value = 1
        } else {
          ElMessage.error(response.message || '获取统计数据失败')
          statsTableData.value = []
        }
        
      } catch (error) {
        console.error('加载统计数据失败:', error)
        ElMessage.error('加载统计数据失败')
      } finally {
        statsLoading.value = false
      }
    }
    
    // 重置计划表单
    const resetScheduleForm = () => {
      showAddScheduleDialog.value = false
      Object.assign(scheduleDeviceFilters, {
        keyword: '',
        tenantId: '',
        buildingId: '',
        groupId: '',
        status: ''
      })
      Object.assign(scheduleForm, {
        id: null,
        name: '',
        deviceIds: [],
        executeTime: '',
        repeatType: 'once',
        weekDays: [],
        customDates: [],
        powerAction: 'on',
        acMode: 'cool',
        targetTemp: 24,
        fanSpeed: 'auto',
        lockAction: 'none',
        enabled: true,
        description: ''
      })
      if (scheduleFormRef.value) {
        scheduleFormRef.value.clearValidate()
      }
    }

    const handleScheduleTenantChange = () => {
      scheduleDeviceFilters.buildingId = ''
      scheduleDeviceFilters.groupId = ''
    }

    const handleScheduleBuildingChange = () => {
      scheduleDeviceFilters.groupId = ''
    }

    const handleScheduleDeviceChange = deviceIds => {
      if (deviceIds.length < 2) return
      const firstDevice = thermostatDevices.value.find(device => device.id === deviceIds[0])
      const tenantId = firstDevice?.tenant_id || firstDevice?.tenantId || ''
      const sameTenantIds = deviceIds.filter(deviceId => {
        const device = thermostatDevices.value.find(item => item.id === deviceId)
        return String(device?.tenant_id || device?.tenantId || '') === String(tenantId)
      })

      if (sameTenantIds.length !== deviceIds.length) {
        scheduleForm.deviceIds = sameTenantIds
        ElMessage.warning('同一策略只能选择同一租户的设备')
      }
    }

    const selectAllFilteredScheduleDevices = () => {
      const selectedIds = new Set(scheduleForm.deviceIds)
      filteredScheduleDevices.value.forEach(device => selectedIds.add(device.id))
      scheduleForm.deviceIds = [...selectedIds]
      handleScheduleDeviceChange(scheduleForm.deviceIds)
    }

    const clearScheduleDevices = () => {
      scheduleForm.deviceIds = []
      scheduleFormRef.value?.clearValidate('deviceIds')
    }

    const getScheduleDeviceLabel = device => {
      const code = device.device_id || device.imei || ''
      const location = [
        device.project_building_name,
        device.project_group_name
      ].filter(Boolean).join(' / ')
      return [device.name, code, location].filter(Boolean).join(' - ')
    }
    
    // 提交计划
    const submitSchedule = async () => {
      try {
        const valid = await scheduleFormRef.value.validate()
        if (!valid) return
        
        submittingSchedule.value = true
        
        // 构建计划数据
        const scheduleData = {
          name: scheduleForm.name,
          deviceIds: scheduleForm.deviceIds,
          executeTime: scheduleForm.executeTime,
          repeatType: scheduleForm.repeatType,
          weekDays: scheduleForm.repeatType === 'weekly' ? scheduleForm.weekDays : [],
          customDates: scheduleForm.repeatType === 'custom' ? scheduleForm.customDates : [],
          powerAction: scheduleForm.powerAction,
          acMode: scheduleForm.powerAction === 'on' ? scheduleForm.acMode : null,
          targetTemp: scheduleForm.powerAction === 'on' ? scheduleForm.targetTemp : null,
          fanSpeed: scheduleForm.powerAction === 'on' ? scheduleForm.fanSpeed : null,
          lockAction: scheduleForm.lockAction,
          enabled: scheduleForm.enabled,
          description: scheduleForm.description
        }
        
        let response
        if (scheduleForm.id) {
          // 编辑模式
          response = await API.thermostatAPI.updateSchedule(scheduleForm.id, scheduleData)
        } else {
          // 添加模式
          response = await API.thermostatAPI.createSchedule(scheduleData)
        }
        
        if (response.success) {
          ElMessage.success(scheduleForm.id ? '计划更新成功' : '计划添加成功')
          resetScheduleForm()
          loadScheduleList() // 重新加载计划列表
        } else {
          ElMessage.error(response.message || (scheduleForm.id ? '计划更新失败' : '计划添加失败'))
        }
        
      } catch (error) {
        console.error('提交计划失败:', error)
        ElMessage.error('提交计划失败')
      } finally {
        submittingSchedule.value = false
      }
    }
    
    // 加载计划列表
    const loadScheduleList = async () => {
      try {
        loadingSchedules.value = true
        const response = await API.thermostatAPI.getScheduleList()
        
        if (response.success) {
          // 处理数据字段映射
          const schedules = (response.data || []).map(schedule => ({
            ...schedule,
            deviceIds: (schedule.devices || []).map(device => device.device_id),
            deviceName: (schedule.devices || []).map(device => device.device_name).join('、') || '未关联设备',
            action: schedule.power_action,
            time: String(schedule.execute_time || '').slice(0, 5),
            executeTime: String(schedule.execute_time || '').slice(0, 5),
            repeatType: schedule.repeat_type || 'once',
            repeatLabel: ({
              once: '仅一次',
              daily: '每天',
              weekly: '每周',
              custom: '指定日期'
            })[schedule.repeat_type] || '仅一次',
            weekDays: (schedule.week_days || []).map(String),
            customDates: schedule.custom_dates || [],
            powerAction: schedule.power_action,
            acMode: schedule.ac_mode,
            targetTemp: schedule.target_temp,
            fanSpeed: schedule.fan_speed,
            lockAction: schedule.lock_action || 'none',
            enabled: schedule.enabled !== false
          }))
          scheduleList.value = schedules
        } else {
          ElMessage.error(response.message || '加载计划列表失败')
          scheduleList.value = []
        }
      } catch (error) {
        console.error('加载计划列表失败:', error)
        ElMessage.error('加载计划列表失败')
        scheduleList.value = []
      } finally {
        loadingSchedules.value = false
      }
    }
    
    const toggleSchedule = async (schedule) => {
      try {
        const response = await API.thermostatAPI.toggleSchedule(schedule.id, schedule.enabled)
        if (response.success) {
          ElMessage.success(`计划已${schedule.enabled ? '启用' : '禁用'}`)
        } else {
          // 恢复原状态
          schedule.enabled = !schedule.enabled
          ElMessage.error(response.message || '操作失败')
        }
      } catch (error) {
        console.error('切换计划状态失败:', error)
        schedule.enabled = !schedule.enabled
        ElMessage.error('操作失败')
      }
    }
    
    const editSchedule = (schedule) => {
      // 填充表单数据
      Object.assign(scheduleForm, {
        id: schedule.id,
        name: schedule.name,
        deviceIds: schedule.deviceIds || [],
        executeTime: schedule.executeTime,
        repeatType: schedule.repeatType || 'once',
        weekDays: schedule.weekDays || [],
        customDates: schedule.customDates || [],
        powerAction: schedule.powerAction || 'on',
        acMode: schedule.acMode || 'cool',
        targetTemp: schedule.targetTemp || 24,
        fanSpeed: schedule.fanSpeed || 'auto',
        lockAction: schedule.lockAction || 'none',
        enabled: schedule.enabled !== false,
        description: schedule.description || ''
      })
      
      showAddScheduleDialog.value = true
    }
    
    const deleteSchedule = async (schedule) => {
      try {
        await ElMessageBox.confirm(
          `确定要删除计划 "${schedule.name}" 吗？`,
          '确认删除',
          {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
        
        const response = await API.thermostatAPI.deleteSchedule(schedule.id)
        if (response.success) {
          ElMessage.success('计划删除成功')
          loadScheduleList() // 重新加载列表
        } else {
          ElMessage.error(response.message || '删除失败')
        }
      } catch (error) {
        if (error !== 'cancel') {
          console.error('删除计划失败:', error)
          ElMessage.error('删除失败')
        }
      }
    }
    
    // 工具方法
    const getStatusTag = (status) => {
      const statusMap = {
        'running': 'success',
        'standby': 'warning',
        'offline': 'danger',
        'online': 'info'
      }
      return statusMap[status] || 'info'
    }
    
    const getStatusText = (status) => {
      const statusMap = {
        'running': '运行中',
        'standby': '待机',
        'offline': '离线',
        'online': '在线'
      }
      return statusMap[status] || '未知'
    }
    
    const formatRuntime = (seconds) => {
      const hours = Math.floor(seconds / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      return `${hours}小时${minutes}分钟`
    }
    
    // 统计相关方法
    const exportStatsData = async () => {
      try {
        exportLoading.value = true
        
        // 准备导出数据
        const exportData = statsTableData.value.map(item => ({
          '设备名称': item.deviceName,
          '分组': item.group,
          '位置': item.location,
          '统计日期': item.stat_date,
          '1档运行时间': formatRuntime(item.runtime_speed1 || 0),
          '2档运行时间': formatRuntime(item.runtime_speed2 || 0),
          '3档运行时间': formatRuntime(item.runtime_speed3 || 0)
        }))
        
        // 这里需要实现导出功能
        // 可以使用 xlsx 库或其他导出工具
        console.log('导出数据:', exportData)
        ElMessage.success('数据导出成功')
        
      } catch (error) {
        console.error('导出数据失败:', error)
        ElMessage.error('导出数据失败')
      } finally {
        exportLoading.value = false
      }
    }
    
    const handleStatsPageChange = (page) => {
      statsCurrentPage.value = page
    }
    
    const handleStatsPageSizeChange = (size) => {
      statsPageSize.value = size
      statsCurrentPage.value = 1
    }
    
    // 风速档位文本转换
    const getFanSpeedText = (speed) => {
      const speedMap = {
        0: 'A',
        1: '1',
        2: '2',
        3: '3'
      }
      return speedMap[speed] || '?'
    }
    
    const getFanSpeedLabel = (speed) => {
       const speedMap = {
         0: '自动',
         1: '1档',
         2: '2档', 
         3: '3档'
       }
       return speedMap[speed] || '未知'
     }
    
    // 空调模式文本转换
    const getAcModeText = (mode) => {
      const modeMap = {
        'cool': '❄',
        'heat': '🔥',
        'dehumidify': '💧',
        'fan': '🌀'
      }
      return modeMap[mode] || '❄'
    }
    
    const getAcModeLabel = (mode) => {
      const modeMap = {
        'cool': '制冷',
        'heat': '制热',
        'dehumidify': '除湿',
        'fan': '送风'
      }
      return modeMap[mode] || '未知'
    }
    
    // 设置空调模式
    const setAcMode = async (device, mode) => {
      try {
        device.loading = true
        console.log(`正在设置设备 ${device.name} 空调模式为: ${mode} (${getAcModeLabel(mode)})`)
        
        const response = await API.thermostatAPI.setMode(device.id, mode)
        console.log('设置空调模式操作响应:', response)
        
        // 改进成功判断逻辑：检查response.success和HTTP状态码
        const isSuccess = response.success || (response.httpStatus >= 200 && response.httpStatus < 300)
        
        if (isSuccess) {
          // 更新设备状态 - 使用后端返回的最新设备数据
          if (response.data && response.data.device) {
            const updatedDevice = response.data.device
            console.log('后端返回的设备数据:', updatedDevice)
            
            // 只更新明确返回的字段，避免undefined覆盖现有状态
            const updateData = {
              acMode: updatedDevice.ac_mode || mode
            }
            
            // 只有当后端明确返回这些字段时才更新
            if (updatedDevice.current_temperature !== undefined) {
              updateData.currentTemp = updatedDevice.current_temperature
            }
            if (updatedDevice.target_temp !== undefined) {
              updateData.targetTemp = updatedDevice.target_temp
            }
            if (updatedDevice.power_status !== undefined) {
              updateData.powerStatus = updatedDevice.power_status
            }
            if (updatedDevice.fan_speed !== undefined) {
              updateData.fanSpeed = updatedDevice.fan_speed
            }
            if (updatedDevice.temp_locked !== undefined) {
              updateData.tempLocked = updatedDevice.temp_locked
            }
            
            Object.assign(device, updateData)
            console.log('🔄 [模式设置] 设备状态更新:', {
              设备名称: device.name,
              更新字段: Object.keys(updateData),
              电源状态: device.powerStatus,
              空调模式: device.acMode
            })
          } else {
            device.acMode = mode
          }
          
          // 显示详细的成功信息
          ElMessage({
            message: `${device.name} 空调模式设置成功 - ${getAcModeLabel(mode)}`,
            type: 'success',
            duration: 3000
          })
          
          // 记录操作日志
          console.log(`设备 ${device.name} 空调模式设置成功:`, {
            acMode: device.acMode,
            acModeLabel: getAcModeLabel(device.acMode),
            powerStatus: device.powerStatus,
            targetTemp: device.targetTemp
          })
        } else {
          console.error('设置空调模式失败，后端响应:', response)
          // 只在真正的错误状态码时显示错误
          if (response.httpStatus && response.httpStatus >= 400) {
            ElMessage.error(response.message || '设置空调模式失败')
          } else {
            // 可能是成功但前端判断逻辑有问题，先更新本地状态
            device.acMode = mode
            ElMessage({
              message: `${device.name} 空调模式设置成功 - ${getAcModeLabel(mode)}`,
              type: 'success',
              duration: 3000
            })
            console.log(`设备 ${device.name} 空调模式设置成功 (备用逻辑):`, {
              acMode: device.acMode,
              acModeLabel: getAcModeLabel(device.acMode)
            })
          }
        }
      } catch (error) {
        console.error('设置空调模式操作异常:', error)
        ElMessage.error(`设置空调模式失败: ${error.message || '网络错误'}`)
      } finally {
        device.loading = false
      }
    }
    
    // 执行情景模式
    const executeScene = async (sceneType) => {
      try {
        const activeDevices = thermostatDevices.value.filter(device => device.powerStatus)
        const allDevices = thermostatDevices.value
        
        switch (sceneType) {
          case 'powerOn':
            // 一键开机
            for (const device of allDevices) {
              if (!device.powerStatus) {
                await turnOnDevice(device)
              }
            }
            ElMessage.success('已执行一键开机')
            break
            
          case 'powerOff':
            // 一键关机
            for (const device of activeDevices) {
              await turnOffDevice(device)
            }
            ElMessage.success('已执行一键关机')
            break
            
          case 'unlock':
            // 一键解锁 - 传递false表示解锁
            for (const device of allDevices) {
              try {
                device.loading = true
                const response = await API.thermostatAPI.lockTemperature(device.id, false)
                if (response.success) {
                  device.tempLocked = false
                }
              } catch (error) {
                console.error('解锁设备失败:', error)
              } finally {
                device.loading = false
              }
            }
            ElMessage.success('已执行一键解锁')
            break
            
          case 'summer':
            // 夏季模式 - 26°C
            for (const device of activeDevices) {
              device.targetTemp = 26
              await setTargetTemp(device)
            }
            ElMessage.success('已设置为夏季模式(26°C)')
            break
            
          case 'winter':
            // 冬季模式 - 22°C
            for (const device of activeDevices) {
              device.targetTemp = 22
              await setTargetTemp(device)
            }
            ElMessage.success('已设置为冬季模式(22°C)')
            break
            
          case 'lock':
            // 一键锁定 - 传递true表示锁定
            for (const device of allDevices) {
              try {
                device.loading = true
                const response = await API.thermostatAPI.lockTemperature(device.id, true)
                if (response.success) {
                  device.tempLocked = true
                }
              } catch (error) {
                console.error('锁定设备失败:', error)
              } finally {
                device.loading = false
              }
            }
            ElMessage.success('已执行一键锁定')
            break
        }
        
        showSceneDialog.value = false
      } catch (error) {
        console.error('执行情景模式失败:', error)
        ElMessage.error('执行情景模式失败')
      }
    }
    
    // 快捷操作
    const quickPowerOn = async (device) => {
      await turnOnDevice(device)
    }
    
    const quickPowerOff = async (device) => {
      await turnOffDevice(device)
    }
    
    const quickSetComfortTemp = async (device) => {
      device.targetTemp = 24
      await setTargetTemp(device)
    }
    
    // 查询设备状态
    const queryDeviceStatus = async (device) => {
      try {
        device.loading = true
        const response = await API.thermostatAPI.getDeviceStatus(device.id)
        if (response.success && response.data) {
          // 更新设备状态数据
          updateDeviceWithStatusData(device, response.data)
          ElMessage.success(`${device.name} 状态查询成功`)
        } else {
          ElMessage.error(response.message || '状态查询失败')
        }
      } catch (error) {
        console.error('查询设备状态失败:', error)
        ElMessage.error('查询设备状态失败')
      } finally {
        device.loading = false
      }
    }

    // 查询所有设备状态
    const queryAllDevicesStatus = async () => {
      try {
        console.log('🔄 [API查询] 开始批量查询所有设备状态', {
          设备数量: thermostatDevices.value.length,
          时间戳: new Date().toLocaleTimeString()
        })
        
        let successCount = 0
        const promises = thermostatDevices.value.map(async (device) => {
          try {
            console.log(`🔍 [API查询] 查询设备 ${device.name} (ID: ${device.id}) 状态`)
            const response = await API.thermostatAPI.getDeviceStatus(device.id)
            if (response.success && response.data) {
              console.log(`📊 [API响应] 设备 ${device.name} 状态查询成功:`, response.data)
              updateDeviceWithStatusData(device, response.data)
              successCount++
            } else {
              console.warn(`⚠️ [API响应] 设备 ${device.name} 状态查询失败:`, response)
            }
            return response
          } catch (error) {
            console.error(`❌ [API错误] 查询设备 ${device.name} 状态失败:`, error)
            return null
          }
        })
        await Promise.all(promises)
        
        console.log(`✅ [API查询完成] 批量查询完成，成功: ${successCount}/${thermostatDevices.value.length}`)
        ElMessage.success(`成功查询 ${successCount} 个设备状态`)
      } catch (error) {
        console.error('❌ [API错误] 批量查询设备状态失败:', error)
        ElMessage.error('批量查询设备状态失败')
      }
    }

    // 更新设备状态数据
    const updateDeviceWithStatusData = (device, statusData) => {
      console.log(`🔍 [状态更新] 开始处理设备 ${device.name} (ID: ${device.id}) 的状态数据:`, {
        原始数据: statusData,
        当前设备状态: {
          powerStatus: device.powerStatus,
          status: device.status,
          currentTemp: device.currentTemp,
          targetTemp: device.targetTemp,
          loading: device.loading
        }
      })
      
      // 保存当前的loading状态，避免被WebSocket响应覆盖
      const currentLoadingState = device.loading
      
      // 解析协议数据结构 - 处理 payload.body 格式的数据
      let parsedData = statusData
      if (statusData.body && statusData.body.data && statusData.body.items) {
        console.log(`📊 [数据解析] 检测到协议格式数据，开始解析:`, {
          items: statusData.body.items,
          data: statusData.body.data[0] // 通常只有一组数据
        })
        
        // 将数组数据映射为对象格式
        parsedData = {}
        const dataArray = statusData.body.data[0] || []
        statusData.body.items.forEach((item, index) => {
          if (index < dataArray.length) {
            parsedData[item] = dataArray[index]
          }
        })
        
        console.log(`✅ [数据解析] 协议数据解析完成:`, parsedData)
        
        // 保留原始数据中的其他字段
        Object.keys(statusData).forEach(key => {
          if (key !== 'body' && !parsedData.hasOwnProperty(key)) {
            parsedData[key] = statusData[key]
          }
        })
      }
      
      // 更新设备基本信息
      if (parsedData.deviceName) device.name = parsedData.deviceName
      if (parsedData.status) device.status = parsedData.status
      if (parsedData.location) device.location = parsedData.location
      
      // 更新温控器状态信息 - 兼容多种字段名格式，确保数据类型正确
      // 处理当前温度 - 支持协议原始字段和标准字段
      const currentTemp = parsedData.currentTemperature ?? parsedData.current_temperature ?? parsedData.roomTemp
      if (currentTemp !== null && currentTemp !== undefined) {
        // 如果是协议原始数据roomTemp，需要除以10转换单位
        if (parsedData.roomTemp !== undefined) {
          device.currentTemp = typeof currentTemp === 'string' ? parseFloat(currentTemp) / 10 : currentTemp / 10
        } else {
          device.currentTemp = typeof currentTemp === 'string' ? parseFloat(currentTemp) : currentTemp
        }
        console.log(`🌡️ [温度更新] 当前温度: ${device.currentTemp}°C (原始值: ${currentTemp})`)
      }
      
      // 处理目标温度 - 支持协议原始字段和标准字段
      // runTemp用于反映当前目标温度，setTemp用于设置温度命令
      const targetTemp = parsedData.targetTemperature ?? parsedData.target_temperature ?? parsedData.runTemp ?? parsedData.setTemp
      if (targetTemp !== null && targetTemp !== undefined) {
        // 如果是协议原始数据runTemp或setTemp，需要除以10转换单位
        if (parsedData.runTemp !== undefined || parsedData.setTemp !== undefined) {
          device.targetTemp = typeof targetTemp === 'string' ? parseFloat(targetTemp) / 10 : targetTemp / 10
        } else {
          device.targetTemp = typeof targetTemp === 'string' ? parseFloat(targetTemp) : targetTemp
        }
        console.log(`🎯 [目标温度] 设定温度: ${device.targetTemp}°C (原始值: ${targetTemp})`)
      }
      
      // 处理运行模式 - 支持协议原始字段和标准字段
      const mode = parsedData.mode ?? parsedData.acMode
      if (mode) {
        device.acMode = mode
        console.log(`🔄 [模式更新] 运行模式: ${device.acMode}`)
      } else if (parsedData.runMode !== undefined || parsedData.setMode !== undefined) {
        // 处理协议原始模式数据 - runMode用于反映当前模式，setMode用于设置命令
        // runMode是当前实际运行模式，setMode是设置模式命令
        const modeValue = parsedData.runMode ?? parsedData.setMode
        const numericMode = typeof modeValue === 'string' ? parseInt(modeValue) : modeValue
        const oldMode = device.acMode
        switch (numericMode) {
          case 0: device.acMode = 'fan'; break;        // 送风模式
          case 1: device.acMode = 'heat'; break;       // 制热模式
          case 2: device.acMode = 'cool'; break;       // 制冷模式
          case 3: device.acMode = 'dehumidify'; break; // 除湿模式
          default: device.acMode = 'cool';             // 默认制冷模式
        }
        console.log(`🔄 [模式转换] ${oldMode} → ${device.acMode} (原始值: ${modeValue})`)
      }
      
      // 处理电源状态 - runOn用于反映当前状态，setOn用于设置命令
      // 根据协议文档：runOn是当前运行状态（0=关机，1=开机），setOn是设置开关机命令（0=关机，1=开机）
      // 注意：runOn和setOn作用不同，runOn用于显示当前状态，setOn仅在没有runOn时作为状态参考
      console.log(`⚡ [电源状态分析] 开始分析电源相关字段:`, {
        runOn: parsedData.runOn,
        setOn: parsedData.setOn,
        isOn: parsedData.isOn,
        is_on: parsedData.is_on,
        powerStatus: parsedData.powerStatus,
        当前设备状态: {
          powerStatus: device.powerStatus,
          status: device.status
        }
      })
      
      let powerStatus = null
      let powerSource = ''
      
      // 修复逻辑：优先使用runOn字段，它反映设备的真实运行状态
      if (parsedData.runOn !== null && parsedData.runOn !== undefined) {
        // runOn字段：需要与后端映射逻辑保持一致
        const runOnValue = typeof parsedData.runOn === 'string' ? parseInt(parsedData.runOn) : parsedData.runOn
        
        // 修复：与后端映射逻辑保持一致 - 16→0(关机), 17→1(开机), 其他值保持不变
        let mappedValue
        if (runOnValue === 16) {
          mappedValue = 0 // 16视为0（关机）
        } else if (runOnValue === 17) {
          mappedValue = 1 // 17视为1（运行）
        } else {
          mappedValue = runOnValue // 其他值保持不变
        }
        
        powerStatus = mappedValue === 1
         device.status = mappedValue === 1 ? 'running' : 'standby'
        
        powerSource = 'runOn'
        console.log(`⚡ [电源字段] 使用runOn字段(当前状态): ${parsedData.runOn} → 映射值:${mappedValue} → 状态:${device.status}, 可操作:${powerStatus}，说明: ${mappedValue === 1 ? '运行' : '待机'}`)
      } else if (parsedData.isOn !== null && parsedData.isOn !== undefined) {
        powerStatus = parsedData.isOn
        powerSource = 'isOn'
        console.log(`⚡ [电源字段] 使用isOn字段: ${parsedData.isOn} → ${powerStatus ? '开机' : '关机'}`)
      } else if (parsedData.is_on !== null && parsedData.is_on !== undefined) {
        powerStatus = parsedData.is_on
        powerSource = 'is_on'
        console.log(`⚡ [电源字段] 使用is_on字段: ${parsedData.is_on} → ${powerStatus ? '开机' : '关机'}`)
      } else if (parsedData.powerStatus !== null && parsedData.powerStatus !== undefined) {
        powerStatus = parsedData.powerStatus
        powerSource = 'powerStatus'
        console.log(`⚡ [电源字段] 使用powerStatus字段: ${parsedData.powerStatus} → ${powerStatus ? '开机' : '关机'}`)
      } else if (parsedData.setOn !== null && parsedData.setOn !== undefined) {
        // setOn字段：0=关机，1=开机（设置命令字段，仅在没有runOn时用于状态参考）
        const setOnValue = typeof parsedData.setOn === 'string' ? parseInt(parsedData.setOn) : parsedData.setOn
        powerStatus = setOnValue === 1
        powerSource = 'setOn'
        console.log(`⚡ [电源字段] 使用setOn字段(设置命令): ${parsedData.setOn} → ${powerStatus ? '开机' : '关机'}`)
      } else {
        console.log(`⚠️ [电源字段] 未找到任何电源状态字段，保持当前状态`)
      }
      
      if (powerStatus !== null) {
        const oldPowerStatus = device.powerStatus
        const oldStatus = device.status
        
        // 简化逻辑：只有明确的电源操作才更新powerStatus
        // 风速和模式操作不应影响电源状态
        
        device.powerStatus = Boolean(powerStatus)
        // 只有在使用runOn字段时，status已经在上面设置了，其他情况按原逻辑
        if (powerSource !== 'runOn') {
          device.status = device.powerStatus ? 'running' : 'standby'
        }
        
        console.log(`✅ [电源状态更新] 设备 ${device.name} 电源状态已更新:`, {
          数据源: powerSource,
          原始值: parsedData.setOn || parsedData.isOn || parsedData.is_on || parsedData.powerStatus || parsedData.runOn,
          状态变化: {
            powerStatus: `${oldPowerStatus} → ${device.powerStatus}`,
            status: `${oldStatus} → ${device.status}`,
            显示文本: device.status === 'running' ? '运行中' : (device.status === 'standby' ? '待机' : '离线'),
            可操作: device.powerStatus ? '是' : '否'
          },
          保护机制: powerSource === 'setOn' && oldPowerStatus && !Boolean(powerStatus) ? '已启用' : '未触发',
          时间戳: new Date().toLocaleTimeString()
        })
        
        // 如果状态发生变化，额外记录
        if (oldPowerStatus !== device.powerStatus) {
          console.log(`🔄 [状态变化] 设备 ${device.name} 状态发生变化: ${oldStatus} → ${device.status}`)
        } else {
          console.log(`📍 [状态保持] 设备 ${device.name} 状态保持不变: ${device.status}`)
        }
      } else {
        console.log(`🛡️ [保护机制] 设备 ${device.name} 未找到有效的电源状态信息，保持当前状态: powerStatus=${device.powerStatus}, status=${device.status}`)
      }
      
      // 处理湿度
      if (parsedData.humidity !== null && parsedData.humidity !== undefined) {
        device.humidity = parsedData.humidity
        console.log(`💧 [湿度更新] 湿度: ${device.humidity}%`)
      }
      
      console.log(`✅ [状态更新完成] 设备 ${device.name} 最终状态:`, {
        powerStatus: device.powerStatus,
        status: device.status,
        显示状态: device.status === 'running' ? '运行中' : '待机',
        currentTemp: device.currentTemp,
        targetTemp: device.targetTemp,
        acMode: device.acMode,
        humidity: device.humidity
      })
      
      // 处理风速 - 支持协议原始字段和标准字段
      // runFanSpeed用于反映当前风速，setFanSpeed用于设置风速命令
      const fanSpeed = parsedData.fanSpeed ?? parsedData.runFanSpeed ?? parsedData.setFanSpeed
      if (fanSpeed !== null && fanSpeed !== undefined) {
        device.fanSpeed = typeof fanSpeed === 'string' ? parseInt(fanSpeed) : fanSpeed
        console.log(`🌀 [风速更新] 风速: ${device.fanSpeed} (${getFanSpeedLabel(device.fanSpeed)})`)  
      }
      
      const tempLocked = parsedData.tempLocked ?? parsedData.temp_locked
      if (tempLocked !== null && tempLocked !== undefined) {
        device.tempLocked = tempLocked
      }
      
      // 更新分组信息
      const groupName = parsedData.groupName ?? parsedData.group_name
      if (groupName) {
        device.group = groupName
      }
      
      // 恢复loading状态，确保WebSocket响应不会干扰正在进行的操作
      device.loading = currentLoadingState
      
      console.log(`设备 ${device.name} 状态已更新:`, {
        currentTemp: device.currentTemp,
        targetTemp: device.targetTemp,
        mode: device.acMode,
        powerStatus: device.powerStatus,
        fanSpeed: device.fanSpeed,
        humidity: device.humidity,
        tempLocked: device.tempLocked,
        loading: device.loading,
        originalData: statusData // 添加原始数据用于调试
      })
    }

    // WebSocket事件处理函数
    const handleDeviceStatusUpdate = (data) => {
      console.log('📡 [WebSocket状态] 收到温控器设备状态更新:', {
        事件类型: 'device_status_update',
        设备ID: data.device_id,
        状态: data.status,
        完整消息: data,
        时间戳: new Date().toLocaleTimeString()
      })
      // 查找对应的设备并更新状态 - 修复：使用id字段匹配（WebSocket中的device_id实际是数据库主键ID）
      const device = thermostatDevices.value.find(d => d.id === data.device_id)
      if (device) {
        device.status = data.status
        console.log(`🎯 [状态更新] 设备 ${device.name} (id: ${device.id}) 状态已更新为: ${data.status}`)
      } else {
        console.warn(`⚠️ [设备匹配] 未找到id为 ${data.device_id} 的设备，当前设备列表:`, 
          thermostatDevices.value.map(d => ({ id: d.id, device_id: d.device_id, name: d.name })))
      }
    }

    const handleDeviceData = (data) => {
      console.log('📡 [WebSocket数据] 收到温控器设备数据:', {
        事件类型: 'device_data',
        设备ID: data.device_id,
        数据内容: data.data,
        完整消息: data,
        时间戳: new Date().toLocaleTimeString()
      })
      
      // 查找对应的设备并更新数据 - 修复：使用id字段匹配（WebSocket中的device_id实际是数据库主键ID）
      const device = thermostatDevices.value.find(d => d.id === data.device_id)
      if (device && data.data) {
        console.log(`🎯 [设备匹配] 找到设备: ${device.name} (id: ${device.id}), 开始更新状态`)
        updateDeviceWithStatusData(device, data.data)
      } else if (!device) {
        console.warn(`⚠️ [设备匹配] 未找到id为 ${data.device_id} 的设备，当前设备列表:`, 
          thermostatDevices.value.map(d => ({ id: d.id, device_id: d.device_id, name: d.name })))
      } else if (!data.data) {
        console.warn(`⚠️ [数据检查] 设备数据为空:`, data)
      }
    }

    const handleDeviceResponse = (data) => {
      console.log('📡 [WebSocket响应] 收到温控器设备响应:', {
        事件类型: 'device_response',
        设备ID: data.device_id,
        数据内容: data.data,
        完整消息: data,
        时间戳: new Date().toLocaleTimeString()
      })
      
      // 查找对应的设备并更新数据 - 修复：使用id字段匹配（WebSocket中的device_id实际是数据库主键ID）
      const device = thermostatDevices.value.find(d => d.id === data.device_id)
      if (device && data.data) {
        console.log(`🎯 [设备匹配] 找到设备: ${device.name} (id: ${device.id}), 开始更新状态`)
        updateDeviceWithStatusData(device, data.data)
      } else if (!device) {
        console.warn(`⚠️ [设备匹配] 未找到id为 ${data.device_id} 的设备，当前设备列表:`, 
          thermostatDevices.value.map(d => ({ id: d.id, device_id: d.device_id, name: d.name })))
      } else if (!data.data) {
        console.warn(`⚠️ [数据检查] 设备响应数据为空:`, data)
      }
    }

    // 生命周期
    onMounted(async () => {
      console.log('温控器页面开始初始化')
      
      await Promise.all([
        loadTenantList(),
        loadDeviceTypeList(),
        loadGroups(),
        loadScheduleList()
      ])
      
      // 初始化WebSocket连接
      websocketService.connect()
      
      // 监听WebSocket事件
      websocketService.on('device_status_update', handleDeviceStatusUpdate)
      websocketService.on('device_data', handleDeviceData)
      websocketService.on('device_response', handleDeviceResponse)
      
      // 进入页面时立即加载设备列表
      console.log('开始加载温控器设备列表')
      await loadThermostatDevices()
      console.log('设备列表加载完成，设备数量:', thermostatDevices.value.length)
      
      // 移除自动查询逻辑，完全依赖WebSocket实时数据更新
        console.log('📡 [状态更新策略] 已移除页面初始化自动查询，状态更新完全依赖WebSocket实时数据', {
          设备数量: thermostatDevices.value.length,
          时间戳: new Date().toLocaleTimeString(),
          说明: '避免API查询覆盖WebSocket实时状态'
        })
     })

    // 组件卸载时清理资源
    onUnmounted(() => {
      // 移除WebSocket监听器
      websocketService.off('device_status_update', handleDeviceStatusUpdate)
      websocketService.off('device_data', handleDeviceData)
      websocketService.off('device_response', handleDeviceResponse)
    })
    
    return {
      // 响应式数据
      loading,
      searchKeyword,
      userInfo,
      isAdmin,
      selectedTenant,
      selectedBuilding,
      selectedProjectGroup,
      selectedStatus,
      showAddDialog,
      showScheduleDialog,
      showStatsDialog,
      showDetailDialog,
      showAddScheduleDialog,
      showSceneDialog,
      thermostatDevices,
      deviceCurrentPage,
      devicePageSize,
      tenantList,
      deviceTypeList,
      deviceGroups,
      buildingOptions,
      availableDevices,
      selectedDevices,
      selectedDevice,
      selectedTenantForAdd,
      selectedDeviceTypeForAdd,
      deviceSearchKeyword,
      loadingDevices,
      addingDevices,
      scheduleList,
      loadingSchedules,
      submittingSchedule,
      scheduleFormRef,
      scheduleForm,
      scheduleRules,
      scheduleDeviceFilters,
      statsDateRange,
      selectedGroupForStats,
      selectedModeForStats,
      statsLoading,
      exportLoading,
      statsTableData,
      statsCurrentPage,
      statsPageSize,
      totalStats,
      deviceRuntimeHistory,
      deviceRuntimeLoading,
      runtimeChart,
      
      // 计算属性
      filteredDevices,
      filteredBuildingOptions,
      filteredProjectGroupOptions,
      filteredScheduleDevices,
      scheduleBuildingOptions,
      scheduleGroupOptions,
      paginatedDevices,
      filteredAvailableDevices,
      runningDevicesCount,
      paginatedStatsData,
      totalSpeed1Runtime,
      totalSpeed2Runtime,
      totalSpeed3Runtime,
      
      // 方法
      refreshAllDevicesData,
      handleSearch,
      handleGroupFilter,
      handleTenantFilter,
      handleBuildingFilter,
      handleStatusFilter,
      handleScheduleTenantChange,
      handleScheduleBuildingChange,
      handleScheduleDeviceChange,
      selectAllFilteredScheduleDevices,
      clearScheduleDevices,
      getScheduleDeviceLabel,
      handleDevicePageChange,
      handleDevicePageSizeChange,
      openAddDialog,
      handleDeviceSelection,
      addSelectedDevices,
      deleteDevice,
      turnOnDevice,
      turnOffDevice,
      handlePowerOn,
      handlePowerOff,
      setFanSpeed,
      adjustTemp,
      setTargetTemp,
      toggleTempLock,
      showDeviceSchedule,
      showDeviceDetail,
      loadDevicesByTenant,
      filterAvailableDevices,
      searchDevices,
      loadStatsData,
      resetScheduleForm,
      submitSchedule,
      loadScheduleList,
      toggleSchedule,
      editSchedule,
      deleteSchedule,
      getStatusTag,
      getStatusText,
      formatRuntime,
      exportStatsData,
      handleStatsPageChange,
      handleStatsPageSizeChange,
      executeScene,
      getFanSpeedText,
      getFanSpeedLabel,
      getAcModeText,
      getAcModeLabel,
      setAcMode,
      loadGroups,
      queryDeviceStatus,
      queryAllDevicesStatus
    }
  }
}
</script>

<style scoped>
.thermostat-control {
  padding: 20px;
  background-color: #f5f5f5;
  min-height: 100vh;
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 20px;
  background: white;
  border-radius: 8px;
  
  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
}
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.page-header h2 {
  margin: 0;
  color: #333;
  font-size: 24px;
}

.header-actions {
  display: flex;
  gap: 10px;
  
  @media (max-width: 768px) {
    flex-wrap: wrap;
    width: 100%;
  }
  
  @media (max-width: 480px) {
    justify-content: space-between;
  }
}

.filter-section {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 20px;
  
  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
  }
}

.search-input {
  flex: 1;
  max-width: 180px;
  
  @media (max-width: 768px) {
    max-width: 100%;
    width: 100%;
  }
}

.filter-controls {
  display: flex;
  gap: 10px;
  
  @media (max-width: 768px) {
    width: 100%;
    flex-wrap: wrap;
  }
  
  @media (max-width: 480px) {
    justify-content: space-between;
  }
}

.stats-info {
  display: flex;
  gap: 20px;
  color: #666;
  font-size: 14px;
  
  @media (max-width: 768px) {
    width: 100%;
    justify-content: space-between;
  }
}

.device-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(252px, 1fr));
  gap: 20px;
  
  @media (max-width: 768px) {
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  }
  
  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
}

.device-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
  padding: 14px 16px;
  background: white;
  border-radius: 8px;
}

.thermostat-card {
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.thermostat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}

/* 现代化卡片头部样式 - 紧凑版 */
.modern-card-header {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 0;
  margin-bottom: 8px;
}

.modern-card-header > .el-tag {
  margin-top: 2px;
}

.device-identity {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  padding-right: 10px;
}

.device-avatar {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  background: linear-gradient(135deg, #e0e7ff, #c7d2fe);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #6366f1;
  transition: all 0.3s ease;
}

.device-avatar.online {
  background: linear-gradient(135deg, #10b981, #34d399);
  color: white;
  box-shadow: 0 0 15px rgba(16, 185, 129, 0.3);
}

.device-meta {
  flex: 1;
  min-width: 0;
}

.device-title {
  margin: 0 0 2px 0;
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  line-height: 1.2;
}

.device-info-line {
  display: block;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.device-location {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-tags {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.group-tag {
  background: #f3f4f6;
  color: #6b7280;
  padding: 1px 4px;
  border-radius: 6px;
  font-size: 9px;
  font-weight: 500;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 9px;
  font-weight: 500;
}

.status-indicator.running {
  color: #10b981;
}

.status-indicator.standby {
  color: #f59e0b;
}

.status-indicator.offline {
  color: #ef4444;
}

.status-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

/* 右上角删除按钮样式 */
.top-right-delete {
  position: absolute;
  top: -8px;
  right: -8px;
  z-index: 10;
  background: #ef4444 !important;
  border: 2px solid white !important;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3) !important;
}

.top-right-delete:hover {
  background: #dc2626 !important;
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4) !important;
}

.header-actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
  margin-left: auto;
}

.action-btn {
  border: none !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
}

/* 现代化温度显示样式 - 紧凑版 */
.modern-temperature-section {
  margin: 0px 0 8px 0;
}

.temp-display-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.temp-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 6px 4px;
  text-align: center;
  transition: all 0.3s ease;
}

.temp-card:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.temp-card.current {
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  border-color: #f59e0b;
}

.temp-card.target {
  background: linear-gradient(135deg, #dbeafe, #bfdbfe);
  border-color: #3b82f6;
}

.temp-card.lock {
  background: linear-gradient(135deg, #fee2e2, #fecaca);
  border-color: #ef4444;
}

.temp-card.lock.locked {
  background: linear-gradient(135deg, #dcfce7, #bbf7d0);
  border-color: #22c55e;
}

.temp-icon {
  font-size: 12px;
  margin-bottom: 3px;
  color: #6b7280;
}

.temp-card.current .temp-icon {
  color: #f59e0b;
}

.temp-card.target .temp-icon {
  color: #3b82f6;
}

.temp-card.lock .temp-icon {
  color: #ef4444;
}

.temp-card.lock.locked .temp-icon {
  color: #22c55e;
}

.temp-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.temp-value {
  font-size: 14px;
  font-weight: 700;
  color: #1f2937;
  line-height: 1;
}

.temp-status {
  font-size: 10px;
  font-weight: 600;
  color: #1f2937;
}

.temp-label {
  font-size: 9px;
  color: #6b7280;
  font-weight: 500;
}

/* 现代化电源控制样式 - 紧凑版 */
.modern-power-section {
  margin: 8px 0;
}

.power-status-card {
  background: #f8fafc;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.3s ease;
}

.power-status-card.active {
  background: linear-gradient(135deg, #ecfdf5, #d1fae5);
  border-color: #10b981;
  box-shadow: 0 0 15px rgba(16, 185, 129, 0.1);
}

.power-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
}

.power-icon {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #6b7280;
  transition: all 0.3s ease;
}

.power-status-card.active .power-icon {
  background: #10b981;
  color: white;
}

/* 风扇转动动画 */
.fan-rotating {
  animation: rotate 2s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.power-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.power-text {
  font-size: 12px;
  font-weight: 600;
  color: #1f2937;
}

.power-subtitle {
  font-size: 10px;
  color: #6b7280;
}

.power-controls {
  display: flex;
  gap: 4px;
}

.power-btn {
  width: 26px;
  height: 26px;
  border: none !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
}

/* 现代化控制面板样式 - 紧凑版 */
.modern-control-section {
  margin: 8px 0;
}

.control-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}

.control-panel {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 7px;
}

.control-header {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #374151;
}

.control-options {
  display: flex;
  gap: 2px;
  margin-bottom: 4px;
}

.speed-btn, .mode-btn {
  flex: 1;
  min-width: 20px;
  height: 22px;
  border: 1px solid #d1d5db !important;
  background: white !important;
  color: #6b7280 !important;
  font-size: 10px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.speed-btn.active, .mode-btn.active {
  background: #3b82f6 !important;
  border-color: #3b82f6 !important;
  color: white !important;
  box-shadow: 0 2px 6px rgba(59, 130, 246, 0.3) !important;
}

.mode-options {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2px;
}

.mode-btn {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.control-status {
  font-size: 9px;
  color: #6b7280;
  text-align: center;
}

/* 现代化温度调节样式 - 紧凑版 */
.modern-temp-control {
  margin: 8px 0;
}

.temp-adjust-panel {
  background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
  border: 1px solid #0ea5e9;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.adjust-header {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: #0c4a6e;
  white-space: nowrap;
}

.temp-adjuster {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.adjust-btn {
  width: 28px;
  height: 28px;
  border: none !important;
  box-shadow: 0 2px 6px rgba(59, 130, 246, 0.3) !important;
  font-size: 14px;
}

.temp-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.temp-input-wrapper .el-input-number {
  width: 50px;
}

.temp-input-wrapper .el-input-number :deep(.el-input__inner) {
  text-align: center;
  font-size: 14px;
  font-weight: 700;
  border: none;
  border-radius: 6px;
  background: transparent;
}

.temp-unit {
  position: absolute;
  right: 4px;
  font-size: 10px;
  color: #6b7280;
  font-weight: 600;
  pointer-events: none;
}

/* 现代化操作按钮样式 - 紧凑版 */
.modern-action-section {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e5e7eb;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
}

.action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 4px !important;
  border: 1px solid #d1d5db !important;
  border-radius: 6px !important;
  background: white !important;
  color: #6b7280 !important;
  font-size: 9px;
  font-weight: 500;
  transition: all 0.3s ease;
  height: auto !important;
}

.action-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15) !important;
}

.action-btn.lock-btn.locked {
  background: #fef3c7 !important;
  border-color: #f59e0b !important;
  color: #92400e !important;
}

.action-btn.schedule-btn {
  background: #fef3c7 !important;
  border-color: #f59e0b !important;
  color: #92400e !important;
}

.action-btn.detail-btn {
  grid-column: 3;
  background: #eff6ff !important;
  border-color: #3b82f6 !important;
  color: #1e40af !important;
}

.action-btn span {
  font-size: 9px;
  line-height: 1;
}

/* 响应式设计优化 */
@media (max-width: 768px) {
  .temp-display-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  
  .control-grid {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  
  .temp-adjuster {
    gap: 12px;
  }
  
  .adjust-btn {
    width: 40px;
    height: 40px;
  }
  
  .action-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.delete-btn {
  width: 12px;
  height: 12px;
  padding: 0;
  min-height: auto;
  font-size: 8px;
}

/* 右上角删除按钮尺寸调整 */
.top-right-delete.delete-btn {
  width: 20px;
  height: 20px;
  font-size: 12px;
}

.device-info {
  display: flex;
  flex-direction: column;
}

.device-name {
  font-weight: bold;
  font-size: 16px;
  color: #333;
}

.device-tenant {
  font-size: 12px;
  color: #666;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.loading-icon {
  color: #409eff;
}

.temperature-display {
  display: flex;
  justify-content: space-around;
  padding: 20px 0;
  border-bottom: 1px solid #eee;
  margin-bottom: 15px;
}

.current-temp, .target-temp, .temp-lock {
  text-align: center;
}

.temp-value {
  font-size: 24px;
  font-weight: bold;
  color: #409eff;
  margin-bottom: 5px;
}

.temp-label {
  font-size: 12px;
  color: #666;
}

.temp-lock .el-icon {
  font-size: 24px;
  margin-bottom: 5px;
}

.temp-lock .el-icon.locked {
  color: #f56c6c;
}

.power-control {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 0;
  border-bottom: 1px solid #eee;
  margin-bottom: 15px;
}

.power-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.power-status .el-icon {
  font-size: 20px;
  color: #ccc;
}

.power-status .el-icon.power-on {
  color: #67c23a;
}

.power-text {
  font-weight: bold;
}

.power-buttons {
  display: flex;
  gap: 8px;
}

.power-buttons .el-button {
  flex: 1;
  min-width: 60px;
}

.switch-label {
  font-size: 14px;
  color: #666;
  font-weight: 500;
}

.control-section {
  padding: 15px 0;
  border-bottom: 1px solid #eee;
  margin-bottom: 15px;
}

.control-row {
  display: flex;
  gap: 8px;
}

.control-group {
  flex: 0.8;
}

.control-label {
  font-size: 14px;
  color: #666;
  margin-bottom: 10px;
}

.control-buttons {
  display: flex;
  gap: 0px;
  margin-bottom: 4px;
}

.control-buttons.ac-mode-buttons {
  gap: 0px;
}

.control-buttons.ac-mode-buttons .el-button {
  padding: 3px 6px;
  font-size: 13px;
}

.control-buttons .el-button {
  padding: 3px 6px;
  font-size: 13px;
  min-width: auto;
}

.control-display {
  font-size: 12px;
  color: #666;
}

.temp-control {
  padding: 15px 0;
  border-bottom: 1px solid #eee;
  margin-bottom: 15px;
}

.temp-adjust {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 10px;
}

.temp-input {
  width: 80px;
}

.temp-lock-control {
  text-align: center;
}

.runtime-display {
  padding: 15px 0;
  border-bottom: 1px solid #eee;
  margin-bottom: 15px;
}

.runtime-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
  font-size: 12px;
}

.runtime-label {
  color: #666;
}

.runtime-value {
  color: #333;
  font-weight: bold;
}

.action-buttons {
  margin-top: 15px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-buttons .el-button {
  flex: 1;
  min-width: 70px;
}

.add-device-container {
  padding: 20px 0;
}

.search-section {
  margin-bottom: 20px;
}

.device-list-section {
  margin-bottom: 20px;
}

.schedule-container {
  padding: 20px 0;
}

.strategy-guide {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  margin-bottom: 18px;
  border-left: 3px solid var(--el-color-primary);
  background: var(--fill-lighter, #f5f7fa);
}

.strategy-guide strong {
  font-size: 15px;
}

.strategy-guide span {
  color: var(--text-secondary);
  font-size: 12px;
}

.strategy-form-section {
  margin: 18px 0 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-lighter, #ebeef5);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 650;
}

.schedule-device-filters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
  margin-bottom: 10px;
}

.schedule-device-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 12px;
}

.schedule-device-actions {
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.schedule-device-actions .el-button {
  margin-left: 8px;
}

@media (max-width: 768px) {
  .schedule-device-filters {
    grid-template-columns: 1fr;
  }

  .schedule-device-summary {
    align-items: flex-start;
    flex-direction: column;
  }
}

.schedule-header {
  margin-bottom: 20px;
  text-align: right;
}

.strategy-table {
  width: 100%;
}

.strategy-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.strategy-actions .el-button {
  margin-left: 0;
}

.schedule-action-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.stats-container {
  padding: 20px 0;
}

.stats-filters {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
}

.stats-charts {
  margin-top: 20px;
}

.stats-summary {
  margin-bottom: 20px;
}

.stats-card {
  text-align: center;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
}

.stats-title {
  font-size: 14px;
  color: #666;
  margin-bottom: 10px;
}

.stats-value {
  font-size: 24px;
  font-weight: bold;
  color: #409eff;
}

.device-detail {
  padding: 20px 0;
}

.running-stats-detail {
  margin-top: 30px;
}

.running-stats-detail h4 {
  margin-bottom: 20px;
  color: #303133;
  font-size: 16px;
}

.runtime-chart-section {
  margin-top: 28px;
}

.runtime-chart-section h4 {
  margin-bottom: 16px;
  color: #303133;
  font-size: 16px;
}

.chart-container,
.runtime-chart {
  width: 100%;
  height: 320px;
  min-height: 320px;
}

.chart-container {
  position: relative;
}

.no-data {
  height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 768px) {
  .chart-container,
  .runtime-chart,
  .no-data {
    height: 260px;
    min-height: 260px;
  }
}

.stat-item-detail {
  display: flex;
  align-items: center;
  padding: 15px;
}

.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  color: white;
  margin-right: 15px;
  font-size: 18px;
}

.stat-icon.low-speed {
  background: linear-gradient(135deg, #67c23a, #85ce61);
}

.stat-icon.medium-speed {
  background: linear-gradient(135deg, #e6a23c, #f0a020);
}

.stat-icon.high-speed {
  background: linear-gradient(135deg, #f56c6c, #f78989);
}

.stat-content {
  flex: 1;
}

.stat-label {
  font-size: 14px;
  color: #606266;
  margin-bottom: 5px;
}

.stat-value {
  font-size: 18px;
  font-weight: bold;
  color: #303133;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* 情景模式样式 */
.scene-modes {
  padding: 20px 0;
}

.scene-card {
  cursor: pointer;
  transition: all 0.3s ease;
  text-align: center;
  padding: 20px;
  border: 2px solid transparent;
}

.scene-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
  border-color: #409eff;
}

.scene-icon {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 15px;
  font-size: 24px;
  color: white;
}

.scene-icon.power-on {
  background: linear-gradient(135deg, #67c23a, #85ce61);
}

.scene-icon.power-off {
  background: linear-gradient(135deg, #f56c6c, #f78989);
}

.scene-icon.comfort {
  background: linear-gradient(135deg, #e6a23c, #f0a020);
}

.scene-icon.energy {
  background: linear-gradient(135deg, #909399, #b1b3b8);
}

.scene-icon.cool {
  background: linear-gradient(135deg, #409eff, #66b1ff);
}

.scene-icon.lock {
  background: linear-gradient(135deg, #606266, #79808a);
}

.scene-title {
  font-size: 16px;
  font-weight: bold;
  color: #303133;
  margin-bottom: 8px;
}

.scene-desc {
  font-size: 12px;
  color: #909399;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .thermostat-control {
    padding: 10px;
  }
  
  .page-header {
    flex-direction: column;
    align-items: stretch;
    gap: 15px;
    padding: 15px;
  }
  
  .page-header h2 {
    font-size: 20px;
    text-align: center;
  }
  
  .header-actions {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    width: 100%;
  }
  
  .header-actions .el-button {
    font-size: 12px;
    padding: 8px 12px;
    min-height: 36px;
  }
  
  .filter-section {
    padding: 15px;
  }
  
  .filter-row {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  
  .search-input {
    max-width: 100%;
    width: 100%;
  }
  
  .filter-controls {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 8px;
    width: 100%;
    align-items: center;
  }
  
  .filter-controls .el-select {
    width: 100% !important;
  }
  
  .filter-controls .el-button {
    font-size: 12px;
    padding: 8px 10px;
    white-space: nowrap;
  }
  
  .stats-info {
    width: 100%;
    justify-content: space-between;
    font-size: 13px;
    padding: 8px 0;
    border-top: 1px solid #e5e7eb;
  }
  
  .device-grid {
    grid-template-columns: 1fr;
    gap: 15px;
  }
  
  .thermostat-card {
    margin: 0;
  }
  
  /* 优化卡片头部在移动端的显示 */
  .modern-card-header {
    margin-bottom: 10px;
  }
  
  .device-title {
    font-size: 15px;
  }
  
  .header-actions .action-btn {
    width: 28px;
    height: 28px;
  }
  
  /* 优化温度显示区域 */
  .modern-temperature-section {
    margin: 10px 0;
  }
  
  .temp-display-grid {
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
  }
  
  .temp-card {
    padding: 8px;
  }
  
  .temp-icon {
    width: 24px;
    height: 24px;
    font-size: 14px;
  }
  
  .temp-value {
    font-size: 16px;
  }
  
  .temp-label {
    font-size: 10px;
  }
  
  .temp-status {
    font-size: 11px;
  }
  
  /* 优化电源控制区域 */
  .modern-power-section {
    margin: 10px 0;
  }
  
  .power-status-card {
    padding: 10px;
  }
  
  .power-icon {
    width: 28px;
    height: 28px;
  }
  
  .power-text {
    font-size: 13px;
  }
  
  .power-subtitle {
    font-size: 10px;
  }
  
  .power-btn {
    width: 32px;
    height: 32px;
  }
  
  /* 优化控制面板 */
  .modern-control-section {
    margin: 8px 0;
  }
  
  .control-grid {
    gap: 8px;
  }
  
  .control-panel {
    padding: 8px;
  }
  
  .control-header {
    font-size: 10px;
    margin-bottom: 6px;
  }
  
  .speed-btn, .mode-btn {
    height: 28px;
    font-size: 10px;
    min-width: 24px;
  }
  
  .mode-options {
    gap: 3px;
  }
  
  /* 优化温度调节 */
  .modern-temp-control {
    margin: 8px 0;
  }
  
  .temp-adjust-panel {
    padding: 10px;
  }
  
  .adjust-header {
    font-size: 10px;
    margin-bottom: 8px;
  }
  
  .temp-adjuster {
    gap: 10px;
  }
  
  .adjust-btn {
    width: 32px;
    height: 32px;
    font-size: 16px;
  }
  
  .temp-input-wrapper .el-input-number {
    width: 60px;
  }
  
  .temp-input-wrapper .el-input-number :deep(.el-input__inner) {
    font-size: 16px;
    padding: 0 8px;
  }
  
  /* 优化操作按钮 */
  .modern-action-section {
    margin-top: 10px;
    padding-top: 10px;
  }
  
  .action-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  
  .action-btn {
    padding: 8px 4px !important;
    font-size: 10px;
    min-height: 44px;
  }
  
  .action-btn span {
    font-size: 10px;
  }
  
  .temperature-display {
    flex-direction: column;
    gap: 15px;
  }
}

@media (max-width: 480px) {
  .thermostat-control {
    padding: 8px;
  }
  
  .page-header {
    padding: 12px;
  }
  
  .page-header h2 {
    font-size: 18px;
  }
  
  .header-actions {
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  
  .header-actions .el-button {
    font-size: 11px;
    padding: 6px 8px;
    min-height: 32px;
  }
  
  .filter-section {
    padding: 12px;
  }
  
  .filter-controls {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  
  .filter-controls .el-button {
    width: 100%;
    justify-content: center;
  }
  
  .device-grid {
    gap: 12px;
  }
  
  /* 进一步优化小屏幕下的温度显示 */
  .temp-display-grid {
    gap: 6px;
  }
  
  .temp-card {
    padding: 6px;
  }
  
  .temp-icon {
    width: 20px;
    height: 20px;
    font-size: 12px;
  }
  
  .temp-value {
    font-size: 14px;
  }
  
  .temp-label {
    font-size: 9px;
  }
  
  /* 优化控制按钮的触摸友好性 */
  .speed-btn, .mode-btn {
    height: 32px;
    min-width: 28px;
  }
  
  .adjust-btn {
    width: 36px;
    height: 36px;
    font-size: 18px;
  }
  
  .power-btn {
    width: 36px;
    height: 36px;
  }
  
  .action-btn {
    min-height: 48px;
    padding: 10px 4px !important;
  }
  
  .delete-btn {
    width: 16px;
    height: 16px;
    font-size: 10px;
  }
  
  /* 移动端右上角删除按钮调整 */
  .top-right-delete.delete-btn {
    width: 24px;
    height: 24px;
    font-size: 14px;
    top: -6px;
    right: -6px;
  }
}

@media (max-width: 360px) {
  .thermostat-control {
    padding: 5px;
  }
  
  .page-header {
    padding: 10px;
  }
  
  .header-actions {
    grid-template-columns: 1fr;
    gap: 5px;
  }
  
  .filter-section {
    padding: 10px;
  }
  
  .device-grid {
    gap: 10px;
  }
  
  /* 超小屏幕下的进一步优化 */
  .temp-display-grid {
    grid-template-columns: 1fr 1fr;
    gap: 5px;
  }
  
  .temp-card.lock {
    grid-column: 1 / -1;
  }
  
  .control-grid {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  
  .action-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 5px;
  }

  .action-btn.detail-btn {
    grid-column: 2;
  }
}

/* Unified control-console appearance */
.thermostat-control {
  min-height: 100%;
  padding: 0;
  color: var(--text-primary);
  background: transparent;
}

.thermostat-control .page-header {
  min-height: 42px;
  padding: 0;
  margin-bottom: 16px;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.thermostat-control .page-header h2 {
  color: var(--text-primary);
  font-size: 22px;
  font-weight: 650;
}

.header-actions {
  flex-wrap: wrap;
  gap: 8px;
}

.filter-section {
  padding: 14px;
  margin-bottom: 16px;
  border: 1px solid var(--border-light);
  border-top: 2px solid var(--primary-color);
  border-radius: 6px;
  background: var(--surface-color);
  box-shadow: var(--shadow-sm);
}

.filter-row {
  gap: 10px;
}

.stats-info {
  color: var(--text-secondary);
  font-size: 13px;
  white-space: nowrap;
}

.device-grid {
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}

.thermostat-card {
  border: 1px solid var(--border-light);
  border-top: 2px solid var(--border-color);
  border-radius: 6px;
  background: var(--surface-color);
  box-shadow: var(--shadow-sm);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.thermostat-card:hover {
  transform: none;
  border-top-color: var(--primary-color);
  box-shadow: var(--shadow-md);
}

.device-title,
.temp-value,
.temp-status,
.power-text,
.control-header,
.section-title {
  color: var(--text-primary);
}

.group-tag,
.temp-card,
.power-status-card,
.control-panel,
.temperature-control-panel,
.device-actions-modern,
.device-pagination {
  color: var(--text-regular);
  border-color: var(--border-light);
  background: var(--fill-lighter);
  box-shadow: none;
}

.temp-card.current,
.temp-card.target,
.temp-card.lock,
.power-status-card.active {
  border-color: var(--border-color);
  background: var(--fill-lighter);
}

.temp-card.current .temp-icon,
.temp-card.target .temp-icon,
.temp-card.lock .temp-icon {
  color: var(--primary-color);
  background: rgba(13, 148, 136, 0.12);
}

.top-right-delete {
  top: -4px;
  right: -4px;
  border: 0 !important;
  box-shadow: none !important;
}

.device-pagination {
  justify-content: flex-end;
  border: 1px solid var(--border-light);
  border-radius: 6px;
}

:global(.dark) .thermostat-control .el-button.is-disabled,
:global(.dark) .thermostat-control .temperature-adjustment,
:global(.dark) .thermostat-control .scene-card,
:global(.dark) .thermostat-control .schedule-item,
:global(.dark) .thermostat-control .stats-card {
  color: var(--text-regular);
  border-color: var(--border-light);
  background: var(--surface-color);
}

@media (max-width: 768px) {
  .thermostat-control {
    padding: 0;
  }

  .page-header {
    align-items: stretch;
    padding: 0;
  }

  .header-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .header-actions :deep(.el-button) {
    width: 100%;
    margin-left: 0;
  }

  .filter-row {
    align-items: stretch;
  }

  .filter-controls,
  .filter-controls :deep(.el-select) {
    width: 100% !important;
  }

  .device-grid {
    grid-template-columns: 1fr;
  }

  .device-pagination {
    padding: 12px;
    overflow-x: auto;
  }
}
</style>
