// Plain ESM on purpose: Quartz loads a plugin's `dist/` directly when it is
// present, so this plugin needs no build step. Edit this file, not a src/ copy.
//
// Renders ```mermaid blocks with Pele (https://pele.run) instead of the mermaid
// bundled in obsidian-flavored-markdown, so that plugin must run with
// `mermaid: false`. Blocks become a plain div before syntax highlighting sees
// them, and stay readable as source if the library cannot be loaded.
//
// Pele draws with CSS variables, so mapping them to the site's theme colors is
// enough to follow light/dark switches; nothing listens for themechange.

const PELE_URL = "https://cdn.jsdelivr.net/npm/pele@1.13.0/dist/esm/lazy.js"

const style = `.pele-diagram {
  --pele-bg: var(--light);
  --pele-fg: var(--darkgray);
  --pele-fg-on-light: #1f1f1f;
  --pele-fg-on-dark: #ffffff;
  --pele-muted: var(--gray);
  --pele-line: var(--darkgray);
  --pele-surface: var(--highlight);
  --pele-surface-alt: var(--lightgray);
  --pele-border: var(--gray);
  --pele-accent: var(--secondary);
  --pele-font: var(--bodyFont);
  --pele-font-mono: var(--codeFont);
  margin: 1rem 0;
}
.pele-diagram:not([data-pele-state="mounted"]) {
  font-family: var(--codeFont);
  font-size: 0.85rem;
  white-space: pre;
  overflow-x: auto;
}`

const script = `
let peleImport
async function mountDiagram(element, loadPele) {
  element.dataset.peleState = "loading"
  try {
    const { mountAsync } = await loadPele()
    const mounted = await mountAsync(element, element.textContent)
    element.dataset.peleState = "mounted"
    window.addCleanup(() => mounted.destroy())
  } catch (error) {
    element.dataset.peleState = "failed"
    console.error("Failed to render diagram", error)
  }
}
function mountDiagrams() {
  const loadPele = () => (peleImport ||= import(${JSON.stringify(PELE_URL)}))
  for (const element of document.querySelectorAll(".pele-diagram:not([data-pele-state])")) {
    mountDiagram(element, loadPele)
  }
}
document.addEventListener("nav", mountDiagrams)
document.addEventListener("render", mountDiagrams)
`

const replaceMermaid = (node) => {
  for (const [index, child] of (node.children ?? []).entries()) {
    if (child.type === "code" && child.lang === "mermaid") {
      node.children[index] = {
        type: "peleDiagram",
        data: {
          hName: "div",
          hProperties: { className: ["pele-diagram"] },
          hChildren: [{ type: "text", value: child.value }],
        },
      }
    } else {
      replaceMermaid(child)
    }
  }
}

export const PeleDiagrams = () => ({
  name: "PeleDiagrams",
  markdownPlugins() {
    return [() => (tree) => replaceMermaid(tree)]
  },
  externalResources() {
    return {
      js: [{ script, loadTime: "afterDOMReady", contentType: "inline", moduleType: "module" }],
      css: [{ content: style, inline: true }],
    }
  },
})
PeleDiagrams.quartzCategory = "transformer"

export default PeleDiagrams
