import { h } from "preact"

// Plain ESM on purpose: Quartz loads a plugin's `dist/` directly when it is
// present, so this plugin needs no build step. Edit this file, not a src/ copy.
//
// Posts written by an AI carry `author: <model>` in their frontmatter. Show it
// under the meta line; a post without `author` is the site owner's own and
// shows nothing. Limited to post folders because notes elsewhere use `author`
// for the author of the book or paper they are about.

const style = `.post-author {
  margin-top: 0;
  color: var(--darkgray);
}`

const PostAuthor = (opts) => {
  const folders = opts?.folders ?? ["blog"]
  const label = opts?.label ?? "Author: "

  const PostAuthorComponent = ({ fileData, displayClass }) => {
    const folder = (fileData.slug ?? "").split("/")[0]
    if (!folders.includes(folder)) return null
    const raw = fileData.frontmatter?.author
    if (typeof raw !== "string" || raw.trim() === "") return null
    const author = raw.replace(/^\[\[|\]\]$/g, "").trim()

    return h("p", { class: `content-meta post-author ${displayClass ?? ""}` }, `${label}${author}`)
  }

  PostAuthorComponent.css = style
  return PostAuthorComponent
}

export { PostAuthor }
