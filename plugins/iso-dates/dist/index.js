// Plain ESM on purpose: Quartz loads a plugin's `dist/` directly when it is
// present, so this plugin needs no build step. Edit this file, not a src/ copy.
//
// content-meta, folder-page and tag-page each bundle their own formatDate(),
// which always uses a short month name ("Sep 30, 2024") whatever the locale.
// Rather than fork all three, rewrite the rendered <time> elements from their
// datetime attribute on every navigation.

const IsoDates = (opts) => {
  const timeZone = opts?.timeZone ?? "Asia/Tokyo"

  const IsoDatesComponent = () => null
  IsoDatesComponent.afterDOMLoaded = `
const isoDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: ${JSON.stringify(timeZone)},
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})
function showIsoDates() {
  for (const time of document.querySelectorAll("time[datetime]")) {
    const date = new Date(time.getAttribute("datetime"))
    if (!Number.isNaN(date.getTime())) time.textContent = isoDateFormat.format(date)
  }
}
document.addEventListener("nav", showIsoDates)
`
  return IsoDatesComponent
}

export { IsoDates }
