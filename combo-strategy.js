// Strategy eligibility only. General Scanner classification and collection stay intact.
const ESPORT_CODES=new Set(['cs2','csgo','val','valorant','lol','dota2','dota','r6','r6siege','rainbow6','rl','ow','ow2','mlbb']);
function excludedSport(row){
 if(row.sport==='esports'||ESPORT_CODES.has(String(row.league_code).toLowerCase()))return 'esports';
 return row.sport==='tennis'?'tennis':null;
}
function strategyExclusions(rows){
 const by_sport={};for(const row of rows){const sport=excludedSport(row);if(sport)by_sport[sport]=(by_sport[sport]||0)+1;}
 return {reason:'sport_not_in_combo_strategy',scope:'scanner_saved_outcomes',outcomes:Object.values(by_sport).reduce((a,b)=>a+b,0),by_sport};
}
module.exports={excludedSport,strategyExclusions};
