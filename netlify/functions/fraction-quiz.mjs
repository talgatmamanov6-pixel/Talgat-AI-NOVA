// Exact rational arithmetic: this narrowly scoped quiz never relies on LLM arithmetic.
const gcd=(a,b)=>b?gcd(b,a%b):a;
const fraction=(n,d)=>{const g=gcd(n,d);return {n:n/g,d:d/g}};
const same=(a,b)=>a.n*b.d===b.n*a.d;
const shuffle=(items,rng)=>{for(let i=items.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[items[i],items[j]]=[items[j],items[i]]}return items};
export function createQuiz(rng=Math.random){
 const positions=shuffle([0,1,2,3,0,1,2,3],rng),questions=[],seen=new Set();
 for(let i=0;i<8;i++){
  let d,a,b,id;do{d=6+Math.floor(rng()*19);a=1+Math.floor(rng()*(d-1));b=1+Math.floor(rng()*(d-1));id=[a,b,d].join(':')}while(seen.has(id));seen.add(id);
  const answer=fraction(a+b,d),wrong=[];
  for(let k=1;wrong.length<3;k++)for(const n of [a+b+k,Math.max(1,a+b-k)]){const f=fraction(n,d);if(!same(f,answer)&&!wrong.some(x=>same(x,f)))wrong.push(f);if(wrong.length===3)break}
  shuffle(wrong,rng);const choices=[...wrong];choices.splice(positions[i],0,answer);questions.push({a,b,d,choices,correct:positions[i]});
 }
 return questions;
}
const latex=f=>f.d===1?String(f.n):'\\frac{'+f.n+'}{'+f.d+'}';
export function verifiedFractionQuiz(message){
 if(!/^(?:Сценарий: )?\/quiz(?:\s|$)/.test(message))return null;
 const topic=message.includes('Задача и исходные данные:\n')?message.split('Задача и исходные данные:\n')[1].split('\n\nАудитория')[0]:message;
 if(!/сложени[еяю]\s+дробей\s+с\s+одинаковым[и]?\s+знаменател/i.test(topic))return null;
 if(/Язык результата: (?!русский)/.test(message))return null;
 const questions=createQuiz(),letters=['A','B','C','D'];
 let answer='# Сложение дробей с одинаковым знаменателем\n\n8 вопросов. В каждом ровно один правильный ответ. Каждый ответ — 1 балл. Максимум — 8 баллов.\n\n## Задания для ученика\n\n';
 questions.forEach((q,i)=>{answer+=(i+1)+'. $\\frac{'+q.a+'}{'+q.d+'}+\\frac{'+q.b+'}{'+q.d+'}=?$\n\n'+q.choices.map((f,j)=>'   '+letters[j]+') $'+latex(f)+'$').join('  \n')+'\n\n'});
 answer+='---\n\n## Ключ для преподавателя\n\n| № | Ответ | Решение |\n|---|---|---|\n';
 questions.forEach((q,i)=>{answer+='| '+(i+1)+' | '+letters[q.correct]+' | $\\frac{'+q.a+'+'+q.b+'}{'+q.d+'}='+latex(q.choices[q.correct])+'$ |\n'});
 answer+='\nЗнаменатель сохраняется, числители складываются. Затем дробь сокращается, если это возможно.\n\n**Проверено вычислением:** все варианты попарно различны по значению, в каждом вопросе ровно один правильный ответ. Тест построен модулем точной арифметики Talgat; генерация текста моделью здесь не используется.';
 return {answer,model:'talgat-verified-fractions',engine:'exact-rational-arithmetic'};
}
