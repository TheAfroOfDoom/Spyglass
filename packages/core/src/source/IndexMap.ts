import type { TextDocument } from 'vscode-languageserver-textdocument'
import { Location } from './Location'
import { Range } from './Range'

export interface IndexMap {
	outerRange: Range,
	innerRange: Range,
	pairs: { outer: Range, inner: Range }[]
}

export namespace IndexMap {
	export function create(partial: Partial<IndexMap> = {}): IndexMap {
		return {
			outerRange: partial.outerRange ?? Range.Beginning,
			innerRange: partial.innerRange ?? Range.Beginning,
			pairs: partial.pairs ?? [],
		}
	}

	export function toInnerOffset(map: IndexMap, outer: number): number
	export function toInnerOffset(map: IndexMap, outer: number, endInclusive = false): number {
		const { innerRange, outerRange, pairs } = map
		if (!(endInclusive ? Range.containsInclusive : Range.contains)(outerRange, outer)) {
			throw new Error(`Offset ${outer} is not in range ${Range.toString(outerRange)}`)
		}

		let ans = outer
		ans += innerRange.start - outerRange.start

		for (const pair of pairs) {
			if (Range.contains(pair.outer, outer)) {
				return pair.inner.end - 1
			} else if (Range.endsBefore(pair.outer, outer)) {
				ans += Range.length(pair.inner) - Range.length(pair.outer)
			}
		}

		return ans
	}

	export function toInnerRange(map: IndexMap, outer: Range): Range {
		return Range.create(
			toInnerOffset(map, outer.start),
			(toInnerOffset as any)(map, outer.end, true)
		)
	}

	export function toOuterOffset(map: IndexMap, inner: number): number
	export function toOuterOffset(map: IndexMap, inner: number, endInclusive = false): number {
		const { innerRange, outerRange, pairs } = map
		if (!(endInclusive ? Range.containsInclusive : Range.contains)(innerRange, inner)) {
			throw new Error(`Offset ${inner} is not in range ${Range.toString(innerRange)}`)
		}

		let ans = inner
		ans += outerRange.start - innerRange.start

		for (const pair of pairs) {
			if (Range.contains(pair.inner, inner)) {
				return pair.outer.end - 1
			} else if (Range.endsBefore(pair.inner, inner)) {
				ans += Range.length(pair.outer) - Range.length(pair.inner)
			}
		}

		return ans
	}

	export function toOuterRange(map: IndexMap, inner: Range): Range {
		return Range.create(
			toOuterOffset(map, inner.start),
			(toOuterOffset as any)(map, inner.end, true)
		)
	}

	export function toOuterLocation(map: IndexMap, inner: Location, doc: TextDocument): Location {
		return Location.create(
			doc,
			toOuterRange(map, inner.range)
		)
	}
}
