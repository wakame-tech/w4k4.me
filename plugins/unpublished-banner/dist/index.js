import { h } from "preact"

// Plain ESM on purpose: Quartz loads a plugin's `dist/` directly when it is
// present, so this plugin needs no build step. Edit this file, not a src/ copy.
//
// The site only publishes pages with `publish: true` (explicit-publish), so a
// normal build never renders this banner. scripts/preview-unpublished.sh turns
// explicit-publish off to preview drafts; there, pages without `publish: true`
// get a banner so they can't be mistaken for published ones.
//
// Generated pages (folder and tag listings) have no source file and no
// frontmatter of their own, so they are skipped.

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
}`

function isPublished(value) {
  return value === true || value === "true"
}

const UnpublishedBanner = (opts) => {
  const label = opts?.label ?? "非公開"

  const UnpublishedBannerComponent = ({ fileData, displayClass }) => {
    if (!fileData.filePath) return null
    const fm = fileData.frontmatter ?? {}
    if (isPublished(fm.publish)) return null
    const status = typeof fm.status === "string" && fm.status ? ` (status: ${fm.status})` : ""
    return h(
      "div",
      { class: `unpublished-banner ${displayClass ?? ""}` },
      label,
      h("small", null, `publish: true がないので公開されません${status}`),
    )
  }

  UnpublishedBannerComponent.css = style
  return UnpublishedBannerComponent
}

export { UnpublishedBanner }
