const sys = wx.getSystemInfoSync();
const DPR = sys.pixelRatio || 1;

function parseRatio(str){
  if(!str) return [3,4];
  if(str === 'auto') return null;
  const m = str.match(/^(\d+)\s*[:：]\s*(\d+)$/);
  if(!m) return [3,4];
  return [parseInt(m[1],10), parseInt(m[2],10)];
}

Page({
  data: {
    images: [],
    curIndex: 0,
    ratioOptions: ['1:1','2:3','3:5','3:4','4:5','5:7','9:16','16:9','21:9'],
    ratioIdx: 0,
    isLandscape: false,

    sizePresets: ['1200','1800','2400','3000','4000'],
    sizeIdx: 1,

    borderPx: 4,
    zoom: 0.95,
    zoomPct: 95,

    // 外部白底和内部边框控制
    enableOuterBg: true,        // 是否显示外部背景
    outerBgColor: '#FFFFFF',    // 外部背景颜色
    enableInnerBorder: true,    // 是否显示内部边框
    innerBorderColor: '#000000', // 内部边框颜色
    
    // 颜色预设：黑色、灰色、白色 + 三个常用颜色
    colorPresets: ['#000000', '#666666', '#FFFFFF', '#FF6B6B', '#4ECDC4', '#45B7D1'],

    canvasBg: '#FFFFFF',
    
    // 颜色选择器
    showColorPicker: false,
    colorPickerType: 'outer', // outer 或 inner
    colorPickerMode: 'spectrum', // spectrum(光谱), slider(滑块), rgb(RGB)
    currentPickerColor: '#FFFFFF',
    colorGridData: [],
    // 滑块和RGB模式用
    hue: 0,
    saturation: 100,
    lightness: 50,
    red: 255,
    green: 255,
    blue: 255,

    previewW: 680,
    previewH: 510,
    displayHeight: 255,

    exporting:false, progressCur:0, progressTotal:0,

    // 图片缓存和性能优化
    _imageCache: {}, // 图片加载缓存
    _canvasReady: false, // 画布准备状态
  },

  onReady(){
    this.initPreviewCanvas();
    this.updatePreviewSize();
    this.generateColorGrid();
  },
  
  // 生成颜色网格数据
  generateColorGrid(){
    const colors = [];
    // 灰度
    const grays = [];
    for(let i = 0; i <= 10; i++){
      const val = Math.round(255 * i / 10);
      const hex = val.toString(16).padStart(2, '0');
      grays.push(`#${hex}${hex}${hex}`);
    }
    colors.push(grays);
    
    // 彩色网格（HSL色彩空间）
    const hues = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]; // 色相
    const sats = [100, 75, 50]; // 饱和度
    const lights = [90, 75, 60, 45, 30, 15]; // 亮度
    
    for(let s of sats){
      for(let l of lights){
        const row = [];
        for(let h of hues){
          row.push(this.hslToHex(h, s, l));
        }
        colors.push(row);
      }
    }
    
    this.setData({ colorGridData: colors });
  },
  
  // HSL转HEX
  hslToHex(h, s, l){
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = n => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  },

  // 选择与导航
  chooseImages(){
    wx.chooseImage({
      count:20, sizeType:['original'], sourceType:['album','camera'],
      success:(res)=>{
        const paths = res.tempFilePaths || res.tempFiles?.map(f=>f.tempFilePath) || [];
        console.log(`选择的图片路径: ${paths.length} 张`, paths);
        
        // 立即获取第一张图片的信息来检查长宽比
        if(paths.length > 0) {
          wx.getImageInfo({
            src: paths[0],
            success: (info) => {
              console.log(`第一张图片实际尺寸: ${info.width}x${info.height}, 原始比例: ${(info.width/info.height).toFixed(4)}`);
            }
          });
        }
        
        this.setData({ images: paths, curIndex:0 }, ()=>{
          // 分析第一张图片的主色调
          if(paths.length > 0){
            this.extractMainColors(paths[0]);
          }
          this.updatePreviewSize().then(()=> this.redrawPreview());
        });
      }
    });
  },
  onPickIndex(e){ 
    const idx = +e.currentTarget.dataset.idx || 0; 
    this.setData({curIndex:idx}, ()=>{
      // 分析当前选中图片的主色调
      if(this.data.images.length > idx){
        this.extractMainColors(this.data.images[idx]);
      }
      this.updatePreviewSize().then(()=> this.redrawPreview());
    });
  },

  // 比例/方向/尺寸
  onRatioChip(e){
    const idx = +e.currentTarget.dataset.idx || 0;
    this.setData({ratioIdx:idx}, ()=>{
      this.updatePreviewSize().then(()=> this.redrawPreview());
    });
  },
  toggleOrientation(){
    this.setData({isLandscape:!this.data.isLandscape}, ()=>{
      this.updatePreviewSize().then(()=> this.redrawPreview());
    });
  },
  onSizePick(e){ this.setData({ sizeIdx:+e.detail.value }, this.redrawPreview); },

  getCurrentRatioValue(){
    const option = this.data.ratioOptions[this.data.ratioIdx] || {};
    return typeof option === 'string' ? option : option.value;
  },

  ensureImageInfo(path){
    if(!path) return Promise.reject(new Error('empty image path'));
    if(!this._imageInfoCache){ this._imageInfoCache = {}; }
    const cached = this._imageInfoCache[path];
    if(cached){
      return Promise.resolve(cached);
    }
    return new Promise((resolve, reject)=>{
      wx.getImageInfo({
        src: path,
        success: (info)=>{
          console.log(`getImageInfo获取的图片信息: ${info.width}x${info.height}, 路径: ${path}`);
          this._imageInfoCache[path] = info;
          resolve(info);
        },
        fail: (err)=>{
          console.error('getImageInfo失败', err);
          reject(err);
        }
      });
    });
  },

  updatePreviewSize(){
    const ratioValue = this.getCurrentRatioValue();

    const applySize = (rwInput, rhInput)=>{
      let rw = Math.max(1, rwInput);
      let rh = Math.max(1, rhInput);
      // 按当前方向修正
      if(this.data.isLandscape && rw<rh) [rw,rh] = [rh,rw];
      if(!this.data.isLandscape && rw>rh) [rw,rh] = [rh,rw];

      const baseW = 680;
      const baseH = Math.max(1, Math.round(baseW * rh / rw));
      // 修正显示高度计算：使用相同的比例因子
      const dispH = Math.max(1, Math.round(300 * rh / rw)); // 从340改为300，与canvas宽度300px对应

      console.log(`预览尺寸计算: 比例${rw}:${rh}, 实际画布${baseW}x${baseH}, 显示尺寸300x${dispH}`);

      return new Promise(resolve=>{
        this.setData({ previewW:baseW, previewH:baseH, displayHeight:dispH }, ()=>{
          this.initPreviewCanvas(true);
          resolve();
        });
      });
    };

    if(ratioValue === 'auto'){
      const cur = this.data.images[this.data.curIndex];
      if(!cur){
        return applySize(3,4);
      }
      return this.ensureImageInfo(cur).then(info=>{
        if(info && info.width && info.height){
          return applySize(info.width, info.height);
        }
        return applySize(3,4);
      }).catch(()=>applySize(3,4));
    }

    const parsed = parseRatio(ratioValue);
    const [rw, rh] = parsed || [3,4];
    return applySize(rw, rh);
  },

  // 输入 & 步进
  onBorderInput(e){
    const val = e.detail.value;
    // 允许空字符串，允许用户删除所有内容
    if(val === ''){
      if(!this._borderInputting) {
        this._borderLastValue = this.data.borderPx || 4;
      }
      this._borderInputting = true;
      this.setData({ borderPx: '' });
      clearTimeout(this.borderTimer);
      return;
    }
    // 只允许数字
    const num = parseInt(val, 10);
    if(!isNaN(num)){
      this._borderInputting = true;
      // 先更新显示值，让用户可以继续输入
      this.setData({ borderPx: num }, ()=>{
        clearTimeout(this.borderTimer);
        this.borderTimer = setTimeout(() => {
          this._borderInputting = false;
          this.applyBorder(num);
        }, 600);
      });
    } else {
      // 非数字，恢复上一个有效值
      const lastVal = this._borderLastValue || this.data.borderPx || 4;
      this.setData({ borderPx: lastVal });
    }
  },
  onBorderBlur(e){
    const val = e.detail.value;
    clearTimeout(this.borderTimer);
    this._borderInputting = false;
    const num = parseInt(val, 10);
    if(isNaN(num) || val === ''){
      // 无效值，恢复到上一个有效值或默认值
      const lastVal = this._borderLastValue || 4;
      this.applyBorder(lastVal);
    } else {
      this._borderLastValue = num;
      this.applyBorder(num);
    }
  },
  onZoomInput(e){
    const val = e.detail.value;
    // 允许空字符串，允许用户删除所有内容
    if(val === ''){
      // 保存一个临时标记，表示正在输入中
      if(!this._zoomInputting) {
        this._zoomLastValue = this.data.zoomPct || 95;
      }
      this._zoomInputting = true;
      this.setData({ zoomPct: '' });
      clearTimeout(this.zoomTimer);
      return;
    }
    // 只允许数字
    const num = parseInt(val, 10);
    if(!isNaN(num)){
      this._zoomInputting = true;
      // 先更新显示值，让用户可以继续输入，不触发预览更新
      this.setData({ zoomPct: num }, ()=>{
        // 延迟更新预览，避免频繁重绘
        clearTimeout(this.zoomTimer);
        this.zoomTimer = setTimeout(() => {
          this._zoomInputting = false;
          this.applyZoom(num);
        }, 600);
      });
    } else {
      // 非数字输入，恢复到上一个有效值
      const lastVal = this._zoomLastValue || this.data.zoomPct || 95;
      this.setData({ zoomPct: lastVal });
    }
  },
  onZoomBlur(e){
    const val = e.detail.value;
    clearTimeout(this.zoomTimer);
    this._zoomInputting = false;
    const num = parseInt(val, 10);
    if(isNaN(num) || val === ''){
      // 无效值，恢复到上一个有效值或默认值
      const lastVal = this._zoomLastValue || 95;
      this.applyZoom(lastVal);
    } else {
      this._zoomLastValue = num;
      this.applyZoom(num);
    }
  },
  decBorder(){ 
    const current = parseInt(this.data.borderPx, 10) || 4;
    this.applyBorder(current - 1); 
  },
  incBorder(){ 
    const current = parseInt(this.data.borderPx, 10) || 4;
    this.applyBorder(current + 1); 
  },
  decZoom(){ 
    const current = parseInt(this.data.zoomPct, 10) || 95;
    this.applyZoom(current - 1); 
  },
  incZoom(){ 
    const current = parseInt(this.data.zoomPct, 10) || 95;
    this.applyZoom(current + 1); 
  },

  // 外部背景开关
  toggleOuterBg(e){
    const value = !!e.detail.value;
    const canvasBg = value ? this.data.outerBgColor : 'transparent';
    this.setData({ enableOuterBg: value, canvasBg }, this.redrawPreview);
  },
  // 内部边框开关
  toggleInnerBorder(e){
    const value = !!e.detail.value;
    this.setData({ enableInnerBorder: value }, this.redrawPreview);
  },

  // 选择外部背景颜色
  selectOuterColor(e){
    const color = e.currentTarget.dataset.color;
    const canvasBg = this.data.enableOuterBg ? color : this.data.canvasBg;
    this.setData({ outerBgColor: color, canvasBg }, this.redrawPreview);
  },
  // 选择内部边框颜色
  selectInnerColor(e){
    const color = e.currentTarget.dataset.color;
    this.setData({ innerBorderColor: color }, this.redrawPreview);
  },

  // 打开颜色选择器
  openColorPicker(e){
    const type = e.currentTarget.dataset.type;
    const currentColor = type === 'outer' ? this.data.outerBgColor : this.data.innerBorderColor;
    const rgb = this.hexToRgb(currentColor);
    const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
    this.setData({
      showColorPicker: true,
      colorPickerType: type,
      colorPickerMode: 'spectrum',
      currentPickerColor: currentColor,
      red: rgb.r,
      green: rgb.g,
      blue: rgb.b,
      hue: hsl.h,
      saturation: hsl.s,
      lightness: hsl.l
    });
  },
  
  // 关闭颜色选择器
  closeColorPicker(){
    this.setData({ showColorPicker: false });
  },
  
  // 切换颜色选择模式
  switchColorMode(e){
    const mode = e.currentTarget.dataset.mode;
    this.setData({ colorPickerMode: mode });
  },
  
  // 从网格选择颜色
  selectColorFromGrid(e){
    const color = e.currentTarget.dataset.color;
    const rgb = this.hexToRgb(color);
    const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
    this.setData({ 
      currentPickerColor: color,
      red: rgb.r,
      green: rgb.g,
      blue: rgb.b,
      hue: hsl.h,
      saturation: hsl.s,
      lightness: hsl.l
    });
  },
  
  // HSL滑块变化
  onHueChange(e){
    const hue = parseInt(e.detail.value);
    const color = this.hslToHex(hue, this.data.saturation, this.data.lightness);
    this.setData({ hue, currentPickerColor: color });
    this.updateRgbFromHex(color);
  },
  
  onSaturationChange(e){
    const saturation = parseInt(e.detail.value);
    const color = this.hslToHex(this.data.hue, saturation, this.data.lightness);
    this.setData({ saturation, currentPickerColor: color });
    this.updateRgbFromHex(color);
  },
  
  onLightnessChange(e){
    const lightness = parseInt(e.detail.value);
    const color = this.hslToHex(this.data.hue, this.data.saturation, lightness);
    this.setData({ lightness, currentPickerColor: color });
    this.updateRgbFromHex(color);
  },
  
  // RGB滑块变化
  onRedChange(e){
    const red = parseInt(e.detail.value);
    const color = this.rgbToHex(red, this.data.green, this.data.blue);
    this.setData({ red, currentPickerColor: color });
    this.updateHslFromHex(color);
  },
  
  onGreenChange(e){
    const green = parseInt(e.detail.value);
    const color = this.rgbToHex(this.data.red, green, this.data.blue);
    this.setData({ green, currentPickerColor: color });
    this.updateHslFromHex(color);
  },
  
  onBlueChange(e){
    const blue = parseInt(e.detail.value);
    const color = this.rgbToHex(this.data.red, this.data.green, blue);
    this.setData({ blue, currentPickerColor: color });
    this.updateHslFromHex(color);
  },
  
  // 辅助函数：更新RGB值
  updateRgbFromHex(hex){
    const rgb = this.hexToRgb(hex);
    this.setData({ red: rgb.r, green: rgb.g, blue: rgb.b });
  },
  
  // 辅助函数：更新HSL值
  updateHslFromHex(hex){
    const rgb = this.hexToRgb(hex);
    const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
    this.setData({ hue: hsl.h, saturation: hsl.s, lightness: hsl.l });
  },
  
  // HEX转RGB
  hexToRgb(hex){
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
  },
  
  // RGB转HEX
  rgbToHex(r, g, b){
    return '#' + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  },
  
  // RGB转HSL
  rgbToHsl(r, g, b){
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    
    if(max === min){
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch(max){
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  },
  
  // 确认颜色选择
  confirmColorPicker(){
    const type = this.data.colorPickerType;
    const color = this.data.currentPickerColor;
    
    if(type === 'outer'){
      const canvasBg = this.data.enableOuterBg ? color : this.data.canvasBg;
      this.setData({ 
        outerBgColor: color, 
        canvasBg,
        showColorPicker: false 
      }, this.redrawPreview);
    } else {
      this.setData({ 
        innerBorderColor: color,
        showColorPicker: false 
      }, this.redrawPreview);
    }
  },

  applyBorder(v){
    const px = Math.max(0, Math.min(200, parseInt(v,10) || 0));
    this.setData({ borderPx: px }, this.redrawPreview);
  },
  applyZoom(v){
    const pct = Math.max(30, Math.min(150, parseInt(v,10) || 95));
    this.setData({ zoomPct: pct, zoom: pct/100 }, this.redrawPreview);
  },

  // 预览画布
  initPreviewCanvas(onlyResize=false){
    const query = wx.createSelectorQuery();
    query.select('#preview').fields({ node:true, size:true }).exec(res=>{
      if (!res[0] || !res[0].node) {
        console.warn('Canvas not found, retrying...');
        setTimeout(() => this.initPreviewCanvas(onlyResize), 100);
        return;
      }
      
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      canvas.width = this.data.previewW * DPR / 2;
      canvas.height = this.data.previewH * DPR / 2;
      ctx.setTransform(1,0,0,1,0,0);
      ctx.scale(DPR/2, DPR/2);
      this.pCanvas = canvas; 
      this.pCtx = ctx;
      
      // 标记画布准备就绪
      this.setData({ _canvasReady: true });
      
      if(!onlyResize) this.redrawPreview();
    });
  },

  redrawPreview(){
    // 检查画布是否准备就绪
    if(!this.pCanvas || !this.pCtx || !this.data._canvasReady) {
      console.warn('Canvas not ready, skipping redraw');
      return;
    }
    
    if(!this.data.images.length){ 
      this.clearPreview(); 
      return; 
    }
    
    const cur = this.data.images[this.data.curIndex];
    const borderForDraw = this.data.enableInnerBorder ? this.previewBorderForShow(this.data.borderPx) : 0;
    
    // 使用防抖避免频繁重绘
    if (this._redrawTimer) {
      clearTimeout(this._redrawTimer);
    }
    
    this._redrawTimer = setTimeout(() => {
      this.drawToCanvas({
        canvas:this.pCanvas, ctx:this.pCtx,
        outW:this.data.previewW, outH:this.data.previewH,
        imgPath:cur,
        borderPx:borderForDraw,
        zoom:this.data.zoom,
        enableOuterBg: this.data.enableOuterBg,
        outerBgColor: this.data.outerBgColor,
        enableInnerBorder: this.data.enableInnerBorder,
        innerBorderColor: this.data.innerBorderColor
      });
    }, 50); // 50ms防抖延迟
  },

  clearPreview(){
    if(!this.pCtx) return;
    const ctx=this.pCtx;
    if(this.data.enableOuterBg){
      const color = this.data.outerBgColor || '#FFFFFF';
      ctx.fillStyle=color;
      ctx.fillRect(0,0,this.data.previewW,this.data.previewH);
      ctx.strokeStyle = '#e5e5e5';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5,0.5,this.data.previewW-1,this.data.previewH-1);
    } else {
      ctx.clearRect(0,0,this.data.previewW,this.data.previewH);
    }
  },

  previewBorderForShow(borderPx){
    const longOut = parseInt(this.data.sizePresets[this.data.sizeIdx],10) || 1800;
    const longPrev = this.data.previewW;
    return Math.max(1, Math.round(borderPx * longPrev / longOut));
  },

  // 绘制：外部背景→轮廓→内部边框→图片（留安全边距）
  drawToCanvas({ canvas, ctx, outW, outH, imgPath, borderPx, zoom, enableOuterBg, outerBgColor, enableInnerBorder, innerBorderColor }){
    return new Promise((resolve)=>{
      // 清除画布
      ctx.clearRect(0, 0, outW, outH);
      
      if(enableOuterBg){
        ctx.fillStyle = outerBgColor || '#FFFFFF';
        ctx.fillRect(0,0,outW,outH);
        ctx.strokeStyle = '#e5e5e5';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5,0.5,outW-1,outH-1);
      }

      // 检查图片缓存
      if (this.data._imageCache && this.data._imageCache[imgPath]) {
        const cachedImg = this.data._imageCache[imgPath];
        this.drawImageWithCorrectAspect(cachedImg, ctx, outW, outH, borderPx, zoom, enableInnerBorder, innerBorderColor);
        resolve();
        return;
      }

      const img = canvas.createImage();
      img.onload = ()=>{
        // 缓存图片
        if (!this.data._imageCache) {
          this.data._imageCache = {};
        }
        this.data._imageCache[imgPath] = img;
        
        this.drawImageWithCorrectAspect(img, ctx, outW, outH, borderPx, zoom, enableInnerBorder, innerBorderColor);
        resolve();
      };
      img.onerror = ()=>{
        ctx.fillStyle='#eee';
        ctx.fillRect(0,0,outW,outH);
        resolve();
      };
      img.src = imgPath;
    });
  },

  // 正确保持图片长宽比的绘制方法 - 使用标准算法
  drawImageWithCorrectAspect(img, ctx, outW, outH, borderPx, zoom, enableInnerBorder, innerBorderColor) {
    const iw = img.width;
    const ih = img.height;
    
    // 计算可用区域（减去边框和边距）
    const margin = Math.max(borderPx + 6, 18);
    const availW = Math.max(1, outW - 2 * margin);
    const availH = Math.max(1, outH - 2 * margin);
    
    // 标准保持比例缩放算法
    // 1. 先计算基于容器的缩放因子
    const scaleX = availW / iw;
    const scaleY = availH / ih;
    const baseScale = Math.min(scaleX, scaleY);
    
    // 2. 应用用户缩放因子
    const finalScale = baseScale * zoom;
    
    // 3. 计算最终尺寸
    let dw = iw * finalScale;
    let dh = ih * finalScale;
    
    // 4. 确保尺寸不超过可用区域（由于zoom可能>1）
    if (dw > availW || dh > availH) {
      const adjustScale = Math.min(availW / iw, availH / ih) * zoom;
      dw = iw * adjustScale;
      dh = ih * adjustScale;
    }
    
    // 确保最小尺寸
    dw = Math.max(1, Math.floor(dw));
    dh = Math.max(1, Math.floor(dh));
    
    const x = Math.floor((outW - dw) / 2);
    const y = Math.floor((outH - dh) / 2);
    
    // 绘制边框
    if (enableInnerBorder && borderPx > 0) {
      ctx.fillStyle = innerBorderColor || '#000000';
      ctx.fillRect(x - borderPx, y - borderPx, dw + 2 * borderPx, dh + 2 * borderPx);
    }
    
    // 绘制图片
    ctx.drawImage(img, x, y, dw, dh);
    
    // 详细的调试信息
    console.log(`图片原始尺寸: ${iw}x${ih}, 可用区域: ${availW}x${availH}`);
    console.log(`基础缩放: ${baseScale.toFixed(4)}, 最终缩放: ${finalScale.toFixed(4)}, 用户缩放: ${zoom}`);
    console.log(`显示尺寸: ${dw}x${dh}, 位置: ${x},${y}, 比例保持: ${(dw/dh).toFixed(4)} vs 原始: ${(iw/ih).toFixed(4)}`);
  },

  // 批量导出（按当前参数）
  async exportAll(){
    const list = this.data.images;
    if(!list.length || this.data.exporting) return;

    try{
      await this.ensureAlbumPermission();
    } catch(err){
      wx.showToast({ title: '未获得相册权限', icon: 'none' });
      return;
    }

    let [rw, rh] = parseRatio(this.data.ratioOptions[this.data.ratioIdx]);
    if(this.data.isLandscape && rw<rh) [rw,rh] = [rh,rw];
    if(!this.data.isLandscape && rw>rh) [rw,rh] = [rh,rw];

    const long = parseInt(this.data.sizePresets[this.data.sizeIdx],10) || 1800;
    let outW, outH;
    
    // 根据方向正确分配长边
    if(this.data.isLandscape) {
      // 横向：长边是宽度
      outW = long;
      outH = Math.round(long * rh / rw);
    } else {
      // 纵向：长边是高度
      outH = long;
      outW = Math.round(long * rw / rh);
    }

    this.setData({exporting:true, progressCur:0, progressTotal:list.length});

    // 创建离屏canvas
    const offscreenCanvas = wx.createOffscreenCanvas({
      type: '2d',
      width: outW,
      height: outH
    });
    const ctx = offscreenCanvas.getContext('2d');

    let exportFailed = false;
    try{
      for(let i=0;i<list.length;i++){
        await this.drawToCanvas({ 
          canvas: offscreenCanvas, 
          ctx, 
          outW, 
          outH,
          imgPath: list[i], 
          borderPx: this.data.enableInnerBorder ? this.data.borderPx : 0,
          zoom: this.data.zoom,
          enableOuterBg: this.data.enableOuterBg,
          outerBgColor: this.data.outerBgColor,
          enableInnerBorder: this.data.enableInnerBorder,
          innerBorderColor: this.data.innerBorderColor
        });

        await new Promise((resolve)=>{
          setTimeout(()=>{
            wx.canvasToTempFilePath({
              canvas: offscreenCanvas,
              fileType: this.data.enableOuterBg ? 'jpg' : 'png',
              quality: 0.95,
              destWidth: outW,
              destHeight: outH,
              success: async (r)=>{
                console.log('canvas导出成功', r.tempFilePath);
                try {
                  await this.saveToAlbum(r.tempFilePath);
                  console.log('保存到相册成功');
                } catch(saveErr) {
                  console.error('保存到相册失败', saveErr);
                  exportFailed = true;
                }
                resolve();
              },
              fail: (err)=>{
                console.error('canvas导出失败', err);
                exportFailed = true;
                wx.showToast({ title: '导出失败: ' + (err.errMsg || '未知错误'), icon: 'none', duration: 3000 });
                resolve();
              }
            });
          }, 100);
        });

        this.setData({progressCur:i+1});
      }
      if(exportFailed){
        wx.showToast({title:'部分保存失败', icon:'none'});
      } else {
        wx.showToast({title:'已全部保存'});
      }
    } finally {
      this.setData({exporting:false});
      this.initPreviewCanvas(true);
      this.redrawPreview();
    }
  },

  saveToAlbum(filePath){
    return new Promise((resolve, reject)=>{
      wx.saveImageToPhotosAlbum({
        filePath,
        success:()=>{
          console.log('相册保存成功', filePath);
          resolve();
        },
        fail:(err)=>{
          console.error('相册保存失败', err);
          if(err.errMsg && err.errMsg.indexOf('auth deny') > -1){
            wx.showModal({
              title: '需要权限',
              content: '保存图片需要相册权限，请在设置中开启',
              showCancel: false
            });
          } else {
            wx.showToast({ title: '保存失败: ' + (err.errMsg || '未知错误'), icon: 'none', duration: 3000 });
          }
          reject(err);
        }
      });
    });
  },

  // 提取图片主色调
  extractMainColors(imagePath) {
    // 创建离屏canvas用于分析颜色
    const canvas = wx.createOffscreenCanvas({
      type: '2d',
      width: 100,
      height: 100
    });
    const ctx = canvas.getContext('2d');
    
    const img = canvas.createImage();
    img.onload = () => {
      // 绘制图片到canvas
      ctx.drawImage(img, 0, 0, 100, 100);
      
      // 获取像素数据
      const imageData = ctx.getImageData(0, 0, 100, 100);
      const data = imageData.data;
      
      // 颜色统计
      const colorMap = {};
      
      // 采样像素点（每4个像素采样1个，提升性能）
      for (let i = 0; i < data.length; i += 16) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // 跳过接近白色的像素（避免背景色干扰）
        if (r > 240 && g > 240 && b > 240) continue;
        // 跳过接近黑色的像素（避免阴影干扰）
        if (r < 15 && g < 15 && b < 15) continue;
        
        // 将颜色量化到16个级别，减少颜色数量
        const quantizedR = Math.floor(r / 16) * 16;
        const quantizedG = Math.floor(g / 16) * 16;
        const quantizedB = Math.floor(b / 16) * 16;
        
        const colorKey = `${quantizedR},${quantizedG},${quantizedB}`;
        colorMap[colorKey] = (colorMap[colorKey] || 0) + 1;
      }
      
      // 找出出现次数最多的3种颜色
      const sortedColors = Object.entries(colorMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      
      // 转换为十六进制颜色值
      const mainColors = sortedColors.map(([rgb, count]) => {
        const [r, g, b] = rgb.split(',').map(Number);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      });
      
      // 更新颜色预设：基础颜色 + 图片主色调
      const baseColors = ['#000000', '#666666', '#FFFFFF'];
      const newColorPresets = [...baseColors, ...mainColors];
      
      this.setData({
        colorPresets: newColorPresets
      });
      
      console.log('提取的主色调:', mainColors);
    };
    
    img.onerror = () => {
      console.error('图片加载失败，无法提取颜色');
      // 使用默认颜色
      const defaultColors = ['#000000', '#666666', '#FFFFFF', '#FF6B6B', '#4ECDC4', '#45B7D1'];
      this.setData({
        colorPresets: defaultColors
      });
    };
    
    img.src = imagePath;
  },

  ensureAlbumPermission(){
    return new Promise((resolve, reject)=>{
      wx.getSetting({
        success:(res)=>{
          const scope = res.authSetting['scope.writePhotosAlbum'];
          if(scope === true) return resolve();
          if(scope === undefined){
            wx.authorize({
              scope:'scope.writePhotosAlbum',
              success:()=>resolve(),
              fail:()=>reject(new Error('authDenied'))
            });
            return;
          }
          wx.showModal({
            title:'需要开启权限',
            content:'保存图片需要开启相册访问权限，请在设置中授权。',
            confirmText:'去设置',
            success:(modalRes)=>{
              if(!modalRes.confirm){ reject(new Error('authDenied')); return; }
              wx.openSetting({
                success:(setting)=>{
                  if(setting.authSetting['scope.writePhotosAlbum']) resolve();
                  else reject(new Error('authDenied'));
                },
                fail:()=>reject(new Error('openSettingFail'))
              });
            },
            fail:()=>reject(new Error('modalFail'))
          });
        },
        fail:()=>reject(new Error('getSettingFail'))
      });
    });
  }
});
