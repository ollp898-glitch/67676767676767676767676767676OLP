const assert=require('node:assert/strict');
const {classifyMarket}=require('./event-catalog');
const fixtures=require('./classification-fixtures.json').markets;
const families={
  receiving_yards:'player_receiving_yards',receptions:'player_receptions',rushing_yards:'player_rushing_yards',
  passing_yards:'player_passing_yards',passing_touchdowns:'player_passing_touchdowns',
  passing_attempts:'player_passing_attempts',passing_completions:'player_passing_completions',
  longest_reception:'player_longest_reception',points:'player_points',assists:'player_assists',
  rebounds:'player_rebounds',baseball_player_earned_runs_allowed:'player_earned_runs_allowed',
  first_half_team_totals:'team_totals',second_half_team_totals:'team_totals',
  team_touchdowns:'team_touchdowns',two_point_conversions:'two_point_conversions',
  first_half_moneyline:'winner',second_half_moneyline:'winner',safety:'safety',
  basketball_odd_even:'points_odd_even',basketball_team_to_score_first:'first_score',
  first_blood_game:'first_score',kill_over_under_game:'kills_totals',
  soccer_starting_eleven:'starting_lineup',exact_margin:'other',two_plus_touchdowns:'other'};
for(let n=1;n<=4;n++)Object.assign(families,{[`q${n}_spreads`]:'handicap',[`q${n}_totals`]:'totals',
  [`q${n}_moneyline`]:'winner',[`q${n}_both_teams_to_score_points`]:'both_score'});
for(const fixture of fixtures){
  const expected=fixture.sport==='motorsport'?'race_winner':families[fixture.market_type];
  assert(expected,`Missing expected family for ${fixture.market_type}`);
  const actual=classifyMarket(fixture);
  assert.equal(actual.family,expected,fixture.question);
}
for(const [market_type,family,period] of [
  ['soccer_exact_score','exact_score','match'],
  ['soccer_anytime_goalscorer','player_goalscorer','match'],
  ['soccer_first_half_exact_score','exact_score','half_1']]){
  const actual=classifyMarket({market_type,sport:'soccer',question:'Named soccer market'});
  assert.equal(actual.family,family,market_type);
  assert.equal(actual.period,period,market_type);
  assert.notEqual(actual.title,'Прочее / не определено',market_type);
}
console.log(`Classification tests passed: ${fixtures.length} real market fixtures.`);
