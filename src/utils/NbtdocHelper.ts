import { CompletionItem, DiagnosticSeverity, CompletionItemKind } from 'vscode-languageserver'
import { ClientCache, combineCache, remapCachePosition } from '../types/ClientCache'
import { nbtdoc } from '../types/nbtdoc'
import LineParser from '../parsers/LineParser'
import ParsingContext from '../types/ParsingContext'
import ParsingError, { ActionCode, remapParsingErrors } from '../types/ParsingError'
import StringReader from './StringReader'
import NbtNode, { SuperNbt, NbtNodeTypeName, NbtNodeType, isNbtNodeTypeStrictlyMatched, isNbtNodeTypeLooselyMatched } from '../types/nodes/nbt/NbtNode'
import NbtCompoundNode from '../types/nodes/map/NbtCompoundNode'
import NbtPrimitiveNode from '../types/nodes/nbt/NbtPrimitiveNode'
import TextRange, { remapTextRange } from '../types/TextRange'
import NbtStringNode from '../types/nodes/nbt/NbtStringNode'
import IdentityNode from '../types/nodes/IdentityNode'
import { getDiagnosticSeverity } from '../types/StylisticConfig'
import { locale } from '../locales/Locales'
import { arrayToMessage, arrayToCompletions, validateStringQuote, quoteString, downgradeError } from './utils'
import { NodeRange, NodeDescription } from '../types/nodes/ArgumentNode'
import NbtArrayNode from '../types/nodes/nbt/NbtArrayNode'
import NbtCollectionNode from '../types/nodes/nbt/NbtCollectionNode'
import NbtNumberNode from '../types/nodes/nbt/NbtNumberNode'
import NbtByteArrayNode from '../types/nodes/nbt/NbtByteArrayNode'
import NbtIntArrayNode from '../types/nodes/nbt/NbtIntArrayNode'
import NbtLongArrayNode from '../types/nodes/nbt/NbtLongArrayNode'
import NbtByteNode from '../types/nodes/nbt/NbtByteNode'
import NbtShortNode from '../types/nodes/nbt/NbtShortNode'
import NbtLongNode from '../types/nodes/nbt/NbtLongNode'
import NbtDoubleNode from '../types/nodes/nbt/NbtDoubleNode'
import NbtFloatNode from '../types/nodes/nbt/NbtFloatNode'
import NbtIntNode from '../types/nodes/nbt/NbtIntNode'
import NbtListNode from '../types/nodes/nbt/NbtListNode'
import { Keys } from '../types/nodes/map/MapNode'
import { ToFormattedString } from '../types/Formattable'
import { LintConfig } from '../types/Config'
import { combineArgumentParserResult, ArgumentParserResult } from '../types/Parser'
import { getInnerIndex } from '../types/IndexMapping'

type CompoundSupers = { Compound: nbtdoc.Index<nbtdoc.CompoundTag> }
type RegistrySupers = { Registry: { target: string, path: nbtdoc.FieldPath[] } }
type Supers = CompoundSupers | RegistrySupers | null

interface ValidateResultLike {
    completions?: CompletionItem[], errors?: ParsingError[], cache?: ClientCache
}
interface ValidateResult extends ValidateResultLike {
    completions: CompletionItem[], errors: ParsingError[], cache: ClientCache
}

function isRegistrySupers(supers: Supers): supers is RegistrySupers {
    return (supers as RegistrySupers).Registry !== undefined
}

type BooleanDoc = 'Boolean'
function isBooleanDoc(doc: nbtdoc.NbtValue): doc is BooleanDoc {
    return doc === 'Boolean'
}

type ByteDoc = { Byte: nbtdoc.NumberTag }
function isByteDoc(doc: nbtdoc.NbtValue): doc is ByteDoc {
    return (doc as any).Byte !== undefined
}

type ShortDoc = { Short: nbtdoc.NumberTag }
function isShortDoc(doc: nbtdoc.NbtValue): doc is ShortDoc {
    return (doc as any).Short !== undefined
}

type IntDoc = { Int: nbtdoc.NumberTag }
function isIntDoc(doc: nbtdoc.NbtValue): doc is IntDoc {
    return (doc as any).Int !== undefined
}

type LongDoc = { Long: nbtdoc.NumberTag }
function isLongDoc(doc: nbtdoc.NbtValue): doc is LongDoc {
    return (doc as any).Long !== undefined
}

type FloatDoc = { Float: nbtdoc.NumberTag }
function isFloatDoc(doc: nbtdoc.NbtValue): doc is FloatDoc {
    return (doc as any).Float !== undefined
}

type DoubleDoc = { Double: nbtdoc.NumberTag }
function isDoubleDoc(doc: nbtdoc.NbtValue): doc is DoubleDoc {
    return (doc as any).Double !== undefined
}

type StringDoc = 'String'
function isStringDoc(doc: nbtdoc.NbtValue): doc is StringDoc {
    return doc === 'String'
}

