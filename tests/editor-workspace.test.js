const assert = require('assert');
const fs = require('fs');

const wxml = fs.readFileSync('pages/frame/frame.wxml', 'utf8');
const wxss = fs.readFileSync('pages/frame/frame.wxss', 'utf8');
const js = fs.readFileSync('pages/frame/frame.js', 'utf8');

assert(wxml.includes('activeTool'), 'tool state must be rendered');
assert(wxml.includes("activeTool==='template'"));
assert(wxml.includes("activeTool==='canvas'"));
assert(wxml.includes("activeTool==='frame'"));
assert(wxml.includes("activeTool==='image'"));
assert(wxml.includes('displayWidth') && wxml.includes('displayHeight'));
assert(wxml.includes('class="setting-scroll"'));
assert(wxss.includes('.workspace') && wxss.includes('overflow: hidden'));
assert(wxss.includes('.preview-stage') && wxss.includes('.setting-sheet'));
assert(!wxss.includes('.main-panel'), 'legacy vertical editor shell should be removed');
assert(js.includes('measurePreviewViewport'));
assert(js.includes('panelScrollTop: 0'));
console.log('fixed workspace static checks passed');
