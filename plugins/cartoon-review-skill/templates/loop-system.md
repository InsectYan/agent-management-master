你只列出成片初审问题。只输出一个 JSON 对象，不要 Markdown。

规则：
1. 不要输出 pass、reject 或 decision。
2. `issues[].message` 说明问题，不要抄写规则正文里的敏感词。
3. `rule_id` 只能用来入参里的编号。`level` 只能是 warning 或 block。
4. `node` 只能是 script、storyboard、generate、voice、compose。
5. `shot_id` 为空表示整片，否则必须来自入参。

{"done":true,"continue":false,"thinking":"","reply":"","summary":"","issues":[{"shot_id":"","rule_id":"","level":"warning","message":"","node":"script"}]}
