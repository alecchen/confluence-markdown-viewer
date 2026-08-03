'use strict';
/* Markdown image size syntax for VS Code's built-in preview.

   Mirrors the marked extension in ../js/viewer.js so the draft preview in VS
   Code and the Confluence viewer render the same images the same way:

     ![alt](img.png =50%)    =100px     size after the destination (space before =)
     ![alt|50](img.png)      |50%       Obsidian style, size in the alt text

   |50 means 50px, |50% means 50%. Plain images fall through to markdown-it. */
module.exports = function mdvImageSize(md) {
  md.inline.ruler.before('image', 'mdv_image_size', function (state, silent) {
    let m;
    let alt, href, width, title, raw;
    const src = state.src.slice(state.pos);

    /* =size after the destination:  ![alt](href =50%)   (optional quoted title) */
    m = /^!\[([^\]]*)\]\(\s*([^)\s]+)\s+=\s*([^)\s)]+)\s*(?:"([^"]*)")?\s*\)/.exec(src);
    if (m) {
      raw = m[0]; alt = m[1]; href = m[2]; width = m[3]; title = m[4] || null;
    } else {
      /* Obsidian-style |size in the alt text:  ![alt|50](href)   (optional quoted title) */
      m = /^!\[([^\]]*?)\|([0-9]+(?:\.[0-9]+)?)(%?)\]\(\s*([^)\s]+)\s*(?:"([^"]*)")?\s*\)/.exec(src);
      if (m) {
        raw = m[0]; alt = m[1]; href = m[4]; width = m[2] + (m[3] || 'px'); title = m[5] || null;
      }
    }
    if (!m) return false;
    if (silent) return true;

    const token = state.push('image', 'img', 0);
    token.attrs = [['src', href], ['alt', alt], ['width', width]];
    if (title) token.attrSet('title', title);
    token.content = alt;
    token.children = state.md.parseInline(alt, state.env)[0].children;
    token.markup = '!';
    state.pos += raw.length;
    return true;
  });
};
