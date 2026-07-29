<template>
  <div class="lighting-control">
    <div class="page-header">
      <h2>照明控制</h2>
      <div class="header-actions">

        <el-button type="default" @click="refreshAllDevicesData" :loading="loading">
          <el-icon><Refresh /></el-icon>
          刷新数据
        </el-button>
        <el-button type="warning" @click="showSceneModeDialog = true">
          <el-icon><Setting /></el-icon>
          情景模式
        </el-button>
        <el-button type="primary" @click="openAddDialog">
          <el-icon><Plus /></el-icon>
          添加照明设备
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
            class="filter-select"
          >
            <el-option label="全部租户" value="" />
            <el-option
              v-for="tenant in tenantOptions"
              :key="tenant.id"
              :label="tenant.name"
              :value="tenant.id"
            />
          </el-select>
          <el-select v-model="selectedBuilding" placeholder="所属建筑" clearable filterable @change="handleBuildingFilter" class="filter-select"><el-option label="全部建筑" value="" /><el-option v-for="building in filteredBuildingOptions" :key="building.id" :label="building.name" :value="building.id" /></el-select>
          <el-select v-model="selectedProjectGroup" placeholder="所属分组" clearable filterable @change="handleGroupFilter" class="filter-select"><el-option label="全部分组" value="" /><el-option v-for="group in filteredProjectGroupOptions" :key="group.id" :label="group.name" :value="group.id" /></el-select>
          <el-select v-model="selectedStatus" placeholder="状态" clearable @change="handleStatusFilter" class="filter-select"><el-option label="在线" value="online" /><el-option label="离线" value="offline" /><el-option label="故障" value="error" /></el-select>
        </div>
        
        <div class="stats-info">
          <span class="device-count">共 {{ deviceTotal }} 个设备</span>
          <span class="online-count">本页在线: {{ onlineDevicesCount }}</span>
        </div>
      </div>
    </div>

    <!-- 设备卡片列表 -->
    <div class="device-grid">
      <el-card 
        v-for="device in filteredDevices" 
        :key="device.id" 
        class="device-card compact"
        shadow="hover"
      >
        <template #header>
          <div class="card-header">
            <div class="header-left">
              <el-button 
                class="delete-btn"
                type="danger" 
                size="small" 
                circle 
                @click="deleteDevice(device)"
                :icon="Close"
              />
              <div class="device-info">
                <span class="device-name">{{ device.name }}</span>
                <span class="device-group" v-if="device.group">{{ device.group }}</span>
              </div>
            </div>
            <div class="header-right">
              <el-icon v-if="device.loading" class="loading-icon is-loading">
                <Loading />
              </el-icon>
              <el-tag :type="getDeviceTypeTag(device.type)" size="small">{{ getDeviceTypeName(device.type) }}</el-tag>
            </div>
          </div>
        </template>

        <!-- 灯泡状态显示 -->
        <div class="light-status-display">
          <!-- 单开灯泡状态 -->
          <div v-if="device.type === 'single'" class="light-bulbs">
            <div class="light-bulb" :class="{ 'light-on': getLightStatus(device, 1) }" @click="toggleSwitch(device, 1)" style="cursor: pointer;">
              <div class="bulb-icon">
                <svg viewBox="0 0 24 24" class="bulb-svg">
                  <path d="M9,21C9,22.1 9.9,23 11,23H13C14.1,23 15,22.1 15,21V20H9V21M12,2A7,7 0 0,0 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H15A1,1 0 0,0 16,17V14.74C17.81,13.47 19,11.38 19,9A7,7 0 0,0 12,2Z" />
                </svg>
              </div>
              <span class="light-label">灯</span>
            </div>
          </div>

          <!-- 双开灯泡状态 -->
          <div v-else-if="device.type === 'double'" class="light-bulbs">
            <div class="light-bulb" :class="{ 'light-on': getLightStatus(device, 1) }" @click="toggleSwitch(device, 1)" style="cursor: pointer;">
              <div class="bulb-icon">
                <svg viewBox="0 0 24 24" class="bulb-svg">
                  <path d="M9,21C9,22.1 9.9,23 11,23H13C14.1,23 15,22.1 15,21V20H9V21M12,2A7,7 0 0,0 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H15A1,1 0 0,0 16,17V14.74C17.81,13.47 19,11.38 19,9A7,7 0 0,0 12,2Z" />
                </svg>
              </div>
              <span class="light-label">灯1</span>
            </div>
            <div class="light-bulb" :class="{ 'light-on': getLightStatus(device, 2) }" @click="toggleSwitch(device, 2)" style="cursor: pointer;">
              <div class="bulb-icon">
                <svg viewBox="0 0 24 24" class="bulb-svg">
                  <path d="M9,21C9,22.1 9.9,23 11,23H13C14.1,23 15,22.1 15,21V20H9V21M12,2A7,7 0 0,0 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H15A1,1 0 0,0 16,17V14.74C17.81,13.47 19,11.38 19,9A7,7 0 0,0 12,2Z" />
                </svg>
              </div>
              <span class="light-label">灯2</span>
            </div>
          </div>

          <!-- 三开灯泡状态 -->
          <div v-else-if="device.type === 'triple'" class="light-bulbs">
            <div class="light-bulb" :class="{ 'light-on': getLightStatus(device, 1) }" @click="toggleSwitch(device, 1)" style="cursor: pointer;">
              <div class="bulb-icon">
                <svg viewBox="0 0 24 24" class="bulb-svg">
                  <path d="M9,21C9,22.1 9.9,23 11,23H13C14.1,23 15,22.1 15,21V20H9V21M12,2A7,7 0 0,0 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H15A1,1 0 0,0 16,17V14.74C17.81,13.47 19,11.38 19,9A7,7 0 0,0 12,2Z" />
                </svg>
              </div>
              <span class="light-label">灯1</span>
            </div>
            <div class="light-bulb" :class="{ 'light-on': getLightStatus(device, 2) }" @click="toggleSwitch(device, 2)" style="cursor: pointer;">
              <div class="bulb-icon">
                <svg viewBox="0 0 24 24" class="bulb-svg">
                  <path d="M9,21C9,22.1 9.9,23 11,23H13C14.1,23 15,22.1 15,21V20H9V21M12,2A7,7 0 0,0 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H15A1,1 0 0,0 16,17V14.74C17.81,13.47 19,11.38 19,9A7,7 0 0,0 12,2Z" />
                </svg>
              </div>
              <span class="light-label">灯2</span>
            </div>
            <div class="light-bulb" :class="{ 'light-on': getLightStatus(device, 3) }" @click="toggleSwitch(device, 3)" style="cursor: pointer;">
              <div class="bulb-icon">
                <svg viewBox="0 0 24 24" class="bulb-svg">
                  <path d="M9,21C9,22.1 9.9,23 11,23H13C14.1,23 15,22.1 15,21V20H9V21M12,2A7,7 0 0,0 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H15A1,1 0 0,0 16,17V14.74C17.81,13.47 19,11.38 19,9A7,7 0 0,0 12,2Z" />
                </svg>
              </div>
              <span class="light-label">灯3</span>
            </div>
          </div>
        </div>

        <!-- 开关控制按钮 -->
        <div class="switch-controls">
          <!-- 全部控制按钮 -->
          <div class="switch-group">
            <div class="switch-item all-switch">
              <span class="switch-label">照明控制</span>
              <div class="switch-toggle-wrapper">
                <el-switch
                  v-model="device.allOn"
                  :loading="device.loading"
                  @change="(val) => val ? turnOnDevice(device) : turnOffDevice(device)"
                  active-color="#13ce66"
                  inactive-color="#ff4949"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="action-buttons">
          <el-button 
            type="primary" 
            size="small" 
            @click="showTimerDialog = true; currentDevice = device"
            :loading="device.loading"
          >
            <el-icon><Timer /></el-icon>
            定时
          </el-button>
          <el-button 
            type="info" 
            size="small" 
            @click="showDeviceDetail(device)"
          >
            <el-icon><View /></el-icon>
            详情
          </el-button>
        </div>
      </el-card>
    </div>

    <div class="pagination-container device-pagination">
      <el-pagination
        v-model:current-page="devicePage"
        v-model:page-size="devicePageSize"
        :page-sizes="[12, 24, 48, 96]"
        :total="deviceTotal"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleDevicePageSizeChange"
        @current-change="handleDevicePageChange"
      />
    </div>

    <!-- 添加设备对话框 -->
    <el-dialog 
      v-model="showAddDialog" 
      title="添加照明设备" 
      width="800px"
    >
      <div class="add-device-container">
        <!-- 搜索栏 -->
        <div class="search-section">
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
            <el-table-column prop="tenantName" label="所属租户" width="120" />
            <el-table-column prop="type" label="设备类型" width="100" />
            <el-table-column prop="status" label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.status === 'online' ? 'success' : 'danger'" size="small">
                  {{ row.status === 'online' ? '在线' : '离线' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
        
        <!-- 选中设备配置 -->
        <div v-if="selectedDevices.length > 0" class="config-section">
          <h4>设备配置</h4>
          <div v-for="device in selectedDevices" :key="device.id" class="device-config">
            <div class="device-info">
              <span class="device-name">{{ device.name }}</span>
              <span class="device-imei">({{ device.imei }})</span>
            </div>
            <el-form-item label="开关类型">
              <el-select v-model="device.lightingType" placeholder="请选择开关类型">
                <el-option label="单开" value="single" />
                <el-option label="双开" value="double" />
                <el-option label="三开" value="triple" />
              </el-select>
            </el-form-item>
          </div>
        </div>
      </div>
      
      <template #footer>
        <el-button @click="cancelAddDevice">取消</el-button>
        <el-button type="primary" @click="confirmAddDevice" :disabled="selectedDevices.length === 0">确定</el-button>
      </template>
    </el-dialog>

    <!-- 设备详情对话框 -->
    <el-dialog 
      v-model="showDetailDialog" 
      title="设备详情" 
      width="800px"
    >
      <div v-if="selectedDevice">
        <div class="detail-info">
          <h3>基本信息</h3>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="设备名称">{{ selectedDevice.name }}</el-descriptions-item>
            <el-descriptions-item label="设备ID">{{ selectedDevice.deviceId }}</el-descriptions-item>
            <el-descriptions-item label="开关类型">{{ getDeviceTypeName(selectedDevice.type) }}</el-descriptions-item>
            <el-descriptions-item label="状态">{{ selectedDevice.status || '离线' }}</el-descriptions-item>
          </el-descriptions>
        </div>

        <div class="power-info-detail">
          <h3>电量信息</h3>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="电压">
              <span class="power-value">{{ selectedDevice.voltage || '0.000' }}V</span>
            </el-descriptions-item>
            <el-descriptions-item label="电流">
              <span class="power-value">{{ selectedDevice.current || '0.000' }}A</span>
            </el-descriptions-item>
            <el-descriptions-item label="功率">
              <span class="power-value">{{ selectedDevice.power || '0.000' }}W</span>
            </el-descriptions-item>
            <el-descriptions-item label="累计用电">
              <span class="power-value">{{ selectedDevice.energy || '0.000' }}KW·H</span>
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <!-- 开关控制区域 -->
        <div class="switch-control-detail">
          <h3>开关控制</h3>
          <div class="switch-controls-detail">
            <!-- 单开开关控制 -->
            <div v-if="selectedDevice.type === 'single'" class="switch-group-detail">
              <div class="switch-item-detail">
                <span class="switch-label-detail">开关控制</span>
                <div class="switch-buttons-detail">
                  <el-button 
                    type="success" 
                    @click="turnOnDevice(selectedDevice)"
                    :loading="selectedDevice.loading"
                  >
                    <el-icon><VideoPlay /></el-icon>
                    开启
                  </el-button>
                  <el-button 
                    type="danger" 
                    @click="turnOffDevice(selectedDevice)"
                    :loading="selectedDevice.loading"
                  >
                    <el-icon><VideoPause /></el-icon>
                    关闭
                  </el-button>
                </div>
              </div>
            </div>

            <!-- 双开开关控制 -->
            <div v-else-if="selectedDevice.type === 'double'" class="switch-group-detail">
              <div class="switch-item-detail">
                <span class="switch-label-detail">开关1</span>
                <div 
                  class="switch-toggle-container" 
                  :class="{ 'active': getSwitchStatus(selectedDevice, 1) }"
                  @click="toggleSwitch(selectedDevice, 1)"
                >
                  <div class="switch-toggle"></div>
                </div>
              </div>
              <div class="switch-item-detail">
                <span class="switch-label-detail">开关2</span>
                <div 
                  class="switch-toggle-container" 
                  :class="{ 'active': getSwitchStatus(selectedDevice, 2) }"
                  @click="toggleSwitch(selectedDevice, 2)"
                >
                  <div class="switch-toggle"></div>
                </div>
              </div>
              <div class="switch-item-detail all-switch">
                <span class="switch-label-detail">全部开关</span>
                <div class="switch-buttons-detail">
                  <el-button 
                    type="success" 
                    @click="turnOnDevice(selectedDevice)"
                    :loading="selectedDevice.loading"
                  >
                    全部开启
                  </el-button>
                  <el-button 
                    type="danger" 
                    @click="turnOffDevice(selectedDevice)"
                    :loading="selectedDevice.loading"
                  >
                    全部关闭
                  </el-button>
                </div>
              </div>
            </div>

            <!-- 三开开关控制 -->
            <div v-else-if="selectedDevice.type === 'triple'" class="switch-group-detail">
              <div class="switch-item-detail">
                <span class="switch-label-detail">开关1</span>
                <div class="switch-buttons-detail">
                  <el-button 
                    type="success" 
                    @click="turnOnSingleSwitch(selectedDevice, 1)"
                    :loading="selectedDevice.loading"
                  >
                    开启
                  </el-button>
                  <el-button 
                    type="danger" 
                    @click="turnOffSingleSwitch(selectedDevice, 1)"
                    :loading="selectedDevice.loading"
                  >
                    关闭
                  </el-button>
                </div>
              </div>
              <div class="switch-item-detail">
                <span class="switch-label-detail">开关2</span>
                <div class="switch-buttons-detail">
                  <el-button 
                    type="success" 
                    @click="turnOnSingleSwitch(selectedDevice, 2)"
                    :loading="selectedDevice.loading"
                  >
                    开启
                  </el-button>
                  <el-button 
                    type="danger" 
                    @click="turnOffSingleSwitch(selectedDevice, 2)"
                    :loading="selectedDevice.loading"
                  >
                    关闭
                  </el-button>
                </div>
              </div>
              <div class="switch-item-detail">
                <span class="switch-label-detail">开关3</span>
                <div 
                  class="switch-toggle-container" 
                  :class="{ 'active': getSwitchStatus(selectedDevice, 3) }"
                  @click="toggleSwitch(selectedDevice, 3)"
                >
                  <div class="switch-toggle"></div>
                </div>
              </div>
              <div class="switch-item-detail all-switch">
                <span class="switch-label-detail">全部开关</span>
                <div class="switch-buttons-detail">
                  <el-button 
                    type="success" 
                    @click="turnOnDevice(selectedDevice)"
                    :loading="selectedDevice.loading"
                  >
                    全部开启
                  </el-button>
                  <el-button 
                    type="danger" 
                    @click="turnOffDevice(selectedDevice)"
                    :loading="selectedDevice.loading"
                  >
                    全部关闭
                  </el-button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="chart-section">
          <h3>电气数据趋势</h3>
          <div class="chart-controls">
            <div class="chart-type-selector">
              <el-radio-group v-model="selectedChartType" size="small" @change="loadChartData">
                <el-radio-button label="voltage">电压</el-radio-button>
                <el-radio-button label="current">电流</el-radio-button>
                <el-radio-button label="power">功率</el-radio-button>
                <el-radio-button label="energy">电能</el-radio-button>
              </el-radio-group>
            </div>
            <el-date-picker
              v-model="chartDateRange"
              type="datetimerange"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              @change="loadChartData"
              style="width: 100%;"
              class="date-picker-mobile"
            />
            <el-button type="primary" @click="loadChartData">查询</el-button>
            <div class="quick-date-buttons">
              <el-button size="small" @click="setQuickDate('today')">今天</el-button>
              <el-button size="small" @click="setQuickDate('week')">本周</el-button>
              <el-button size="small" @click="setQuickDate('month')">本月</el-button>
              <el-button size="small" @click="setQuickDate('year')">本年</el-button>
            </div>
          </div>
          <div ref="chartContainer" class="chart-container"></div>
          <!-- 总耗电量显示 -->
          <div class="total-energy-display" v-if="selectedChartType === 'energy'">
            <div class="total-energy-card">
              <span class="total-energy-label">所选时间段总耗电量：</span>
              <span class="total-energy-value">{{ totalEnergyConsumption }} KW·H</span>
            </div>
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- 定时控制对话框 -->
    <el-dialog
      v-model="showTimerDialog"
      title="定时控制"
      width="700px"
      :before-close="() => { showTimerDialog = false }"
    >
      <div class="timer-control-container">
        <el-tabs v-model="activeTimerTab">
          <el-tab-pane label="定时列表" name="list">
            <div v-if="currentDevice && currentDevice.timers && currentDevice.timers.length > 0" class="timer-list">
              <el-table :data="currentDevice.timers" style="width: 100%">
                <el-table-column prop="name" label="定时名称" width="180" />
                <el-table-column prop="time" label="执行时间" width="100" />
                <el-table-column label="操作" width="100">
                  <template #default="{ row }">
                    <el-switch
                      v-model="row.enabled"
                      @change="toggleTimerStatus(row)"
                      active-text="启用"
                      inactive-text="禁用"
                    />
                  </template>
                </el-table-column>
                <el-table-column label="重复" min-width="180">
                  <template #default="{ row }">
                    <el-tag 
                      v-for="day in row.repeat" 
                      :key="day" 
                      size="small" 
                      class="repeat-tag"
                    >
                      {{ day }}
                    </el-tag>
                    <span v-if="!row.repeat || row.repeat.length === 0">不重复</span>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="120">
                  <template #default="{ row }">
                    <el-button 
                      type="danger" 
                      size="small" 
                      icon="Delete" 
                      circle 
                      @click="deleteTimer(row)"
                    />
                    <el-button 
                      type="primary" 
                      size="small" 
                      icon="Edit" 
                      circle 
                      @click="editTimer(row)"
                    />
                  </template>
                </el-table-column>
              </el-table>
            </div>
            <el-empty v-else description="暂无定时设置" />
            <div class="timer-actions">
              <el-button type="primary" @click="activeTimerTab = 'add'">添加定时</el-button>
            </div>
          </el-tab-pane>
          
          <el-tab-pane label="添加定时" name="add">
            <div class="timer-form">
              <el-form :model="timerForm" label-width="100px">
                <el-form-item label="开关状态">
                  <el-radio-group v-model="timerForm.action">
                    <el-radio :label="'on'">开启</el-radio>
                    <el-radio :label="'off'">关闭</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="执行时间">
                  <el-time-picker v-model="timerForm.time" format="HH:mm" placeholder="选择时间"></el-time-picker>
                </el-form-item>
                <el-form-item label="重复">
                  <el-checkbox-group v-model="timerForm.repeat">
                    <el-checkbox label="周一"></el-checkbox>
                    <el-checkbox label="周二"></el-checkbox>
                    <el-checkbox label="周三"></el-checkbox>
                    <el-checkbox label="周四"></el-checkbox>
                    <el-checkbox label="周五"></el-checkbox>
                    <el-checkbox label="周六"></el-checkbox>
                    <el-checkbox label="周日"></el-checkbox>
                  </el-checkbox-group>
                </el-form-item>
              </el-form>
              <div class="timer-actions">
                <el-button @click="activeTimerTab = 'list'">返回</el-button>
                <el-button type="primary" @click="saveTimerSettings">保存设置</el-button>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-dialog>
    
    <!-- 情景模式对话框 -->
    <el-dialog 
      v-model="showSceneModeDialog" 
      title="情景模式" 
      width="900px"
      :close-on-click-modal="false"
    >
      <div class="scene-mode-container">
        <!-- 预设情景模式 -->
        <div class="preset-scenes-section">
          <h3>预设情景模式</h3>
          <div class="preset-scenes-row">
            <el-button 
              type="success" 
              size="large"
              @click="executePresetScene(presetScenes[0])"
              :loading="presetScenes[0].loading"
              class="preset-scene-btn"
            >
              <el-icon><Sunny /></el-icon>
              全部开启
            </el-button>
            <el-button 
              type="info" 
              size="large"
              @click="executePresetScene(presetScenes[1])"
              :loading="presetScenes[1].loading"
              class="preset-scene-btn"
            >
              <el-icon><Moon /></el-icon>
              全部关闭
            </el-button>
          </div>
        </div>

        <!-- 自定义情景模式 -->
        <div class="custom-scenes-section">
          <div class="section-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h3 style="margin: 0;">自定义情景模式</h3>
            <el-button type="primary" @click="showCreateCustomScene = true">
              <el-icon><Plus /></el-icon>
              创建自定义情景
            </el-button>
          </div>
          
          <div class="custom-scenes-list">
            <div v-if="customScenes.length === 0" class="empty-scenes">
              <el-empty description="暂无自定义情景模式" />
            </div>
            <div v-else>
              <el-card 
                v-for="scene in paginatedCustomScenes" 
                :key="scene.id" 
                class="custom-scene-card"
                shadow="hover"
              >
                <div class="custom-scene-header">
                  <h4>{{ scene.name }}</h4>
                  <div class="scene-actions">
                    <el-button 
                      type="primary" 
                      size="small" 
                      @click="applyCustomScene(scene)"
                      :loading="scene.loading"
                    >
                      应用
                    </el-button>
                    <el-button 
                      type="warning" 
                      size="small" 
                      @click="editCustomScene(scene)"
                    >
                      编辑
                    </el-button>
                    <el-button 
                      type="danger" 
                      size="small" 
                      @click="deleteCustomScene(scene)"
                    >
                      删除
                    </el-button>
                  </div>
                </div>
                <div class="scene-description">{{ scene.description }}</div>
                <div class="scene-devices">
                  <span class="devices-count">包含 {{ scene.devices.length }} 个设备</span>
                </div>
                <div v-if="scene.enableTimer" class="scene-timer-info">
                  <el-icon class="timer-icon"><Clock /></el-icon>
                  定时: <span v-if="scene.startTime">{{ scene.startTime }} - </span>{{ scene.endTime }}
                  <span v-if="scene.repeatDays.length > 0">
                    ({{ formatRepeatDays(scene.repeatDays) }})
                  </span>
                </div>
              </el-card>
              
              <!-- 分页组件 -->
              <div v-if="totalPages > 1" class="pagination-container">
                <el-pagination
                  v-model:current-page="currentPage"
                  :page-size="pageSize"
                  :total="customScenes.length"
                  layout="prev, pager, next"
                  small
                  background
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <template #footer>
        <el-button @click="showSceneModeDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 创建/编辑自定义情景对话框 -->
    <el-dialog 
      v-model="showCreateCustomScene" 
      :title="editingScene ? '编辑自定义情景' : '创建自定义情景'" 
      width="700px"
      :close-on-click-modal="false"
    >
      <el-form :model="customSceneForm" label-width="100px">
        <el-form-item label="情景名称" required>
          <el-input v-model="customSceneForm.name" placeholder="请输入情景名称" />
        </el-form-item>
        
        <el-form-item label="情景描述">
          <el-input 
            v-model="customSceneForm.description" 
            type="textarea" 
            placeholder="请输入情景描述"
            :rows="2"
          />
        </el-form-item>
        
        <el-form-item label="定时控制">
          <el-switch 
            v-model="customSceneForm.enableTimer" 
            active-text="启用定时" 
            inactive-text="关闭定时"
          />
        </el-form-item>
        
        <div v-if="customSceneForm.enableTimer" class="timer-settings">
          <el-form-item label="开启时间">
            <el-time-picker 
              v-model="customSceneForm.startTime" 
              placeholder="选择开启时间（可选）"
              format="HH:mm"
              value-format="HH:mm"
            />
          </el-form-item>
          
          <el-form-item label="关闭时间" required>
            <el-time-picker 
              v-model="customSceneForm.endTime" 
              placeholder="选择关闭时间（必选）"
              format="HH:mm"
              value-format="HH:mm"
            />
          </el-form-item>
          
          <el-form-item label="重复日期">
            <el-checkbox-group v-model="customSceneForm.repeatDays">
              <el-checkbox label="1">周一</el-checkbox>
              <el-checkbox label="2">周二</el-checkbox>
              <el-checkbox label="3">周三</el-checkbox>
              <el-checkbox label="4">周四</el-checkbox>
              <el-checkbox label="5">周五</el-checkbox>
              <el-checkbox label="6">周六</el-checkbox>
              <el-checkbox label="0">周日</el-checkbox>
            </el-checkbox-group>
          </el-form-item>
        </div>
        
        <el-form-item label="设备控制">
          <div class="device-control-list">
            <div 
              v-for="device in filteredDevices" 
              :key="'device-' + device.id" 
              class="device-control-item"
            >
              <div class="device-info">
                <el-checkbox v-model="device.selected">
                  {{ device.name }}
                </el-checkbox>
                <el-tag :type="getDeviceTypeTag(device.type)" size="small">
                  {{ getDeviceTypeName(device.type) }}
                </el-tag>
              </div>
              
              <div v-if="device.selected" class="switch-controls">
                <!-- 单开设备 -->
                <div v-if="device.type === 'single'" class="switch-group">
                  <span class="switch-label">开关:</span>
                  <el-radio-group v-model="device.sceneConfig.key2">
                    <el-radio :label="1">开启</el-radio>
                    <el-radio :label="0">关闭</el-radio>
                  </el-radio-group>
                </div>
                
                <!-- 双开设备 -->
                <div v-else-if="device.type === 'double'" class="switch-group">
                  <div class="switch-item">
                    <span class="switch-label">开关1:</span>
                    <el-radio-group v-model="device.sceneConfig.key1">
                      <el-radio :label="1">开</el-radio>
                      <el-radio :label="0">关</el-radio>
                    </el-radio-group>
                  </div>
                  <div class="switch-item">
                    <span class="switch-label">开关2:</span>
                    <el-radio-group v-model="device.sceneConfig.key3">
                      <el-radio :label="1">开</el-radio>
                      <el-radio :label="0">关</el-radio>
                    </el-radio-group>
                  </div>
                </div>
                
                <!-- 三开设备 -->
                <div v-else-if="device.type === 'triple'" class="switch-group">
                  <div class="switch-item">
                    <span class="switch-label">开关1:</span>
                    <el-radio-group v-model="device.sceneConfig.key1">
                      <el-radio :label="1">开</el-radio>
                      <el-radio :label="0">关</el-radio>
                    </el-radio-group>
                  </div>
                  <div class="switch-item">
                    <span class="switch-label">开关2:</span>
                    <el-radio-group v-model="device.sceneConfig.key2">
                      <el-radio :label="1">开</el-radio>
                      <el-radio :label="0">关</el-radio>
                    </el-radio-group>
                  </div>
                  <div class="switch-item">
                    <span class="switch-label">开关3:</span>
                    <el-radio-group v-model="device.sceneConfig.key3">
                      <el-radio :label="1">开</el-radio>
                      <el-radio :label="0">关</el-radio>
                    </el-radio-group>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="cancelCustomScene">取消</el-button>
        <el-button type="primary" @click="saveCustomScene">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, VideoPlay, VideoPause, RefreshRight, View, Delete, Search, Refresh, Setting, Sunny, Moon, House, Coffee, Reading, Close, Clock, Loading } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import { lightingControlAPI, projectManagementAPI, tenantAPI, deviceAPI, lightingScenesAPI, lightingDataAPI } from '@/api/index.js'
import websocketService from '@/utils/websocket'

// 响应式数据
const lightingDevices = ref([])
const showAddDialog = ref(false)
const showDetailDialog = ref(false)
const selectedDevice = ref(null)
const chartDateRange = ref([])
const chartContainer = ref(null)
const loading = ref(false)
const totalEnergyConsumption = ref('0.000')
const selectedChartType = ref('energy') // 默认显示电能数据
let chartInstance = null



// 设备选择相关
const availableDevices = ref([])
const filteredAvailableDevices = ref([])
const selectedDevices = ref([])
const deviceSearchKeyword = ref('')
const loadingDevices = ref(false)

// 搜索和过滤相关
const searchKeyword = ref('')
const userInfo = ref(JSON.parse(localStorage.getItem('userInfo') || '{}'))
const isAdmin = computed(() => userInfo.value?.role === 'admin')
const selectedTenant = ref('')
const selectedBuilding = ref('')
const selectedProjectGroup = ref('')
const selectedStatus = ref('')
const tenantOptions = ref([])
const buildingOptions = ref([])
const deviceGroups = ref([])
const filteredDevices = ref([])
const devicePage = ref(1)
const devicePageSize = ref(24)
const deviceTotal = ref(0)
let searchTimer = null

const filteredBuildingOptions = computed(() => selectedTenant.value
  ? buildingOptions.value.filter(item => String(item.tenant_id) === String(selectedTenant.value))
  : buildingOptions.value)

const filteredProjectGroupOptions = computed(() => deviceGroups.value.filter(item =>
  (!selectedTenant.value || String(item.tenant_id) === String(selectedTenant.value)) &&
  (!selectedBuilding.value || !item.building_id || String(item.building_id) === String(selectedBuilding.value))
))

// 情景模式相关
const showSceneModeDialog = ref(false)
const showCreateCustomScene = ref(false)
const editingScene = ref(null)
const customSceneForm = ref({
  name: '',
  description: '',
  devices: [],
  enableTimer: false,
  startTime: '',
  endTime: '',
  repeatDays: []
})
const customScenes = ref([])

// 自定义情景模式分页
const currentPage = ref(1)
const pageSize = ref(3)
const paginatedCustomScenes = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return customScenes.value.slice(start, end)
})
const totalPages = computed(() => {
  return Math.ceil(customScenes.value.length / pageSize.value)
})
const presetScenes = ref([
  {
    id: 'all_on',
    name: '全部开启',
    description: '开启所有照明设备',
    icon: 'Sunny',
    color: '#F56C6C',
    loading: false
  },
  {
    id: 'all_off',
    name: '全部关闭',
    description: '关闭所有照明设备',
    icon: 'Moon',
    color: '#909399',
    loading: false
  }
])

