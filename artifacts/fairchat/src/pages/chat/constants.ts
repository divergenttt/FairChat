export const EMOJI_CATS = [
  { icon:"😊", label:"Faces",   emoji:["😀","😁","😂","🤣","😊","🥰","😍","🤩","😘","😎","🥳","😏","🙂","😮","😲","🥺","😢","😭","😤","😡","🤯","😱","😴","😬","🥴","🤔","😉","😶","🙄","😵","🤢","🤧","😇","🤠","😈","😺","😸","😹","🙈","🙉","🙊"] },
  { icon:"👍", label:"Gestures",emoji:["👍","👎","👋","🤝","🙌","👏","🤜","🤛","✌️","🤞","❤️","💖","💔","💘","💝","💗","💓","💞","💕","💟","❣️","💛","💚","💙","💜","🖤","🤍","🤎"] },
  { icon:"🔥", label:"Symbols", emoji:["🔥","💯","✨","⭐","🌟","💫","🎉","🎊","🎈","💥","💢","💤","⚡","🌈","❄️","🌊","🌀","🌙","☀️","🌸","🌺","🌻","🍀","🎯","🏆","🥇","🎮","🎲","🎸","🎤","🎬"] },
  { icon:"🍕", label:"Fun",     emoji:["🍕","🍔","🌮","🍜","🍣","🍰","🎂","☕","🍺","🥂","🍾","🍵","🐶","🐱","🐻","🐼","🦊","🦁","🐯","🦋","🌍","🚀","🏠","✈️","🚗","⚽","🏀","🎾","🏄","⛷️"] },
];

export const COLORS = ["#F44336","#E91E63","#9C27B0","#673AB7","#3F51B5","#2196F3","#00BCD4","#009688","#4CAF50","#FF9800"];

export const THEMES = [
  { name: 'Sunset',  gradient: 'linear-gradient(90deg, #ffc800, #d60303)', color: '#d60303', dk: '#b50000', rgb: '213,6,3' },
  { name: 'Forest',  gradient: 'linear-gradient(90deg, #0f5739, #3d8e66, #45c9a4, #46b5a9, #52c9eb)', color: '#3aac8a', dk: '#269370', rgb: '58,172,138' },
  { name: 'Blossom', gradient: 'linear-gradient(90deg, #e6c396, #de4c71, #1925bb)', color: '#de4c71', dk: '#c23558', rgb: '222,76,113' },
  { name: 'Pastel',  gradient: 'linear-gradient(90deg, #7b9fe8, #e092b3, #e0dba6)', color: '#a08cc8', dk: '#8470b4', rgb: '160,140,200' },
];

export const COMMON_REACTIONS = ["👍","❤️","😂","😮","😢"];
export const WAVE_HEIGHTS = [30,55,75,100,80,60,90,70,85,95,65,50,80,70,95,55,75,85,60,80,50,90,70,85];
export const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
export const FAV_GRADIENT = "linear-gradient(135deg, #C87ADE 0%, #7B6AEA 100%)";


function makeChatBg(stroke: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="260" fill="none" stroke="${stroke}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14,14 L40,25 L14,31 Z" stroke-width="1.4"/>
    <line x1="14" y1="14" x2="21" y2="31" stroke-width="1.4"/>
    <path d="M246,18 C246,13 240,10 237,14 C234,10 228,13 228,18 C228,25 237,34 237,34 C237,34 246,25 246,18Z" stroke-width="1.4"/>
    <polygon points="130,8 133,18 143,18 136,24 138,34 130,28 122,34 124,24 117,18 127,18" stroke-width="1.3"/>
    <rect x="6" y="94" width="46" height="30" rx="8" stroke-width="1.3"/>
    <circle cx="18" cy="109" r="2.2" stroke-width="1"/>
    <circle cx="29" cy="109" r="2.2" stroke-width="1"/>
    <circle cx="40" cy="109" r="2.2" stroke-width="1"/>
    <path d="M10,124 L10,134 L20,124" stroke-width="1.3"/>
    <rect x="209" y="87" width="22" height="17" rx="4" stroke-width="1.3"/>
    <path d="M213,87 L213,81 C213,75 227,75 227,81 L227,87" stroke-width="1.3"/>
    <path d="M186,64 L186,84 C186,89 181,90 178,88 C175,86 175,82 177,80 C179,78 183,79 184,82" stroke-width="1.3"/>
    <line x1="186" y1="64" x2="198" y2="60" stroke-width="1.3"/>
    <line x1="198" y1="60" x2="198" y2="72" stroke-width="1.3"/>
    <circle cx="177" cy="85" r="3" stroke-width="1"/>
    <path d="M237,124 C232,124 229,119 232,115 C230,111 235,108 239,110 C241,105 249,105 252,110 C257,109 260,115 257,119 C260,122 258,126 254,126 Z" stroke-width="1.3"/>
    <rect x="90" y="174" width="38" height="26" rx="4" stroke-width="1.3"/>
    <polyline points="90,178 109,191 128,178" stroke-width="1.3"/>
    <path d="M44,220 C44,216 39,213 36,217 C33,213 28,216 28,220 C28,226 36,233 36,233 C36,233 44,226 44,220Z" stroke-width="1.2"/>
    <path d="M64,200 L84,208 L64,214 Z" stroke-width="1.2"/>
    <line x1="64" y1="200" x2="70" y2="214" stroke-width="1.2"/>
    <path d="M172,40 L174,47 L181,49 L174,51 L172,58 L170,51 L163,49 L170,47Z" stroke-width="1.1"/>
    <path d="M58,56 L60,62 L66,64 L60,66 L58,72 L56,66 L50,64 L56,62Z" stroke-width="1"/>
    <path d="M200,205 L202,211 L208,213 L202,215 L200,221 L198,215 L192,213 L198,211Z" stroke-width="1"/>
    <circle cx="100" cy="48" r="2.2" stroke-width="1"/>
    <circle cx="18" cy="152" r="2.2" stroke-width="1"/>
    <circle cx="252" cy="55" r="2" stroke-width="1"/>
    <circle cx="138" cy="248" r="2" stroke-width="1"/>
    <circle cx="165" cy="150" r="2" stroke-width="1"/>
  </svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
export const BG_DK = makeChatBg("rgba(255,255,255,0.08)");
export const BG_LT = makeChatBg("rgba(0,0,0,0.06)");
