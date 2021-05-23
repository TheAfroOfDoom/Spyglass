import type { Parser } from '@spyglassmc/core'
import { Color, Range } from '@spyglassmc/core'
import { JsonNumberNode } from '@spyglassmc/json'
import { string } from '@spyglassmc/json/lib/checker'
import type { JsonChecker } from '@spyglassmc/json/lib/checker/JsonChecker'
import { localize } from '@spyglassmc/locales'

export function stringColor(): JsonChecker {
	const HexPattern = /^[0-9a-f]{1,6}$/i

	const parser: Parser<Color> = (src, ctx) => {
		let value = 0
		const start = src.cursor
		if (src.trySkip('#')) {
			const remaining = src.readRemaining()
			if (remaining.match(HexPattern)) {
				value = parseInt(remaining, 16)
			} else {
				ctx.err.report(localize('expected', localize('json.checker.string.hex-color')), Range.create(start, src))
			}
		} else {
			const remaining = src.readRemaining()
			if (Color.NamedColors.has(remaining)) {
				value = Color.NamedColors.get(remaining)!
			} else {
				ctx.err.report(localize('expected', Color.ColorNames), Range.create(start, src))
			}
		}
		return Color.fromCompositeInt(value)
	}

	return string('color', parser, undefined, { pool: Color.ColorNames }, 'color')
}

export function intColor(): JsonChecker {
	return (node, ctx) => {
		if (!JsonNumberNode.is(node) || !Number.isInteger(node.value)) {
			ctx.err.report(localize('expected', localize('integer')), node)
		} else {
			node.color = Color.fromCompositeInt(node.value)
		}
	}
}