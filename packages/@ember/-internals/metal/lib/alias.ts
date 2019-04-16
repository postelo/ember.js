import { Meta, meta as metaFor } from '@ember/-internals/meta';
import { inspect } from '@ember/-internals/utils';
import { assert } from '@ember/debug';
import EmberError from '@ember/error';
import { getCachedValueFor, getCacheFor } from './computed_cache';
import {
  addDependentKeys,
  ComputedDescriptor,
  Decorator,
  isElementDescriptor,
  makeComputedDecorator,
  removeDependentKeys,
} from './decorator';
import { descriptorForDecorator } from './descriptor_map';
import { defineProperty } from './properties';
import { get } from './property_get';
import { set } from './property_set';
import { EMBER_METAL_TRACKED_PROPERTIES } from '@ember/canary-features';
import { finishLazyChains } from './chain-tags';
import { tagForProperty, update } from './tags';
import { getCurrentTracker, setCurrentTracker } from './tracked';

const CONSUMED = Object.freeze({});

export type AliasDecorator = Decorator & PropertyDecorator & AliasDecoratorImpl;

export default function alias(altKey: string): AliasDecorator {
  assert(
    'You attempted to use @alias as a decorator directly, but it requires a `altKey` parameter',
    !isElementDescriptor(Array.prototype.slice.call(arguments))
  );

  return makeComputedDecorator(new AliasedProperty(altKey), AliasDecoratorImpl) as AliasDecorator;
}

// TODO: This class can be svelted once `meta` has been deprecated
class AliasDecoratorImpl extends Function {
  readOnly(this: Decorator) {
    (descriptorForDecorator(this) as AliasedProperty).readOnly();
    return this;
  }

  oneWay(this: Decorator) {
    (descriptorForDecorator(this) as AliasedProperty).oneWay();
    return this;
  }

  meta(this: Decorator, meta?: any): any {
    let prop = descriptorForDecorator(this) as AliasedProperty;

    if (arguments.length === 0) {
      return prop._meta || {};
    } else {
      prop._meta = meta;
    }
  }
}

export class AliasedProperty extends ComputedDescriptor {
  readonly altKey: string;
  readonly altObjPath?: string;

  constructor(path: string) {
    super();

    if (EMBER_METAL_TRACKED_PROPERTIES) {
      let separatorIndex = path.lastIndexOf('.');

      if (separatorIndex !== -1) {
        this.altObjPath = path.substr(0, separatorIndex);
        this.altKey = path.substr(separatorIndex + 1);
      } else {
        this.altKey = path;
      }
    } else {
      this._dependentKeys = [path];
      this.altKey = path;
    }
  }

  setup(obj: object, keyName: string, propertyDesc: PropertyDescriptor, meta: Meta): void {
    assert(`Setting alias '${keyName}' on self`, this.altKey !== keyName);
    super.setup(obj, keyName, propertyDesc, meta);

    if (meta.peekWatching(keyName) > 0 && !EMBER_METAL_TRACKED_PROPERTIES) {
      this.consume(obj, keyName, meta);
    }
  }

  teardown(obj: object, keyName: string, meta: Meta): void {
    if (!EMBER_METAL_TRACKED_PROPERTIES) {
      this.unconsume(obj, keyName, meta);
    }
    super.teardown(obj, keyName, meta);
  }

  willWatch(obj: object, keyName: string, meta: Meta): void {
    if (!EMBER_METAL_TRACKED_PROPERTIES) {
      this.consume(obj, keyName, meta);
    }
  }

  get(obj: object, keyName: string): any {
    let ret: any;

    if (EMBER_METAL_TRACKED_PROPERTIES) {
      let parent = getCurrentTracker();
      setCurrentTracker();

      let altObj = this.altObjPath !== undefined ? get(obj, this.altObjPath) : obj;
      let ret = get(altObj, this.altKey);

      setCurrentTracker(parent);

      finishLazyChains(obj, keyName, ret);

      let altPropertyTag = tagForProperty(altObj, this.altKey);
      let propertyTag = tagForProperty(obj, keyName);

      update(propertyTag, altPropertyTag);

      if (parent !== null) {
        parent.add(propertyTag);
      }
    } else {
      ret = get(obj, this.altKey);
      this.consume(obj, keyName, metaFor(obj));
    }

    return ret;
  }

  unconsume(obj: object, keyName: string, meta: Meta): void {
    let wasConsumed = getCachedValueFor(obj, keyName) === CONSUMED;
    if (wasConsumed || meta.peekWatching(keyName) > 0) {
      removeDependentKeys(this, obj, keyName, meta);
    }
    if (wasConsumed) {
      getCacheFor(obj).delete(keyName);
    }
  }

  consume(obj: object, keyName: string, meta: Meta): void {
    let cache = getCacheFor(obj);
    if (cache.get(keyName) !== CONSUMED) {
      cache.set(keyName, CONSUMED);
      addDependentKeys(this, obj, keyName, meta);
    }
  }

  set(obj: object, _keyName: string, value: any): any {
    return set(obj, this.altKey, value);
  }

  readOnly(): void {
    this.set = AliasedProperty_readOnlySet;
  }

  oneWay(): void {
    this.set = AliasedProperty_oneWaySet;
  }
}

function AliasedProperty_readOnlySet(obj: object, keyName: string): never {
  // eslint-disable-line no-unused-vars
  throw new EmberError(`Cannot set read-only property '${keyName}' on object: ${inspect(obj)}`);
}

function AliasedProperty_oneWaySet(obj: object, keyName: string, value: any): any {
  defineProperty(obj, keyName, null);
  return set(obj, keyName, value);
}
