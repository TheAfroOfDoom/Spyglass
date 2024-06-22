import { localeQuote, localize } from '@spyglassmc/locales'
import { TextDocument } from 'vscode-languageserver-textdocument'
import type { Quote, StringNode, StringOptions } from '../node/index.js'
import { EscapeChar, EscapeTable } from '../node/index.js'
import type { InfallibleParser } from '../parser/index.js'
import type { ParserContext } from '../service/index.js'
import { IndexMap, Range, Source } from '../source/index.js'
import type { Parser, Result, Returnable } from './Parser.js'
import { Failure } from './Parser.js'

export function string(options: StringOptions): InfallibleParser<StringNode> {
	return (src: Source, ctx: ParserContext): StringNode => {
		let value = ''
		let children
		let quote
		let start = src.innerCursor
		const range = Range.create(src)
		const valueMap = []
		console.log('A', src.visualizeIndexMap())

		if (options.quotes?.length && (src.peek() === '"' || src.peek() === "'")) {
			const currentQuote = src.read() as Quote
			quote = currentQuote
			const contentStart = src.innerCursor
			while (src.canRead() && src.peek() !== currentQuote) {
				const c = src.peek()
				if (options.escapable && c === '\\') {
					const cStart = src.cursor
					src.skip()
					const c2 = src.read()
					if (
						c2 === '\\'
						|| c2 === currentQuote
						|| EscapeChar.is(options.escapable.characters, c2)
					) {
						valueMap.push({
							inner: Range.create(value.length, value.length + 1),
							outer: Range.create(cStart, src),
						})
						value += EscapeTable.get(c2)
					} else if (options.escapable.unicode && c2 === 'u') {
						const hex = src.peek(4)
						if (/^[0-9a-f]{4}$/i.test(hex)) {
							src.skip(4)
							// TODO: `push`s are likely handled incorrectly
							// valueMap.push({
							// 	inner: Range.create(value.length, value.length + 1),
							// 	outer: Range.create(cStart, src),
							// })
							value += String.fromCharCode(parseInt(hex, 16))
						} else {
							ctx.err.report(
								localize('parser.string.illegal-unicode-escape'),
								Range.create(src, src.getCharRange(3).end),
							)
							// TODO: `push`s are likely handled incorrectly
							// valueMap.push({
							// 	inner: Range.create(value.length, value.length + 1),
							// 	outer: Range.create(cStart, src),
							// })
							value += c2
						}
					} else {
						if (!options.escapable.allowUnknown) {
							ctx.err.report(
								localize('parser.string.illegal-escape', localeQuote(c2)),
								src.getCharRange(-1),
							)
						}
						// TODO: `push`s are likely handled incorrectly
						// valueMap.push({
						// 	inner: Range.create(value.length, value.length + 1),
						// 	outer: Range.create(cStart, src),
						// })
						value += c2
					}
				} else {
					src.skip()
					value += c
				}
			}

			if (!src.trySkip(currentQuote)) {
				ctx.err.report(localize('expected', localeQuote(currentQuote)), src)
			}

			if (!options.quotes.includes(currentQuote)) {
				ctx.err.report(localize('parser.string.illegal-quote', options.quotes), range)
			}

			start = contentStart
		} else if (options.unquotable) {
			while (src.canRead() && isAllowedCharacter(src.peek(), options.unquotable)) {
				value += src.read()
			}
			if (!value && !options.unquotable.allowEmpty) {
				ctx.err.report(localize('expected', localize('string')), src)
			}
		} else {
			ctx.err.report(localize('expected', options.quotes!), src)
		}

		valueMap.unshift({ inner: Range.create(0), outer: Range.create(start) })

		const ans: StringNode = {
			type: 'string',
			range: Range.create(src),
			options,
			value,
			valueMap: IndexMap.merge(src.indexMap, valueMap),
			quote,
			children,
		}

		if (options.value?.parser) {
			const valueResult = parseStringValue(options.value.parser, ans.value, ans.valueMap, ctx)
			/* istanbul ignore else */
			if (valueResult !== Failure) {
				children = [valueResult]
			}
		}

		ans.range.end = src.cursor

		console.log('B', (new Source(ans.value, ans.valueMap)).visualizeIndexMap())
		return ans
	}
}

export function parseStringValue<T extends Returnable>(
	parser: Parser<T>,
	value: string,
	map: IndexMap,
	ctx: ParserContext,
): Result<T> {
	const valueSrc = new Source(value, map)
	const valueCtx = {
		...ctx,
		doc: TextDocument.create(ctx.doc.uri, ctx.doc.languageId, ctx.doc.version, value),
	}
	// TODO: Mark trailing string as errors.
	return parser(valueSrc, valueCtx)
}

export const BrigadierUnquotableCharacters = Object.freeze(
	[
		'0',
		'1',
		'2',
		'3',
		'4',
		'5',
		'6',
		'7',
		'8',
		'9',
		'A',
		'B',
		'C',
		'D',
		'E',
		'F',
		'G',
		'H',
		'I',
		'J',
		'K',
		'L',
		'M',
		'N',
		'O',
		'P',
		'Q',
		'R',
		'S',
		'T',
		'U',
		'V',
		'W',
		'X',
		'Y',
		'Z',
		'a',
		'b',
		'c',
		'd',
		'e',
		'f',
		'g',
		'h',
		'i',
		'j',
		'k',
		'l',
		'm',
		'n',
		'o',
		'p',
		'q',
		'r',
		's',
		't',
		'u',
		'v',
		'w',
		'x',
		'y',
		'z',
		'_',
		'.',
		'+',
		'-',
	] as const,
)
export const BrigadierUnquotableCharacterSet = new Set(BrigadierUnquotableCharacters)
export const BrigadierUnquotablePattern = /^[0-9A-Za-z_\.\+\-]*$/
export const BrigadierUnquotableOption = {
	allowEmpty: true,
	allowList: BrigadierUnquotableCharacterSet,
}

export const BrigadierStringOptions: StringOptions = {
	escapable: {},
	quotes: ['"', "'"],
	unquotable: BrigadierUnquotableOption,
}

export const brigadierString = string(BrigadierStringOptions)

export function isAllowedCharacter(
	c: string,
	options: Exclude<StringOptions['unquotable'], false | undefined>,
): boolean {
	return options.allowList?.has(c) ?? !options.blockList?.has(c)
}
