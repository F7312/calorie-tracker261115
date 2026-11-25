# 热量缺口与餐食追踪

网页包含热量目标、餐食记录和日历。

## 部署到 Vercel

1. 更新现有仓库时，删除旧版 `gemini-code-1794723615158.html` 和 `public/index.html`。在 Vercel 导入仓库，Root Directory 保持仓库根目录，Framework Preset 选择 **Other**。`public/` 只包含登录页，追踪器由 `/api/access` 验证后提供。项目无需安装依赖或运行前端构建命令。
2. 在项目的 **Settings → Environment Variables** 中为对应部署环境设置 `SITE_PASSWORD` 和 `SITE_SESSION_SECRET`。前者是共享站点密码，后者用密码管理器生成至少 32 字符的独立随机值。建议将两者标记为 Secret。部署缺少任一项时会停止提供追踪页面。 [Vercel Secret 环境变量](https://vercel.com/docs/environment-variables/sensitive-environment-variables)
3. 为 AI 识别设置 `GEMINI_API_KEY`。请在 Google AI Studio 创建新密钥，并撤销旧提交中公开过的密钥。
4. 重新部署后打开域名根路径 `/`，输入密码进入。会话有效期为 12 小时，点页面顶部的 **退出** 可在当前浏览器立即锁定页面。

餐食识别使用 `gemini-3.1-flash-lite`，可用额度由 Gemini 项目决定。未配置密钥时，首页和已有记录仍然可用，点击 AI 识别会显示配置提示。公开部署时，访问餐食识别接口会消耗该项目的 Gemini 配额，可按访问量在 Vercel Firewall 为 `/api/analyze-meal` 配置速率限制。

## 数据保存

餐食、营养素、训练、当天步数、身体参数和日报以日期为键，保存在当前浏览器的 `localStorage`，存储项为 `calorie_tracker_data`。同一浏览器配置下，同一网站地址刷新或退出再登录后仍能看到记录。不同设备、浏览器配置或网站地址各自独立，清除该站点数据会删除本地记录。

项目没有接入服务端数据库或同步。在浏览器里选择的照片只用于当前识别，提交时随餐食说明经 Vercel Function 发送给 Gemini。识别结果由浏览器暂存，点击 **加入今日累计** 才写入本地记录。密码会话只在 Cookie 里保留签名和到期时间，不保存用户资料或餐食。

## 今日汇总和结账

- 今日摄入按餐食的录入时间排列。今日消耗按训练发生时间排列，每次训练填写设备显示的活动热量。训练步数已包含在全天步数时，可在训练项中填写，结账时会从日常步数中扣除。
- 综合汇总在结账前只计已记录的训练消耗，结账后纳入日常规消耗。热量剩余额度取计划摄入目标减累计摄入，最低为 0。三项营养素进度各自按最低值计算。
- 北京时间 21:30 后，输入当天步数即可结账。填 0 代表没有步数。模拟页面可用顶部调试开关测试时间条件。结账会保存当日明细，日历可切换月份查看历史日报。

日常规消耗采用成人估算。静息能耗按身高、体重、年龄和性别使用 Mifflin–St Jeor 公式。日常步数乘以成人步幅回归估计得到距离，再用 ACSM 平地步行水平项折算净热量，约为 `0.5 × 体重（kg）× 距离（km）`。两项相加得到日常规消耗，结账时作为最后一条消耗记录。坡度、食物热效应和未记录的活动没有单独计入。 [Mifflin–St Jeor 原始研究](https://pubmed.ncbi.nlm.nih.gov/2305711/) · [步幅回归研究](https://digitalcommons.wku.edu/ijesab/vol2/iss17/15/) · [ACSM 平地步行方程](https://journals.physiology.org/doi/10.1152/japplphysiol.00504.2017)
