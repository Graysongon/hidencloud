const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');

// ==========================================
// Part 1: Configuration & Helpers
// ==========================================

// Enable stealth plugin
chromium.use(stealth);

const RENEW_DAYS = 10;
const INJECTED_SCRIPT = `
(function() {
    if (window.self === window.top) return;

    try {
        function getRandomInt(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }
        let screenX = getRandomInt(800, 1200);
        let screenY = getRandomInt(400, 600);
        
        Object.defineProperty(MouseEvent.prototype, 'screenX', { value: screenX });
        Object.defineProperty(MouseEvent.prototype, 'screenY', { value: screenY });
    } catch (e) { }

    try {
        const originalAttachShadow = Element.prototype.attachShadow;
        Element.prototype.attachShadow = function(init) {
            const shadowRoot = originalAttachShadow.call(this, init);
            if (shadowRoot) {
                const checkAndReport = () => {
                    const checkbox = shadowRoot.querySelector('input[type="checkbox"]');
                    if (checkbox) {
                        const rect = checkbox.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0 && window.innerWidth > 0 && window.innerHeight > 0) {
                            const xRatio = (rect.left + rect.width / 2) / window.innerWidth;
                            const yRatio = (rect.top + rect.height / 2) / window.innerHeight;
                            window.__turnstile_data = { xRatio, yRatio };
                            return true;
                        }
                    }
                    return false;
                };
                if (!checkAndReport()) {
                    const observer = new MutationObserver(() => {
                        if (checkAndReport()) observer.disconnect();
                    });
                    observer.observe(shadowRoot, { childList: true, subtree: true });
                }
            }
            return shadowRoot;
        };
    } catch (e) { }
})();
`;

// Helper to sleep
const sleep = (min = 3000, max = 8000) => {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
};

function getUsers() {
    try {
        if (process.env.USERS_JSON) {
            const parsed = JSON.parse(process.env.USERS_JSON);
            return Array.isArray(parsed) ? parsed : (parsed.users || []);
        }
        // Fallback for local testing
        const localUsersPath = path.join(__dirname, 'users.json');
        if (fs.existsSync(localUsersPath)) {
            console.log('正在从本地 users.json 文件加载用户...');
            const fileContent = fs.readFileSync(localUsersPath, 'utf8');
            const parsed = JSON.parse(fileContent);
            return Array.isArray(parsed) ? parsed : (parsed.users || []);
        }
    } catch (e) {
        console.error('解析 USERS_JSON 或 users.json 时出错:', e);
    }
    return [];
}

// ==========================================
// Part 2: Renewal Logic (HidenCloudBot)
// ==========================================

class HidenCloudBot {
    constructor(page, username) {
        this.page = page;
        this.username = username;
        this.services = [];
        this.logMsg = [];
        this.csrfToken = '';
    }

    log(msg) {
        console.log(`[${this.username}] ${msg}`);
        this.logMsg.push(msg);
    }

    // Wrap fetch inside the browser context
    async request(method, url, data = null, extraHeaders = {}) {
        // Construct full URL if needed
        const targetUrl = url.startsWith('http') ? url : `https://dash.hidencloud.com${url.startsWith('/') ? '' : '/'}${url}`;

        // Prepare Headers - Browser handles User-Agent, Cookie, Host, etc.
        // We only add specific functional headers
        const headers = { ...extraHeaders };
        if (method === 'POST' && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
        // CSRF Token if we have it
        if (this.csrfToken && !headers['X-CSRF-TOKEN']) {
            headers['X-CSRF-TOKEN'] = this.csrfToken;
        }

        try {
            // Execute fetch inside the browser
            const result = await this.page.evaluate(async ({ url, method, data, headers }) => {
                const options = {
                    method: method,
                    headers: headers,
                    redirect: 'follow' // Let browser verify redirects automatically
                };
                if (data) options.body = data;

                const res = await fetch(url, options);
                const text = await res.text();

                return {
                    status: res.status,
                    url: res.url, // Final URL after redirects
                    headers: {}, // We can't iterate headers easily in all browsers, but usually not needed for logic if we trust auto-redirects
                    data: text
                };
            }, { url: targetUrl, method, data: data ? data.toString() : null, headers });

            // Normalize result to match our previous axios structure
            result.finalUrl = result.url;
            return result;
        } catch (err) {
            throw new Error(`浏览器请求错误: ${err.message}`);
        }
    }

    extractTokens($) {
        const metaToken = $('meta[name="csrf-token"]').attr('content');
        if (metaToken) this.csrfToken = metaToken;
    }

    async init() {
        this.log('🔍 正在验证 API 登录状态 (Browser Mode)...');
        try {
            await sleep(2000); // Wait a bit
            const res = await this.request('GET', '/dashboard');

            // Check for login redirection
            if (res.finalUrl.includes('/login') || res.finalUrl.includes('/auth')) {
                this.log('❌ 浏览器似乎未保持登录状态');
                return false;
            }

            const $ = cheerio.load(res.data);
            const title = $('title').text().trim();
            this.log(`调试: 页面标题 = "${title}"`);

            if (title.includes('Just a moment') || title.includes('Attention Required')) {
                this.log('⚠️ 依然检测到拦截页面，请检查 Turnstile');
                return false;
            }

            this.extractTokens($);

            // Parse Services
            $('a[href*="/service/"]').each((i, el) => {
                const href = $(el).attr('href');
                const match = href.match(/\/service\/(\d+)\/manage/);
                if (match) {
                    this.services.push({ id: match[1], url: href });
                }
            });
            // deduplicate
            this.services = this.services.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);

            this.log(`✅ API 连接成功，发现 ${this.services.length} 个服务`);
            return true;
        } catch (e) {
            this.log(`❌ 初始化异常: ${e.message}`);
            return false;
        }
    }

