import { readFileSync } from 'node:fs'

const dataURL = (name) => new URL(`./data/${name}`, import.meta.url)
const readJSON = (name) => JSON.parse(readFileSync(dataURL(name), 'utf8'))

/** Corpus manifest: { version, total, schemaSha256, groups: [{ group, file, count }] } */
export const manifest = readJSON('manifest.json')

/** Group names, in manifest order. */
export const groups = Object.freeze(manifest.groups.map(g => g.group))

const cache = new Map()

/**
 * Load one group's vector file ({ vectors }). Lazy; parsed once and cached.
 * @param {string} group
 */
export function load (group) {
  let file = cache.get(group)
  if (!file) {
    const entry = manifest.groups.find(g => g.group === group)
    if (!entry) throw new Error(`unknown group: ${group} (known: ${groups.join(', ')})`)
    file = readJSON(entry.file)
    cache.set(group, file)
  }
  return file
}

/** Load every group, in manifest order. */
export function all () {
  return manifest.groups.map(g => load(g.group))
}
