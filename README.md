# CoinTracker - 加密货币Chrome扩展

一个现代化的加密货币价格追踪 Chrome 扩展，支持实时价格显示、趋势图分析、价格提醒、云同步和智能缓存功能。

## 🖼️ UI 预览 (v2.1 云同步与多币种)

<table>
  <tr>
    <td align="center">
      <img src="assets/screenshots/main.png" alt="观察列表页" width="260"/>
      <br/>
      <b>主界面 - 观察列表</b>
    </td>
    <td align="center">
      <img src="assets/screenshots/search.png" alt="搜索与添加" width="260"/>
      <br/>
      <b>热门搜索与添加</b>
    </td>
    <td align="center">
      <img src="assets/screenshots/detail.png" alt="价格趋势图" width="260"/>
      <br/>
      <b>价格趋势详情页</b>
    </td>
  </tr>
</table>

## 🚀 功能特性

- ✅ **实时价格显示** - 支持多种加密货币的实时价格监控
- ✅ **趋势图分析** - 集成 lightweight-charts，提供真实价格趋势图
- ✅ **搜索添加** - 支持搜索和热门币种一键关注
- ✅ **价格提醒** - 支持设置高于/低于阈值提醒
- ✅ **多法币显示** - 支持 USD、CNY、HKD、EUR 切换和约等于估值
- ✅ **云同步** - 支持 Supabase 邮箱注册/登录，同步关注、持仓、提醒和加密 Token
- ✅ **加密存储** - CoinGecko Token 与 Supabase Anon Key 使用本地 AES-GCM 加密保存
- ✅ **登录态优化** - Supabase 登录后隐藏注册/登录表单，支持确认邮件回跳完成登录
- ✅ **智能缓存** - 多层缓存机制，优化API请求频率
- ✅ **频率限制保护** - 智能请求队列，防止API限制

## 🧱 技术栈

- **Frontend**: React 18 + TypeScript + Tailwind CSS
- **Charts**: Lightweight Charts 4.2.0
- **Build**: Webpack 5 + Chrome Extension Manifest V3
- **API**: CoinGecko API (免费版)
- **Cloud Sync**: Supabase Auth + PostgREST + RLS

## 🔧 安装步骤

### 1. 构建项目
```bash
npm install
npm run build
```

### 2. 安装到Chrome
1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启右上角"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目的 `dist` 文件夹
6. 扩展安装完成！

## ☁️ Supabase 云同步配置

云同步是可选功能。本地不配置 Supabase 时，扩展仍然可以正常使用。

### 1. 创建数据表

在 Supabase 项目的 SQL Editor 中执行：

```sql
-- 见 docs/supabase-schema.sql
```

项目已提供完整脚本：[docs/supabase-schema.sql](docs/supabase-schema.sql)。

脚本会创建 `coin_user_data` 表，并开启 RLS，只允许用户读写自己的数据。

### 2. 配置 Auth

Supabase 支持邮箱注册/登录。开发测试时有两种方式：

- 保留邮箱确认：注册后点击确认邮件，再登录。
- 关闭邮箱确认：`Authentication` → `Providers` → `Email` → 关闭 `Confirm email`。

如果要让确认邮件跳回插件页面，请在：

`Authentication` → `URL Configuration` → `Redirect URLs`

添加你的扩展地址：

```text
chrome-extension://你的扩展ID/popup.html
```

扩展 ID 可在 `chrome://extensions/` 中查看。

### 3. 在扩展中登录

打开扩展设置页，填写：

- Supabase Project URL
- Supabase Anon Public Key

然后使用邮箱注册/登录。登录后：

- 注册/登录表单会自动隐藏
- 可手动上传本地数据
- 可从云端下载数据
- 新增关注、删除关注、修改持仓/提醒、保存 Token 时会自动尝试同步

### 4. 同步的数据

- 关注列表
- 持仓数量
- 价格提醒
- CoinGecko API Token（加密后上传）

Supabase Anon Key 本身是前端公开 key，但扩展本地仍会加密保存，减少被直接读取的风险。

