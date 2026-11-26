import { mkdir, writeFile } from "fs/promises"
import { dirname, join } from "path"

// Plain ESM on purpose: Quartz loads a plugin's `dist/` directly when it is
// present, so this plugin needs no build step. Edit this file, not a src/ copy.
//
// Emits a "shorts" feed: a standalone page (<slug>.html) plus
// static/shorts/{index,<n>}.json: every section of every published page cut into
// passages of a few paragraphs, each with the nearest image if any. The page shuffles them client-side and shows
// one per screen with vertical scroll-snap, so swiping moves back and forth.

const defaultOptions = {
  slug: "shorts",
  // a passage packs whole paragraphs/list items of one section up to maxChars;
  // remainders shorter than minChars join the previous passage, and sections
  // with less than dropChars of text are skipped
  minChars: 100,
  maxChars: 280,
  dropChars: 30,
  // passages per static/shorts/<n>.json
  shardSize: 150,
}

const SKIP_TAGS = new Set(["pre", "script", "style", "svg", "table", "nav", "button", "math", "img"])
const HEADING = /^h[1-6]$/
const LIST = new Set(["ul", "ol"])
// Inline markup kept in a passage; every other element is unwrapped to its text.
const INLINE = { a: "a", strong: "strong", b: "strong", em: "em", i: "em", code: "code",
  del: "del", s: "del", mark: "mark", sup: "sup", sub: "sub", br: "br" }

const classList = (node) => {
  const c = node.properties?.className
  return Array.isArray(c) ? c : typeof c === "string" ? c.split(/\s+/) : []
}

const isSkipped = (node) =>
  node.type === "element" &&
  (SKIP_TAGS.has(node.tagName) ||
    // KaTeX renders both HTML and MathML; keep neither in an excerpt
    classList(node).some((c) => c.startsWith("katex")) ||
    // Quartz's heading anchor link icons
    classList(node).includes("role-anchor"))

const textOf = (node) => {
  if (node.type === "text") return node.value
  if (node.type !== "element" || isSkipped(node)) return ""
  return (node.children ?? []).map(textOf).join("")
}

const escapeHTML = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const resolveUrl = (url, slug) => {
  if (/^(https?:|data:|mailto:)/.test(url)) return url
  try {
    const u = new URL(url, `https://x/${slug}`)
    return u.pathname + u.hash
  } catch {
    return null
  }
}

// Serialize inline nodes to sanitized HTML, keeping only the text in
// [state.from, state.to) of the whitespace-collapsed text stream. state.pos
// tracks the stream position and state.text collects the whole stream, so a
// pass with from=0, to=Infinity measures a block.
const toHTML = (nodes, slug, state) => {
  let out = ""
  for (const node of nodes) {
    if (node.type === "text") {
      const v = node.value.replace(/\s+/g, " ")
      const a = Math.max(state.from, state.pos)
      const b = Math.min(state.to, state.pos + v.length)
      if (b > a) out += escapeHTML(v.slice(a - state.pos, b - state.pos))
      state.pos += v.length
      state.text += v
      continue
    }
    if (node.type !== "element" || isSkipped(node)) continue
    const tag = INLINE[node.tagName]
    if (tag === "br") {
      if (state.pos > state.from && state.pos < state.to) out += "<br>"
      continue
    }
    const inner = toHTML(node.children ?? [], slug, state)
    if (!inner.trim()) {
      out += inner
      continue
    }
    if (tag === "a") {
      const href = typeof node.properties?.href === "string" ? resolveUrl(node.properties.href, slug) : null
      if (!href) {
        out += inner
        continue
      }
      const ext = /^https?:/.test(href) ? ' target="_blank" rel="noopener"' : ""
      out += `<a href="${escapeHTML(href)}"${ext}>${inner}</a>`
    } else if (tag) {
      out += `<${tag}>${inner}</${tag}>`
    } else {
      out += inner
    }
  }
  return out
}

const measure = (nodes, slug) => {
  const state = { from: 0, to: Infinity, pos: 0, text: "" }
  toHTML(nodes, slug, state)
  const text = state.text
  const lead = text.length - text.trimStart().length
  const end = text.trimEnd().length
  return { text, lead, end }
}