type ByteArrayDoc = { ByteArray: nbtdoc.NumberArrayTag }
function isByteArrayDoc(doc: nbtdoc.NbtValue): doc is ByteArrayDoc {
    return (doc as any).ByteArray !== undefined
}

type IntArrayDoc = { IntArray: nbtdoc.NumberArrayTag }
function isIntArrayDoc(doc: nbtdoc.NbtValue): doc is IntArrayDoc {
    return (doc as any).IntArray !== undefined
}

type LongArrayDoc = { LongArray: nbtdoc.NumberArrayTag }
function isLongArrayDoc(doc: nbtdoc.NbtValue): doc is LongArrayDoc {
    return (doc as any).LongArray !== undefined
}

type CompoundDoc = { Compound: nbtdoc.Index<nbtdoc.CompoundTag> }
function isCompoundDoc(doc: nbtdoc.NbtValue): doc is CompoundDoc {
    return (doc as any).Compound !== undefined
}

type EnumDoc = { Enum: nbtdoc.Index<nbtdoc.EnumItem> }
function isEnumDoc(doc: nbtdoc.NbtValue): doc is EnumDoc {
    return (doc as any).Enum !== undefined
}

type ListDoc = { List: { length_range: [number, number] | null, value_type: nbtdoc.NbtValue } }
function isListDoc(doc: nbtdoc.NbtValue): doc is ListDoc {
    return (doc as any).List !== undefined
}

type IndexDoc = { Index: { target: string, path: nbtdoc.FieldPath[] } }
function isIndexDoc(doc: nbtdoc.NbtValue): doc is IndexDoc {
    return (doc as any).Index !== undefined
}

type IdDoc = { Id: string }
function isIdDoc(doc: nbtdoc.NbtValue): doc is IdDoc {
    return (doc as any).Id !== undefined
}

type OrDoc = { Or: nbtdoc.NbtValue[] }
function isOrDoc(doc: nbtdoc.NbtValue): doc is OrDoc {
    return (doc as any).Or !== undefined
}

export default class NbtdocHelper {
    // private static readonly MockEnumIndex: nbtdoc.Index<nbtdoc.EnumItem> = 114514

    private compoundIndex: nbtdoc.Index<nbtdoc.CompoundTag> | null
    private enumIndex: nbtdoc.Index<nbtdoc.EnumItem>
    private moduleIndex: nbtdoc.Index<nbtdoc.Module>
    private tag: NbtCompoundNode | null

    // private mockEnum: nbtdoc.EnumItem

    constructor(private readonly doc: nbtdoc.Root) { }

    clone() {
        return new NbtdocHelper(this.doc)
            .goCompound(this.compoundIndex)
            .goEnum(this.enumIndex)
            .goModule(this.moduleIndex)
            .withTag(this.tag)
    }

    goCompound(index: nbtdoc.Index<nbtdoc.CompoundTag> | null) {
        this.compoundIndex = index
        return this
    }

    goEnum(index: nbtdoc.Index<nbtdoc.EnumItem>) {
        this.enumIndex = index
        return this
    }

    goModule(index: nbtdoc.Index<nbtdoc.Module>) {
        this.moduleIndex = index
        return this
    }

    withTag(tag: NbtCompoundNode | null) {
        this.tag = tag
        return this
    }

    readCompound(): nbtdoc.CompoundTag | null {
        if (this.compoundIndex === null) {
            return null
        }
        return this.doc.compound_arena[this.compoundIndex]
    }

    readEnum(): nbtdoc.EnumItem {
        // if (this.enumIndex === NbtdocHelper.MockEnumIndex) {
        //     return this.mockEnum
        // }
        return this.doc.enum_arena[this.enumIndex]
    }

    readModule(): nbtdoc.Module {
        return this.doc.module_arena[this.moduleIndex]
    }

    goRegistryCompound(type: string, id: string | null) {
        const registry = this.doc.registries[type]
        if (registry) {
            const [reg, fallback] = registry
            if (id && reg[id] !== undefined) {
                this.compoundIndex = reg[id]
            } else {
                this.compoundIndex = fallback
            }
        } else {
            this.compoundIndex = null
        }
        return this
    }

    goSupers(supers: Supers) {
        if (supers === null) {
            this.goCompound(null)
        } else if (isRegistrySupers(supers)) {
            const id = this.resolveFieldPath(supers.Registry.path)
            this.goRegistryCompound(
                supers.Registry.target,
                id ? IdentityNode.fromString(id.valueOf().toString()).toString() : null
            )
        } else {
            this.goCompound(supers.Compound)
        }
        return this
    }

    resolveFieldPath(paths: nbtdoc.FieldPath[]): NbtStringNode | null {
        let tag: NbtNode | null = this.tag
        while (paths.length > 0 && tag && tag instanceof NbtCompoundNode) {
            const path = paths.shift()!
            if (path === 'Super') {
                tag = tag[SuperNbt]
            } else {
                const key = path.Child
                tag = tag[key]
            }
            if (paths.length === 0) {
                if (tag && tag instanceof NbtStringNode) {
                    this.tag = tag[SuperNbt]
                    return tag
                } else {
                    return null
                }
            }
        }
        return null
    }