// 设备类型配置
const deviceTypeConfig = {
  single: {
    name: '单开',
    tag: 'success',
    onCommand: { type: 'event', key2: 1 },
    offCommand: { type: 'event', key2: 0 }
  },
  double: {
    name: '双开',
    tag: 'warning',
    onCommand: { type: 'event', key1: 1, key3: 1 },
    offCommand: { type: 'event', key1: 0, key3: 0 }
  },
  triple: {
    name: '三开',
    tag: 'danger',
    onCommand: { type: 'event', key1: 1, key2: 1, key3: 1 },
    offCommand: { type: 'event', key1: 0, key2: 0, key3: 0 }
  }
}

// 通用指令
const commonCommands = {
  statistic: { type: 'statistic' },
  restart: { type: 'setting', system: 'restart' }
}

// 定时控制相关
const currentDevice = ref(null)
const showTimerDialog = ref(false)
const activeTimerTab = ref('list')
const timerForm = ref({
  action: 'on',
  time: '',
  repeat: []
})
const editingTimerId = ref(null)

// 获取设备定时列表
const fetchDeviceTimers = async (device) => {
  if (!device || !device.deviceId) return
  
  try {
    device.loading = true
    // 使用本地API路径
    const response = await fetch(`/api/lighting-timer/${device.deviceId}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    })
    
    if (!response.ok) {
      throw new Error('获取定时列表失败')
    }
    
    const result = await response.json()
    
    if (result.success && result.data) {
      device.timers = result.data
    } else {
      device.timers = []
    }
  } catch (error) {
    console.error('获取定时列表失败:', error)
    ElMessage.error(`获取定时列表失败: ${error.message}`)
    device.timers = []
  } finally {
    device.loading = false
  }
}

// 切换定时状态
const toggleTimerStatus = async (timer) => {
  if (!currentDevice.value || !timer) return
  
  try {
    currentDevice.value.loading = true
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'
    const response = await fetch(`${API_BASE_URL}/lighting-timer/${timer.id}/toggle`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ enabled: timer.enabled })
    })
    
    if (!response.ok) {
      throw new Error('更新定时状态失败')
    }
    
    const result = await response.json()
    
    if (result.success) {
      ElMessage.success(`定时${timer.enabled ? '启用' : '禁用'}成功`)
    } else {
      throw new Error(result.message || '更新定时状态失败')
    }
  } catch (error) {
    console.error('更新定时状态失败:', error)
    ElMessage.error(`更新定时状态失败: ${error.message}`)
    // 恢复原状态
    timer.enabled = !timer.enabled
  } finally {
    currentDevice.value.loading = false
  }
}

// 删除定时
const deleteTimer = async (timer) => {
  if (!currentDevice.value || !timer) return
  
  try {
    await ElMessageBox.confirm(
      '确定要删除这个定时设置吗？',
      '删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    currentDevice.value.loading = true
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'
    const response = await fetch(`${API_BASE_URL}/lighting-timer/${timer.id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    })
    
    if (!response.ok) {
      throw new Error('删除定时失败')
    }
    
    const result = await response.json()
    
    if (result.success) {
      // 从列表中移除
      currentDevice.value.timers = currentDevice.value.timers.filter(t => t.id !== timer.id)
      ElMessage.success('定时设置已删除')
    } else {
      throw new Error(result.message || '删除定时失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除定时失败:', error)
      ElMessage.error(`删除定时失败: ${error.message || error}`)
    }
  } finally {
    currentDevice.value.loading = false
  }
}