// Flatten the document into an ordered list of headings, text blocks and images.
const collectBlocks = (root, slug) => {
  const blocks = []
  const walk = (node) => {
    if (node.type !== "element" && node.type !== "root") return
    if (node.type === "element") {
      const tag = node.tagName
      if (tag === "img") {
        const src = node.properties?.src
        if (typeof src === "string" && src) blocks.push({ type: "img", src })
        return
      }
      if (isSkipped(node)) return
      if (HEADING.test(tag)) {
        const text = textOf(node).replace(/\s+/g, " ").trim()
        blocks.push({ type: "h", id: node.properties?.id ?? null, text })
        return
      }
      if (tag === "p" || tag === "li") {
        // images inside a paragraph come before its text
        const findImgs = (n) => {
          if (n.type !== "element") return
          if (n.tagName === "img" && typeof n.properties?.src === "string")
            blocks.push({ type: "img", src: n.properties.src })
          ;(n.children ?? []).forEach(findImgs)
        }
        findImgs(node)
        // nested lists: only take the li's own content, then recurse into sublists
        const children = node.children ?? []
        const own = children.filter((c) => !(c.type === "element" && LIST.has(c.tagName)))
        const m = measure(own, slug)
        if (m.end > m.lead) blocks.push({ type: "p", li: tag === "li", nodes: own, ...m })
        children.filter((c) => c.type === "element" && LIST.has(c.tagName)).forEach(walk)
        return
      }
    }
    ;(node.children ?? []).forEach(walk)
  }
  walk(root)
  return blocks
}

const MAX_UNITS = 7
const SENTENCE_END = /[。！？!?]|\.(?=\s)/g

// Split one block into units of at most max chars, at sentence ends when it can.
const toUnits = (block, index, { minChars, maxChars }) => {
  const { text, lead, end } = block
  if (end - lead <= maxChars) return [{ block, index, from: lead, to: end }]
  const stops = [...text.matchAll(SENTENCE_END)].map((m) => m.index + 1)
  const units = []
  let start = lead
  while (end - start > maxChars) {
    const fits = stops.filter((s) => s > start + minChars / 2 && s <= start + maxChars)
    const cut = fits.length ? fits[fits.length - 1] : start + maxChars
    units.push({ block, index, from: start, to: cut })
    start = cut
    while (start < end && text[start] === " ") start++
  }
  if (end > start) units.push({ block, index, from: start, to: end })
  return units
}

const unitLen = (u) => u.to - u.from
const passageLen = (units) => units.reduce((n, u) => n + unitLen(u), 0)

const renderUnits = (units, slug) =>
  units
    .map((u) => {
      const { block } = u
      const state = { from: u.from, to: u.to, pos: 0, text: "" }
      let inner = toHTML(block.nodes, slug, state).trim()
      if (!inner) return ""
      if (u.from > block.lead) inner = "…" + inner
      if (u.to < block.end) inner += "…"
      return block.li ? `<p class="li">${inner}</p>` : `<p>${inner}</p>`
    })
    .join("")

// Nearest image to blocks [start, end], not crossing a heading: inside, then
// up to two blocks after, then up to two before.
const nearestImage = (blocks, start, end) => {
  for (let i = start; i <= end; i++) if (blocks[i].type === "img") return blocks[i].src
  for (let i = end + 1; i <= end + 2 && i < blocks.length; i++) {
    if (blocks[i].type === "h") break
    if (blocks[i].type === "img") return blocks[i].src
  }
  for (let i = start - 1; i >= start - 2 && i >= 0; i--) {
    if (blocks[i].type === "h") break
    if (blocks[i].type === "img") return blocks[i].src
  }
  return null
}

// Cover every section: pack its units into passages in order.
const toPassages = (blocks, slug, title, options) => {
  const { minChars, maxChars, dropChars } = options
  const slack = Math.round(maxChars * 1.3)
  const out = []
  let section = { heading: null, anchor: null, units: [] }

  const closeSection = () => {
    const passages = []
    let cur = []
    for (const u of section.units) {
      const len = passageLen(cur)
      // many short list items take more lines than their length suggests
      const full = cur.length >= MAX_UNITS
      if (cur.length && (full || (len + unitLen(u) > maxChars && (len >= minChars || len + unitLen(u) > slack)))) {
        passages.push(cur)
        cur = []
      }
      cur.push(u)
    }
    if (cur.length) {
      const prev = passages[passages.length - 1]
      if (passageLen(cur) < minChars && prev && passageLen(prev) + passageLen(cur) <= slack && prev.length + cur.length <= MAX_UNITS)
        prev.push(...cur)
      else passages.push(cur)
    }
    for (const units of passages) {
      if (passageLen(units) < dropChars) continue
      const image = nearestImage(blocks, units[0].index, units[units.length - 1].index)
      out.push({
        html: renderUnits(units, slug),
        heading: section.heading && section.heading !== title ? section.heading : null,
        anchor: section.anchor,
        image: image ? resolveUrl(image, slug) : null,
        len: passageLen(units),
      })
    }
  }

  blocks.forEach((b, i) => {
    if (b.type === "h") {
      closeSection()
      section = { heading: b.text, anchor: b.id, units: [] }
    } else if (b.type === "p") {
      section.units.push(...toUnits(b, i, options))
    }
  })
  closeSection()
  return out
}

