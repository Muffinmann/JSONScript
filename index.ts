import {
  getValueByPath, isEmptyObject, isObject, isUndefinedOrNull, setValueByPath,
} from './utils';


type CommonPrimitive = string | number | boolean | undefined | null;
type BasicOperator =
| '+'
| '-'
| '*'
| '/'
| '>'
| '<'
| '!'
| '!!'
| '||'
| '==='
| '!=='
| 'min'
| 'max';

type Operator =
| BasicOperator
| 'some'
| 'every'
| 'if'
| 'and'
| 'or'
| 'var';

type Operand = CommonPrimitive | Logic;

type NumberOrVar = number | { var: string } | Logic;

export type Logic =
| { '+': NumberOrVar[] }
| { '*': NumberOrVar[] }
| { '<': NumberOrVar[] }
| { '>': NumberOrVar[] }
| { '-': [NumberOrVar, NumberOrVar] }
| { '/': [NumberOrVar, NumberOrVar] }
| { '!': Operand }
| { '!!': Operand }
| { '===': [Operand, Operand] }
| { '!==': [Operand, Operand] }
| { '!!': Operand }
| { '||': [Operand, Operand] }
| { 'min': number[] }
| { 'max': number[] }
| { 'some': [Operand[], Logic] }
| { 'every': [Operand[], Logic] }
| { 'and': Operand[] }
| { 'or': Operand[] }
| { 'if': Operand[] }
| { 'var': string };


const BASIC_OPERATION: { [K in BasicOperator]: Function } = {
  '+': (...xn: number[]) => xn.reduce((prev, crr) => prev + crr, 0),
  '-': (...xn: number[]) => xn[0] - xn[1],
  '*': (...xn: number[]) => xn.reduce((prev, crr) => prev * crr, 1),
  '/': (...xn: number[]) => xn[0] / xn[1],
  '!': (...xn: CommonPrimitive[]) => !xn[0],
  '!!': (...xn: CommonPrimitive[]) => !!xn[0],
  '===': (...xn: CommonPrimitive[]) => (isUndefinedOrNull(xn[0]) && isUndefinedOrNull(xn[1]) ? true : xn[0] === xn[1]),
  '!==': (...xn: CommonPrimitive[]) => (isUndefinedOrNull(xn[0]) && isUndefinedOrNull(xn[1]) ? false : xn[0] !== xn[1]),
  '<': (...xn: number[]) => {
    for (let i = 0; i < xn.length - 1; i++) {
      const current = xn[i];
      const next = xn[i + 1];
      if (Number.isNaN(current) || Number.isNaN(next)) {
        return false;
      }
      if (current >= next) {
        return false;
      }
    }
    return true;
  },
  '>': (...xn: number[]) => {
    for (let i = 0; i < xn.length - 1; i++) {
      const current = xn[i];
      const next = xn[i + 1];
      if (Number.isNaN(current) || Number.isNaN(next)) {
        return false;
      }
      if (current <= next) {
        return false;
      }
    }
    return true;
  },
  '||': (...xn: CommonPrimitive[]) => xn[0] || xn[1],
  max: Math.max,
  min: Math.min,
};

const AVAILABLE_OPERATORS = [
  ...Object.keys(BASIC_OPERATION),
  'some', 'every', 'if', 'and', 'or', 'var',
];

const getOperator = (logic: Logic): Operator => Object.keys(logic)[0] as Operator;

const getOperand = (logic: Logic): Operand[] => {
  const operand = logic[getOperator(logic) as keyof Logic];
  if (typeof operand === 'undefined') {
    throw new Error('Unknown operator or operand is undefined');
  }
  return Array.isArray(operand) ? operand : [operand];
};

/**
 * Checks whether the given value is of type 'string', 'number', 'boolean', 'undefined' or 'null'
 */
export const isCommonPrimitive = (val: unknown): val is CommonPrimitive => (typeof val !== 'object' && typeof val !== 'function') || val === null;