// 编辑定时
const editTimer = (timer) => {
  editingTimerId.value = timer.id
  timerForm.value = {
    action: timer.action,
    time: timer.time,
    repeat: [...timer.repeat]
  }
  activeTimerTab.value = 'add'
}

// 保存定时设置
const saveTimerSettings = async () => {
  if (!timerForm.value.time) {
    ElMessage.warning('请选择执行时间')
    return
  }
  
  if (!currentDevice.value) {
    ElMessage.warning('未选择设备')
    return
  }
  
  // 设置设备加载状态
  currentDevice.value.loading = true
  
  // 构建定时任务数据
  const timerData = {
    deviceId: currentDevice.value.deviceId || currentDevice.value.imei,
    action: timerForm.value.action,
    time: timerForm.value.time,
    repeat: timerForm.value.repeat,
    enabled: true,
    name: `${currentDevice.value.name || '未知设备'} ${timerForm.value.action === 'on' ? '开启' : '关闭'} ${timerForm.value.time}`
  }
  
  try {
    // 保存到设备定时任务列表
    if (!currentDevice.value.timers) {
      currentDevice.value.timers = []
    }
    
    // 添加或更新定时任务
    const existingTimerIndex = currentDevice.value.timers.findIndex(
      t => t.time === timerData.time && t.action === timerData.action
    )
    
    if (existingTimerIndex >= 0) {
      currentDevice.value.timers[existingTimerIndex] = timerData
    } else {
      currentDevice.value.timers.push(timerData)
    }
    
    // 发送到后端API保存到数据库
    // 使用本地API路径
    const response = await fetch(`/api/lighting-timer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(timerData)
    })
    
    if (!response.ok) {
      throw new Error('保存定时设置失败')
    }
    
    const result = await response.json()
    
    if (result.success) {
      // 如果后端返回了ID，更新本地数据
      if (result.data && result.data.id) {
        const updatedTimer = { ...timerData, id: result.data.id }
        
        if (existingTimerIndex >= 0) {
          currentDevice.value.timers[existingTimerIndex] = updatedTimer
        } else {
          // 替换最后添加的项
          currentDevice.value.timers[currentDevice.value.timers.length - 1] = updatedTimer
        }
      }
      
      ElMessage.success(`设备 ${currentDevice.value.name || '未知'} 定时设置已保存`)
      showTimerDialog.value = false
      
      // 清空表单
      timerForm.value = {
        action: 'on',
        time: '',
        repeat: []
      }
    } else {
      throw new Error(result.message || '保存定时设置失败')
    }
  } catch (error) {
    console.error('保存定时设置失败:', error)
    ElMessage.error(`保存定时设置失败: ${error.message}`)
  } finally {
    currentDevice.value.loading = false
  }
}

// 获取设备类型名称
const getDeviceTypeName = (type) => {
  return deviceTypeConfig[type]?.name || '未知'
}

// 获取设备类型标签
const getDeviceTypeTag = (type) => {
  return deviceTypeConfig[type]?.tag || 'info'
}

// 计算在线设备数量
const onlineDevicesCount = computed(() => {
  return filteredDevices.value.filter(device => device.status === 'online').length
})

// 后端已按完整设备集筛选和分页，前端只展示当前页。
const filterDevices = () => {
  filteredDevices.value = lightingDevices.value
}

// 搜索处理
const handleSearch = () => {
  devicePage.value = 1
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadDevices, 300)
}

// 分组过滤处理
const handleGroupFilter = () => {
  devicePage.value = 1
  loadDevices()
}

const handleTenantFilter = () => {
  selectedBuilding.value = ''
  selectedProjectGroup.value = ''
  devicePage.value = 1
  loadDevices()
}

const handleBuildingFilter = () => {
  if (selectedProjectGroup.value && !filteredProjectGroupOptions.value.some(item => String(item.id) === String(selectedProjectGroup.value))) selectedProjectGroup.value = ''
  devicePage.value = 1
  loadDevices()
}

const handleStatusFilter = () => {
  devicePage.value = 1
  loadDevices()
}

const handleDevicePageSizeChange = () => {
  devicePage.value = 1
  loadDevices()
}

const handleDevicePageChange = () => {
  loadDevices()
}

// 获取灯泡状态
const getLightStatus = (device, switchNumber) => {
  if (!device.switchStates) {
    // 如果没有开关状态数据，默认为关闭
    return false
  }
  
  if (device.type === 'single') {
    return device.switchStates.key2 === true || device.switchStates.key2 === 1
  } else if (device.type === 'double') {
    if (switchNumber === 1) {
      return device.switchStates.key1 === true || device.switchStates.key1 === 1
    } else if (switchNumber === 2) {
      return device.switchStates.key3 === true || device.switchStates.key3 === 1
    }
  } else if (device.type === 'triple') {
    if (switchNumber === 1) {
      return device.switchStates.key1 === true || device.switchStates.key1 === 1
    } else if (switchNumber === 2) {
      return device.switchStates.key2 === true || device.switchStates.key2 === 1
    } else if (switchNumber === 3) {
      return device.switchStates.key3 === true || device.switchStates.key3 === 1
    }
  }
  
  return false
}

// 发送设备指令
const sendDeviceCommand = async (deviceId, command) => {
  try {
    // 根据deviceId查找设备
    const device = lightingDevices.value.find(d => d.deviceId === deviceId)
    if (!device) {
      throw new Error('设备不存在')
    }
    
    // 添加调试信息
    console.log('发送设备指令:', {
      deviceId: device.deviceId,
      command: command,
      commandType: typeof command,
      commandKeys: Object.keys(command || {})
    })
    

    
    // 使用照明控制API发送控制指令，传入设备的IMEI
    // 后端期望的格式是 { command: { switch_1: 1, switch_2: 0, ... } }
    const requestData = { command: {} }
    
    // 处理统计指令
    if (command.type === 'statistic') {
      requestData.command.statistic = 1
    }
    // 处理重启指令
    else if (command.type === 'setting' && command.system === 'restart') {
      requestData.command.restart = 1
    }
    // 处理开关控制指令
    else {
      // 将前端的key格式转换为后端期望的switch格式
      if (command.key1 !== undefined) {
        requestData.command.switch_1 = command.key1
      }
      if (command.key2 !== undefined) {
        requestData.command.switch_2 = command.key2
      }
      if (command.key3 !== undefined) {
        requestData.command.switch_3 = command.key3
      }
      if (command.restart !== undefined) {
        requestData.command.restart = command.restart
      }
    }
    
    console.log('转换后的请求数据:', requestData)
    
    const result = await lightingControlAPI.controlDevice(device.deviceId, requestData)
    
    if (!result.success) {
      throw new Error(result.message || '发送指令失败')
    }
    
    return result
  } catch (error) {
    console.error('发送指令错误:', error)
    ElMessage.error('发送指令失败: ' + error.message)
    throw error
  }
}

// 开启设备
const turnOnDevice = async (device) => {
  device.loading = true
  
  // 保存当前状态用于回滚
  const originalStates = device.switchStates ? { ...device.switchStates } : {}
  
  // 乐观更新：立即更新所有开关状态为开启
  if (device.switchStates) {
    if (device.type === 'single') {
      device.switchStates.key2 = true
    } else if (device.type === 'double') {
      device.switchStates.key1 = true
      device.switchStates.key3 = true
    } else if (device.type === 'triple') {
      device.switchStates.key1 = true
      device.switchStates.key2 = true
      device.switchStates.key3 = true
    }
    console.log('乐观更新：所有开关状态设为开启')
  }
  
  try {
    const command = deviceTypeConfig[device.type].onCommand
    await sendDeviceCommand(device.deviceId, command)
    ElMessage.success('设备开启成功')
    // 延迟5秒刷新电量数据，跳过开关状态更新以保持乐观更新的状态
    setTimeout(() => {
      refreshDeviceStatus(device, true)
    }, 5000)
  } catch (error) {
    // 如果命令发送失败，回滚到原始状态
    if (device.switchStates) {
      device.switchStates = { ...originalStates }
      console.log('命令失败，回滚到原始开关状态')
    }
    ElMessage.error('设备开启失败')
  } finally {
    device.loading = false
  }
}

// 关闭设备
const turnOffDevice = async (device) => {
  device.loading = true
  
  // 保存当前状态用于回滚
  const originalStates = device.switchStates ? { ...device.switchStates } : {}
  
  // 乐观更新：立即更新所有开关状态为关闭
  if (device.switchStates) {
    if (device.type === 'single') {
      device.switchStates.key2 = false
    } else if (device.type === 'double') {
      device.switchStates.key1 = false
      device.switchStates.key3 = false
    } else if (device.type === 'triple') {
      device.switchStates.key1 = false
      device.switchStates.key2 = false
      device.switchStates.key3 = false
    }
    console.log('乐观更新：所有开关状态设为关闭')
  }
  
  try {
    const command = deviceTypeConfig[device.type].offCommand
    console.log('turnOffDevice - 设备类型:', device.type, '关闭命令:', command)
    await sendDeviceCommand(device.deviceId, command)
    ElMessage.success('设备关闭成功')
    // 延迟5秒刷新电量数据，跳过开关状态更新以保持乐观更新的状态
    setTimeout(() => {
      refreshDeviceStatus(device, true)
    }, 5000)
  } catch (error) {
    // 如果命令发送失败，回滚到原始状态
    if (device.switchStates) {
      device.switchStates = { ...originalStates }
      console.log('命令失败，回滚到原始开关状态')
    }
    ElMessage.error('设备关闭失败')
  } finally {
    device.loading = false
  }
}

// 重启设备
const restartDevice = async (device) => {
  try {
    await ElMessageBox.confirm('确定要重启该设备吗？', '确认重启', {
      type: 'warning'
    })
    
    device.loading = true
    await sendDeviceCommand(device.deviceId, commonCommands.restart)
    ElMessage.success('设备重启指令已发送')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('设备重启失败')
    }
  } finally {
    device.loading = false
  }
}

// 根据设备类型和开关编号获取对应的key名称
const getKeyNameBySwitch = (deviceType, switchNumber) => {
  if (deviceType === 'single') {
    if (switchNumber === 1) return 'key2'
  } else if (deviceType === 'double') {
    if (switchNumber === 1) return 'key1'
    if (switchNumber === 2) return 'key3'
  } else if (deviceType === 'triple') {
    if (switchNumber === 1) return 'key1'
    if (switchNumber === 2) return 'key2'
    if (switchNumber === 3) return 'key3'
  }
  return null
}

// 开启单个开关
const turnOnSingleSwitch = async (device, switchNumber) => {
  device.loading = true
  
  // 获取key名称和保存原始状态
  const keyName = getKeyNameBySwitch(device.type, switchNumber)
  const originalState = keyName && device.switchStates ? device.switchStates[keyName] : false
  
  // 乐观更新：立即更新UI状态
  if (keyName && device.switchStates) {
    device.switchStates[keyName] = true
    console.log(`乐观更新：开关${switchNumber}状态设为开启`)
  }
  
  try {
    let command
    if (device.type === 'single') {
      if (switchNumber === 1) {
        command = { type: 'event', key2: 1 }
      }
    } else if (device.type === 'double') {
      if (switchNumber === 1) {
        command = { type: 'event', key1: 1 }
      } else if (switchNumber === 2) {
        command = { type: 'event', key3: 1 }
      }
    } else if (device.type === 'triple') {
      if (switchNumber === 1) {
        command = { type: 'event', key1: 1 }
      } else if (switchNumber === 2) {
        command = { type: 'event', key2: 1 }
      } else if (switchNumber === 3) {
        command = { type: 'event', key3: 1 }
      }
    }
    
    if (command) {
      await sendDeviceCommand(device.deviceId, command)
      ElMessage.success(`开关${switchNumber}开启成功`)
      // 延迟5秒刷新电量数据，跳过开关状态更新以保持乐观更新的状态
      setTimeout(() => {
        refreshDeviceStatus(device, true)
      }, 5000)
    }
  } catch (error) {
    // 如果命令发送失败，回滚到原始状态
    if (keyName && device.switchStates) {
      device.switchStates[keyName] = originalState
      console.log(`命令失败，回滚开关${switchNumber}到原始状态：${originalState}`)
    }
    ElMessage.error(`开关${switchNumber}开启失败`)
  } finally {
    device.loading = false
  }
}

// 关闭单个开关
const turnOffSingleSwitch = async (device, switchNumber) => {
  device.loading = true
  
  // 获取key名称和保存原始状态
  const keyName = getKeyNameBySwitch(device.type, switchNumber)
  const originalState = keyName && device.switchStates ? device.switchStates[keyName] : false
  
  // 乐观更新：立即更新UI状态
  if (keyName && device.switchStates) {
    device.switchStates[keyName] = false
    console.log(`乐观更新：开关${switchNumber}状态设为关闭`)
  }
  
  try {
    let command
    if (device.type === 'single') {
      if (switchNumber === 1) {
        command = { type: 'event', key2: 0 }
      }
    } else if (device.type === 'double') {
      if (switchNumber === 1) {
        command = { type: 'event', key1: 0 }
      } else if (switchNumber === 2) {
        command = { type: 'event', key3: 0 }
      }
    } else if (device.type === 'triple') {
      if (switchNumber === 1) {
        command = { type: 'event', key1: 0 }
      } else if (switchNumber === 2) {
        command = { type: 'event', key2: 0 }
      } else if (switchNumber === 3) {
        command = { type: 'event', key3: 0 }
      }
    }
    
    if (command) {
      await sendDeviceCommand(device.deviceId, command)
      ElMessage.success(`开关${switchNumber}关闭成功`)
      // 延迟5秒刷新电量数据，跳过开关状态更新以保持乐观更新的状态
      setTimeout(() => {
        refreshDeviceStatus(device, true)
      }, 5000)
    }
  } catch (error) {
    // 如果命令发送失败，回滚到原始状态
    if (keyName && device.switchStates) {
      device.switchStates[keyName] = originalState
      console.log(`命令失败，回滚开关${switchNumber}到原始状态：${originalState}`)
    }
    ElMessage.error(`开关${switchNumber}关闭失败`)
  } finally {
    device.loading = false
  }
}

// 切换开关状态（用于滑动开关）
const toggleSwitch = async (device, switchNumber) => {
  const currentStatus = getSwitchStatus(device, switchNumber)
  if (currentStatus) {
    await turnOffSingleSwitch(device, switchNumber)
  } else {
    await turnOnSingleSwitch(device, switchNumber)
  }
}

// 获取开关状态（用于滑动开关）
const getSwitchStatus = (device, switchNumber) => {
  const keyName = getKeyNameBySwitch(device.type, switchNumber)
  return keyName && device.switchStates ? device.switchStates[keyName] : false
}

// 刷新设备状态
const refreshDeviceStatus = async (device, skipSwitchUpdate = false) => {
  try {
    console.log('开始刷新设备状态，设备IMEI:', device.deviceId, '跳过开关状态更新:', skipSwitchUpdate)
    
    // 如果不跳过开关状态更新，则获取最新开关状态
    if (!skipSwitchUpdate) {
      let switchData = null
      let attempts = 0
      const maxAttempts = 3 // 减少最大尝试次数
      
      while (attempts < maxAttempts) {
        attempts++
        console.log(`第${attempts}次尝试获取开关状态`)
        
        switchData = await getLatestSwitchData(device.deviceId, device.manufacturer_code)
        
        // 如果获取到了有效数据，跳出循环
        if (switchData && (switchData.key1 !== undefined || switchData.key2 !== undefined || switchData.key3 !== undefined)) {
          console.log(`第${attempts}次尝试成功获取到开关状态:`, switchData)
          break
        }
        
        // 如果没有获取到数据，等待一段时间后重试
        if (attempts < maxAttempts) {
          console.log(`第${attempts}次尝试未获取到数据，等待2秒后重试`)
          await new Promise(resolve => setTimeout(resolve, 2000)) // 增加等待时间
        }
      }
      
      // 智能更新开关状态：只有当获取到的状态与当前状态不同时才更新
      if (switchData) {
        const newStates = {
          key1: switchData.key1 !== null ? switchData.key1 : false,
          key2: switchData.key2 !== null ? switchData.key2 : false,
          key3: switchData.key3 !== null ? switchData.key3 : false
        }
        
        // 检查是否有实际变化
        const hasChanges = !device.switchStates || 
          device.switchStates.key1 !== newStates.key1 ||
          device.switchStates.key2 !== newStates.key2 ||
          device.switchStates.key3 !== newStates.key3
        
        if (hasChanges) {
          console.log('检测到开关状态变化，更新状态:', newStates)
          device.switchStates = newStates
        } else {
          console.log('开关状态无变化，保持当前状态')
        }
      } else {
        console.warn('多次尝试后仍未获取到开关状态数据，保持当前状态')
      }
    } else {
      console.log('跳过开关状态更新，仅更新电量数据')
    }
    
    // 发送统计指令获取电量数据
    await sendDeviceCommand(device.deviceId, commonCommands.statistic)
    console.log('已发送统计指令到设备:', device.deviceId)
    
    // 等待设备响应
    await new Promise(resolve => setTimeout(resolve, 800))
    deviceDataCache.delete(`device_${device.deviceId}`)
    
    // 获取最新的设备电量数据
    console.log('正在获取设备最新数据，IMEI:', device.deviceId)
    
    // 使用getLatestDeviceData方法获取电量数据（已包含照明API优先逻辑）
    const deviceData = await getLatestDeviceData(device.deviceId)
    
    console.log('refreshDeviceStatus 获取到的设备数据:', deviceData)
    
    // 更新设备的电量数据
    device.voltage = deviceData.voltage
    device.current = deviceData.current
    device.power = deviceData.power
    device.energy = deviceData.energy
    
    console.log('更新后的设备电量数据:', {
      voltage: device.voltage,
      current: device.current,
      power: device.power,
      energy: device.energy
    })
    
  } catch (error) {
    console.error('刷新设备状态失败，IMEI:', device.deviceId, '错误:', error)
    
    // 即使出现异常，也尝试获取开关状态
    try {
      const switchData = await getLatestSwitchData(device.deviceId, device.manufacturer_code)
      if (switchData) {
        device.switchStates = {
          key1: switchData.key1 !== null ? switchData.key1 : false,
          key2: switchData.key2 !== null ? switchData.key2 : false,
          key3: switchData.key3 !== null ? switchData.key3 : false
        }
        console.log('异常情况下仅更新开关状态:', device.switchStates)
      }
    } catch (switchError) {
      console.error('获取开关状态也失败:', switchError)
    }
  }
}

// 显示设备详情
const showDeviceDetail = async (device) => {
  selectedDevice.value = device
  showDetailDialog.value = true
  
  // 先刷新设备状态以获取最新的电量数据
  await refreshDeviceStatus(device)
  
  // 设置默认时间范围（最近7天）
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 7)
  chartDateRange.value = [startDate, endDate]
  
  nextTick(() => {
    loadChartData()
  })
}

// 处理图表数据根据时间范围
const processChartData = (rawData) => {
  if (!rawData || rawData.length === 0) {
    return { chartData: [], timeLabels: [] }
  }
  
  // 确保原始数据中包含所有需要的字段
  const processedRawData = rawData.map(item => {
    return {
      ...item,
      voltage: item.voltage !== undefined ? item.voltage : 0,
      current: item.current !== undefined ? item.current : 0,
      power: item.power !== undefined ? item.power : 0,
      energy: item.energy !== undefined ? item.energy : 0,
      time: item.time
    }
  })
  
  const startDate = new Date(chartDateRange.value[0])
  const endDate = new Date(chartDateRange.value[1])
  const timeDiff = endDate - startDate
  const daysDiff = timeDiff / (1000 * 60 * 60 * 24)
  
  let chartData = []
  let timeLabels = []
  
  if (daysDiff >= 365) {
    // 按年显示：12个月
    chartData = aggregateDataByMonth(processedRawData, startDate, endDate)
    timeLabels = chartData.map(item => item.label)
  } else if (daysDiff > 7) {
    // 超过7天：按天显示
    chartData = aggregateDataByDay(processedRawData, startDate, endDate)
    timeLabels = chartData.map(item => item.label)
  } else if (daysDiff >= 1) {
    // 1-7天：按小时显示（支持多天）
    chartData = aggregateDataByHourMultiDay(processedRawData, startDate, endDate)
    timeLabels = chartData.map(item => item.label)
  } else {
    // 少于1天：分为30等份
    chartData = aggregateDataBySegments(processedRawData, startDate, endDate, 30)
    timeLabels = chartData.map(item => item.label)
  }
  
  return { chartData, timeLabels }
}

// 按月聚合数据
const aggregateDataByMonth = (data, startDate, endDate) => {
  const result = []
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
  
  // 获取最新的数据值
  const getLatestValue = (dataArray, key) => {
    if (!dataArray || dataArray.length === 0) return 0
    const sortedData = [...dataArray].sort((a, b) => new Date(a.time) - new Date(b.time))
    return parseFloat(sortedData[sortedData.length - 1][key] !== undefined ? sortedData[sortedData.length - 1][key] : 0)
  }
  
  for (let i = 0; i < 12; i++) {
    const monthStart = new Date(start.getFullYear(), start.getMonth() + i, 1)
    const monthEnd = new Date(start.getFullYear(), start.getMonth() + i + 1, 0, 23, 59, 59)
    
    if (monthStart > endDate) break
    
    const monthData = data.filter(item => {
      const itemDate = new Date(item.time)
      return itemDate >= monthStart && itemDate <= monthEnd
    })
    
    const energyReading = getLatestEnergyReading(monthData)
    const energyDiff = calculateEnergyDiff(monthData)
    
    // 获取电压、电流和功率的最新值
    const voltageReading = getLatestValue(monthData, 'voltage')
    const currentReading = getLatestValue(monthData, 'current')
    const powerReading = getLatestValue(monthData, 'power')
    
    result.push({
      label: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`,
      voltage: voltageReading, // 电压值
      current: currentReading, // 电流值
      power: powerReading, // 功率值
      energy: energyReading, // 显示电表读数
      energyDiff: energyDiff, // 保存用电量差值用于计算总耗电量
      time: monthStart.toISOString()
    })
  }
  
  return result
}