const pageUrl = (slug) => "/" + slug.replace(/(^|\/)index$/, "$1")

const toDate = (v) => {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

const toTags = (v) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\s]+/) : [])
    .map((t) => String(t).trim())
    .filter(Boolean)

const renderPage = (cfg, slug) => {
  const depth = slug.split("/").length - 1
  const base = depth ? "../".repeat(depth) : "./"
  const title = `ショート | ${cfg.pageTitle ?? ""}`
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="robots" content="noindex">
<style>
:root { --bg:#0e0e10; --fg:#f2f2f2; --muted:#a8a8b0; --accent:#8fb8ff; --chip:#ffffff1f; }
/* always dark, like video apps: light images on a light page washed out the text */
:root { color-scheme: dark; }
* { box-sizing: border-box; }
html, body { margin:0; height:100%; background:var(--bg); color:var(--fg);
  font-family: system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif; }
#feed { height:100dvh; overflow-y:auto; scroll-snap-type:y mandatory; overscroll-behavior:contain; scrollbar-width:none; }
#feed::-webkit-scrollbar { display:none; }
.card { position:relative; height:100dvh; scroll-snap-align:start; scroll-snap-stop:always;
  display:flex; flex-direction:column; justify-content:center; overflow:hidden; }
.card .bg { position:absolute; inset:-40px; background-size:cover; background-position:center;
  filter: blur(32px) brightness(.35) saturate(1.2); z-index:0; }
/* keep the blurred backdrop dark even behind a white image */
.card.has-img::after { content:""; position:absolute; inset:0; z-index:0; pointer-events:none;
  background: linear-gradient(to bottom, #0006, #000a 55%, #000c); }
.card .inner { position:relative; z-index:1; width:min(640px, 100%); margin:0 auto;
  padding: 56px 20px calc(150px + env(safe-area-inset-bottom)); display:flex; flex-direction:column; gap:14px; max-height:100%; }
.card.has-img { color:#f2f2f2; --accent:#b9d2ff; --muted:#c8c8d0; --chip:#ffffff26; }

/* image with a slow Ken Burns pan while the card is on screen */
/* the image gives way to the text: it shrinks, the text does not */
.card .picwrap { overflow:hidden; border-radius:12px; background:#0003; flex:0 1 auto; min-height:0; display:flex; }
.card img.pic { display:block; width:100%; height:auto; max-height:44dvh; min-height:0; object-fit:contain; transform-origin: var(--ox, 50%) var(--oy, 50%); }
.card.long img.pic { max-height:26dvh; }
.card.active img.pic { animation: kb 14s ease-in-out infinite alternate; }
.card.active .bg { animation: kbbg 20s ease-in-out infinite alternate; }
@keyframes kb { from { transform: scale(1) translate(0,0); } to { transform: scale(1.14) translate(var(--tx, -2%), var(--ty, -2%)); } }
@keyframes kbbg { from { transform: scale(1); } to { transform: scale(1.1); } }
@media (prefers-reduced-motion: reduce) { .card.active img.pic, .card.active .bg { animation:none; } }

.card .crumb { font-size:13px; color:var(--muted); display:flex; gap:8px; align-items:center; min-width:0; }
.card .crumb .h { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.card .crumb .n { margin-left:auto; font-variant-numeric: tabular-nums; flex-shrink:0; }
.card .text { font-size: clamp(17px, 4.4vw, 21px); line-height:1.8; word-break:break-word; overflow:auto; flex:0 0 auto; }
.card.has-img .text { max-height:none; }
.card.no-img .text { font-size: clamp(19px, 5.2vw, 25px); }
.card.long .text, .card.no-img.long .text { font-size: clamp(15px, 4.1vw, 19px); line-height:1.7; }
.card .text p { margin:0 0 .6em; }
.card .text p:last-child { margin-bottom:0; }
.card .text p.li { padding-left:1.1em; text-indent:-1.1em; margin-bottom:.25em; }
.card .text p.li::before { content:"・"; display:inline-block; width:1.1em; text-indent:0; }
.card .text a { color:var(--accent); text-decoration:underline; text-underline-offset:3px; pointer-events:none; }
.card .text code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:.85em;
  background:#8883; padding:.1em .35em; border-radius:4px; }
.card .text mark { background:#ffe06680; color:inherit; padding:0 .15em; }

/* bottom-left meta, video-caption style */
.card .meta { position:absolute; z-index:2; display:flex; flex-direction:column; gap:6px; font-size:14px; min-width:0;
  left:max(20px, calc(50% - 300px)); right:max(80px, calc(50% - 300px)); bottom:calc(20px + env(safe-area-inset-bottom)); }
.card.has-img .meta { text-shadow: 0 1px 3px #0008; }
.card .meta .title { color:inherit; font-weight:700; font-size:15px; text-decoration:none;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.card .meta .sub { display:flex; flex-wrap:wrap; gap:6px; align-items:center; color:var(--muted); font-size:13px; }
.card .meta .chip { color:inherit; text-decoration:none; background:var(--chip); padding:2px 8px; border-radius:999px; }
.card .meta .read { color:var(--accent); text-decoration:none; font-weight:600; align-self:flex-start; }

.fab { position:fixed; z-index:10; border:0; background:#0008; color:#fff; border-radius:999px;
  font: 14px system-ui, sans-serif; text-decoration:none; padding:6px 12px; cursor:pointer; }
#home { top:12px; left:12px; }
#filter { top:12px; right:12px; }
#play { right:16px; bottom:calc(20px + env(safe-area-inset-bottom)); width:48px; height:48px; padding:0; font-size:18px; }
#playbar { position:fixed; left:0; bottom:0; height:3px; width:0; background:var(--accent); z-index:10; }
#flash { position:fixed; left:50%; top:50%; width:72px; height:72px; margin:-36px 0 0 -36px; z-index:11;
  display:grid; place-items:center; border-radius:999px; background:#0009; color:#fff; font-size:28px;
  opacity:0; pointer-events:none; transition: opacity .4s, transform .4s; transform: scale(.8); }
#flash.show { opacity:1; transform: scale(1); transition: none; }
#status { position:fixed; inset:0; display:grid; place-items:center; color:var(--muted); text-align:center; padding:16px; }
</style>
</head>
<body>
<a id="home" class="fab" href="${base}">← ${cfg.pageTitle ?? "home"}</a>
<div id="status">読み込み中…</div>
<main id="feed"></main>
<button id="play" class="fab" type="button" aria-label="自動再生">▶</button>
<div id="playbar"></div>
<div id="flash"></div>
<script>
(async () => {
  const feed = document.getElementById("feed")
  const status = document.getElementById("status")
  const tag = new URLSearchParams(location.search).get("tag")
  const getJSON = async (path) => {
    const r = await fetch("${base}static/shorts/" + path)
    if (!r.ok) throw new Error(r.status)
    return r.json()
  }
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  // avoid two cards from the same page in a row where possible
  const spread = (a, prev) => {
    for (let i = 0; i < a.length; i++) {
      const before = i ? a[i - 1] : prev
      if (!before || a[i].p !== before.p) continue
      const j = a.findIndex((it, k) => k > i && it.p !== before.p)
      if (j > 0) [a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  // passages are split at build time into randomly filled shards; load them
  // one at a time in random order. A tag feed loads only the shards that hold
  // pages with that tag.
  let pages, order
  const items = []
  const keep = (it) => !tag || (pages[it.p].g || []).includes(tag)
  const loadShard = async () => {
    if (!order.length) return
    const shard = shuffle((await getJSON(order.pop() + ".json")).filter(keep))
    items.push(...spread(shard, items[items.length - 1]))
  }
  try {
    const manifest = await getJSON("index.json")
    pages = manifest.pages
    const ids = new Set()
    if (tag) pages.forEach((p) => (p.g || []).includes(tag) && p.s.forEach((s) => ids.add(s)))
    else for (let k = 0; k < manifest.shards; k++) ids.add(k)
    order = shuffle([...ids])
    while (!items.length && order.length) await loadShard()
  } catch (e) {
    status.textContent = "読み込みに失敗しました"
    return
  }
  if (!items.length) {
    status.textContent = "#" + tag + " のショートはありません"
    return
  }
  status.remove()
  if (tag) {
    const f = document.createElement("a")
    f.id = "filter"
    f.className = "fab"
    f.href = location.pathname
    f.textContent = "#" + tag + "  ✕"
    document.body.append(f)
  }

  const abs = (p) => (/^(https?:|data:)/.test(p) ? p : "${base}" + p.replace(/^\\//, ""))
  const el = (tagName, cls, text) => {
    const e = document.createElement(tagName)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
  }
  const make = (it) => {
    const page = pages[it.p]
    const card = el("section", "card " + (it.image ? "has-img" : "no-img") + (it.len > 180 ? " long" : ""))
    card._item = it
    if (it.image) {
      const bg = el("div", "bg")
      bg.style.backgroundImage = "url(" + JSON.stringify(abs(it.image)) + ")"
      card.append(bg)
    }
    const inner = el("div", "inner")
    if (it.image) {
      const wrap = el("div", "picwrap")
      const img = el("img", "pic")
      img.loading = "lazy"
      img.alt = ""
      img.src = abs(it.image)
      img.onerror = () => wrap.remove()
      // vary the pan direction per card
      img.style.setProperty("--tx", (Math.random() * 6 - 3).toFixed(1) + "%")
      img.style.setProperty("--ty", (Math.random() * 6 - 3).toFixed(1) + "%")
      wrap.append(img)
      inner.append(wrap)
    }
    const crumb = el("div", "crumb")
    if (it.heading) crumb.append(el("span", "h", "§ " + it.heading))
    crumb.append(el("span", "n", it.i + 1 + " / " + page.n))
    const text = el("div", "text")
    text.innerHTML = it.html
    const href = abs(page.u) + (it.anchor ? "#" + encodeURIComponent(it.anchor) : "")
    const meta = el("div", "meta")
    const t = el("a", "title", page.t)
    t.href = href
    const sub = el("div", "sub")
    if (page.d) sub.append(el("span", "date", page.d))
    // at most 3 tags, the current filter first
    const tags = (page.g || []).slice().sort((a, b) => (b === tag) - (a === tag))
    for (const g of tags.slice(0, 3)) {
      const c = el("a", "chip", "#" + g)
      c.href = "?tag=" + encodeURIComponent(g)
      sub.append(c)
    }
    if (tags.length > 3) sub.append(el("span", "more", "+" + (tags.length - 3)))
    const read = el("a", "read", "記事を読む →")
    read.href = href
    meta.append(t)
    if (sub.childNodes.length) meta.append(sub)
    meta.append(read)
    inner.append(crumb, text)
    card.append(inner, meta)
    return card
  }

  // ---- autoplay: advance after a reading-time based delay ----
  const playBtn = document.getElementById("play")
  const playbar = document.getElementById("playbar")
  let active = null
  let playing = false
  let held = false
  let elapsed = 0
  let last = 0
  const duration = (card) => Math.min(20000, Math.max(4000, (card?._item?.len ?? 150) * 110 + 1500))
  const tick = (now) => {
    if (!playing) return
    if (!held && !document.hidden && active) elapsed += now - last
    last = now
    const d = duration(active)
    playbar.style.width = Math.min(100, (elapsed / d) * 100) + "%"
    if (elapsed >= d) {
      elapsed = 0
      feed.scrollBy({ top: feed.clientHeight, behavior: "smooth" })
    }
    requestAnimationFrame(tick)
  }
  const setPlaying = (on) => {
    playing = on
    playBtn.textContent = on ? "❚❚" : "▶"
    playBtn.setAttribute("aria-pressed", String(on))
    playbar.style.width = "0"
    if (on) {
      last = performance.now()
      requestAnimationFrame(tick)
    }
  }
  const flash = document.getElementById("flash")
  const toggle = () => {
    setPlaying(!playing)
    flash.textContent = playing ? "▶" : "❚❚"
    flash.classList.add("show")
    requestAnimationFrame(() => requestAnimationFrame(() => flash.classList.remove("show")))
  }
  playBtn.addEventListener("click", () => setPlaying(!playing))
  // a short tap anywhere on a card toggles play; press and hold pauses, like
  // stories; a drag (scroll) or a tap on the footer links does neither
  let down = null
  feed.addEventListener("pointerdown", (e) => {
    held = true
    down = { x: e.clientX, y: e.clientY, t: performance.now() }
  })
  addEventListener("pointercancel", () => {
    held = false
    down = null
  })
  addEventListener("pointerup", (e) => {
    held = false
    const d = down
    down = null
    if (!d || e.target.closest("a, button")) return
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || performance.now() - d.t > 300) return
    if (String(getSelection() || "")) return
    toggle()
  })

  const seen = new IntersectionObserver(
    (es) => {
      for (const e of es) {
        if (!e.isIntersecting) continue
        if (active) active.classList.remove("active")
        active = e.target
        active.classList.add("active")
        elapsed = 0
      }
    },
    { root: feed, threshold: 0.6 },
  )

  // ---- lazy rendering ----
  let next = 0
  const BATCH = 8
  const sentinel = el("div")
  let busy = false
  const more = async () => {
    if (busy) return
    busy = true
    try {
      while (next + BATCH > items.length && order.length) await loadShard()
    } catch (e) {}
    const end = Math.min(next + BATCH, items.length)
    for (; next < end; next++) {
      const card = make(items[next])
      feed.insertBefore(card, sentinel)
      seen.observe(card)
    }
    busy = false
    if (next >= items.length && !order.length) io.disconnect()
  }
  const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && more(), {
    root: feed, rootMargin: "200% 0px",
  })
  feed.append(sentinel)
  await more()
  io.observe(sentinel)

  document.addEventListener("keydown", (e) => {
    if (e.key === " ") {
      e.preventDefault()
      toggle()
      return
    }
    const dir = { ArrowDown: 1, j: 1, PageDown: 1, ArrowUp: -1, k: -1, PageUp: -1 }[e.key]
    if (!dir) return
    e.preventDefault()
    feed.scrollBy({ top: dir * feed.clientHeight, behavior: "smooth" })
  })
})()
</script>
</body>
</html>`
}

export const Shorts = (opts) => {
  const options = { ...defaultOptions, ...opts }
  const emitAll = async (ctx, content) => {
    const pages = []
    const items = []
    for (const [tree, file] of content) {
      const data = file.data ?? {}
      const slug = data.slug ?? ""
      if (!slug || data.unlisted === true || data.encrypted) continue
      if (slug.startsWith("tags/")) continue
      const fm = data.frontmatter ?? {}
      const title = fm.title ?? slug.split("/").pop()
      const passages = toPassages(collectBlocks(tree, slug), slug, title, options)
      if (!passages.length) continue
      const p = pages.length
      pages.push({ t: title, u: pageUrl(slug), d: toDate(fm.date), g: toTags(fm.tags), n: passages.length, s: [] })
      passages.forEach((x, i) => items.push({ p, i, ...x }))
    }

    // random assignment, so each shard is a sample of the whole site
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[items[i], items[j]] = [items[j], items[i]]
    }
    const dir = join(ctx.argv.output, "static", "shorts")
    await mkdir(dir, { recursive: true })
    const outs = []
    const shards = Math.max(1, Math.ceil(items.length / options.shardSize))
    for (let k = 0; k < shards; k++) {
      const chunk = items.slice(k * options.shardSize, (k + 1) * options.shardSize)
      // which shards hold each page, so a tag feed can skip the rest
      for (const it of chunk) if (pages[it.p].s.at(-1) !== k) pages[it.p].s.push(k)
      const out = join(dir, `${k}.json`)
      await writeFile(out, JSON.stringify(chunk))
      outs.push(out)
    }
    const manifest = join(dir, "index.json")
    await writeFile(manifest, JSON.stringify({ shards, total: items.length, pages }))
    const htmlOut = join(ctx.argv.output, `${options.slug}.html`)
    await mkdir(dirname(htmlOut), { recursive: true })
    await writeFile(htmlOut, renderPage(ctx.cfg.configuration, options.slug))
    return [...outs, manifest, htmlOut]
  }

  return {
    name: "Shorts",
    emit: (ctx, content) => emitAll(ctx, content),
    partialEmit: (ctx, content) => emitAll(ctx, content),
  }
}
Shorts.quartzCategory = "emitter"

export default Shorts
