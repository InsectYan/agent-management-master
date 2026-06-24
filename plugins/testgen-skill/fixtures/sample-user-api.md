# 用户管理 API 规格说明

## 概述

提供用户注册、登录、资料查询与更新的 REST API。所有接口返回 JSON，认证方式为 Bearer Token。

## 接口列表

### POST /api/users/register

注册新用户。

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 邮箱，需合法格式 |
| password | string | 是 | 密码，8–64 位，含字母与数字 |
| nickname | string | 否 | 昵称，最长 32 字 |

**响应**

- 201：返回 `{ "user_id": number, "email": string }`
- 400：参数校验失败
- 409：邮箱已注册

### POST /api/users/login

用户登录。

**请求体**：`{ "email": string, "password": string }`

**响应**

- 200：返回 `{ "token": string, "expires_in": 3600 }`
- 401：邮箱或密码错误
- 429：登录失败次数过多，需等待 15 分钟

### GET /api/users/me

获取当前登录用户资料。Header：`Authorization: Bearer {token}`

**响应**

- 200：返回用户资料 `{ "id", "email", "nickname", "created_at" }`
- 401：未登录或 token 无效/过期

### PATCH /api/users/me

更新昵称。

**请求体**：`{ "nickname": string }`（1–32 字，不可为空）

**响应**

- 200：更新后的用户资料
- 400：昵称不合法
- 401：未授权

## 非功能需求

- 密码不得明文存储
- 所有写操作需记录审计日志
- 登录接口限流：同一 IP 每分钟最多 20 次