// 按天聚合数据
const aggregateDataByDay = (data, startDate, endDate) => {
  const result = []
  const current = new Date(startDate)
  
  // 获取最新的数据值
  const getLatestValue = (dataArray, key) => {
    if (!dataArray || dataArray.length === 0) return 0
    const sortedData = [...dataArray].sort((a, b) => new Date(a.time) - new Date(b.time))
    return parseFloat(sortedData[sortedData.length - 1][key] !== undefined ? sortedData[sortedData.length - 1][key] : 0)
  }
  
  while (current <= endDate) {
    const dayStart = new Date(current.getFullYear(), current.getMonth(), current.getDate())
    const dayEnd = new Date(current.getFullYear(), current.getMonth(), current.getDate(), 23, 59, 59)
    
    const dayData = data.filter(item => {
      const itemDate = new Date(item.time)
      return itemDate >= dayStart && itemDate <= dayEnd
    })
    
    const energyReading = getLatestEnergyReading(dayData)
    const energyDiff = calculateEnergyDiff(dayData)
    
    // 获取电压、电流和功率的最新值
    const voltageReading = getLatestValue(dayData, 'voltage')
    const currentReading = getLatestValue(dayData, 'current')
    const powerReading = getLatestValue(dayData, 'power')
    
    result.push({
      label: `${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`,
      voltage: voltageReading, // 电压值
      current: currentReading, // 电流值
      power: powerReading, // 功率值
      energy: energyReading, // 显示电表读数
      energyDiff: energyDiff, // 保存用电量差值用于计算总耗电量
      time: dayStart.toISOString()
    })
    
    current.setDate(current.getDate() + 1)
  }
  
  return result
}

// 按小时聚合数据（单天）
const aggregateDataByHour = (data, startDate, endDate) => {
  const result = []
  const current = new Date(startDate)
  
  for (let hour = 0; hour < 24; hour++) {
    const hourStart = new Date(current.getFullYear(), current.getMonth(), current.getDate(), hour)
    const hourEnd = new Date(current.getFullYear(), current.getMonth(), current.getDate(), hour, 59, 59)
    
    const hourData = data.filter(item => {
      const itemDate = new Date(item.time)
      return itemDate >= hourStart && itemDate <= hourEnd
    })
    
    // 获取最新的数据值
    const getLatestValue = (dataArray, key) => {
      if (!dataArray || dataArray.length === 0) return 0
      const sortedData = [...dataArray].sort((a, b) => new Date(a.time) - new Date(b.time))
      return parseFloat(sortedData[sortedData.length - 1][key] !== undefined ? sortedData[sortedData.length - 1][key] : 0)
    }
    
    const energyReading = getLatestEnergyReading(hourData)
    const energyDiff = calculateEnergyDiff(hourData)
    
    // 获取电压、电流和功率的最新值
    const voltageReading = getLatestValue(hourData, 'voltage')
    const currentReading = getLatestValue(hourData, 'current')
    const powerReading = getLatestValue(hourData, 'power')
    
    result.push({
      label: `${String(hour).padStart(2, '0')}:00`,
      voltage: voltageReading, // 电压值
      current: currentReading, // 电流值
      power: powerReading, // 功率值
      energy: energyReading, // 显示电表读数
      energyDiff: energyDiff, // 保存用电量差值用于计算总耗电量
      time: hourStart.toISOString()
    })
  }
  
  return result
}

// 按小时聚合数据（多天支持）
const aggregateDataByHourMultiDay = (data, startDate, endDate) => {
  const result = []
  const current = new Date(startDate)
  
  while (current <= endDate) {
    for (let hour = 0; hour < 24; hour++) {
      const hourStart = new Date(current.getFullYear(), current.getMonth(), current.getDate(), hour)
      const hourEnd = new Date(current.getFullYear(), current.getMonth(), current.getDate(), hour, 59, 59)
      
      // 如果小时结束时间超过了结束日期，则跳出
      if (hourStart > endDate) break
      
      const hourData = data.filter(item => {
        const itemDate = new Date(item.time)
        return itemDate >= hourStart && itemDate <= hourEnd
      })
      
      const energyReading = getLatestEnergyReading(hourData)
      const energyDiff = calculateEnergyDiff(hourData)
      result.push({
        label: `${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')} ${String(hour).padStart(2, '0')}:00`,
        energy: energyReading, // 显示电表读数
        energyDiff: energyDiff, // 保存用电量差值用于计算总耗电量
        time: hourStart.toISOString()
      })
    }
    
    current.setDate(current.getDate() + 1)
    
    // 如果当前日期超过了结束日期，则跳出
    if (current > endDate) break
  }
  
  return result
}

