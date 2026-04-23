#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = path.resolve(process.cwd(), 'src')
const targets = [
  path.join(root, 'hooks', 'useEpisodeResolution.ts'),
  path.join(root, 'lib', 'discovery', 'podcastQueryContract.ts'),
  path.join(root, 'lib', 'discovery', 'libraryRouteSearch.ts'),
  path.join(root, 'routes', '$country', 'podcast'),
  path.join(root, 'routeComponents', 'SearchPage.tsx'),
  path.join(root, 'components', 'GlobalSearch'),
  path.join(root, 'components', 'Explore', 'PodcastEpisodesGrid.tsx'),
  path.join(root, 'components', 'Explore', 'PodcastShowsCarousel.tsx'),
  path.join(root, 'components', 'Explore', 'PodcastShowCard.tsx'),
  path.join(root, 'routeComponents', 'podcast'),
  path.join(root, 'routeComponents', 'HistoryPage.tsx'),
  path.join(root, 'routeComponents', 'FavoritesPage.tsx'),
  path.join(root, 'routeComponents', 'SubscriptionsPage.tsx'),
]

export const ROUTE_GUARD_ALLOWLIST_PATTERNS = [/\.test\./, /__tests__/, /routeTree\.gen\.ts$/]

export const ROUTE_GUARD_FORBIDDEN_PATTERNS = [
  /location\.state\.country/,
  /location\.state\.(?!fromLayoutPrefix\b)[a-zA-Z_$][\w$]*/,
  /location\.state\?\.(?!fromLayoutPrefix\b)[a-zA-Z_$][\w$]*/,
  /useResolvedLibraryCountry/,
  /libraryCountryResolver/,
  /normalizeFeedUrl\(/,
  /new URL\(/,
  /source:\s*['"](history|favorites|subscriptions)['"]/,
  /search:\s*\{[^}]*\b(feedUrl|audioUrl|sessionId)\s*:/s,
  /search:\s*\{[^}]*\bsource\s*:/s,
  /search:\s*\{[^}]*\bfromLayoutPrefix\s*:/s,
  /useSearch\(\{\s*strict:\s*false\s*\}\)\s+as\s+\{\s*fromLayoutPrefix\??\s*:\s*string/s,
  /podcastShowSearchSchema\s*=\s*.*fromLayoutPrefix/s,
]

const ALLOWED_LOCATION_STATE_FIELDS = new Set(['fromLayoutPrefix'])

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walk(full))
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue
    if (ROUTE_GUARD_ALLOWLIST_PATTERNS.some((pattern) => pattern.test(full))) continue
    out.push(full)
  }
  return out
}

export function findRouteGuardViolations() {
  const files = targets.flatMap((target) => {
    if (!fs.existsSync(target)) return []
    const stat = fs.statSync(target)
    return stat.isDirectory() ? walk(target) : [target]
  })

  const violations = []
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    for (const pattern of ROUTE_GUARD_FORBIDDEN_PATTERNS) {
      if (pattern.test(text)) {
        violations.push({ file, pattern: pattern.toString() })
      }
    }
    violations.push(...findAstLocationStateViolations(file, text))
  }

  return violations
}

function unwrapExpression(expression) {
  let current = expression
  while (current) {
    if (ts.isParenthesizedExpression(current)) {
      current = current.expression
      continue
    }
    if (ts.isAsExpression(current) || ts.isTypeAssertionExpression(current)) {
      current = current.expression
      continue
    }
    if (ts.isNonNullExpression(current)) {
      current = current.expression
      continue
    }
    return current
  }
  return expression
}

function getPropertyNameFromAccess(node) {
  if (ts.isPropertyAccessExpression(node) || ts.isPropertyAccessChain(node)) {
    return node.name.text
  }
  if (ts.isElementAccessExpression(node) || ts.isElementAccessChain(node)) {
    const argument = unwrapExpression(node.argumentExpression)
    if (argument && ts.isStringLiteral(argument)) return argument.text
  }
  return null
}

function isLocationStateExpression(node) {
  const expression = unwrapExpression(node)
  if (!expression) return false

  if (ts.isPropertyAccessExpression(expression) || ts.isPropertyAccessChain(expression)) {
    if (expression.name.text !== 'state') return false
    const base = unwrapExpression(expression.expression)
    return !!(base && ts.isIdentifier(base) && base.text === 'location')
  }

  return false
}

function isLocationStateAliasSource(node, isAlias) {
  const expression = unwrapExpression(node)
  if (!expression) return false

  if (isLocationStateExpression(expression)) return true
  if (ts.isIdentifier(expression) && isAlias(expression.text)) return true

  if (
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
  ) {
    const left = unwrapExpression(expression.left)
    const right = unwrapExpression(expression.right)
    return (
      isLocationStateAliasSource(left, isAlias) && !!right && ts.isObjectLiteralExpression(right)
    )
  }

  return false
}

