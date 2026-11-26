// Plain ESM on purpose: Quartz loads a plugin's `dist/` directly when it is
// present, so this plugin needs no build step. Edit this file, not a src/ copy.
//
// Pages emitted outside the Quartz layout (the /shorts feed) can't be entered
// through the SPA router: it swaps in their <body> without running its inline
// script and with the site's styles still applied. Mark internal links to
// those slugs with data-router-ignore so the browser loads them normally.
// Runs after crawl-links, which sets data-slug on internal links.

const defaultOptions = { slugs: ["shorts"] }

export const RouterIgnore = (opts) => {
  const slugs = new Set({ ...defaultOptions, ...opts }.slugs)
  const mark = (node) => {
    if (node.type === "element" && node.tagName === "a") {
      const slug = node.properties?.dataSlug ?? node.properties?.["data-slug"]
      if (typeof slug === "string" && slugs.has(slug)) node.properties.dataRouterIgnore = ""
    }
    for (const child of node.children ?? []) mark(child)
  }
  return {
    name: "RouterIgnore",
    htmlPlugins() {
      return [() => (tree) => mark(tree)]
    },
  }
}
RouterIgnore.quartzCategory = "transformer"

export default RouterIgnore
