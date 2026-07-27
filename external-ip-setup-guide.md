# 外网IP配置说明
# 当前已临时添加外网IP 139.168.10.139 到 ens18 接口
# 要使配置永久生效，需要将以下配置应用到 /etc/netplan/50-cloud-init.yaml

# 备份当前配置：
sudo cp /etc/netplan/50-cloud-init.yaml /etc/netplan/50-cloud-init.yaml.backup

# 应用新配置（包含外网IP）：
sudo cp netplan-config-with-external-ip.yaml /etc/netplan/50-cloud-init.yaml
sudo netplan apply

# 验证配置：
ip addr show ens18
curl -I http://139.168.10.139
