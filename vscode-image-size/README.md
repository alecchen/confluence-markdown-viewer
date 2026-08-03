# Markdown Image Size (Confluence viewer)

Adds the [Confluence Markdown Viewer](https://github.com/alecchen/confluence-markdown-viewer)'s image size syntax to VS Code's
built-in markdown preview (Ctrl+Shift+V). Without it, `=50%` renders as literal
text and `|50` shows up in the alt text.

## Syntax

| Markdown | Result |
| --- | --- |
| `![alt](img.png =50%)` | width 50% |
| `![alt](img.png =100px)` | exactly 100px wide |
| `![alt\|50](img.png)` | 50px wide (Obsidian style) |
| `![alt\|50%](img.png)` | 50% wide |

`=width` goes after the destination (keep a space before `=`). The Obsidian
style rides in the alt text, where `|50` means pixels and `|50%` means percent.
Plain images are untouched, and the syntax is ignored inside code fences.

The output is identical to what the Confluence viewer renders, so a draft
previews the way it will look after publish.

## Install

Run it directly in VS Code (F5 opens an Extension Development Host), or package
and share a `.vsix`:

```sh
npm install          # once, dev-only
npx @vscode/vsce package
```

Each user installs the `.vsix` once: Extensions view → ⋯ → **Install from VSIX…**,
or `code --install-extension mdv-image-size-0.0.1.vsix`.
