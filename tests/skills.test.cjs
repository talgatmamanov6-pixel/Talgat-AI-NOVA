const test=require('node:test'),assert=require('node:assert/strict');
const {items,build,expand,csv}=require('../web/skills.js');
test('every catalog recipe preserves context and language through slash command expansion',()=>{
 assert.equal(items.length,36);assert.equal(new Set(items.map(s=>s.id)).size,36);
 for(const skill of items){const prompt=build(skill.id,{topic:'Тестовая тема\nС данными',audience:'6 класс',scope:'45 минут',language:'қазақша'});assert.ok(prompt.includes(skill.instruction));assert.match(prompt,/6 класс/);assert.match(prompt,/45 минут/);assert.match(prompt,/қазақша/);assert.equal(expand('/'+skill.id+' Тестовая тема').skill.id,skill.id);assert.equal(expand('/'+skill.id).prompt,null)}
 assert.equal(expand('/unknown example'),null);assert.equal(expand('Обычный вопрос'),null);assert.throws(()=>build('quiz',{topic:'  '}));
});
test('CSV preserves Unicode, quotes and commas, and neutralizes spreadsheet formulas',()=>{
 const rows=[['Имя','Значение'],['Талгат, AI','Он сказал "да"'],['=HYPERLINK("x")','@SUM(A1)'],['Много\nстрок','-5']].map(cells=>({cells:cells.map(textContent=>({textContent}))}));
 const result=csv({rows});assert.ok(result.includes('"Талгат, AI","Он сказал ""да"""'));assert.ok(result.includes('"\'=HYPERLINK'));assert.ok(result.includes('"\'@SUM'));assert.ok(result.includes('"Много строк"'));assert.equal(result.split('\r\n').length,4);
});
