import { h } from "preact"

// Plain ESM on purpose: Quartz loads a plugin's `dist/` directly when it is
// present, so this plugin needs no build step. Edit this file, not a src/ copy.
//
// Links to the previous (older) and next (newer) post in the same top-level
// folder, like the pager at the end of a Hatena Blog entry. Only pages with a
// frontmatter `date` count as posts, the same rule the RSS feed uses.

const style = `.post-nav {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin: 2rem 0 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--lightgray);
}
/* html[saved-theme] outranks quartz-themes' highlight on internal links. */
html[saved-theme] .post-nav a {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-width: 0;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--lightgray);
  border-radius: 8px;
  background-color: transparent;
  text-decoration: none;
}
html[saved-theme] .post-nav a:hover {
  border-color: var(--secondary);
}
.post-nav .post-nav-next {
  text-align: right;
}
.post-nav .post-nav-label {
  font-size: 0.8rem;
  color: var(--gray);
}
.post-nav .post-nav-title {
  overflow-wrap: anywhere;
}`

const defaultLabels = { prev: "« Previous", next: "Next »" }

const topFolder = (slug) => (slug.includes("/") ? slug.split("/")[0] : null)

const postDate = (file) => {
  const raw = file.frontmatter?.date
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

// Same as Quartz's resolveRelative: climb to the site root, then descend.
const relativeHref = (from, to) => {
  const depth = from.split("/").length - 1
  const root = depth === 0 ? "." : Array(depth).fill("..").join("/")
  return `${root}/${to}`
}

const PostNav = (opts) => {
  const folders = opts?.folders ?? ["blog"]
  const text = { ...defaultLabels, ...opts?.labels }

  const PostNavComponent = ({ fileData, allFiles, displayClass }) => {
    const slug = fileData.slug ?? ""
    const folder = topFolder(slug)
    if (!folder || !folders.includes(folder) || !postDate(fileData)) return null

    const posts = allFiles
      .filter((f) => topFolder(f.slug ?? "") === folder && !f.slug.endsWith("/index"))
      .map((f) => ({ slug: f.slug, title: f.frontmatter?.title ?? f.slug, date: postDate(f) }))
      .filter((p) => p.date)
      .sort((a, b) => a.date.getTime() - b.date.getTime() || a.slug.localeCompare(b.slug))

    const i = posts.findIndex((p) => p.slug === slug)
    if (i === -1) return null
    const prev = posts[i - 1]
    const next = posts[i + 1]
    if (!prev && !next) return null

    const link = (post, kind) =>
      h("a", { href: relativeHref(slug, post.slug), class: `internal post-nav-${kind}` }, [
        h("span", { class: "post-nav-label" }, text[kind]),
        h("span", { class: "post-nav-title" }, post.title),
      ])

    return h("nav", { class: `post-nav ${displayClass ?? ""}` }, [
      prev ? link(prev, "prev") : h("span"),
      next ? link(next, "next") : h("span"),
    ])
  }

  PostNavComponent.css = style
  return PostNavComponent
}

export { PostNav }
