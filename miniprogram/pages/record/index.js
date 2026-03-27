// record/index.js
Page({
  data: {
    inputValue: '',
    records: []
  },

  onLoad() {
    this.getRecords();
  },

  inputContent(e) {
    this.setData({
      inputValue: e.detail.value
    });
  },

  saveInput() {
    const content = this.data.inputValue.trim();
    if (!content) {
      wx.showToast({
        title: '请输入内容',
        icon: 'none'
      });
      return;
    }
    this.saveRecord(content);
    // 清空输入框
    this.setData({
      inputValue: ''
    });
  },

  saveRecord(content) {
    const db = wx.cloud.database();
    const now = new Date();
    const createTime = now.toLocaleString();
    
    db.collection('records').add({
      data: {
        content: content,
        createTime: createTime,
        date: now.toDateString()
      },
      success: function(res) {
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        });
        this.getRecords();
      }.bind(this),
      fail: function(res) {
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        });
      }
    });
  },

  getRecords() {
    const db = wx.cloud.database();
    
    db.collection('records').orderBy('createTime', 'desc').get({
      success: function(res) {
        this.setData({
          records: res.data
        });
      }.bind(this),
      fail: function(res) {
        console.error('获取记录失败', res);
      }
    });
  },

  getDailySummary() {
    wx.showLoading({ title: '生成日记中...' });
    const today = new Date().toDateString();
    
    // 调用云函数生成日记
    wx.cloud.callFunction({
      name: 'generateDiary',
      data: {
        date: today
      },
      success: function(res) {
        wx.hideLoading();
        if (res.result && res.result.success) {
          wx.showModal({
            title: '每日日记',
            content: res.result.diary,
            showCancel: false
          });
        } else {
          wx.showToast({
            title: res.result.message || '生成日记失败',
            icon: 'none'
          });
        }
      },
      fail: function(res) {
        wx.hideLoading();
        wx.showToast({
          title: '生成日记失败',
          icon: 'none'
        });
      }
    });
  },

  getWeeklySummary() {
    wx.showLoading({ title: '生成周报中...' });
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // 调用云函数生成周报
    wx.cloud.callFunction({
      name: 'generateWeekly',
      data: {
        startDate: weekAgo.toLocaleString(),
        endDate: now.toLocaleString()
      },
      success: function(res) {
        wx.hideLoading();
        if (res.result && res.result.success) {
          wx.showModal({
            title: '每周周报',
            content: res.result.weekly,
            showCancel: false
          });
        } else {
          wx.showToast({
            title: res.result.message || '生成周报失败',
            icon: 'none'
          });
        }
      },
      fail: function(res) {
        wx.hideLoading();
        wx.showToast({
          title: '生成周报失败',
          icon: 'none'
        });
      }
    });
  }
});