#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 DataExtractor-cn.lua 的 dataAbilities 段提取全量技能索引。

背景：分享码 / GetSlotBoundId 返回的 abilityId（如 193398=实用命运雕刻者）与
dataSkillsCN.json 的技能树编号（如 186366=实用命运雕刻者）是两套 id 体系。
dataAbilities 段是 ESO 全量技能表（含套装被动/新技能等），外层 key 与内部 ["id"]
都可能被 GetSlotBoundId 返回，故建立双索引 byOuterKey / byInnerId。

用法：python3 tools/extractAbilitiesIndex.py
输出：resources/data/segments/dataAbilitiesIndexCN.json
"""
import json
import re
import os

BASE = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(BASE, 'resources', 'data', 'DataExtractor-cn.lua')
OUT = os.path.join(BASE, 'resources', 'data', 'segments', 'dataAbilitiesIndexCN.json')

outer_re = re.compile(r'^ {20}\[(\d+)\] = ')
close_re = re.compile(r'^ {20}\},$')
f_re = re.compile(r'^ {24}\["(name|icon|ultimate|id)"\] = (.*),$')

idx_outer = {}
idx_inner = {}
in_seg = False
cur = None
cnt = 0

with open(SRC, 'rb') as f:
    for raw in f:
        if not in_seg:
            if b'["dataAbilities"] =' in raw:
                in_seg = True
            continue
        if b'["dataRaids"] =' in raw:
            break
        line = raw.decode('utf-8', 'replace').rstrip('\r\n')
        m = outer_re.match(line)
        if m:
            cur = {'outer': int(m.group(1)), 'name': '', 'icon': '', 'ultimate': False, 'innerId': None}
            continue
        if cur is not None:
            fm = f_re.match(line)
            if fm:
                k, v = fm.group(1), fm.group(2)
                if k == 'name':
                    cur['name'] = v.strip('"')
                elif k == 'icon':
                    cur['icon'] = v.strip('"')
                elif k == 'ultimate':
                    cur['ultimate'] = v == 'true'
                elif k == 'id':
                    cur['innerId'] = int(v)
            elif close_re.match(line):
                if cur and cur['name']:
                    info = {'name': cur['name'], 'icon': cur['icon'], 'ultimate': cur['ultimate']}
                    idx_outer[cur['outer']] = info
                    if cur['innerId'] is not None:
                        idx_inner[cur['innerId']] = info
                    cnt += 1
                cur = None

print('对象数:', cnt, '| 外层key索引:', len(idx_outer), '| 内部id索引:', len(idx_inner))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as fp:
    json.dump({'byOuterKey': idx_outer, 'byInnerId': idx_inner}, fp, ensure_ascii=False)
print('已写出', OUT, os.path.getsize(OUT), 'bytes')
