import { createRequire } from 'node:module'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const ts = require('typescript')

function getRepoRoot() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(scriptDir, '..', '..', '..')
}

function findPnpmPackageDir(repoRoot, packageName) {
  const pnpmDir = path.join(repoRoot, 'node_modules', '.pnpm')
  const candidates = require('node:fs')
    .readdirSync(pnpmDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${packageName}@`))
    .map((entry) => path.join(pnpmDir, entry.name, 'node_modules', packageName))
    .filter((candidate) => require('node:fs').existsSync(candidate))

  if (candidates.length === 0) {
    throw new Error(`Unable to locate ${packageName} in ${pnpmDir}`)
  }

  candidates.sort()
  return candidates[0]
}

function transpileTsx(sourcePath, outPath) {
  const source = require('node:fs').readFileSync(sourcePath, 'utf8')
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      sourceMap: false,
    },
    fileName: sourcePath,
  })

  require('node:fs').writeFileSync(outPath, result.outputText, 'utf8')
}

async function main() {
  const repoRoot = getRepoRoot()
  const appRoot = path.join(repoRoot, 'apps', 'cloud-ui')
  const jsdomDir = findPnpmPackageDir(repoRoot, 'jsdom')
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'readio-cloud-ui-test-'))
  const tempSrcDir = path.join(tempRoot, 'src')
  await mkdir(tempSrcDir, { recursive: true })
  await symlink(path.join(appRoot, 'node_modules'), path.join(tempRoot, 'node_modules'), 'dir')

  const setupPath = path.join(tempRoot, 'jsdom-setup.mjs')
  await writeFile(
    setupPath,
    `import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { JSDOM } = require(${JSON.stringify(jsdomDir)})

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
})

const { window } = dom

const setGlobal = (key, value) => {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  })
}

setGlobal('window', window)
setGlobal('document', window.document)
setGlobal('navigator', window.navigator)
setGlobal('location', window.location)
setGlobal('history', window.history)
setGlobal('HTMLElement', window.HTMLElement)
setGlobal('HTMLDivElement', window.HTMLDivElement)
setGlobal('Element', window.Element)
setGlobal('Node', window.Node)
setGlobal('Text', window.Text)
setGlobal('Event', window.Event)
setGlobal('CustomEvent', window.CustomEvent)
setGlobal('MouseEvent', window.MouseEvent)
setGlobal('DOMParser', window.DOMParser)
setGlobal('MutationObserver', window.MutationObserver)
setGlobal('getComputedStyle', window.getComputedStyle.bind(window))
setGlobal('requestAnimationFrame', window.requestAnimationFrame?.bind(window) ?? ((cb) => setTimeout(cb, 0)))
setGlobal('cancelAnimationFrame', window.cancelAnimationFrame?.bind(window) ?? ((id) => clearTimeout(id)))
setGlobal('IS_REACT_ACT_ENVIRONMENT', true)

export {}
`,
    'utf8'
  )

  transpileTsx(path.join(appRoot, 'src', 'App.tsx'), path.join(tempSrcDir, 'App.js'))
  transpileTsx(path.join(appRoot, 'src', 'App.test.tsx'), path.join(tempSrcDir, 'App.test.js'))

  const testResult = spawnSync(
    process.execPath,
    ['--import', pathToFileURL(setupPath).href, '--test', path.join(tempSrcDir, 'App.test.js')],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    }
  )

  try {
    if (testResult.status !== 0) {
      process.exitCode = testResult.status ?? 1
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
