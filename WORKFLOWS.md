# HidenCloud 自动续期工作流对比说明

本项目提供两种 GitHub Actions 自动续期工作流，分别适用于不同的场景。以下是详细的对比和配置说明。

## 🚀 工作流概览

| 特性 | `renew.yml` (旧版 / 浏览器模拟) | `renew1.yml` (新版 / 混合模式) |
| :--- | :--- | :--- |
| **核心机制** | **纯浏览器模拟**<br>使用 Playwright 全程模拟用户登录、点击续期、确认等操作。 | **混合模式**<br>1. 浏览器登录并提取 Cookie (解决 IP 限制)<br>2. API 脚本使用提取的 Cookie 进行快速续期 |
| **优势** | 模拟最为真实，不仅能过登录验证，还能处理续期页面的各类弹窗验证。 | **速度快，稳定性高**。利用浏览器解决最难的登录验证，后续续期通过 API 完成，效率极高且不易出错。 |
| **劣势** | 速度较慢，受页面 UI 变动影响较大。 | 如果续期接口发生重大变化需要更新 API 逻辑。 |
| **适用场景** | 当 API 续期出现问题，或者需要完整模拟用户行为时。 | **推荐作为首选方案**。特别解决了异地 Cookie 失效的问题。 |

---

## ⚙️ 配置要求

### 1. `renew1.yml` (推荐)

此工作流名为 **Katabump Auto Renew New**。

**所需 Repository Secrets:**

*   `USERS_JSON`: **必须**。包含账号密码的 JSON 数组。
    *   格式示例：
        ```json
        [
            {"username": "user1@example.com", "password": "password123"},
            {"username": "user2@example.com", "password": "password456"}
        ]
        ```

**无需**配置 `COOKIE` 变量，因为脚本会自动生成并使用一次性 Cookie。

---

### 2. `renew.yml` (备用)

此工作流名为 **Katabump Auto Renew**。

**所需 Repository Secrets:**

*   `USERS_JSON`: **必须**。同上，包含账号密码的 JSON 数组。
*   `HTTP_PROXY` (可选): 如果需要通过代理访问，可以配置此 Secret (格式: `http://user:pass@host:port`)。

---

## ❓ 常见问题

**Q: 为什么需要 `renew1.yml`?**
A: HidenCloud 增加了安全机制，如果 Cookie 生成的 IP (例如本地) 与使用的 IP (GitHub Actions) 不一致，Cookie 会失效。`renew1.yml` 在 GitHub Actions 同一个 Runner 里完成“登录 -> 获取 Cookie -> 续期”的全过程，确保 IP 一致，完美解决此问题。

**Q: 我应该使用哪一个?**
A: 建议优先使用 **`renew1.yml`**。如果遇到问题，可以尝试切换回 `renew.yml`。
