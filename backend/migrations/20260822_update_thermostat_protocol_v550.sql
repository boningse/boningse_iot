BEGIN;

-- 依据《4G温控器 协议说明 Version 5.50 - json格式》补全温控器协议。
-- 保留既有网关/子设备路由配置，只更新该温控器协议自身的字段定义和命令模板。
WITH protocol_definition AS (
  SELECT
    '{
      "valve":{"type":"integer","field":"valve","access":"r/w","values":{"0":"无总阀","1":"有总阀"},"description":"总阀设置"},
      "setOn":{"type":"integer","field":"setOn","access":"r/w","values":{"0":"关机","1":"开机"},"description":"设定开关机"},
      "runOn":{"type":"integer","field":"runOn","access":"r","values":{"0":"关机","1":"开机待机","17":"风机盘管运行"},"state_mapping":{"0":{"power_status":false,"running_status":false,"label":"关机"},"1":{"power_status":true,"running_status":false,"label":"开机待机"},"17":{"power_status":true,"running_status":true,"label":"风机盘管运行"}},"description":"运行开关：0关机，1开机，17表示风机盘管打开"},
      "setMode":{"type":"integer","field":"setMode","access":"r/w","values":{"0":"送风","1":"制热","2":"制冷","3":"除湿"},"description":"设定模式"},
      "runMode":{"type":"integer","field":"runMode","access":"r","values":{"0":"送风","1":"制热","2":"制冷","3":"除湿"},"description":"运行模式"},
      "setTemp":{"type":"integer","field":"setTemp","access":"r/w","unit":"0.1℃","divisor":10,"description":"设定温度"},
      "runTemp":{"type":"integer","field":"runTemp","access":"r","unit":"0.1℃","divisor":10,"description":"运行温度"},
      "lock":{"type":"integer","field":"lock","access":"r/w","values":{"0":"解锁","1":"锁定"},"description":"童锁控制"},
      "roomTemp":{"type":"integer","field":"roomTemp","access":"r","unit":"0.1℃","divisor":10,"description":"室内温度"},
      "setFanSpeed":{"type":"integer","field":"setFanSpeed","access":"r/w","values":{"0":"自动","1":"低风","2":"中风","3":"高风"},"description":"设定风速"},
      "runFanSpeed":{"type":"integer","field":"runFanSpeed","access":"r","values":{"0":"自动","1":"低风","2":"中风","3":"高风"},"description":"实际运行风速；自动模式下按设备实际选择的高中低档上报"},
      "setFanDirect":{"type":"integer","field":"setFanDirect","access":"r/w","description":"设定风向（保留）"},
      "runFanDirect":{"type":"integer","field":"runFanDirect","access":"r","description":"运行风向（保留）"},
      "minSetTemp":{"type":"integer","field":"minSetTemp","access":"r/w","unit":"0.1℃","divisor":10,"description":"最小设定温度"},
      "maxSetTemp":{"type":"integer","field":"maxSetTemp","access":"r/w","unit":"0.1℃","divisor":10,"description":"最大设定温度"},
      "addr":{"type":"integer","field":"addr","access":"r","description":"内机地址"},
      "remote":{"type":"integer","field":"remote","access":"r/w","bits":{"0":"开关机","1":"模式","2":"风速","3":"设定温度"},"description":"远程控制位"},
      "lowTempDiff":{"type":"integer","field":"lowTempDiff","access":"r/w","unit":"0.1℃","divisor":10,"description":"低温温差"},
      "midlleTempDiff":{"type":"integer","field":"midlleTempDiff","access":"r/w","unit":"0.1℃","divisor":10,"description":"中温温差（设备协议原字段拼写）"},
      "middleTempDiff":{"type":"integer","field":"middleTempDiff","access":"r/w","unit":"0.1℃","divisor":10,"description":"中温温差兼容字段"},
      "highTempDiff":{"type":"integer","field":"highTempDiff","access":"r/w","unit":"0.1℃","divisor":10,"description":"高温温差"},
      "deadTemp":{"type":"integer","field":"deadTemp","access":"r/w","unit":"0.1℃","divisor":10,"description":"死区温度"},
      "setBits":{"type":"integer","field":"setBits","access":"r","description":"设定记录刷新位"},
      "stBits":{"type":"integer","field":"stBits","access":"r","description":"刷新上传记录位"}
    }'::jsonb AS params_mapping,
    '{
      "addr":{"type":"integer","field":"addr","access":"r/w","description":"地址"},
      "imei":{"type":"string","field":"imei","access":"r","description":"4G模块IMEI"},
      "iccid":{"type":"string","field":"iccid","access":"r","description":"SIM卡号"},
      "signal":{"type":"integer","field":"signal","access":"r","range":"0~4","description":"信号强度"},
      "hardVersion":{"type":"string","field":"hardVersion","access":"r","description":"硬件版本"},
      "softVersion":{"type":"string","field":"softVersion","access":"r","description":"软件版本"},
      "model":{"type":"string","field":"model","access":"r","description":"产品内部名称"},
      "remarks":{"type":"string","field":"remarks","access":"r","description":"产品标识"},
      "units":{"type":"integer","field":"units","access":"r","description":"内机数"},
      "time":{"type":"integer","field":"time","access":"r","unit":"UTC时间","description":"设备时间"},
      "periodToUploadSet":{"type":"integer","field":"periodToUploadSet","access":"r/w","description":"设定类参数自动上传周期"},
      "periodToUploadRunSt":{"type":"integer","field":"periodToUploadRunSt","access":"r/w","description":"运行类参数自动上传周期"},
      "periodToUploadTime":{"type":"integer","field":"periodToUploadTime","access":"r/w","description":"运行时间参数自动上传周期"},
      "periodToSave":{"type":"integer","field":"periodToSave","access":"r/w","description":"自动保存周期"},
      "resetFactory":{"type":"integer","field":"resetFactory","access":"r/w","values":{"1":"恢复出厂设置"},"description":"恢复出厂设置"},
      "reboot":{"type":"integer","field":"reboot","access":"r/w","description":"远程重启"},
      "trigger":{"type":"object","field":"trigger","access":"r/w","description":"立即上传触发器"}
    }'::jsonb AS property_mapping,
    '{
      "FanLow":{"type":"integer","field":"FanLow","access":"r/w","unit":"秒","description":"送风低档累计时间"},
      "FanMiddle":{"type":"integer","field":"FanMiddle","access":"r/w","unit":"秒","description":"送风中档累计时间"},
      "FanHigh":{"type":"integer","field":"FanHigh","access":"r/w","unit":"秒","description":"送风高档累计时间"},
      "HeatLow":{"type":"integer","field":"HeatLow","access":"r/w","unit":"秒","description":"制热低档累计时间"},
      "HeatMiddle":{"type":"integer","field":"HeatMiddle","access":"r/w","unit":"秒","description":"制热中档累计时间"},
      "HeatHigh":{"type":"integer","field":"HeatHigh","access":"r/w","unit":"秒","description":"制热高档累计时间"},
      "CoolLow":{"type":"integer","field":"CoolLow","access":"r/w","unit":"秒","description":"制冷低档累计时间"},
      "CoolMiddle":{"type":"integer","field":"CoolMiddle","access":"r/w","unit":"秒","description":"制冷中档累计时间"},
      "CoolHigh":{"type":"integer","field":"CoolHigh","access":"r/w","unit":"秒","description":"制冷高档累计时间"}
    }'::jsonb AS time_mapping
), command_definition AS (
  SELECT '{
    "read_params":{"name":"读取全部运行参数","template":{"uuid":"{device_id}","pType":"params","func":"read","body":{"id":[1],"items":[]}},"description":"读取指定内机的全部参数"},
    "read_property":{"name":"读取设备属性","template":{"uuid":"{device_id}","pType":"property","func":"read","body":{"items":[]}},"description":"读取温控器集中器属性"},
    "set_fan_direction":{"name":"设置风向","template":{"uuid":"{device_id}","pType":"params","func":"write","body":{"setFanDirect":"{fan_direction}"}},"description":"设置温控器风向"},
    "set_remote":{"name":"设置远程控制位","template":{"uuid":"{device_id}","pType":"params","func":"write","body":{"remote":"{remote_bits}"}},"description":"按位限制开关机、模式、风速和温度按键"},
    "set_dead_temp":{"name":"设置死区温度","template":{"uuid":"{device_id}","pType":"params","func":"write","body":{"deadTemp":"{dead_temp}"}},"description":"设置温控器动作死区"}
  }'::jsonb AS commands
)
UPDATE protocol_configs pc
SET version = '5.50',
    data_parsing_config = pc.data_parsing_config
      || jsonb_build_object(
        'version', '5.50',
        'document_version', '5.50',
        'description', '4G温控器 JSON 协议解析配置（Version 5.50）',
        'params_mapping', COALESCE(pc.data_parsing_config->'params_mapping', '{}'::jsonb) || pd.params_mapping,
        'property_mapping', COALESCE(pc.data_parsing_config->'property_mapping', '{}'::jsonb) || pd.property_mapping,
        'time_mapping', COALESCE(pc.data_parsing_config->'time_mapping', '{}'::jsonb) || pd.time_mapping
      ),
    command_config = jsonb_set(
      pc.command_config || jsonb_build_object('version', '5.50'),
      '{command_config,commands}',
      COALESCE(pc.command_config #> '{command_config,commands}', '{}'::jsonb) || cd.commands,
      true
    ),
    updated_at = NOW()
FROM protocol_definition pd, command_definition cd
WHERE pc.id = '73d17555-fed3-413f-88f1-0ece5ed37b23'
  AND pc.name = '温控器'
  AND pc.device_type = '空调温控器';

COMMIT;
