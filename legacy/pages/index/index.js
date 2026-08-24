// Legacy compatibility entry. The only supported editor is pages/frame/frame.
Page({
  onReady() {
    wx.redirectTo({ url: '/pages/frame/frame' });
  }
});
