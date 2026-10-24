// Plain ESM on purpose: Quartz loads a plugin's `dist/` directly when it is
// present, so this plugin needs no build step. Edit this file, not a src/ copy.
//
// crawl-links' prettyLinks replaces internal link text with its basename, so
// an inline `#watch/comic` tag was shown as `comic`. Run after crawl-links and
// put the full tag path back, taken from the data-slug it sets.

const TAG_PREFIX = "tags/"

const hasClass = (node, name) => {
  const cls = node.properties?.className
  return Array.isArray(cls) ? cls.includes(name) : cls === name
}

const restore = (node) => {
  if (node.type === "element" && node.tagName === "a" && hasClass(node, "tag-link")) {
    const slug = node.properties["data-slug"] ?? node.properties.dataSlug
    const text = node.children.length === 1 ? node.children[0] : null
    if (typeof slug === "string" && slug.startsWith(TAG_PREFIX) && text?.type === "text") {
      text.value = slug.slice(TAG_PREFIX.length)
    }
    return
  }
  for (const child of node.children ?? []) restore(child)
}

export const TagLinkText = () => ({
  name: "TagLinkText",
  htmlPlugins() {
    return [() => (tree) => restore(tree)]
  },
})
TagLinkText.quartzCategory = "transformer"

export default TagLinkText
