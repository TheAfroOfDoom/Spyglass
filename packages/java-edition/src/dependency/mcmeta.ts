import * as core from '@spyglassmc/core'
import type { PackMcmeta, ReleaseVersion, VersionInfo } from './common'
import { PackVersionMap } from './common'

/**
 * @param inputVersion {@link Config.env.gameVersion}
 */
export function resolveConfiguredVersion(inputVersion: string, { packMcmeta, versions }: {
	packMcmeta: PackMcmeta | undefined,
	versions: McmetaVersions,
}): VersionInfo {
	function toVersionInfo(index: number): VersionInfo {
		if (index < 0) {
			index = 0
		}
		const version = versions[index]
		return {
			id: version.id,
			name: version.name,
			release: version.release_target as ReleaseVersion,
			isLatest: index === 0,
		}
	}

	if (versions.length === 0) {
		throw new Error('mcmeta version list is empty')
	}

	inputVersion = inputVersion.toLowerCase()
	versions = versions.sort((a, b) => b.data_version - a.data_version)
	if (inputVersion === 'auto') {
		if (packMcmeta) {
			const regex = PackVersionMap[packMcmeta.pack.pack_format]
			if (regex) {
				return toVersionInfo(versions.findIndex(v => regex.test(v.release_target)))
			}
		}
		return toVersionInfo(0)
	} else if (inputVersion === 'latest release') {
		return toVersionInfo(versions.findIndex(v => v.type === 'release'))
	} else if (inputVersion === 'latest snapshot') {
		return toVersionInfo(versions.findIndex(v => v.type === 'snapshot'))
	}
	return toVersionInfo(versions.findIndex(v => inputVersion === v.id.toLowerCase() || inputVersion === v.name.toLowerCase()))
}

export function getMcmetaSummaryUris(version: string, isLatest: boolean, source: string): { blocks: core.RemoteUriString, commands: core.RemoteUriString, registries: core.RemoteUriString } {
	const tag = isLatest ? 'summary' : `${version}-summary`

	function getUri(path: string): core.RemoteUriString {
		return source.toLowerCase() === 'jsdelivr'
			? `https://cdn.jsdelivr.net/gh/misode/mcmeta@${tag}/${path}`
			: `https://raw.githubusercontent.com/misode/mcmeta/${tag}/${path}`
	}

	return {
		blocks: getUri('blocks/data.json.gz'),
		commands: getUri('commands/data.json.gz'),
		registries: getUri('registries/data.json.gz'),
	}
}

export function symbolRegistrar(summary: McmetaSummary): core.SymbolRegistrar {
	const McmetaSummaryUri = 'mcmeta://summary/registries.json'

	/**
	 * Add states of blocks or fluids to the symbol table.
	 */
	function addStatesSymbols(category: 'block' | 'fluid', states: McmetaStates, symbols: core.SymbolUtil): void {
		const capitalizedCategory = `${category[0].toUpperCase()}${category.slice(1)}` as Capitalize<typeof category>

		for (const [id, [properties, defaults]] of Object.entries(states)) {
			const uri = McmetaSummaryUri
			symbols
				.query(uri, category, core.ResourceLocation.lengthen(id))
				.onEach(Object.entries(properties), ([state, values], blockQuery) => {
					const defaultValue = defaults[state]!

					blockQuery.member(`${uri}#${capitalizedCategory}_states`, state, stateQuery => {
						stateQuery
							.enter({
								data: { subcategory: 'state' },
								usage: { type: 'declaration' },
							})
							.onEach(values, value => {
								stateQuery.member(value, valueQuery => {
									valueQuery.enter({
										data: { subcategory: 'state_value' },
										usage: { type: 'declaration' },
									})
									if (value === defaultValue) {
										stateQuery.amend({
											data: {
												relations: {
													default: { category, path: valueQuery.path },
												},
											},
										})
									}
								})
							})
					})
				})
		}
	}

	function addRegistriesSymbols(registries: McmetaRegistries, symbols: core.SymbolUtil) {
		type Category = core.FileCategory | core.RegistryCategory
		function isCategory(str: string): str is Category {
			return (core.FileCategories.includes(str as any) || core.RegistryCategories.includes(str as any))
		}

		for (const [registryId, registry] of Object.entries(registries)) {
			if (isCategory(registryId)) {
				for (const entryId of registry) {
					symbols
						.query(McmetaSummaryUri, registryId, core.ResourceLocation.lengthen(entryId))
						.enter({ usage: { type: 'declaration' } })
				}
			}
		}
	}

	return symbols => {
		addRegistriesSymbols(summary.registries, symbols)
		addStatesSymbols('block', summary.blocks, symbols)
		addStatesSymbols('fluid', summary.fluids, symbols)
	}
}

export const Fluids: McmetaStates = {
	flowing_lava: [{ falling: ['false', 'true'], level: ['1', '2', '3', '4', '5', '6', '7', '8'] }, { falling: 'false', level: '1' }],
	flowing_water: [{ falling: ['false', 'true'], level: ['1', '2', '3', '4', '5', '6', '7', '8'] }, { falling: 'false', level: '1' }],
	lava: [{ falling: ['false', 'true'] }, { falling: 'false' }],
	water: [{ falling: ['false', 'true'] }, { falling: 'false' }],
}

//#region Types
export interface McmetaVersion {
	id: string,
	name: string,
	release_target: string,
	type: 'release' | 'snapshot',
	stable: boolean,
	data_version: number,
	protocol_version: number,
	data_pack_version: number,
	resource_pack_version: number,
	build_time: string,
	release_time: string,
	sha1: string
}
export type McmetaVersions = McmetaVersion[]

export interface McmetaSummary {
	blocks: McmetaStates,
	commands: McmetaCommands,
	fluids: McmetaStates,
	registries: McmetaRegistries,
}

export interface McmetaStates {
	[id: string]: [
		{
			[name: string]: string[],
		},
		{
			[name: string]: string,
		},
	]
}

export type McmetaCommands = RootTreeNode

interface BaseTreeNode {
	type: string,
	children?: {
		[name: string]: CommandTreeNode,
	},
	executable?: boolean,
	redirect?: [string],
}

export interface ArgumentTreeNode extends BaseTreeNode {
	type: 'argument',
	parser: string,
	properties?: {
		[name: string]: any,
	},
}

export interface LiteralTreeNode extends BaseTreeNode {
	type: 'literal',
}

export interface RootTreeNode extends BaseTreeNode {
	type: 'root',
	children: {
		[command: string]: LiteralTreeNode,
	},
}

export type CommandTreeNode =
	| ArgumentTreeNode
	| LiteralTreeNode
	| RootTreeNode

export interface McmetaRegistries {
	[id: string]: string[]
}
//#endregion
