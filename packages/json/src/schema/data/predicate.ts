import { any, as, boolean, dispatch, float, floatRange, int, listOf, literal, object, opt, pick, record, resource, string } from '../primitives'
import { int_bounds, int_range } from './common'

export const predicate = as('predicate', dispatch('condition', resource('loot_condition_type'),
	(condition) => record(pick(condition, {
		alternative: {
			terms: listOf(predicate),
		},
		block_state_property: {
			block: resource('block'),
			properties: object(
				string,
				() => string,
			), // TODO: block states
		},
		damage_source_properties: {
			predicate: object(), // TODO: damage source predicate
		},
		entity_properties: {
			entity: literal(['this', 'killer', 'killer_player',  'direct_killer']),
			predicate: object(), // TODO: entity predicate
		},
		entity_scores: {
			entity: literal(['this', 'killer', 'killer_player',  'direct_killer']),
			scores: object(
				literal('objective'),
				() => int_bounds
			),
		},
		inverted: {
			term: predicate,
		},
		killed_by_player: {
			inverse: opt(boolean),
		},
		location_check: {
			offsetX: opt(int),
			offsetY: opt(int),
			offsetZ: opt(int),
			predicate: object(), // TODO: location predicate
		},
		match_tool: {
			predicate: object(), // TODO: item predicate
		},
		random_chance: {
			chance: floatRange(0, 1),
		},
		random_chance_with_looting: {
			chance: floatRange(0, 1),
			looting_multiplier: float,
		},
		reference: {
			name: resource('predicate'),
		},
		table_bonus: {
			enchantment: resource('enchantment'),
			chances: listOf(floatRange(0, 1)),
		},
		time_check: {
			value: int_range,
			period: opt(int),
		},
		weather_check: {
			rainding: opt(boolean),
			thundering: opt(boolean),
		},
	}))
))

export const predicate_extended = any([
	predicate,
	listOf(predicate),
])