function createAstViolation(file, sourceFile, node, reason) {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  return {
    file,
    pattern: `[AST] ${reason} @${line + 1}`,
  }
}

function findAstLocationStateViolations(file, text) {
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  const violations = []
  const scopeStack = [new Set()]

  const pushScope = () => scopeStack.push(new Set())
  const popScope = () => scopeStack.pop()
  const declareAlias = (name) => {
    scopeStack[scopeStack.length - 1].add(name)
  }
  const isAlias = (name) => {
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      if (scopeStack[i].has(name)) return true
    }
    return false
  }

  const recordBusinessField = (field, node, reasonPrefix) => {
    if (!field || ALLOWED_LOCATION_STATE_FIELDS.has(field)) return
    violations.push(createAstViolation(file, sourceFile, node, `${reasonPrefix}.${field}`))
  }

  const getBindingElementFieldName = (element) => {
    if (element.propertyName) {
      if (ts.isIdentifier(element.propertyName)) return element.propertyName.text
      if (ts.isStringLiteral(element.propertyName)) return element.propertyName.text
      return null
    }
    if (ts.isIdentifier(element.name)) return element.name.text
    return null
  }

  const visitBindingName = (nameNode, reasonPrefix) => {
    if (ts.isIdentifier(nameNode)) return

    if (ts.isObjectBindingPattern(nameNode)) {
      for (const element of nameNode.elements) {
        if (element.dotDotDotToken) {
          violations.push(createAstViolation(file, sourceFile, element, `${reasonPrefix}.rest`))
          continue
        }

        const fieldName = getBindingElementFieldName(element)
        recordBusinessField(fieldName, element, reasonPrefix)

        if (ts.isObjectBindingPattern(element.name) || ts.isArrayBindingPattern(element.name)) {
          const nestedPrefix = fieldName ? `${reasonPrefix}.${fieldName}` : `${reasonPrefix}.nested`
          visitBindingName(element.name, nestedPrefix)
        }
      }
      return
    }

    if (ts.isArrayBindingPattern(nameNode)) {
      for (const element of nameNode.elements) {
        if (ts.isBindingElement(element)) {
          if (element.dotDotDotToken) {
            violations.push(createAstViolation(file, sourceFile, element, `${reasonPrefix}.rest`))
            continue
          }
          if (ts.isObjectBindingPattern(element.name) || ts.isArrayBindingPattern(element.name)) {
            visitBindingName(element.name, `${reasonPrefix}.nested`)
          }
        }
      }
    }
  }

  const visit = (node) => {
    const isScopeNode =
      ts.isSourceFile(node) ||
      ts.isBlock(node) ||
      ts.isModuleBlock(node) ||
      ts.isFunctionLike(node) ||
      ts.isClassLike(node)

    if (!ts.isSourceFile(node) && isScopeNode) pushScope()

    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (isLocationStateAliasSource(node.initializer, isAlias)) {
        if (ts.isIdentifier(node.name)) {
          declareAlias(node.name.text)
        } else if (ts.isObjectBindingPattern(node.name)) {
          visitBindingName(node.name, 'location.state.destructure')
        }
      } else if (
        ts.isIdentifier(unwrapExpression(node.initializer)) &&
        isAlias(unwrapExpression(node.initializer).text)
      ) {
        if (ts.isObjectBindingPattern(node.name)) {
          visitBindingName(node.name, 'location.state.alias_destructure')
        }
      }
    }

    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isPropertyAccessChain(node) ||
      ts.isElementAccessExpression(node) ||
      ts.isElementAccessChain(node)
    ) {
      const fieldName = getPropertyNameFromAccess(node)
      const expression = unwrapExpression(node.expression)
      if (isLocationStateExpression(expression)) {
        recordBusinessField(fieldName, node, 'location.state.direct')
      } else if (expression && ts.isIdentifier(expression) && isAlias(expression.text)) {
        recordBusinessField(fieldName, node, 'location.state.alias')
      }
    }

    ts.forEachChild(node, visit)

    if (!ts.isSourceFile(node) && isScopeNode) popScope()
  }

  visit(sourceFile)
  return violations
}

function run() {
  const violations = findRouteGuardViolations()

  if (violations.length > 0) {
    console.error('[route-guards] Forbidden country-route dependency found:')
    for (const violation of violations) {
      console.error(`- ${path.relative(process.cwd(), violation.file)} -> ${violation.pattern}`)
    }
    process.exit(1)
  }

  console.log('[route-guards] PASS')
}

const currentFilePath = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === currentFilePath) {
  run()
}