    readCompoundKeys(): string[] {
        const doc = this.readCompound()
        if (doc) {
            return [
                ...Object
                    .keys(doc.fields),
                ...this
                    .clone()
                    .goSupers(doc.supers)
                    .readCompoundKeys()
            ]
        }
        return []
    }

    readField(key: string): nbtdoc.Field | null {
        const doc = this.readCompound()
        if (doc) {
            const field: nbtdoc.Field | undefined = doc.fields[key]
            if (field) {
                return field
            } else {
                return this
                    .clone()
                    .goSupers(doc.supers)
                    .readField(key)
            }
        }
        return null
    }

    completeField(ans: ValidateResult = { cache: {}, completions: [], errors: [] }, ctx: ParsingContext, tag: NbtNode, doc: nbtdoc.NbtValue | null, isPredicate: boolean, description: string) {
        if (doc) {
            if (isBooleanDoc(doc)) {
                this.completeBooleanField(ans, ctx, tag, doc, isPredicate)
            } else if (isEnumDoc(doc)) {
                this.completeEnumField(ans, ctx, tag, doc, isPredicate)
            } else if (isIdDoc(doc)) {
                this.completeIdField(ans, ctx, tag, doc, isPredicate)
            } else if (isStringDoc(doc)) {
                this.completeStringField(ans, ctx, tag, doc, isPredicate, description)
            }
        }
    }

    private completeBooleanField(ans: ValidateResult, _ctx: ParsingContext, _tag: NbtNode, _doc: BooleanDoc, isPredicate: boolean) {
        ans.completions.push(...arrayToCompletions(['false', 'true']))
    }
    public completeCompoundFieldKeys(ans: ValidateResult, ctx: ParsingContext, tag: NbtCompoundNode, doc: CompoundDoc, _isPredicate: boolean) {
        const existingKeys = Object.keys(tag)
        const clonedHelper = this.clone()
        const pool = clonedHelper
            .goCompound(doc.Compound)
            .readCompoundKeys()
            .filter(v => !existingKeys.includes(v))
        for (const key of pool) {
            const field = clonedHelper.readField(key)
            const description = field ? field.description : ''
            const quoteType = ctx.config.lint.nbtCompoundKeyQuoteType ? ctx.config.lint.nbtCompoundKeyQuoteType[1] : 'prefer double'
            const quote = ctx.config.lint.nbtCompoundKeyQuote ? ctx.config.lint.nbtCompoundKeyQuote[1] : false
            ans.completions.push({
                label: quoteString(key, quoteType, quote),
                kind: CompletionItemKind.Property,
                ...description ? { documentation: description } : {}
            } as CompletionItem)
        }

        ans.completions.push(...arrayToCompletions(['false', 'true']))
    }
    private completeEnumField(ans: ValidateResult, ctx: ParsingContext, _tag: NbtNode, doc: EnumDoc, isPredicate: boolean) {
        const { et } = this
            .goEnum(doc.Enum)
            .readEnum()
        const type: 'Byte' | 'Short' | 'Int' | 'Long' | 'Float' | 'Double' | 'String' = NbtdocHelper.getValueType(et) as any
        const options: { [key: string]: nbtdoc.EnumOption<number | string> } = (et as any)[type]
        for (const key in options) {
            if (options.hasOwnProperty(key)) {
                const { description, value } = options[key]
                ans.completions.push({
                    label: NbtdocHelper.getFormattedString(ctx.config.lint, type, value),
                    detail: key,
                    ...description ? { documentation: description } : {}
                })
            }
        }
    }
    private completeIdField(ans: ValidateResult, ctx: ParsingContext, _tag: NbtNode, doc: IdDoc, isPredicate: boolean) {
        const subCtx = { ...ctx, cursor: 0 }
        const reader = new StringReader('')
        const result = ctx.parsers.get('Identity', [
            NbtdocHelper.getIdentityTypeFromRegistry(doc.Id), false, isPredicate
        ]).parse(reader, subCtx)
        for (const com of result.completions) {
            ans.completions.push({
                label: NbtdocHelper.getFormattedString(ctx.config.lint, 'String', com.label)
            })
        }
    }
    private completeStringField(ans: ValidateResult, ctx: ParsingContext, _tag: NbtNode, _doc: StringDoc, _isPredicate: boolean, description: string) {
        const subCtx = { ...ctx, cursor: 0 }
        const reader = new StringReader('')
        const result = this.validateInnerString(reader, subCtx, description)
        if (result && result.completions) {
            for (const com of result.completions) {
                ans.completions.push({
                    label: NbtdocHelper.getFormattedString(ctx.config.lint, 'String', com.label),
                    ...com.insertText ? { insertText: NbtdocHelper.getFormattedString(ctx.config.lint, 'String', com.insertText) } : {}
                })
            }
        }
    }

