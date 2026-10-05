/* ============================================================
 * games.js — 7 个游戏配置（3D 版）
 * 元数据（名称/模式/颜色/文案）+ 3D 构建器引用
 * ============================================================ */
import { buildWatermelon, buildOrange, buildPineappleRing, buildGummyBear, buildDice, buildSquid, buildMelon, buildMoldShape } from './fruits.js';

const MELON_COLORS = [
  { id: 'red', name: '经典红瓜', flesh: '#f2263a', fleshDark: '#c11126', dot: '#f2263a' },
  { id: 'yellow', name: '阳光黄瓜', flesh: '#f5b81f', fleshDark: '#d1920a', dot: '#f5b81f' },
  { id: 'pink', name: '蜜桃粉瓜', flesh: '#f7a8b8', fleshDark: '#e07f95', dot: '#f7a8b8' },
];

export const GAMES = {
  '01': {
    num: '01', name: '西瓜果冻', script: 'A piece of summer', tag: '捏切 · 解压',
    desc: '捏住一块夏天，想怎么切都可以。', baseMass: 78, cuttable: true,
    dataLabels: ['果冻块数', '质量', '体积保持', '运动能量'], dataUnits: ['块', '克', '%', '微焦'],
    tips: { pinch: '💡 <b>捏一捏</b> 按住果冻拖动，加入第二根手指可扭转。', cut: '💡 <b>切一切</b> 划过果冻，松手落刀。小块也可以继续切。' },
    modes: [{ id: 'pinch', name: '捏一捏', icon: 'hand' }, { id: 'cut', name: '切一切', icon: 'knife' }],
    colors: MELON_COLORS, defaultColor: 'red',
    actions: [{ id: 'shake', name: '晃一下', primary: true }, { id: 'reset', name: '↺ 重来' }, { id: 'pause', name: '⏸ 暂停' }],
    tabs: ['操作', '手感', '颜色', '特效'],
    build: (colorId) => {
      const sc = MELON_COLORS.find(c => c.id === colorId) || MELON_COLORS[0];
      return buildWatermelon(sc.flesh, sc.fleshDark);
    },
  },
  '02': {
    num: '02', name: '菠萝圈', script: 'A ring of sunshine', tag: '拉伸 · 翻面',
    desc: '拉住内圈向外扯，松手看它回弹。', baseMass: 64,
    dataLabels: ['模拟质量', '体积保持', '运动能量'], dataUnits: ['克', '%', '微焦'],
    tips: { main: '💡 <b>拉一拉</b> 按住菠萝圈向外扯，松手看它回弹。点「轻轻弹一下」戳它。' },
    modes: [{ id: 'flick', name: '轻轻弹一下', icon: 'poke' }, { id: 'flip', name: '翻个面', icon: 'flip' }, { id: 'reset', name: '重来', icon: 'reset' }],
    actions: [{ id: 'pause', name: '⏸ 暂停' }, { id: 'recenter', name: '📐 回正视角' }],
    tabs: ['操作', '手感', '特效'],
    build: () => buildPineappleRing(),
  },
  '03': {
    num: '03', name: '软糖小熊', script: 'A chewy little friend', tag: '捏捏 · 翻面',
    desc: '捏捏小熊的脸，翻个面看看。', baseMass: 52,
    dataLabels: ['模拟质量', '体积保持', '运动能量'], dataUnits: ['克', '%', '微焦'],
    tips: { main: '💡 <b>捏一捏</b> 按住小熊拖动拉伸，松手回弹。' },
    modes: [{ id: 'pinch', name: '捏一捏', icon: 'hand' }, { id: 'flip', name: '翻个面', icon: 'flip' }],
    colors: [
      { id: 'orange', name: '橙子熊', dot: '#f6911f' },
      { id: 'straw', name: '草莓熊', dot: '#f78ba4' },
      { id: 'lime', name: '青柠熊', dot: '#9ed65e' },
    ], defaultColor: 'orange',
    actions: [{ id: 'shake', name: '晃一下', primary: true }, { id: 'reset', name: '↺ 重来' }, { id: 'pause', name: '⏸ 暂停' }],
    tabs: ['操作', '手感', '颜色', '特效'],
    build: (colorId) => {
      const map = { orange: '#f6911f', straw: '#f78ba4', lime: '#9ed65e' };
      return buildGummyBear(map[colorId] || map.orange);
    },
  },
  '04': {
    num: '04', name: '果冻骰子', script: 'Shake it, jelly', tag: '掷物 · 摇一摇',
    desc: '点一下，把运气摇出来。', baseMass: 40, dice: true,
    dataLabels: ['投掷次数', '体积保持', '运动能量'], dataUnits: ['次', '%', '微焦'],
    tips: { main: '💡 <b>摇一摇</b> 点击骰子或按钮，看它弹跳定格。' },
    modes: [],
    actions: [{ id: 'roll', name: '🎲 摇一摇', primary: true }, { id: 'reset', name: '↺ 重来' }, { id: 'pause', name: '⏸ 暂停' }],
    tabs: ['操作', '手感', '特效'],
    build: () => buildDice(5),
  },
  '05': {
    num: '05', name: '橘子切切', script: 'Little slices of golden light', tag: '形状 · 切切',
    desc: '揉捏、切一刀，还能套模具。', baseMass: 105, cuttable: true, cutCount: true,
    dataLabels: ['模拟质量', '体积保持', '运动能量'], dataUnits: ['克', '%', '微焦'],
    tips: { main: '💡 <b>揉捏</b> 按住果冻拉伸；双指扭转。拖动空白处旋转视角。' },
    modes: [{ id: 'knead', name: '揉捏', icon: 'hand' }, { id: 'cut', name: '切一刀', icon: 'knife' }, { id: 'mold', name: '形状模具', icon: 'star' }],
    molds: [{ id: 'star', name: '星星', icon: '⭐' }, { id: 'circle', name: '圆形', icon: '⭕' }, { id: 'heart', name: '爱心', icon: '💗' }],
    colors: [
      { id: 'orange', name: '蜜柑橙', dot: '#f68c1f' },
      { id: 'grapefruit', name: '西柚粉', dot: '#f78ba4' },
      { id: 'lemon', name: '柠檬黄', dot: '#f7d54e' },
    ], defaultColor: 'orange',
    actions: [{ id: 'shake', name: '晃一晃', primary: true }, { id: 'reset', name: '重新开始' }, { id: 'pause', name: '⏸ 暂停' }],
    tabs: ['操作', '手感', '颜色', '特效'],
    build: () => buildOrange(),
    buildMold: (kind, colorId) => {
      const map = { orange: '#f68c1f', grapefruit: '#f78ba4', lemon: '#f7d54e' };
      return buildMoldShape(kind, map[colorId] || map.orange);
    },
  },
  '06': {
    num: '06', name: '果冻鱿鱼', script: 'A quiet ocean dream', tag: '触手 · 抖动',
    desc: '戳戳小鱿鱼，看触手跳舞。', baseMass: 48, squid: true,
    dataLabels: ['模拟质量', '体积保持', '运动能量'], dataUnits: ['克', '%', '微焦'],
    tips: { main: '💡 <b>戳一戳</b> 点触小鱿鱼，触手会抖动；按住可以拉扯。' },
    modes: [{ id: 'poke', name: '戳一戳', icon: 'poke' }, { id: 'flip', name: '翻个面', icon: 'flip' }],
    actions: [{ id: 'shake', name: '晃一下', primary: true }, { id: 'reset', name: '↺ 重来' }, { id: 'pause', name: '⏸ 暂停' }],
    tabs: ['操作', '手感', '特效'],
    build: () => buildSquid(),
  },
  '07': {
    num: '07', name: '西瓜', script: 'How much pressure?', tag: '橡皮筋 · 承压',
    desc: '一根根套上橡皮筋，看它能撑住几根。', baseMass: 1200, rubber: true,
    dataLabels: ['橡皮筋', '体积保持', '运动能量'], dataUnits: ['根', '%', '微焦'],
    tips: { main: '💡 <b>套皮筋</b> 点击「加一根橡皮筋」，看西瓜被勒紧。还能撑住哦。' },
    modes: [],
    actions: [
      { id: 'addband', name: '＋ 加一根橡皮筋', primary: true },
      { id: 'reset', name: '↺ 重新开始' },
      { id: 'recenter', name: '📐 回正视角' },
    ],
    tabs: ['操作', '手感', '特效'],
    build: () => buildMelon(),
  },
};

export const GAME_ORDER = ['01','02','03','04','05','06','07'];
