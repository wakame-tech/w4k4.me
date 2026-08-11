import { readFileSync } from "fs"
import { join } from "path"
import { h } from "preact"

// Plain ESM on purpose: Quartz loads a plugin's `dist/` directly when it is
// present, so this fork needs no build step. Edit this file, not a src/ copy.

const style = `footer {
  text-align: left;
  margin-bottom: 4rem;
  opacity: 0.7;
}
footer ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: row;
  gap: 1rem;
  margin-top: -1rem;
}
footer .generation-notice {
  font-size: 0.8rem;
  margin-top: 0.5rem;
}`

const createdWith = {
  "ja-JP": "作成",
}

function getQuartzVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"))
    return pkg.version ?? ""
  } catch {
    return ""
  }
}

/**
 * @typedef {object} NoticeOptions
 * @property {string} [before] text rendered before the link
 * @property {string} [linkText] anchor text
 * @property {string} [href] anchor target
 * @property {string} [after] text rendered after the link
 */

/**
 * @typedef {object} FooterOptions
 * @property {Record<string, string>} [links]
 * @property {NoticeOptions} [notice]
 */

const Footer = (opts) => {
  const version = getQuartzVersion()

  const FooterComponent = ({ displayClass, cfg }) => {
    const year = new Date().getFullYear()
    const links = opts?.links ?? {}
    const notice = opts?.notice

    return h("footer", { class: `${displayClass ?? ""}` }, [
      h("p", {}, [
        createdWith[cfg?.locale ?? "en-US"] ?? "Created with",
        " ",
        h("a", { href: "https://quartz.jzhao.xyz/" }, `Quartz${version ? ` v${version}` : ""}`),
        " © ",
        year,
      ]),
      notice
        ? h("p", { class: "generation-notice" }, [
            notice.before ?? "",
            notice.href
              ? h("a", { href: notice.href }, notice.linkText ?? notice.href)
              : (notice.linkText ?? ""),
            notice.after ?? "",
          ])
        : null,
      h(
        "ul",
        {},
        Object.entries(links).map(([text, link]) => h("li", {}, h("a", { href: link }, text))),
      ),
    ])
  }

  FooterComponent.css = style
  return FooterComponent
}

export { Footer }
