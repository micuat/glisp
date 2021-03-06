/* eslint-ignore @typescript-eslint/no-use-before-define */

import {
	MalVal,
	MalFunc,
	createMalFunc,
	isMalFunc,
	cloneExp,
	isKeyword,
	LispError,
	symbolFor as S,
	isSymbol,
	M_ISMACRO,
	M_EVAL,
	M_FN,
	isMap,
	MalMap,
	isList,
	isVector,
	markMalVector as V,
	MalNode,
	isMalNode,
	MalNodeSeq,
	M_EXPANDED,
	M_OUTER,
	M_OUTER_INDEX,
	M_ELMSTRS,
	M_KEYS,
	M_EVAL_PARAMS,
	keywordFor as K,
	M_PARAMS,
	markMalVector,
	MalSymbol,
	MalBind,
	isSeq
} from './types'
import Env from './env'
import {saveOuter} from './reader'
import {mat2d} from 'gl-matrix'
import {printExp} from '.'

const S_DEF = S('def')
const S_LET = S('let')
const S_BINDING = S('binding')
const S_IF = S('if')
const S_DO = S('do')
const S_FN = S('fn')
const S_ARTBOARD = S('artboard')
const S_STYLE = S('style')
const S_TRANSFORM = S('transform')
const S_GET_ALL_SYMBOLS = S('get-all-symbols')
const S_FN_PARAMS = S('fn-params')
const S_FN_SUGAR = S('fn-sugar')
const S_MACRO = S('macro')
const S_MACROEXPAND = S('macroexpand')
const S_QUOTE = S('quote')
const S_UNQUOTE = S('unquote')
const S_QUASIQUOTE = S('quasiquote')
const S_SPLICE_UNQUOTE = S('splice-unquote')
const S_TRY = S('try')
const S_CATCH = S('catch')
const S_CONCAT = S('concat')
const S_ENV_CHAIN = S('env-chain')
const S_EVAL_IN_ENV = S('eval-in-env')
const S_VEC = S('vec')
const S_VAR = S('var')

// eval

function quasiquote(exp: MalVal): MalVal {
	if (isMap(exp)) {
		const ret: {[k: string]: MalVal} = {}
		for (const [k, v] of Object.entries(exp)) {
			ret[k] = quasiquote(v)
		}
		return ret
	}

	if (!isPair(exp)) {
		return [S_QUOTE, exp]
	}

	if (exp[0] === S_UNQUOTE) {
		return exp[1]
	}

	let ret = [
		S_CONCAT,
		...exp.map(e => {
			if (isPair(e) && e[0] === S_SPLICE_UNQUOTE) {
				return e[1]
			} else {
				return V([quasiquote(e)])
			}
		})
	]
	ret = isVector(exp) ? [S_VEC, ret] : ret
	return ret

	function isPair(x: MalVal): x is MalVal[] {
		return isSeq(x) && x.length > 0
	}
}

function macroexpand(exp: MalVal, env: Env, cache: boolean) {
	while (isList(exp) && isSymbol(exp[0]) && env.find(exp[0])) {
		const fn = env.get(exp[0])
		if (!isMalFunc(fn) || !fn[M_ISMACRO]) {
			break
		}
		;(exp as MalNodeSeq)[M_FN] = fn

		const params = exp.slice(1)
		if (cache) {
			;(exp as MalNodeSeq)[M_EVAL_PARAMS] = params
		}
		exp = fn(...params)
	}
	return exp
}

function evalAtom(exp: MalVal, env: Env, cache: boolean) {
	if (isSymbol(exp)) {
		if (cache) {
			const def = env.getDef(exp)
			if (def) {
				exp.def = def
			}
		}
		return env.get(exp)
	} else if (Array.isArray(exp)) {
		const ret = exp.map(x => {
			// eslint-disable-next-line @typescript-eslint/no-use-before-define
			const ret = evalExp(x, env, cache)
			if (cache && isMalNode(x)) {
				x[M_EVAL] = ret
			}
			return ret
		})
		if (cache) {
			;(exp as MalNode)[M_EVAL] = ret
		}
		return isVector(exp) ? V(ret) : ret
	} else if (isMap(exp)) {
		const hm: MalMap = {}
		for (const k in exp) {
			// eslint-disable-next-line @typescript-eslint/no-use-before-define
			const ret = evalExp(exp[k], env, cache)
			if (cache && isMalNode(exp[k])) {
				;(exp[k] as MalNode)[M_EVAL] = ret
			}
			hm[k] = ret
		}
		if (cache) {
			;(exp as MalNode)[M_EVAL] = hm
		}
		return hm
	} else {
		return exp
	}
}

