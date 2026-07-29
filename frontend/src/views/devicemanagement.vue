<template>
  <div class="device-management">
    <!-- 搜索和操作栏 -->
    <el-card class="search-card" shadow="never">
      <el-row :gutter="20">
        <el-col :span="4">
          <el-input
            v-model="searchForm.keyword"
            placeholder="请输入设备名称、设备ID或IMEI"
            clearable
            @keyup.enter="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </el-col>
        <el-col :span="4">
          <el-select
            v-model="searchForm.status"
            placeholder="设备状态"
            clearable
          >
            <el-option label="在线" value="online" />
            <el-option label="离线" value="offline" />
            <el-option label="故障" value="error" />
          </el-select>
        </el-col>
        <el-col :span="4">
          <el-select v-model="searchForm.type" placeholder="设备类型" clearable>
            <el-option
              v-for="deviceType in deviceTypeOptions"
              :key="deviceType.id"
              :label="deviceType.name"
              :value="deviceType.id"
            />
          </el-select>
        </el-col>
        <el-col :span="4">
          <el-select
            v-model="searchForm.tenantId"
            placeholder="所属租户"
            clearable
          >
            <el-option
              v-for="tenant in tenantOptions"
              :key="tenant.id"
              :label="tenant.name"
              :value="tenant.id"
            />
          </el-select>
        </el-col>
        <el-col :span="8">
          <el-button type="primary" @click="handleImmediateSearch">
            <el-icon><Search /></el-icon>
            搜索
          </el-button>
          <el-button @click="resetSearch">
            <el-icon><Refresh /></el-icon>
            重置
          </el-button>
          <el-button type="primary" @click="showAddDialog">
            <el-icon><Plus /></el-icon>
            添加设备
          </el-button>
        </el-col>
      </el-row>
    </el-card>

    <!-- 设备列表 -->
    <el-card class="table-card" shadow="never">
      <div class="batch-toolbar">
        <div class="batch-toolbar__summary">
          <span>批量维护</span>
          <small>导出后可直接修改，再导入完成新增或更新</small>
        </div>
        <div class="batch-toolbar__actions">
          <el-button @click="downloadImportTemplate">
            <el-icon><Document /></el-icon>
            下载模板
          </el-button>
          <el-button type="primary" plain @click="openImportDialog">
            <el-icon><UploadFilled /></el-icon>
            导入设备
          </el-button>
          <el-button
            type="primary"
            :loading="exporting"
            @click="exportDevices"
          >
            <el-icon><Download /></el-icon>
            导出设备
          </el-button>
        </div>
      </div>

      <el-table
        :data="deviceList"
        v-loading="loading"
        stripe
        style="width: 100%"
        row-key="id"
      >
        <el-table-column prop="name" label="设备名称" width="200">
          <template #default="{ row }">
            <span class="device-name">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="imei" label="设备ID / IMEI" width="180" />
        <el-table-column prop="tenantName" label="所属租户" width="150" />
        <el-table-column
          prop="projectBuildingName"
          label="所属建筑"
          width="150"
        >
          <template #default="{ row }">{{
            row.projectBuildingName || "-"
          }}</template>
        </el-table-column>
        <el-table-column prop="projectGroupName" label="所属分组" width="150">
          <template #default="{ row }">{{
            row.projectGroupName || "-"
          }}</template>
        </el-table-column>
        <el-table-column prop="type" label="设备类型" width="120">
          <template #default="{ row }">
            <el-tag type="primary">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="设备分类" width="100">
          <template #default="{ row }">
            <el-tag :type="getCategoryTagType(row.device_category)">
              {{ getCategoryLabel(row.device_category) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="层级关系" width="200">
          <template #default="{ row }">
            <!-- 网关设备显示子设备数量 -->
            <span v-if="row.device_category === 'gateway'" class="gateway-info">
              <el-icon><Connection /></el-icon>
              网关 ({{ getChildrenCount(row) }}个子设备)
            </span>
            <!-- 子设备显示父设备名称和序列号 -->
            <span
              v-else-if="
                row.device_category === 'sub_device' && row.parent_device_name
              "
              class="parent-device"
            >
              <el-icon><ArrowUp /></el-icon>
              {{ row.parent_device_name }}
              <el-tag
                v-if="row.sub_device_sequence"
                size="small"
                type="primary"
                style="margin-left: 8px"
              >
                #{{ row.sub_device_sequence }}
              </el-tag>
            </span>
            <!-- 独立设备 -->
            <span
              v-else-if="row.device_category === 'standalone'"
              class="standalone-device"
            >
              <el-icon><Monitor /></el-icon>
              独立设备
            </span>
            <!-- 其他情况 -->
            <span v-else class="no-parent">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="设备状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusTagType(row.status)">{{
              getStatusLabel(row.status)
            }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="location" label="位置信息" width="200" />
        <el-table-column prop="lastOnline" label="最后在线时间" width="180" />
        <el-table-column prop="createTime" label="创建时间" width="180" />
        <el-table-column label="操作" width="225" fixed="right">
          <template #default="{ row }">
            <div class="action-buttons">
              <el-button
                type="primary"
                size="small"
                circle
                @click="editDevice(row)"
                title="编辑"
              >
                <el-icon><Edit /></el-icon>
              </el-button>
              <el-button
                type="info"
                size="small"
                circle
                @click="viewDeviceLogs(row)"
                title="日志"
              >
                <el-icon><Document /></el-icon>
              </el-button>
              <el-button
                type="warning"
                size="small"
                circle
                @click="openDebugDialog(row)"
                title="调试"
              >
                <el-icon><Tools /></el-icon>
              </el-button>
              <el-button
                v-if="row.device_category === 'gateway'"
                type="success"
                size="small"
                circle
                @click="showAddSubDevice(row)"
                title="添加子设备"
              >
                <el-icon><Plus /></el-icon>
              </el-button>
              <el-button
                type="danger"
                size="small"
                circle
                @click="deleteDevice(row)"
                title="删除"
              >
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="pagination.currentPage"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <el-dialog
      v-model="importDialogVisible"
      title="批量导入设备"
      width="620px"
      @closed="resetImportDialog"
    >
      <div class="import-guide">
        <p>
          使用系统 ID、设备 ID 或 IMEI 匹配已有设备；匹配成功时更新，未匹配时新增。
        </p>
        <p>
          空白单元格不会覆盖已有内容，需要清除的选填字段请填写“【清空】”。
        </p>
      </div>

      <el-upload
        ref="importUploadRef"
        class="device-import-upload"
        drag
        :auto-upload="false"
        :limit="1"
        accept=".xlsx"
        :on-change="handleImportFileChange"
        :on-remove="handleImportFileRemove"
      >
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">
          将 Excel 文件拖到此处，或<em>点击选择</em>
        </div>
        <template #tip>
          <div class="el-upload__tip">仅支持 .xlsx，单次最多 5000 台设备</div>
        </template>
      </el-upload>

      <div v-if="importResult" class="import-result">
        <el-alert
          :type="importResult.failed ? 'warning' : 'success'"
          :closable="false"
          show-icon
          :title="`新增 ${importResult.created} 台，更新 ${importResult.updated} 台，失败 ${importResult.failed} 行`"
        />
        <el-table
          v-if="importResult.errors?.length"
          :data="importResult.errors"
          max-height="220"
          size="small"
        >
          <el-table-column prop="row" label="行号" width="72" />
          <el-table-column prop="device" label="设备" width="150" />
          <el-table-column prop="message" label="失败原因" min-width="260" />
        </el-table>
      </div>

      <template #footer>
        <el-button @click="downloadImportTemplate">下载模板</el-button>
        <el-button @click="importDialogVisible = false">关闭</el-button>
        <el-button
          type="primary"
          :loading="importing"
          :disabled="!importFile"
          @click="submitDeviceImport"
        >
          开始导入
        </el-button>
      </template>
    </el-dialog>

    <!-- 添加/编辑设备对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="600px"
      @close="resetForm"
    >
      <el-form
        ref="formRef"
        :model="deviceForm"
        :rules="formRules"
        label-width="100px"
      >
        <el-form-item label="设备名称" prop="name">
          <el-input v-model="deviceForm.name" placeholder="请输入设备名称" />
        </el-form-item>
        <el-form-item label="设备ID/IMEI" prop="imei">
          <el-input
            v-model="deviceForm.imei"
            :placeholder="getImeiPlaceholder()"
            :loading="imeiValidating"
          >
            <template #suffix>
              <el-icon v-if="imeiValidating" class="is-loading">
                <Loading />
              </el-icon>
              <el-icon
                v-else-if="imeiValidationMessage.includes('格式正确')"
                style="color: #67c23a"
              >
                <Check />
              </el-icon>
              <el-icon
                v-else-if="imeiValidationMessage.includes('已存在')"
                style="color: #f56c6c"
              >
                <Close />
              </el-icon>
            </template>
          </el-input>
          <div
            v-if="imeiValidationMessage"
            :style="{
              color:
                imeiValidationMessage.includes('格式正确') ? '#67c23a' : '#f56c6c',
              fontSize: '12px',
              marginTop: '4px',
            }"
          >
            {{ imeiValidationMessage }}
          </div>
          <!-- 子设备标识帮助文本 -->
          <div
            v-if="deviceForm.device_category === 'sub_device'"
            style="font-size: 12px; color: #909399; margin-top: 4px"
          >
            <div>子设备ID/IMEI选项：</div>
            <div>• 留空：系统将自动生成虚拟标识（推荐）</div>
            <div>• 填写：使用设备ID或IMEI（需确保唯一性）</div>
            <div
              v-if="getSelectedParentDevice()"
              style="color: #409eff; margin-top: 2px"
            >
              建议格式：{{ getSelectedParentDevice().device_id }}-{{
                deviceForm.sub_device_sequence || "X"
              }}
            </div>
          </div>
        </el-form-item>
        <el-form-item label="所属租户" prop="tenantName">
          <el-select
            v-model="deviceForm.tenantName"
            placeholder="请选择租户"
            style="width: 100%"
            @change="handleFormTenantChange"
          >
            <el-option
              v-for="tenant in tenantOptions"
              :key="tenant.id"
              :label="tenant.name"
              :value="tenant.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="所属建筑">
          <el-select
            v-model="deviceForm.projectBuildingId"
            placeholder="请选择建筑"
            clearable
            filterable
            style="width: 100%"
            @change="handleFormBuildingChange"
          >
            <el-option
              v-for="building in formBuildingOptions"
              :key="building.id"
              :label="building.name"
              :value="building.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="所属分组">
          <el-select
            v-model="deviceForm.projectGroupId"
            placeholder="请选择分组"
            clearable
            filterable
            style="width: 100%"
          >
            <el-option
              v-for="group in formGroupOptions"
              :key="group.id"
              :label="group.name"
              :value="group.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="设备类型" prop="deviceTypeName">
          <el-select
            v-model="deviceForm.deviceTypeName"
            placeholder="请选择设备类型"
            style="width: 100%"
          >
            <el-option
              v-for="deviceType in deviceTypeOptions"
              :key="deviceType.id"
              :label="deviceType.name"
              :value="deviceType.name"
            />
          </el-select>
        </el-form-item>

        <!-- 设备分类选择 -->
        <el-form-item label="设备分类" prop="device_category">
          <el-select
            v-model="deviceForm.device_category"
            placeholder="请选择设备分类"
            style="width: 100%"
            @change="onDeviceCategoryChange"
          >
            <el-option label="独立设备" value="standalone" />
            <el-option label="网关设备" value="gateway" />
            <el-option label="子设备" value="sub_device" />
          </el-select>
          <div style="font-size: 12px; color: #909399; margin-top: 4px">
            独立设备：独立运行的设备；网关设备：可管理子设备的集中器；子设备：需要通过网关连接的设备
          </div>
        </el-form-item>

        <!-- 父设备选择（仅子设备显示） -->
        <el-form-item
          v-if="deviceForm.device_category === 'sub_device'"
          label="父设备"
          prop="parent_device_id"
        >
          <el-select
            v-model="deviceForm.parent_device_id"
            placeholder="请选择父设备（网关）"
            style="width: 100%"
            filterable
            :loading="gatewayLoading"
          >
            <el-option
              v-for="gateway in gatewayOptions"
              :key="gateway.id"
              :label="`${gateway.name} (${gateway.device_id})`"
              :value="gateway.id"
            >
              <div
                style="
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                "
              >
                <span>{{ gateway.name }}</span>
                <el-tag
                  size="small"
                  :type="gateway.status === 'online' ? 'success' : 'info'"
                >
                  {{ gateway.status === "online" ? "在线" : "离线" }}
                </el-tag>
              </div>
            </el-option>
          </el-select>
          <div style="font-size: 12px; color: #909399; margin-top: 4px">
            子设备必须选择一个网关设备作为父设备
          </div>
        </el-form-item>

        <!-- 子设备序列ID（仅子设备显示） -->
        <el-form-item
          v-if="deviceForm.device_category === 'sub_device'"
          label="序列ID"
          prop="sub_device_sequence"
        >
          <el-input-number
            v-model="deviceForm.sub_device_sequence"
            :min="1"
            :max="999"
            placeholder="请输入序列ID"
            style="width: 100%"
          />
          <div style="font-size: 12px; color: #909399; margin-top: 4px">
            子设备在同一网关下的序列编号，如：1, 2, 3, 4, 5, 6...
          </div>
        </el-form-item>

        <el-form-item label="厂商编号" prop="manufacturerCode">
          <el-select
            v-model="deviceForm.manufacturerCode"
            placeholder="请选择厂商"
            style="width: 100%"
            @change="onManufacturerChange"
          >
            <el-option
              v-for="manufacturer in manufacturerOptions"
              :key="manufacturer.id"
              :label="`${manufacturer.code} - ${manufacturer.name}`"
              :value="manufacturer.code"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="协议配置" prop="protocolConfigId">
          <el-select
            v-model="deviceForm.protocolConfigId"
            placeholder="请选择协议配置"
            style="width: 100%"
            clearable
          >
            <el-option
              v-for="config in protocolConfigOptions"
              :key="config.id"
              :label="`${config.name} v${config.version} - ${config.description || '无描述'}`"
              :value="config.id"
            />
          </el-select>
          <div style="font-size: 12px; color: #909399; margin-top: 4px">
            协议配置用于解析设备数据和执行命令，可选择适合的协议或留空使用默认配置
          </div>
        </el-form-item>
        <el-form-item label="位置信息" prop="location">
          <el-input
            v-model="deviceForm.location"
            placeholder="请输入位置信息"
          />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="deviceForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入设备描述"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitForm">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 设备日志对话框 -->
    <el-dialog
      v-model="logDialogVisible"
      :title="`设备通信日志 - ${currentDevice?.name || ''}`"
      width="1000px"
    >
      <div class="log-header">
        <el-row :gutter="20">
          <el-col :span="6">
            <el-select
              v-model="logFilter.type"
              placeholder="日志类型"
              clearable
              @change="filterLogs"
            >
              <el-option label="全部" value="" />
              <el-option label="设备上线" value="online" />
              <el-option label="设备下线" value="offline" />
              <el-option label="数据通信" value="data" />
              <el-option label="心跳" value="heartbeat" />
              <el-option label="命令" value="command" />
              <el-option label="错误" value="error" />
            </el-select>
          </el-col>
          <el-col :span="6">
            <el-select
              v-model="logFilter.level"
              placeholder="日志级别"
              clearable
              @change="filterLogs"
            >
              <el-option label="全部" value="" />
              <el-option label="信息" value="info" />
              <el-option label="警告" value="warning" />
              <el-option label="错误" value="error" />
              <el-option label="调试" value="debug" />
            </el-select>
          </el-col>
          <el-col :span="12">
            <el-button type="primary" @click="refreshLogs">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
            <el-button @click="clearLogFilter">
              <el-icon><Delete /></el-icon>
              清空筛选
            </el-button>
          </el-col>
        </el-row>
      </div>

      <div class="log-container">
        <el-table
          :data="filteredDeviceLogs"
          stripe
          style="width: 100%"
          v-loading="logLoading"
        >
          <el-table-column prop="timestamp" label="时间" width="160" sortable />
          <el-table-column prop="level" label="级别" width="80">
            <template #default="{ row }">
              <el-tag :type="getLogLevelTagType(row.level)">{{
                getLogLevelLabel(row.level)
              }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="方向" width="80">
            <template #default="{ row }">
              <el-tag
                size="small"
                :type="getDirectionTagType(row.data?.direction)"
              >
                <el-icon
                  ><component :is="getDirectionIcon(row.data?.direction)"
                /></el-icon>
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="100">
            <template #default="{ row }">
              <el-tag :type="getMessageTypeTagType(row.data?.messageType)">{{
                getMessageTypeLabel(row.data?.messageType)
              }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column
            prop="message"
            label="消息"
            width="200"
            show-overflow-tooltip
          />
          <el-table-column label="数据大小" width="100">
            <template #default="{ row }">
              <span v-if="row.data?.dataSize">{{
                formatDataSize(row.data.dataSize)
              }}</span>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="来源" width="80">
            <template #default="{ row }">
              <el-tag
                size="small"
                :type="row.data?.source === 'mqtt' ? 'primary' : 'success'"
              >
                {{ row.data?.source || "system" }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="详细信息" show-overflow-tooltip>
            <template #default="{ row }">
              <div v-if="row.data" class="log-details">
                <el-popover placement="top" width="600" trigger="hover">
                  <template #reference>
                    <el-text type="info" size="small">查看详情</el-text>
                  </template>
                  <div class="log-data-container">
                    <div class="log-meta">
                      <p><strong>主题:</strong> {{ row.data.topic || "-" }}</p>
                      <p><strong>时间:</strong> {{ row.data.timestamp }}</p>
                      <p v-if="row.data.sender">
                        <strong>发送者:</strong> {{ row.data.sender }}
                      </p>
                      <p v-if="row.data.statusChange">
                        <strong>状态变化:</strong>
                        {{ row.data.statusChange.from }} →
                        {{ row.data.statusChange.to }}
                      </p>
                    </div>
                    <div class="log-payload">
                      <strong>数据内容:</strong>
                      <pre class="log-data">{{
                        formatLogData(row.data.payload)
                      }}</pre>
                    </div>
                  </div>
                </el-popover>
              </div>
              <span v-else>-</span>
            </template>
          </el-table-column>
        </el-table>

        <!-- 分页 -->
        <div class="log-pagination">
          <el-pagination
            v-model:current-page="logPagination.currentPage"
            v-model:page-size="logPagination.pageSize"
            :page-sizes="[20, 50, 100]"
            :total="logPagination.total"
            layout="total, sizes, prev, pager, next"
            @size-change="handleLogSizeChange"
            @current-change="handleLogCurrentChange"
          />
        </div>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="logDialogVisible = false">关闭</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 设备数据传输对话框 -->
    <el-dialog v-model="debugDialogVisible" title="数据传输" width="800px">
      <div class="data-transfer-container">
        <!-- 设备ID显示 -->
        <div class="device-info">
          <span class="device-id">{{
            debugDevice?.imei || "865661074511729"
          }}</span>
          <el-tag type="success" size="small" style="margin-left: 10px"
            >在线</el-tag
          >
        </div>

        <!-- 接收数据区域 -->
        <div class="data-section">
          <div class="section-header">
            <span class="section-title">接收数据：</span>
            <el-button type="danger" size="small" @click="clearReceivedData"
              >清空</el-button
            >
          </div>
          <el-input
            v-model="receivedData"
            type="textarea"
            :rows="8"
            placeholder="数据输出会显示在此处"
            readonly
            class="data-textarea"
          />
        </div>

        <!-- 发送数据区域 -->
        <div class="data-section">
          <div class="section-header">
            <span class="section-title">发送数据：</span>
            <el-button type="danger" size="small" @click="clearSendData"
              >清空</el-button
            >
          </div>
          <el-input
            v-model="sendData"
            type="textarea"
            :rows="8"
            placeholder="填写发送数据"
            class="data-textarea"
          />
        </div>

        <!-- 发送按钮 -->
        <div class="send-section">
          <el-button
            type="primary"
            @click="sendDataToDevice"
            :disabled="!sendData.trim()"
          >
            按 Ctrl + Enter 发送
          </el-button>
          <el-button @click="debugDialogVisible = false">关闭</el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import {
  ref,
  reactive,
  onMounted,
  computed,
  watch,
  onUnmounted,
  nextTick,
} from "vue";
import { ElMessage, ElMessageBox, ElNotification } from "element-plus";
import {
  Document,
  Tools,
  Loading,
  Check,
  Close,
  Delete,
  ArrowDown,
  ArrowUp,
  Minus,
  Search,
  Refresh,
  Plus,
  Edit,
  Download,
  UploadFilled,
} from "@element-plus/icons-vue";
import {
  deviceAPI,
  tenantAPI,
  projectManagementAPI,
  deviceTypeAPI,
  manufacturerAPI,
  protocolConfigAPI,
} from "@/api";
import websocketService from "@/utils/websocket";
import apiCache from "@/utils/cache";

/**
 * 搜索表单
 */
const searchForm = reactive({
  keyword: "",
  status: "",
  type: "",
  tenantId: "",
});

/**
 * 设备列表数据
 */
const deviceList = ref([]);
const hierarchicalDeviceList = ref([]);
const expandedRows = ref([]);
const loading = ref(false);

/**
 * 租户选项数据
 */
const tenantOptions = ref([]);
const buildingOptions = ref([]);
const projectGroupOptions = ref([]);

/**
 * 设备类型选项数据
 */
const deviceTypeOptions = ref([]);

/**
 * 厂商选项数据
 */
const manufacturerOptions = ref([]);

/**
 * 协议配置选项数据
 */
const protocolConfigOptions = ref([]);

/**
 * 分页信息
 */
const pagination = reactive({
  currentPage: 1,
  pageSize: 10,
  total: 0,
});

const importDialogVisible = ref(false);
const importUploadRef = ref(null);
const importFile = ref(null);
const importResult = ref(null);
const importing = ref(false);
const exporting = ref(false);

/**
 * 对话框相关
 */
const dialogVisible = ref(false);
const dialogTitle = ref("添加设备");
const isEdit = ref(false);
const currentEditId = ref(null);

/**
 * 日志对话框相关
 */
const logDialogVisible = ref(false);
const currentDevice = ref(null);
const deviceLogs = ref([]);
const filteredDeviceLogs = ref([]);
const logLoading = ref(false);

/**
 * 日志过滤和分页
 */
const logFilter = reactive({
  type: "",
  level: "",
});

const logPagination = reactive({
  currentPage: 1,
  pageSize: 20,
  total: 0,
});

/**
 * 数据传输对话框相关
 */
const debugDialogVisible = ref(false);
const debugDevice = ref(null);
const receivedData = ref("");
const sendData = ref("");

/**
 * 设备表单
 */
const deviceForm = reactive({
  name: "",
  imei: "",
  tenantId: "",
  tenantName: "",
  projectBuildingId: "",
  projectGroupId: "",
  deviceTypeId: "",
  deviceTypeName: "",
  device_category: "standalone",
  parent_device_id: null,
  sub_device_sequence: null,
  manufacturerCode: "",
  protocolConfigId: "",
  protocolConfigName: "",
  location: "",
  description: "",
  mqttConfig: {
    subscriptionType: "middle",
    subscribeTopic: "",
    publishTopic: "",
  },
});

/**
 * 表单引用
 */
const formRef = ref(null);

/**
 * 网关设备选项数据
 */
const gatewayOptions = ref([]);
const gatewayLoading = ref(false);

const selectedTenantId = computed(() => {
  const tenant = tenantOptions.value.find(
    (item) => item.name === deviceForm.tenantName,
  );
  return tenant?.id || deviceForm.tenantId || "";
});

const formBuildingOptions = computed(() =>
  selectedTenantId.value
    ? buildingOptions.value.filter(
        (item) => String(item.tenant_id) === String(selectedTenantId.value),
      )
    : buildingOptions.value,
);

const formGroupOptions = computed(() =>
  projectGroupOptions.value.filter(
    (item) =>
      (!selectedTenantId.value ||
        String(item.tenant_id) === String(selectedTenantId.value)) &&
      (!deviceForm.projectBuildingId ||
        !item.building_id ||
        String(item.building_id) === String(deviceForm.projectBuildingId)),
  ),
);

const handleFormTenantChange = () => {
  deviceForm.tenantId = selectedTenantId.value;
  deviceForm.projectBuildingId = "";
  deviceForm.projectGroupId = "";
};

const handleFormBuildingChange = () => {
  if (
    deviceForm.projectGroupId &&
    !formGroupOptions.value.some(
      (item) => item.id === deviceForm.projectGroupId,
    )
  ) {
    deviceForm.projectGroupId = "";
  }
};

/**
 * 设备分类变更处理
 */
const onDeviceCategoryChange = (value) => {
  // 如果不是子设备，清空父设备选择
  if (value !== "sub_device") {
    deviceForm.parent_device_id = null;
  } else {
    // 如果是子设备，加载网关设备列表
    loadGatewayOptions();
  }

  // 清除IMEI验证状态，让用户重新验证
  imeiValidationMessage.value = "";
  imeiValidating.value = false;

  // 强制重新验证IMEI字段（如果有值的话）
  if (formRef.value && deviceForm.imei) {
    nextTick(() => {
      formRef.value.validateField("imei");
    });
  }
};

/**
 * 加载网关设备选项
 */
const loadGatewayOptions = async () => {
  gatewayLoading.value = true;
  try {
    const response = await deviceAPI.getGateways();
    if (response.success && response.data) {
      gatewayOptions.value = response.data.map((gateway) => ({
        id: gateway.id,
        name: gateway.name,
        device_id: gateway.device_id || gateway.imei,
        status: gateway.status,
      }));
    } else {
      gatewayOptions.value = [];
      ElMessage.warning("获取网关设备列表失败");
    }
  } catch (error) {
    console.error("获取网关设备列表失败:", error);
    gatewayOptions.value = [];
    ElMessage.error("获取网关设备列表失败");
  } finally {
    gatewayLoading.value = false;
  }
};

/**
 * 获取IMEI占位符文本
 */
const getImeiPlaceholder = () => {
  if (isEdit.value) {
    return "请输入设备ID或IMEI（可选，留空则不修改）";
  } else if (deviceForm.device_category === "sub_device") {
    return "请输入设备ID或IMEI（可选，留空则自动生成）";
  } else {
    return "请输入设备ID或IMEI";
  }
};

/**
 * 获取选中的父设备信息
 */
const getSelectedParentDevice = () => {
  if (!deviceForm.parent_device_id) return null;
  return gatewayOptions.value.find(
    (gateway) => gateway.id === deviceForm.parent_device_id,
  );
};

/**
 * IMEI验证状态
 */
const imeiValidating = ref(false);
const imeiValidationMessage = ref("");

/**
 * IMEI验证函数
 */
const validateImei = async (rule, value, callback) => {
  // 如果IMEI为空
  if (!value) {
    if (isEdit.value) {
      imeiValidationMessage.value = "IMEI未更改（可选）";
      callback();
      return;
    } else if (deviceForm.device_category === "sub_device") {
      // 子设备允许IMEI为空，系统会自动生成虚拟IMEI
      imeiValidationMessage.value = "将自动生成虚拟IMEI";
      callback();
      return;
    } else {
      imeiValidationMessage.value = "";
      callback();
      return;
    }
  }

  // 设备标识不限制位数，兼容 IMEI 和常见设备 ID 格式。
  const imeiPattern = /^[0-9a-zA-Z_-]+$/;

  if (!imeiPattern.test(value)) {
    imeiValidationMessage.value =
      "设备ID/IMEI仅支持数字、大小写字母、连字符和下划线";
    callback(
      new Error("设备ID/IMEI仅支持数字、大小写字母、连字符和下划线"),
    );
    return;
  }

  // 如果是编辑模式，需要获取原始IMEI进行比较
  if (isEdit.value) {
    // 在编辑模式下，如果IMEI未改变，跳过验证
    const currentDevice = deviceList.value.find(
      (device) => device.id === currentEditId.value,
    );
    if (currentDevice && value === currentDevice.imei) {
      imeiValidationMessage.value = "IMEI未更改";
      callback();
      return;
    }
  }

  // 检查当前设备列表中是否已存在相同IMEI
  const existingDevice = deviceList.value.find(
    (device) =>
      device.imei === value &&
      (!isEdit.value || device.id !== currentEditId.value),
  );

  if (existingDevice) {
    // 对于子设备，如果IMEI与父设备相同，允许使用
    if (
      deviceForm.device_category === "sub_device" &&
      deviceForm.parent_device_id
    ) {
      const parentDevice = deviceList.value.find(
        (device) => device.id === deviceForm.parent_device_id,
      );
      if (parentDevice && parentDevice.imei === value) {
        imeiValidationMessage.value = "设备ID/IMEI格式正确（使用父网关标识）";
        callback();
        return;
      }
    }

    imeiValidationMessage.value = "IMEI已存在，请使用其他IMEI";
    callback(new Error("IMEI已存在，请使用其他IMEI"));
    return;
  }

  // 简化验证逻辑，只进行本地验证
  imeiValidationMessage.value = "设备ID/IMEI格式正确";
  callback();
};

/**
 * 动态表单验证规则
 */
const getFormRules = () => {
  const rules = {
    name: [{ required: true, message: "请输入设备名称", trigger: "blur" }],
    tenantName: [
      { required: true, message: "请选择所属租户", trigger: "change" },
    ],
    deviceTypeName: [
      { required: true, message: "请选择设备类型", trigger: "change" },
    ],
    device_category: [
      { required: true, message: "请选择设备分类", trigger: "change" },
    ],
    manufacturerCode: [
      { required: true, message: "请选择厂商", trigger: "change" },
    ],
    location: [{ required: true, message: "请输入位置信息", trigger: "blur" }],
  };

  // 对于子设备，IMEI不是必填项
  if (deviceForm.device_category === "sub_device") {
    rules.imei = [{ validator: validateImei, trigger: "blur" }];
  } else {
    // 对于非子设备，IMEI是必填项（编辑模式除外）
    rules.imei = [
      { required: !isEdit.value, message: "请输入设备ID或IMEI", trigger: "blur" },
      { validator: validateImei, trigger: "blur" },
    ];
  }

  return rules;
};

/**
 * 响应式表单验证规则
 */
const formRules = computed(() => getFormRules());

/**
 * 获取租户列表
 */
const getTenantList = async () => {
  try {
    const response = await tenantAPI.getTenants({ pageSize: 100 });

    if (response.success && response.data) {
      // 确保数据结构正确
      const tenantData =
        response.data.tenants || response.data.list || response.data || [];
      tenantOptions.value = tenantData.map((tenant) => ({
        id: tenant.id,
        name: tenant.name || tenant.tenant_name || "未知租户",
      }));
    } else {
      tenantOptions.value = [];
      console.warn("获取租户列表失败:", response);
      if (response.message) {
        ElMessage.warning(response.message);
      }
    }
  } catch (error) {
    console.error("获取租户列表失败:", error);
    tenantOptions.value = [];

    // 根据错误类型提供更友好的提示
    let errorMessage = "获取租户列表失败";
    if (error.message.includes("网络")) {
      errorMessage = "网络连接失败，请检查网络连接";
    } else if (error.message.includes("401")) {
      errorMessage = "权限不足，请联系管理员";
    }

    ElMessage.error(errorMessage);
  }
};

const getProjectOptions = async () => {
  try {
    const [buildingResult, groupResult] = await Promise.all([
      projectManagementAPI.getBuildings(),
      projectManagementAPI.getGroups(),
    ]);
    buildingOptions.value = buildingResult.success
      ? buildingResult.data || []
      : [];
    projectGroupOptions.value = groupResult.success
      ? groupResult.data || []
      : [];
  } catch (error) {
    console.error("获取建筑和分组列表失败:", error);
    buildingOptions.value = [];
    projectGroupOptions.value = [];
  }
};

/**
 * 获取设备列表
 */
const getDeviceList = async () => {
  loading.value = true;
  try {
    const params = {
      page: pagination.currentPage,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword,
      status: searchForm.status,
      type: searchForm.type,
      tenantId: searchForm.tenantId,
    };

    // 过滤空值参数
    Object.keys(params).forEach((key) => {
      if (
        params[key] === "" ||
        params[key] === null ||
        params[key] === undefined
      ) {
        delete params[key];
      }
    });

    const response = await deviceAPI.getDevices(params);

    if (response.success && response.data) {
      // 确保数据结构正确
      const deviceData =
        response.data.list || response.data.devices || response.data || [];
      const paginationData = response.data.pagination || {
        total: deviceData.length,
      };

      // 转换数据格式以匹配前端显示
      deviceList.value = deviceData.map((device) => ({
        id: device.id,
        name: device.name,
        deviceId: device.device_id,
        imei: device.imei,
        tenantId: device.tenant_id,
        tenantName: device.tenant?.name || "未知租户",
        projectBuildingId: device.project_building_id || "",
        projectBuildingName: device.project_building_name || "",
        projectGroupId: device.project_group_id || "",
        projectGroupName: device.project_group_name || "",
        type: device.device_type?.name || "未知类型",
        deviceTypeId: device.device_type_id,
        device_category: device.device_category || "standalone", // 设备分类
        parent_device_id: device.parent_device_id, // 父设备ID
        parent_device_name: device.parent_device?.name || "", // 父设备名称
        parent_device_device_id: device.parent_device?.device_id || "",
        parent_device_imei: device.parent_device?.imei || "",
        sub_device_sequence: device.sub_device_sequence, // 子设备序列ID
        manufacturerCode: device.manufacturer_code || "",
        protocolConfigId: device.protocol_config_id || "",
        protocolConfigName: device.protocol_config?.name || "",
        status: device.status,
        location: device.location || "未设置",
        lastOnline: device.last_seen_at
          ? new Date(device.last_seen_at).toLocaleString("zh-CN")
          : "从未上线",
        createTime: new Date(device.created_at).toLocaleString("zh-CN"),
        description: device.description || "",
        mqttConfig: device.mqtt_config || {},
      }));

      pagination.total = paginationData.total || 0;
    } else {
      // 处理API返回失败的情况
      deviceList.value = [];
      pagination.total = 0;
      const errorMsg = response.message || "获取设备列表失败";
      console.warn("获取设备列表失败:", response);
      ElMessage.error(errorMsg);
    }
  } catch (error) {
    console.error("获取设备列表失败:", error);
    deviceList.value = [];
    pagination.total = 0;

    // 根据错误类型提供更友好的提示
    let errorMessage = "获取设备列表失败";
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      errorMessage = "网络连接失败，请检查网络连接";
    } else if (error.message.includes("timeout")) {
      errorMessage = "请求超时，请稍后重试";
    } else if (error.message.includes("401")) {
      errorMessage = "登录已过期，请重新登录";
    } else if (error.message.includes("500")) {
      errorMessage = "服务器内部错误，请联系管理员";
    } else {
      errorMessage = error.message || "获取设备列表失败";
    }

    ElMessage.error(errorMessage);
  } finally {
    loading.value = false;
  }
};

const saveBlob = ({ blob, fileName }) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const downloadImportTemplate = async () => {
  try {
    saveBlob(await deviceAPI.downloadImportTemplate());
  } catch (error) {
    console.error("下载设备导入模板失败:", error);
    ElMessage.error(error.message || "下载设备导入模板失败");
  }
};

const exportDevices = async () => {
  exporting.value = true;
  try {
    const params = {
      keyword: searchForm.keyword,
      status: searchForm.status,
      type: searchForm.type,
      tenantId: searchForm.tenantId,
    };
    Object.keys(params).forEach((key) => {
      if (!params[key]) delete params[key];
    });
    saveBlob(await deviceAPI.exportDevices(params));
    ElMessage.success("设备清单已导出");
  } catch (error) {
    console.error("导出设备失败:", error);
    ElMessage.error(error.message || "导出设备失败");
  } finally {
    exporting.value = false;
  }
};

const openImportDialog = () => {
  importDialogVisible.value = true;
};

const handleImportFileChange = (uploadFile) => {
  importResult.value = null;
  if (!uploadFile.name?.toLowerCase().endsWith(".xlsx")) {
    ElMessage.warning("请选择 .xlsx 格式的 Excel 文件");
    importUploadRef.value?.clearFiles();
    importFile.value = null;
    return;
  }
  if (uploadFile.size > 10 * 1024 * 1024) {
    ElMessage.warning("Excel 文件不能超过 10 MB");
    importUploadRef.value?.clearFiles();
    importFile.value = null;
    return;
  }
  importFile.value = uploadFile.raw;
};

const handleImportFileRemove = () => {
  importFile.value = null;
  importResult.value = null;
};

const resetImportDialog = () => {
  importUploadRef.value?.clearFiles();
  importFile.value = null;
  importResult.value = null;
  importing.value = false;
};

const submitDeviceImport = async () => {
  if (!importFile.value) return;
  importing.value = true;
  try {
    const formData = new FormData();
    formData.append("file", importFile.value);
    const response = await deviceAPI.importDevices(formData);
    importResult.value = response.data || null;

    if (response.data?.created || response.data?.updated) {
      apiCache.clear("devices");
      pagination.currentPage = 1;
      await getDeviceList();
    }

    if (response.success) {
      ElMessage.success(response.message || "设备导入完成");
    } else {
      ElMessage.warning(response.message || "导入文件未产生有效变更");
    }
  } catch (error) {
    console.error("批量导入设备失败:", error);
    ElMessage.error(error.message || "批量导入设备失败");
  } finally {
    importing.value = false;
  }
};

/**
 * 防抖搜索函数
 */
const debouncedSearch = apiCache.debounce(
  "deviceSearch",
  () => {
    pagination.currentPage = 1;
    getDeviceList();
  },
  500,
);

/**
 * 搜索设备
 */
const handleSearch = () => {
  debouncedSearch();
};

/**
 * 立即搜索（用于按钮点击）
 */
const handleImmediateSearch = () => {
  pagination.currentPage = 1;
  getDeviceList();
};

/**
 * 重置搜索
 */
const resetSearch = () => {
  Object.assign(searchForm, {
    keyword: "",
    status: "",
    type: "",
    tenantId: "",
  });
  // 清除缓存
  apiCache.clear("devices");
  handleImmediateSearch();
};

/**
 * 监听搜索表单变化
 */
watch(
  () => [
    searchForm.keyword,
    searchForm.status,
    searchForm.type,
    searchForm.tenantId,
  ],
  () => {
    // 清除相关缓存
    apiCache.clear("devices");
    handleSearch();
  },
  { deep: true },
);

/**
 * 分页大小改变
 */
const handleSizeChange = (size) => {
  pagination.pageSize = size;
  getDeviceList();
};

/**
 * 当前页改变
 */
const handleCurrentChange = (page) => {
  pagination.currentPage = page;
  getDeviceList();
};

/**
 * 显示添加设备对话框
 */
const showAddDialog = () => {
  dialogTitle.value = "添加设备";
  isEdit.value = false;
  resetForm(); // 重置表单
  dialogVisible.value = true;
  // 清除IMEI验证状态
  imeiValidationMessage.value = "";
  imeiValidating.value = false;
};

const showAddSubDevice = (gateway) => {
  dialogTitle.value = `添加子设备 - ${gateway.name}`;
  isEdit.value = false;
  resetForm();
  Object.assign(deviceForm, {
    tenantId: gateway.tenantId || "",
    tenantName: gateway.tenantName || "",
    projectBuildingId: gateway.projectBuildingId || "",
    projectGroupId: gateway.projectGroupId || "",
    device_category: "sub_device",
    parent_device_id: gateway.id,
  });
  loadGatewayOptions();
  dialogVisible.value = true;
};

/**
 * 编辑设备
 */
const editDevice = (row) => {
  dialogTitle.value = "编辑设备";
  isEdit.value = true;
  currentEditId.value = row.id;

  // 填充表单数据
  Object.assign(deviceForm, {
    name: row.name,
    imei: row.imei,
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    projectBuildingId: row.projectBuildingId || "",
    projectGroupId: row.projectGroupId || "",
    deviceTypeId: row.deviceTypeId,
    deviceTypeName: row.type,
    device_category: row.device_category || "standalone", // 设备分类
    parent_device_id: row.parent_device_id, // 父设备ID
    sub_device_sequence: row.sub_device_sequence, // 子设备序列ID
    manufacturerCode: row.manufacturerCode || row.manufacturer_code || "",
    protocolConfigId: row.protocolConfigId || row.protocol_config_id || "",
    protocolConfigName: row.protocolConfigName || "",
    location: row.location,
    description: row.description || "",
    mqttConfig: {
      subscribeTopic:
        row.mqttConfig?.subscribe_topic || row.mqttConfig?.subscribeTopic || "",
      publishTopic:
        row.mqttConfig?.publish_topic || row.mqttConfig?.publishTopic || "",
      subscriptionType:
        row.mqttConfig?.subscription_type ||
        row.mqttConfig?.subscriptionType ||
        "middle",
    },
  });

  // 如果是子设备，加载网关设备列表
  if (deviceForm.device_category === "sub_device") {
    loadGatewayOptions();
  }

  dialogVisible.value = true;
};

/**
 * 删除设备
 */
const deleteDevice = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除设备 "${row.name}" 吗？`,
      "删除确认",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      },
    );

    const response = await deviceAPI.deleteDevice(row.id);

    if (response.success) {
      ElMessage.success(response.message || "删除设备成功");
      // 清除设备列表缓存以确保数据刷新
      apiCache.clear("devices");
      getDeviceList();
    } else {
      ElMessage.error(response.message || "删除设备失败");
    }
  } catch (error) {
    if (error !== "cancel") {
      console.error("删除设备失败:", error);
      ElMessage.error(error.message || "删除设备失败");
    }
  }
};

/**
 * 查看设备日志
 */
const viewDeviceLogs = async (row) => {
  currentDevice.value = row;

  // 重置过滤条件和分页
  Object.assign(logFilter, {
    type: "",
    level: "",
  });

  Object.assign(logPagination, {
    currentPage: 1,
    pageSize: 20,
    total: 0,
  });

  logDialogVisible.value = true;
  await loadDeviceLogs();
};

/**
 * 加载设备日志
 */
const loadDeviceLogs = async () => {
  if (!currentDevice.value) {
    console.warn("当前设备为空，无法加载日志");
    return;
  }

  logLoading.value = true;
  try {
    const params = {
      page: logPagination.currentPage,
      pageSize: logPagination.pageSize,
    };

    // 添加过滤条件
    if (logFilter.type) {
      params.logType = logFilter.type;
    }
    if (logFilter.level) {
      params.level = logFilter.level;
    }

    const response = await deviceAPI.getDeviceLogs(
      currentDevice.value.id,
      params,
    );

    if (response.success && response.data) {
      // 确保数据结构正确
      const logData =
        response.data.list || response.data.logs || response.data || [];
      deviceLogs.value = logData.map((log) => ({
        id: log.id || Math.random().toString(36).substr(2, 9),
        timestamp: log.timestamp
          ? new Date(log.timestamp).toLocaleString("zh-CN")
          : "未知时间",
        level: log.level || "info",
        type: getLogTypeFromMessage(log.message, log.data?.messageType),
        message: log.message || "无消息内容",
        data: log.data,
        source: log.data?.source || log.source || "system",
      }));

      const paginationData = response.data.pagination || {
        total: logData.length,
      };
      logPagination.total = paginationData.total || 0;
      filterLogs();
    } else {
      deviceLogs.value = [];
      logPagination.total = 0;
      const errorMsg = response.message || "获取设备日志失败";
      console.warn("获取设备日志失败:", response);
      ElMessage.warning(errorMsg);
    }
  } catch (error) {
    console.error("获取设备日志失败:", error);
    deviceLogs.value = [];
    logPagination.total = 0;

    // 根据错误类型提供更友好的提示
    let errorMessage = "获取设备日志失败";
    if (error.message.includes("网络")) {
      errorMessage = "网络连接失败，请检查网络连接";
    } else if (error.message.includes("404")) {
      errorMessage = "设备不存在或已被删除";
    } else if (error.message.includes("403")) {
      errorMessage = "权限不足，无法查看设备日志";
    }

    ElMessage.error(errorMessage);
  } finally {
    logLoading.value = false;
  }
};

/**
 * 从消息内容推断日志类型
 */
const getLogTypeFromMessage = (message, messageType = "") => {
  const normalizedType = String(messageType).toLowerCase();
  if (normalizedType.includes("command")) return "command";
  if (normalizedType.includes("heartbeat")) return "heartbeat";
  if (normalizedType.includes("error")) return "error";
  if (normalizedType && normalizedType !== "info") return "data";
  if (!message) return "info";

  const msg = message.toLowerCase();
  if (msg.includes("上线") || msg.includes("连接") || msg.includes("online"))
    return "online";
  if (msg.includes("下线") || msg.includes("离线") || msg.includes("offline"))
    return "offline";
  if (msg.includes("心跳") || msg.includes("heartbeat")) return "heartbeat";
  if (msg.includes("命令") || msg.includes("command")) return "command";
  if (msg.includes("错误") || msg.includes("error") || msg.includes("失败"))
    return "error";
  if (msg.includes("数据") || msg.includes("data")) return "data";

  return "info";
};

/**
 * 过滤日志
 */
const filterLogs = () => {
  let filtered = [...deviceLogs.value];

  if (logFilter.type) {
    filtered = filtered.filter((log) => log.type === logFilter.type);
  }

  if (logFilter.level) {
    filtered = filtered.filter((log) => log.level === logFilter.level);
  }

  filteredDeviceLogs.value = filtered;
};

/**
 * 刷新日志
 */
const refreshLogs = () => {
  loadDeviceLogs();
};

/**
 * 清空日志筛选
 */
const clearLogFilter = () => {
  Object.assign(logFilter, {
    type: "",
    level: "",
  });
  filterLogs();
};

/**
 * 日志分页大小改变
 */
const handleLogSizeChange = (size) => {
  logPagination.pageSize = size;
  logPagination.currentPage = 1;
  loadDeviceLogs();
};

/**
 * 日志当前页改变
 */
const handleLogCurrentChange = (page) => {
  logPagination.currentPage = page;
  loadDeviceLogs();
};

/**
 * 格式化日志数据
 */
const formatLogData = (data) => {
  if (!data) return "";
  return JSON.stringify(data, null, 2);
};

/**
 * 打开设备数据传输对话框
 */
const getCommunicationIdentity = (device) => {
  if (device?.device_category === "sub_device") {
    return (
      device.parent_device_imei ||
      device.parent_device_device_id ||
      ""
    );
  }
  return device?.imei || device?.deviceId || "";
};

const renderDebugTopic = (template, device, manufacturerCode) => {
  const communicationIdentity = getCommunicationIdentity(device);
  const communicationDeviceId =
    device?.device_category === "sub_device"
      ? device.parent_device_device_id || communicationIdentity
      : device?.deviceId || communicationIdentity;
  return String(template || "")
    .replace(/\{imei\}|\{IMEI\}/g, communicationIdentity)
    .replace(/\{deviceId\}|\{device_id\}/g, communicationDeviceId)
    .replace(
      /\{manufacturerCode\}|\{manufacturer\}|\{code\}/g,
      manufacturerCode,
    );
};

const buildDebugTopics = (device, manufacturer) => {
  const manufacturerCode = device.manufacturerCode;
  const communicationIdentity = getCommunicationIdentity(device);
  const mqttConfig = manufacturer.mqttConfig || {};
  const subscriptionType = mqttConfig.subscriptionType || "middle";

  if (subscriptionType === "custom") {
    const subscribeTemplate =
      mqttConfig.subscribeTopic || mqttConfig.subscribeTopics?.[0]?.topic;
    const publishTemplate =
      mqttConfig.publishTopic || mqttConfig.publishTopics?.[0]?.topic;
    return {
      publishTopic: renderDebugTopic(
        publishTemplate ||
          `zhhl/${manufacturerCode}/{imei}/publish`,
        device,
        manufacturerCode,
      ),
      subscribeTopic: renderDebugTopic(
        subscribeTemplate ||
          `zhhl/${manufacturerCode}/{imei}/subscribe`,
        device,
        manufacturerCode,
      ),
    };
  }

  if (subscriptionType === "end" || subscriptionType === "imei_last") {
    return {
      publishTopic: `zhhl/${manufacturerCode}/publish/${communicationIdentity}`,
      subscribeTopic: `zhhl/${manufacturerCode}/subscribe/${communicationIdentity}`,
    };
  }

  return {
    publishTopic: `zhhl/${manufacturerCode}/${communicationIdentity}/publish`,
    subscribeTopic: `zhhl/${manufacturerCode}/${communicationIdentity}/subscribe`,
  };
};

const openDebugDialog = async (row) => {
  debugDevice.value = row;
  debugDialogVisible.value = true;

  // 清空数据
  receivedData.value = "";
  sendData.value = "";

  // 显示设备连接状态
  const timestamp = new Date().toLocaleString();
  receivedData.value = `[${timestamp}] 正在连接设备 ${row.name} (${row.imei})...\n`;

  if (row.status === "online") {
    receivedData.value += `[${timestamp}] 设备在线，可以发送命令\n`;
  } else {
    receivedData.value += `[${timestamp}] 设备离线，命令可能无法送达\n`;
  }

  // 获取设备厂商信息以确定MQTT主题格式
  try {
    console.log("manufacturerAPI对象:", manufacturerAPI);
    console.log(
      "getManufacturerByCode方法:",
      manufacturerAPI.getManufacturerByCode,
    );

    if (!manufacturerAPI.getManufacturerByCode) {
      throw new Error("manufacturerAPI.getManufacturerByCode方法不存在");
    }

    const manufacturerResponse = await manufacturerAPI.getManufacturerByCode(
      row.manufacturerCode,
    );
    if (manufacturerResponse.success && manufacturerResponse.data) {
      const manufacturer = manufacturerResponse.data;
      const { publishTopic, subscribeTopic } = buildDebugTopics(
        row,
        manufacturer,
      );

      receivedData.value += `[${timestamp}] 使用厂商配置的MQTT主题格式\n`;
      if (row.device_category === "sub_device") {
        receivedData.value += `[${timestamp}] 子设备通过上级网关 ${getCommunicationIdentity(row)} 通信\n`;
      }
      receivedData.value += `[${timestamp}] 发布主题: ${publishTopic}\n`;
      receivedData.value += `[${timestamp}] 订阅主题: ${subscribeTopic}\n`;
    } else {
      receivedData.value += `[${timestamp}] 警告:使用默认主题格式\n`;
    }
  } catch (error) {
    console.error("获取厂商配置失败:", error);
    receivedData.value += `[${timestamp}] 警告: ，使用默认主题格式\n`;
  }
};

/**
 * 清空接收数据
 */
const clearReceivedData = () => {
  receivedData.value = "";
  ElMessage.success("接收数据已清空");
};

/**
 * 清空发送数据
 */
const clearSendData = () => {
  sendData.value = "";
  ElMessage.success("发送数据已清空");
};

/**
 * 发送数据到设备
 */
const sendDataToDevice = async () => {
  if (!sendData.value.trim()) {
    ElMessage.warning("请输入要发送的数据");
    return;
  }

  try {
    const timestamp = new Date().toLocaleString();

    // 在接收数据区域显示发送的数据
    receivedData.value += `[${timestamp}] 发送: ${sendData.value}\n`;

    // 获取厂商配置以确定MQTT主题格式
    console.log("sendDataToDevice - manufacturerAPI对象:", manufacturerAPI);
    console.log(
      "sendDataToDevice - getManufacturerByCode方法:",
      manufacturerAPI.getManufacturerByCode,
    );

    if (!manufacturerAPI.getManufacturerByCode) {
      throw new Error("manufacturerAPI.getManufacturerByCode方法不存在");
    }

    const manufacturerResponse = await manufacturerAPI.getManufacturerByCode(
      debugDevice.value.manufacturerCode,
    );
    let subscribeTopic;

    if (manufacturerResponse.success && manufacturerResponse.data) {
      const manufacturer = manufacturerResponse.data;
      subscribeTopic = buildDebugTopics(
        debugDevice.value,
        manufacturer,
      ).subscribeTopic;
    } else {
      // 使用默认格式
      subscribeTopic = `zhhl/${debugDevice.value.manufacturerCode}/${getCommunicationIdentity(debugDevice.value)}/subscribe`;
    }

    // 调用设备命令API，传入MQTT主题信息
    const response = await deviceAPI.sendCommand(debugDevice.value.id, {
      command: sendData.value,
      timestamp: new Date().toISOString(),
      mqttTopic: subscribeTopic,
    });

    if (response.success) {
      const responseTime = new Date().toLocaleString();

      // 显示发送成功信息
      const commandId = response.data?.commandId || "unknown";
      receivedData.value += `[${responseTime}] 系统: 数据已发送到设备 (ID: ${commandId})\n`;
      receivedData.value += `[${responseTime}] 使用主题: ${subscribeTopic}\n`;

      // 如果有警告信息，显示警告
      if (response.warning) {
        receivedData.value += `[${responseTime}] 警告: ${response.warning}\n`;
        ElMessage.warning(response.warning);
      } else {
        ElMessage.success("数据发送成功");
      }

      // 清空发送框
      sendData.value = "";
    } else {
      receivedData.value += `[${new Date().toLocaleString()}] 错误: ${response.message}\n`;
      ElMessage.error(response.message || "数据发送失败");
    }
  } catch (error) {
    console.error("发送设备命令失败:", error);
    receivedData.value += `[${new Date().toLocaleString()}] 错误: ${error.message}\n`;
    ElMessage.error(error.message || "数据发送失败");
  }
};

/**
 * 提交表单
 */
const submitForm = async () => {
  if (!formRef.value) return;

  try {
    await formRef.value.validate();

    // 根据名称找到对应的ID
    const selectedTenant = tenantOptions.value.find(
      (tenant) => tenant.name === deviceForm.tenantName,
    );
    const selectedDeviceType = deviceTypeOptions.value.find(
      (deviceType) => deviceType.name === deviceForm.deviceTypeName,
    );
    const selectedProtocolConfig = protocolConfigOptions.value.find(
      (config) => config.name === deviceForm.protocolConfigName,
    );

    const deviceData = {
      name: deviceForm.name,
      tenant_id: selectedTenant?.id || deviceForm.tenantId || null,
      project_building_id: deviceForm.projectBuildingId || null,
      project_group_id: deviceForm.projectGroupId || null,
      device_type_id: selectedDeviceType?.id || deviceForm.deviceTypeId,
      device_category: deviceForm.device_category, // 设备分类
      parent_device_id: deviceForm.parent_device_id, // 父设备ID
      sub_device_sequence: deviceForm.sub_device_sequence, // 子设备序列ID
      manufacturer_code: deviceForm.manufacturerCode,
      protocol_config_id:
        selectedProtocolConfig?.id || deviceForm.protocolConfigId || null,
      location: deviceForm.location,
      description: deviceForm.description,
      mqtt_config: {
        ...deviceForm.mqttConfig,
        subscription_type: deviceForm.mqttConfig.subscriptionType,
        subscribe_topic: deviceForm.mqttConfig.subscribeTopic,
        publish_topic: deviceForm.mqttConfig.publishTopic,
      },
    };

    // 在编辑模式下，只有当IMEI不为空时才包含IMEI字段
    if (!isEdit.value || (isEdit.value && deviceForm.imei.trim())) {
      deviceData.imei = deviceForm.imei;
    }

    let response;
    if (isEdit.value) {
      response = await deviceAPI.updateDevice(currentEditId.value, deviceData);
    } else {
      response = await deviceAPI.createDevice(deviceData);
    }

    // 改进成功判断逻辑：同时考虑response.success、response.httpOk和HTTP状态码
    const isSuccess =
      response.success &&
      response.httpOk &&
      response.httpStatus >= 200 &&
      response.httpStatus < 300;

    if (isSuccess) {
      ElMessage.success(
        response.message || (isEdit.value ? "更新设备成功" : "添加设备成功"),
      );
      dialogVisible.value = false;
      // 清除设备列表缓存以确保数据刷新
      apiCache.clear("devices");
      getDeviceList();
    } else {
      // 针对IMEI重复错误提供更友好的提示
      if (response.message && response.message.includes("IMEI已存在")) {
        ElMessage({
          message:
            "IMEI已存在，请检查输入的IMEI是否正确，或联系管理员处理重复设备",
          type: "warning",
          duration: 5000,
        });
      } else {
        ElMessage.error(response.message || "操作失败");
      }
    }
  } catch (error) {
    console.error("设备操作失败:", error);

    // 智能错误处理
    if (error.message && error.message.includes("登录已过期")) {
      // 登录过期错误已经在request函数中处理了，这里不需要额外提示
      return;
    } else if (
      error.message &&
      (error.message.includes("网络") ||
        error.message.includes("fetch") ||
        error.message.includes("Failed to fetch"))
    ) {
      ElMessage.error("网络连接失败，请检查网络连接后重试");
    } else {
      ElMessage.error(error.message || "操作失败，请稍后重试");
    }
  }
};

/**
 * 重置表单
 */
const resetForm = () => {
  if (formRef.value) {
    formRef.value.resetFields();
  }
  Object.assign(deviceForm, {
    name: "",
    imei: "",
    tenantId: "",
    tenantName: "",
    projectBuildingId: "",
    projectGroupId: "",
    deviceTypeId: "",
    deviceTypeName: "",
    device_category: "", // 不设置默认值，让用户选择
    parent_device_id: null, // 重置父设备ID
    sub_device_sequence: null, // 重置子设备序列ID
    manufacturerCode: "",
    protocolConfigId: "",
    protocolConfigName: "",
    location: "",
    description: "",
    mqttConfig: {
      subscriptionType: "middle",
      subscribeTopic: "",
      publishTopic: "",
    },
  });
  // 清除IMEI验证状态
  imeiValidationMessage.value = "";
  imeiValidating.value = false;
};

/**
 * 获取设备状态标签类型
 */
const getStatusTagType = (status) => {
  const statusMap = {
    online: "success",
    offline: "info",
    error: "danger",
  };
  return statusMap[status] || "info";
};

/**
 * 获取设备状态标签文本
 */
const getStatusLabel = (status) => {
  const statusMap = {
    online: "在线",
    offline: "离线",
    error: "故障",
  };
  return statusMap[status] || "未知";
};

/**
 * 获取日志类型标签类型
 */
const getLogTypeTagType = (type) => {
  const typeMap = {
    online: "success",
    offline: "warning",
    heartbeat: "success",
    data: "primary",
    command: "warning",
    error: "danger",
    info: "info",
  };
  return typeMap[type] || "info";
};

/**
 * 获取日志类型标签文本
 */
const getLogTypeLabel = (type) => {
  const typeMap = {
    online: "设备上线",
    offline: "设备下线",
    heartbeat: "心跳",
    data: "数据通信",
    command: "命令",
    error: "错误",
    info: "信息",
  };
  return typeMap[type] || "未知";
};

/**
 * 获取日志级别标签类型
 */
const getLogLevelTagType = (level) => {
  const levelMap = {
    info: "primary",
    warning: "warning",
    error: "danger",
    debug: "info",
  };
  return levelMap[level] || "info";
};

/**
 * 获取日志级别标签文本
 */
const getLogLevelLabel = (level) => {
  const levelMap = {
    info: "信息",
    warning: "警告",
    error: "错误",
    debug: "调试",
  };
  return levelMap[level] || "未知";
};

/**
 * 获取通信方向标签类型
 */
const getDirectionTagType = (direction) => {
  const directionMap = {
    incoming: "success",
    outgoing: "warning",
  };
  return directionMap[direction] || "info";
};

/**
 * 获取通信方向图标
 */
const getDirectionIcon = (direction) => {
  const iconMap = {
    incoming: "ArrowDown",
    outgoing: "ArrowUp",
  };
  return iconMap[direction] || "Minus";
};

/**
 * 获取消息类型标签类型
 */
const getMessageTypeTagType = (messageType) => {
  const typeMap = {
    data: "primary",
    command: "warning",
    status: "success",
    response: "info",
    heartbeat: "info",
  };
  return typeMap[messageType] || "info";
};

/**
 * 获取消息类型标签文本
 */
const getMessageTypeLabel = (messageType) => {
  const typeMap = {
    data: "数据",
    command: "命令",
    status: "状态",
    response: "响应",
    heartbeat: "心跳",
  };
  return typeMap[messageType] || "未知";
};

/**
 * 格式化数据大小
 */
const formatDataSize = (size) => {
  if (size < 1024) {
    return `${size}B`;
  } else if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)}KB`;
  } else {
    return `${(size / (1024 * 1024)).toFixed(1)}MB`;
  }
};

/**
 * 获取设备类型列表
 */
const getDeviceTypeList = async () => {
  try {
    const response = await deviceTypeAPI.getDeviceTypes();
    if (response.success && response.data) {
      // 确保数据结构正确
      const deviceTypeData =
        response.data.list || response.data.deviceTypes || response.data || [];
      deviceTypeOptions.value = deviceTypeData.map((type) => ({
        id: type.id,
        name: type.name || type.type_name || "未知类型",
        description: type.description || "",
      }));
    } else {
      deviceTypeOptions.value = [];
      console.warn("获取设备类型列表失败:", response);
      ElMessage.error(response.message || "获取设备类型列表失败");
    }
  } catch (error) {
    console.error("获取设备类型列表失败:", error);
    deviceTypeOptions.value = [];

    // 根据错误类型提供更友好的提示
    let errorMessage = "获取设备类型列表失败";
    if (error.message.includes("网络")) {
      errorMessage = "网络连接失败，请检查网络连接";
    } else if (error.message.includes("401")) {
      errorMessage = "权限不足，请联系管理员";
    }

    ElMessage.error(errorMessage);
  }
};

/**
 * 获取厂商列表
 */
const getManufacturerList = async () => {
  try {
    const response = await manufacturerAPI.getManufacturers({ pageSize: 100 });

    if (response.success && response.data) {
      // 确保数据结构正确
      const manufacturerData =
        response.data.manufacturers ||
        response.data.list ||
        response.data ||
        [];
      manufacturerOptions.value = manufacturerData.map((manufacturer) => ({
        id: manufacturer.id,
        code: manufacturer.code,
        name: manufacturer.name,
      }));
      console.log("厂商列表加载成功:", manufacturerOptions.value);
    } else {
      manufacturerOptions.value = [];
      console.warn("获取厂商列表失败:", response);
      if (response.message) {
        ElMessage.warning(response.message);
      }
    }
  } catch (error) {
    console.error("获取厂商列表失败:", error);
    manufacturerOptions.value = [];

    // 根据错误类型提供更友好的提示
    let errorMessage = "获取厂商列表失败";
    if (error.message.includes("网络")) {
      errorMessage = "网络连接失败，请检查网络连接";
    } else if (error.message.includes("401")) {
      errorMessage = "权限不足，请联系管理员";
    }

    ElMessage.error(errorMessage);
  }
};

/**
 * 获取协议配置列表
 */
const getProtocolConfigList = async () => {
  try {
    const response = await protocolConfigAPI.getProtocolConfigs({
      pageSize: 100,
    });

    if (response.success && response.data) {
      // 确保数据结构正确
      const protocolConfigData =
        response.data.list ||
        response.data.protocolConfigs ||
        response.data ||
        [];
      protocolConfigOptions.value = protocolConfigData.map((config) => ({
        id: config.id,
        name: config.name,
        version: config.version,
        manufacturerCode: config.manufacturer_code,
        deviceType: config.device_type,
        description: config.description,
      }));
      console.log("协议配置列表加载成功:", protocolConfigOptions.value);
    } else {
      protocolConfigOptions.value = [];
      console.warn("获取协议配置列表失败:", response);
      if (response.message) {
        ElMessage.warning(response.message);
      }
    }
  } catch (error) {
    console.error("获取协议配置列表失败:", error);
    protocolConfigOptions.value = [];

    // 根据错误类型提供更友好的提示
    let errorMessage = "获取协议配置列表失败";
    if (error.message.includes("网络")) {
      errorMessage = "网络连接失败，请检查网络连接";
    } else if (error.message.includes("401")) {
      errorMessage = "权限不足，请联系管理员";
    }

    ElMessage.error(errorMessage);
  }
};

/**
 * 厂商变化处理
 */
const onManufacturerChange = (manufacturerCode) => {
  console.log("厂商变化:", manufacturerCode);

  // 清空协议配置选择
  deviceForm.protocolConfigId = "";
  deviceForm.protocolConfigName = "";

  // 根据选择的厂商过滤协议配置选项
  if (manufacturerCode) {
    // 过滤出匹配厂商的协议配置
    const filteredConfigs = protocolConfigOptions.value.filter(
      (config) => config.manufacturerCode === manufacturerCode,
    );

    if (filteredConfigs.length > 0) {
      console.log(
        `找到 ${filteredConfigs.length} 个匹配厂商 ${manufacturerCode} 的协议配置`,
      );
    } else {
      console.log(
        `未找到匹配厂商 ${manufacturerCode} 的协议配置，显示所有配置`,
      );
    }
  }
};

/**
 * 订阅方式变化处理
 */

/**
 * WebSocket事件处理
 */
const handleDeviceStatusUpdate = (data) => {
  console.log("设备状态更新:", data);
  // 更新设备列表中的状态
  const device = deviceList.value.find(
    (d) => d.id === data.deviceId || d.id === data.device_id,
  );
  if (device) {
    device.status = data.status?.status || data.status || "online";
    device.last_seen_at = data.timestamp;
  }
};

const handleDeviceOffline = (data) => {
  console.log("设备离线通知:", data);
  // 显示离线通知
  ElNotification({
    title: "设备离线",
    message: `设备 ${data.imei || data.name || data.deviceId} 已离线`,
    type: "warning",
    duration: 5000,
  });

  // 更新设备列表中的状态
  const device = deviceList.value.find(
    (d) => d.id === data.deviceId || d.imei === data.imei,
  );
  if (device) {
    device.status = "offline";
    device.last_seen_at = data.timestamp;
  }
};

const handleDeviceData = (data) => {
  console.log("设备数据更新:", data);

  // 如果当前正在调试该设备，在接收数据区域显示数据
  if (
    debugDevice.value &&
    (debugDevice.value.id === data.deviceId ||
      debugDevice.value.id === data.device_id)
  ) {
    const dataTime = new Date().toLocaleString();
    const dataText =
      typeof data.data === "object"
        ? JSON.stringify(data.data, null, 2)
        : data.data;
    receivedData.value += `[${dataTime}] 设备数据: ${dataText}\n`;
  }

  // 更新设备列表中的状态（收到数据说明设备在线）
  const device = deviceList.value.find(
    (d) => d.id === data.deviceId || d.id === data.device_id,
  );
  if (device) {
    device.status = "online";
    device.last_seen_at = data.timestamp;
  }
};

/**
 * 处理设备响应数据
 */
const handleDeviceResponse = (data) => {
  console.log("设备响应数据:", data);

  // 如果当前正在调试该设备，在接收数据区域显示响应
  if (
    debugDevice.value &&
    (debugDevice.value.id === data.deviceId ||
      debugDevice.value.id === data.device_id)
  ) {
    const responseTime = new Date().toLocaleString();
    const responseText =
      typeof data.response === "object"
        ? JSON.stringify(data.response, null, 2)
        : data.response;
    receivedData.value += `[${responseTime}] 设备响应: ${responseText}\n`;
  }

  // 更新设备列表中的状态（收到响应说明设备在线）
  const device = deviceList.value.find(
    (d) => d.id === data.deviceId || d.id === data.device_id,
  );
  if (device) {
    device.status = "online";
    device.last_seen_at = data.timestamp;
  }
};

/**
 * 处理设备事件数据
 */
const handleDeviceEvent = (data) => {
  console.log("设备事件数据:", data);

  // 如果当前正在调试该设备，在接收数据区域显示事件
  if (
    debugDevice.value &&
    (debugDevice.value.imei === data.imei ||
      debugDevice.value.id === data.deviceId ||
      debugDevice.value.id === data.device_id)
  ) {
    const eventTime = new Date().toLocaleString();
    let eventText = "";

    if (data.payload) {
      eventText =
        typeof data.payload === "object"
          ? JSON.stringify(data.payload, null, 2)
          : data.payload;
    } else if (data.data) {
      eventText =
        typeof data.data === "object"
          ? JSON.stringify(data.data, null, 2)
          : data.data;
    }

    const messageType = data.messageType || "事件";
    const direction =
      data.direction === "incoming"
        ? "↓"
        : data.direction === "outgoing"
          ? "↑"
          : "•";
    const source = data.source || "mqtt";
    const topic = data.topic || "未知主题";

    receivedData.value += `[${eventTime}] ${direction} ${messageType} (${source})\n`;
    receivedData.value += `主题: ${topic}\n`;
    if (eventText) {
      receivedData.value += `数据: ${eventText}\n`;
    }
    receivedData.value += "---\n";
  }

  // 更新设备列表中的状态（收到事件说明设备在线）
  const device = deviceList.value.find(
    (d) =>
      d.imei === data.imei || d.id === data.deviceId || d.id === data.device_id,
  );
  if (device) {
    device.status = "online";
    device.last_seen_at = data.timestamp;
  }
};

/**
 * 处理设备心跳数据
 */
const handleDeviceHeartbeat = (data) => {
  console.log("设备心跳数据:", data);

  // 如果当前正在调试该设备，在接收数据区域显示心跳信息
  if (
    debugDevice.value &&
    (debugDevice.value.imei === data.imei ||
      debugDevice.value.id === data.deviceId ||
      debugDevice.value.id === data.device_id)
  ) {
    const heartbeatTime = new Date().toLocaleString();
    const direction = "💓 心跳";
    const source = data.source || "mqtt";
    const topic = data.topic || "未知主题";

    let heartbeatText = "";
    if (data.payload) {
      heartbeatText =
        typeof data.payload === "object"
          ? JSON.stringify(data.payload, null, 2)
          : data.payload;
    }

    receivedData.value += `[${heartbeatTime}] ${direction} (${source})\n`;
    receivedData.value += `主题: ${topic}\n`;
    if (data.dataSize) {
      receivedData.value += `大小: ${formatDataSize(data.dataSize)}\n`;
    }
    if (heartbeatText) {
      receivedData.value += `内容: ${heartbeatText}\n`;
    }
    receivedData.value += "---\n";
  }

  // 更新设备列表中的状态（收到心跳说明设备在线）
  const device = deviceList.value.find(
    (d) =>
      d.imei === data.imei || d.id === data.deviceId || d.id === data.device_id,
  );
  if (device) {
    device.status = "online";
    device.last_seen_at = data.timestamp;
  }
};

/**
 * 处理通信日志数据
 */
const handleCommunicationLog = (data) => {
  console.log("通信日志数据:", data);

  // 如果当前正在调试该设备，在接收数据区域显示通信日志
  if (
    debugDevice.value &&
    (debugDevice.value.imei === data.imei ||
      debugDevice.value.id === data.deviceId ||
      debugDevice.value.id === data.device_id)
  ) {
    const logTime = new Date().toLocaleString();
    const direction =
      data.direction === "incoming"
        ? "↓ 接收"
        : data.direction === "outgoing"
          ? "↑ 发送"
          : "• 系统";
    const messageType = data.messageType || data.type || "通信";
    const source = data.source || "mqtt";
    const topic = data.topic || "未知主题";

    let logText = "";
    if (data.payload) {
      logText =
        typeof data.payload === "object"
          ? JSON.stringify(data.payload, null, 2)
          : data.payload;
    } else if (data.data) {
      logText =
        typeof data.data === "object"
          ? JSON.stringify(data.data, null, 2)
          : data.data;
    }

    receivedData.value += `[${logTime}] ${direction} - ${messageType} (${source})\n`;
    receivedData.value += `主题: ${topic}\n`;
    if (data.dataSize) {
      receivedData.value += `大小: ${formatDataSize(data.dataSize)}\n`;
    }
    if (logText) {
      receivedData.value += `内容: ${logText}\n`;
    }
    receivedData.value += "---\n";
  }
};

/**
 * 设备分类标签类型
 */
const getCategoryTagType = (category) => {
  switch (category) {
    case "gateway":
      return "success";
    case "sub_device":
      return "warning";
    case "standalone":
    default:
      return "info";
  }
};

/**
 * 设备分类标签文本
 */
const getCategoryLabel = (category) => {
  switch (category) {
    case "gateway":
      return "网关";
    case "sub_device":
      return "子设备";
    case "standalone":
    default:
      return "独立";
  }
};

/**
 * 构建层级设备列表
 */
const buildHierarchicalDeviceList = () => {
  const result = [];
  const deviceMap = new Map();
  const processedDevices = new Set();

  // 创建设备映射
  deviceList.value.forEach((device) => {
    deviceMap.set(device.id, {
      ...device,
      children: [],
      level: 0,
      hasChildren: false,
    });
  });

  // 构建父子关系
  deviceList.value.forEach((device) => {
    const deviceNode = deviceMap.get(device.id);

    if (device.parent_device_id) {
      // 这是子设备
      const parent = deviceMap.get(device.parent_device_id);
      if (parent) {
        parent.children.push(deviceNode);
        parent.hasChildren = true;
        deviceNode.level = 1;
        processedDevices.add(device.id); // 标记子设备已被处理
      } else {
        deviceNode.level = 0;
        result.push(deviceNode);
        processedDevices.add(device.id);
      }
    } else {
      // 这是顶级设备（网关或独立设备）
      if (!processedDevices.has(device.id)) {
        result.push(deviceNode);
        processedDevices.add(device.id);
      }
    }
  });

  // 添加未被处理的顶级设备
  deviceList.value.forEach((device) => {
    if (!processedDevices.has(device.id) && !device.parent_device_id) {
      const deviceNode = deviceMap.get(device.id);
      result.push(deviceNode);
    }
  });

  // 递归展开已展开的设备
  const expandDevices = (devices) => {
    const expanded = [];
    devices.forEach((device) => {
      expanded.push(device);
      if (device.hasChildren && expandedRows.value.includes(device.id)) {
        expanded.push(...expandDevices(device.children));
      }
    });
    return expanded;
  };

  hierarchicalDeviceList.value = expandDevices(result);
};

/**
 * 处理设备展开/收起
 */
const handleExpandChange = (row, expanded) => {
  if (expanded) {
    // 展开设备
    if (!expandedRows.value.includes(row.id)) {
      expandedRows.value.push(row.id);
    }
  } else {
    // 收起设备
    const index = expandedRows.value.indexOf(row.id);
    if (index > -1) {
      expandedRows.value.splice(index, 1);
    }
  }

  // 重新构建层级列表
  buildHierarchicalDeviceList();
};

/**
 * 获取设备的子设备数量
 */
const getChildrenCount = (device) => {
  if (device.device_category !== "gateway") return 0;
  return deviceList.value.filter((d) => d.parent_device_id === device.id)
    .length;
};

/**
 * 组件挂载时获取数据
 */
onMounted(() => {
  getTenantList();
  getProjectOptions();
  getDeviceList();
  getDeviceTypeList();
  getManufacturerList();
  getProtocolConfigList();

  // 初始化WebSocket连接
  websocketService.connect();

  // 监听设备状态更新
  websocketService.on("device_status_update", handleDeviceStatusUpdate);
  websocketService.on("device_offline", handleDeviceOffline);
  websocketService.on("device_data", handleDeviceData);
  websocketService.on("device_response", handleDeviceResponse);
  websocketService.on("device_event", handleDeviceEvent);
  websocketService.on("device_heartbeat", handleDeviceHeartbeat);
  websocketService.on("communication_log", handleCommunicationLog);

  // 监听连接状态
  websocketService.on("connected", () => {
    console.log("WebSocket已连接");
  });

  websocketService.on("disconnected", () => {
    console.log("WebSocket已断开");
  });
});

/**
 * 组件卸载时清理资源
 */
onUnmounted(() => {
  // 移除WebSocket监听器
  websocketService.off("device_status_update", handleDeviceStatusUpdate);
  websocketService.off("device_offline", handleDeviceOffline);
  websocketService.off("device_data", handleDeviceData);
  websocketService.off("device_response", handleDeviceResponse);
  websocketService.off("device_event", handleDeviceEvent);
  websocketService.off("device_heartbeat", handleDeviceHeartbeat);
  websocketService.off("communication_log", handleCommunicationLog);

  // 断开WebSocket连接
  websocketService.disconnect();
});
</script>

<style lang="scss" scoped>
.device-management {
  .search-card {
    margin-bottom: 16px;
    border-top: 2px solid var(--primary-color);

    .text-right {
      text-align: right;
    }
  }

  .table-card {
    overflow: hidden;

    .batch-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 16px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--border-light);
    }

    .batch-toolbar__summary {
      display: flex;
      align-items: baseline;
      gap: 10px;

      span {
        color: var(--text-primary);
        font-weight: 600;
      }

      small {
        color: var(--text-secondary);
      }
    }

    .batch-toolbar__actions {
      display: flex;
      flex-shrink: 0;
      gap: 8px;

      :deep(.el-button + .el-button) {
        margin-left: 0;
      }
    }

    .pagination-container {
      margin-top: 20px;
      display: flex;
      justify-content: flex-end;
    }
  }

  .import-guide {
    margin-bottom: 16px;
    padding: 12px 14px;
    border-left: 3px solid var(--primary-color);
    background: var(--fill-lighter);
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.7;

    p {
      margin: 0;
    }
  }

  .device-import-upload {
    :deep(.el-upload),
    :deep(.el-upload-dragger) {
      width: 100%;
    }
  }

  .import-result {
    display: grid;
    gap: 12px;
    margin-top: 18px;
  }

  // 日志相关样式
  .log-details {
    cursor: pointer;
  }

  .log-data-container {
    .log-meta {
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border-light);

      p {
        margin: 5px 0;
        font-size: 13px;

        strong {
          color: var(--text-primary);
          margin-right: 8px;
        }
      }
    }

    .log-payload {
      strong {
        color: #303133;
        font-size: 13px;
        margin-bottom: 8px;
        display: block;
      }
    }
  }

  .log-data {
    background-color: var(--fill-lighter);
    border: 1px solid var(--border-light);
    border-radius: 4px;
    padding: 10px;
    font-family: "Courier New", monospace;
    font-size: 12px;
    line-height: 1.4;
    color: var(--text-primary);
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 300px;
    overflow-y: auto;
    margin: 0;
  }

  .dialog-footer {
    text-align: right;
  }

  .action-buttons {
    display: flex;
    gap: 8px;
    justify-content: center;
    align-items: center;
  }

  .parent-device {
    display: flex;
    align-items: center;
    color: var(--primary-color);
    font-size: 12px;

    .el-icon {
      margin-right: 4px;
    }
  }

  .gateway-info {
    display: flex;
    align-items: center;
    color: #67c23a;
    font-size: 12px;

    .el-icon {
      margin-right: 4px;
    }
  }

  .standalone-device {
    display: flex;
    align-items: center;
    color: var(--text-secondary);
    font-size: 12px;

    .el-icon {
      margin-right: 4px;
    }
  }

  .no-parent {
    color: var(--text-placeholder);
  }

  .log-header {
    margin-bottom: 20px;
    padding: 16px;
    background-color: var(--fill-lighter);
    border-radius: 4px;
  }

  .log-container {
    max-height: 500px;
    overflow-y: auto;

    .log-details {
      cursor: pointer;

      .el-text {
        text-decoration: underline;
      }
    }

    .log-data {
      background-color: var(--fill-lighter);
      padding: 12px;
      border-radius: 4px;
      font-size: 12px;
      line-height: 1.4;
      max-height: 300px;
      overflow-y: auto;
      margin: 0;
    }
  }

  .log-pagination {
    margin-top: 16px;
    text-align: right;
    padding-top: 16px;
    border-top: 1px solid var(--border-light);
  }

  .topic-hint {
    margin-top: 4px;
  }

  .topic-preview {
    background-color: var(--fill-lighter);
    border: 1px solid var(--border-light);
    border-radius: 4px;
    padding: 12px;

    .topic-item {
      display: flex;
      align-items: center;
      margin-bottom: 8px;

      &:last-child {
        margin-bottom: 0;
      }

      .topic-value {
        margin-left: 8px;
        font-family: "Courier New", monospace;
        background-color: var(--surface-color);
        padding: 2px 6px;
        border-radius: 3px;
        border: 1px solid var(--border-color);
      }
    }
  }

  .data-transfer-container {
    .device-info {
      margin-bottom: 20px;
      padding: 12px;
      background-color: var(--fill-lighter);
      border-radius: 4px;
      display: flex;
      align-items: center;

      .device-id {
        font-size: 16px;
        font-weight: 500;
        color: var(--text-primary);
      }
    }

    .data-section {
      margin-bottom: 20px;

      .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;

        .section-title {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
        }
      }

      .data-textarea {
        .el-textarea__inner {
          font-family: "Courier New", monospace;
          font-size: 12px;
          line-height: 1.4;
        }
      }
    }

    .send-section {
      display: flex;
      justify-content: flex-start;
      gap: 10px;
      margin-top: 20px;
    }
  }

  @media (max-width: 768px) {
    .search-card {
      :deep(.el-card__body) {
        padding: 12px;
      }

      :deep(.el-row) {
        row-gap: 10px;
      }

      :deep(.el-col) {
        max-width: 100%;
        flex: 0 0 100%;
      }

      :deep(.el-select) {
        width: 100%;
      }
    }

    .table-card {
      :deep(.el-card__body) {
        padding: 12px;
      }

      .batch-toolbar {
        align-items: stretch;
        flex-direction: column;
      }

      .batch-toolbar__summary {
        align-items: flex-start;
        flex-direction: column;
        gap: 2px;
      }

      .batch-toolbar__actions {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));

        :deep(.el-button) {
          width: 100%;
          padding-inline: 8px;
        }
      }

      .pagination-container {
        justify-content: flex-start;
        overflow-x: auto;
      }
    }
  }
}
</style>
