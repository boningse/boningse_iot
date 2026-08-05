-- Protocol runtime configuration is edited directly as JSON.
-- Remove stale visual-editor mirrors so parsing and control each have one source of truth.
UPDATE protocol_configs
SET data_parsing_config = COALESCE(data_parsing_config, '{}'::jsonb) - 'visual_config',
    command_config = COALESCE(command_config, '{}'::jsonb) - 'visual_config',
    updated_at = CURRENT_TIMESTAMP
WHERE COALESCE(data_parsing_config, '{}'::jsonb) ? 'visual_config'
   OR COALESCE(command_config, '{}'::jsonb) ? 'visual_config';
