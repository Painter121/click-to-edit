const clickToEditPlugin = require('./server/vite-plugin');
const { createCteMiddleware } = require('./server/middleware');

module.exports = {
  clickToEditPlugin,
  createCteMiddleware
};