    validateField(ans: ValidateResult = { cache: {}, completions: [], errors: [] }, ctx: ParsingContext, tag: NbtNode, doc: nbtdoc.NbtValue | null, isPredicate: boolean, description: string): ValidateResult {
        if (doc) {
            if (isBooleanDoc(doc)) {
                ans = this.validateBooleanField(ctx, tag, doc, isPredicate)
            } else if (isByteArrayDoc(doc)) {
                ans = this.validateByteArrayField(ctx, tag, doc, isPredicate)
            } else if (isByteDoc(doc)) {
                ans = this.validateByteField(ctx, tag, doc, isPredicate)
            } else if (isCompoundDoc(doc)) {
                ans = this.validateCompoundField(ctx, tag, doc, isPredicate)
            } else if (isDoubleDoc(doc)) {
                ans = this.validateDoubleField(ctx, tag, doc, isPredicate)
            } else if (isEnumDoc(doc)) {
                ans = this.validateEnumField(ctx, tag, doc, isPredicate)
            } else if (isFloatDoc(doc)) {
                ans = this.validateFloatField(ctx, tag, doc, isPredicate)
            } else if (isIdDoc(doc)) {
                ans = this.validateIdField(ctx, tag, doc, isPredicate)
            } else if (isIndexDoc(doc)) {
                ans = this.validateIndexField(ctx, tag, doc, isPredicate)
            } else if (isIntArrayDoc(doc)) {
                ans = this.validateIntArrayField(ctx, tag, doc, isPredicate, description)
            } else if (isIntDoc(doc)) {
                ans = this.validateIntField(ctx, tag, doc, isPredicate, description)
            } else if (isListDoc(doc)) {
                ans = this.validateListField(ctx, tag, doc, isPredicate, description)
            } else if (isLongArrayDoc(doc)) {
                ans = this.validateLongArrayField(ctx, tag, doc, isPredicate)
            } else if (isLongDoc(doc)) {
                ans = this.validateLongField(ctx, tag, doc, isPredicate)
            } else if (isOrDoc(doc)) {
                ans = this.validateOrField(ctx, tag, doc, isPredicate, description)
            } else if (isShortDoc(doc)) {
                ans = this.validateShortField(ctx, tag, doc, isPredicate)
            } else {
                ans = this.validateStringField(ctx, tag, doc, isPredicate, description)
            }
        }
        return ans
    }

    /**
     * @returns If it matches loosely; whether or not should be furthermore validated.
     */
    private validateNbtNodeType(ans: ValidateResult, ctx: ParsingContext, tag: NbtNode, expected: NbtNodeTypeName, isPredicate: boolean) {
        const config = ctx.config.lint.nbtTypeCheck
        const actual = tag[NbtNodeType]
        const isLooselyMatched = isNbtNodeTypeLooselyMatched(actual, expected)
        if (config) {
            const [severity, value] = config
            if (
                !isLooselyMatched ||
                ((isPredicate || value === 'stirctly') && !isNbtNodeTypeStrictlyMatched(actual, expected))
            ) {
                let errorCode: ActionCode | undefined = undefined
                if (expected === 'Byte') errorCode = ActionCode.NbtTypeToByte
                else if (expected === 'Short') errorCode = ActionCode.NbtTypeToShort
                else if (expected === 'Int') errorCode = ActionCode.NbtTypeToInt
                else if (expected === 'Long') errorCode = ActionCode.NbtTypeToLong
                else if (expected === 'Float') errorCode = ActionCode.NbtTypeToFloat
                else if (expected === 'Double') errorCode = ActionCode.NbtTypeToDouble
                ans.errors.push(new ParsingError(
                    tag[NodeRange],
                    locale('expected-got', locale(`nbt-tag.${expected}`), locale(`nbt-tag.${actual}`)),
                    true, getDiagnosticSeverity(severity), errorCode
                ))
            }
        }
        return isLooselyMatched
    }

    private validateCollectionLength(ans: ValidateResult, _ctx: ParsingContext, tag: NbtCollectionNode<any>, [min, max]: [number, number], _isPredicate: boolean) {
        if (tag.length < min) {
            ans.errors.push(new ParsingError(
                tag[NodeRange],
                locale('expected', locale('collection-length.>=', min)),
                true, DiagnosticSeverity.Warning
            ))
        } else if (tag.length > max) {
            ans.errors.push(new ParsingError(
                tag[NodeRange],
                locale('expected', locale('collection-length.<=', max)),
                true, DiagnosticSeverity.Warning
            ))
        }
    }

    private validateNumberArrayField(ans: ValidateResult, ctx: ParsingContext, tag: NbtArrayNode<NbtNumberNode<number | bigint>>, { length_range: lengthRange, value_range: valueRange }: nbtdoc.NumberArrayTag, isPredicate: boolean, description: string) {
        if (lengthRange) {
            this.validateCollectionLength(ans, ctx, tag, lengthRange, isPredicate)
        }
        if (valueRange) {
            for (const item of tag) {
                this.validateNumberField(ans, ctx, item, valueRange, isPredicate, description)
            }
        }
    }

