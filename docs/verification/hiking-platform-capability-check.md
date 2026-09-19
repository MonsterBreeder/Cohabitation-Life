---
title: 共同徒步平台能力核验
date: 2026-09-17
status: 部分完成，待微信后台与真机确认
---

# 共同徒步平台能力核验

## 核验目的

这份记录只回答“当前微信小程序账号能否安全开放现场连续定位”，不代表徒步功能已经实现。补录和 KML 不依赖连续定位资格，可以按独立阶段开发；现场记录必须在本记录的微信后台与真机项目通过后才能开放。

## 当前结论

| 核验项 | 结果 | 证据或说明 |
| --- | --- | --- |
| 当前代码是否已声明连续定位 | 未声明 | `src/manifest.json` 只有主动选择地点和照片所需声明，不包含连续定位 |
| 前台连续定位是否需要账号接口资格 | 需要 | 微信官方 `startLocationUpdate` 文档要求指定类目通过审核，并在管理后台开通接口 |
| 实时位置变化监听是否可单独使用 | 不可以 | `onLocationChange` 需要与前台或后台启动接口配合 |
| 后台持续定位是否可以默认开放 | 不可以 | 还需要后台位置权限、后台模式声明、账号类目、接口审核与用户授权 |
| 当前账号类目与接口开通状态 | 待人工确认 | 当前环境无法安全进入微信公众平台管理后台，未取得账号页面证据 |
| 当前隐私说明是否已覆盖连续定位 | 待人工确认 | 仓库只能证明代码声明，不能代替公众平台中的用户隐私保护指引 |
| iOS 真机前台定位 | 待验证 | 尚未运行最小真机样例 |
| Android 真机前台定位 | 待验证 | 尚未运行最小真机样例 |
| 后台或锁屏定位 | 不纳入第一版 | 未通过资格前不增加声明、不展示入口、不做发布承诺 |

## 已核对的官方边界

### 前台连续定位

- `wx.startLocationUpdate` 仅在小程序前台接收位置消息。
- 接口需要 `scope.userLocation`。
- 当前官方文档说明，使用该接口前需要通过允许类目审核，并在小程序管理后台的接口设置中开通；未开通可能在代码提审时被拦截。
- 官方地址：https://developers.weixin.qq.com/miniprogram/dev/api/location/wx.startLocationUpdate.html

### 位置变化监听

- `wx.onLocationChange` 必须与 `wx.startLocationUpdate` 或 `wx.startLocationUpdateBackground` 配合。
- 只注册监听不能代表小程序能够持续收到位置。
- 官方地址：https://developers.weixin.qq.com/miniprogram/dev/api/location/wx.onLocationChange.html

### 后台持续定位

- `wx.startLocationUpdateBackground` 需要 `scope.userLocationBackground`。
- 需要在应用声明中配置后台位置模式，并在管理后台完成对应接口开通和用途说明。
- “工具 / 健康管理”在官方开放类目列表中，但这不代表当前账号已经具备资格。
- 官方地址：https://developers.weixin.qq.com/miniprogram/dev/api/location/wx.startLocationUpdateBackground.html

## 仓库现状

`src/manifest.json` 当前只包含：

- `scope.userLocation`：用于用户主动记录足迹或发起导航时搜索和选择地点。
- `requiredPrivateInfos: ['chooseLocation', 'chooseMedia']`：用于主动选择地点，以及给共同足迹或徒步添加照片。

当前没有：

- 前台连续定位接口对应的最终用途声明。
- `scope.userLocationBackground`。
- `requiredBackgroundModes: ['location']`。
- 证明公众平台接口已经开通的截图或检查记录。

照片选择还需要在微信公众平台的用户隐私保护指引中声明“选中的照片或视频信息”。代码声明不能代替后台声明，部署前必须一并确认。

因此，本轮不修改 `src/manifest.json`。只有后台状态和真机调用结果确认后，才加入与实际开放能力一致的声明；后台定位未通过时不得顺手加入后台声明。

## 需要用户在微信公众平台确认

请在小程序管理后台记录以下结果，截图中可以遮住账号与敏感信息：

1. 当前服务类目是否包含允许连续定位的实际业务类目。
2. “开发管理 → 接口设置”中 `wx.startLocationUpdate` / `wx.onLocationChange` 是否可用、已开通或可申请。
3. 用户隐私保护指引中，持续获取位置的用途是否已经声明并通过。
4. 如未来考虑后台定位，再单独检查 `wx.startLocationUpdateBackground`；本期不要求开通。

## 最小真机验证清单

只有后台确认通过后，才制作并运行不保存业务数据的最小样例：

- [ ] 用户主动点击后出现正确的位置用途说明。
- [ ] 同意后能启动前台位置更新，并连续收到多个有效位置点。
- [ ] 暂停或结束后监听停止，不再收到位置点。
- [ ] 拒绝权限后不反复弹窗，仍能返回补录与 KML。
- [ ] 进入后台后明确中断，返回前台不会把空档连成直线。
- [ ] iOS 真机通过。
- [ ] Android 真机通过。

## 能力闸门

- 微信后台与两端真机全部通过：可以开放前台“开始徒步”，继续实施计划 U6。
- 后台未开通、申请失败或真机行为不稳定：隐藏“开始徒步”，继续交付补录、KML 和共同回看；U6 保持未完成。
- 任何情况下都不能用定时轮询普通定位接口冒充连续定位，也不能把自动检查通过写成真机能力已经通过。
