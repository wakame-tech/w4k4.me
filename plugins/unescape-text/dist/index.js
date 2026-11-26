// Plain ESM on purpose: Quartz loads a plugin's `dist/` directly when it is
// present, so this plugin needs no build step. Edit this file, not a src/ copy.
//
// The description plugin stores the page's plain text HTML-escaped in
// file.data.text, which content-index writes to contentIndex.json. The search
// script escapes that text again before highlighting, so results showed
// `&quot;` and `&lt;` literally. Run after description (order 70) and store
// the plain text. file.data.description is left escaped: it goes into
// attributes and the RSS feed.

const unescapeHTML = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")

export const UnescapeText = () => ({
  name: "UnescapeText",
  htmlPlugins() {
    return [
      () => (_tree, file) => {
        if (typeof file.data.text === "string") file.data.text = unescapeHTML(file.data.text)
      },
    ]
  },
})
UnescapeText.quartzCategory = "transformer"

export default UnescapeText