    async processService(service) {
        await sleep(2000, 4000);
        this.log(`>>> 处理服务 ID: ${service.id}`);

        try {
            const manageRes = await this.request('GET', `/service/${service.id}/manage`);
            const $ = cheerio.load(manageRes.data);
            const formToken = $('input[name="_token"]').val();

            this.log(`📅 提交续期 (${RENEW_DAYS}天)...`);
            await sleep(1000, 2000);

            const params = new URLSearchParams();
            params.append('_token', formToken);
            params.append('days', RENEW_DAYS);

            const res = await this.request('POST', `/service/${service.id}/renew`, params.toString());

            if (res.finalUrl && res.finalUrl.includes('/invoice/')) {
                this.log(`⚡️ 续期成功，前往支付`);
                await this.performPayFromHtml(res.data, res.finalUrl);
            } else {
                this.log('⚠️ 续期后未跳转，检查账单列表...');
                await this.checkAndPayInvoices(service.id);
            }

        } catch (e) {
            this.log(`❌ 处理异常: ${e.message}`);
        }
    }

    async checkAndPayInvoices(serviceId) {
        await sleep(2000, 3000);
        try {
            const res = await this.request('GET', `/service/${serviceId}/invoices?where=unpaid`);
            const $ = cheerio.load(res.data);

            const invoiceLinks = [];
            $('a[href*="/invoice/"]').each((i, el) => {
                const href = $(el).attr('href');
                if (href && !href.includes('download')) invoiceLinks.push(href);
            });

            const uniqueInvoices = [...new Set(invoiceLinks)];
            if (uniqueInvoices.length === 0) {
                this.log(`✅ 无未支付账单`);
                return;
            }

            for (const url of uniqueInvoices) {
                await this.paySingleInvoice(url);
                await sleep(3000, 5000);
            }
        } catch (e) {
            this.log(`❌ 查账单出错: ${e.message}`);
        }
    }

    async paySingleInvoice(url) {
        try {
            this.log(`📄 打开账单: ${url}`);
            const res = await this.request('GET', url);
            await this.performPayFromHtml(res.data, url);
        } catch (e) {
            this.log(`❌ 访问失败: ${e.message}`);
        }
    }

    async performPayFromHtml(html, currentUrl) {
        const $ = cheerio.load(html);

        let targetForm = null;
        let targetAction = '';

        $('form').each((i, form) => {
            const btnText = $(form).find('button').text().trim().toLowerCase();
            const action = $(form).attr('action');
            if (btnText.includes('pay') && action && !action.includes('balance/add')) {
                targetForm = $(form);
                targetAction = action;
                return false;
            }
        });

        if (!targetForm) {
            this.log(`⚪ 页面未找到支付表单 (可能已支付)`);
            return;
        }

        const payParams = new URLSearchParams();
        targetForm.find('input').each((i, el) => {
            const name = $(el).attr('name');
            const value = $(el).val();
            if (name) payParams.append(name, value || '');
        });

        this.log(`💳 提交支付...`);

        try {
            // No Referer needed for Browser Fetch (it handles it, or we rely on standard behavior)
            // But we can add it if needed
            const res = await this.request('POST', targetAction, payParams.toString());

            if (res.status === 200) {
                this.log(`✅ 支付成功！`);
            } else {
                this.log(`⚠️ 支付响应: ${res.status}`);
            }
        } catch (e) {
            this.log(`❌ 支付失败: ${e.message}`);
        }
    }
}

// ==========================================
// Part 3: Browser Login Logic (Integrated from login.js)
// ==========================================

const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const DEBUG_PORT = 9222;

function checkPort(port) {
    return new Promise((resolve) => {
        const req = http.get(`http://localhost:${port}/json/version`, (res) => {
            resolve(true);
        });
        req.on('error', () => resolve(false));
        req.end();
    });
}