// 按时间段聚合数据（分为指定等份）
const aggregateDataBySegments = (data, startDate, endDate, segments) => {
  const result = []
  const timeDiff = endDate - startDate
  const segmentDuration = timeDiff / segments
  
  // 获取最新的数据值
  const getLatestValue = (dataArray, key) => {
    if (!dataArray || dataArray.length === 0) return 0
    const sortedData = [...dataArray].sort((a, b) => new Date(a.time) - new Date(b.time))
    return parseFloat(sortedData[sortedData.length - 1][key] !== undefined ? sortedData[sortedData.length - 1][key] : 0)
  }
  
  for (let i = 0; i < segments; i++) {
    const segmentStart = new Date(startDate.getTime() + i * segmentDuration)
    const segmentEnd = new Date(startDate.getTime() + (i + 1) * segmentDuration)
    
    const segmentData = data.filter(item => {
      const itemDate = new Date(item.time)
      return itemDate >= segmentStart && itemDate < segmentEnd
    })
    
    const energyReading = getLatestEnergyReading(segmentData)
    const energyDiff = calculateEnergyDiff(segmentData)
    
    // 获取电压、电流和功率的最新值
    const voltageReading = getLatestValue(segmentData, 'voltage')
    const currentReading = getLatestValue(segmentData, 'current')
    const powerReading = getLatestValue(segmentData, 'power')
    
    result.push({
      label: `${segmentStart.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
      voltage: voltageReading, // 电压值
      current: currentReading, // 电流值
      power: powerReading, // 功率值
      energy: energyReading, // 显示电表读数
      energyDiff: energyDiff, // 保存用电量差值用于计算总耗电量
      time: segmentStart.toISOString()
    })
  }
  
  return result
}

// 计算时段用电量（本时段最近电表数据减去本时段最初时间的就近电量数据）
const calculateEnergyDiff = (data) => {
  if (!data || data.length === 0) return 0
  if (data.length === 1) return parseFloat(data[0].energy !== undefined ? data[0].energy : 0)
  
  // 按时间排序
  const sortedData = data.sort((a, b) => new Date(a.time) - new Date(b.time))
  const firstEnergy = parseFloat(sortedData[0].energy !== undefined ? sortedData[0].energy : 0)
  const lastEnergy = parseFloat(sortedData[sortedData.length - 1].energy !== undefined ? sortedData[sortedData.length - 1].energy : 0)
  
  // 返回时段用电量差值，如果为负数则按0计算
  return Math.max(0, lastEnergy - firstEnergy)
}

// 获取时段内最新的电表读数（用于折线图显示电表变化趋势）
const getLatestEnergyReading = (data) => {
  if (!data || data.length === 0) return 0
  
  // 按时间排序，取最新的电表读数
  const sortedData = data.sort((a, b) => new Date(a.time) - new Date(b.time))
  return parseFloat(sortedData[sortedData.length - 1].energy !== undefined ? sortedData[sortedData.length - 1].energy : 0)
}

// 设置快捷日期
const setQuickDate = (type) => {
  const now = new Date()
  let startDate, endDate
  
  switch (type) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
      break
    case 'week':
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - now.getDay())
      weekStart.setHours(0, 0, 0, 0)
      startDate = weekStart
      endDate = new Date(now)
      break
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      endDate = new Date(now)
      break
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1)
      endDate = new Date(now)
      break
    default:
      return
  }
  
  chartDateRange.value = [startDate, endDate]
  loadChartData()
}

// 加载图表数据
const loadChartData = async () => {
  // 如果没有选中设备但有可用设备，自动选择第一个设备
  if (!selectedDevice.value && lightingDevices.value.length > 0) {
    selectedDevice.value = lightingDevices.value[0]
  }
  
  if (!selectedDevice.value || !chartDateRange.value.length) return
  
  try {
    const startTime = chartDateRange.value[0].toISOString()
    const endTime = chartDateRange.value[1].toISOString()
    
    console.log('加载图表数据，设备IMEI:', selectedDevice.value.deviceId)
    
    // 从后端API获取真实设备数据，使用设备的IMEI
    const deviceData = await fetchDeviceData(selectedDevice.value.deviceId, startTime, endTime)
    renderChart(deviceData)
  } catch (error) {
    console.error('加载图表数据失败:', error)
    ElMessage.error('加载图表数据失败')
  }
}

// 从后端API获取设备电量数据
const fetchDeviceData = async (deviceImei, startTime, endTime) => {
  try {
    console.log('正在获取照明设备历史数据，IMEI:', deviceImei, '时间范围:', startTime, '到', endTime)
    
    // 首先尝试从照明数据API获取数据（使用按月分表）
    try {
      // 查找设备的manufacturer_code
      const device = lightingDevices.value.find(d => d.deviceId === deviceImei)
      const manufacturerCode = device?.manufacturer_code || 'BNDK' // 默认使用BNDK
      
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'
      const lightingResult = await fetch(`${API_BASE_URL}/lighting-data/history/${deviceImei}?manufacturer_code=${manufacturerCode}&start_time=${startTime}&end_time=${endTime}&limit=100`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      
      if (lightingResult.ok) {
        const lightingData = await lightingResult.json()
        console.log('照明数据API响应:', lightingData)
        console.log('数据查询来源:', lightingData.querySource || '未知')
        
        if (lightingData.success && lightingData.data && lightingData.data.deviceData && lightingData.data.deviceData.length > 0) {
          console.log('获取到照明设备历史数据:', lightingData.data.deviceData)
          return processLightingData(lightingData.data.deviceData)
        }
      }
    } catch (lightingError) {
      console.warn('照明时序数据API调用失败:', lightingError)
    }
    return getDefaultChartData()
  } catch (error) {
    console.error('获取设备数据失败:', error)
    return getDefaultChartData()
  }
}

// 处理照明数据API返回的数据
const processLightingData = (data) => {
  const processedData = []
  
  if (data && data.length > 0) {
    data.forEach(item => {
      processedData.push({
        time: item.timestamp || item.created_at,
        voltage: parseFloat(item.voltage !== undefined ? item.voltage : 0).toFixed(3),
        current: parseFloat(item.current !== undefined ? item.current : 0).toFixed(3),
        power: parseFloat(item.power !== undefined ? item.power : 0).toFixed(3),
        energy: parseFloat(item.energy !== undefined ? item.energy : 0).toFixed(3)
      })
    })
  }
  
  return processedData.length > 0 ? processedData : getDefaultChartData()
}

// 获取默认图表数据（当没有真实数据时使用）
const getDefaultChartData = () => {
  // 返回空数组，避免在没有数据时显示无意义的点
  return []
}

// 渲染图表
const renderChart = (data) => {
  if (!chartContainer.value) return
  
  if (chartInstance) {
    chartInstance.dispose()
  }
  
  chartInstance = echarts.init(chartContainer.value)
  
  // 处理数据格式
  let rawData = []
  
  if (Array.isArray(data) && data.length > 0) {
    rawData = data
  } else if (data && data.hours) {
    rawData = data.hours.map((hour, index) => ({
      time: hour,
      voltage: data.voltage[index],
      current: data.current[index],
      power: data.power[index],
      energy: data.energy[index]
    }))
  }
  
  // 根据时间范围处理数据
  const { chartData, timeLabels } = processChartData(rawData)
  
  // 确保数据中包含所有需要的字段
  console.log('图表数据示例:', chartData.length > 0 ? chartData[0] : '无数据')
  
  // 检查是否有真实数据（包括零值数据）
  const hasRealData = chartData.length > 0
  
  // 根据选择的图表类型确定标题和数据
  const chartTypeConfig = {
    voltage: {
      title: '电压变化趋势图',
      name: '电压(V)',
      unit: 'V',
      dataKey: 'voltage'
    },
    current: {
      title: '电流变化趋势图',
      name: '电流(A)',
      unit: 'A',
      dataKey: 'current'
    },
    power: {
      title: '功率变化趋势图',
      name: '功率(W)',
      unit: 'W',
      dataKey: 'power'
    },
    energy: {
      title: '电能变化趋势图',
      name: '电表读数(KW·H)',
      unit: 'KW·H',
      dataKey: 'energy'
    }
  }
  
  const currentConfig = chartTypeConfig[selectedChartType.value] || chartTypeConfig.energy
  
  const option = {
    title: {
      text: hasRealData ? currentConfig.title : `${currentConfig.title}（暂无数据）`,
      left: 'center'
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross'
      },
      formatter: function(params) {
        if (!hasRealData) {
          return '暂无数据'
        }
        let result = `时间: ${params[0].axisValue}<br/>`
        params.forEach(param => {
          result += `${param.seriesName}: ${param.value} ${currentConfig.unit}<br/>`
        })
        return result
      }
    },
    legend: {
      data: [currentConfig.name],
      top: 30
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: timeLabels,
      axisLabel: {
        rotate: 45
      }
    },
    yAxis: {
      type: 'value',
      name: currentConfig.name,
      position: 'left'
    },
    series: [
      {
        name: currentConfig.name,
        type: 'line',
        data: hasRealData ? chartData.map(item => {
          // 确保数据存在，如果不存在则使用0
          const value = item[currentConfig.dataKey];
          return parseFloat(value !== undefined ? value : 0);
        }) : [],
        lineStyle: { 
          color: '#409EFF',
          width: 2
        },
        itemStyle: { 
          color: '#409EFF'
        },
        symbol: hasRealData ? 'circle' : 'none',
        symbolSize: hasRealData ? 6 : 0,
        smooth: true,
        showSymbol: hasRealData
      }
    ],
    // 当没有数据时显示空状态提示
    graphic: hasRealData ? [] : [
      {
        type: 'text',
        left: 'center',
        top: 'middle',
        style: {
          text: '暂无电量数据\n请选择有数据的时间范围',
          textAlign: 'center',
          fill: '#999',
          fontSize: 16
        }
      }
    ]
  }
  
  chartInstance.setOption(option)
  
  // 计算总耗电量（所有时间段的用电量差值总和）
  let totalEnergy = 0
  if (chartData.length > 0) {
    totalEnergy = chartData.reduce((sum, item) => {
      return sum + (parseFloat(item.energyDiff !== undefined ? item.energyDiff : 0))
    }, 0)
  }
  totalEnergyConsumption.value = totalEnergy.toFixed(3)
  
  // 响应式调整
  const resizeHandler = () => {
    chartInstance.resize()
  }
  window.addEventListener('resize', resizeHandler)
  
  // 组件卸载时移除事件监听
  onUnmounted(() => {
    window.removeEventListener('resize', resizeHandler)
    chartInstance.dispose()
  })
}

// 获取可用设备列表
const loadAvailableDevices = async () => {
  loadingDevices.value = true
  try {
    const result = await lightingControlAPI.getAvailableDevices()
    if (result.success && result.data) {
      const deviceData = result.data.list || result.data.devices || result.data || []
      
      // 过滤出未添加到照明控制的设备，且设备类型为"照明开关"
      const existingDeviceIds = lightingDevices.value.map(d => d.deviceId)
      availableDevices.value = deviceData
        .filter(device => 
          !existingDeviceIds.includes(device.imei) && 
          device.device_type_name === '照明开关'
        )
        .map(device => ({
          id: device.id,
          name: device.name,
          imei: device.imei,
          tenantName: device.tenant?.name || '未知租户',
          type: device.device_type_name || '未知类型',
          status: device.status || 'offline',
          lightingType: 'single' // 默认单开
        }))
      
      filteredAvailableDevices.value = availableDevices.value
    }
  } catch (error) {
    console.error('获取设备列表失败:', error)
    ElMessage.error('获取设备列表失败: ' + error.message)
  } finally {
    loadingDevices.value = false
  }
}

// 搜索设备
const searchDevices = () => {
  const keyword = deviceSearchKeyword.value.toLowerCase()
  if (!keyword) {
    filteredAvailableDevices.value = availableDevices.value
  } else {
    filteredAvailableDevices.value = availableDevices.value.filter(device => 
      device.name.toLowerCase().includes(keyword) || 
      device.imei.toLowerCase().includes(keyword)
    )
  }
}

// 处理设备选择
const handleDeviceSelection = (selection) => {
  selectedDevices.value = selection
}

// 取消添加设备
const cancelAddDevice = () => {
  showAddDialog.value = false
  selectedDevices.value = []
  deviceSearchKeyword.value = ''
  filteredAvailableDevices.value = []
}

// 确认添加设备
const confirmAddDevice = async () => {
  if (selectedDevices.value.length === 0) {
    ElMessage.warning('请选择要添加的设备')
    return
  }
  
  // 检查是否所有设备都配置了开关类型
  const unconfiguredDevices = selectedDevices.value.filter(device => !device.lightingType)
  if (unconfiguredDevices.length > 0) {
    ElMessage.warning('请为所有选中的设备配置开关类型')
    return
  }
  
  try {
    // 将设备添加到照明控制表
    for (const device of selectedDevices.value) {
      const addData = {
        device_id: device.id,
        lighting_type: device.lightingType
      }
      
      const result = await lightingControlAPI.addLightingDevice(addData)
      
      if (!result.success) {
        throw new Error(result.message || `添加设备 ${device.name} 到照明控制失败`)
      }
    }
    
    ElMessage.success(`成功添加 ${selectedDevices.value.length} 个照明设备`)
    
    // 重新加载设备列表
    await loadDevices()
    
  } catch (error) {
    console.error('添加照明设备失败:', error)
    ElMessage.error(error.message || '添加照明设备失败')
    return
  }
  
  // 重置状态
  cancelAddDevice()
}

// 请求缓存机制
const deviceDataCache = new Map()
const CACHE_DURATION = 5000

// 获取设备最新电量数据（带缓存和去重）
const getLatestDeviceData = async (deviceImei, retryCount = 0) => {
  const maxRetries = 1 // 减少重试次数
  const retryDelay = 2000 // 增加延迟时间
  
  // 检查缓存
  const cacheKey = `device_${deviceImei}`
  const cached = deviceDataCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`使用缓存的设备数据，IMEI: ${deviceImei}`)
    return cached.data
  }
  
  try {
    console.log(`正在获取设备数据，IMEI: ${deviceImei}, 尝试次数: ${retryCount + 1}`)
    
    // 首先尝试使用照明数据API获取最新数据
    try {
      // 查找设备的manufacturer_code
      const device = lightingDevices.value.find(d => d.deviceId === deviceImei)
      const manufacturerCode = device?.manufacturer_code || 'BNDK'
      
      const lightingResult = await lightingDataAPI.getLatestData(deviceImei, manufacturerCode, true)
      
      if (lightingResult.success && lightingResult.data) {
        const data = lightingResult.data
        
        // 检查是否有电气数据字段
        if (data.voltage !== undefined || data.current !== undefined || data.power !== undefined || data.energy !== undefined) {
          const voltage = data.voltage !== undefined ? parseFloat(data.voltage) : 0
          const current = data.current !== undefined ? parseFloat(data.current) : 0
          const power = data.power !== undefined ? parseFloat(data.power) : 0
          const energy = data.energy !== undefined ? parseFloat(data.energy) : 0
          
          const result = {
            voltage: voltage.toFixed(3),
            current: current.toFixed(3),
            power: power.toFixed(3),
            energy: energy.toFixed(3)
          }
          
          // 缓存结果
          deviceDataCache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
          })
          
          return result
        }
        
        // 检查是否有electricalData字段（可能是嵌套的）
        if (data.electricalData) {
          const voltage = data.electricalData.voltage !== undefined ? parseFloat(data.electricalData.voltage) : 0
          const current = data.electricalData.current !== undefined ? parseFloat(data.electricalData.current) : 0
          const power = data.electricalData.power !== undefined ? parseFloat(data.electricalData.power) : 0
          const energy = data.electricalData.energy !== undefined ? parseFloat(data.electricalData.energy) : 0
          
          const result = {
            voltage: voltage.toFixed(3),
            current: current.toFixed(3),
            power: power.toFixed(3),
            energy: energy.toFixed(3)
          }
          
          // 缓存结果
          deviceDataCache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
          })
          
          return result
        }
      }
    } catch (lightingError) {
      console.warn('照明时序数据API调用失败:', lightingError)
    }
    
    // 如果没有获取到有效数据且还有重试次数，进行重试
    if (retryCount < maxRetries) {
      console.log(`第${retryCount + 1}次尝试失败，${retryDelay}ms后进行第${retryCount + 2}次尝试`)
      await new Promise(resolve => setTimeout(resolve, retryDelay))
      return await getLatestDeviceData(deviceImei, retryCount + 1)
    }
    
  } catch (error) {
    console.error(`获取设备数据失败，IMEI: ${deviceImei}, 尝试次数: ${retryCount + 1}, 错误:`, error)
    
    // 如果还有重试次数，进行重试
    if (retryCount < maxRetries) {
      console.log(`网络错误，${retryDelay}ms后进行第${retryCount + 2}次尝试`)
      await new Promise(resolve => setTimeout(resolve, retryDelay))
      return await getLatestDeviceData(deviceImei, retryCount + 1)
    }
  }
  
  // 返回默认值
  const defaultResult = {
    voltage: '0.000',
    current: '0.000',
    power: '0.000',
    energy: '0.000'
  }
  
  // 缓存默认值（较短时间）
  deviceDataCache.set(cacheKey, {
    data: defaultResult,
    timestamp: Date.now() - CACHE_DURATION + 5000 // 5秒后过期
  })
  
  return defaultResult
}

// 并发控制函数 - 限制同时进行的API请求数量
const loadDevicesDataWithConcurrencyControl = async (devices) => {
  const concurrencyLimit = 3 // 限制同时进行的请求数量
  const requestQueue = []
  const activeRequests = new Set()
  
  // 创建请求队列
  devices.forEach((device, index) => {
    requestQueue.push(async () => {
      try {
        console.log(`开始加载设备数据: ${device.device_name} (${index + 1}/${devices.length})`)
        
        const deviceData = await getLatestDeviceData(device.device_imei)
        
        // 更新对应设备的数据（开关状态已从列表接口获取，此处仅更新电气数据）
        const deviceIndex = lightingDevices.value.findIndex(d => d.id === device.id)
        if (deviceIndex !== -1) {
          lightingDevices.value[deviceIndex] = {
            ...lightingDevices.value[deviceIndex],
            voltage: deviceData.voltage || '0.000',
            current: deviceData.current || '0.000',
            power: deviceData.power || '0.000',
            energy: deviceData.energy || '0.000',
            loading: false
          }
        }
        
        console.log(`设备数据加载完成: ${device.device_name}`)
      } catch (error) {
        console.error(`加载设备 ${device.device_name} 数据失败:`, error)
        // 即使单个设备加载失败，也要移除loading状态
        const deviceIndex = lightingDevices.value.findIndex(d => d.id === device.id)
        if (deviceIndex !== -1) {
          lightingDevices.value[deviceIndex].loading = false
        }
      }
    })
  })
  
  // 执行并发控制的请求处理
  const executeNext = async () => {
    if (requestQueue.length === 0 || activeRequests.size >= concurrencyLimit) {
      return
    }
    
    const request = requestQueue.shift()
    const requestPromise = request()
    activeRequests.add(requestPromise)
    
    try {
      await requestPromise
    } finally {
      activeRequests.delete(requestPromise)
      // 添加请求间隔，避免过于频繁的请求
      await new Promise(resolve => setTimeout(resolve, 200))
      // 继续执行下一个请求
      executeNext()
    }
  }
  
  // 启动并发请求
  const initialRequests = []
  for (let i = 0; i < Math.min(concurrencyLimit, requestQueue.length); i++) {
    initialRequests.push(executeNext())
  }
  
  // 等待所有请求完成
  await Promise.all(initialRequests)
  
  // 等待剩余的活跃请求完成
  while (activeRequests.size > 0) {
    await Promise.all([...activeRequests])
  }
  
  console.log('所有设备数据加载完成')
}

// 开关状态缓存机制
const switchDataCache = new Map()

// 获取设备最新开关状态数据（带缓存和去重）
const getLatestSwitchData = async (deviceImei, manufacturerCode = 'BNDK', retryCount = 0) => {
  const maxRetries = 1 // 减少重试次数到1次
  const retryDelay = 2000 // 增加延迟时间到2秒
  
  // 检查缓存
  const cacheKey = `switch_${deviceImei}`
  const cached = switchDataCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`使用缓存的开关状态数据，IMEI: ${deviceImei}`)
    return cached.data
  }
  
  try {
    console.log(`正在获取设备开关状态，IMEI: ${deviceImei}, 尝试次数: ${retryCount + 1}`)
    
    // 使用新的API函数，启用按月分表查询
    const result = await lightingDataAPI.getLatestData(deviceImei, manufacturerCode, true)
    
    if (result.success && result.data) {
      const switchData = {
        key1: result.data.switchStates?.key1 !== null ? result.data.switchStates?.key1 : false,
        key2: result.data.switchStates?.key2 !== null ? result.data.switchStates?.key2 : false,
        key3: result.data.switchStates?.key3 !== null ? result.data.switchStates?.key3 : false
      }
      
      // 检查是否获取到有效数据
      const hasValidData = switchData.key1 !== undefined || switchData.key2 !== undefined || switchData.key3 !== undefined
      
      if (hasValidData) {
        console.log(`成功获取开关状态数据:`, switchData)
        
        // 缓存结果
        switchDataCache.set(cacheKey, {
          data: switchData,
          timestamp: Date.now()
        })
        
        return switchData
      }
    }
    
    // 如果没有获取到有效数据且还有重试次数，进行重试
    if (retryCount < maxRetries) {
      console.log(`第${retryCount + 1}次尝试失败，${retryDelay}ms后进行第${retryCount + 2}次尝试`)
      await new Promise(resolve => setTimeout(resolve, retryDelay))
      return await getLatestSwitchData(deviceImei, manufacturerCode, retryCount + 1)
    }
    
  } catch (error) {
    console.error(`获取设备开关状态失败，IMEI: ${deviceImei}, 尝试次数: ${retryCount + 1}, 错误:`, error)
    
    // 如果还有重试次数，进行重试
    if (retryCount < maxRetries) {
      console.log(`网络错误，${retryDelay}ms后进行第${retryCount + 2}次尝试`)
      await new Promise(resolve => setTimeout(resolve, retryDelay))
      return await getLatestSwitchData(deviceImei, manufacturerCode, retryCount + 1)
    }
  }
  
  // 所有重试都失败后返回默认值
  const defaultSwitchData = {
    key1: false,
    key2: false,
    key3: false
  }
  
  // 缓存默认值（较短时间）
  switchDataCache.set(cacheKey, {
    data: defaultSwitchData,
    timestamp: Date.now() - CACHE_DURATION + 5000 // 5秒后过期
  })
  
  console.warn(`所有重试都失败，返回默认开关状态，IMEI: ${deviceImei}`)
  return defaultSwitchData
}





// 加载分组列表
const loadGroups = async () => {
  try {
    const [buildingResponse, groupResponse] = await Promise.all([
      projectManagementAPI.getBuildings(),
      projectManagementAPI.getGroups()
    ])
    buildingOptions.value = buildingResponse.success ? buildingResponse.data || [] : []
    deviceGroups.value = groupResponse.success ? groupResponse.data || [] : []
  } catch (error) {
    console.error('加载项目建筑和分组失败:', error)
    buildingOptions.value = []
    deviceGroups.value = []
  }
}

const loadTenants = async () => {
  try {
    if (!isAdmin.value) {
      tenantOptions.value = userInfo.value.tenant ? [userInfo.value.tenant] : []
      return
    }
    const response = await tenantAPI.getTenants({ page: 1, pageSize: 1000, _t: Date.now() }, { cache: false })
    tenantOptions.value = response.data?.tenants || response.data?.list || response.data || []
  } catch (error) {
    console.error('加载租户列表失败:', error)
    tenantOptions.value = []
  }
}

// 加载设备列表
const loadDevices = async () => {
  try {
    loading.value = true
    const params = {
      page: devicePage.value,
      pageSize: devicePageSize.value
    }
    const keyword = searchKeyword.value.trim()
    if (keyword) params.keyword = keyword
    if (selectedTenant.value) params.tenantId = selectedTenant.value
    if (selectedBuilding.value) params.buildingId = selectedBuilding.value
    if (selectedProjectGroup.value) params.projectGroupId = selectedProjectGroup.value
    if (selectedStatus.value) params.status = selectedStatus.value

    const result = await lightingControlAPI.getLightingDevices(params)
    if (result.success && result.data) {
      const devices = result.data.devices || []
      deviceTotal.value = Number(
        result.data.pagination?.total ?? result.data.total ?? devices.length
      )
      
      // 先快速显示设备基本信息，不等待数据加载
      lightingDevices.value = devices.map(device => {
        const type = device.lighting_type || 'single'
        let sceneConfig = {}
        if (type === 'single') sceneConfig = { key2: 0 }
        else if (type === 'double') sceneConfig = { key1: 0, key3: 0 }
        else if (type === 'triple') sceneConfig = { key1: 0, key2: 0, key3: 0 }
        
        return {
          id: device.id,
          device_id: device.device_id,
          name: device.device_name,
          deviceId: device.device_imei,
          type: type,
          voltage: '0.000',
          current: '0.000', 
          power: '0.000',
          energy: '0.000',
          status: device.device_status || 'offline',
          tenantId: device.tenant_id || device.tenantId || '',
          projectBuildingId: device.project_building_id || '',
          projectBuildingName: device.project_building_name || '',
          projectGroupId: device.project_group_id || '',
          projectGroupName: device.project_group_name || '',
          loading: false,
          group: device.project_group_name || '',
          manufacturer_code: device.manufacturer_code || 'BNDK',
          switchStates: {
            key1: device.switch_1 === true || device.switch_1 === 't' || device.switch_1 === 1,
            key2: device.switch_2 === true || device.switch_2 === 't' || device.switch_2 === 1,
            key3: device.switch_3 === true || device.switch_3 === 't' || device.switch_3 === 1
          },
          selected: false,
          sceneConfig: sceneConfig
        }
      })
      
      // 立即执行过滤显示设备
      filterDevices()
      
      // 如果没有找到照明设备，显示提示
      if (lightingDevices.value.length === 0) {
        ElMessage.info('暂无照明设备，请通过"添加设备"功能手动添加')
      }
    }
  } catch (error) {
    console.error('加载照明设备列表失败:', error)
    ElMessage.error('加载照明设备列表失败')
    // 如果API调用失败，使用空数组
    lightingDevices.value = []
    filteredDevices.value = []
    deviceTotal.value = 0
  } finally {
    loading.value = false
  }
}

// 删除设备
const deleteDevice = async (device) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除设备 "${device.name}" 吗？删除后将无法恢复。`,
      '确认删除',
      {
        type: 'warning',
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger'
      }
    )
    
    // 调用后端API删除照明控制记录
    const result = await lightingControlAPI.deleteLightingDevice(device.id)
    
    if (!result.success) {
      throw new Error(result.message || '删除设备失败')
    }
    
    if (selectedDevice.value && selectedDevice.value.id === device.id) {
      showDetailDialog.value = false
      selectedDevice.value = null
    }
    const remainingTotal = Math.max(deviceTotal.value - 1, 0)
    const lastPage = Math.max(Math.ceil(remainingTotal / devicePageSize.value), 1)
    devicePage.value = Math.min(devicePage.value, lastPage)
    await loadDevices()
    ElMessage.success('设备删除成功')
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除设备失败:', error)
      ElMessage.error(error.message || '设备删除失败')
    }
  }
}

