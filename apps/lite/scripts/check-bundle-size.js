import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.resolve(__dirname, '../dist')

// Budgets (in KB, gzipped)
const MAIN_JS_BUDGET_GZIP = 250
const TOTAL_ASSETS_BUDGET_GZIP = 1024 // 1MB total

/**
 * Checks if dist directory exists and calculates sizes.
 */
function checkDist() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error('Error: dist/ directory not found. Run build first.')
    process.exit(1)
  }

  const files = getAllFiles(DIST_DIR)
  let totalGzipSize = 0
  let mainJsGzipSize = 0

  console.log('\n--- Bundle Size Report ---')

  files.forEach((file) => {
    const fileName = path.basename(file)
    const ext = path.extname(fileName).toLowerCase()

    // Only count JS/CSS toward budgets (exclude icons/images)
    if (ext !== '.js' && ext !== '.css') return

    const raw = fs.readFileSync(file)
    const gzSize = zlib.gzipSync(raw).length / 1024 // KB

    totalGzipSize += gzSize

    // Main entry check (usually index-XXXX.js)
    if (fileName.startsWith('index-') && fileName.endsWith('.js')) {
      mainJsGzipSize = gzSize
      console.log(`Main JS (${fileName}): ${gzSize.toFixed(2)} KB (gz)`)
    }
  })

  console.log(`Total Assets (JS+CSS): ${totalGzipSize.toFixed(2)} KB (gz)`)
  console.log('--------------------------\n')

  let failed = false
  if (mainJsGzipSize > MAIN_JS_BUDGET_GZIP) {
    console.error(
      `❌ FAILED: Main JS size (${mainJsGzipSize.toFixed(2)} KB) exceeds baseline (~${MAIN_JS_BUDGET_GZIP} KB gz)`
    )
    failed = true
  }

  if (totalGzipSize > TOTAL_ASSETS_BUDGET_GZIP) {
    console.error(
      `❌ FAILED: Total assets size (${totalGzipSize.toFixed(2)} KB) exceeds baseline (~${TOTAL_ASSETS_BUDGET_GZIP} KB gz)`
    )
    failed = true
  }

  if (!failed) {
    console.log('✅ Bundle size within acceptable limits.')
  } else {
    process.exit(1)
  }
}

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath)
  arrayOfFiles = arrayOfFiles || []

  files.forEach((file) => {
    if (fs.statSync(`${dirPath}/${file}`).isDirectory()) {
      arrayOfFiles = getAllFiles(`${dirPath}/${file}`, arrayOfFiles)
    } else {
      arrayOfFiles.push(path.join(dirPath, file))
    }
  })

  return arrayOfFiles
}

checkDist()
