import {
	MalVal,
	MalAtom,
	M_PARAMS,
	M_AST,
	isList,
	isVector,
	isMalNode,
	M_ELMSTRS,
	M_DELIMITERS,
	M_ISSUGAR,
	M_KEYS,
	getType,
	MalMap,
	MalFunc,
	MalNode,
	MalSymbol
} from './types'

export const printer = {
	log: (...args: any) => {
		console.info(...args)
	},
	return: (...args: any) => {
		console.log(...args)
	},
	error: (...args: any) => {
		console.error(...args)
	},
	clear: console.clear
}

export default function printExp(
	exp: MalVal,
	printReadably = true,
	cache = true
): string {
	const _r = printReadably
	const _c = cache

	let ret: string

	if (isMalNode(exp) && M_ELMSTRS in exp) {
		// Print using cache

		const delimiters = exp[M_DELIMITERS]
		const elmStrs = exp[M_ELMSTRS]

		if (Array.isArray(exp)) {
			const count = elmStrs.length
			ret = ''
			for (let i = 0; i < count; i++) {
				ret += delimiters[i]
				if (!elmStrs[i]) {
					elmStrs[i] = printExp(exp[i], _r, _c)
				}
				ret += elmStrs[i]
			}
			ret += delimiters[count]

			if (!exp[M_ISSUGAR]) {
				if (isList(exp)) {
					ret = '(' + ret + ')'
				} else if (isVector(exp)) {
					ret = '[' + ret + ']'
				}
			}
		} else {
			// Map
			const keys = exp[M_KEYS]
			const count = keys.length
			ret = ''

			for (let i = 0; i < count; i++) {
				ret += delimiters[i * 2] + printExp(keys[i]) + delimiters[i * 2 + 1]

				if (!elmStrs[i]) {
					elmStrs[i] = printExp(exp[keys[i]], _r, _c)
				}
				ret += elmStrs[i]
			}
			ret += delimiters[delimiters.length - 1]

			ret = '{' + ret + '}'
		}
	} else {
		// Calculate from zero

		let elmStrs: string[] | null = null
		const _type = getType(exp)

		switch (_type) {
			case 'list':
			case 'vector': {
				elmStrs = (exp as MalVal[]).map(e => printExp(e, _r, _c))

				let delimiters: string[]
				if (M_DELIMITERS in (exp as MalNode)) {
					delimiters = (exp as MalNode)[M_DELIMITERS]
				} else {
					const spaceCount = Math.max(0, elmStrs.length - 1)
					delimiters = ['', ...Array(spaceCount).fill(' '), '']
					;(exp as MalNode)[M_DELIMITERS] = delimiters
				}

				ret = _type === 'list' ? '(' : '['
				for (let i = 0; i < elmStrs.length; i++) {
					ret += delimiters[i] + elmStrs[i]
				}
				ret += delimiters[delimiters.length - 1]
				ret += _type === 'list' ? ')' : ']'
				break
			}
			case 'map': {
				elmStrs = []
				for (const k in exp as MalMap) {
					elmStrs.push(
						printExp(k, _r, _c),
						printExp((exp as MalMap)[k], _r, _c)
					)
				}

				let delimiters: string[]
				if (M_DELIMITERS in (exp as MalNode)) {
					delimiters = (exp as MalNode)[M_DELIMITERS]
				} else {
					const spaceCount = Math.max(0, elmStrs.length - 1)
					delimiters = ['', ...Array(spaceCount).fill(' '), '']
					;(exp as MalNode)[M_DELIMITERS] = delimiters
				}

				ret = '{'
				for (let i = 0; i < elmStrs.length; i++) {
					ret += delimiters[i] + elmStrs[i]
				}
				ret += delimiters[delimiters.length - 1]
				ret += '}'
				break
			}
			case 'number':
				ret = (exp as number).toString()
				break
			case 'string':
				if (_r) {
					ret =
						'"' +
						(exp as string)
							.replace(/\\/g, '\\\\')
							.replace(/"/g, '\\"')
							.replace(/\n/g, '\\n') +
						'"'
				} else {
					ret = exp as string
				}
				break
			case 'boolean':
				ret = (exp as boolean).toString()
				break
			case 'nil':
				ret = 'nil'
				break
			case 'symbol':
				ret = (exp as MalSymbol).value
				break
			case 'keyword':
				ret = ':' + (exp as string).slice(1)
				break
			case 'atom':
				ret = `(atom ${printExp((exp as MalAtom).val, _r, _c)})`
				break
			case 'fn':
			case 'macro': {
				if (M_AST in (exp as MalFunc)) {
					const params = printExp((exp as MalFunc)[M_PARAMS], _r, _c)
					const body = printExp((exp as MalFunc)[M_AST], _r, _c)
					ret = `(${_type} ${params} ${body})`
				} else {
					ret = '<JS Function>'
				}
				break
			}
			case 'undefined':
				ret = '<undefined>'
				break
		}

		if (_c && isMalNode(exp) && elmStrs) {
			if (!exp[M_ELMSTRS]) {
				exp[M_ELMSTRS] = elmStrs
			}
		}
	}

	return ret
}
