BEGIN;

-- runOn 的开关机与风机状态由协议配置统一定义：
-- 0=关机，1=开机且待机，17=开机且风机运行；16 不参与正常状态映射。
UPDATE protocol_configs
SET data_parsing_config = jsonb_set(
      data_parsing_config,
      '{params_mapping,runOn}',
      COALESCE(data_parsing_config #> '{params_mapping,runOn}', '{}'::jsonb)
        || '{
          "values": {"关机":"0", "待机":"1", "运行":"17"},
          "state_mapping": {
            "0": {"power_status":false, "running_status":false, "label":"关机"},
            "1": {"power_status":true, "running_status":false, "label":"待机"},
            "17": {"power_status":true, "running_status":true, "label":"运行"}
          },
          "description":"运行状态：0关机，1开机待机，17开机且风机运行"
        }'::jsonb,
      true
    ),
    updated_at = NOW()
WHERE name = '温控器'
  AND device_type = '空调温控器';

-- 当前状态会在设备下一次上报时按新映射更新，避免重写大体量历史时序数据。

COMMIT;
