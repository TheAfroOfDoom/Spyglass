// This file is generated by `_generate.ts`. Do not modify by hand.
import { showWhitespaceGlyph, testParser } from '@spyglassmc/core/test-out/utils'
import { describe, it } from 'mocha'
import snapshot from 'snap-shot-it'
import { tupleType } from '@spyglassmc/mcdoc/lib/parser'
import { McdocParserTestSuites } from '../../_suites'

describe('mcdoc tupleType', () => {
	for (const content of McdocParserTestSuites['syntax/type'].tupleType.content) {
		it(`Parse "${showWhitespaceGlyph(content)}"`, () => {
			snapshot(testParser(tupleType, content))
		})
	}
})