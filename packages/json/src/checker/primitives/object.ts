import { ErrorSeverity, Range } from '@spyglassmc/core'
import { arrayToMessage, localize } from '@spyglassmc/locales'
import type { JsonAstNode, JsonObjectExpectation, JsonPropertyAstNode } from '../../node'
import { JsonObjectAstNode, JsonStringExpectation } from '../../node'
import type { JsonChecker, JsonCheckerContext } from '../JsonChecker'
import { expectation } from './util'

type ComplexProperty = {
	checker: JsonChecker,
	opt?: boolean,
	deprecated?: boolean,
	context?: string,
}

type CheckerProperty = JsonChecker | ComplexProperty

type CheckerRecord = Record<string, CheckerProperty>

function isComplex(checker: CheckerProperty): checker is ComplexProperty {
	return (checker as ComplexProperty)?.checker !== undefined
}

export function object(): JsonChecker
export function object(keys: string[], values: (key: string) => CheckerProperty): JsonChecker
export function object(keys: JsonChecker, values: (key: string) => CheckerProperty): JsonChecker
export function object(keys?: string[] | JsonChecker, values?: (key: string) => CheckerProperty): JsonChecker {
	return async (node: JsonAstNode, ctx: JsonCheckerContext) => {
		node.expectation = [{ type: 'json:object', typedoc: 'Object' }]
		if (!ctx.depth || ctx.depth <= 0) {
			if (Array.isArray(keys) && values) {
				(node.expectation[0] as JsonObjectExpectation).fields = keys.map(key => {
					const prop = values(key)
					return {
						key,
						value: expectation(isComplex(prop) ? prop.checker : prop, ctx),
						...isComplex(prop) && (prop.opt || prop.deprecated) ? { opt: true } : {},
						...isComplex(prop) && prop.deprecated ? { deprecated: true } : {},
					}
				})
			} else if (typeof keys === 'function' && values) {
				(node.expectation[0] as JsonObjectExpectation).keys = expectation(keys, ctx)
					?.filter(JsonStringExpectation.is)
			}
		}

		if (!JsonObjectAstNode.is(node)) {
			ctx.err.report(localize('expected', [localize('object')]), node)
		} else if (Array.isArray(keys) && values) {
			const givenKeys = node.properties.map(n => n.key.value)
			keys.forEach(k => {
				const value = values(k)
				if (isComplex(value) && (value.opt || value.deprecated)) {
					return
				}
				if (!givenKeys.includes(k)) {
					ctx.err.report(localize('json.checker.property.missing', [localize('punc.quote', [k])]), Range.create(node.range.start, node.range.start + 1))
				}})
			node.properties.forEach(prop => {
				const key = prop.key.value
				if (!keys.includes(key)) {
					ctx.err.report(localize('json.checker.property.unknown', [localize('punc.quote', [key])]), prop.key, ErrorSeverity.Warning)
				} else {
					const value = values(key)
					if (isComplex(value) && value.deprecated) {
						ctx.err.report(localize('json.checker.property.deprecated', [localize('punc.quote', [key])]), prop.key, ErrorSeverity.Hint, { deprecated: true })
					}
					const context = `${ctx.context}.${isComplex(value) && value.context ? `${value.context}.` : ''}${key}`
					const doc = localize(`json.doc.${context}`)
					const propNode: JsonAstNode = prop.value !== undefined ? prop.value : { type: 'json:null', range: Range.create(0) }
					;(isComplex(value) ? value.checker : value)(propNode, {...ctx, context })
					prop.key.hover = `\`\`\`typescript\n${context}: ${propNode.expectation?.map(e => e.typedoc).join(' | ')}\n\`\`\`${doc ? `\n******\n${doc}` : ''}`
				}
			})
		} else if (typeof keys === 'function' && values) {
			node.properties.forEach(prop => {
				keys(prop.key, ctx)
				if (prop.value !== undefined) {
					const value = values(prop.key.value);
					(isComplex(value) ? value.checker : value)(prop.value, ctx)
				}
			})
		}
	}
}

export function record(properties: CheckerRecord): JsonChecker {
	return object(
		Object.keys(properties),
		(key) => properties[key]
	)
}

export function opt(checker: JsonChecker): ComplexProperty {
	return { checker: checker, opt: true }
}

export function deprecated(checker: JsonChecker): ComplexProperty {
	return { checker: checker, deprecated: true }
}

export function dispatch(keyName: string, values: (value: string | undefined, properties: JsonPropertyAstNode[]) => JsonChecker): JsonChecker {
	return async (node: JsonAstNode, ctx: JsonCheckerContext) => {
		if (!JsonObjectAstNode.is(node)) {
			ctx.err.report(localize('expected', [localize('object')]), node)
		} else {
			const dispatcherIndex = node.properties.findIndex(p => p.key.value === keyName)
			const dispatcher = node.properties[dispatcherIndex]
			const value = dispatcher?.value?.type === 'json:string' ? dispatcher.value.value : undefined
			values(value, node.properties)(node, ctx)
		}
	}
}

export function pick(value: string | undefined, cases: Record<string, CheckerRecord>): CheckerRecord {
	if (value === undefined) {
		return {}
	}
	const properties = cases[value.replace(/^minecraft:/, '')]
	if (properties === undefined) {
		return {}
	}
	Object.keys(properties).forEach(key => {
		const p = properties[key]
		properties[key] = {
			checker: isComplex(p) ? p.checker : p,
			opt: isComplex(p) ? p.opt : undefined,
			deprecated: isComplex(p) ? p.deprecated : undefined,
			context: value.replace(/^minecraft:/, ''),
		}
	})
	return properties
}

export function when(value: string | undefined, values: string[], properties: CheckerRecord, notProperties: CheckerRecord = {}): CheckerRecord {
	if (value === undefined) {
		return {}
	}
	if (!values.includes(value.replace(/^minecraft:/, ''))) {
		return notProperties
	}
	return properties
}

export function extract(value: string, properties: JsonPropertyAstNode[]) {
	const node = properties.find(p => p.key.value === value)
	return node?.value?.type === 'json:string' ? node.value.value : undefined
}

export function having(node: JsonAstNode, ctx: JsonCheckerContext, cases: Record<string, CheckerRecord | (() => CheckerRecord)>): CheckerRecord {
	const givenKeys = new Set(JsonObjectAstNode.is(node)
		? node.properties.map(n => n.key.value) : [])
	const key = Object.keys(cases).find(c => givenKeys.has(c))

	if (key === undefined) {
		ctx.err.report(localize('json.checker.property.missing', [arrayToMessage(Object.keys(cases), true, 'or')]), Range.create(node.range.start, node.range.start + 1))
		return Object.fromEntries(Object.entries(cases)
			.map(([k, v]) => [k, typeof v === 'function' ? v()[k] : v[k]])
		)
	}
	const c = cases[key]
	return typeof c === 'function' ? c() : c
}