    private validateNumberField(ans: ValidateResult, _ctx: ParsingContext, tag: NbtNumberNode<number | bigint>, [min, max]: [number, number], _isPredicate: boolean, description: string) {
        // Cache.
        /// Color information.
        if (description.match(/RED << 16 \| GREEN << 8 \| BLUE/i)) {
            const num = Number(tag.valueOf())
            const r = ((num >> 16) & 255) / 255
            const g = ((num >> 8) & 255) / 255
            const b = (num & 255) / 255
            ans.cache.colors = {
                [`${r} ${g} ${b} 1`]: { def: [], ref: [tag[NodeRange]] }
            }
        }
        // Errors.
        if (tag.valueOf() < min) {
            ans.errors.push(new ParsingError(
                tag[NodeRange],
                locale('expected-got', locale('number.>=', min), tag.valueOf()),
                true, DiagnosticSeverity.Warning
            ))
        } else if (tag.valueOf() > max) {
            ans.errors.push(new ParsingError(
                tag[NodeRange],
                locale('expected-got', locale('number.<=', max), tag.valueOf()),
                true, DiagnosticSeverity.Warning
            ))
        }
    }

    private isInheritFromItemBase(doc: nbtdoc.CompoundTag | null): boolean {
        if (!doc) {
            return false
        }
        if (doc.fields.hasOwnProperty('CustomModelData')) {
            return true
        }
        return this.isInheritFromItemBase(this.clone().goSupers(doc.supers).readCompound())
    }

    private validateCompoundDoc(ans: ValidateResult, ctx: ParsingContext, tag: NbtCompoundNode, doc: nbtdoc.CompoundTag | null, isPredicate: boolean) {
        if (doc) {
            for (const key in tag) {
                if (tag.hasOwnProperty(key)) {
                    const childTag = tag[key]
                    const field = this.readField(key)
                    if (field) {
                        // Hover information.
                        tag[Keys][key][NodeDescription] = `(${NbtdocHelper.getValueType(field.nbttype)}) ${field.description}`
                        this.validateField(ans, ctx, childTag, field.nbttype, isPredicate, field.description)
                    } else {
                        // Errors.
                        if (!this.isInheritFromItemBase(doc)) {
                            ans.errors.push(new ParsingError(
                                tag[NodeRange],
                                locale('unknown-key', locale('punc.quote', key)),
                                true, DiagnosticSeverity.Warning
                            ))
                        }
                    }
                }
            }
        }
    }

    private static getFormattedString(lint: LintConfig, type: 'Byte' | 'Short' | 'Int' | 'Long' | 'Float' | 'Double' | 'String', value: string | number) {
        let tag: NbtPrimitiveNode<string | number | bigint>
        switch (type) {
            case 'Byte':
                tag = new NbtByteNode(null, value as number, value.toString())
                break
            case 'Short':
                tag = new NbtShortNode(null, value as number, value.toString())
                break
            case 'Int':
                tag = new NbtIntNode(null, value as number, value.toString())
                break
            case 'Long':
                tag = new NbtLongNode(null, BigInt(value as number), value.toString())
                break
            case 'Float':
                tag = new NbtFloatNode(null, value as number, value.toString())
                break
            case 'Double':
                tag = new NbtDoubleNode(null, value as number, value.toString())
                break
            case 'String':
            default:
                tag = new NbtStringNode(null, value as string, value.toString())
                break
        }
        return tag[ToFormattedString](lint)
    }

    private static getValueType(value: nbtdoc.NbtValue | nbtdoc.EnumType) {
        if (typeof value === 'string') {
            return value
        } else {
            return Object.keys(value)[0]
        }
    }