async function launchChrome() {
    if (await checkPort(DEBUG_PORT)) {
        console.log('Chrome 已启动。');
        return;
    }

    console.log(`正在启动 Chrome (分离模式)...`);
    // Use OS temp directory for user data or specific tmp path
    const userDataDir = path.join(os.tmpdir(), 'chrome_user_data_' + Date.now());

    const args = [
        `--remote-debugging-port=${DEBUG_PORT}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        '--window-size=1280,720',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-setuid-sandbox',
        '--disable-setuid-sandbox',
        `--user-data-dir=${userDataDir}`,
        '--disable-dev-shm-usage'
    ];

    const chrome = spawn(CHROME_PATH, args, {
        detached: true,
        stdio: 'ignore'
    });
    chrome.unref();

    console.log('正在等待 Chrome 初始化...');
    for (let i = 0; i < 20; i++) {
        if (await checkPort(DEBUG_PORT)) break;
        await new Promise(r => setTimeout(r, 1000));
    }

    if (!await checkPort(DEBUG_PORT)) {
        throw new Error('Chrome 启动失败');
    }
}


async function attemptTurnstileCdp(page) {
    const frames = page.frames();
    for (const frame of frames) {
        try {
            const data = await frame.evaluate(() => window.__turnstile_data).catch(() => null);

            if (data) {
                console.log('>> 在框架中发现 Turnstile。比例:', data);
                const iframeElement = await frame.frameElement();
                if (!iframeElement) continue;

                const box = await iframeElement.boundingBox();
                if (!box) continue;

                const clickX = box.x + (box.width * data.xRatio);
                const clickY = box.y + (box.height * data.yRatio);

                const client = await page.context().newCDPSession(page);
                await client.send('Input.dispatchMouseEvent', {
                    type: 'mousePressed',
                    x: clickX,
                    y: clickY,
                    button: 'left',
                    clickCount: 1
                });
                await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
                await client.send('Input.dispatchMouseEvent', {
                    type: 'mouseReleased',
                    x: clickX,
                    y: clickY,
                    button: 'left',
                    clickCount: 1
                });
                console.log('>> CDP 点击已发送。');
                await client.detach();
                return true;
            }
        } catch (e) { }
    }
    return false;
}

async function handleVerification(page) {
    console.log('正在检查验证...');
    for (let i = 0; i < 30; i++) {
        if (await page.getByRole('textbox', { name: 'Email or Username' }).isVisible()) {
            console.log('检测到登录表单。');
            return;
        }
        await attemptTurnstileCdp(page);
        await page.waitForTimeout(1000);
    }
}

// ==========================================
// Main Execution
// ==========================================

async function sendTelegramNotification(summaryText) {
    const tgToken = process.env.TG_BOT_TOKEN;
    const tgChatId = process.env.TG_CHAT_ID;

    if (!tgToken || !tgChatId) {
        console.log('⚠️ 未检测到 TG_BOT_TOKEN 或 TG_CHAT_ID，跳过 Telegram 通知。');
        return;
    }

    console.log('📨 正在发送 Telegram 通知...');
    try {
        const url = `https://api.telegram.org/bot${tgToken}/sendMessage`;
        await axios.post(url, {
            chat_id: tgChatId,
            text: summaryText,
            parse_mode: 'Markdown'
        });
        console.log('✅ Telegram 通知发送成功');
    } catch (e) {
        console.error('❌ Telegram 通知发送失败:', e.message);
    }
}

