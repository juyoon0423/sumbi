#!/bin/bash
# 보안 그룹에 "Cloudflare 에서 오는 443 만" 허용 규칙을 넣기. AWS 콘솔 위쪽 CloudShell(>_ 아이콘)에서:
#   bash allow-cloudflare.sh sg-0123456789abcdef0
# (이 파일 내용을 CloudShell 에 붙여 넣고 마지막 줄의 SG 만 바꿔도 됨)
set -euo pipefail
SG="${1:?보안 그룹 ID (sg-…)}"
for ip in $(curl -fsS https://www.cloudflare.com/ips-v4); do
  aws ec2 authorize-security-group-ingress --group-id "$SG" \
    --ip-permissions "IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=$ip,Description=cloudflare}]" > /dev/null && echo "+ $ip"
done
for ip in $(curl -fsS https://www.cloudflare.com/ips-v6); do
  aws ec2 authorize-security-group-ingress --group-id "$SG" \
    --ip-permissions "IpProtocol=tcp,FromPort=443,ToPort=443,Ipv6Ranges=[{CidrIpv6=$ip,Description=cloudflare}]" > /dev/null && echo "+ $ip"
done
echo "끝. 22번(SSH)·80번은 열지 않음 (접속은 Session Manager)"
