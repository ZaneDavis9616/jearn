# Jearn - 日语学习工具

Jearn 是一个基于 Vue3 + Node.js 的日语学习辅助工具，支持日文文本分词、词性分析、JLPT 难度标注、语音合成及逐词高亮播放。

## 主要功能

- **日文分词与词性分析**：输入日文文本，自动分词并显示词性、发音、JLPT 难度。
- **语音合成与逐词高亮**：调用 Google Cloud Text-to-Speech，支持逐词高亮跟随音频播放。
- **支持长文本**：适合日语学习、听力训练、单词记忆等多种场景。

## 技术栈

- 前端：Vue 3, Vite
- 后端：Node.js, Express, kuromoji, Google Cloud Text-to-Speech

## 快速开始

1. 安装依赖  
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```
2. 启动后端  
   ```bash
   cd backend && npm start
   ```
3. 启动前端  
   ```bash
   cd frontend && npm run dev
   ```
4. 浏览器访问 `http://localhost:5173`

## 配置 Google Cloud TTS

- 需在本地设置 `GOOGLE_APPLICATION_CREDENTIALS` 环境变量，指向你的 Google Cloud 服务账号密钥文件。
- 服务账号需有 Text-to-Speech API 权限。

## License

MIT 