    private validateBooleanField(ctx: ParsingContext, tag: NbtNode, _doc: BooleanDoc, isPredicate: boolean): ValidateResult {
        const ans: ValidateResult = { cache: {}, completions: [], errors: [] }
        const shouldValidate = this.validateNbtNodeType(ans, ctx, tag, 'Byte', isPredicate)
        const config = ctx.config.lint.nbtBoolean
        // Errors.
        if (shouldValidate) {
            if (config) {
                const actualString = tag.toString()
                const isBooleanLiteral = /^true|false$/i.test(actualString)
                const [severity, expectedLiteral] = config
                if (isBooleanLiteral !== expectedLiteral) {
                    ans.errors.push(new ParsingError(
                        tag[NodeRange],
                        locale('expected-got', arrayToMessage(['false', 'true'], true, 'or'), locale('punc.quote', actualString)),
                        true, getDiagnosticSeverity(severity), expectedLiteral ? ActionCode.NbtByteToLiteral : ActionCode.NbtByteToNumber
                    ))
                }
            }
        }
        return ans
    }
    private validateByteArrayField(ctx: ParsingContext, tag: NbtNode, doc: ByteArrayDoc, isPredicate: boolean): ValidateResult {
        const ans: ValidateResult = { cache: {}, completions: [], errors: [] }
        const shouldValidate = this.validateNbtNodeType(ans, ctx, tag, 'ByteArray', isPredicate)
        if (shouldValidate) {
            this.validateNumberArrayField(ans, ctx, tag as NbtByteArrayNode, doc.ByteArray, isPredicate, '')
        }
        return ans
    }
    private validateByteField(ctx: ParsingContext, tag: NbtNode, doc: ByteDoc, isPredicate: boolean): ValidateResult {
        const ans: ValidateResult = { cache: {}, completions: [], errors: [] }
        const shouldValidate = this.validateNbtNodeType(ans, ctx, tag, 'Byte', isPredicate)
        if (shouldValidate && doc.Byte.range) {
            this.validateNumberField(ans, ctx, tag as NbtByteNode, doc.Byte.range, isPredicate, '')
        }
        return ans
    }
    private validateCompoundField(ctx: ParsingContext, tag: NbtNode, doc: CompoundDoc, isPredicate: boolean): ValidateResult {
        const ans: ValidateResult = { cache: {}, completions: [], errors: [] }
        const shouldValidate = this.validateNbtNodeType(ans, ctx, tag, 'Compound', isPredicate)
        if (shouldValidate) {
            const compoundTag: NbtCompoundNode = tag as any
            const clonedHelpler = this.clone()
            const compoundDoc = clonedHelpler
                .goCompound(doc.Compound)
                .readCompound()
            clonedHelpler
                .withTag(compoundTag)
                .validateCompoundDoc(ans, ctx, compoundTag, compoundDoc, isPredicate)
        }
        return ans
    }
    private validateDoubleField(ctx: ParsingContext, tag: NbtNode, doc: DoubleDoc, isPredicate: boolean): ValidateResult {
        const ans: ValidateResult = { cache: {}, completions: [], errors: [] }
        const shouldValidate = this.validateNbtNodeType(ans, ctx, tag, 'Double', isPredicate)
        if (shouldValidate && doc.Double.range) {
            this.validateNumberField(ans, ctx, tag as NbtDoubleNode, doc.Double.range, isPredicate, '')
        }
        return ans
    }
    private validateEnumField(ctx: ParsingContext, tag: NbtNode, doc: EnumDoc, isPredicate: boolean): ValidateResult {
        const ans: ValidateResult = { cache: {}, completions: [], errors: [] }
        const { description, et } = this
            .goEnum(doc.Enum)
            .readEnum()
        const type: 'Byte' | 'Short' | 'Int' | 'Long' | 'Float' | 'Double' | 'String' = NbtdocHelper.getValueType(et) as any
        tag[NodeDescription] = `(${type}) ${description}`
        const shouldValidate = this.validateNbtNodeType(ans, ctx, tag, type, isPredicate)
        if (shouldValidate) {
            const options: { [key: string]: nbtdoc.EnumOption<number | string> } = (et as any)[type]
            const optionValues: string[] = []
            for (const key in options) {
                if (options.hasOwnProperty(key)) {
                    const { description, value } = options[key]
                    optionValues.push(value.toString())
                    // Hover information.
                    if (tag.valueOf() == value) {
                        const hoverText = description ? `${key} - ${description}` : key
                        tag[NodeDescription] += `\n\n${hoverText}`
                    }
                }
            }
            // Errors.
            if (!optionValues.includes(tag.valueOf().toString())) {
                ans.errors.push(new ParsingError(
                    tag[NodeRange],
                    locale('expected-got',
                        arrayToMessage(optionValues, true, 'or'),
                        locale('punc.quote', tag.valueOf().toString())
                    ), true, DiagnosticSeverity.Warning
                ))
            }
        }
        return ans
    }
    private validateFloatField(ctx: ParsingContext, tag: NbtNode, doc: FloatDoc, isPredicate: boolean): ValidateResult {
        const ans: ValidateResult = { cache: {}, completions: [], errors: [] }
        const shouldValidate = this.validateNbtNodeType(ans, ctx, tag, 'Float', isPredicate)
        if (shouldValidate && doc.Float.range) {
            this.validateNumberField(ans, ctx, tag as NbtFloatNode, doc.Float.range, isPredicate, '')
        }
        return ans
    }
    // https://github.com/SPGoding/datapack-language-server/issues/332#issuecomment-590168655
    private static getIdentityTypeFromRegistry(registry: string) {
        switch (registry) {
            case 'minecraft:block':
            case 'minecraft:enchantment':
            case 'minecraft:item':
            case 'minecraft:motive':
            case 'minecraft:potion':
            case 'minecraft:villager_profession':
            case 'minecraft:villager_type':
                return registry
            case 'minecraft:block_entity':
                return 'minecraft:block_entity_type'
            case 'minecraft:entity':
                return 'minecraft:entity_type'
            case 'minecraft:loot_table':
                return '$lootTables'
            case 'minecraft:recipe':
                return '$recipes'
            case 'minecraft:structure':
                return 'minecraft:structure_feature'
            default:
                throw new Error(`Unknown nbtdoc ID registry: ${registry}`)
        }
    }
    private validateIdField(ctx: ParsingContext, tag: NbtNode, doc: IdDoc, isPredicate: boolean): ValidateResult {
        const ans: ValidateResult = { cache: {}, completions: [], errors: [] }
        const shouldValidate = this.validateNbtNodeType(ans, ctx, tag, 'String', isPredicate)
        if (shouldValidate) {
            const stringTag = tag as NbtStringNode
            const subCtx = { ...ctx, cursor: getInnerIndex(stringTag.mapping, ctx.cursor) }
            const reader = new StringReader(stringTag.valueOf())
            const result = ctx.parsers.get('Identity', [
                NbtdocHelper.getIdentityTypeFromRegistry(doc.Id), false, isPredicate
            ]).parse(reader, subCtx)
            this.combineResult(ans, result, stringTag)
        }
        return ans
    }
    private validateIndexField(ctx: ParsingContext, tag: NbtNode, doc: IndexDoc, isPredicate: boolean): ValidateResult {
        const ans: ValidateResult = { cache: {}, completions: [], errors: [] }
        const shouldValidate = this.validateNbtNodeType(ans, ctx, tag, 'Compound', isPredicate)
        if (shouldValidate) {
            const compoundTag = tag as NbtCompoundNode
            const clonedHelper = this.clone()
            const idTag = clonedHelper.resolveFieldPath(doc.Index.path)
            const id = idTag ? IdentityNode.fromString(idTag.valueOf()).toString() : null
            let compoundDoc: nbtdoc.CompoundTag | null = null
            if (doc.Index.target.startsWith('custom:')) {
                if (id) {
                    // TODO: support custom Index targets.
                    // switch (doc.Index.target) {
                    //     case 'custom:blockitemstates':

                    //         break
                    //     case 'custom:blockstates':
                    //         const blockDef = ctx.blocks[id]
                    //         const properties = blockDef ? blockDef.properties : undefined
                    //         if (properties) {
                    //             compoundDoc = { description: '', fields: {}, supers: null }
                    //             for (const key in properties) {
                    //                 if (properties.hasOwnProperty(key)) {
                    //                     const property = properties[key]
                    //                     compoundDoc.fields[key] = {
                    //                         description: '',
                    //                         nbttype: {
                    //                             Enum: NbtdocHelper.MockEnumIndex
                    //                         }
                    //                     }
                    //                 }
                    //             }
                    //         }
                    //         break
                    //     case 'custom:spawnitemtag':
                    //     case 'custom:spawnitementag':

                    //         break
                    //     default:
                    //         console.error(`Unknown nbtdoc target registry ${doc.Index.target}`)
                    //         break
                    // }
                }
            } else {
                compoundDoc = clonedHelper
                    .goRegistryCompound(doc.Index.target, id)
                    .readCompound()
            }
            if (compoundDoc) {
                this.validateCompoundDoc(ans, ctx, compoundTag, compoundDoc, isPredicate)
            }
        }
        return ans
    }
    private validateIntArrayField(ctx: ParsingContext, tag: NbtNode, doc: IntArrayDoc, isPredicate: boolean, description: string): ValidateResult {
        const ans: ValidateResult = { cache: {}, completions: [], errors: [] }
        const shouldValidate = this.validateNbtNodeType(ans, ctx, tag, 'IntArray', isPredicate)
        if (shouldValidate) {
            this.validateNumberArrayField(ans, ctx, tag as NbtIntArrayNode, doc.IntArray, isPredicate, description)
        }
        return ans
    }
    private validateIntField(ctx: ParsingContext, tag: NbtNode, doc: IntDoc, isPredicate: boolean, description: string): ValidateResult {
        const ans: ValidateResult = { cache: {}, completions: [], errors: [] }
        const shouldValidate = this.validateNbtNodeType(ans, ctx, tag, 'Int', isPredicate)
        if (shouldValidate && doc.Int.range) {
            this.validateNumberField(ans, ctx, tag as NbtIntNode, doc.Int.range, isPredicate, description)
        }
        return ans
    }
    private validateListField(ctx: ParsingContext, tag: NbtNode, doc: ListDoc, isPredicate: boolean, description: string): ValidateResult {
        const ans: ValidateResult = { cache: {}, completions: [], errors: [] }
        const shouldValidate = this.validateNbtNodeType(ans, ctx, tag, 'List', isPredicate)
        if (shouldValidate) {
            const { length_range: lengthRange, value_type: valueType } = doc.List
            if (lengthRange) {
                this.validateCollectionLength(ans, ctx, tag as NbtListNode<NbtNode>, lengthRange, isPredicate)
            }
            for (const item of tag as NbtListNode<NbtNode>) {
                this.validateField(ans, ctx, item, valueType, isPredicate, description)
            }
        }
        return ans
    }
    private validateLongArrayField(ctx: ParsingContext, tag: NbtNode, doc: LongArrayDoc, isPredicate: boolean): ValidateResult {
        const ans: ValidateResult = { cache: {}, completions: [], errors: [] }
        const shouldValidate = this.validateNbtNodeType(ans, ctx, tag, 'LongArray', isPredicate)
        if (shouldValidate) {
            this.validateNumberArrayField(ans, ctx, tag as NbtLongArrayNode, doc.LongArray, isPredicate, '')
        }
        return ans
    }
    private validateLongField(ctx: ParsingContext, tag: NbtNode, doc: LongDoc, isPredicate: boolean): ValidateResult {
        const ans: ValidateResult = { cache: {}, completions: [], errors: [] }
        const shouldValidate = this.validateNbtNodeType(ans, ctx, tag, 'Long', isPredicate)
        if (shouldValidate && doc.Long.range) {
            this.validateNumberField(ans, ctx, tag as NbtLongNode, doc.Long.range, isPredicate, '')
        }
        return ans
    }
    private validateOrField(ctx: ParsingContext, tag: NbtNode, doc: OrDoc, isPredicate: boolean, description: string): ValidateResult {
        let ans: ValidateResult = { cache: {}, completions: [], errors: [] }
        for (let i = 0; i < doc.Or.length; i++) {
            const childDoc = doc.Or[i]
            const childAns: ValidateResult = { cache: {}, completions: [], errors: [] }
            this.validateField(childAns, ctx, tag, childDoc, isPredicate, description)
            if (i === doc.Or.length - 1 || childAns.errors.length === 0) {
                ans = childAns
                break
            }
        }
        if (doc.Or.length === 0) {
            ans.errors.push(new ParsingError(tag[NodeRange], locale('unexpected-nbt'), true, DiagnosticSeverity.Warning))
        }
        return ans
    }
    private validateShortField(ctx: ParsingContext, tag: NbtNode, doc: ShortDoc, isPredicate: boolean): ValidateResult {
        const ans: ValidateResult = { cache: {}, completions: [], errors: [] }
        const shouldValidate = this.validateNbtNodeType(ans, ctx, tag, 'Short', isPredicate)
        if (shouldValidate && doc.Short.range) {
            this.validateNumberField(ans, ctx, tag as NbtShortNode, doc.Short.range, isPredicate, '')
        }
        return ans
    }
    private validateStringField(ctx: ParsingContext, tag: NbtNode, doc: StringDoc, isPredicate: boolean, description: string): ValidateResult {
        const ans: ValidateResult = { cache: {}, completions: [], errors: [] }
        const shouldValidate = this.validateNbtNodeType(ans, ctx, tag, 'String', isPredicate)
        if (shouldValidate) {
            // Errors.
            /// Special cases: https://github.com/SPGoding/datapack-language-server/issues/332#issuecomment-590167678.
            const stringTag = tag as NbtStringNode
            const subCtx = { ...ctx, cursor: getInnerIndex(stringTag.mapping, ctx.cursor) }
            const reader = new StringReader(stringTag.valueOf())
            const result = this.validateInnerString(reader, subCtx, description)
            this.combineResult(ans, result, stringTag)
            /// Quotes.
            const strTag = tag as NbtStringNode
            ans.errors = validateStringQuote(strTag.toString(), strTag.valueOf(), tag[NodeRange], ctx.config.lint.nbtStringQuote, ctx.config.lint.nbtStringQuoteType)
        }
        return ans
    }

