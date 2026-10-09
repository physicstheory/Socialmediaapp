import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeText, rateFlags, checkMessage, maskProfanity, categorize } from '../server/moderation.js';

test('flags and rates captions', () => {
  assert.deepEqual(analyzeText('cute puppy #dogs').flags, []);
  assert.equal(rateFlags(analyzeText('scary horror night').flags), 'teen');
  assert.equal(rateFlags(analyzeText('friday beer run').flags), 'mature');
});

test('severe content is caught, including obfuscation', () => {
  assert.ok(analyzeText('try the blackout challenge').severe.includes('dangerous'));
  assert.ok(analyzeText('k.y.s').severe.includes('bullying'));
  assert.ok(analyzeText('k y s loser').severe.includes('bullying'));
  assert.ok(analyzeText('n00dz? no, nud3s').severe.includes('mature'));
});

test('no false positives on ordinary words', () => {
  assert.deepEqual(analyzeText('skyscraper views at sunset').flags, []);
  assert.deepEqual(analyzeText('class assignment about grass').flags, []);
});

test('grooming patterns are blocked when a minor is involved', () => {
  const teen = { ageGroup: 'teen' };
  const adult = { ageGroup: 'adult' };
  assert.equal(checkMessage("don't tell your parents ok", adult, teen).ok, false);
  assert.equal(checkMessage('how old are you?', teen, teen).ok, false);
  assert.equal(checkMessage('how old are you?', adult, adult).ok, true);
});

test('personal info and links are hidden for minors', () => {
  const r = checkMessage('text me 555-123-4567 or see www.example.com', { ageGroup: 'teen' }, { ageGroup: 'teen' });
  assert.ok(r.ok);
  assert.ok(!r.text.includes('555'));
  assert.ok(r.text.includes('[link removed]'));
});

test('profanity masking and categorization', () => {
  assert.equal(maskProfanity('what the shit'), 'what the s***');
  assert.equal(categorize('my cat is so funny #cats #pets'), 'animals');
});
