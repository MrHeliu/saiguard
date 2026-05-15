---
trigger: always_on
---

1. 每次会话开始，必须先执行 `node runtime/sai.js status` 确认当前任务状态
2. 所有代码变更必须有对应的 task，执行前先 `sai start <id>`，禁止跳过直接改代码
3. 状态变更只能通过 sai start / sai finish / sai fail 三个命令，禁止手动编辑 runtime/ 下的 JSON 文件
4. sai finish 执行机械验证，验证失败时 task 保持 doing，必须修复后重新 finish，禁止手动改 JSON 标记 done
5. 同一时间只允许一个 task 处于 doing，start 前确认没有其他 doing 任务
6. dependsOn 未完成的 task 禁止执行
7. 禁止跨 agent role 修改代码
8. 遇环境故障无法 finish 时，使用 `sai fail <id> <原因>` 记录，不得静默跳过
9. BUG 修复也是任务：先 `sai fail` 当前 task，修复完成后再 `sai start`
10. 代码修改结束后，执行 `sai finish <id>` 并等待验证结果，完成前不得宣称"已修好"
11. sai.js 是 config-driven 架构，所有项目相关配置（路径、验证策略、状态机、技术栈等）在 `runtime/config.json`，修改 sai.js 时禁止硬编码项目特定值，必须通过 CONFIG.xxx 读取
12. 会话开始如有 doing 任务，执行 `sai resume` 获取上下文续接，不要重新 start
13. 前端 UI 设计必须遵守以下 Golden Hour 设计规范，禁止自由发挥：
    - 主题配色（CSS 变量）：
      --color-primary: #f4a900（芥末金，主色）
      --color-secondary: #c1666b（赤陶红，辅色）
      --color-bg: #d4b896（暖米色，背景）
      --color-text: #4a403a（巧克力棕，文字）
      --color-surface: #fffaf3（暖白，卡片/面板背景）
      --color-border: #c9b99a（暖灰，边框）
    - Vant 主题覆盖：通过 ConfigProvider 的 theme-vars 将上述颜色映射到 Vant 变量（如 buttonPrimaryBackground、navBarBackgroundColor 等）
    - Element Plus 管理后台同理，覆盖 --el-color-primary 等变量
    - 字体：标题用 "Noto Serif SC"（衬线，庄重），正文用 "Noto Sans SC"（无衬线，清晰），通过 Google Fonts CDN 加载
    - 圆角统一：按钮 8px、卡片 12px、弹窗 16px
    - 阴影统一：卡片用 box-shadow: 0 2px 12px rgba(74,64,58,0.08)
    - 禁止使用：Arial/Inter/Roboto 等通用字体、紫色渐变、纯白背景(#fff)、直角无边框布局
    - 每个页面必须有至少一个视觉亮点：渐变背景、装饰性分割线、微动画或品牌色点缀
    - 使用 frontend-design skill 时的审美标准：大胆且有辨识度，拒绝模板化 AI 风格
