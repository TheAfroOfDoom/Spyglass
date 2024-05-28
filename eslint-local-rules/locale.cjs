const locales = require('../packages/locales/src/locales/en.json')

module.exports = {
	meta: {
		type: "suggestion",
		docs: {
				description: "TODO",
		},
		schema: []
	},
	create(context) {
		return {
			CallExpression: function(node) {
				const { callee } = node
				if(callee.type === 'Identifier' && callee.name === 'localize') {
					const localeKeyNode = node.arguments[0]
					const localeKey = localeKeyNode.value
					if(!(localeKey in locales)) {
						context.report({
							node: localeKeyNode,
							message: `No corresponding english localization for key: '${localeKey}'`
						})
					}
				}
			}
		}
	}
}
