BEGIN;

-- 两台已绑定温控控制、厂商为BNWKQ的独立温控器缺少协议关联，
-- 补为现用的Version 5.50温控器协议，确保数据解析和ICCID读取走协议配置。
UPDATE devices
SET protocol_config_id = '73d17555-fed3-413f-88f1-0ece5ed37b23',
    updated_at = NOW()
WHERE id IN (
  '1c66a1e1-e33c-4d6a-8398-14daacf0030e',
  '354a9090-401e-4880-a4b6-5a86ff343122'
)
  AND protocol_config_id IS NULL
  AND manufacturer_code = 'BNWKQ';

COMMIT;