(async () => {
    const users = getUsers();
    if (users.length === 0) {
        console.log('未在 process.env.USERS_JSON 或本地 users.json 中找到用户');
        process.exit(1);
    }

    console.log(`🚀 正在启动操作脚本，共 ${users.length} 个用户 (隔离环境)...`);
    const summary = [];

    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        console.log(`\n=== 正在处理用户 ${i + 1}: ${user.username} ===`);

        // 1. Prepare Isolated Environment
        let browser;
        let chromeProcess;
        let page;

        try {
            // Launch specific Chrome for this user
            // We use the launchChrome logic but inlined or adapted to return the process
            if (await checkPort(DEBUG_PORT)) {
                console.log('警告: Chrome 端口似乎繁忙。正在尝试清理孤立进程...');
                try {
                    // Simple kill attempt for Linux/CI
                    require('child_process').execSync(`pkill -f "remote-debugging-port=${DEBUG_PORT}" || true`);
                    await sleep(2000);
                } catch (e) { }
            }

            console.log(`正在启动 Chrome (隔离用户 ${user.username})...`);
            const userDataDir = path.join(os.tmpdir(), `chrome_${Date.now()}_${i}`);
            const args = [
                `--remote-debugging-port=${DEBUG_PORT}`,
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-gpu',
                '--window-size=1280,720',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                `--user-data-dir=${userDataDir}`,
                '--disable-dev-shm-usage'
            ];

            chromeProcess = spawn(CHROME_PATH, args, {
                detached: true,
                stdio: 'ignore'
            });
            chromeProcess.unref();

            // Wait for Port
            console.log('正在等待 Chrome...');
            let portReady = false;
            for (let k = 0; k < 20; k++) {
                if (await checkPort(DEBUG_PORT)) {
                    portReady = true;
                    break;
                }
                await new Promise(r => setTimeout(r, 1000));
            }
            if (!portReady) throw new Error('Chrome 启动超时');

            // Connect
            console.log(`正在连接到 Chrome...`);
            browser = await chromium.connectOverCDP(`http://localhost:${DEBUG_PORT}`);
            const defaultContext = browser.contexts()[0];
            page = await defaultContext.newPage();

            await page.addInitScript(INJECTED_SCRIPT);
            page.setDefaultTimeout(60000);

            let loginSuccess = false;

            // --- Part A: Login ---
            console.log('--- 第一阶段: 浏览器登录 ---');
            await page.goto('https://dash.hidencloud.com/auth/login');
            await handleVerification(page);

            await page.getByRole('textbox', { name: 'Email or Username' }).waitFor({ timeout: 20000 });
            await page.getByRole('textbox', { name: 'Email or Username' }).fill(user.username);
            await page.getByRole('textbox', { name: 'Password' }).click();
            await page.getByRole('textbox', { name: 'Password' }).fill(user.password);

            console.log('正在检查二次验证...');
            for (let j = 0; j < 5; j++) {
                if (await attemptTurnstileCdp(page)) await page.waitForTimeout(2000);
                await page.waitForTimeout(500);
            }

            console.log('正在点击登录...');
            await page.getByRole('button', { name: 'Sign in to your account' }).click();

            try {
                await page.waitForURL('**/dashboard', { timeout: 30000 });
                console.log('浏览器登录成功！');
                loginSuccess = true;
            } catch (e) {
                console.error('等待仪表盘失败。正在检查错误...');
                if (await page.getByText('Incorrect password').isVisible()) {
                    console.error('登录失败: 密码错误。');
                } else {
                    await page.screenshot({ path: `login_failed_${i}.png` });
                }
            }

            // --- Part B: Renewal Logic ---
            if (loginSuccess) {
                console.log('\n--- 第二阶段: 续期操作 (浏览器模式) ---');
                if (page.isClosed()) {
                    console.error('错误: 页面意外关闭。');
                } else {
                    const bot = new HidenCloudBot(page, user.username);
                    if (await bot.init()) {
                        for (const svc of bot.services) {
                            await bot.processService(svc);
                        }
                        summary.push({ user: user.username, status: 'Success', services: bot.services.length });
                    } else {
                        summary.push({ user: user.username, status: 'Failed (API Init)', services: 0 });
                    }
                }
            } else {
                summary.push({ user: user.username, status: 'Failed (Login)', services: 0 });
            }

        } catch (err) {
            console.error(`处理用户 ${user.username} 时出错: ${err.message}`);
            if (page) await page.screenshot({ path: `error_process_${i}.png` }).catch(() => { });
        } finally {
            // Cleanup Everything for this user
            console.log('正在清理用户环境...');
            try { if (browser) await browser.close(); } catch (e) { }

            // Kill the chrome process we started
            try {
                if (process.platform === 'win32') {
                    require('child_process').execSync(`taskkill /F /IM chrome.exe /FI "WINDOWTITLE eq Chrome (Isolated*)" || taskkill /F /IM chrome.exe`); // Imprecise on Windows but best effort
                } else {
                    if (chromeProcess && chromeProcess.pid) process.kill(-chromeProcess.pid, 'SIGKILL'); // If we could use pgid
                    require('child_process').execSync(`pkill -f "remote-debugging-port=${DEBUG_PORT}" || true`);
                }
            } catch (e) { }

            // Wait for port close
            await sleep(2000);
        }
    }

    console.log('\n\n╔════════════════════════════════════════════╗');
    console.log('║               Final Summary                ║');
    console.log('╚════════════════════════════════════════════╝');
    let summaryText = `*HidenCloud 续期任务报告 (${new Date().toLocaleDateString()})*\n\n`;

    summary.forEach(s => {
        const line = `User: ${s.user} | Status: ${s.status} | Services: ${s.services}`;
        console.log(line);
        summaryText += `👤 用户: \`${s.user}\`\n状态: ${s.status === 'Success' ? '✅ 成功' : '❌ 失败'}\n服务数: ${s.services}\n\n`;
    });

    await sendTelegramNotification(summaryText);

    // Exit code based on success
    if (summary.some(s => s.status.includes('Failed'))) {
        process.exit(1);
    } else {
        process.exit(0);
    }
})();
