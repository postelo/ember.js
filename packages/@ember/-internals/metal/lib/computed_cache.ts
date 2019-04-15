const COMPUTED_PROPERTY_CACHED_VALUES = new WeakMap<object, Map<string, any | null | undefined>>();

/**
  Returns the cached value for a property, if one exists.
  This can be useful for peeking at the value of a computed
  property that is generated lazily, without accidentally causing
  it to be created.

  @method cacheFor
  @static
  @for @ember/object/internals
  @param {Object} obj the object whose property you want to check
  @param {String} key the name of the property whose cached value you want
    to return
  @return {Object} the cached value
  @public
*/
export function getCacheFor(obj: object): Map<string, any> {
  let cache = COMPUTED_PROPERTY_CACHED_VALUES.get(obj);
  if (cache === undefined) {
    cache = new Map<string, any>();

    COMPUTED_PROPERTY_CACHED_VALUES.set(obj, cache);
  }
  return cache;
}

export function getCachedValueFor(obj: object, key: string): any {
  let cache = COMPUTED_PROPERTY_CACHED_VALUES.get(obj);
  if (cache !== undefined) {
    return cache.get(key);
  }
}

export function peekCacheFor(obj: object): any {
  return COMPUTED_PROPERTY_CACHED_VALUES.get(obj);
}
