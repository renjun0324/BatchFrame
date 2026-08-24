const contentSecurity = require('../../utils/contentSecurity.js');
const { INNER_FRAME_STYLES, EDGE_STRENGTHS, getInnerFrameStyle } = require('../../core/innerFrameStyles.js');
const { renderComposite } = require('../../core/compositeRenderer.js');
const { selectMaskVariant, getMaskAssetPaths } = require('../../core/innerFrameRenderer.js');
const { mergeSecurityResults, summarizeSecurity } = require('../../utils/securityPreflight.js');
const sys = wx.getWindowInfo();
const DPR = sys.pixelRatio || 1;

function parseRatio(str){
  if(!str) return [3,4];
  if(str === 'auto') return null;
  const m = str.match(/^(\d+)\s*[:：]\s*(\d+)$/);
  if(!m) return [3,4];
  return [parseInt(m[1],10), parseInt(m[2],10)];
}

function imagePath(image) {
  return typeof image === 'string' ? image : (image && image.path) || '';
}

function imageRecord(path, index) {
  const id = `image-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    frameSeed: id,
    path,
    securityStatus: 'checking',
    securityErrCode: '',
    securityTransport: '',
    securityMessage: '',
    securityCdnHost: '',
    securityCheckedAt: 0
  };
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

    borderPx: 8,
    innerFrameStyleId: 'clean-black',
    innerFrameStyles: INNER_FRAME_STYLES,
    edgeStrengthLevel: 'medium',
    edgeStrengthOptions: EDGE_STRENGTHS,
    activeTool: 'template',
    toolOptions: ['template', 'canvas', 'frame', 'image'],
    panelExpanded: true,
    panelScrollTop: 0,
    currentStyleSupportsStrength: false,
    currentStyleSupportsColor: true,
    templates: [
      { id: 'white-clean', name: '白底经典', outerBgColor: '#FFFFFF', styleId: 'clean-black', enableOuterBg: true },
      { id: 'white-scan', name: '白底扫描', outerBgColor: '#FFFFFF', styleId: 'full-frame-scan', enableOuterBg: true },
      { id: 'white-gate', name: '白底片门', outerBgColor: '#FFFFFF', styleId: 'film-gate', enableOuterBg: true },
      { id: 'white-negative', name: '白底负片', outerBgColor: '#FFFFFF', styleId: 'negative-35mm', enableOuterBg: true },
      { id: 'white-emulsion', name: '白底乳剂', outerBgColor: '#FFFFFF', styleId: 'emulsion-damage', enableOuterBg: true },
      { id: 'black-clean', name: '黑底经典', outerBgColor: '#000000', styleId: 'clean-black', enableOuterBg: true },
      { id: 'white-none', name: '白底无框', outerBgColor: '#FFFFFF', styleId: 'none', enableOuterBg: true }
    ],
    zoom: 0.95,
    zoomPct: 95,

    // 外部白底和内部边框控制
    enableOuterBg: true,        // 是否显示外部背景
    outerBgColor: '#FFFFFF',    // 外部背景颜色
    enableInnerBorder: true,    // 是否显示内部边框
    innerBorderColor: '#000000', // 内部边框颜色

    // 后台异步检测状态
    isChecking: false,          // 是否正在检测
    checkingProgress: 0,        // 检测进度
    checkingTotal: 0,           // 总数
    
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
    displayWidth: 300,
    displayHeight: 255,

    exporting:false, progressCur:0, progressTotal:0,

    _canvasReady: false, // 画布准备状态
    canvasReady: false,
    imageReady: false,
  },

  onReady(){
    this._imageCache = Object.create(null);
    this._imageCacheOrder = [];
    this._frameMaskCache = Object.create(null);
    this._renderToken = 0;
    this._frameWidths = {
      'clean-black': 8,
      'full-frame-scan': 12,
      'film-gate': 24,
      'negative-35mm': 52,
      'medium-format-120': 64,
      'emulsion-damage': 18
    };
    this.canvasReady = false;
    this.imageReady = false;
    this.pendingRender = false;
    this.initPreviewCanvas();
    this.updatePreviewSize();
    this.generateColorGrid();
    this.measurePreviewViewport();
    if (wx.onWindowResize) {
      this._windowResizeHandler = () => this.measurePreviewViewport();
      wx.onWindowResize(this._windowResizeHandler);
    }
  },

  onUnload(){
    this._securityCheckId = (this._securityCheckId || 0) + 1;
    this.canvasReady = false;
    this.pendingRender = false;
    if (this._canvasRetryTimer) clearTimeout(this._canvasRetryTimer);
    if (this._redrawTimer) clearTimeout(this._redrawTimer);
    if (this.borderTimer) clearTimeout(this.borderTimer);
    if (this.zoomTimer) clearTimeout(this.zoomTimer);
    if (wx.offWindowResize && this._windowResizeHandler) wx.offWindowResize(this._windowResizeHandler);
    this._renderToken = (this._renderToken || 0) + 1;
    this._imageCache = Object.create(null);
    this._imageCacheOrder = [];
    this._frameMaskCache = Object.create(null);
    if (this._imageInfoCache) this._imageInfoCache = {};
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
      count:9, sizeType:['original'], sourceType:['album','camera'],
      success: (res)=>{
        const paths = res.tempFilePaths || res.tempFiles?.map(f=>f.tempFilePath) || [];
        if(paths.length === 0) return;
        const checkId = (this._securityCheckId || 0) + 1;
        this._securityCheckId = checkId;
        const images = paths.map(imageRecord);
        this.setData({
          images,
          curIndex: 0,
          isChecking: true,
          checkingProgress: 0,
          checkingTotal: paths.length
        }, () => {
          this.imageReady = false;
          this.pendingRender = true;
          this.extractMainColors(paths[0]);
          this.updatePreviewSize().then(() => this.redrawPreview());
        });
        this._backgroundSecurityPromise = this.backgroundCheckImages(paths, checkId);
      }
    });
  },

  // 安全检测在后台运行；只有导出前才会拦截未通过的图片。
  async backgroundCheckImages(paths, checkId) {
    try {
      const response = await contentSecurity.checkMultipleImages(
        paths,
        (current, total) => {
          if (this._securityCheckId !== checkId) return;
          this.setData({
            checkingProgress: current,
            checkingTotal: total
          });
        }
      );
      if (this._securityCheckId !== checkId) return;
      const mergedImages = mergeSecurityResults(
        this.data.images,
        response && response.results,
        Date.now()
      );
      await this.setDataAsync({
        images: mergedImages,
        isChecking: false
      });
      return response;
    } catch (err) {
      if (this._securityCheckId !== checkId) return;
      console.error('[content-security] background batch failed', err);
      await this.setDataAsync({ isChecking: false });
      return { results: [] };
    }
  },

  applySecurityResult(result, checkId) {
    if (!result || this._securityCheckId !== checkId) return;
    const mergedImages = mergeSecurityResults(this.data.images, [result], Date.now());
    this.setData({ images: mergedImages });
    const index = this.data.images.findIndex(item => imagePath(item) === result.path);
    if (index < 0) return;
    console.info('[content-security] image status', {
      id: this.data.images[index].id,
      path: result.path,
      status: result.status,
      errCode: result.errCode || null,
      transport: result.transport || null
    });
  },

  setDataAsync(patch) {
    return new Promise(resolve => this.setData(patch, resolve));
  },

  logSecurityBlock(summary) {
    console.error('[content-security] export blocked', {
      unresolved: summary.unresolved.map(({ item, index }) => ({
        id: item.id,
        index,
        status: item.securityStatus,
        errCode: item.securityErrCode || null,
        transport: item.securityTransport || null,
        cdnHost: item.securityCdnHost || null,
        message: item.securityMessage || null
      }))
    });
  },

  async ensureSecurityBeforeExport() {
    if (this._backgroundSecurityPromise) {
      const backgroundPromise = this._backgroundSecurityPromise;
      try {
        await backgroundPromise;
      } catch (err) {
        console.error('[content-security] background wait failed', err);
      }
    }

    let current = this.data.images || [];
    let summary = summarizeSecurity(current);
    if (summary.rejected.length) {
      this.logSecurityBlock(summary);
      await this.showSecurityBlock(summary.rejected.map(entry => entry.item));
      return false;
    }

    const retryItems = summary.unresolved.map(entry => entry.item);
    if (retryItems.length) {
      const retryPaths = retryItems.map(imagePath);
      const retryId = (this._securityCheckId || 0) + 1;
      this._securityCheckId = retryId;
      await this.setDataAsync({ isChecking: true });
      let retryResponse = { results: [] };
      try {
        retryResponse = await contentSecurity.checkMultipleImages(retryPaths);
      } catch (err) {
        console.error('[content-security] export retry failed', {
          errCode: err && (err.errCode || err.code) || 'SECURITY_CHECK_ERROR',
          message: err && (err.errMsg || err.message)
        });
      }
      if (this._securityCheckId !== retryId) return false;
      current = mergeSecurityResults(
        this.data.images,
        retryResponse.results || [],
        Date.now()
      );
      await this.setDataAsync({
        images: current,
        isChecking: false
      });
      summary = summarizeSecurity(current);
    }

    if (summary.rejected.length) {
      this.logSecurityBlock(summary);
      await this.showSecurityBlock(summary.rejected.map(entry => entry.item));
      return false;
    }
    if (summary.unresolved.length) {
      this.logSecurityBlock(summary);
      wx.showModal({
        title: '暂时无法导出',
        content: '检测服务暂时不可用，请稍后重试。图片仍可继续编辑。',
        showCancel: false
      });
      return false;
    }
    return true;
  },

  showSecurityBlock(items) {
    const positions = items.map(item => this.data.images.findIndex(current => current.id === item.id) + 1).join('、');
    return new Promise(resolve => {
      wx.showModal({
        title: '请移除未通过的图片',
        content: `第 ${positions} 张图片未通过安全检测，请删除后再导出。`,
        showCancel: false,
        success: resolve,
        fail: resolve
      });
    });
  },
  onPickIndex(e){ 
    const idx = +e.currentTarget.dataset.idx || 0; 
    this.setData({curIndex:idx}, ()=>{
      // 分析当前选中图片的主色调
      if(this.data.images.length > idx){
        this.extractMainColors(imagePath(this.data.images[idx]));
      }
      this.updatePreviewSize().then(()=> this.redrawPreview());
    });
  },

  onToolTap(e){
    const tool = e.currentTarget.dataset.tool;
    if (!tool) return;
    this.setData({ activeTool: tool, panelExpanded: true, panelScrollTop: 0 });
  },

  togglePanel(){
    this.setData({ panelExpanded: !this.data.panelExpanded }, () => this.measurePreviewViewport());
  },

  measurePreviewViewport(){
    const query = wx.createSelectorQuery();
    query.select('.preview-stage').boundingClientRect(rect => {
      if (!rect || !rect.width || !rect.height) return;
      const logicalW = Math.max(1, this.data.previewW || 1);
      const logicalH = Math.max(1, this.data.previewH || 1);
      const availableWidth = Math.max(120, rect.width - 24);
      const availableHeight = Math.max(120, rect.height - 24);
      const scale = Math.min(availableWidth / logicalW, availableHeight / logicalH);
      this.setData({
        displayWidth: Math.max(1, Math.floor(logicalW * scale)),
        displayHeight: Math.max(1, Math.floor(logicalH * scale))
      });
    }).exec();
  },

  onTemplateTap(e){
    const template = (this.data.templates || []).find(item => item.id === e.currentTarget.dataset.templateId);
    if (!template) return;
    const style = getInnerFrameStyle(template.styleId);
    const width = template.styleId === 'none' ? 0 : (this._frameWidths[template.styleId] || style.widthAt1800);
    const canvasBg = template.enableOuterBg ? template.outerBgColor : 'transparent';
    this.setData({
      outerBgColor: template.outerBgColor,
      canvasBg,
      enableOuterBg: template.enableOuterBg,
      innerFrameStyleId: template.styleId,
      enableInnerBorder: template.styleId !== 'none',
      borderPx: width,
      currentStyleSupportsStrength: !!style.supportsStrength,
      currentStyleSupportsColor: !!style.supportsColor
    }, this.redrawPreview);
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
          this.measurePreviewViewport();
          resolve();
        });
      });
    };

    if(ratioValue === 'auto'){
      const cur = imagePath(this.data.images[this.data.curIndex]);
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
        this._borderLastValue = this.data.borderPx || 8;
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
      const lastVal = this._borderLastValue || this.data.borderPx || 8;
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
      const lastVal = this._borderLastValue || 8;
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
    const current = parseInt(this.data.borderPx, 10) || 8;
    this.applyBorder(current - 1); 
  },
  incBorder(){ 
    const current = parseInt(this.data.borderPx, 10) || 8;
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

  onInnerFrameStyleTap(e){
    const styleId = e.currentTarget.dataset.styleId;
    const style = getInnerFrameStyle(styleId);
    if (this.data.innerFrameStyleId !== 'none' && this.data.innerFrameStyleId) {
      this._frameWidths[this.data.innerFrameStyleId] = Math.max(0, parseInt(this.data.borderPx, 10) || 0);
    }
    const width = style.id === 'none' ? 0 : (this._frameWidths[style.id] || style.widthAt1800);
    this.setData({
      innerFrameStyleId: style.id,
      borderPx: width,
      enableInnerBorder: style.id !== 'none',
      currentStyleSupportsStrength: !!style.supportsStrength,
      currentStyleSupportsColor: !!style.supportsColor
    }, this.redrawPreview);
  },

  onEdgeStrengthTap(e){
    this.setData({ edgeStrengthLevel: e.currentTarget.dataset.level }, this.redrawPreview);
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
    const patch = { enableInnerBorder: value };
    if (value && this.data.innerFrameStyleId === 'none') {
      const style = getInnerFrameStyle('clean-black');
      patch.innerFrameStyleId = style.id;
      patch.borderPx = style.widthAt1800;
      patch.currentStyleSupportsStrength = !!style.supportsStrength;
      patch.currentStyleSupportsColor = !!style.supportsColor;
    }
    this.setData(patch, this.redrawPreview);
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
    if (this.data.innerFrameStyleId && this.data.innerFrameStyleId !== 'none') {
      this._frameWidths[this.data.innerFrameStyleId] = px;
    }
    this.setData({ borderPx: px }, this.redrawPreview);
  },
  applyZoom(v){
    const pct = Math.max(30, Math.min(150, parseInt(v,10) || 95));
    this.setData({ zoomPct: pct, zoom: pct/100 }, this.redrawPreview);
  },

  // 预览画布
  initPreviewCanvas(onlyResize=false){
    if (this._canvasRetryTimer) clearTimeout(this._canvasRetryTimer);
    this._canvasRetryTimer = null;
    this.canvasReady = false;
    const query = wx.createSelectorQuery();
    query.select('#preview').fields({ node:true, size:true }).exec(res=>{
      if (!res[0] || !res[0].node) {
        console.warn('Canvas not found, retrying...');
        this.pendingRender = true;
        this._canvasRetryTimer = setTimeout(() => {
          this._canvasRetryTimer = null;
          this.initPreviewCanvas(onlyResize);
        }, 100);
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
      this.canvasReady = true;
      
      // 标记画布准备就绪
      this.setData({ _canvasReady: true, canvasReady: true }, () => {
        if (this.pendingRender || this.data.images.length) this.redrawPreview();
      });
    });
  },

  redrawPreview(){
    // 检查画布是否准备就绪
    if(!this.pCanvas || !this.pCtx || !this.canvasReady || !this.data._canvasReady) {
      console.warn('Canvas not ready, skipping redraw');
      this.pendingRender = true;
      return;
    }
    
    if(!this.data.images.length){ 
      this.pendingRender = false;
      this.clearPreview(); 
      return; 
    }
    
    const currentImage = this.data.images[this.data.curIndex];
    const cur = imagePath(currentImage);
    const renderToken = (this._renderToken || 0) + 1;
    this._renderToken = renderToken;
    
    // 使用防抖避免频繁重绘
    if (this._redrawTimer) {
      clearTimeout(this._redrawTimer);
    }
    
    this.pendingRender = false;
    this._redrawTimer = setTimeout(() => {
      this.drawToCanvas({
        canvas:this.pCanvas, ctx:this.pCtx,
        outW:this.data.previewW, outH:this.data.previewH,
        imgPath:cur,
        imageId: currentImage && currentImage.id,
        imageSeed: currentImage && (currentImage.frameSeed || currentImage.id),
        renderToken,
        borderPx:this.data.borderPx,
        zoom:this.data.zoom,
        enableOuterBg: this.data.enableOuterBg,
        outerBgColor: this.data.outerBgColor,
        enableInnerBorder: this.data.enableInnerBorder,
        innerBorderColor: this.data.innerBorderColor,
        innerFrameStyleId: this.data.innerFrameStyleId,
        edgeStrengthLevel: this.data.edgeStrengthLevel
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

  loadFrameMasks(canvas, styleId, seed, strengthLevel = 'medium'){
    const variant = selectMaskVariant(styleId, seed || 'default', strengthLevel);
    const paths = getMaskAssetPaths(styleId, variant, strengthLevel);
    if (!paths) return Promise.resolve(null);
    const cacheKey = `${styleId}:${strengthLevel}:${variant}`;
    if (this._frameMaskCache && this._frameMaskCache[cacheKey]) {
      return Promise.resolve(this._frameMaskCache[cacheKey]);
    }
    const segments = Object.keys(paths);
    return Promise.all(segments.map(segment => new Promise((resolve, reject) => {
      const mask = canvas.createImage();
      mask.onload = () => resolve([segment, mask]);
      mask.onerror = error => reject(error);
      mask.src = paths[segment];
    }))).then(entries => {
      const masks = entries.reduce((result, entry) => {
        result[entry[0]] = entry[1];
        return result;
      }, {});
      if (this._frameMaskCache) this._frameMaskCache[cacheKey] = masks;
      return masks;
    });
  },

  // 预览与导出共用的图片加载适配层；实际构图由 core/compositeRenderer 完成。
  drawToCanvas({
    canvas,
    ctx,
    outW,
    outH,
    imgPath,
    imageId,
    imageSeed,
    renderToken,
    borderPx,
    zoom,
    enableOuterBg,
    outerBgColor,
    enableInnerBorder,
    innerBorderColor,
    innerFrameStyleId,
    edgeStrengthLevel
  }){
    return new Promise((resolve)=>{
      const isCurrent = () => !renderToken || renderToken === this._renderToken;
      const draw = async image => {
        if (!isCurrent()) {
          resolve();
          return;
        }
        let maskImages = null;
        try {
          maskImages = await this.loadFrameMasks(canvas, innerFrameStyleId, imageSeed || imageId || imgPath, edgeStrengthLevel);
        } catch (error) {
          console.warn('[frame-mask] asset load failed, falling back to clean frame', error);
        }
        if (!isCurrent()) {
          resolve();
          return;
        }
        this.imageReady = true;
        this.setData({ imageReady: true });
        renderComposite({
          ctx,
          outWidth: outW,
          outHeight: outH,
          image,
          imageId,
          imageSeed,
          layoutSettings: { zoom, fit: 'contain', layoutPadding: 18 },
          outerBackgroundSettings: { enabled: enableOuterBg, color: outerBgColor },
          innerFrameSettings: {
            enabled: enableInnerBorder,
            styleId: innerFrameStyleId,
            widthAt1800: borderPx,
            color: innerBorderColor,
            strengthLevel: edgeStrengthLevel,
            maskImages,
            backgroundColor: enableOuterBg ? outerBgColor : 'transparent'
          }
        });
        resolve();
      };

      if (this._imageCache && this._imageCache[imgPath]) {
        this._imageCacheOrder = (this._imageCacheOrder || []).filter(key => key !== imgPath);
        this._imageCacheOrder.push(imgPath);
        draw(this._imageCache[imgPath]);
        return;
      }

      const img = canvas.createImage();
      img.onload = ()=>{
        if (this._imageCache) {
          this._imageCache[imgPath] = img;
          this._imageCacheOrder = this._imageCacheOrder || [];
          this._imageCacheOrder = this._imageCacheOrder.filter(key => key !== imgPath);
          this._imageCacheOrder.push(imgPath);
          while (this._imageCacheOrder.length > 12) {
            const expired = this._imageCacheOrder.shift();
            delete this._imageCache[expired];
          }
        }
        draw(img);
      };
      img.onerror = ()=>{
        if (isCurrent()) {
          this.imageReady = false;
          this.setData({ imageReady: false });
          ctx.fillStyle='#eee';
          ctx.fillRect(0,0,outW,outH);
        }
        resolve();
      };
      img.src = imgPath;
    });
  },

  // 批量导出（按当前参数）
  async exportAll(){
    if(!this.data.images.length || this.data.exporting || this._exportSecurityBusy) return;
    this._exportSecurityBusy = true;
    let securityReady = false;
    try {
      securityReady = await this.ensureSecurityBeforeExport();
    } catch (err) {
      console.error('[content-security] export preflight failed', err);
      wx.showModal({ title: '暂时无法导出', content: '检测服务暂时不可用，请稍后重试。图片仍可继续编辑。', showCancel: false });
    }
    if (!securityReady) {
      this._exportSecurityBusy = false;
      return;
    }
    const imageRecords = this.data.images.slice();
    const list = imageRecords.map(imagePath);

    try{
      await this.ensureAlbumPermission();
    } catch(err){
      wx.showToast({ title: '未获得相册权限', icon: 'none' });
      this._exportSecurityBusy = false;
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
        const record = imageRecords[i] || { path: list[i], id: list[i], frameSeed: list[i] };
        await this.drawToCanvas({ 
          canvas: offscreenCanvas, 
          ctx, 
          outW, 
          outH,
          imgPath: list[i], 
          imageId: record.id,
          imageSeed: record.frameSeed || record.id || list[i],
          borderPx: this.data.enableInnerBorder ? this.data.borderPx : 0,
          zoom: this.data.zoom,
          enableOuterBg: this.data.enableOuterBg,
          outerBgColor: this.data.outerBgColor,
          enableInnerBorder: this.data.enableInnerBorder,
          innerBorderColor: this.data.innerBorderColor,
          innerFrameStyleId: this.data.innerFrameStyleId,
          edgeStrengthLevel: this.data.edgeStrengthLevel
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
      this._exportSecurityBusy = false;
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

  // 检查相册权限状态
  checkAlbumPermission(){
    return new Promise((resolve, reject) => {
      wx.getSetting({
        success: (res) => {
          const scope = res.authSetting['scope.writePhotosAlbum'];
          resolve(scope);
        },
        fail: () => reject(new Error('getSettingFail'))
      });
    });
  },

  // 使用按钮触发权限请求（推荐方式）
  requestAlbumPermission(){
    return new Promise((resolve, reject) => {
      wx.authorize({
        scope: 'scope.writePhotosAlbum',
        success: () => {
          console.log('相册权限授权成功');
          resolve(true);
        },
        fail: (err) => {
          console.log('相册权限授权失败', err);
          // 如果用户拒绝，记录状态但不立即引导去设置
          resolve(false);
        }
      });
    });
  },

  // 引导用户去设置页开启权限
  guideToOpenSetting(){
    return new Promise((resolve, reject) => {
      wx.showModal({
        title: '需要相册权限',
        content: '保存图片到相册需要您的授权，请前往设置开启相册权限。',
        confirmText: '去设置',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            wx.openSetting({
              success: (settingRes) => {
                if (settingRes.authSetting['scope.writePhotosAlbum']) {
                  resolve(true);
                } else {
                  resolve(false);
                }
              },
              fail: () => reject(new Error('openSettingFail'))
            });
          } else {
            resolve(false);
          }
        },
        fail: () => reject(new Error('modalFail'))
      });
    });
  },

  // 优化的权限获取流程
  ensureAlbumPermission(){
    return new Promise(async (resolve, reject) => {
      try {
        // 1. 先检查当前权限状态
        const permissionStatus = await this.checkAlbumPermission();

        if (permissionStatus === true) {
          // 已经授权，直接通过
          resolve();
          return;
        }

        if (permissionStatus === false) {
          // 用户之前拒绝过，引导去设置页
          const settingResult = await this.guideToOpenSetting();
          if (settingResult) {
            resolve();
          } else {
            reject(new Error('authDenied'));
          }
          return;
        }

        // 权限状态为undefined，首次使用，使用按钮触发授权
        // 这里我们直接调用authorize，因为用户点击了导出按钮
        const authResult = await this.requestAlbumPermission();
        if (authResult) {
          resolve();
        } else {
          // 用户拒绝授权，提供友好提示但不强制跳转设置
          wx.showToast({
            title: '未获得相册权限',
            icon: 'none',
            duration: 2000
          });
          reject(new Error('authDenied'));
        }
      } catch (error) {
        console.error('权限检查失败', error);
        reject(error);
      }
    });
  },

  // 在用户首次使用保存功能时请求权限（可选方案）
  preRequestPermission(){
    // 可以在页面加载时或用户首次进入时调用
    this.checkAlbumPermission().then(status => {
      if (status === undefined) {
        // 首次使用，可以显示权限说明但不立即请求
        console.log('首次使用，可以显示权限引导');
      }
    });
  }
});