export const isLogic = (val: unknown): val is Logic => (typeof val === 'object'
    && !Array.isArray(val)
    && val !== null
    && val !== undefined
    && Object.keys(val).length === 1)
    && AVAILABLE_OPERATORS.includes(Object.keys(val)[0]);

export const resolveJsonLogic = (logic: Logic | Operand | Operand[], data: Record<string, any> = {}): CommonPrimitive | CommonPrimitive[] => {
  if (Array.isArray(logic)) {
    const res = logic.map((l) => resolveJsonLogic(l, data)) as CommonPrimitive[];
    return res;
  }

  if (!isLogic(logic)) {
    return logic;
  }

  const operator = getOperator(logic);
  const operand = getOperand(logic);

  if (operator === 'if') {
    for (let i = 0; i < operand.length - 1; i += 2) {
      if (resolveJsonLogic(operand[i], data)) {
        return resolveJsonLogic(operand[i + 1], data);
      }
    }
    return resolveJsonLogic(operand[operand.length - 1], data);
  }

  if (operator === 'and') {
    for (let i = 0; i < operand.length; i++) {
      const value = resolveJsonLogic(operand[i], data);
      if (!value) {
        return false;
      }
    }
    return true;
  }

  if (operator === 'or') {
    for (let i = 0; i < operand.length; i++) {
      const value = resolveJsonLogic(operand[i], data);
      if (value) {
        return true;
      }
    }
    return false;
  }

  if (operator === 'some') {
    const value = resolveJsonLogic(operand[0], data);
    if (Array.isArray(value)) {
      return value.some((v) => resolveJsonLogic(operand[1], { ...data, $: v }));
    }
    return Boolean(value);
  }

  if (operator === 'every') {
    const value = resolveJsonLogic(operand[0], data);
    if (Array.isArray(value)) {
      return value.every((v) => resolveJsonLogic(operand[1], { ...data, $: v }));
    }
    return Boolean(value);
  }

  if (operator === 'var') {
    const path = operand[0] as string;
    const keys = path.split('.');
    let value = data;
    while (keys.length) {
      const key = keys.shift();
      if (key) {
        value = value[key];
        if (!value) {
          break;
        }
      }
    }
    return value as unknown as CommonPrimitive;
  }


  if (operator in BASIC_OPERATION) {
    const settledOperands = operand.map((o) => resolveJsonLogic(o, data)) as CommonPrimitive[];
    if (operator === '!' || operator === '!!' || operator === '!==' || operator === '===') {
      return BASIC_OPERATION[operator](...settledOperands);
    }
    const transformedOperands = settledOperands.map(Number) as number[];
    return BASIC_OPERATION[operator](...transformedOperands);
  }

  throw new Error(`Unknown operator ${operator}`);
};


// a dependency is an object of the shape: {var: string} in the Logic expression
export const scanDependency = (logic: Logic | Operand | Operand[], onDepFound: (dep: string) => void) => {
  if (Array.isArray(logic)) {
    logic.forEach((l) => scanDependency(l, onDepFound));
  }

  if (!isLogic(logic)) {
    return;
  }

  const operator = getOperator(logic);

  const operands = getOperand(logic);

  if (operator === 'var') {
    onDepFound(operands[0] as string);
  } else {
    operands.forEach((operand) => scanDependency(operand, onDepFound));
  }
};

export const collectDependencies = (logic: Logic | Operand | Operand[]) => {
  const deps = new Set<string>();
  scanDependency(logic, (dep) => deps.add(dep));
  if (deps.has('$')) {
    deps.delete('$');
  }
  return Array.from(deps);
};


const PATH_DELIMITER = '.';

