## Gate C — 全新 clone 记录

2026-11-13 15:29–15:36（北京），本机 Windows 11 / Node 22.22.2，从 GitHub 全新 clone：

```
$ git clone https://github.com/hkmpn9s6dh-commits/hackathon-2026-saddle-and-spoke.git
$ cd hackathon-2026-saddle-and-spoke
$ npm install            # 185 packages, 7s
$ bash scripts/verify.sh
```

输出（27 项 + 浏览器端到端）：

```
node available (v22.22.2)                            PASS
npm available                                        PASS
dependencies installed                               PASS
typescript type check                                PASS
unit checks (32)                                     PASS
production build                                     PASS
published: dist/index.html                           PASS
published: dist/agent-manifest.json                  PASS
published: dist/links.json                           PASS
published: dist/saddle_and_spoke.network.json        PASS
asset paths are relative (repository subpath)        PASS
fonts are bundled and hashed                         PASS
no font CDN at runtime                               PASS
MIT licence present                                  PASS
README documents the verification                    PASS
docs/00-BRIEF.md                                     PASS
docs/01-SPEC.md                                      PASS
docs/07-UI.md                                        PASS
docs/02-ACTIONS.md                                   PASS
docs/04-PROOF.md                                     PASS
docs/05-SUBMISSION.md                                PASS
the published network is present                     PASS
the peer HOCON has no include                        PASS
the peer HOCON has no substitution                   PASS
visitor-facing copy is English                       PASS
no credentials in the repository                     PASS
no third-party analytics                             PASS
browser end-to-end (31 checks)                       PASS
---------------------------------------------------------------
all checks passed
```

**这次 clone 抓到一个真 bug**：Windows 下 checkout 把发布件换成 CRLF，HOCON 与它的 JSON 序列化
因此不再相等（三引号字符串里多出 \r\n）。第一次 clone 在这条上红了。修法是 `.gitattributes`
统一 LF + 测试里对行尾做归一；修完重 clone 全绿。这正是闸 C 存在的理由 —— 本机反复跑
`verify.sh` 永远看不到它。
