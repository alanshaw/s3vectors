import { readFileSync } from 'node:fs'

const dataURL = (name) => new URL(`./data/${name}`, import.meta.url)
const readJSON = (name) => JSON.parse(readFileSync(dataURL(name), 'utf8'))

/** Corpus manifest: { version, total, schemaSha256, areas: [{ area, file, count }] } */
export const manifest = readJSON('manifest.json')

/** Area names, in manifest order. */
export const areas = Object.freeze(manifest.areas.map(a => a.area))

const cache = new Map()

/**
 * Load one area's vector file ({ area, vectors }). Lazy; parsed once and cached.
 * @param {string} area
 */
export function load (area) {
  let file = cache.get(area)
  if (!file) {
    const entry = manifest.areas.find(a => a.area === area)
    if (!entry) throw new Error(`unknown area: ${area} (known: ${areas.join(', ')})`)
    file = readJSON(entry.file)
    cache.set(area, file)
  }
  return file
}

/** Load every area, in manifest order. */
export function all () {
  return manifest.areas.map(a => load(a.area))
}
