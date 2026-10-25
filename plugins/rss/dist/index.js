import { mkdir, writeFile } from "fs/promises"
import { dirname, join } from "path"

// Plain ESM on purpose: Quartz loads a plugin's `dist/` directly when it is
// present, so this plugin needs no build step. Edit this file, not a src/ copy.
//
// Unlike content-index's RSS, only pages with a frontmatter `date` under the
// configured folders are listed. Undated pages (tags, folders, canvas) would
// otherwise get the build time as their date and push real posts out.

const defaultOptions = {
  folders: ["blog"],
  limit: 20,
  slug: "index",
}

const escapeXML = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const toPost = (data, folders) => {
  const slug = data.slug ?? ""
  if (!folders.some((f) => slug.startsWith(`${f}/`))) return null
  // skip only the top folder listing (e.g. monthly/index); nested index pages
  // such as monthly/2024/07/index are posts
  if (folders.some((f) => slug === `${f}/index`) || data.unlisted === true) return null

  const fm = data.frontmatter ?? {}
  if (!fm.date) return null
  const date = new Date(fm.date)
  if (Number.isNaN(date.getTime())) return null

  return {
    slug,
    title: fm.title ?? slug.split("/").pop(),
    description: data.description ?? "",
    date,
  }
}

const renderFeed = (cfg, posts) => {
  const base = cfg.baseUrl ?? ""
  const pageTitle = cfg.pageTitle ?? ""
  const items = posts
    .map((p) => {
      const url = `https://${base}/${encodeURI(p.slug.replace(/(^|\/)index$/, "$1"))}`
      return `<item>
    <title>${escapeXML(p.title)}</title>
    <link>${url}</link>
    <guid>${url}</guid>
    <description><![CDATA[ ${p.description} ]]></description>
    <pubDate>${p.date.toUTCString()}</pubDate>
  </item>`
    })
    .join("")

  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>${escapeXML(pageTitle)}</title>
    <link>https://${base}</link>
    <description>Recent posts on ${escapeXML(pageTitle)}</description>
    <generator>Quartz -- quartz.jzhao.xyz</generator>
    ${items}
  </channel>
</rss>`
}

export const RSS = (opts) => {
  const options = { ...defaultOptions, ...opts }
  const emitAll = async (ctx, content) => {
    const posts = content
      .map(([, file]) => toPost(file.data ?? {}, options.folders))
      .filter(Boolean)
      .sort((a, b) => b.date.getTime() - a.date.getTime() || a.title.localeCompare(b.title))
      .slice(0, options.limit)

    const out = join(ctx.argv.output, `${options.slug}.xml`)
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, renderFeed(ctx.cfg.configuration, posts))
    return [out]
  }

  return {
    name: "RSS",
    emit: (ctx, content) => emitAll(ctx, content),
    partialEmit: (ctx, content) => emitAll(ctx, content),
  }
}
RSS.quartzCategory = "emitter"

export default RSS