export const getRuleByPath = (rule: Record<string, any>, path: string | string[]): Logic | Operand | Operand[] => {
  let final = rule;
  const pathSegments = Array.isArray(path) ? path : path.split(PATH_DELIMITER);
  let segmentIndex = 0;

  while (segmentIndex < pathSegments.length) {
    const segment = pathSegments[segmentIndex];
    if (isCommonPrimitive(final)
      || (Array.isArray(final) && final.every(isCommonPrimitive))
      || isLogic(final)
    ) {
      return final;
    }

    if (isEmptyObject(final)) {
      return null;
    }

    // convert type "any[]" to Record
    final = final as Record<string, any>;
    if (segment in final) {
      const next = final[segment];
      if (next === undefined) {
        return null;
      }

      final = next;
    }
    segmentIndex++;
  }

  if (isCommonPrimitive(final)
      || (Array.isArray(final) && final.every(isCommonPrimitive))
      || isLogic(final)
  ) {
    return final;
  }


  return null;
};

export const mergeEdge = (lastEdge: Record<string, any> | string[] | null | undefined, path: string): string[] | Record<string, any> => {
  if (Array.isArray(lastEdge)) {
    return [...lastEdge, path];
  }
  if (isObject(lastEdge)) {
    return Object.fromEntries(
      Object.entries(lastEdge).map(([key, val]) => [key, mergeEdge(val, path.concat('.', key))]),
    ) as Record<string, any>;
  }
  return [path];
};

const makeDependencyTree = (rules: Record<string, any>): Record<string, any> => {
  const forward = {}; // field -> deps
  const backward = {}; // dep -> fields

  const run = (rule: any, path: string[] = []) => {
    if (isLogic(rule)) {
      collectDependencies(rule).forEach((dep) => {
        const depPath = path.map((e, index) => (index === 0 ? dep : e)).join('.');
        const pathStr = path.join('.');

        const lastForward = getValueByPath(forward, pathStr) || [];
        const lastBackward = getValueByPath(backward, depPath) || [];

        setValueByPath(forward, pathStr, mergeEdge(lastForward, depPath));
        setValueByPath(backward, depPath, mergeEdge(lastBackward, pathStr));
      });
    } else if (rule && typeof rule === 'object') {
      Object.entries(rule).forEach(([key, val]) => [key, run(val, [...path, key])]);
    }
  };
  run(rules);

  return {
    undirected: { ...forward, ...backward }, forward, backward,
  };
};

export const createRuleEngine = (rules: object) => {
  let facts: undefined | object;

  const dependencyTree = makeDependencyTree(rules);
  const getDeps = (path: string, type: 'undirected' | 'forward' | 'backward' = 'undirected') => getValueByPath(dependencyTree[type], path, true) || [];

  return {
    useFacts(f: object) {
      facts = f;
      return this;
    },
    propagate(path: string, type: 'backward' | 'forward' | 'undirected') {
      // extract all nested dependencies into an array
      const flattenDependencies = (localPath: string | string[]): string[] => {
        const dependencies: string[] = Array.isArray(localPath)
          ? localPath.flatMap((p) => getDeps(p, type))
          : getDeps(localPath, type);

        if (dependencies.length) {
          return [...dependencies, ...dependencies.flatMap((p) => flattenDependencies(p))];
        }
        return dependencies;
      };
      return flattenDependencies(path);
    },
    /**
     * Executes a rule of given path with given facts
     */
    run(path: string, f?: object) {
      const rule = getRuleByPath(rules, path);
      const resolvedFacts: Record<string, any> = f || facts || {};

      if (!resolvedFacts) {
        console.log('No facts is provided, either call "useFacts" method or provide facts as the function argument.');
      }
      const result = resolveJsonLogic(rule, resolvedFacts);
      return result;
    },
    runSeveral(entries: [string, object][] | [string][]) {
      if (Array.isArray(entries)) {
        return entries.map(([path, localFacts = facts]) => this.run(path, localFacts || {}));
      }
      console.error('runSeveral only accepts array as argument');
      return [];
    },
    /**
     * Executes a rule of given path with given facts.
     * This method would also run the rules of the dependencies.
     */
    drill(path: string, f?: object, type: 'undirected' | 'forward' | 'backward' = 'undirected') {
      const allPath = [path].concat(this.propagate(path, type));
      const results = allPath.map((p) => this.run(p, f));
      return results;
    },
  };
};

