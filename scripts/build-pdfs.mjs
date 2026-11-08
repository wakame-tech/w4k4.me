#!/usr/bin/env node
// Builds the PDFs that plugins/pdf-embed embeds, straight into the Quartz
// output, so nothing is generated inside the content tree. Run after
// `quartz build`:
//
//   node scripts/build-pdfs.mjs [content dir] [output dir]
//                               (default content/wiki, public)
//
// Only published pages (publish: true, not matched by ignorePatterns) are built:
//   typst: main.typ  -> typst compile, with the page's directory as --root
//   marp: true       -> marp-cli, from the page itself

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { slugifyFilePath } from "@quartz-community/utils/path"
import { globbySync } from "globby"
import YAML from "yaml"
import { pdfFor } from "../plugins/pdf-embed/dist/index.js"

const MARP_CLI = "@marp-team/marp-cli@4.5.1"
const [contentDir = "content/wiki", outputDir = "public"] = process.argv.slice(2)
const config = YAML.parse(fs.readFileSync("quartz.config.yaml", "utf8")).configuration

// Pages without typst:/marp: are skipped before parsing, so an unrelated page
// with broken frontmatter does not stop the build.
const frontmatterOf = (text) => {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m || !/^(typst|marp):/m.test(m[1])) return {}
  return YAML.parse(m[1]) ?? {}
}

const pages = globbySync("**/*.md", { cwd: contentDir, ignore: config.ignorePatterns })
let built = 0
for (const page of pages) {
  const file = path.join(contentDir, page)
  const frontmatter = frontmatterOf(fs.readFileSync(file, "utf8"))
  if (frontmatter.publish !== true && frontmatter.publish !== "true") continue
  const pdf = pdfFor(frontmatter, slugifyFilePath(page, true))
  if (!pdf) continue

  const out = path.join(outputDir, pdf)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  console.log(`build-pdfs: ${page} -> ${out}`)
  if (frontmatter.marp === true) {
    // marp-cli reads slides from stdin whenever it is not a TTY, so close it
    execFileSync(
      "npx",
      ["--yes", MARP_CLI, "--no-stdin", "--pdf", "--allow-local-files", "-o", out, file],
      { stdio: ["ignore", "inherit", "inherit"] },
    )
  } else {
    const dir = path.dirname(file)
    execFileSync("typst", ["compile", "--root", dir, path.join(dir, frontmatter.typst), out], {
      stdio: ["ignore", "inherit", "inherit"],
    })
  }
  built++
}
console.log(`build-pdfs: built ${built} PDF(s)`)