export default function evalExp(exp: MalVal, env: Env, cache = false): MalVal {
	// eslint-disable-next-line no-constant-condition
	let counter = 0
	while (counter++ < 1e6) {
		if (!isList(exp)) {
			return evalAtom(exp, env, cache)
		}

		// Expand macro
		const expandedExp = macroexpand(exp, env, cache)
		if (cache && exp !== expandedExp) {
			;(exp as MalNodeSeq)[M_EXPANDED] = expandedExp
		}
		exp = expandedExp

		if (!isList(exp)) {
			return evalAtom(exp, env, cache)
		}

		if (exp.length === 0) {
			return exp
		}

		// Apply list
		const [first, a1, a2] = exp

		switch (first) {
			case S_DEF: {
				const [, sym, _value] = exp
				if (!isSymbol(sym) || _value === undefined) {
					throw new LispError('Invalid form of def')
				}
				const value = env.set(sym, evalExp(_value, env, cache))
				if (cache) {
					;(exp as MalNodeSeq)[M_FN] = env.get(S_DEF) as MalFunc
				}
				return value
			}
			case S('defvar'): {
				const [, sym, _value] = exp
				if (!isSymbol(sym) || _value === undefined) {
					throw new LispError('Invalid form of def!')
				}
				const value = evalExp(_value, env, cache)
				env.set(sym, value, exp as MalNodeSeq)
				return value
			}
			case S_LET: {
				const letEnv = new Env(env)
				const [, binds] = exp
				if (!isSeq(binds)) {
					throw new LispError('Invalid bind-expr in let')
				}
				for (let i = 0; i < binds.length; i += 2) {
					letEnv.bindAll(
						binds[i] as any,
						evalExp(binds[i + 1], letEnv, cache) as MalVal[]
					)
				}
				env = letEnv
				const ret = exp.length === 3 ? a2 : [S_DO, ...exp.slice(2)]
				if (cache) {
					;(exp as MalNode)[M_EVAL] = ret
					;(exp as MalNodeSeq)[M_FN] = env.get(S_LET) as MalFunc
				}
				exp = ret
				break // continue TCO loop
			}
			case S_BINDING: {
				const bindingEnv = new Env()
				const [, binds] = exp
				if (!isSeq(binds)) {
					throw new LispError('Invalid bind-expr in binding')
				}
				for (let i = 0; i < binds.length; i += 2) {
					bindingEnv.bindAll(
						binds[i] as any,
						evalExp(binds[i + 1], env, cache) as MalVal[]
					)
				}
				env.pushBinding(bindingEnv)
				const body = exp.length === 3 ? exp[2] : [S_DO, ...exp.slice(2)]
				let ret
				try {
					ret = evalExp(body, env, cache)
				} finally {
					env.popBinding()
				}
				if (cache) {
					;(exp as MalNode)[M_EVAL] = ret
				}
				return ret
			}
			case S_TRANSFORM: {
				const matrix = evalExp(exp[1], env, cache)
				const xs = exp.slice(2)

				const bindingEnv = new Env()
				bindingEnv.set(
					S('*transform*'),
					mat2d.mul(
						mat2d.create(),
						env.get(S('*transform*')) as mat2d,
						matrix as mat2d
					) as MalVal[]
				)

				env.pushBinding(bindingEnv)
				let ret
				try {
					ret = V([
						K('transform'),
						matrix,
						...xs.map(x => evalExp(x, env, cache))
					])
				} finally {
					env.popBinding()
				}
				if (cache) {
					;(exp as MalNode)[M_EVAL] = ret
				}
				return ret
			}
			case S_STYLE: {
				const [, _styles, ...body] = exp
				const styles = evalExp(_styles, env, cache) as MalMap | MalMap[]
				const mergedStyle = Array.isArray(styles)
					? styles.reduce((ret, s) => {
							return {...ret, ...s}
					  }, {})
					: styles

				const bindingEnv = new Env()

				for (const [prop, value] of Object.entries(mergedStyle)) {
					const name = S(`*${prop.slice(1)}*`)
					bindingEnv.set(name, value)
				}

				env.pushBinding(bindingEnv)
				let ret
				try {
					ret = V([
						K('style'),
						styles,
						...body.map(x => evalExp(x, env, cache))
					])
				} finally {
					env.popBinding()
				}
				if (cache) {
					;(exp as MalNode)[M_EVAL] = ret
				}
				return ret
			}
			case S_ARTBOARD: {
				const [, _option, ..._body] = exp
				const option = evalExp(_option, env, cache) as MalMap
				const bounds = option[K('bounds')]
				const background = option[K('background')]

				if (!Array.isArray(bounds) || bounds.length < 4) {
					throw new LispError('Invalid bounds')
				}

				const [x, y, width, height] = bounds as number[]

				const bindingEnv = new Env()
				bindingEnv.set(S('*size*'), V([width, height]))
				bindingEnv.set(S('*width*'), width)
				bindingEnv.set(S('*height*'), height)
				bindingEnv.set(S('*inside-artboard*'), true)

				if (background) {
					bindingEnv.set(S('*background*'), background)
				}

				env.pushBinding(bindingEnv)

				const body = evalExp(V(_body), env, cache) as MalVal[]

				let ret
				try {
					ret = evalExp(
						V([
							K('artboard'),
							V([...bounds]),
							[
								S('transform'),
								V([1, 0, 0, 1, x, y]),
								...(background ? [V([K('background'), background, true])] : []),
								...body,
								[
									S('guide/stroke'),
									[S('rect'), V([0.5, 0.5]), V([width - 1, height - 1])]
								]
							]
						]),
						env,
						cache
					)
				} finally {
					env.popBinding()
				}

				if (cache) {
					;(exp as MalNode)[M_EVAL] = ret
					;(exp as MalNodeSeq)[M_FN] = env.get(S('artboard')) as MalFunc
					;(exp as MalNodeSeq)[M_EVAL_PARAMS] = [option, ...body]
				}
				return ret
			}
			case S_GET_ALL_SYMBOLS: {
				const ret = V(env.getAllSymbols())
				if (cache) {
					;(exp as MalNode)[M_EVAL] = ret
				}
				return ret
			}
			case S_VAR: {
				const [, sym] = exp
				if (!isSymbol(sym)) {
					throw new LispError('Invalid var')
				}
				const ret = env.get(sym)
				if (cache) {
					;(exp as MalNode)[M_EVAL] = ret
				}
				return ret
			}
			case S_FN_PARAMS: {
				const fn = evalExp(exp[1], env, true)
				const ret = isMalFunc(fn) ? markMalVector([...fn[M_PARAMS]]) : null
				if (cache) {
					;(exp as MalNode)[M_EVAL] = ret
				}
				return ret
			}
			case S_EVAL_IN_ENV: {
				// Don't know why this should be nested
				const expanded = evalExp(exp[1], env, true)
				const ret = evalExp(expanded, env, true)

				// ;(exp as MalNode)[M_EVAL] = a2
				// ;(expanded as MalNode)[M_EVAL] = ret
				return ret
			}
			case S_QUOTE:
				// No need to cache M_EVAL
				// if (cache) {
				// 	;(exp as MalNode)[M_EVAL] = a1
				// }
				return a1
			case S_QUASIQUOTE: {
				const ret = quasiquote(exp[1])
				// No need to cache M_EVAL
				// if (cache) {
				// 	;(exp as MalNode)[M_EVAL] = ret
				// }
				exp = ret
				break // continue TCO loop
			}
			case S_FN: {
				const [, params, body] = exp
				if (!Array.isArray(params)) {
					throw new LispError('First argument of fn should be list')
				}
				if (body === undefined) {
					throw new LispError('Second argument of fn should be specified')
				}
				return createMalFunc(
					(...args) =>
						evalExp(body, new Env(env, params as any[], args), cache),
					body,
					env,
					params as MalBind
				)
			}
			case S_FN_SUGAR:
				return createMalFunc(
					(...args) => evalExp(a1, new Env(env, [], args), cache),
					a1,
					env,
					[]
				)
			case S_MACRO: {
				const [, params, body] = exp
				const fnexp = [S_FN, params, body]
				const fn = cloneExp(evalExp(fnexp, env, cache)) as MalFunc
				fn[M_ISMACRO] = true
				return fn
			}
			case S_MACROEXPAND: {
				const ret = macroexpand(a1, env, cache)
				if (cache) {
					;(exp as MalNode)[M_EVAL] = ret
				}
				return ret
			}
			case S_TRY:
				try {
					const ret = evalExp(a1, env, cache)
					if (cache) {
						;(exp as MalNode)[M_EVAL] = ret
					}
					return ret
				} catch (exc) {
					let err = exc
					if (a2 && Array.isArray(a2) && a2[0] === S_CATCH) {
						if (exc instanceof Error) {
							err = exc.message
						}
						const ret = evalExp(
							a2[2],
							new Env(env, [a2[1] as MalSymbol], [err]),
							cache
						)
						if (cache) {
							;(exp as MalNode)[M_EVAL] = ret
						}
						return ret
					} else {
						throw err
					}
				}
			case S_DO: {
				if (cache) {
					;(exp as MalNodeSeq)[M_FN] = env.get(S_DO) as MalFunc
				}
				if (exp.length === 1) {
					return null
				}
				evalAtom(exp.slice(1, -1), env, cache)
				const ret = exp[exp.length - 1]
				if (cache) {
					;(exp as MalNode)[M_EVAL] = ret
					;(exp as MalNodeSeq)[M_EXPANDED] = ret
				}
				exp = ret
				break // continue TCO loop
			}
			case S_IF: {
				const [, _test, thenExp, elseExp] = exp
				const test = evalExp(_test, env, cache)
				const ret = test ? thenExp : elseExp !== undefined ? elseExp : null
				if (cache) {
					;(exp as MalNode)[M_EVAL] = ret
					;(exp as MalNodeSeq)[M_FN] = env.get(S_IF) as MalFunc
					;(exp as MalNodeSeq)[M_EXPANDED] = ret
				}
				exp = ret
				break // continue TCO loop
			}
			case S_ENV_CHAIN: {
				const envs = env.getChain()
				exp = [S('println'), envs.map(e => e.name).join(' <- ')]
				break // continue TCO loop
			}
			// case 'which-env': {
			// 	let _env: Env | null = env
			// 	const envs = []

			// 	do {
			// 		envs.push(_env)
			// 		_env = _env.outer
			// 	} while (_env)

			// 	exp = [
			// 		S('println'),
			// 		envs
			// 			.filter(e => e.hasOwn(a1 as MalSymbol))
			// 			.map(e => e.name)
			// 			.join(' <- ') || 'not defined'
			// 	]
			// 	break
			// }
			default: {
				// Apply Function
				const [fn, ...args] = evalAtom(exp, env, cache) as MalVal[]

				if (fn instanceof Function) {
					;(exp as MalNodeSeq)[M_EVAL_PARAMS] = args
					const ret = fn(...args)
					if (cache) {
						;(exp as MalNode)[M_EVAL] = ret
						;(exp as MalNodeSeq)[M_FN] = fn
					}
					return ret
				} else {
					let typename = ''

					if (isKeyword(fn)) {
						typename = 'Keyword '
					} else if (Array.isArray(fn)) {
						typename = 'List '
					}
					throw new LispError(
						`[EVAL] ${typename} ${printExp(
							fn
						)} is not a function. First element of list always should be a function.`
					)
				}
			}
		}
	}
	if (counter >= 1e6) {
		throw new Error('[EVAL] Exceed the maximum TCO stacks')
	}

	return null
}

