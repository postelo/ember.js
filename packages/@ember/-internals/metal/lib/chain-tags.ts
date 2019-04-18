import { meta as metaFor, peekMeta } from '@ember/-internals/meta';
import { combine, CONSTANT_TAG, Tag, UpdatableTag } from '@glimmer/reference';
import { getLastRevisionFor, peekCacheFor } from './computed_cache';
import { descriptorForProperty } from './descriptor_map';
import { tagForProperty, update } from './tags';

export function finishLazyChains(obj: any, key: string, value: any) {
  let meta = peekMeta(obj);
  let lazyTags = meta !== null ? meta.readableLazyChainsFor(key) : undefined;

  if (lazyTags === undefined) {
    return;
  }

  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    lazyTags.clear();
    return;
  }

  while (lazyTags.length > 0) {
    let [path, tag] = lazyTags.pop()!;

    update(tag, getChainTagsForKey(value, path));
  }
}

export function getChainTagsForKeys(obj: any, keys: string[]) {
  let chainTags: Tag[] = [];

  for (let key of keys) {
    chainTags.push(getChainTagsForKey(obj, key));
  }

  return combine(chainTags);
}

export function getChainTagsForKey(obj: any, key: string) {
  let chainTags: Tag[] = [];

  let current: any = obj;
  let segments = key.split('.');

  while (segments.length > 0) {
    let segment = segments.shift()!;

    if (segment === '@each') {
      segment = segments.shift()!;

      // Push the tags for each item's property
      let tags = (current as Array<any>).map(item => tagForProperty(item, segment));

      // Push the tag for the array length itself
      chainTags.push(...tags, tagForProperty(current, '[]'));

      // There shouldn't be any more segments after an `@each`, so break
      break;
    }

    let propertyTag = tagForProperty(current, segment);

    chainTags.push(propertyTag);

    let descriptor = descriptorForProperty(current, segment);

    if (descriptor === undefined) {
      // TODO: Assert that current[segment] isn't an undecorated, non-MANDATORY_SETTER getter

      if (!(segment in current) && typeof current.unknownProperty === 'function') {
        current = current.unknownProperty(segment);
      } else {
        current = current[segment];
      }
    } else {
      let lastRevision = getLastRevisionFor(current, segment);

      if (propertyTag.validate(lastRevision)) {
        let cache = peekCacheFor(current);

        if (cache === undefined || !cache.has(segment)) {
          current = current[segment];
        } else {
          current = peekCacheFor(current).get(segment);
        }
      } else if (segments.length > 0) {
        let chainTag = UpdatableTag.create(CONSTANT_TAG);
        metaFor(current)
          .writableLazyChainsFor(key)
          .push([segments.join('.'), chainTag]);

        break;
      }
    }

    let currentType = typeof current;

    if (current === null || (currentType !== 'object' && currentType !== 'function')) {
      // we've hit the end of the chain for now, break out
      break;
    }
  }

  return combine(chainTags);
}