    private validateInnerString(reader: StringReader, ctx: ParsingContext, description: string) {
        let result: ValidateResultLike | undefined = undefined
        if (description.match(/command stored/i)) {
            result = new LineParser(null, 'commands').parse(reader, ctx).data
        } else if (description.match(/particle the area effect cloud/i)) {
            result = ctx.parsers.get('Particle').parse(reader, ctx)
        } else if (description.match(/tags on the entity/i)) {
            result = ctx.parsers.get('Tag').parse(reader, ctx)
        } else if (description.match(/team to join/i)) {
            result = ctx.parsers.get('Team').parse(reader, ctx)
        } else if (description.match(/line of text/i) ||
            description.match(/name of th(?:e|is) (?:banner|brewing stand|command block|container|enchanting table|furance)/i) ||
            description.match(/JSON text component/i) ||
            description.match(/lore of an item/i)) {
            result = ctx.parsers.get('TextComponent').parse(reader, ctx)
        }
        return result
    }

    private combineResult(ans: ValidateResult, result: { cache?: ClientCache | undefined, errors?: ParsingError[] | undefined, completions?: CompletionItem[] } | undefined, tag: NbtStringNode) {
        if (result) {
            if (result.cache) {
                remapCachePosition(result.cache, tag.mapping)
                combineCache(ans.cache, result.cache)
            }
            if (result.errors) {
                const downgradedErrors = downgradeError(result.errors)
                remapParsingErrors(downgradedErrors, tag.mapping)
                ans.errors.push(...downgradedErrors)
            }
            if (result.completions) {
                ans.completions.push(...result.completions)
            }
        }
    }
}