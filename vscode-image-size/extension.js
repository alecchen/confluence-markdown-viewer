'use strict';
const mdvImageSize = require('./mdv-image-size');

exports.activate = () => ({
  /* Contributing `markdown.markdownItPlugins` (see package.json) makes VS Code
     call this with the preview's markdown-it instance when a preview opens. */
  extendMarkdownIt(md) {
    return md.use(mdvImageSize);
  },
});
