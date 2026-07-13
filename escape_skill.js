const fs = require('fs');
const c = fs.readFileSync('D:/Users/xuling.ma/Desktop/files_extracted/SKILL.md', 'utf8');
// Strip YAML frontmatter
const stripped = c.replace(/^---[\s\S]*?---\n*/, '').trim();
// Escape backticks for JS template literal
const escaped = stripped.replace(/`/g, '\\`');
fs.writeFileSync('D:/Users/xuling.ma/Desktop/files_extracted/SKILL_escaped2.txt', escaped, 'utf8');
console.log('chars:', escaped.length);
console.log('Has OTA:', escaped.includes('OTA'));
console.log('Has 文案台:', escaped.includes('文案台'));
console.log('backtick count:', (escaped.match(/`/g)||[]).length);
console.log('escaped backtick count:', (escaped.match(/\\`/g)||[]).length);
