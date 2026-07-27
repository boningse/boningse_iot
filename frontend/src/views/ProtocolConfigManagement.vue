<template>
  <div class="protocol-config-management">
    <div class="header">
      <h2>协议配置管理</h2>
      <el-button v-if="isAdmin" type="primary" @click="showAddDialog">添加协议配置</el-button>
    </div>

    <!-- 搜索和筛选 -->
    <div class="search-section">
      <el-row :gutter="20">
        <el-col :span="6">
          <el-input
            v-model="searchKeyword"
            placeholder="搜索协议名称或描述"
            @input="handleSearch"
            clearable
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </el-col>
        <el-col :span="4">
          <el-select v-model="filterManufacturer" placeholder="选择厂商" clearable @change="handleSearch">
            <el-option
              v-for="manufacturer in manufacturers"
              :key="manufacturer.code"
              :label="manufacturer.name"
              :value="manufacturer.code"
            />
          </el-select>
        </el-col>
        <el-col :span="4">
          <el-select v-model="filterStatus" placeholder="选择状态" clearable @change="handleSearch">
            <el-option label="启用" value="active" />
            <el-option label="禁用" value="inactive" />
          </el-select>
        </el-col>
      </el-row>
    </div>

    <!-- 协议配置列表 -->
    <el-table :data="protocolConfigs" v-loading="loading" stripe>
      <el-table-column prop="name" label="协议名称" width="150" />
      <el-table-column prop="version" label="版本" width="100" />
      <el-table-column label="厂商" width="120">
        <template #default="{ row }">
          {{ row.manufacturer?.name || row.manufacturer_code }}
        </template>
      </el-table-column>
      <el-table-column prop="device_type" label="设备类型" width="120" />
      <el-table-column prop="description" label="描述" show-overflow-tooltip />
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'danger'">
            {{ row.status === 'active' ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="默认" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.is_default" type="warning">默认</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建者" width="100">
        <template #default="{ row }">
          {{ row.creator?.username || '-' }}
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="160">
        <template #default="{ row }">
          {{ formatDate(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="viewConfig(row)">查看</el-button>
          <el-button v-if="isAdmin" size="small" type="primary" @click="editConfig(row)">编辑</el-button>
          <el-button v-if="isAdmin" size="small" type="danger" @click="deleteConfig(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="pagination">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
      />
    </div>

    <!-- 添加/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑协议配置' : '添加协议配置'"
      width="80%"
      :before-close="handleDialogClose"
    >
      <el-form :model="formData" :rules="formRules" ref="formRef" label-width="120px">
        <el-form-item v-if="!isEdit" label="快速模板">
          <el-select v-model="selectedTemplateKey" placeholder="请选择控制设备模板" style="width: 100%" @change="applyProtocolTemplate">
            <el-option v-for="template in protocolTemplates" :key="template.key" :label="`${template.title} · ${template.deviceType}`" :value="template.key" />
          </el-select>
        </el-form-item>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="协议名称" prop="name">
              <el-input v-model="formData.name" placeholder="请输入协议名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="版本" prop="version">
              <el-input v-model="formData.version" placeholder="请输入版本号" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="协议类型" prop="protocol_type">
              <el-select v-model="formData.protocol_type" placeholder="选择协议类型" style="width: 100%" @change="handleProtocolTypeChange">
                <el-option label="JSON协议" value="json" />
                <el-option label="Modbus协议" value="modbus" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="厂商" prop="manufacturer_code">
              <el-select v-model="formData.manufacturer_code" placeholder="选择厂商" style="width: 100%">
                <el-option
                  v-for="manufacturer in manufacturers"
                  :key="manufacturer.code"
                  :label="manufacturer.name"
                  :value="manufacturer.code"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="设备类型" prop="device_type">
              <el-select v-model="formData.device_type" placeholder="选择设备类型" style="width: 100%" filterable allow-create>
                <el-option
                  v-for="deviceType in deviceTypes"
                  :key="deviceType.id"
                  :label="deviceType.name"
                  :value="deviceType.name"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="描述">
          <el-input
            v-model="formData.description"
            type="textarea"
            :rows="3"
            placeholder="请输入协议描述"
          />
        </el-form-item>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="状态">
              <el-select v-model="formData.status" style="width: 100%">
                <el-option label="启用" value="active" />
                <el-option label="禁用" value="inactive" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="设为默认">
              <el-switch v-model="formData.is_default" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <!-- 协议配置编辑器 -->
      <div class="config-editors">
        <!-- JSON协议配置 -->
        <div v-if="formData.protocol_type === 'json'">
          <div class="editor-mode-bar">
            <span>配置方式</span>
            <el-radio-group v-model="editorMode">
              <el-radio-button label="visual">可视化配置</el-radio-button>
              <el-radio-button label="advanced">高级 JSON</el-radio-button>
            </el-radio-group>
          </div>
          <el-tabs v-if="editorMode === 'visual'" v-model="visualTab">
            <el-tab-pane label="数据字段" name="fields">
              <div v-if="templateFields.length" class="field-mapping-panel">
                <div class="mapping-title"><span>数据字段映射</span><el-button type="primary" size="small" @click="addTemplateField">添加字段</el-button></div>
                <el-table :data="templateFields" size="small" border>
                  <el-table-column label="参数名称" min-width="150"><template #default="{ row }"><el-input v-model="row.label" @input="syncTemplateFields" /></template></el-table-column>
                  <el-table-column label="厂家上传字段" min-width="240"><template #default="{ row }"><el-input v-model="row.source" placeholder="例如 data.temperature" @input="syncTemplateFields" /></template></el-table-column>
                  <el-table-column label="系统字段" min-width="180"><template #default="{ row }"><el-input v-model="row.target" placeholder="例如 current_temperature" @input="syncTemplateFields" /></template></el-table-column>
                  <el-table-column label="数据类型" width="130"><template #default="{ row }"><el-select v-model="row.type" @change="syncTemplateFields"><el-option label="数字" value="number" /><el-option label="文本" value="string" /><el-option label="开关" value="boolean" /></el-select></template></el-table-column>
                  <el-table-column label="单位" width="110"><template #default="{ row }"><el-input v-model="row.unit" @input="syncTemplateFields" /></template></el-table-column>
                  <el-table-column label="缩放系数" width="150"><template #default="{ row }"><el-input-number v-model="row.scale" :precision="4" :step="0.1" @change="syncTemplateFields" /></template></el-table-column>
                  <el-table-column label="操作" width="80" fixed="right"><template #default="{ $index }"><el-button type="danger" text @click="removeTemplateField($index)">删除</el-button></template></el-table-column>
                </el-table>
              </div>
              <el-empty v-else description="请先选择快速模板" />
            </el-tab-pane>
            <el-tab-pane label="控制命令" name="commands">
              <div v-if="templateCommands.length" class="field-mapping-panel">
                <div class="mapping-title"><span>控制命令配置</span><el-button type="primary" size="small" @click="addTemplateCommand">添加命令</el-button></div>
                <el-table :data="templateCommands" size="small" border>
                  <el-table-column label="命令标识" min-width="150"><template #default="{ row }"><el-input v-model="row.name" @input="syncTemplateCommands" /></template></el-table-column>
                  <el-table-column label="用途" min-width="160"><template #default="{ row }"><el-input v-model="row.description" @input="syncTemplateCommands" /></template></el-table-column>
                  <el-table-column label="发布 Topic" min-width="250"><template #default="{ row }"><el-input v-model="row.topic" @input="syncTemplateCommands" /></template></el-table-column>
                  <el-table-column label="动作类型" min-width="140"><template #default="{ row }"><el-input v-model="row.payload.action" placeholder="如 mode" @input="syncTemplateCommands" /></template></el-table-column>
                  <el-table-column label="可选值" min-width="240"><template #default="{ row }"><el-input v-model="row.action_values" placeholder="如 0=送风；1=制热" @input="syncTemplateCommands" /></template></el-table-column>
                  <el-table-column label="参数范围" min-width="180"><template #default="{ row }"><el-input v-model="row.action_range" placeholder="如 16-30，步长0.1" @input="syncTemplateCommands" /></template></el-table-column>
                  <el-table-column label="操作" width="80" fixed="right"><template #default="{ $index }"><el-button type="danger" text @click="removeTemplateCommand($index)">删除</el-button></template></el-table-column>
                </el-table>
              </div>
              <el-empty v-else description="请先选择快速模板" />
            </el-tab-pane>
          </el-tabs>
          <el-tabs v-else v-model="activeTab">
            <el-tab-pane label="数据解析配置" name="data_parsing">
              <div class="editor-header">
                <span>数据解析配置 (JSON格式)</span>
                <el-button size="small" @click="loadTemplate('data_parsing')">加载JSON模板</el-button>
              </div>
              <el-input
                v-model="formData.data_parsing_config"
                type="textarea"
                :rows="10"
                placeholder="请输入JSON数据解析配置，例如：{&quot;temperature&quot;: &quot;$.data.temp&quot;, &quot;humidity&quot;: &quot;$.data.hum&quot;}"
              />
            </el-tab-pane>
            <el-tab-pane label="命令配置" name="command">
              <div class="editor-header">
                <span>命令配置 (JSON格式)</span>
                <el-button size="small" @click="loadTemplate('command')">加载JSON模板</el-button>
              </div>
              <el-input
                v-model="formData.command_config"
                type="textarea"
                :rows="10"
                placeholder="请输入JSON命令配置，例如：{&quot;turn_on&quot;: {&quot;action&quot;: &quot;control&quot;, &quot;value&quot;: 1}}"
              />
            </el-tab-pane>
            <el-tab-pane label="验证规则" name="validation">
              <div class="validation-rules-container">
                <div class="validation-rules-header">
                  <span>验证规则配置</span>
                  <el-button type="primary" size="small" @click="addValidationRule">添加规则</el-button>
                </div>
              <div v-if="formData.validation_rules_list && formData.validation_rules_list.length > 0" class="validation-rules-list">
                <div v-for="(rule, index) in formData.validation_rules_list" :key="index" class="validation-rule-item">
                  <el-card shadow="never" class="rule-card">
                    <template #header>
                      <div class="rule-header">
                        <span>规则 {{ index + 1 }}</span>
                        <el-button type="danger" size="small" text @click="removeValidationRule(index)">删除</el-button>
                      </div>
                    </template>
                    <el-row :gutter="16">
                      <el-col :span="8">
                        <el-form-item label="字段名称">
                          <el-input v-model="rule.field" placeholder="请输入字段名称" />
                        </el-form-item>
                      </el-col>
                      <el-col :span="8">
                        <el-form-item label="验证类型">
                          <el-select v-model="rule.type" placeholder="选择验证类型" style="width: 100%">
                            <el-option label="必填" value="required" />
                            <el-option label="数字" value="number" />
                            <el-option label="字符串" value="string" />
                            <el-option label="邮箱" value="email" />
                            <el-option label="正则表达式" value="regex" />
                            <el-option label="范围" value="range" />
                            <el-option label="长度" value="length" />
                          </el-select>
                        </el-form-item>
                      </el-col>
                      <el-col :span="8">
                        <el-form-item label="错误信息">
                          <el-input v-model="rule.message" placeholder="请输入错误提示信息" />
                        </el-form-item>
                      </el-col>
                    </el-row>
                    <el-row :gutter="16" v-if="rule.type === 'regex'">
                      <el-col :span="24">
                        <el-form-item label="正则表达式">
                          <el-input v-model="rule.pattern" placeholder="请输入正则表达式" />
                        </el-form-item>
                      </el-col>
                    </el-row>
                    <el-row :gutter="16" v-if="rule.type === 'range'">
                      <el-col :span="12">
                        <el-form-item label="最小值">
                          <el-input-number v-model="rule.min" placeholder="最小值" style="width: 100%" />
                        </el-form-item>
                      </el-col>
                      <el-col :span="12">
                        <el-form-item label="最大值">
                          <el-input-number v-model="rule.max" placeholder="最大值" style="width: 100%" />
                        </el-form-item>
                      </el-col>
                    </el-row>
                    <el-row :gutter="16" v-if="rule.type === 'length'">
                      <el-col :span="12">
                        <el-form-item label="最小长度">
                          <el-input-number v-model="rule.minLength" placeholder="最小长度" style="width: 100%" />
                        </el-form-item>
                      </el-col>
                      <el-col :span="12">
                        <el-form-item label="最大长度">
                          <el-input-number v-model="rule.maxLength" placeholder="最大长度" style="width: 100%" />
                        </el-form-item>
                      </el-col>
                    </el-row>
                  </el-card>
                </div>
              </div>
              <div v-else class="no-rules">
                <el-empty description="暂无验证规则，点击上方按钮添加" />
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>

      <!-- Modbus协议配置 -->
      <div v-else-if="formData.protocol_type === 'modbus'">
        <el-tabs v-model="activeTab">
          <el-tab-pane label="寄存器配置" name="modbus_registers">
            <div class="editor-header">
              <span>Modbus寄存器配置</span>
              <el-button size="small" @click="loadTemplate('modbus_registers')">加载Modbus模板</el-button>
            </div>
            <div class="modbus-config-section">
              <el-row :gutter="20">
                <el-col :span="8">
                  <el-form-item label="波特率">
                    <el-select v-model="formData.modbus_config.baud_rate" style="width: 100%">
                      <el-option label="9600" :value="9600" />
                      <el-option label="19200" :value="19200" />
                      <el-option label="38400" :value="38400" />
                      <el-option label="57600" :value="57600" />
                      <el-option label="115200" :value="115200" />
                    </el-select>
                  </el-form-item>
                </el-col>
                <el-col :span="8">
                  <el-form-item label="数据位">
                    <el-select v-model="formData.modbus_config.data_bits" style="width: 100%">
                      <el-option label="7" :value="7" />
                      <el-option label="8" :value="8" />
                    </el-select>
                  </el-form-item>
                </el-col>
                <el-col :span="8">
                  <el-form-item label="停止位">
                    <el-select v-model="formData.modbus_config.stop_bits" style="width: 100%">
                      <el-option label="1" :value="1" />
                      <el-option label="2" :value="2" />
                    </el-select>
                  </el-form-item>
                </el-col>
              </el-row>
              <el-row :gutter="20">
                <el-col :span="8">
                  <el-form-item label="校验位">
                    <el-select v-model="formData.modbus_config.parity" style="width: 100%">
                      <el-option label="无" value="none" />
                      <el-option label="奇校验" value="odd" />
                      <el-option label="偶校验" value="even" />
                    </el-select>
                  </el-form-item>
                </el-col>
                <el-col :span="8">
                  <el-form-item label="超时时间(ms)">
                    <el-input-number v-model="formData.modbus_config.timeout" :min="100" :max="10000" style="width: 100%" />
                  </el-form-item>
                </el-col>
              </el-row>
            </div>
            
            <div class="modbus-registers-section">
              <div class="section-header">
                <span>寄存器映射配置</span>
                <el-button type="primary" size="small" @click="addModbusRegister">添加寄存器</el-button>
              </div>
              <div v-if="formData.modbus_registers && formData.modbus_registers.length > 0" class="registers-list">
                <div v-for="(register, index) in formData.modbus_registers" :key="index" class="register-item">
                  <el-card shadow="never" class="register-card">
                    <template #header>
                      <div class="register-header">
                        <span>寄存器 {{ index + 1 }}</span>
                        <el-button type="danger" size="small" text @click="removeModbusRegister(index)">删除</el-button>
                      </div>
                    </template>
                    <el-row :gutter="16">
                      <el-col :span="6">
                        <el-form-item label="数据名称">
                          <el-input v-model="register.name" placeholder="如：temperature" />
                        </el-form-item>
                      </el-col>
                      <el-col :span="6">
                        <el-form-item label="功能码">
                          <el-select v-model="register.function_code" style="width: 100%">
                            <el-option label="01 - 读线圈" :value="1" />
                            <el-option label="02 - 读离散输入" :value="2" />
                            <el-option label="03 - 读保持寄存器" :value="3" />
                            <el-option label="04 - 读输入寄存器" :value="4" />
                            <el-option label="05 - 写单个线圈" :value="5" />
                            <el-option label="06 - 写单个寄存器" :value="6" />
                            <el-option label="15 - 写多个线圈" :value="15" />
                            <el-option label="16 - 写多个寄存器" :value="16" />
                          </el-select>
                        </el-form-item>
                      </el-col>
                      <el-col :span="6">
                        <el-form-item label="起始地址">
                          <el-input-number v-model="register.address" :min="0" :max="65535" style="width: 100%" />
                        </el-form-item>
                      </el-col>
                      <el-col :span="6">
                        <el-form-item label="数量">
                          <el-input-number v-model="register.count" :min="1" :max="125" style="width: 100%" />
                        </el-form-item>
                      </el-col>
                    </el-row>
                    <el-row :gutter="16">
                      <el-col :span="8">
                        <el-form-item label="数据类型">
                          <el-select v-model="register.data_type" style="width: 100%">
                            <el-option label="16位整数" value="int16" />
                            <el-option label="32位整数" value="int32" />
                            <el-option label="32位浮点" value="float32" />
                            <el-option label="布尔值" value="boolean" />
                            <el-option label="字符串" value="string" />
                          </el-select>
                        </el-form-item>
                      </el-col>
                      <el-col :span="8">
                        <el-form-item label="字节序">
                          <el-select v-model="register.byte_order" style="width: 100%">
                            <el-option label="大端序(AB CD)" value="big" />
                            <el-option label="小端序(BA DC)" value="little" />
                            <el-option label="大端字序(CD AB)" value="big_word" />
                            <el-option label="小端字序(DC BA)" value="little_word" />
                          </el-select>
                        </el-form-item>
                      </el-col>
                      <el-col :span="8">
                        <el-form-item label="缩放因子">
                          <el-input-number v-model="register.scale" :precision="4" style="width: 100%" />
                        </el-form-item>
                      </el-col>
                    </el-row>
                    <el-row :gutter="16">
                      <el-col :span="12">
                        <el-form-item label="单位">
                          <el-input v-model="register.unit" placeholder="如：°C, %, V" />
                        </el-form-item>
                      </el-col>
                      <el-col :span="12">
                        <el-form-item label="描述">
                          <el-input v-model="register.description" placeholder="寄存器描述" />
                        </el-form-item>
                      </el-col>
                    </el-row>
                  </el-card>
                </div>
              </div>
              <div v-else class="no-registers">
                <el-empty description="暂无寄存器配置，点击上方按钮添加" />
              </div>
            </div>
          </el-tab-pane>
          
          <el-tab-pane label="MQTT映射" name="modbus_mqtt">
            <div class="editor-header">
              <span>Modbus到MQTT的数据映射配置</span>
            </div>
            <el-form label-width="120px">
              <el-form-item label="发布主题">
                <el-input v-model="formData.modbus_config.mqtt_topic_prefix" placeholder="默认为所属设备的发布主题" />
              </el-form-item>
              <el-form-item label="数据格式">
                <el-radio-group v-model="formData.modbus_config.data_format">
                  <el-radio label="json">JSON格式</el-radio>
                  <el-radio label="hex">Hex格式</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="RTU格式">
                <el-select v-model="formData.modbus_config.rtu_format" style="width: 200px" clearable>
                  <el-option label="" value="" />
                  <el-option label="标准RTU" value="standard" />
                  <el-option label="扩展RTU" value="extended" />
                  <el-option label="自定义RTU" value="custom" />
                </el-select>
                <div class="form-item-tip">选择Modbus RTU通信报文格式，默认为标准RTU</div>
              </el-form-item>
              <el-form-item label="轮询间隔">
                <el-input-number 
                  v-model="formData.modbus_config.polling_interval" 
                  :min="1000" 
                  :max="300000" 
                  :step="1000"
                  style="width: 200px" 
                />
                <span style="margin-left: 8px; color: #909399;">毫秒</span>
                <div class="form-item-tip">设备按此间隔发布所有电表的采集指令，范围：1-300秒</div>
              </el-form-item>
              <el-form-item label="错误处理">
                <el-checkbox v-model="formData.modbus_config.retry_on_error">通信错误时重试</el-checkbox>
              </el-form-item>
              <el-form-item label="重试次数" v-if="formData.modbus_config.retry_on_error">
                <el-input-number v-model="formData.modbus_config.max_retries" :min="1" :max="10" style="width: 200px" />
              </el-form-item>
            </el-form>
          </el-tab-pane>
        </el-tabs>
      </div>

      <!-- 未选择协议类型时的提示 -->
      <div v-else class="protocol-type-hint">
        <el-empty description="请先选择协议类型" />
      </div>
    </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveConfig">保存</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 查看配置对话框 -->
    <el-dialog v-model="viewDialogVisible" title="查看协议配置" width="70%">
      <div v-if="viewData">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="协议名称">{{ viewData.name }}</el-descriptions-item>
          <el-descriptions-item label="版本">{{ viewData.version }}</el-descriptions-item>
          <el-descriptions-item label="厂商">{{ viewData.manufacturer?.name || viewData.manufacturer_code }}</el-descriptions-item>
          <el-descriptions-item label="设备类型">{{ viewData.device_type }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="viewData.status === 'active' ? 'success' : 'danger'">
              {{ viewData.status === 'active' ? '启用' : '禁用' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="是否默认">
            <el-tag v-if="viewData.is_default" type="warning">是</el-tag>
            <span v-else>否</span>
          </el-descriptions-item>
          <el-descriptions-item label="描述" :span="2">{{ viewData.description || '-' }}</el-descriptions-item>
        </el-descriptions>

        <div class="config-view" style="margin-top: 20px;">
          <el-tabs>
            <el-tab-pane label="数据解析配置">
              <pre class="json-view">{{ formatJSON(viewData.data_parsing_config) }}</pre>
            </el-tab-pane>
            <el-tab-pane label="命令配置">
              <pre class="json-view">{{ formatJSON(viewData.command_config) }}</pre>
            </el-tab-pane>
            <el-tab-pane label="验证规则">
              <pre class="json-view">{{ formatJSON(viewData.validation_rules) }}</pre>
            </el-tab-pane>
          </el-tabs>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import protocolConfigAPI from '../api/protocolConfig.js'
import { manufacturerAPI, deviceTypeAPI } from '../api/index.js'
import { protocolTemplates, getProtocolTemplate } from '../config/protocolTemplates.js'

export default {
  name: 'ProtocolConfigManagement',
  components: {
    Search
  },
  setup() {
    // 响应式数据
    const loading = ref(false)
    const protocolConfigs = ref([])
    const manufacturers = ref([])
    const total = ref(0)
    const currentPage = ref(1)
    const pageSize = ref(10)
    const searchKeyword = ref('')
    const filterManufacturer = ref('')
    const filterStatus = ref('')
    const userInfo = ref(JSON.parse(localStorage.getItem('userInfo') || '{}'))
    const isAdmin = computed(() => userInfo.value?.role === 'admin')
    
    // 对话框相关
    const dialogVisible = ref(false)
    const viewDialogVisible = ref(false)
    const isEdit = ref(false)
    const activeTab = ref('data_parsing')
    const viewData = ref(null)
    const selectedTemplateKey = ref('')
    const templateFields = ref([])
    const templateCommands = ref([])
    const editorMode = ref('visual')
    const visualTab = ref('fields')
    
    // 表单数据
    const formData = reactive({
      name: '',
      version: '',
      protocol_type: '',
      manufacturer_code: '',
      device_type: '',
      description: '',
      data_parsing_config: '',
      command_config: '',
      validation_rules: '',
      validation_rules_list: [],
      modbus_config: {
        baud_rate: 9600,
        data_bits: 8,
        stop_bits: 1,
        parity: 'none',
        timeout: 1000,
        mqtt_topic_prefix: '',
        data_format: 'hex',
        retry_on_error: true,
        max_retries: 3,
        rtu_format: '',
        polling_interval: 5000
      },
      modbus_registers: [],
      status: 'active',
      is_default: false
    })
    
    // 表单验证规则
    const formRules = {
      name: [{ required: true, message: '请输入协议名称', trigger: 'blur' }],
      version: [{ required: true, message: '请输入版本号', trigger: 'blur' }],
      protocol_type: [{ required: true, message: '请选择协议类型', trigger: 'change' }],
      manufacturer_code: [{ required: true, message: '请选择厂商', trigger: 'change' }],
      device_type: [{ required: true, message: '请输入设备类型', trigger: 'blur' }]
    }
    
    const formRef = ref(null)
    
    // 获取协议配置列表
    const getProtocolConfigs = async () => {
      loading.value = true
      try {
        const params = {
          page: currentPage.value,
          pageSize: pageSize.value,
          keyword: searchKeyword.value,
          manufacturerCode: filterManufacturer.value,
          status: filterStatus.value
        }
        
        const response = await protocolConfigAPI.getProtocolConfigs(params)
        if (response.success) {
          protocolConfigs.value = response.data.list
          total.value = response.data.pagination.total
        }
      } catch (error) {
        ElMessage.error('获取协议配置列表失败')
      } finally {
        loading.value = false
      }
    }
    
    // 获取厂商列表
    const getManufacturers = async () => {
      try {
        const response = await manufacturerAPI.getManufacturers()
        if (response.success) {
          // 后端返回的数据结构是 { data: { manufacturers: [...] } }
          manufacturers.value = response.data.manufacturers || response.data.list || response.data || []
          console.log('获取厂商列表成功:', manufacturers.value)
        }
      } catch (error) {
        console.error('获取厂商列表失败:', error)
        ElMessage.error('获取厂商列表失败')
      }
    }

    // 获取设备类型列表
    const deviceTypes = ref([])
    const getDeviceTypes = async () => {
      try {
        const response = await deviceTypeAPI.getDeviceTypes()
        if (response.success) {
          deviceTypes.value = response.data.list || response.data || []
        }
      } catch (error) {
        console.error('获取设备类型列表失败:', error)
        ElMessage.error('获取设备类型列表失败')
      }
    }
    
    // 搜索处理
    const handleSearch = () => {
      currentPage.value = 1
      getProtocolConfigs()
    }
    
    // 分页处理
    const handleSizeChange = (size) => {
      pageSize.value = size
      getProtocolConfigs()
    }
    
    const handleCurrentChange = (page) => {
      currentPage.value = page
      getProtocolConfigs()
    }
    
    // 显示添加对话框
    const showAddDialog = () => {
      if (!isAdmin.value) return
      isEdit.value = false
      resetForm()
      dialogVisible.value = true
    }
    
    // 编辑配置
    const editConfig = (row) => {
      if (!isAdmin.value) return
      isEdit.value = true
      Object.assign(formData, {
        id: row.id,
        name: row.name,
        version: row.version,
        protocol_type: row.protocol_type || 'json',
        manufacturer_code: row.manufacturer_code,
        device_type: row.device_type,
        description: row.description,
        data_parsing_config: typeof row.data_parsing_config === 'object' 
          ? JSON.stringify(row.data_parsing_config, null, 2) 
          : row.data_parsing_config || '',
        command_config: typeof row.command_config === 'object' 
          ? JSON.stringify(row.command_config, null, 2) 
          : row.command_config || '',
        validation_rules: typeof row.validation_rules === 'object' 
          ? JSON.stringify(row.validation_rules, null, 2) 
          : row.validation_rules || '',
        validation_rules_list: Array.isArray(row.validation_rules) 
          ? [...row.validation_rules] 
          : [],
        modbus_config: row.modbus_config || {
          baud_rate: 9600,
          data_bits: 8,
          stop_bits: 1,
          parity: 'none',
          timeout: 1000,
          mqtt_topic_prefix: 'modbus/device',
          data_format: 'json',
          retry_on_error: true,
          max_retries: 3
        },
        modbus_registers: row.modbus_registers || [],
        status: row.status,
        is_default: row.is_default
      })
      hydrateVisualConfig()
      dialogVisible.value = true
    }
    
    // 查看配置
    const viewConfig = (row) => {
      viewData.value = row
      viewDialogVisible.value = true
    }
    
    // 删除配置
    const deleteConfig = async (row) => {
      if (!isAdmin.value) return
      try {
        await ElMessageBox.confirm('确定要删除这个协议配置吗？', '确认删除', {
          type: 'warning'
        })
        
        const response = await protocolConfigAPI.deleteProtocolConfig(row.id)
        if (response.success) {
          ElMessage.success('删除成功')
          getProtocolConfigs()
        }
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('删除失败')
        }
      }
    }
    
    // 保存配置
    const saveConfig = async () => {
      try {
        await formRef.value.validate()
        
        // 验证JSON格式
        const jsonFields = ['data_parsing_config', 'command_config', 'validation_rules']
        for (const field of jsonFields) {
          if (formData[field]) {
            try {
              JSON.parse(formData[field])
            } catch (e) {
              ElMessage.error(`${field === 'data_parsing_config' ? '数据解析配置' : 
                field === 'command_config' ? '命令配置' : '验证规则'}格式错误`)
              return
            }
          }
        }
        
        const data = { ...formData }
        // 转换JSON字符串为对象
        jsonFields.forEach(field => {
          if (data[field]) {
            data[field] = JSON.parse(data[field])
          }
        })
        
        // 如果有验证规则列表，将其转换为validation_rules
        if (data.validation_rules_list && data.validation_rules_list.length > 0) {
          data.validation_rules = data.validation_rules_list
        }
        
        // 删除临时字段
        delete data.validation_rules_list
        
        let response
        if (isEdit.value) {
          response = await protocolConfigAPI.updateProtocolConfig(data.id, data)
        } else {
          response = await protocolConfigAPI.createProtocolConfig(data)
        }
        
        if (response.success) {
          ElMessage.success(isEdit.value ? '更新成功' : '创建成功')
          dialogVisible.value = false
          getProtocolConfigs()
        } else {
          ElMessage.error(response.message || '保存失败')
        }
      } catch (error) {
        console.error('保存失败:', error)
        ElMessage.error('保存失败，请检查网络连接或联系管理员')
      }
    }
    
    // 协议类型变化处理
    const handleProtocolTypeChange = (type) => {
      // 切换协议类型时重置相关配置
      if (type === 'json') {
        activeTab.value = 'data_parsing'
      } else if (type === 'modbus') {
        activeTab.value = 'modbus_registers'
        // 初始化Modbus配置
        if (!formData.modbus_config.baud_rate) {
          Object.assign(formData.modbus_config, {
            baud_rate: 9600,
            data_bits: 8,
            stop_bits: 1,
            parity: 'none',
            timeout: 1000,
            mqtt_topic_prefix: 'modbus/device',
            data_format: 'json',
            retry_on_error: true,
            max_retries: 3
          })
        }
      }
    }

    const syncTemplateFields = () => {
      let config = { format: 'json', fields: [] }
      try {
        config = JSON.parse(formData.data_parsing_config || '{}')
      } catch {
        // Visual mappings remain the source of truth while a template is active.
      }
      config.format = 'json'
      const fields = templateFields.value.map((item) => ({ ...item }))
      const standardFields = Array.isArray(config.fields) && config.fields.every((item) => item.source && item.target)
      if (standardFields || !config.fields) config.fields = fields
      config.visual_config = { ...(config.visual_config || {}), fields }
      formData.data_parsing_config = JSON.stringify(config, null, 2)
    }

    const syncTemplateCommands = () => {
      let config = {}
      try { config = JSON.parse(formData.command_config || '{}') } catch { config = {} }
      const commands = templateCommands.value.map((item) => ({ ...item, payload: { ...item.payload } }))
      if (Array.isArray(config.commands) || !config.commands) config.commands = commands
      config.visual_config = { ...(config.visual_config || {}), commands }
      formData.command_config = JSON.stringify(config, null, 2)
    }

    const addTemplateField = () => {
      templateFields.value.push({ name: 'custom_field', label: '自定义字段', source: '', target: 'custom_field', type: 'number', unit: '', scale: 1, description: '自定义字段' })
      syncTemplateFields()
    }

    const removeTemplateField = (index) => {
      templateFields.value.splice(index, 1)
      syncTemplateFields()
    }

    const addTemplateCommand = () => {
      templateCommands.value.push({ name: 'custom_command', description: '自定义命令', topic: '{publish_topic}', payload: { action: 'custom' }, action_values: '', action_range: '' })
      syncTemplateCommands()
    }

    const removeTemplateCommand = (index) => {
      templateCommands.value.splice(index, 1)
      syncTemplateCommands()
    }

    const hydrateVisualConfig = () => {
      try {
        const parsing = JSON.parse(formData.data_parsing_config || '{}')
        const fields = parsing.visual_config?.fields || parsing.fields
        templateFields.value = Array.isArray(fields)
          ? fields.map((item) => ({ label: item.label || item.description || item.name, source: item.source || item.path || item.field || item.name, target: item.target || item.name, scale: item.scale ?? 1, unit: item.unit || '', type: item.type === 'float' || item.type === 'integer' ? 'number' : (item.type || 'number'), ...item }))
          : []
      } catch {
        templateFields.value = []
      }
      try {
        const commands = JSON.parse(formData.command_config || '{}')
        const commandList = commands.visual_config?.commands || commands.commands
        templateCommands.value = Array.isArray(commandList)
          ? commandList.map((item) => ({ ...item, action_values: item.action_values || '', action_range: item.action_range || '', payload: { action: '', ...(item.payload || {}) } }))
          : []
      } catch {
        templateCommands.value = []
      }
    }

    const applyProtocolTemplate = (key) => {
      const template = getProtocolTemplate(key)
      if (!template) return
      templateFields.value = template.fields.map((item) => ({ ...item }))
      templateCommands.value = template.commands.map((item) => ({ ...item, payload: { ...item.payload } }))
      formData.protocol_type = 'json'
      formData.device_type = template.deviceType
      formData.name = `${template.title}协议`
      formData.version = formData.version || '1.0'
      formData.description = template.description
      formData.data_parsing_config = JSON.stringify({ format: 'json', fields: templateFields.value }, null, 2)
      formData.command_config = JSON.stringify({ commands: template.commands }, null, 2)
      formData.validation_rules = JSON.stringify({ required_fields: ['device_id'], template: template.key }, null, 2)
      activeTab.value = 'data_parsing'
      editorMode.value = 'visual'
      visualTab.value = 'fields'
      ElMessage.success(`已载入${template.title}模板`)
    }

    // 加载模板
    const loadTemplate = async (type) => {
      try {
        const response = await protocolConfigAPI.getTemplate()
        if (response.success) {
          const template = response.data
          if (type === 'data_parsing') {
            formData.data_parsing_config = JSON.stringify(template.data_parsing_config, null, 2)
          } else if (type === 'command') {
            formData.command_config = JSON.stringify(template.command_config, null, 2)
          } else if (type === 'validation') {
            formData.validation_rules = JSON.stringify(template.validation_rules, null, 2)
          } else if (type === 'modbus_registers') {
            // 加载智能电表Modbus寄存器模板
            const electricMeterTemplate = [
              { name: '总有功电能', function_code: 4, address: 0, count: 2, data_type: 'uint32', byte_order: 'big', scale: 0.01, unit: 'kWh', description: '总有功电能' },
              { name: '正向有功电能', function_code: 4, address: 2, count: 2, data_type: 'uint32', byte_order: 'big', scale: 0.01, unit: 'kWh', description: '正向有功电能' },
              { name: '反向有功电能', function_code: 4, address: 4, count: 2, data_type: 'uint32', byte_order: 'big', scale: 0.01, unit: 'kWh', description: '反向有功电能' },
              { name: 'A相电流', function_code: 4, address: 6, count: 1, data_type: 'uint16', byte_order: 'big', scale: 0.01, unit: 'A', description: 'A相电流' },
              { name: 'B相电流', function_code: 4, address: 7, count: 1, data_type: 'uint16', byte_order: 'big', scale: 0.01, unit: 'A', description: 'B相电流' },
              { name: 'C相电流', function_code: 4, address: 8, count: 1, data_type: 'uint16', byte_order: 'big', scale: 0.01, unit: 'A', description: 'C相电流' },
              { name: 'A相电压', function_code: 4, address: 9, count: 1, data_type: 'uint16', byte_order: 'big', scale: 0.1, unit: 'V', description: 'A相电压' },
              { name: 'B相电压', function_code: 4, address: 10, count: 1, data_type: 'uint16', byte_order: 'big', scale: 0.1, unit: 'V', description: 'B相电压' },
              { name: 'C相电压', function_code: 4, address: 11, count: 1, data_type: 'uint16', byte_order: 'big', scale: 0.1, unit: 'V', description: 'C相电压' },
              { name: 'AB线电压', function_code: 4, address: 12, count: 1, data_type: 'uint16', byte_order: 'big', scale: 0.1, unit: 'V', description: 'AB线电压' },
              { name: 'BC线电压', function_code: 4, address: 14, count: 1, data_type: 'uint16', byte_order: 'big', scale: 0.1, unit: 'V', description: 'BC线电压' },
              { name: 'CA线电压', function_code: 4, address: 13, count: 1, data_type: 'uint16', byte_order: 'big', scale: 0.1, unit: 'V', description: 'CA线电压' },
              { name: 'A相功率', function_code: 4, address: 15, count: 2, data_type: 'uint32', byte_order: 'big', scale: 0.001, unit: 'kW', description: 'A相功率' },
              { name: 'B相功率', function_code: 4, address: 17, count: 2, data_type: 'uint32', byte_order: 'big', scale: 0.001, unit: 'kW', description: 'B相功率' },
              { name: 'C相功率', function_code: 4, address: 19, count: 2, data_type: 'uint32', byte_order: 'big', scale: 0.001, unit: 'kW', description: 'C相功率' },
              { name: 'ABC相总功率', function_code: 4, address: 21, count: 2, data_type: 'uint32', byte_order: 'big', scale: 0.001, unit: 'kW', description: 'ABC相总功率' },
              { name: 'A相功率因数', function_code: 4, address: 23, count: 1, data_type: 'int16', byte_order: 'big', scale: 0.001, unit: '', description: 'A相功率因数' },
              { name: 'B相功率因数', function_code: 4, address: 24, count: 1, data_type: 'int16', byte_order: 'big', scale: 0.001, unit: '', description: 'B相功率因数' },
              { name: 'C相功率因数', function_code: 4, address: 25, count: 1, data_type: 'int16', byte_order: 'big', scale: 0.001, unit: '', description: 'C相功率因数' },
              { name: 'ABC相总功率因数', function_code: 4, address: 26, count: 1, data_type: 'int16', byte_order: 'big', scale: 0.001, unit: '', description: 'ABC相总功率因数' },
              { name: 'A相温度', function_code: 4, address: 27, count: 1, data_type: 'int16', byte_order: 'big', scale: 0.1, unit: '°C', description: 'A相温度' },
              { name: 'B相温度', function_code: 4, address: 28, count: 1, data_type: 'int16', byte_order: 'big', scale: 0.1, unit: '°C', description: 'B相温度' },
              { name: 'C相温度', function_code: 4, address: 29, count: 1, data_type: 'int16', byte_order: 'big', scale: 0.1, unit: '°C', description: 'C相温度' },
              { name: 'frequency', function_code: 4, address: 30, count: 1, data_type: 'uint16', byte_order: 'big', scale: 0.01, unit: 'Hz', description: '频率' }
            ]
            formData.modbus_registers.push(...electricMeterTemplate)
          }
        }
      } catch (error) {
        ElMessage.error('加载模板失败')
      }
    }

    // 添加Modbus寄存器
    const addModbusRegister = () => {
      formData.modbus_registers.push({
        name: '',
        function_code: 3,
        address: 0,
        count: 1,
        data_type: 'int16',
        byte_order: 'big',
        scale: 1,
        unit: '',
        description: ''
      })
    }

    // 删除Modbus寄存器
    const removeModbusRegister = (index) => {
      formData.modbus_registers.splice(index, 1)
    }
    
    // 添加验证规则
    const addValidationRule = () => {
      formData.validation_rules_list.push({
        field: '',
        type: 'required',
        message: '',
        pattern: '',
        min: null,
        max: null,
        minLength: null,
        maxLength: null
      })
    }
    
    // 删除验证规则
    const removeValidationRule = (index) => {
      formData.validation_rules_list.splice(index, 1)
    }
    
    // 重置表单
    const resetForm = () => {
      selectedTemplateKey.value = ''
      templateFields.value = []
      templateCommands.value = []
      editorMode.value = 'visual'
      visualTab.value = 'fields'
      Object.assign(formData, {
        name: '',
        version: '',
        protocol_type: '',
        manufacturer_code: '',
        device_type: '',
        description: '',
        data_parsing_config: '',
        command_config: '',
        validation_rules: '',
        validation_rules_list: [],
        modbus_config: {
          baud_rate: 9600,
          data_bits: 8,
          stop_bits: 1,
          parity: 'none',
          timeout: 1000,
          mqtt_topic_prefix: 'modbus/device',
          data_format: 'hex',
          retry_on_error: true,
          max_retries: 3,
          rtu_format: '',
          polling_interval: 5000
        },
        modbus_registers: [],
        status: 'active',
        is_default: false
      })
      if (formRef.value) {
        formRef.value.clearValidate()
      }
    }
    
    // 对话框关闭处理
    const handleDialogClose = () => {
      resetForm()
      dialogVisible.value = false
    }
    
    // 格式化日期
    const formatDate = (date) => {
      if (!date) return '-'
      return new Date(date).toLocaleString('zh-CN')
    }
    
    // 格式化JSON显示
    const formatJSON = (data) => {
      if (!data) return '无配置'
      if (typeof data === 'string') {
        try {
          return JSON.stringify(JSON.parse(data), null, 2)
        } catch (e) {
          return data
        }
      }
      return JSON.stringify(data, null, 2)
    }
    
    // 初始化
    onMounted(() => {
      getProtocolConfigs()
      getManufacturers()
      getDeviceTypes()
    })
    
    return {
      loading,
      protocolConfigs,
      manufacturers,
      deviceTypes,
      total,
      currentPage,
      pageSize,
      searchKeyword,
      filterManufacturer,
      filterStatus,
      isAdmin,
      protocolTemplates,
      selectedTemplateKey,
      templateFields,
      templateCommands,
      editorMode,
      visualTab,
      dialogVisible,
      viewDialogVisible,
      isEdit,
      activeTab,
      viewData,
      formData,
      formRules,
      formRef,
      getProtocolConfigs,
      getDeviceTypes,
      handleSearch,
      handleSizeChange,
      handleCurrentChange,
      showAddDialog,
      editConfig,
      viewConfig,
      deleteConfig,
      saveConfig,
      handleProtocolTypeChange,
      applyProtocolTemplate,
      syncTemplateFields,
      syncTemplateCommands,
      addTemplateField,
      removeTemplateField,
      addTemplateCommand,
      removeTemplateCommand,
      loadTemplate,
      addValidationRule,
      removeValidationRule,
      addModbusRegister,
      removeModbusRegister,
      handleDialogClose,
      formatDate,
      formatJSON
    }
  }
}
</script>

<style scoped>
.protocol-config-management {
  padding: 0;
  color: var(--text-primary);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  min-height: 42px;
}

.header h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
}

.search-section {
  margin-bottom: 20px;
  padding: 20px;
  border: 1px solid var(--border-light);
  border-top: 2px solid var(--primary-color);
  border-radius: 6px;
  background: var(--surface-color);
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.config-editors {
  margin-top: 20px;
}

.field-mapping-panel {
  margin-bottom: 18px;
  padding: 12px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  background: var(--fill-lighter);
}

.editor-mode-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  background: var(--surface-color);
}

.editor-mode-bar > span {
  color: var(--text-primary);
  font-weight: 600;
}

.mapping-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  color: var(--text-primary);
  font-weight: 600;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-weight: bold;
}

.json-view {
  color: var(--text-primary);
  background: var(--fill-lighter);
  padding: 15px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
  max-height: 400px;
  overflow-y: auto;
}

.config-view {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 15px;
}

.validation-rules-container {
  padding: 10px 0;
}

.validation-rules-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  font-weight: bold;
  font-size: 16px;
}

.validation-rules-list {
  max-height: 500px;
  overflow-y: auto;
}

.validation-rule-item {
  margin-bottom: 16px;
}

.rule-card {
  border: 1px solid var(--border-light);
}

.rule-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
}

.no-rules {
  text-align: center;
  color: var(--text-secondary);
}

.form-item-tip {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.2;
  margin-top: 4px;
}

@media (max-width: 768px) {
  .header {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }

  .header :deep(.el-button) {
    width: 100%;
  }

  .search-section {
    padding: 12px;
  }

  .search-section :deep(.el-row) {
    row-gap: 10px;
  }

  .search-section :deep(.el-col) {
    max-width: 100%;
    flex: 0 0 100%;
  }

  .search-section :deep(.el-select) {
    width: 100%;
  }

  .pagination {
    justify-content: flex-start;
    overflow-x: auto;
  }

  .config-editors :deep(.el-tabs__nav-wrap) {
    overflow-x: auto;
  }
}
</style>
