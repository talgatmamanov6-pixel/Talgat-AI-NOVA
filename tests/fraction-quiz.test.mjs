import test from 'node:test';import assert from 'node:assert/strict';import {createQuiz,verifiedFractionQuiz} from '../netlify/functions/fraction-quiz.mjs';
test('1000 generated fraction quizzes have exactly one correct answer, distinct rational choices and balanced keys',()=>{
 for(let run=0;run<1000;run++){
  const questions=createQuiz(),positions=[0,0,0,0];assert.equal(questions.length,8);assert.equal(new Set(questions.map(q=>`${q.a}:${q.b}:${q.d}`)).size,8);
  for(const q of questions){assert.equal(q.choices.length,4);const matches=q.choices.map(f=>f.n*q.d===(q.a+q.b)*f.d);assert.equal(matches.filter(Boolean).length,1);assert.equal(matches[q.correct],true);positions[q.correct]++;for(let a=0;a<4;a++)for(let b=a+1;b<4;b++)assert.notEqual(q.choices[a].n*q.choices[b].d,q.choices[b].n*q.choices[a].d)}
  assert.deepEqual(positions,[2,2,2,2]);
 }
});
test('exact arithmetic applies only to its supported topic and language',()=>{
 assert.ok(verifiedFractionQuiz('Сценарий: /quiz — Тест\nЗадача и исходные данные:\nСложение дробей с одинаковым знаменателем\n\nАудитория: 6 класс\nЯзык результата: русский').answer.includes('Проверено вычислением'));
 assert.equal(verifiedFractionQuiz('/quiz история Казахстана'),null);assert.equal(verifiedFractionQuiz('/explain сложение дробей с одинаковым знаменателем'),null);
 assert.equal(verifiedFractionQuiz('/quiz сложение дробей с одинаковым знаменателем\nЯзык результата: English'),null);
});
