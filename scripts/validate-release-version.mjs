import { readFileSync } from 'node:fs'

const tag = process.env.GITHUB_REF_NAME
const packageVersion = JSON.parse(readFileSync('package.json', 'utf8')).version
const tauriVersion = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version
const cargoManifest = readFileSync('src-tauri/Cargo.toml', 'utf8')
const cargoVersion = cargoManifest.match(/^version\s*=\s*"([^"]+)"/m)?.[1]

if (!tag?.startsWith('app-v')) {
  throw new Error(`Expected an app-v* release tag; received ${tag ?? 'no tag'}`)
}

const tagVersion = tag.slice('app-v'.length)
const versions = { packageVersion, tauriVersion, cargoVersion }

if (Object.values(versions).some((version) => !version || version !== tagVersion)) {
  throw new Error(
    `Release tag ${tag} must match package.json, tauri.conf.json, and Cargo.toml versions: ${JSON.stringify(versions)}`,
  )
}

console.log(`Validated release ${tag}`)
