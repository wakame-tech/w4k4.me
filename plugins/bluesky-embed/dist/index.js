// Plain ESM on purpose: Quartz loads a plugin's `dist/` directly when it is
// present, so this plugin needs no build step. Edit this file, not a src/ copy.
//
// Bluesky's embed.js swaps each blockquote for an iframe whose card has rounded
// corners. The embedded page is light-scheme, so on a dark page the browser
// paints an opaque white backdrop behind the iframe and the corners show white.
// Pinning the iframe to `color-scheme: light` keeps the backdrop transparent,
// but then "system" color mode would always render the light card, so the
// script below passes the site's own theme as colorMode instead.
//
// The script also rescans on every SPA navigation. micromorph only runs a
// <script> it inserts as a new node; when the previous page had a script at
// the same position it patches that element's attributes, which never re-runs
// it, so embed.js would leave the raw blockquotes until a full reload.

const style = `.bluesky-embed iframe {
  color-scheme: light;
}`

const script = `
function syncBlueskyColorMode() {
  const mode = document.documentElement.getAttribute("saved-theme") === "dark" ? "dark" : "light"
  // Not yet replaced by embed.js: it reads this attribute when it scans.
  for (const quote of document.querySelectorAll("blockquote[data-bluesky-uri]")) {
    quote.dataset.blueskyEmbedColorMode = mode
  }
  // Already replaced: reload with the new mode.
  for (const iframe of document.querySelectorAll(".bluesky-embed iframe")) {
    const url = new URL(iframe.src)
    if (url.searchParams.get("colorMode") === mode) continue
    url.searchParams.set("colorMode", mode)
    iframe.src = url.toString()
  }
}
function scanBlueskyEmbeds() {
  if (!document.querySelector("blockquote[data-bluesky-uri]")) return
  if (window.bluesky) {
    window.bluesky.scan()
    return
  }
  // embed.js scans on its own once loaded.
  const script = document.createElement("script")
  script.src = "https://embed.bsky.app/static/embed.js"
  script.async = true
  document.head.appendChild(script)
}
document.addEventListener("nav", () => {
  syncBlueskyColorMode()
  scanBlueskyEmbeds()
})
document.addEventListener("themechange", syncBlueskyColorMode)
`

const BlueskyEmbed = () => {
  const BlueskyEmbedComponent = () => null
  BlueskyEmbedComponent.css = style
  BlueskyEmbedComponent.afterDOMLoaded = script
  return BlueskyEmbedComponent
}

export { BlueskyEmbed }
