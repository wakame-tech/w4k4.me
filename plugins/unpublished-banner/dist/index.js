import { h } from "preact"

// Plain ESM on purpose: Quartz loads a plugin's `dist/` directly when it is
// present, so this plugin needs no build step. Edit this file, not a src/ copy.
//
// The site only publishes pages with `publish: true` (explicit-publish), so a
// normal build never renders anything from this plugin. scripts/
// preview-unpublished.sh turns explicit-publish off to preview drafts; there:
//
// - a page without `publish: true` gets a banner above its title, and
// - links to such pages in lists (explorer, folder and tag listings, recent
//   notes, backlinks) get a tag after their title: "DRAFT" for
//   `status: draft`, otherwise "非公開".
//
// The component knows every page (allFiles), so it embeds the unpublished
// slugs as JSON and the client script marks matching links. In a normal build
// allFiles holds only published pages, the list is empty and nothing renders.
//
// Generated pages (folder and tag listings) have no source file and no
// frontmatter of their own, so they never get a banner.

const style = `.unpublished-banner {
  margin: 0 0 1rem 0;
  padding: 0.4rem 0.8rem;
  border: 2px dashed #c0392b;
  border-radius: 6px;
  background: rgba(192, 57, 43, 0.12);
  color: #c0392b;
  font-weight: bold;
}
.unpublished-banner small {
  margin-left: 0.6rem;
  font-weight: normal;
  color: var(--darkgray);
}
.unpublished-tag {
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
function markLinks(root) {
  const pages = unpublishedPages()
  if (Object.keys(pages).length === 0) return
  for (const a of root.querySelectorAll(LIST_LINKS)) {
    if (a.querySelector(".unpublished-tag")) continue
    const label = pages[slugOf(a.getAttribute("href") || "")]
    if (!label) continue
    const tag = document.createElement("span")
    tag.className = "unpublished-tag"
    tag.textContent = label
    a.appendChild(tag)
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

const UnpublishedBanner = (opts) => {
  const label = opts?.label ?? "非公開"

  const UnpublishedBannerComponent = ({ fileData, allFiles, displayClass }) => {
    const pages = {}
    for (const file of allFiles ?? []) {
      if (!file.filePath || isPublished(file.frontmatter?.publish)) continue
      pages[pageSlug(file.slug)] = labelFor(file.frontmatter)
    }
    const children = []
    if (Object.keys(pages).length > 0) {
      children.push(
        h("script", {
          type: "application/json",
          id: "unpublished-pages",
          dangerouslySetInnerHTML: { __html: JSON.stringify(pages).replace(/</g, "\\u003c") },
        }),
      )
    }
    const fm = fileData.frontmatter ?? {}
    if (fileData.filePath && !isPublished(fm.publish)) {
      const status = typeof fm.status === "string" && fm.status ? ` (status: ${fm.status})` : ""
      children.push(
        h(
          "div",
          { class: `unpublished-banner ${displayClass ?? ""}` },
          label,
          h("small", null, `publish: true がないので公開されません${status}`),
        ),
      )
    }
    return children.length > 0 ? h("div", null, ...children) : null
  }

  UnpublishedBannerComponent.css = style
  UnpublishedBannerComponent.afterDOMLoaded = script
  return UnpublishedBannerComponent
}

export { UnpublishedBanner }