// 打开添加设备对话框时加载可用设备
const openAddDialog = () => {
  showAddDialog.value = true
  loadAvailableDevices()
}

// 刷新所有设备的电量数据
const refreshAllDevicesData = async () => {
  loading.value = true
  try {
    for (const device of lightingDevices.value) {
      await refreshDeviceStatus(device)
    }
    ElMessage.success('设备数据刷新完成')
  } catch (error) {
    console.error('刷新设备数据失败:', error)
    ElMessage.error('刷新设备数据失败')
  } finally {
    loading.value = false
  }
}

// 组件挂载时加载数据
onMounted(async () => {
  await Promise.all([
    loadDevices(),
    loadGroups(),
    loadTenants()
  ])
  // 默认选择今天的数据
  setQuickDate('today')
  
  // 加载自定义情景模式
  loadCustomScenes()
  
  // 初始化WebSocket连接
  websocketService.connect()

  // 监听WebSocket事件
  websocketService.on('device_status_update', handleDeviceStatusUpdate)
  websocketService.on('device_offline', handleDeviceOffline)
  websocketService.on('device_online', handleDeviceOnline)
  websocketService.on('lighting_switch_status', handleLightingSwitchStatus)
  websocketService.on('lighting_electrical_data', handleLightingElectricalData)
  websocketService.on('communication_log', handleCommunicationLog)
  websocketService.on('lighting_scene_created', handleSceneUpdate)
  websocketService.on('lighting_scene_updated', handleSceneUpdate)
  websocketService.on('lighting_scene_deleted', handleSceneUpdate)
})

// 组件卸载时清理资源
onUnmounted(() => {
  clearTimeout(searchTimer)
  // 移除WebSocket监听器
  websocketService.off('device_status_update', handleDeviceStatusUpdate)
  websocketService.off('device_offline', handleDeviceOffline)
  websocketService.off('device_online', handleDeviceOnline)
  websocketService.off('lighting_switch_status', handleLightingSwitchStatus)
  websocketService.off('lighting_electrical_data', handleLightingElectricalData)
  websocketService.off('communication_log', handleCommunicationLog)
  websocketService.off('lighting_scene_created', handleSceneUpdate)
  websocketService.off('lighting_scene_updated', handleSceneUpdate)
  websocketService.off('lighting_scene_deleted', handleSceneUpdate)
  
  // 断开WebSocket连接
  websocketService.disconnect()
})

// WebSocket事件处理函数
const handleDeviceStatusUpdate = (data) => {
  console.log('收到设备状态更新:', data)
  // 查找对应的设备并更新状态
  const device = lightingDevices.value.find(d => d.deviceId === data.deviceId)
  if (device) {
    // 更新设备在线状态
    if (data.isOnline !== undefined) {
      device.isOnline = data.isOnline
    }
    // 更新电量信息
    if (data.battery !== undefined) {
      device.battery = data.battery
    }
    // 更新开关状态
    if (data.switchStates) {
      device.switchStates = { ...device.switchStates, ...data.switchStates }
    }
  }
}

const handleDeviceOffline = (data) => {
  console.log('设备离线:', data)
  const device = lightingDevices.value.find(d => d.deviceId === data.deviceId)
  if (device) {
    device.isOnline = false
  }
}

const handleDeviceOnline = (data) => {
  console.log('设备上线:', data)
  const device = lightingDevices.value.find(d => d.deviceId === data.deviceId)
  if (device) {
    device.isOnline = true
  }
}

const handleLightingSwitchStatus = (data) => {
  console.log('收到照明开关状态更新:', data)
  const device = lightingDevices.value.find(d => d.deviceId === data.deviceId)
  if (device && data.switchStates) {
    // 更新开关状态，这将自动触发UI更新
    device.switchStates = { ...device.switchStates, ...data.switchStates }
    console.log('设备开关状态已更新:', device.deviceId, device.switchStates)
  }
}

const handleLightingElectricalData = (data) => {
  const imei = data?.imei || data?.device_id_value
  const device = lightingDevices.value.find(item => item.deviceId === imei)
  const electrical = data?.electricalData
  if (!device || !electrical) return

  for (const field of ['voltage', 'current', 'power', 'energy']) {
    const value = Number(electrical[field])
    if (Number.isFinite(value)) device[field] = value.toFixed(3)
  }
  deviceDataCache.delete(`device_${device.deviceId}`)
}

const handleCommunicationLog = async (data) => {
  console.log('收到communication_log消息:', data)
  
  try {
    // 检查消息格式 - 根据实际WebSocket消息结构
    if (!data || !data.payload) {
      console.warn('communication_log消息格式不正确，缺少payload:', data)
      return
    }

    // 获取设备标识信息 - 修正：使用imei进行设备匹配
    const deviceId = data.deviceId || data.device_id  // UUID格式的设备ID
    const imei = data.imei  // IMEI格式，用于设备匹配
    
    console.log('WebSocket消息设备信息:', { deviceId, imei })
    
    if (!imei) {
      console.warn('communication_log消息中缺少imei:', data)
      return
    }
    
    // 使用imei查找对应的设备（设备列表中的deviceId实际是IMEI格式）
    const device = lightingDevices.value.find(d => d.deviceId === imei)
    
    if (!device) {
      console.warn('未找到对应设备 IMEI:', imei, '当前设备列表:', lightingDevices.value.map(d => d.deviceId))
      return
    }

    console.log(`找到设备: ${device.name} (IMEI: ${imei}, UUID: ${deviceId})，处理payload:`, data.payload)

    // 直接处理payload内容 - 移除不存在的messageType检查
    const payload = data.payload
    
    if (payload && payload.type === 'statistic') {
      // 对于statistic类型的消息，设备可能已经上报了最新状态
      console.log('收到statistic命令日志:', imei)
      
      try {
        // 延迟一段时间后仅从后端拉取最新数据，不再主动向设备发送指令，避免死循环
        setTimeout(async () => {
          console.log('从后端获取最新设备状态:', imei)
          try {
            const deviceData = await getLatestDeviceData(device.deviceId)
            if (deviceData) {
              device.voltage = deviceData.voltage
              device.current = deviceData.current
              device.power = deviceData.power
              device.energy = deviceData.energy
            }
          } catch (e) {
            console.error('静默刷新电量数据失败:', e)
          }
        }, 1000) // 1秒延迟
        
      } catch (error) {
        console.error('刷新设备状态失败:', imei, error)
      }
      
    } else if (payload && payload.type === 'event') {
      // 对于event类型的消息，直接更新开关状态
      console.log('收到event命令，直接更新开关状态:', payload)
      
      const newSwitchStates = {}
      
      if (payload.key1 !== undefined) {
        newSwitchStates.key1 = payload.key1 === 1
      }
      if (payload.key2 !== undefined) {
        newSwitchStates.key2 = payload.key2 === 1
      }
      if (payload.key3 !== undefined) {
        newSwitchStates.key3 = payload.key3 === 1
      }
      
      // 更新设备的开关状态
      if (Object.keys(newSwitchStates).length > 0) {
        device.switchStates = { ...device.switchStates, ...newSwitchStates }
        console.log('通过communication_log更新设备开关状态:', device.deviceId, device.switchStates)
      }
      
    } else {
      console.log('未处理的payload类型或内容:', payload)
      // 对于其他类型的消息，仅打印日志，不再主动触发设备状态刷新(下发指令)，以避免死循环
    }
    
  } catch (error) {
    console.error('处理communication_log消息时发生错误:', error, data)
  }
}

const handleSceneUpdate = (data) => {
  console.log('情景模式更新:', data)
  // 重新加载情景模式列表以获取最新数据
  loadCustomScenes()
}

