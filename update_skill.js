const fs = require('fs');

const skillsPath = 'D:/Users/xuling.ma/Desktop/新建文件夹/ai-site/skills.js';
const escapedPath = 'D:/Users/xuling.ma/Desktop/files_extracted/SKILL_escaped2.txt';

const escaped = fs.readFileSync(escapedPath, 'utf8');
let skills = fs.readFileSync(skillsPath, 'utf8');

// Step 1: Add TOUCHPOINT_MAP after COPY_LIBRARY
const oldLib = 'const COPY_LIBRARY = loadSkillFile(\'copy-library.md\');';
const newLib = 'const COPY_LIBRARY = loadSkillFile(\'copy-library.md\');\n// 触点词表 —— 判"哪个论点能挂广告、挂哪个品类"\nconst TOUCHPOINT_MAP = loadSkillFile(\'touchpoint-map.md\');';
skills = skills.replace(oldLib, newLib);

// Step 2: Replace SECTIONS.copy value
const copyIdx = skills.indexOf('  copy: \x60');
if (copyIdx < 0) { console.log('ERROR: copy marker not found'); process.exit(1); }
const valueStart = copyIdx + '  copy: \x60'.length;
const afterCopy = skills.substring(valueStart);
const closeIdx = afterCopy.indexOf('\x60\n};');
if (closeIdx < 0) { console.log('ERROR: close marker not found'); process.exit(1); }
const valueEnd = valueStart + closeIdx;
skills = skills.substring(0, valueStart) + escaped + skills.substring(valueEnd);

// Step 3: Update getIdeaSystem for copy section
const oldGetIdea = "if (section === 'copy' || section === 'train' || section === 'ticket' || section === 'flight' || section === 'hotel') {";
const newGetIdea = "if (section === 'copy') { return TOUCHPOINT_MAP + '\\n\\n' + COPY_LIBRARY + '\\n\\n' + sec; }\n    if (section === 'train' || section === 'ticket' || section === 'flight' || section === 'hotel') {";
skills = skills.replace(oldGetIdea, newGetIdea);

fs.writeFileSync(skillsPath, skills, 'utf8');
console.log('OK. skills.js length:', skills.length);
console.log('Has TOUCHPOINT_MAP:', skills.includes('TOUCHPOINT_MAP'));
console.log('Has touchpoint-map.md:', skills.includes('touchpoint-map.md'));
