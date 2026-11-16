// node --test tests/team-match.test.js
const test = require('node:test'), assert = require('node:assert/strict');
const { matchesTeam: m } = require('../assets/team-match.js');
test('echipa aleasă = exact acea echipă, nu tot orașul', () => {
  assert.ok(m('Barcelona', 'FC Barcelona')); assert.ok(m('FC Barcelona', 'FC Barcelona'));
  assert.ok(!m('Barcelona', 'RCD Espanyol de Barcelona')); assert.ok(m('Espanyol', 'RCD Espanyol de Barcelona'));
  assert.ok(m('Real Madrid', 'Real Madrid CF')); assert.ok(m('Madrid', 'Real Madrid CF'));
  assert.ok(!m('Real Madrid', 'Club Atlético de Madrid')); assert.ok(m('Atletico Madrid', 'Club Atlético de Madrid')); assert.ok(m('Atletico', 'Club Atlético de Madrid'));
  assert.ok(!m('Atletico Madrid', 'Real Madrid CF'));
  assert.ok(m('Inter', 'FC Internazionale Milano')); assert.ok(m('Inter Milan', 'FC Internazionale Milano')); assert.ok(!m('Inter', 'AC Milan'));
  assert.ok(m('AC Milan', 'AC Milan')); assert.ok(m('Milan', 'AC Milan')); assert.ok(!m('Milan', 'FC Internazionale Milano'));
  assert.ok(m('Bayern', 'FC Bayern München')); assert.ok(m('Roma', 'AS Roma')); assert.ok(!m('Roma', 'Romania'));
  assert.ok(m('Man City', 'Manchester City FC')); assert.ok(!m('Manchester', 'Manchester City FC'));
  assert.ok(m('PSG', 'Paris Saint-Germain FC')); assert.ok(!m('Paris', 'Paris Saint-Germain FC'));
  assert.ok(!m('Arsenal', 'Chelsea FC'));
});
