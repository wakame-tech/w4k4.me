import { h } from "preact"

// Plain ESM on purpose: Quartz loads a plugin's `dist/` directly when it is
// present, so this plugin needs no build step. Edit this file, not a src/ copy.
//
// The site only publishes pages with `publish: true` (explicit-publish), so a
// normal build never renders anything from this plugin. scripts/
// preview-unpublished.sh turns explicit-publish off to preview drafts; there:
//
// pages without `publish: true` get a tag after their title, both on the page
// itself and on links to them in lists (explorer, folder and tag listings,
// recent notes, backlinks): "DRAFT" for `status: draft`, otherwise "非公開".
//
// The component knows every page (allFiles), so it embeds the unpublished
// slugs as JSON and the client script marks matching links. In a normal build
// allFiles holds only published pages, the list is empty and nothing renders.
//
// Generated pages (folder and tag listings) have no source file, so they are
// never in the list.

const style = `.unpublished-tag {
  display: inline-block;
  margin-left: 0.4em;
  padding: 0 0.35em;
  border: 1px solid #c0392b;
  border-radius: 4px;
  color: #c0392b;
  font-size: 0.7em;
  font-weight: bold;
  line-height: 1.4;
  vertical-align: middle;
  white-space: nowrap;
  /* Explorer links are flex rows: keep the tag from stretching to the
     height of a wrapped title. */
  flex: none;
  align-self: center;
  height: fit-content;
}`

const script = `
const LIST_LINKS = "a.nav-file-title, li.section-li a.internal, .recent-notes a.internal, .backlinks a.internal"
function unpublishedPages() {
  const el = document.getElementById("unpublished-pages")
  if (!el) return {}
  try { return JSON.parse(el.textContent || "{}") } catch { return {} }
}
function slugOf(href) {
  let path = decodeURIComponent(new URL(href, location.href).pathname)
  path = path.replace(/^\\//, "").replace(/\\.html$/, "").replace(/\\/$/, "")
  return path.replace(/\\/index$/, "")
}
function makeTag(label) {
  const tag = document.createElement("span")
  tag.className = "unpublished-tag"
  tag.textContent = label
  return tag
}
function markLinks(root) {
  const pages = unpublishedPages()
  if (Object.keys(pages).length === 0) return
  const title = root.querySelector("h1.article-title")
  const own = pages[slugOf(location.href)]
  if (title && own && !title.querySelector(".unpublished-tag")) title.appendChild(makeTag(own))
  for (const a of root.querySelectorAll(LIST_LINKS)) {
    if (a.querySelector(".unpublished-tag")) continue
    const label = pages[slugOf(a.getAttribute("href") || "")]
    if (!label) continue
    a.appendChild(makeTag(label))
  }
}
let unpublishedObserver
document.addEventListener("nav", () => {
  markLinks(document)
  // The explorer fills its tree after "nav", so watch for added links.
  unpublishedObserver?.disconnect()
  unpublishedObserver = new MutationObserver(() => markLinks(document))
  unpublishedObserver.observe(document.body, { childList: true, subtree: true })
  window.addCleanup?.(() => unpublishedObserver?.disconnect())
})
`

function isPublished(value) {
  return value === true || value === "true"
}

function labelFor(frontmatter) {
  return frontmatter?.status === "draft" ? "DRAFT" : "非公開"
}

function pageSlug(slug) {
  return (slug ?? "").replace(/\/index$/, "").replace(/^index$/, "")
}

const UnpublishedTags = () => {
  const UnpublishedTagsComponent = ({ allFiles }) => {
    const pages = {}
    for (const file of allFiles ?? []) {
      if (!file.filePath || isPublished(file.frontmatter?.publish)) continue
      pages[pageSlug(file.slug)] = labelFor(file.frontmatter)
    }
    if (Object.keys(pages).length === 0) return null
    return h("script", {
      type: "application/json",
      id: "unpublished-pages",
      dangerouslySetInnerHTML: { __html: JSON.stringify(pages).replace(/</g, "\\u003c") },
    })
  }

  UnpublishedTagsComponent.css = style
  UnpublishedTagsComponent.afterDOMLoaded = script
  return UnpublishedTagsComponent
}

export { UnpublishedTags }