// 情景模式相关方法
const loadCustomScenes = async () => {
  try {
    const result = await lightingScenesAPI.getScenes()
    if (result.success && result.data) {
      customScenes.value = result.data.map(scene => ({
        id: scene.id,
        name: scene.scene_name,
        description: scene.scene_description,
        devices: scene.devices_config || [],
        enableTimer: scene.enable_timer,
        startTime: scene.start_time,
        endTime: scene.end_time,
        repeatDays: Array.isArray(scene.repeat_days) ? scene.repeat_days : (scene.repeat_days ? scene.repeat_days.split(',') : []),
        loading: false
      }))
    }
  } catch (error) {
    console.error('加载自定义情景模式失败:', error)
    ElMessage.error('加载自定义情景模式失败')
  }
}

const saveCustomScenes = async () => {
  // 这个函数现在不再需要，因为每个操作都直接调用API
  // 保留为空函数以避免破坏现有调用
}

const executePresetScene = async (scene) => {
  scene.loading = true
  try {
    switch (scene.id) {
      case 'all_on':
        await executeAllOn()
        break
      case 'all_off':
        await executeAllOff()
        break
    }
    ElMessage.success(`${scene.name}已执行`)
    // 等待3秒让设备有时间处理指令并更新状态
    console.log('预设情景模式执行成功，等待3秒后刷新设备状态')
    setTimeout(async () => {
      await loadDevices()
      console.log('设备状态已刷新')
    }, 3000)
  } catch (error) {
    ElMessage.error(`执行${scene.name}失败: ${error.message}`)
  } finally {
    scene.loading = false
  }
}

const executeAllOn = async () => {
  for (const device of lightingDevices.value) {
    try {
      if (device.type === 'single') {
        await lightingControlAPI.controlDevice(device.deviceId, { type: 'event', key2: 1 })
      } else if (device.type === 'double') {
        await lightingControlAPI.controlDevice(device.deviceId, { type: 'event', key1: 1, key3: 1 })
      } else if (device.type === 'triple') {
        await lightingControlAPI.controlDevice(device.deviceId, { type: 'event', key1: 1, key2: 1, key3: 1 })
      }
    } catch (error) {
      console.error(`控制设备 ${device.deviceId} 失败:`, error)
    }
  }
}

const executeAllOff = async () => {
  for (const device of lightingDevices.value) {
    try {
      if (device.type === 'single') {
        await lightingControlAPI.controlDevice(device.deviceId, { type: 'event', key2: 0 })
      } else if (device.type === 'double') {
        await lightingControlAPI.controlDevice(device.deviceId, { type: 'event', key1: 0, key3: 0 })
      } else if (device.type === 'triple') {
        await lightingControlAPI.controlDevice(device.deviceId, { type: 'event', key1: 0, key2: 0, key3: 0 })
      }
    } catch (error) {
      console.error(`控制设备 ${device.deviceId} 失败:`, error)
    }
  }
}



const executeCustomScene = async (scene) => {
  scene.loading = true
  try {
    const result = await lightingScenesAPI.executeScene(scene.id)
    if (result.success) {
      ElMessage.success(`${scene.name}已执行`)
      // 等待3秒让设备有时间处理指令并更新状态
      console.log('情景模式执行成功，等待3秒后刷新设备状态')
      setTimeout(async () => {
        await loadDevices()
        console.log('设备状态已刷新')
      }, 3000)
    } else {
      ElMessage.error(result.message || `执行${scene.name}失败`)
    }
  } catch (error) {
    console.error('执行情景模式失败:', error)
    ElMessage.error(`执行${scene.name}失败: ${error.message}`)
  } finally {
    scene.loading = false
  }
}

const applyCustomScene = (scene) => {
  executeCustomScene(scene)
}

const openCreateCustomScene = () => {
  editingScene.value = null
  customSceneForm.value = {
    name: '',
    description: '',
    devices: [],
    enableTimer: false,
    startTime: '',
    endTime: '',
    repeatDays: []
  }
  // 初始化设备配置
  lightingDevices.value.forEach(device => {
    device.selected = false
    device.sceneConfig = getDefaultSwitches(device.type)
  })
  
  // 确保使用未过滤的完整设备列表
  searchKeyword.value = ''
  selectedTenant.value = ''
  selectedBuilding.value = ''
  selectedProjectGroup.value = ''
  selectedStatus.value = ''
  filterDevices()
  
  showCreateCustomScene.value = true
}

const editCustomScene = (scene) => {
  editingScene.value = scene
  customSceneForm.value = {
    name: scene.name,
    description: scene.description,
    devices: [...scene.devices],
    enableTimer: scene.enableTimer || false,
    startTime: scene.startTime || '',
    endTime: scene.endTime || '',
    repeatDays: scene.repeatDays || []
  }
  // 恢复设备选择状态
  lightingDevices.value.forEach(device => {
    const sceneDevice = scene.devices.find(d => d.deviceId === device.deviceId)
    if (sceneDevice) {
      device.selected = true
      device.sceneConfig = { ...sceneDevice.config }
    } else {
      device.selected = false
      device.sceneConfig = getDefaultSwitches(device.type)
    }
  })
  showCreateCustomScene.value = true
}

const getDefaultSwitches = (deviceType) => {
  switch (deviceType) {
    case 'single':
      return { key2: 0 }
    case 'double':
      return { key1: 0, key3: 0 }
    case 'triple':
      return { key1: 0, key2: 0, key3: 0 }
    default:
      return {}
  }
}

const toggleDeviceSelection = (device) => {
  // 确保场景配置存在
  if (!device.sceneConfig) {
    device.sceneConfig = getDefaultSwitches(device.type)
  }
}

const saveCustomScene = async () => {
  if (!customSceneForm.value.name.trim()) {
    ElMessage.warning('请输入情景名称')
    return
  }
  
  // 验证定时设置
  if (customSceneForm.value.enableTimer) {
    if (!customSceneForm.value.endTime) {
      ElMessage.warning('启用定时时，关闭时间是必选项')
      return
    }
    if (customSceneForm.value.repeatDays.length === 0) {
      ElMessage.warning('请选择重复日期')
      return
    }
  }
  
  // 收集选中的设备配置
  const selectedDevices = lightingDevices.value
    .filter(device => device.selected)
    .map(device => ({
      deviceId: device.deviceId,
      name: device.name,
      type: device.type,
      config: { ...device.sceneConfig }
    }))
  
  if (selectedDevices.length === 0) {
    ElMessage.warning('请至少选择一个设备')
    return
  }
  
  const sceneData = {
    scene_name: customSceneForm.value.name,
    scene_description: customSceneForm.value.description,
    devices_config: selectedDevices,
    enable_timer: customSceneForm.value.enableTimer,
    start_time: customSceneForm.value.startTime || null,
    end_time: customSceneForm.value.endTime || null,
    repeat_days: customSceneForm.value.repeatDays.length > 0 ? customSceneForm.value.repeatDays : null
  }
  
  try {
    let result
    if (editingScene.value) {
      // 更新现有情景模式
      result = await lightingScenesAPI.updateScene(editingScene.value.id, sceneData)
    } else {
      // 创建新情景模式
      result = await lightingScenesAPI.createScene(sceneData)
    }
    
    if (result.success) {
      showCreateCustomScene.value = false
      ElMessage.success(editingScene.value ? '情景模式已更新' : '情景模式已创建')
      // 重新加载情景模式列表
      await loadCustomScenes()
    } else {
      ElMessage.error(result.message || '保存情景模式失败')
    }
  } catch (error) {
    console.error('保存情景模式失败:', error)
    ElMessage.error('保存情景模式失败')
  }
}

