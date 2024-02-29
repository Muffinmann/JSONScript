export type Primitive =
  | null
  | undefined
  | string
  | number
  | boolean
  | symbol
  | bigint;

export type EmptyObject = { [K in string | number]: never };

export const isObject = (val: unknown): val is object => Object.prototype.toString.call(val) === '[object Object]';

export const isPrimitive = (v: unknown): v is Primitive => {
  if (v === null || v === undefined) {
    return true;
  }
  if (Array.isArray(v)) {
    return false;
  }
  if (typeof v === 'function') {
    return false;
  }
  return !(Object.prototype.toString.call(v) === '[object Object]');
};

/**
 * Gets the value of a nested property in an object using a path string. It supports the use of wildcard '*',
 * in this case, returns an array of all endpoints matching the given path.
 *
 * @param {Record<string, any> | undefined | null} obj The object to get the value from.
 * @param {string | string[]} path The path to the nested property. Path segments are separate by point '.'
 * @param {boolean} strict if false, fallback to the value of last path segment
 * @returns {unknown} The value of the nested property.
 */
export const getValueByPath = (obj: Record<string, any> | Primitive | Primitive[], path: string | string[], strict = true): any => {
  const pathSegments = Array.isArray(path) ? [...path] : path.split('.');

  if (isPrimitive(obj)) {
    if (pathSegments.length) {
      if (pathSegments.length === 1 && pathSegments[0] === '*') {
        return [obj];
      }
      return null;
    }
    return obj;
  }

  const currentSegment = pathSegments.shift();

  if (currentSegment === undefined) {
    return obj;
  }

  if (currentSegment === '*') {
    const isLastSegment = pathSegments.length === 0 && pathSegments.length === 0 && isObject(obj);
    if (isLastSegment) {
      // push wildcard to the tail to enable recursion going further in the object
      pathSegments.push(currentSegment);
    }
    return Object.values(obj)
      .flatMap((o) => getValueByPath(o, pathSegments, !isLastSegment))
      .filter((i) => i !== null);
  }

  if (currentSegment in obj) {
    return getValueByPath(obj[currentSegment as keyof typeof obj], pathSegments, strict);
  }

  if (strict) {
    return null;
  }

  return obj;
};

export const isUndefinedOrNull = (v: unknown): v is null | undefined => v === undefined || v === null;

/**
 * Sets the value of a nested property in an object using a path string.
 *
 * @param {Record<string, any>} data The object to set the value.
 * @param {string | string[]} path The path to the nested property. Path segments are separate by point '.'
 * @param {any} value  property value of the path
 * @returns {Record<string, any>} updated object.
 */
export const setValueByPath = (data: Record<string, any>, path: string | string[] | undefined, value: any): any => {
  if (path === undefined) {
    return data;
  }

  const localPath = Array.isArray(path) ? path.slice() : path.split('.');
  const segment = localPath.shift();

  if (segment === undefined) {
    return value;
  }

  if (!Object.hasOwn(data, segment)) {
    data[segment] = {};
  }

  data[segment] = setValueByPath(data[segment], localPath, value);
  return data;
};

export const isEmptyObject = (value: unknown): value is EmptyObject => Object.prototype.toString.call(value) === '[object Object]' && Object.keys(value as object).length === 0;
