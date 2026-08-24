const assert = require('assert');
const fs = require('fs');

const wxml = fs.readFileSync('miniprogram/pages/frame/frame.wxml', 'utf8');
const wxss = fs.readFileSync('miniprogram/pages/frame/frame.wxss', 'utf8');
const js = fs.readFileSync('miniprogram/pages/frame/frame.js', 'utf8');

assert(wxml.includes('activeTool'), 'tool state must be rendered');
assert(wxml.includes("activeTool==='template'"));
assert(wxml.includes("activeTool==='canvas'"));
assert(wxml.includes("activeTool==='frame'"));
assert(!wxml.includes("activeTool==='image'"), 'image controls must live in the picture panel');
assert(wxml.includes('图片缩放'));
assert(wxml.includes('onImageZoomChanging'));
assert(wxml.includes('min="50" max="200"'), 'image scaling must support zooming out and in');
assert(!wxml.includes('完整显示'), 'non-interactive fit copy should not be shown');
assert(wxml.includes('displayWidth') && wxml.includes('displayHeight'));
assert(wxml.includes('class="setting-scroll"'));
assert(wxss.includes('.workspace') && wxss.includes('overflow: hidden'));
assert(wxss.includes('.preview-stage') && wxss.includes('.setting-sheet'));
assert(wxss.includes('--bf-accent') && wxss.includes('--bf-page'), 'gallery palette tokens must be defined');
assert(!wxss.includes('.main-panel'), 'legacy vertical editor shell should be removed');
assert(js.includes('measurePreviewViewport'));
assert(js.includes('panelScrollTop: 0'));
assert(js.includes("toolOptions: ['template', 'canvas', 'frame']"));
assert(js.includes('applyImageZoom'));
console.log('fixed workspace static checks passed');
