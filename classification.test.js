const assert=require('node:assert/strict');
const {classifyMarket}=require('./event-catalog');
const {flattenMarkets}=require('./outcome-exports');
const {verifyCombo}=require('./market-verification');
const {refreshRow}=require('./refresh-candidates');
const {annotatePolicy,isHighCandidate}=require('./candidate-policy');
const fixtures=require('./classification-fixtures.json').markets;
const families={receiving_yards:'player_receiving_yards',receptions:'player_receptions',rushing_yards:'player_rushing_yards',passing_yards:'player_passing_yards',
 passing_touchdowns:'player_passing_touchdowns',passing_attempts:'player_passing_attempts',passing_completions:'player_passing_completions',longest_reception:'player_longest_reception',
 points:'player_points',assists:'player_assists',rebounds:'player_rebounds',baseball_player_earned_runs_allowed:'player_earned_runs_allowed',
 first_half_team_totals:'team_totals',second_half_team_totals:'team_totals',team_touchdowns:'team_touchdowns',two_point_conversions:'two_point_conversions',
 first_half_moneyline:'winner',second_half_moneyline:'winner',safety:'safety',basketball_odd_even:'points_odd_even',basketball_team_to_score_first:'first_score',
 first_blood_game:'first_score',kill_over_under_game:'kills_totals',soccer_starting_eleven:'starting_lineup',exact_margin:'other',two_plus_touchdowns:'other'};