/*
const MalNodeSeq_SYMBOLS = [
	M_ISSUGAR,
	M_DELIMITERS,
	M_ELMSTRS,
	M_FN,
	M_EVAL,
	M_EVAL_PARAMS,
	M_EXPANDED,
	M_OUTER,
	M_OUTER_INDEX
]

const MALNODEMAP_SYMBOLS = [
	M_DELIMITERS,
	M_ELMSTRS,
	M_KEYS,
	M_EVAL,
	M_OUTER,
	M_OUTER_INDEX
]

function cloneMalNode(original: MalNode) {
	let cloned: MalNode

	const isArray = Array.isArray(original)

	if (isArray) {
		cloned = [...(original as MalNodeSeq)] as MalNodeSeq
		if (isVector(original)) {
			V(cloned)
		}
	} else {
		cloned = {...original} as MalNodeMap
	}

	const symbols = isArray ? MalNodeSeq_SYMBOLS : MALNODEMAP_SYMBOLS

	for (const sym of symbols) {
		if (sym in original) {
			;(cloned as any)[sym] = (original as any)[sym]
		}
	}

	return cloned
}
*/

// Cached Tree-shaking
export function replaceExp(original: MalNode, replaced: MalVal) {
	const outer = original[M_OUTER]
	const index = original[M_OUTER_INDEX]

	if (index === undefined || !isMalNode(outer)) {
		throw new LispError('Cannot execute replaceExp')
	}

	// // Inherit delimiters if possible
	// if (isMalNode(original) && original[M_DELIMITERS] && isMalNode(replaced)) {
	// 	replaced[M_DELIMITERS] = []
	// 	console.log('sdfd', original, replaced)
	// 	if (isList(original) && isList(replaced)) {
	// 		for (let i = 0; i < replaced.length; i++) {
	// 			const oi = Math.min(i, original.length - 2)
	// 			replaced.push(original[M_DELIMITERS][oi])
	// 		}
	// 		replaced.push(original[M_DELIMITERS][original.length - 1])
	// 	}
	// }

	// Set as child
	if (Array.isArray(outer)) {
		outer[index] = replaced
	} else {
		// hash map
		const key = outer[M_KEYS][index]
		outer[key] = replaced
	}

	delete outer[M_ELMSTRS]

	// Set outer recursively
	saveOuter(replaced, outer, index)

	// Refresh M_ELMSTRS of ancestors
	let _outer = outer

	while (_outer) {
		delete _outer[M_ELMSTRS]

		// Go upward
		_outer = _outer[M_OUTER]
	}
}
