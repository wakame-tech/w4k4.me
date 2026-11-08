// Plain ESM on purpose: Quartz loads a plugin's `dist/` directly when it is
// present, so this plugin needs no build step. Edit this file, not a src/ copy.
//
// Embeds the PDF that scripts/build-pdfs.mjs writes into public/ after the
// Quartz build:
//   typst: main.typ  -> main.pdf in the page's directory, embedded after the body
//   marp: true       -> <page>.pdf next to the page, embedded in place of the
//                       slide markdown (which would not read well as a page)
//
// The PDF is not part of the content tree, so the link is written from the site
// root (crawl-links resolves an unknown target from there).

import path from "node:path"
import { slugifyFilePath } from "@quartz-community/utils/path"

const escapeAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

// Site path of a page's PDF, e.g. "incremental_report/main.pdf", or undefined.
// `slug` is the page's slug without extension ("incremental_report/index").
export const pdfFor = (frontmatter, slug) => {
  let name
  if (typeof frontmatter?.typst === "string") {
    name = slugifyFilePath(frontmatter.typst.replace(/\.typ$/, "") + ".pdf")
  } else if (frontmatter?.marp === true) {
    name = path.posix.basename(slug) + ".pdf"
  } else {
    return undefined
  }
  return path.posix.join(path.posix.dirname(slug), name)
}

const embed = (pdf) => {
  const url = escapeAttr(encodeURI(pdf))
  return {
    type: "html",
    // crawl-links marks the link internal; keep SPA routing and popovers from
    // fetching the PDF as if it were a page
    value:
      `<iframe src="${url}" class="pdf" title="PDF"></iframe>\n` +
      `<p><a href="${url}" data-router-ignore data-no-popover="true">PDF を開く</a></p>`,
  }
}

export const PdfEmbed = () => ({
  name: "PdfEmbed",
  markdownPlugins() {
    return [
      () => (tree, file) => {
        const frontmatter = file.data.frontmatter
        const pdf = pdfFor(frontmatter, file.data.slug)
        if (!pdf) return
        if (frontmatter.marp === true) {
          tree.children = [embed(pdf)]
        } else {
          tree.children.push(embed(pdf))
        }
      },
    ]
  },
})
PdfEmbed.quartzCategory = "transformer"

export default PdfEmbed
