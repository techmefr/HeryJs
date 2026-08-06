import type {
  ExposeActionOptions,
  ExposedActionMeta,
  ExposedFieldSpec,
  ExposedParam,
} from './exposition.types';

export const EXPOSED_ACTION = 'exposition:action';
export const EXPOSED_PARAMS = 'exposition:params';

export function ExposeAction(
  name: string,
  options: ExposeActionOptions,
): MethodDecorator {
  return (_target, _propertyKey, descriptor: PropertyDescriptor) => {
    const meta: ExposedActionMeta = { name, ...options };
    Reflect.defineMetadata(EXPOSED_ACTION, meta, descriptor.value as object);
    return descriptor;
  };
}

export function ExposeField(
  name: string,
  spec: ExposedFieldSpec,
): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    if (propertyKey === undefined) return;
    const existing =
      (Reflect.getMetadata(EXPOSED_PARAMS, target, propertyKey) as
        Record<number, ExposedParam> | undefined) ?? {};
    existing[parameterIndex] = { name, spec };
    Reflect.defineMetadata(EXPOSED_PARAMS, existing, target, propertyKey);
  };
}
