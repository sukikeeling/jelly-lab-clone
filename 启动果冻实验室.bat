@echo off
chcp 65001 >nul
title 果冻实验室 Jelly Lab (Three.js + 60Hz XPBD)
echo ===================================================
echo 🌸 正在启动果冻实验室 (Soft Matter Jelly Lab) ...
echo 物理引擎: 稳健 60FPS / 60Hz XPBD 晶格 + 384 四面体体积守恒
echo 材质渲染: Three.js MeshPhysicalMaterial 色散透光
echo 访问地址: http://localhost:3000/index.html
echo ===================================================
start http://localhost:3000/index.html
python -m http.server 3000 --directory "%~dp0"
pause
