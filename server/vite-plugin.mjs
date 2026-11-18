import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const clickToEditPlugin = require('./vite-plugin.js');

export { clickToEditPlugin };
export default clickToEditPlugin;