const deleteCustomScene = async (scene) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除情景模式 "${scene.name}" 吗？`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    console.log('开始删除情景模式:', scene.id, scene.name)
    const result = await lightingScenesAPI.deleteScene(scene.id)
    console.log('删除API响应:', result)
    
    // 检查HTTP状态码和success字段
    if (result.success && (result.httpOk || result.httpStatus === 200)) {
      ElMessage.success('情景模式已删除')
      console.log('删除成功，立即更新前端列表并重新加载')
      
      // 立即从前端列表中移除已删除的项目
      const index = customScenes.value.findIndex(s => s.id === scene.id)
      if (index > -1) {
        customScenes.value.splice(index, 1)
      }
      
      // 清除相关缓存
      const apiCache = (await import('@/utils/cache')).default
      apiCache.clear('/lighting-scenes')
      
      // 重新加载情景模式列表以确保数据同步
      await loadCustomScenes()
    } else {
      const errorMsg = result.message || `删除失败 (HTTP ${result.httpStatus || 'Unknown'})`
      console.error('删除失败:', errorMsg, result)
      ElMessage.error(errorMsg)
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除情景模式失败:', error)
      ElMessage.error(`删除情景模式失败: ${error.message || error}`)
    }
    // 用户取消删除时error为'cancel'，不需要处理
  }
}

const cancelCustomScene = () => {
  showCreateCustomScene.value = false
  editingScene.value = null
  // 重置设备选择状态
  lightingDevices.value.forEach(device => {
    device.selected = false
    device.sceneConfig = getDefaultSwitches(device.type)
  })
}

const formatRepeatDays = (days) => {
  const dayNames = {
    '0': '周日',
    '1': '周一',
    '2': '周二',
    '3': '周三',
    '4': '周四',
    '5': '周五',
    '6': '周六'
  }
  return days.map(day => dayNames[day]).join('、')
}

const getIconComponent = (iconName) => {
  const iconMap = {
    'Sunny': Sunny,
    'Moon': Moon,
    'House': House,
    'Coffee': Coffee,
    'Reading': Reading
  }
  return iconMap[iconName] || Sunny
}
</script>

<style scoped>
/* 过滤区域的样式 */
.filter-section {
  margin-bottom: 20px;
  
  @media (max-width: 768px) {
    margin-bottom: 15px;
  }
}

.filter-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  
  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
}

.search-input {
  flex: 1;
  max-width: 300px;
  
  @media (max-width: 768px) {
    max-width: 100%;
  }
}

.filter-controls {
  display: flex;
  gap: 10px;
  
  @media (max-width: 768px) {
    flex-wrap: wrap;
    justify-content: space-between;
  }
}

.filter-select {
  width: 150px;
  
  @media (max-width: 768px) {
    width: calc(50% - 5px);
  }
  
  @media (max-width: 480px) {
    width: 100%;
  }
}

.stats-info {
  display: flex;
  gap: 15px;
  
  @media (max-width: 768px) {
    width: 100%;
    justify-content: space-between;
  }
}

.lighting-control {
  padding: 20px;
  
  @media (max-width: 768px) {
    padding: 15px 10px;
  }
  
  @media (max-width: 480px) {
    padding: 10px 5px;
  }
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  
  @media (max-width: 768px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
}

.page-header h2 {
  margin: 0;
  color: #303133;
}

.header-actions {
  display: flex;
  gap: 10px;
  
  @media (max-width: 768px) {
    width: 100%;
    justify-content: space-between;
  }
  
  @media (max-width: 480px) {
    flex-wrap: wrap;
    gap: 5px;
  }
}

.device-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(245px, 1fr));
  gap: 15px;
  
  @media (max-width: 768px) {
    grid-template-columns: repeat(auto-fill, minmax(100%, 1fr));
    gap: 10px;
  }
  
  @media (max-width: 480px) {
    display: flex;
    flex-direction: column;
  }
}

.device-card {
  border-radius: 16px;
  background: linear-gradient(145deg, #ffffff 0%, #f8fafc 100%);
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  position: relative;
}

.device-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.device-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1);
}

.device-card:hover::before {
  opacity: 1;
}

.device-card.compact {
  min-height: 350px; /* 压缩高度，使三开与双开保持一致 */
  
  @media (max-width: 768px) {
    min-height: auto;
  }
}

.device-card.compact .el-card__body {
  padding: 20px;
  background: transparent;
}

.device-card.compact .device-name {
  font-size: 14px;
  margin-bottom: 8px;
}

.device-card.compact .device-group {
  font-size: 12px;
  color: #909399;
  margin-bottom: 10px;
}

.device-card.compact .power-info {
  margin: 10px 0;
}

.device-card.compact .power-item {
  margin-bottom: 6px;
  padding: 3px 0;
}

.device-card.compact .power-item .label {
  font-size: 12px;
}

.device-card.compact .power-item .value {
  font-size: 12px;
}

.device-card.compact .light-status-display {
  margin: 10px 0;
  padding: 10px;
}

.device-card.compact .light-bulbs {
  gap: 15px;
}

.device-card.compact .bulb-icon {
  width: 32px;
  height: 32px;
}

.device-card.compact .bulb-svg {
  width: 20px;
  height: 20px;
}

.device-card.compact .light-label {
  font-size: 11px;
}

.device-card.compact .switch-controls {
  margin: 10px 0;
}

.device-card.compact .switch-item {
  padding: 6px 10px;
}

.device-card.compact .switch-label {
  font-size: 12px;
}

.device-card.compact .switch-buttons .el-button {
  padding: 2px 8px;
  font-size: 11px;
  min-width: 40px;
}

.device-card.compact .action-buttons {
  margin-top: 10px;
  padding-top: 10px;
}

.device-card.compact .action-buttons .el-button {
  padding: 6px 12px;
  font-size: 12px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.6);
  
  @media (max-width: 768px) {
    margin-bottom: 12px;
    padding-bottom: 8px;
  }
}

.header-left {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.loading-icon {
  color: #409eff;
  font-size: 16px;
}

.loading-icon.is-loading {
  animation: rotating 2s linear infinite;
}

@keyframes rotating {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.delete-btn {
  width: 17px;
  height: 17px;
  min-height: 17px;
  padding: 0;
  border: none;
  background: linear-gradient(135deg, #9ca3af 0%, #6b7280 100%);
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(156, 163, 175, 0.3);
  transition: all 0.2s ease;
  color: white;
  opacity: 0;
  visibility: hidden;
}

.device-card:hover .delete-btn {
  opacity: 1;
  visibility: visible;
}

.delete-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(156, 163, 175, 0.4);
  background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);
}

.delete-btn .el-icon {
  font-size: 10px;
}

.device-name {
  font-weight: 600;
  font-size: 18px;
  color: #1a202c;
  margin-bottom: 4px;
  letter-spacing: -0.025em;
}

.device-group {
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
  margin-bottom: 16px;
}

.power-info {
  margin: 20px 0;
  padding: 16px;
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  border-radius: 12px;
  border: 1px solid rgba(226, 232, 240, 0.6);
}

.power-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 8px;
  border: 1px solid rgba(226, 232, 240, 0.4);
  transition: all 0.2s ease;
}

.power-item:hover {
  background: rgba(255, 255, 255, 0.9);
  transform: translateX(2px);
}

.power-item:last-child {
  margin-bottom: 0;
}

.power-item .label {
  color: #64748b;
  font-size: 14px;
  font-weight: 500;
}

.power-item .value {
  font-weight: 600;
  color: #3b82f6;
  font-size: 14px;
}

/* 灯泡状态显示样式 */
.light-status-display {
  margin: 5px 15px 20px 15px;
  padding: 26px;
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
  border-radius: 21px;
  border: 1px solid rgba(226, 232, 240, 0.6);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.05);
  transform: scale(1.3) translateY(-10px);
  
  @media (max-width: 768px) {
    transform: scale(1) translateY(0);
    padding: 15px;
    margin: 5px 0 15px 0;
    width: 100%;
    box-sizing: border-box;
  }
}

.light-bulbs {
  display: flex;
  justify-content: center;
  gap: 42px;
  flex-wrap: wrap;
  
  @media (max-width: 768px) {
    gap: 20px;
  }
  
  @media (max-width: 480px) {
    gap: 15px;
  }
}

.light-bulb {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  transition: all 0.3s ease;
}

.bulb-icon {
  width: 104px;
  height: 104px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  border: 2px solid rgba(226, 232, 240, 0.6);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  
  @media (max-width: 768px) {
    width: 80px;
    height: 80px;
  }
  
  @media (max-width: 480px) {
    width: 60px;
    height: 60px;
  }
}

.bulb-svg {
  width: 58px;
  height: 58px;
  fill: #909399;
  transition: all 0.3s ease;
  
  @media (max-width: 768px) {
    width: 45px;
    height: 45px;
  }
  
  @media (max-width: 480px) {
    width: 35px;
    height: 35px;
  }
}

.light-bulb.light-on .bulb-icon {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.25) 100%);
  border-color: rgba(34, 197, 94, 0.4);
  box-shadow: 0 4px 20px rgba(34, 197, 94, 0.3), 0 0 15px rgba(34, 197, 94, 0.4);
  animation: glow 2s ease-in-out infinite alternate;
}

.light-bulb.light-on .bulb-svg {
  fill: #22c55e;
  filter: drop-shadow(0 0 5px rgba(34, 197, 94, 0.6));
}

@keyframes glow {
  from {
    box-shadow: 0 4px 20px rgba(34, 197, 94, 0.3), 0 0 15px rgba(34, 197, 94, 0.4);
  }
  to {
    box-shadow: 0 6px 30px rgba(34, 197, 94, 0.5), 0 0 25px rgba(34, 197, 94, 0.6);
  }
}

.light-label {
  font-size: 13px;
  color: #64748b;
  font-weight: 600;
  text-align: center;
  letter-spacing: 0.025em;
}

.light-bulb.light-on .light-label {
  color: #16a34a;
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(34, 197, 94, 0.2);
}

/* 开关控制样式 */
.switch-controls {
  margin: 20px 0;
  display: flex;
  justify-content: center;
}

.device-control-item .switch-controls {
  margin: 10px 0;
  justify-content: flex-start;
}

.switch-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 300px;
}

.switch-item {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 12px 16px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border-radius: 12px;
  border: 1px solid rgba(226, 232, 240, 0.6);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 0.2s ease;
  gap: 20px;
}

.switch-item:hover {
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.switch-item.all-switch {
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  border-color: rgba(59, 130, 246, 0.3);
}

.switch-item.all-switch:hover {
  background: linear-gradient(135deg, #bfdbfe 0%, #93c5fd 100%);
}

.switch-label {
  font-size: 15px;
  color: #374151;
  font-weight: 600;
  min-width: 60px;
  text-align: center;
  letter-spacing: 0.025em;
  flex-shrink: 0;
}

.switch-buttons {
  display: flex;
  gap: 8px;
}

.switch-buttons .el-button {
  padding: 6px 16px;
  font-size: 13px;
  min-width: 56px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.switch-buttons .el-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

/* 滑动开关样式 */
.switch-toggle-container {
  position: relative;
  width: 50px;
  height: 24px;
  background-color: #dcdfe6;
  border-radius: 12px;
  cursor: pointer;
  transition: background-color 0.3s ease;
  display: inline-block;
}

.switch-toggle-container.active {
  background-color: #67c23a;
}

.switch-toggle {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background-color: white;
  border-radius: 50%;
  transition: transform 0.3s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.switch-toggle-container.active .switch-toggle {
  transform: translateX(26px);
}

/* 操作按钮样式 */
.action-buttons {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid rgba(226, 232, 240, 0.6);
}

.action-buttons .el-button {
  flex: 1;
  min-width: 80px;
  border-radius: 10px;
  font-weight: 600;
  padding: 10px 16px;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.action-buttons .el-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
}

.detail-info {
  margin-bottom: 20px;
}

.detail-info h3 {
  margin-bottom: 15px;
  color: #303133;
}

/* 详情页面电量信息样式 */
.power-info-detail {
  margin-bottom: 20px;
}

.power-info-detail h3 {
  margin-bottom: 15px;
  color: #303133;
}

.power-value {
  font-weight: bold;
  color: #409eff;
  font-size: 16px;
}

/* 详情页面开关控制样式 */
.switch-control-detail {
  margin-bottom: 20px;
}

.switch-control-detail h3 {
  margin-bottom: 15px;
  color: #303133;
}

.switch-controls-detail {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.switch-group-detail {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.switch-item-detail {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: white;
  border-radius: 6px;
  border: 1px solid #dee2e6;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.switch-item-detail.all-switch {
  background: #e8f4fd;
  border-color: #b3d9f2;
}

.switch-label-detail {
  font-size: 16px;
  color: #495057;
  font-weight: 600;
  min-width: 80px;
}

.switch-buttons-detail {
  display: flex;
  gap: 10px;
}

.switch-buttons-detail .el-button {
  padding: 8px 20px;
  font-size: 14px;
  min-width: 80px;
  font-weight: 500;
}

.chart-section {
  margin-top: 20px;
}

.chart-section h3 {
  margin-bottom: 15px;
  color: #303133;
}

.chart-controls {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
  align-items: center;
  flex-wrap: wrap;
}

.quick-date-buttons {
  display: flex;
  gap: 8px;
  margin-right: 15px;
}

.quick-date-buttons .el-button {
  padding: 5px 12px;
  font-size: 12px;
}

.chart-container {
  width: 100%;
  height: 400px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
}

/* 总耗电量显示样式 */
.total-energy-display {
  margin: 20px 0;
  display: flex;
  justify-content: center;
}

.total-energy-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20px 30px;
  border-radius: 12px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: 15px;
  min-width: 300px;
  justify-content: center;
}

.total-energy-label {
  font-size: 16px;
  font-weight: 500;
  opacity: 0.9;
}

.total-energy-value {
  font-size: 24px;
  font-weight: bold;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* 添加设备对话框样式 */
.add-device-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.search-section {
  margin-bottom: 10px;
}

.device-list-section {
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  overflow: hidden;
}

.config-section {
  border-top: 1px solid #e4e7ed;
  padding-top: 20px;
}

.config-section h4 {
  margin: 0 0 15px 0;
  color: #303133;
  font-size: 16px;
}

.device-config {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 6px;
  margin-bottom: 10px;
}

.device-config:last-child {
  margin-bottom: 0;
}

.device-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.device-info .device-name {
  font-weight: 600;
  color: #303133;
}

.device-imei {
  color: #909399;
  font-size: 12px;
}

.device-config .el-form-item {
  margin-bottom: 0;
  min-width: 150px;
}

/* 情景模式对话框样式 */
.scene-mode-dialog {
  max-width: 800px;
}

.scene-section {
  margin-bottom: 30px;
}

.scene-section h3 {
  margin: 0 0 15px 0;
  color: #303133;
  font-size: 18px;
  font-weight: 600;
}

/* 预设情景模式行布局 */
.preset-scenes-row {
  display: flex;
  gap: 20px;
  justify-content: center;
  margin-bottom: 30px;
}

.preset-scene-btn {
  flex: 1;
  max-width: 200px;
  height: 60px;
  font-size: 16px;
  font-weight: 600;
}

.preset-scene-btn .el-icon {
  margin-right: 8px;
}

.preset-scenes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 15px;
  margin-bottom: 20px;
}

.scene-card {
  border: 2px solid #e4e7ed;
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background: #fff;
}

.scene-card:hover {
  border-color: #409eff;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.15);
  transform: translateY(-2px);
}

.scene-card.loading {
  opacity: 0.7;
  cursor: not-allowed;
}

.scene-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 12px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: white;
}

.scene-name {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}

.scene-description {
  font-size: 14px;
  color: #606266;
  line-height: 1.4;
}

.custom-scenes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 15px;
}

.custom-scene-card {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 16px;
  background: #fff;
  transition: all 0.3s ease;
}

.custom-scene-card:hover {
  border-color: #409eff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.1);
}

.custom-scene-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.custom-scene-info h4 {
  margin: 0 0 4px 0;
  font-size: 16px;
  color: #303133;
}

.custom-scene-info p {
  margin: 0;
  font-size: 14px;
  color: #606266;
}

.custom-scene-actions {
  display: flex;
  gap: 8px;
}

.custom-scene-execute {
  width: 100%;
  margin-top: 12px;
}

/* 分页容器样式 */
.pagination-container {
  display: flex;
  justify-content: center;
  margin-top: 20px;
  padding: 20px 0;
}

.device-pagination {
  margin-bottom: 8px;
}

@media (max-width: 768px) {
  .device-pagination {
    justify-content: flex-start;
    overflow-x: auto;
    padding: 14px 0 18px;
  }
}

/* 空状态样式 */
.empty-scenes {
  text-align: center;
  padding: 40px 20px;
}

.device-control-list {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 10px;
}

.device-control-item {
  margin-bottom: 15px;
  padding-bottom: 15px;
  border-bottom: 1px solid #ebeef5;
}

.device-control-item:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.create-scene-form {
  max-height: 60vh;
  overflow-y: auto;
}

.device-switch-config {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  background: #fafafa;
}

.device-switch-config:last-child {
  margin-bottom: 0;
}

.device-switch-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.device-switch-name {
  font-weight: 600;
  color: #303133;
}

.device-switch-type {
  font-size: 12px;
  color: #909399;
  background: #f0f0f0;
  padding: 2px 8px;
  border-radius: 4px;
}

.switch-controls {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.switch-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.switch-label {
  font-size: 14px;
  color: #606266;
  min-width: 60px;
}

@media (max-width: 768px) {
  .device-grid {
    grid-template-columns: 1fr;
  }
  
  .control-buttons {
    flex-direction: column;
  }
  
  .control-buttons .el-button {
    flex: none;
  }
  
  .chart-controls {
    flex-direction: column;
    align-items: stretch;
  }
  
  .device-config {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  
  .device-info {
    justify-content: flex-start;
  }
  
  .preset-scenes {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }
  
  .custom-scenes {
    grid-template-columns: 1fr;
  }
  
  .switch-controls {
    flex-direction: column;
    align-items: stretch;
  }
}

/* 搜索过滤区域样式 */
.filter-section {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  border: 1px solid #e9ecef;
}

.filter-row {
  display: flex;
  gap: 15px;
  align-items: center;
  flex-wrap: wrap;
}

.search-input {
  flex: 1;
  min-width: 200px;
}

.filter-controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.filter-controls .el-select {
  min-width: 120px;
}

.stats-info {
  display: flex;
  gap: 20px;
  align-items: center;
  margin-left: auto;
  font-size: 14px;
  color: #666;
  white-space: nowrap;
}

.device-count, .online-count {
  font-weight: 500;
}

.online-count {
  color: #67c23a;
}

.search-filter-section {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  border: 1px solid #e9ecef;
}

.search-filter-row {
  display: flex;
  gap: 15px;
  align-items: center;
  flex-wrap: wrap;
}

.search-filter-row .el-input {
  min-width: 200px;
}

.search-filter-row .el-select {
  min-width: 150px;
}

.device-stats {
  display: flex;
  gap: 20px;
  align-items: center;
  margin-left: auto;
  font-size: 14px;
  color: #666;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 5px;
}

.stat-number {
  font-weight: bold;
  color: #409eff;
}

@media (max-width: 768px) {
  .filter-row {
    flex-direction: column;
    align-items: stretch;
    gap: 15px;
  }
  
  .search-input {
    min-width: auto;
    width: 100%;
  }
  
  .filter-controls {
    justify-content: center;
    flex-wrap: wrap;
  }
  
  .filter-controls .el-select {
    min-width: auto;
    width: 120px;
  }
  
  .stats-info {
    margin-left: 0;
    justify-content: center;
    margin-top: 10px;
  }
  
  .search-filter-row {
    flex-direction: column;
    align-items: stretch;
  }
  
  .search-filter-row .el-input,
  .search-filter-row .el-select {
    min-width: auto;
    width: 100%;
  }
  
  .device-stats {
    margin-left: 0;
    justify-content: center;
  }
  
  .add-group-form {
    flex-direction: column;
  }
  
  .device-assignment-item {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  
  /* 设备详情对话框响应式样式 */
  .device-detail-dialog .el-dialog {
    width: 95% !important;
    margin: 10px auto !important;
  }
  
  /* 图表控制区域响应式样式 */
  .chart-controls {
    flex-direction: column;
    align-items: stretch;
  }
  
  .chart-type-selector {
    margin-bottom: 10px;
    display: flex;
    justify-content: center;
  }
  
  .chart-type-selector .el-radio-group {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
  }
  
  .chart-controls .el-date-picker {
    width: 100% !important;
    margin-bottom: 10px;
  }
  
  .quick-date-buttons {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    margin-left: 0 !important;
  }
  
  .quick-date-buttons .el-button {
    margin: 5px;
    flex: 1;
  }
  
  .chart-container {
    height: 300px !important;
  }
  
  .total-energy-display {
    justify-content: center !important;
  }
  
  .total-energy-card {
    width: 100%;
    text-align: center;
  }
}

/* 定时器设置样式 */
.timer-settings {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 20px;
  margin: 15px 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.timer-settings .el-form-item {
  margin-bottom: 20px;
}

.timer-settings .el-form-item__label {
  font-weight: 600;
  color: #374151;
}

.timer-settings .el-time-picker {
  width: 100%;
}

.timer-settings .el-checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
}

.timer-settings .el-checkbox {
  margin-right: 0;
}

.timer-settings .el-checkbox__label {
  font-weight: 500;
  color: #4b5563;
}

/* 自定义情景模式卡片显示定时信息 */
.custom-scene-card .scene-timer-info {
  margin-top: 8px;
  padding: 8px 12px;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 6px;
  font-size: 12px;
  color: #0369a1;
}

.custom-scene-card .scene-timer-info .timer-icon {
  margin-right: 4px;
}

/* Unified control-console appearance */
.lighting-control {
  padding: 0;
  color: var(--text-primary);
}

.page-header {
  min-height: 42px;
  margin-bottom: 16px;
}

.page-header h2 {
  color: var(--text-primary);
  font-size: 22px;
  font-weight: 650;
}

.header-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
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

.online-count {
  color: #16845b;
}

.device-grid {
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}

.device-card {
  border: 1px solid var(--border-light);
  border-top: 2px solid var(--border-color);
  border-radius: 6px;
  background: var(--surface-color);
  box-shadow: var(--shadow-sm);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.device-card::before {
  display: none;
}

.device-card:hover {
  transform: none;
  border-top-color: var(--primary-color);
  box-shadow: var(--shadow-md);
}

.device-card.compact {
  min-height: 330px;
}

.device-card.compact :deep(.el-card__body) {
  background: var(--surface-color);
}

.device-card.compact .device-group,
.light-label,
.switch-label {
  color: var(--text-secondary);
}

.device-name {
  color: var(--text-primary);
  font-weight: 600;
}

.light-status-display,
.switch-controls,
.power-info {
  border-color: var(--border-light);
  background: var(--fill-lighter);
}

.light-bulb {
  background: var(--surface-color);
  border-color: var(--border-color);
  box-shadow: none;
}

.light-bulb.light-on {
  background: rgba(234, 179, 8, 0.12);
  border-color: #d9a80d;
  box-shadow: none;
}

.light-bulb.light-on .bulb-svg {
  fill: #d9a80d;
}

.switch-group,
.switch-item,
.action-buttons,
.device-config,
.scene-card,
.timer-item {
  border-color: var(--border-light);
  background: var(--surface-color);
}

.action-buttons {
  border-top: 1px solid var(--border-light);
  padding-top: 12px;
}

:global(.dark) .lighting-control .topic-value,
:global(.dark) .lighting-control .log-data,
:global(.dark) .lighting-control .timer-settings,
:global(.dark) .lighting-control .scene-mode-card,
:global(.dark) .lighting-control .custom-scene-card {
  color: var(--text-primary);
  border-color: var(--border-light);
  background: var(--surface-color);
}

@media (max-width: 768px) {
  .lighting-control {
    padding: 0;
  }

  .page-header {
    align-items: stretch;
  }

  .header-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .header-actions :deep(.el-button) {
    width: 100%;
    margin-left: 0;
  }

  .filter-controls,
  .filter-select {
    width: 100%;
  }

  .device-grid {
    grid-template-columns: 1fr;
  }
}
</style>
