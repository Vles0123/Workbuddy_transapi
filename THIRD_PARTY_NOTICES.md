# 来源与第三方声明

本项目整合本地 Node.js API 转发包装、Docker 部署、本机凭据同步与账号池调度代码；不是 WorkBuddy、WorkDaddy 或 DeepSeek 官方产品。没有打包 WorkBuddy/WorkDaddy 应用、账号备份、运行数据或凭据。

| 项目 | 原出处 | 使用方式 |
|---|---|---|
| WorkDaddy | https://github.com/babygoton/WorkDaddy | 读取用户自行保存的本地账号备份格式；不复制或分发其应用代码 |
| dsh-workbuddy-connect 0.7.8 | https://www.npmjs.com/package/dsh-workbuddy-connect | npm 依赖；使用公开导出的凭据存储、刷新、上游客户端与请求转换 |
| dsh-workbuddy-connect 原仓库 | https://github.com/corrinehu/dsh-workbuddy-connect | npm 包元数据标注的原仓库；核查时公开地址返回 404，保留原始出处，不冒认其他分支 |
| WorkBuddy | https://www.workbuddy.cn/ | 用户自行安装、登录的官方客户端；不随本项目分发 |

dsh-workbuddy-connect 0.7.8 的 npm 元数据标注作者 corrinehu、MIT 许可，gitHead 为 `93aaecb2248084e2d306323c49f155ba2743a26d`。原始许可证如下（来自该版本 npm 包内 LICENSE）。其他 npm 依赖按各自许可证使用，由锁文件记录版本。

```text
MIT License

Copyright (c) 2026 Corrine Hu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
