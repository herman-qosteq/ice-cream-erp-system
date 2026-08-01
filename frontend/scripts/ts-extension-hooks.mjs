// Node's native ESM resolver requires explicit file extensions, but this
// repo's source (compiled normally via Metro/tsc, which do resolve bare
// specifiers) imports relative TS modules without one, e.g.
// `from '../types'` in utils/permissions.ts. This hook lets the smoke tests
// under src/utils/__tests__ import real source modules unmodified by
// retrying a failed resolution with '.ts' appended, instead of maintaining
// a parallel copy of the logic under test.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND' && (specifier.startsWith('.') || specifier.startsWith('/'))) {
      return await nextResolve(`${specifier}.ts`, context);
    }
    throw err;
  }
}