for(let n=1;n<=4;n++)Object.assign(families,{[`q${n}_spreads`]:'handicap',[`q${n}_totals`]:'totals',[`q${n}_moneyline`]:'winner',[`q${n}_both_teams_to_score_points`]:'both_score'});
const clone=value=>JSON.parse(JSON.stringify(value));
const find=(type,sport)=>clone(fixtures.find(r=>r.market_type===type&&(!sport||r.sport===sport)));
function changed(row,patch){const r={...clone(row),...patch};delete r.source_market;return r;}
for(const fixture of fixtures){
 const c=classifyMarket(fixture),expected=fixture.sport==='motorsport'?'race_winner':families[fixture.market_type];
 assert(expected,`Missing test expectation for ${fixture.market_type}`);assert.equal(c.family,expected,fixture.question);
 if(expected==='other'){const row=annotatePolicy({...fixture,family:'other',classification_status:'unclassified',combo_verified:true});assert(!isHighCandidate(row));continue;}
 const t=fixture.market_type||'';
 const period=/^q[1-4]_/.test(t)?'quarter_'+t[1]:t.startsWith('first_half')?'half_1':t.startsWith('second_half')?'half_2':fixture.sport==='esports'?'map_1':'match';
 assert.equal(c.period,period,fixture.question);assert(c.classification_source.includes('outcomes'));
 assert.equal(c.canonical_outcomes.length,fixture.outcomes.length);
 const rows=flattenMarkets([fixture]).rows;assert(rows.every(r=>r.raw_market&&r.raw_outcome&&r.classification_source===c.classification_source));
 if(expected.startsWith('player_')){assert.equal(c.player_name,fixture.question.split(':')[0]);assert.equal(c.line,fixture.line);}
 assert.equal(classifyMarket(changed(fixture,{sport:'unrelated-sport'})).family,'other','Cross-sport collision');
 assert.equal(classifyMarket(changed(fixture,{question:fixture.question+' in the first 5 minutes'})).family,'other','Different scope');
 assert.equal(classifyMarket(changed(fixture,{outcomes:[{outcome:'Yes'},{outcome:'Yes'}]})).family,'other','Duplicate outcomes');
 assert.equal(classifyMarket(changed(fixture,{group_item_title:'Unrelated statistic'})).family,'other','Contradictory group');
 if(fixture.line!==null)assert.equal(classifyMarket(changed(fixture,{line:Number(fixture.line)+1})).family,'other','Contradictory line');
 for(const line of [false,[],{},'   ','not-a-number'])assert.equal(classifyMarket(changed(fixture,{line})).family,'other','Malformed line must not coerce to zero or missing');
 const corrupt=clone(fixture);corrupt.source_market.question='Contradictory source';assert.equal(classifyMarket(corrupt).family,'other');
 // Ordering is taken from raw outcomes, never assumed from index 0/1.
 const reverse=clone(fixture);reverse.outcomes.reverse();reverse.source_market.outcomes.reverse();
 const reversed=classifyMarket(reverse);assert.deepEqual(reversed.canonical_outcomes,[...c.canonical_outcomes].reverse());
 if(c.outcome_lines)assert.deepEqual(reversed.outcome_lines,[...c.outcome_lines].reverse());
}
const points=find('points'),rebounds=find('rebounds');
for(const row of [points,rebounds,find('assists')]){
 assert.deepEqual(classifyMarket(row).canonical_outcomes,['OVER','UNDER']);
 const flattened=flattenMarkets([row]).rows;
 assert.deepEqual(flattened.map(r=>[r.raw_outcome,r.outcome,r.outcome_canonical]),[['Yes','Over','OVER'],['No','Under','UNDER']]);
 for(const mutation of [d=>'',d=>d.replace('more than','less than'),d=>d.replaceAll(row.question.split(':')[0],'Another Player'),d=>d.replaceAll(String(row.line),'999.5'),d=>d+' This market will resolve to "Yes" if another condition applies during the game.']){
  const bad=clone(row);bad.source_market.description=mutation(bad.source_market.description);assert.equal(classifyMarket(bad).family,'other','Unproved Yes/No semantics');
 }
}
const nfl=find('receiving_yards');const ambiguous=changed(nfl,{outcomes:[{outcome:'Yes',price:.6},{outcome:'No',price:.4}]});
const noSource=changed(nfl,{}),exported=flattenMarkets([noSource]).rows[0];
assert.equal(classifyMarket({...exported,outcomes:exported.raw_market.outcomes}).family,'player_receiving_yards','Normalized legacy source fields round trip');
assert.equal(classifyMarket(ambiguous).family,'other','O/U title alone does not prove Yes = Over');
const proven=clone(ambiguous);const player=proven.question.split(':')[0];
proven.source_market={description:`This market will resolve to "Yes" if ${player} records more than ${proven.line} receiving yards during the game. This market will resolve to "No" if ${player} records ${proven.line} receiving yards or fewer during the game.`};
assert.deepEqual(classifyMarket(proven).canonical_outcomes,['OVER','UNDER']);
const handicap=find('q1_spreads','american-football');const hc=classifyMarket(handicap);
assert.equal(hc.outcome_lines[0],Number(handicap.line));assert.equal(hc.outcome_lines[1],-Number(handicap.line));
assert.equal(classifyMarket(changed(handicap,{outcomes:[{outcome:'Yes'},{outcome:'No'}]})).family,'other','Binary handicap needs proof, not a Yes/No guess');
// Two players in one family must retain their own identity and evidence.
const second=clone(nfl);second.market_id='second';second.question=second.question.replace(player,'Another Player');second.group_item_title=second.question;
second.source_market.question=second.question;second.source_market.groupItemTitle=second.question;
const mixed=flattenMarkets([nfl,second]).rows;assert.equal(mixed.filter(r=>r.market_id==='second')[0].player_name,'Another Player');
// Source identity verification and refresh use raw names; normalized names are display/semantics.
const now=Date.parse('2026-10-05T00:00:00Z');
const leg={...flattenMarkets([points]).rows[0],token_id:'t0',position_id:'p0',condition_id:'c',combo_eligible:true,combo_verified:true,
 snapshot_at:new Date(now).toISOString(),game_start_time:new Date(now+3*3600000).toISOString(),price:.7,liquidity:100};
const entry={condition_id:'c',pending:false,outcomes:['Yes','No'],position_ids:['p0','p1']};
assert(verifyCombo(leg,{entries:new Map([[String(leg.market_id),entry]])}).combo_verified);
assert(!verifyCombo({...leg,raw_outcome:'No'},{entries:new Map([[String(leg.market_id),entry]])}).combo_verified);
const live={id:leg.market_id,active:true,closed:false,acceptingOrders:true,enableOrderBook:true,conditionId:'c',clobTokenIds:['t0','t1'],positionIds:['p0','p1'],
 outcomes:['Yes','No'],outcomePrices:[.7,.3],question:leg.question,sportsMarketType:leg.market_type,line:leg.line,gameStartTime:leg.game_start_time,liquidity:100,comboStatus:'enabled',description:leg.raw_market.description};
assert.equal(refreshRow(leg,live,now).row.outcome,'Over');
assert.equal(refreshRow(leg,{...live,description:'Changed settlement'},now).reason,'resolution_rules_changed_rescan_required');
assert.equal(refreshRow(leg,{...live,outcomes:['No','Yes']},now).reason,'identity_changed');
console.log(`Classification: ${fixtures.length} real sport/type fixtures, conflicting evidence, reversed outcomes, raw identities and Yes/No regressions passed.`);
