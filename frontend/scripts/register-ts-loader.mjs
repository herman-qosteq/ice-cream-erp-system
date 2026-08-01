import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./ts-extension-hooks.mjs', pathToFileURL(`${import.meta.dirname}/`));
