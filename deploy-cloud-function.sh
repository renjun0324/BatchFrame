#!/bin/bash
# 云函数部署脚本

echo "======================================"
echo "  云函数部署脚本"
echo "======================================"
echo ""

# 检查是否在正确的目录
if [ ! -d "cloudfunctions/checkImage" ]; then
    echo "❌ 错误：未找到 cloudfunctions/checkImage 目录"
    echo "请在项目根目录下运行此脚本"
    exit 1
fi

echo "✅ 找到云函数目录"
echo ""

# 显示文件列表
echo "📁 云函数文件："
ls -lh cloudfunctions/checkImage/
echo ""

# 显示配置
echo "📋 配置文件内容："
echo "=================="
cat cloudfunctions/checkImage/config.json
echo ""
echo "=================="
echo ""

echo "⚠️  请在微信开发者工具中执行以下操作："
echo ""
echo "1. 点击顶部工具栏的「云开发」按钮"
echo "2. 如果未开通，点击「开通」按钮"
echo "3. 等待云开发环境初始化完成"
echo "4. 在左侧目录树中，右键点击 cloudfunctions/checkImage 文件夹"
echo "5. 选择「上传并部署：云端安装依赖」"
echo "6. 等待部署完成"
echo ""
echo "======================================"
echo "  部署完成后，请重新编译小程序测试"
echo "======================================"

