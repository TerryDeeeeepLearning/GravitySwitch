// Gravity Switch 玩家造型 —— 由造型編輯器 (create_cube.html) 匯出
//   id     內部識別，存檔記的是這個，不可重複
//   name   商店顯示的名稱
//   price  售價（0 = 一開始就擁有）
//   body   方塊主色；頂面、側面、底面的明暗會自動算出來
//   accent 正面條紋的顏色
//   trail  噴射尾巴的顏色
//   rainbow: true 時忽略 body，色相隨時間循環
//   img    圖片造型（透明背景 PNG），用圖片取代方塊；body 仍用來決定爆炸碎片的顏色
//   imgScale 圖片大小倍率（預設 1.25）
const SKIN_LIST = [
  { id: 'classic', name: '經典紅', price: 0,   body: '#e8231f', accent: '#ffb02e', trail: '#ff7a1a' },
  { id: 'ice',     name: '冰晶',   price: 40,  body: '#27b7f5', accent: '#e8fbff', trail: '#6fe3ff' },
  { id: 'lime',    name: '萊姆',   price: 60,  body: '#6fcf1d', accent: '#f4ff9a', trail: '#b8ff4a' },
  { id: 'violet',  name: '紫晶',   price: 90,  body: '#8e3cf0', accent: '#ffc7ff', trail: '#d27bff' },
  { id: 'gold',    name: '黃金',   price: 150, body: '#f0b400', accent: '#fff3b0', trail: '#ffd84a' },
  { id: 'mint',    name: '薄荷',   price: 200, body: '#1fd6a3', accent: '#e0fff5', trail: '#6affd2' },
  { id: 'white',   name: '白金',   price: 260, body: '#dfe6f0', accent: '#6fd0ff', trail: '#bfe8ff' },
  { id: 'shadow',  name: '黑曜',   price: 320, body: '#2c2644', accent: '#ff2e88', trail: '#ff2e88' },
  { id: 'pink',    name: '霓虹粉', price: 400, body: '#ff2fa8', accent: '#ffffff', trail: '#ff7bd0' },
  { id: 'rainbow', name: '彩虹',   price: 600, rainbow: true,   accent: '#ffffff' },
  { id: 'godtone', name: '統神',   price: 5000, body: '#f2a65a', accent: '#ffffff', trail: '#ffd08a', img: 'skins/godtone.png', imgScale: 1.3 },
  { id: 'cat',     name: '貓咪',   price: 10000, body: '#f2a65a', accent: '#ffffff', trail: '#ffd08a', img: 'skins/cat.png', imgScale: 1.3 },
];
