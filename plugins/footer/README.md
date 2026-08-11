# footer (local fork)

Local fork of [`@quartz-community/footer`](https://github.com/quartz-community/footer).

Reason for forking: Quartz fills the `footer` layout slot only from the plugin
named `footer`, and the upstream plugin can render links but no free-form
notice text. This fork adds a `notice` option so every page can carry the
"auto-generated" disclaimer as a sentence with an inline link.

## Usage

```yaml title="quartz.config.yaml"
plugins:
  - source: ./plugins/footer
    enabled: true
    options:
      links: {}
      notice:
        before: "このサイトは "
        linkText: Karpathy LLM Wiki
        href: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
        after: " パターンによる自動生成です。"
```

## Options

| Option   | Type                     | Description                                             |
| -------- | ------------------------ | ------------------------------------------------------- |
| `links`  | `Record<string, string>` | Link labels → URLs, rendered as a list.                 |
| `notice` | `object`                 | `before` / `linkText` / `href` / `after`, all optional. |

## Maintenance

`dist/index.js` is hand-written ESM, not build output. Quartz uses a plugin's
pre-built `dist/` as-is when it exists, so there is no npm install or build step
for this plugin — edit `dist/index.js` directly.
