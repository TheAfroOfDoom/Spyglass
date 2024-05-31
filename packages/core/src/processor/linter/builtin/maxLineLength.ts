import { localeQuote, localize } from '@spyglassmc/locales'
import type { AstNode } from '../../../node/index.js'
import { PositionRange } from '../../../source/PositionRange.js'
import type { Range } from '../../../source/Range.js'
import type { Linter } from '../Linter.js'

/**
 * TODO
 */
export function maxLineLength(): Linter<AstNode> {
	return (node, ctx) => {
		const maxLength = ctx.config.lint.maxLineLength as unknown as number
		const posRange = PositionRange.from(node.range, ctx.doc)
		const lines = ctx.doc.getText(posRange).split(/\r?\n/)
		// TODO could maybe just use doc._lineOffsets
		let cumulativeOffset = node.range.start

		const linePosRanges = lines.map((line) => {
			const range: Range = {
				start: cumulativeOffset,
				end: line.length + cumulativeOffset,
			}
			cumulativeOffset = range.end + 1
			const posRange = PositionRange.from(range, ctx.doc)
			return { line, posRange, range }
		})

		console.log(JSON.stringify({ lines, linePosRanges }, undefined, 2))

		for (const { posRange, range } of linePosRanges) {
			if (posRange.start.character > maxLength) {
				ctx.err.lint('Line starts too far ahead', range)
				continue
			}

			if (posRange.end.character > maxLength) {
				ctx.err.lint(
					`Line is longer than max allowed length (${posRange.end.character} > ${maxLength})`,
					range,
				)
			}
		}
	}
}
