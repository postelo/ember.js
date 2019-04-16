import { meta as metaFor, peekMeta } from '@ember/-internals/meta';
import { combine, CONSTANT_TAG, Tag, UpdatableTag } from '@glimmer/reference';
import { getLastRevisionFor, peekCacheFor } from './computed_cache';
import { descriptorForProperty } from './descriptor_map';
import { tagForProperty, update } from './tags';

export function finishLazyTags(obj: any, key: string, value: any) {
  let meta = peekMeta(obj);
  let lazyTags = meta !== null ? meta.readableLazyChainsFor(key) : undefined;

  if (lazyTags === undefined) {
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

function getChainTagsForKey(obj: any, key: string) {
  let chainTags: Tag[] = [];

  let current: any = obj;
  let segments = key.split('.');

  let segment = segments.shift()!;
  chainTags.push(tagForProperty(current, segment));

  while (segments.length > 0) {
    segment = segments.shift()!;

    if (segment === '@each') {
      segment = segments.shift()!;

      let tags = (current as Array<any>).map(item => tagForProperty(item, segment));

      chainTags.push(...tags);

      // There shouldn't be any more segments after an `@each`, so break
      break;
    }

    let propertyTag = tagForProperty(current, segment);

    chainTags.push(propertyTag);

    let descriptor = descriptorForProperty(current, segment);

    if (descriptor !== undefined) {
      let lastRevision = getLastRevisionFor(current, segment);

      if (propertyTag.validate(lastRevision)) {
        current = peekCacheFor(current).get(segment);
      } else {
        let chainTag = UpdatableTag.create(CONSTANT_TAG);
        metaFor(current)
          .writableLazyChainsFor(key)
          .push([segments.join('.'), chainTag]);

        break;
      }
    } else {
      // TODO: Assert that current[segment] isn't an undecorated, non-MANDATORY_SETTER getter

      current = current[segment];
    }
  }

  return combine(chainTags);
}
