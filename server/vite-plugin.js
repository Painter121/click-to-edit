const path = require('path');
const { createCteMiddleware } = require('./middleware');

function clickToEditPlugin(options = {}) {
  let rootDir = options.rootDir ? path.resolve(options.rootDir) : process.cwd();

  return {
    name: 'click-to-edit',
    apply: 'serve',
    configResolved(config) {
      if (!options.rootDir && config && config.root) {
        rootDir = config.root;
      }
    },
    configureServer(server) {
      const middleware = createCteMiddleware({
        ...options,
        rootDir
      });
      server.middlewares.use(middleware);
    },
    transformIndexHtml(html) {
      if (html.includes('/__cte/click-to-edit.js')) {
        return html;
      }
      const tag = '  <script src="/__cte/click-to-edit.js"></script>\n';
      if (/<\/body>/i.test(html)) {
        return html.replace(/<\/body>/i, `${tag}</body>`);
      }
      return html + '\n' + tag;
    }
  };
}

module.exports = clickToEditPlugin;
module.exports.default = clickToEditPlugin;
module.exports.clickToEditPlugin = clickToEditPlugin;
