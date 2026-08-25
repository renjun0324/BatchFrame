Page({
  data: {
    topInset: 24
  },

  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ topInset: Math.max(24, (info.statusBarHeight || 0) + 20) });
  },

  goToFrame() {
    wx.navigateTo({
      url: '/pages/frame/frame'
    });
  }
});