## 🐛 故障排除

### 问题：扩展一直显示"加载中"

这个问题通常有以下几个原因：

#### 1. Service Worker 未启动
**检查方法**：
```
1. 打开 chrome://extensions/
2. 找到 CoinTracker 扩展
3. 点击"详情"
4. 查看 "检查视图" 部分是否有 "Service Worker" 
5. 点击 "Service Worker" 查看控制台
```

#### 2. 权限问题
**解决方案**：
- 确认扩展有访问 `api.coingecko.com` 的权限
- 检查 `manifest.json` 中的 `host_permissions` 设置

#### 3. API连接问题
**测试方法**：
- 打开项目根目录的 `test-extension.html` 文件
- 点击"测试 CoinGecko API"按钮
- 查看API是否可以正常访问

#### 4. 调试步骤
1. **查看popup控制台**：
   ```
   右键点击扩展图标 → 检查 → Console标签
   ```

2. **查看background控制台**：
   ```
   chrome://extensions/ → CoinTracker详情 → Service Worker
   ```

3. **查看详细日志**：
   ```
   所有console.log消息都已添加，方便调试
   ```

## ⚙️ 技术优化

### API频率限制解决方案

#### 1. 请求队列管理
- 使用`RequestQueue`类管理所有API请求
- 确保请求之间有1.5秒的间隔
- 避免并发请求导致的429错误

#### 2. 智能缓存系统
- **价格数据**: 3分钟缓存，平衡实时性和API使用
- **搜索结果**: 15分钟缓存，减少重复搜索的API调用
- **历史数据**: 10分钟缓存，趋势图数据更新频率适中
- **趋势数据**: 30分钟缓存，趋势数据变化相对较慢

#### 3. 错误处理和重试
- 检测429状态码，自动延迟重试
- 检测 CoinGecko 401/403，自动尝试不带 API Key 的公共接口重试
- 用户友好的错误提示
- 优雅降级，确保基本功能可用

## 🛠️ 开发命令

```bash
# 安装依赖
npm install

# 开发构建（包含source map）
npm run dev

# 生产构建
npm run build

# 监听模式（自动重新构建）
npm run watch
```

## 📁 项目结构

```
coin/
├── src/
│   ├── background/          # Service Worker (后台脚本)
│   ├── popup/              # 弹窗界面
│   ├── services/           # API服务
│   └── types/              # TypeScript类型定义
├── docs/
│   └── supabase-schema.sql # Supabase 表结构与 RLS 脚本
├── public/
│   ├── manifest.json       # 扩展清单文件
│   └── icons/             # 图标文件
├── dist/                  # 构建输出目录
└── test-extension.html    # API测试页面
```

## ✅ 已修复的问题

- ✅ **API频率限制 (429错误)**：增加了请求队列和缓存机制
- ✅ **智能缓存**：不同类型数据使用不同缓存时长  
- ✅ **友好错误提示**：用户友好的中文错误信息
- ✅ **自动重试**：遇到限制时自动延迟重试
- ✅ **Service Worker 通信**：增加PING机制确保后台脚本就绪
- ✅ **Supabase RLS 权限**：补充 authenticated 授权和 user_id 默认 auth.uid()
- ✅ **邮箱确认回跳**：支持确认邮件跳回扩展并完成登录态保存
- ✅ **无效 CoinGecko Key**：401/403 时自动退回公共接口重试

## 💡 使用提示

- 点击币种名称可查看价格趋势详情
- 支持7天、30天、90天、1年的趋势图
- 观察列表齿轮按钮可配置持仓数量和价格提醒
- 持仓页可以独立选择“约等于”估值币种
- Supabase 登录后可在设置页上传本地数据或下载云端数据
- 数据会自动缓存，减少API调用
- 如 CoinGecko 返回 401，请清空或重新填写 API Key
- 如遇到"API请求过于频繁"提示，请等待几分钟后再试

---

*享受您的数字货币追踪体验！* 🚀💰
