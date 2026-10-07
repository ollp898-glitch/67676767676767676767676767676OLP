// Independent enrichment semantics. Never imports or modifies scanner classification.
const normalize = x => String(x ?? '').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const ALIASES = new Map([['cd real santander','real santander'],['orsomarso sc','orsomarso'],['bounty hunters esports','bounty hunters']]);
const name = x => ALIASES.get(normalize(x)) || normalize(x);
const discipline = row => ({cs2:'cs2',csgo:'cs2',val:'valorant',valorant:'valorant',lol:'lol',dota2:'dota2',dota:'dota2',r6:'rainbow6',r6siege:'rainbow6',rainbow6:'rainbow6',rl:'rocket-league',ow:'overwatch',ow2:'overwatch',mlbb:'mobile-legends'}[String(row.league_code).toLowerCase()] || 'other');
const isEsports = row => row.sport==='esports'||discipline(row)!=='other';
const ROUTES = {cs2:['hltv','liquipedia'],valorant:['vlr','liquipedia'],lol:['gol','liquipedia'],dota2:['dotabuff','opendota','liquipedia'],rainbow6:['siegegg','liquipedia'],'rocket-league':['liquipedia'],overwatch:['liquipedia'],'mobile-legends':['liquipedia'],other:[]};
function eventFacts(row) {
  let title = row.match_title || row.event_title || '';
  title=title.replace(/\s+-\s+(?:More Markets|Halftime Result)$/i,'');
  if(['american-football','baseball','basketball','hockey'].includes(row.sport))title=title.replace(/\s+-\s+Player Props$/i,'');
  const bo=title.match(/\(BO(\d+)\)/i), tournament=bo ? title.split(/\(BO\d+\)\s*-\s*/i)[1] : null;
  const tennisTournament=row.sport==='tennis'&&title.includes(':')?title.slice(0,title.indexOf(':')).trim():null;
  const cricketTournament=row.sport==='cricket'&&title.includes(':')?title.slice(0,title.indexOf(':')).trim():null;
  if(cricketTournament)title=title.slice(title.indexOf(':')+1).trim();
  if(tennisTournament)title=title.slice(title.indexOf(':')+1).trim();
  if(row.sport==='esports')title=title.replace(/^[^:]+:\s*/,'').split(/\s*\(BO\d+\)/i)[0];
  const teams=title.split(/\s+(?:vs\.?|v\.?|—)\s+/i);
  return {sport:row.sport,discipline:row.sport==='esports'?discipline(row):null,participants:teams.length===2?teams.map(s=>s.trim()):[],
    competition:tournament || tennisTournament || cricketTournament || row.league_name || null,start_time:row.game_start_time,best_of:bo?Number(bo[1]):null,scope:row.sport==='esports'?'series':'match',...(tennisTournament?{tennis_doubles:/doubles/i.test(tennisTournament),...(/doubles/i.test(tennisTournament)?{source_event_id:String(row.event_id),league_code:row.league_code}:{})}:{})};
}
const LEAGUE_ALIASES=new Map([['west indies tour of india odis','one day international'],['fifa friendlies','friendly international'],['club friendlies','club friendly'],['categoria primera b','primera b'],['categoria primera a','primera a'],['fifa u 20 women s world cup','world cup women u20'],['uefa women s champions league','uefa champions league women'],['liga nacional de guatemala','liga nacional'],['college football','ncaa'],['mlb wild card','mlb'],['asian games men','asian games'],['sri lanka tour of england odis','one day international'],['west indies women tour of zimbabwe odis','one day international women']]);
LEAGUE_ALIASES.set("brasileirao serie b","serie b");
LEAGUE_ALIASES.set("primera b chile","liga de ascenso");
LEAGUE_ALIASES.set("uruguayan primera division","liga auf uruguaya");
LEAGUE_ALIASES.set('liga profesional de futbol','liga profesional');
LEAGUE_ALIASES.set('cricket world cup league 2','icc cricket world cup league 2');
LEAGUE_ALIASES.set('west indies tour of india t20s','twenty20 international');
function competition(x) { const v=normalize(x).replace(/ round \d+$/,'').replace(/ (?:clausura|apertura)$/,'').replace(/ (?:play offs|league phase)$/,'').replace(/^(concacaf nations league|uefa nations league) league [a-d]$/,'$1');return LEAGUE_ALIASES.get(v)||v; }
// Explicit, reviewed source aliases, scoped by competition. Never strip W/U20 globally.
const EVENT_ALIASES={
  'friendly international':{'sao tome e principe':'sao tome and principe','korea republic':'south korea','ir iran':'iran','china pr':'china'},
  'club friendly':{'sportfreunde siegen 1899':'siegen ger','borussia monchengladbach':'b monchengladbach ger','rw oberhausen':'oberhausen ger','schalke 04':'schalke ger'},
  'uefa nations league':{'republic of ireland':'ireland','czechia':'czech republic'},
  'concacaf nations league':{'trinidad and tobago':'trinidad tobago'},
  'botola pro':{'us amal tiznit':'amal tiznit'},
  'liga nacional':{'csd xelaju mc':'xelaju','antigua gfc':'antigua'},
  'wnba':{'dallas wings':'dallas wings w','seattle storm':'seattle storm w','chicago sky':'chicago sky w','washington mystics':'washington mystics w'},
  'nfl':{'falcons':'atlanta falcons','packers':'green bay packers'},
  'ncaa':{'liberty':'liberty flames'},
  'one day international women':{'zimbabwe women':'zimbabwe w','west indies women':'west indies w'},
  'usl championship':{'birmingham legion fc':'birmingham','brooklyn fc':'brooklyn'},
  'knvb beker':{'vv sparta nijkerk':'sparta nijkerk','rksv udi 19':'udi 19','vv ijsselmeervogels':'ijsselmeervogels','vv gemert':'gemert','jos watergraafsmeer':'watergraafsmeer','sv tec':'tec','rksv rohda raalte':'raalte','vpv purmersteijn':'purmersteijn'},
  'mls':{'seattle sounders fc':'seattle sounders'},
  'canadian premier league':{'inter toronto fc':'inter toronto'},
  'liga 1':{'cs cienciano':'cienciano'},
  'primera a':{'aguilas doradas rionegro':'aguilas','atletico nacional':'atl nacional','millonarios fc':'millonarios'},
  'world cup women u20':{'italy':'italy u20 w','spain':'spain u20 w','dpr korea':'north korea u20 w','colombia':'colombia u20 w'},
  'uefa champions league women':{'servette fc chenois feminin':'servette geneve fc w','ol lyonnes':'ol lyonnes w','oud heverlee leuven women':'leuven w','as roma':'as roma w','fc barcelona':'barcelona w','paris fc':'paris fc w','chelsea fc':'chelsea w','fk austria wien':'austria vienna w'}
};
// Reviewed sport-feed aliases, scoped to the exact competition; no generic suffix stripping.
const FEED_ALIASES_20260927={
  "primera a": {
    "deportivo pereira": "pereira",
    "internacional de bogota": "inter bogota",
    "cucuta deportivo fc": "cucuta",
    "llaneros fc": "llaneros",
    "cdp junior fc": "junior",
    "independiente medellin": "ind medellin",
    "jaguares de cordoba fc": "jaguares de cordoba",
    "alianza fc": "alianza",
    "fortaleza fc": "fortaleza",
    "cd tolima": "deportes tolima",
    "ad cali": "dep cali",
    "aguilas doradas rionegro": "aguilas"
  },
  "liga nacional": {
    "cd guastatoya": "guastatoya",
    "cd marquense": "marquense",
    "cd malacateco": "malacateco",
    "csd xelaju mc": "xelaju",
    "comunicaciones fc": "comunicaciones",
    "csd coban imperial": "coban imperial",
    "aurora fc": "aurora f c",
    "csd mixco": "deportivo mixco",
    "antigua gfc": "antigua"
  },
  "concacaf nations league": {
    "st vincent and the grenadines": "saint vincent and the grenadines"
  },
  "primera b": {
    "boca juniors de cali": "boca juniors",
    "boyaca patriotas": "patriotas",
    "envigado fc": "envigado",
    "atletico fc cali": "atletico f c",
    "barranquilla fc": "barranquilla"
  },
  "usl league one": {
    "forward madison fc": "forward madison",
    "spokane velocity fc": "spokane velocity",
    "chattanooga red wolves sc": "chattanooga red wolves",
    "greenville triumph sc": "greenville",
    "union omaha sc": "union omaha",
    "one knoxville sc": "one knoxville"
  },
  "ncaa": {
    "delaware": "delaware fightin",
    "liu": "liu sharks",
    "texas state": "texas state bobcats",
    "louisiana": "louisiana lafayette",
    "mississippi state": "mississippi st",
    "umass": "massachusetts",
    "sacramento state": "cs sacramento",
    "smu": "southern methodist",
    "washington": "washington huskies"
  },
  "primera nacional": {
    "ca central norte salta": "central norte",
    "ca colegiales": "colegiales",
    "club atletico los andes": "los andes",
    "ca defensores de belgrano": "def de belgrano",
    "ferro carril oeste": "ferro",
    "ca atlanta": "atletico atlanta",
    "agropecuario argentino": "agropecuario",
    "club almagro": "almagro",
    "ca patronato parana": "patronato",
    "san martin de san juan": "san martin s j",
    "mitre santiago del estero": "ca mitre",
    "ca san telmo": "san telmo",
    "ca ferrocarril midland": "midland",
    "csd tristan suarez": "tristan suarez",
    "cd maipu": "deportivo maipu",
    "ca temperley": "temperley",
    "ca racing de cordoba": "racing cordoba",
    "cd godoy cruz": "godoy cruz",
    "gimnasia y tiro de salta": "gimnasia y tiro",
    "atletico de rafaela": "atl rafaela",
    "gimnasia y esgrima de jujuy": "gimnasia jujuy",
    "san martin de tucuman": "san martin t"
  },
  "liga mx": {
    "cf cruz azul": "cruz azul",
    "deportivo toluca fc": "toluca",
    "cd guadalajara": "guadalajara chivas",
    "queretaro fc": "queretaro",
    "club santos laguna": "santos laguna",
    "cf pachuca": "pachuca",
    "tigres de la uanl": "tigres uanl",
    "club puebla": "puebla",
    "pumas de la unam": "unam pumas",
    "atletico san luis": "atl san luis",
    "club leon fc": "club leon",
    "fc juarez": "juarez"
  },
  "canadian premier league": {
    "forge fc hamilton": "forge"
  },
  "usl championship": {
    "charleston battery": "charleston",
    "rhode island fc": "rhode island",
    "detroit city fc": "detroit",
    "colorado springs switchbacks fc": "colorado springs",
    "san antonio fc": "san antonio",
    "tampa bay rowdies": "tampa bay",
    "new mexico united": "new mexico",
    "sacramento republic fc": "sacramento republic",
    "monterey bay fc": "monterey bay",
    "lexington sc": "lexington",
    "pittsburgh riverhounds": "pittsburgh",
    "oakland roots sc": "oakland roots",
    "phoenix rising fc": "phoenix rising"
  },
  "mls": {
    "orlando city sc": "orlando city",
    "atlanta united fc": "atlanta utd",
    "new york city fc": "new york city",
    "charlotte fc": "charlotte",
    "chicago fire fc": "chicago fire",
    "colorado rapids sc": "colorado rapids",
    "vancouver whitecaps fc": "vancouver whitecaps",
    "d c united sc": "dc united",
    "inter miami cf": "inter miami"
  },
  "k league 1": {
    "gangwon fc": "gangwon",
    "incheon united fc": "incheon"
  },
  "laliga2": {
    "real valladolid cf": "valladolid",
    "cordoba cf": "cordoba",
    "rcd mallorca": "mallorca",
    "ud almeria": "almeria",
    "cd eldense": "eldense",
    "sd eibar": "eibar",
    "ud las palmas": "las palmas",
    "real oviedo": "oviedo",
    "real sporting de gijon": "gijon"
  },
  "eerste divisie": {
    "fc den bosch": "den bosch"
  },
  "taca de portugal": {
    "ad camacha": "camacha",
    "florgrade fc": "florgrade"
  },
  "botola pro": {
    "moghreb athletic tetouan": "moghreb tetouan",
    "rs berkane": "berkane",
    "maghreb as de fes": "maghreb fez",
    "rca zemamra": "renaissance zemamra",
    "kawkab ac": "kawkab marrakech",
    "hus agadir": "hassania agadir"
  },
  "wnba": {
    "new york liberty": "new york liberty w",
    "minnesota lynx": "minnesota lynx w",
    "washington mystics": "washington mystics w",
    "atlanta dream": "atlanta dream w",
    "dallas wings": "dallas wings w",
    "golden state valkyries": "golden state valkyries w"
  },
  "copa argentina": {
    "racing club avellaneda": "racing club"
  },
  "nfl": {
    "vikings": "minnesota vikings",
    "buccaneers": "tampa bay buccaneers",
    "cardinals": "arizona cardinals",
    "49ers": "san francisco 49ers",
    "ravens": "baltimore ravens",
    "cowboys": "dallas cowboys",
    "raiders": "las vegas raiders",
    "saints": "new orleans saints",
    "rams": "los angeles rams",
    "broncos": "denver broncos",
    "chargers": "los angeles chargers",
    "bills": "buffalo bills",
    "panthers": "carolina panthers",
    "browns": "cleveland browns",
    "titans": "tennessee titans",
    "giants": "new york giants",
    "jets": "new york jets",
    "lions": "detroit lions",
    "seahawks": "seattle seahawks",
    "commanders": "washington commanders",
    "bengals": "cincinnati bengals",
    "steelers": "pittsburgh steelers",
    "patriots": "new england patriots",
    "jaguars": "jacksonville jaguars",
    "texans": "houston texans",
    "colts": "indianapolis colts",
    "chiefs": "kansas city chiefs",
    "dolphins": "miami dolphins"
  }
};
for(const [league,aliases] of Object.entries(FEED_ALIASES_20260927))EVENT_ALIASES[league]={...EVENT_ALIASES[league],...aliases};
// Additional literal pairs reviewed against the 2026-09-28 sport feeds.
for(const [league,aliases] of Object.entries({
  "primera b": {
    "independiente valle del cauca": "ind valle del cauca",
    "internacional fc de palmira": "inter palmira",
    "itagui leones fc": "leones",
    "deportes quindio": "quindio",
    "bogota fc": "bogota",
    "union magdalena": "u magdalena",
    "real cartagena fc": "cartagena"
  },
  "concacaf nations league": {
    "st lucia": "saint lucia",
    "st kitts and nevis": "saint kitts and nevis",
    "us virgin islands": "united states virgin islands"
  },
  "nfl": {
    "eagles": "philadelphia eagles",
    "bears": "chicago bears"
  },
  "national league": {
    "boreham wood fc": "boreham wood",
    "kidderminster harriers fc": "kidderminster",
    "forest green rovers fc": "forest green",
    "wealdstone fc": "wealdstone",
    "hornchurch fc": "hornchurch",
    "aldershot town fc": "aldershot",
    "gateshead fc": "gateshead",
    "altrincham fc": "altrincham",
    "yeovil town fc": "yeovil",
    "worthing fc": "worthing",
    "carlisle united fc": "carlisle",
    "woking fc": "woking",
    "solihull moors fc": "solihull moors",
    "barrow afc": "barrow",
    "scunthorpe united fc": "scunthorpe",
    "hartlepool united fc": "hartlepool",
    "harrogate town afc": "harrogate",
    "fc halifax town": "fc halifax",
    "boston united fc": "boston utd"
  },
  "primera a": {
    "deportivo pereira": "pereira",
    "independiente santa fe": "santa fe"
  }
}))EVENT_ALIASES[league]={...EVENT_ALIASES[league],...aliases};
// Reviewed exact source/feed identities from 2026-09-29. League-scoped; no suffix stripping.
for(const [league,aliases] of Object.entries({
  "nhl": {
    "panthers": "florida panthers",
    "hurricanes": "carolina hurricanes",
    "canadiens": "montreal canadiens",
    "maple leafs": "toronto maple leafs",
    "rangers": "new york rangers",
    "bruins": "boston bruins",
    "canucks": "vancouver canucks",
    "oilers": "edmonton oilers",
    "blackhawks": "chicago blackhawks",
    "golden knights": "vegas golden knights"
  },
  "serie b": {
    "botafogo fc": "botafogo sp",
    "aa ponte preta": "ponte preta"
  },
  "uefa champions league women": {
    "paris fc": "paris fc w",
    "arsenal wfc": "arsenal w",
    "bk hacken ff": "hacken w",
    "juventus fc": "juventus w",
    "sport lisboa e benfica": "sl benfica w",
    "fc bayern munchen": "bayern munich w"
  },
  "national league": {
    "eastleigh fc": "eastleigh",
    "southend united fc": "southend",
    "tamworth fc": "tamworth",
    "sutton united fc": "sutton"
  },
  "liga 1": {
    "cs cienciano": "cienciano",
    "cd los chankas": "los chankas"
  },
  "liga de ascenso": {
    "union san felipe": "san felipe",
    "san luis de quillota": "san luis"
  },
  "liga auf uruguaya": {
    "montevideo city torque": "montevideo city",
    "ca penarol montevideo": "penarol"
  },
  "canadian premier league": {
    "atletico ottawa": "atl ottawa",
    "cavalry fc": "cavalry"
  },
  "mls": {
    "new york red bulls": "new york red bulls",
    "st louis city sc": "st louis city"
  },
  "club friendly": {
    "dc united": "dc united usa",
    "sc paderborn 07": "paderborn ger"
  }
}))EVENT_ALIASES[league]={...EVENT_ALIASES[league],...aliases};
// Further identities confirmed in the October 1 sport/day feed, with both opponents and kickoff.
for(const [league,aliases] of Object.entries({
 'nhl':{'lightning':'tampa bay lightning','flyers':'philadelphia flyers','devils':'new jersey devils','sabres':'buffalo sabres','blue jackets':'columbus blue jackets','wild':'minnesota wild','predators':'nashville predators','kraken':'seattle kraken','flames':'calgary flames'},
 'club friendly':{'vfb stuttgart':'stuttgart ger','greuther furth':'greuther furth ger','real betis seville':'betis esp','ad ceuta':'ceuta esp'},
 'uefa champions league women':{'hb køge':'koge w','hb koge':'koge w','fc internazionale milano':'inter w','manchester city wfc':'manchester city w','real madrid cf femenino':'real madrid w','paris saint germain fc':'psg w'},
 'serie b':{'sc recife':'sport recife','gremio novorizontino':'novorizontino','goias ec':'goias'},
 'copa argentina':{'ca platense':'platense','estudiantes de la plata':'estudiantes l p'}
}))EVENT_ALIASES[league]={...EVENT_ALIASES[league],...aliases};
// Both opponents, competition and kickoff checked against the October 5 sport feeds.
for(const [league,aliases] of Object.entries({
 'friendly international':{'dr congo':'d r congo'},
 'obos ligaen':{'moss fk':'moss','kongsvinger il toppfotball':'kongsvinger'},
 'laliga2':{'cordoba cf':'cordoba','cd tenerife':'tenerife'},
 'uefa nations league':{'turkiye':'turkey','bosnia and herzegovina':'bosnia herzegovina'},
 'liga profesional':{'cd riestra':'dep riestra','ca central cordoba':'central cordoba','ca velez sarsfield':'velez sarsfield','ca platense':'platense','estudiantes de la plata':'estudiantes l p','ca gimnasia y esgrima de mendoza':'gimnasia mendoza','ca banfield':'banfield','ca rosario central':'rosario central'},
 'liga auf uruguaya':{'club nacional de football':'nacional'},
 'nhl':{'senators':'ottawa senators','jets':'winnipeg jets','penguins':'pittsburgh penguins','sharks':'san jose sharks','stars':'dallas stars'},
 'icc cricket world cup league 2':{'uae':'united arab emirates'}
}))EVENT_ALIASES[league]={...EVENT_ALIASES[league],...aliases};
// Explicit October 7 feed identities; preserve sport, league, time and native order checks.
for(const [league,aliases] of Object.entries({
  "super league": {
    "fk neftchi fargona": "neftchi fargona",
    "xorazm fk urganch": "xorazm urganch"
  },
  "canadian premier league": {
    "inter toronto fc": "inter toronto",
    "fc supra du quebec": "supra du quebec"
  },
  "veikkausliiga": {
    "if gnistan": "gnistan",
    "fc inter turku": "inter turku"
  },
  "serie a betano": {
    "clube do remo": "remo",
    "gremio fbpa": "gremio",
    "red bull bragantino": "bragantino",
    "mirassol fc": "mirassol",
    "sc internacional": "internacional",
    "sc corinthians paulista": "corinthians",
    "ec vitoria": "vitoria",
    "associacao chapecoense de futebol": "chapecoense sc",
    "botafogo fr": "botafogo rj",
    "cr vasco da gama": "vasco",
    "cruzeiro ec": "cruzeiro",
    "sao paulo fc": "sao paulo"
  },
  "serie b": {
    "operario ferroviario ec": "operario pr",
    "botafogo fc": "botafogo sp",
    "avai fc": "avai",
    "londrina ec": "londrina",
    "cr brasil": "crb",
    "ac goianiense": "atletico go",
    "cuiaba ec": "cuiaba",
    "america fc": "america mg",
    "fortaleza ec": "fortaleza"
  },
  "nhl": {
    "avalanche": "colorado avalanche",
    "capitals": "washington capitals",
    "oilers": "edmonton oilers",
    "ducks": "anaheim ducks"
  },
  "wnba": {
    "las vegas aces": "las vegas aces w",
    "golden state valkyries": "golden state valkyries w"
  },
  "sheffield shield": {
    "new south wales blues": "new south wales",
    "tasmania tigers": "tasmania",
    "queensland bulls": "queensland"
  },
  "i liqa": {
    "sabail fk": "sabail",
    "fk karvan yevlakh": "karvan"
  }
}))EVENT_ALIASES[league]={...EVENT_ALIASES[league],...aliases};
LEAGUE_ALIASES.set('uzbekistan super league','super league');
LEAGUE_ALIASES.set('brasileirao serie a','serie a betano');
LEAGUE_ALIASES.set('azerbaijan first division','i liqa');
LEAGUE_ALIASES.set('veikkausliiga championship group','veikkausliiga');
// October 8 fixtures checked against sport/day feed AND real event pages.
for(const [league,aliases] of Object.entries({
 'usl league one':{'fort wayne fc':'fort wayne'},
 'qsl':{'al shamal':'shamal','al duhail sc':'al duhail','al wakrah sc':'al wakrah','al gharafa sc':'al gharafa'},
 'veikkausliiga':{'hjk helsinki':'hjk','vaasan palloseura':'vps','kuopion palloseura':'kups'},
 'botola pro':{'union touarga sports':'union touarga','rs berkane':'berkane','as far':'far rabat','wydad sportif temara':'widad temara','maghreb as de fes':'maghreb fez','raja club athletic':'raja casablanca'},
 'superliga':{'fc cfr 1907 cluj':'cfr cluj','fc universitatea cluj':'u cluj'},
 'liga 1':{'cd moquegua':'moquegua','ca grau':'grau','cd los chankas':'los chankas'},
 'premier division':{'drogheda united fc':'drogheda'},
 'primera b':{'independiente valle del cauca':'ind valle del cauca','tigres fc':'tigres'},
 'canadian premier league':{'forge fc hamilton':'forge'}
}))EVENT_ALIASES[league]={...EVENT_ALIASES[league],...aliases};
LEAGUE_ALIASES.set('qatar stars league','qsl');
LEAGUE_ALIASES.set('league of ireland premier division','premier division');
function eventName(p,league){const n=name(p);return EVENT_ALIASES[competition(league)]?.[n]||n;}
const TENNIS_TOURNAMENTS={'china open':'beijing','japan open tennis championships qualification':'tokyo qualification','china open qualification':'beijing qualification','japan open tennis championships':'tokyo','chengdu open':'chengdu','hangzhou open':'hangzhou','singapore open':'singapore','korea open':'seoul','genoa 2':'genova 2'};
// Explicit full-name variants verified against ATP/WTA profiles; never drop arbitrary middle names.
const TENNIS_IDENTITIES=new Map();
for(const variants of [["Carlos Alcaraz", "Carlos Alcaraz Garfia"], ["Dominic Stricker", "Dominic Stephan Stricker"], ["Adolfo Vallejo", "Daniel Vallejo", "Adolfo Daniel Vallejo"], ["Gabriela Ruse", "Elena Gabriela Ruse"], ["Jiajing Lu", "Jia Jing Lu"], ["Tomas Etcheverry", "Tomas Martin Etcheverry"], ["Viktoria Hruncakova", "Viktoria Kuzmova", "Viktoria Hruncakova Kuzmova"]]){const canonical=normalize(variants[0]).split(' ').sort().join(' ');for(const variant of variants)TENNIS_IDENTITIES.set(normalize(variant).split(' ').sort().join(' '),canonical);}
for(const variants of [['Tara Wuerth','Tara Wurth'],['Joel Schwaerzler','Joel Josef Schwaerzler','Joel Josef Schwarzler'],['Matthew William Donald','Matthew Donald']]){const canonical=normalize(variants[0]).split(' ').sort().join(' ');for(const variant of variants)TENNIS_IDENTITIES.set(normalize(variant).split(' ').sort().join(' '),canonical);}
function tennisTokens(value,isSlug=false){
  // Flashscore appends birth years to some full-name slugs. Preserve all name tokens.
  const text=isSlug?String(value).replace(/-(?:19|20)\d{2}$/,''):value;
  const tokens=normalize(text).split(' ').sort().join(' ');return TENNIS_IDENTITIES.get(tokens)||tokens;
}
// Reviewed event-specific rosters, not a surname/initial similarity algorithm.
const DOUBLES_IDENTITIES=require('./tennis-doubles-identities.json');
function doublesIdentity(facts){return facts.sport==='tennis'&&facts.tennis_doubles?DOUBLES_IDENTITIES.find(x=>x.source_event_id===facts.source_event_id&&x.league_code===facts.league_code&&x.source_competition===facts.competition&&JSON.stringify(x.source_participants)===JSON.stringify(facts.participants)):null;}
function participantOrder(facts,c){
  if(facts.sport==='tennis'&&facts.tennis_doubles){const x=doublesIdentity(facts);return x&&x.event_id===c.event_id&&JSON.stringify(x.participants)===JSON.stringify(c.participants)&&JSON.stringify(x.participant_ids)===JSON.stringify(c.participant_ids)?[0,1]:null;}
  const a=facts.participants.map(p=>eventName(p,facts.competition)),b=(c.participants||[]).map(p=>eventName(p,c.competition));
  if(a.length!==2||b.length!==2||a[0]===a[1])return null;
  if(facts.sport==='tennis'&&!facts.tennis_doubles&&c.participant_slugs?.length===2){
    // Full given/family names in source slugs, not surname/initial-only matching.
    const slugs=c.participant_slugs.map(p=>tennisTokens(p,true)),full=facts.participants.map(p=>tennisTokens(p));
    if(full[0]!==full[1]&&full.every((p,i)=>p===slugs[i]))return [0,1];
    if(full[0]!==full[1]&&full.every((p,i)=>p===slugs[1-i]))return [1,0];
  }
  if(a.every((p,i)=>p===b[i]))return [0,1];
  // Individually reviewed fixture: Polymarket lists Pacific first, Flashscore Forge.
  // Do not extend this exception to other soccer games or dates.
  if(facts.sport==='soccer'&&competition(facts.competition)==='canadian premier league'&&c.event_id==='b1W45lR8'&&facts.start_time==='2026-10-07T23:00:00.000Z'&&a[0]==='pacific fc'&&a[1]==='forge'&&a.every((p,i)=>p===b[1-i]))return [1,0];
  // US sports and tennis source titles need not list home/away in Flashscore order.
  if(['baseball','basketball','american-football','tennis','hockey'].includes(facts.sport)&&a.every((p,i)=>p===b[1-i]))return [1,0];
  return null;
}
function competitionMatches(facts,c){
  if(facts.sport==='tennis'&&c.competition_category){
    if(facts.tennis_doubles){const x=doublesIdentity(facts);return !!x&&x.competition===c.competition&&x.competition_category===c.competition_category;}
    if(!/SINGLES/.test(c.competition_category))return false;
    const title=c.competition.replace(/\s*\([^)]*\)/g,'').replace(/,\s*(?:hard|clay|grass|carpet).*$/i,'');
    const source=competition(facts.competition),target=competition(title),canonical=TENNIS_TOURNAMENTS[source]||source;
    if(target===canonical)return true;
    // An omitted ITF edition is allowed only when level/city match exactly; explicit editions must agree.
    return /^[mw]\d+ /.test(canonical)&&! / \d+$/.test(canonical)&&/^\d+$/.test(target.startsWith(canonical+' ')?target.slice(canonical.length+1):'');
  }
  return competition(c.competition)===competition(facts.competition);
}
const HOSTS={flashscore:['flashscore.com','www.flashscore.com'],hltv:['hltv.org','www.hltv.org'],vlr:['vlr.gg','www.vlr.gg'],gol:['gol.gg','www.gol.gg'],dotabuff:['dotabuff.com','www.dotabuff.com'],opendota:['opendota.com','www.opendota.com'],siegegg:['siege.gg','siegegg.com','www.siege.gg','www.siegegg.com'],liquipedia:['liquipedia.net']};
function directUrl(provider,url) {
  try { const u=new URL(url);if(u.protocol!=='https:'||!HOSTS[provider]?.includes(u.hostname))return false;
    return provider==='flashscore'?u.pathname.startsWith('/match/')&&!!u.searchParams.get('mid'):
      provider==='hltv'?/^\/matches\/\d+\//.test(u.pathname):provider==='vlr'?/^\/\d+\//.test(u.pathname):
      provider==='gol'?/\/game\/stats\/\d+/.test(u.pathname):
      provider==='dotabuff'||provider==='opendota'?/\/(matches|esports\/series)\/[\w-]+/.test(u.pathname):
      provider==='siegegg'?/\/matches\//.test(u.pathname):u.pathname.split('/').filter(Boolean).length>=3&&!/\/Team:/.test(u.pathname);
  } catch { return false; }
}
function matchEvent(facts,candidates,provider,error=null) {
  const base={provider,event_id:null,event_url:null,match_status:'unmatched',match_confidence:0,match_method:null,match_notes:error || 'No exact event confirmed'};
  if(!facts.participants.length||!facts.competition||!Number.isFinite(Date.parse(facts.start_time)))return {...base,match_notes:'Missing source participants, competition or start time'};
  const exact=candidates.filter(c=>c.provider===provider&&directUrl(provider,c.event_url)&&c.sport===facts.sport&&c.discipline===facts.discipline&&c.scope===facts.scope&&
    !c.identity_conflict&&participantOrder(facts,c)&&competitionMatches(facts,c)&&
    Number.isFinite(Date.parse(c.start_time))&&Math.abs(Date.parse(c.start_time)-Date.parse(facts.start_time))<=300000&&
    (!facts.best_of||c.best_of===facts.best_of));
  const unique=[...new Map(exact.map(c=>[c.event_id,c])).values()];
  if(unique.length>1)return {...base,match_status:'ambiguous',match_notes:'Multiple exact candidate events'};
  if(!unique.length){
    const pool=candidates.filter(c=>c.provider===provider&&c.sport===facts.sport),participants=pool.filter(c=>participantOrder(facts,c)),leagues=participants.filter(c=>competitionMatches(facts,c)),times=leagues.filter(c=>Math.abs(Date.parse(c.start_time)-Date.parse(facts.start_time))<=300000);
    const reason=!pool.length?'No sport feed candidates available':!participants.length?'Participants not confirmed in sport feeds':!leagues.length?'Competition not confirmed':!times.length?'Scheduled start differs by more than 5 minutes':'Discipline, scope, BO or consistent identity not confirmed';
    return {...base,match_notes:error?`${reason}; ${error}`:reason};
  }
  const c=unique[0];return {...base,event_id:c.event_id,event_url:c.event_url,match_status:'matched',match_confidence:1,
    match_method:'normalized_participants_competition_utc_time_scope',participant_order:participantOrder(facts,c),match_notes:'Verified participants with explicit order mapping; start within 5 minutes; competition and series/BO validation',evidence:c.evidence || null};
}
function analyticsFor(facts,candidates,errors={}) {
  if(facts.sport!=='esports')return matchEvent(facts,candidates,'flashscore',errors.flashscore);
  const providers=ROUTES[facts.discipline] || [];
  if(!providers.length)return {provider:null,event_id:null,event_url:null,match_status:'provider_not_available',match_confidence:0,match_method:null,match_notes:'Unknown esports discipline'};
  const attempts=providers.map(p=>matchEvent(facts,candidates,p,errors[p]));
  // An ambiguous primary mapping must not be disguised as a verified fallback.
  const primary=attempts[0];if(primary.match_status==='ambiguous')return {...primary,attempts};
  const selected=attempts.find(a=>a.match_status==='matched')||primary;
  return {...selected,primary_provider:providers[0],route_position:providers.indexOf(selected.provider),attempts};
}
const PERIODS={match:'FULL_TIME',half_1:'FIRST_HALF',half_2:'SECOND_HALF',set_1:'FIRST_SET',set_2:'SECOND_SET',quarter_1:'FIRST_QUARTER',period_1:'FIRST_PERIOD'};
const HALF_LINE=x=>Number.isFinite(x)&&Math.abs(x%1)===0.5;
function totalSelection(row){
  const m=String(row.outcome).trim().match(/^(Over|Under)(?:\s+(\d+(?:\.\d+)?))?$/i),line=row.outcome_line??row.line;
  if(!m||!Number.isFinite(line)||(m[2]!==undefined&&Number(m[2])!==line))return null;
  return {selection:m[1].toUpperCase(),line};
}
function setHandicapLine(row,facts){
  const prefix=row.market_type==='tennis_game_handicap'?'Game Spread':'Set Handicap';
  const m=String(row.question).match(new RegExp('^'+prefix+':\\s*(.+?)\\s*\\(([+-]?\\d+(?:\\.\\d+)?)\\)\\s+vs\\.?\\s+(.+?)\\s*\\(([+-]?\\d+(?:\\.\\d+)?)\\)$','i'));
  if(!m||Number(m[2])!==-Number(m[4]))return null;
  const names=[m[1],m[3]].map(name);if(names[0]===names[1]||!facts.participants.every(p=>names.includes(name(p))))return null;
  const i=names.indexOf(name(row.outcome));return i<0?null:Number(i===0?m[2]:m[4]);
}
// Half-unit spreads have no push. Require the named team and explicit sign from the question.
function spreadLine(row,facts){
  const prefix={spreads:'Spread',first_half_spreads:'(?:1H|1st Half) Spread',q1_spreads:'1Q Spread'}[row.market_type];
  if(!prefix)return null;
  const m=String(row.question).match(new RegExp('^'+prefix+':\\s*(.+?)\\s*\\(([+-]\\d+(?:\\.\\d+)?)\\)$','i'));
  if(!m||!facts.participants.some(p=>name(p)===name(m[1]))||!facts.participants.some(p=>name(p)===name(row.outcome)))return null;
  const signed=name(row.outcome)===name(m[1])?Number(m[2]):-Number(m[2]);
  if(!HALF_LINE(signed)||!Number.isFinite(row.line)||row.line!==Number(m[2])||(row.outcome_line!=null&&row.outcome_line!==signed))return null;
  return signed;
}
function usSport(row){return (row.sport==='baseball'&&row.league_code==='mlb')||(row.sport==='basketball'&&row.league_code==='wnba')||(row.sport==='hockey'&&row.league_code==='nhl')||(row.sport==='american-football'&&['cfb','nfl'].includes(row.league_code));}
// Exact binary propositions map to native bookmaker 1X2 / double-chance selections.
function soccerProposition(row,facts){
 const q=String(row.question),type=row.market_type;let team=null,draw=null;
 if(type==='moneyline'){team=q.match(/^Will (.+) win on \d{4}-\d{2}-\d{2}\?$/i);draw=q.match(/^Will (.+) end in a draw\?$/i);}
 if(type==='soccer_halftime_result'){team=q.match(/^(.+) leading at halftime\?$/i);draw=q.match(/^(.+): Draw at halftime\?$/i);}
 if(type==='soccer_second_half_result'){team=q.match(/^(.+) to win the second half\?$/i);draw=q.match(/^(.+): Second half draw\?$/i);}
 if(team){const i=facts.participants.findIndex(p=>name(p)===name(team[1]));return i===0?'HOME':i===1?'AWAY':null;}
 if(draw){const parts=draw[1].split(/\s+vs\.?\s+/i);if(parts.length===2&&parts.every((p,i)=>name(p)===name(facts.participants[i])))return 'DRAW';}
 return null;
}
function marketKey(row,facts) {
  let period=PERIODS[row.period];if(!period)return null;
  if((usSport(row)||(row.sport==='basketball'&&row.league_code==='wnba'))&&row.period==='match')period='FULL_TIME_OVER_TIME';
  const expectedPeriods={moneyline:['match'],soccer_halftime_result:['half_1'],soccer_second_half_result:['half_2'],tennis_first_set_winner:['set_1'],tennis_set_winner:['set_1','set_2'],totals:['match'],first_half_totals:['half_1'],second_half_totals:['half_2'],tennis_first_set_totals:['set_1'],tennis_match_totals:['match'],tennis_set_totals:['match'],both_teams_to_score:['match'],both_teams_to_score_first_half:['half_1'],both_teams_to_score_second_half:['half_2'],spreads:['match'],first_half_spreads:['half_1']};
  if(expectedPeriods[row.market_type]&&!expectedPeriods[row.market_type].includes(row.period))return null;
  const raw=name(row.outcome), side=facts.participants.findIndex(p=>name(p)===raw);
  const common={sport:row.sport,discipline:facts.discipline,period,participant:null,selection:null,line:null,metric:null};
  if(row.sport==='soccer'&&row.family==='winner'&&['moneyline','soccer_halftime_result','soccer_second_half_result'].includes(row.market_type)&&['yes','no'].includes(raw)){
    const proposition=soccerProposition(row,facts);if(!proposition)return null;
    return {...common,type:raw==='yes'?'HOME_DRAW_AWAY':'DOUBLE_CHANCE',selection:raw==='yes'?proposition:{HOME:'AWAY_DRAW',AWAY:'HOME_DRAW',DRAW:'HOME_AWAY'}[proposition]};
  }
  if(row.family==='winner' && ['moneyline','soccer_halftime_result','soccer_second_half_result','tennis_first_set_winner','tennis_set_winner'].includes(row.market_type)) {
    let selection=side>=0?(side===0?'HOME':'AWAY'):raw==='draw'?'DRAW':null;
    if(raw==='yes') {
      if(/end in a draw\?/i.test(row.question))selection='DRAW';
      else {const m=row.question.match(/^Will (.+) win on \d{4}-\d{2}-\d{2}\?$/);if(m){const i=facts.participants.findIndex(p=>name(p)===name(m[1]));selection=i===0?'HOME':i===1?'AWAY':null;}}
    }
    if(raw==='yes'&&row.sport==='soccer'&&row.market_type==='soccer_halftime_result'){
      const pattern=/^(.+) leading at halftime\?$/i;
      const m=String(row.question).match(pattern);if(m){const i=facts.participants.findIndex(p=>name(p)===name(m[1]));selection=i===0?'HOME':i===1?'AWAY':null;}
    }
    // A binary No is NOT a single 1X2 selection; no synthetic double-chance odds.
    if(!selection)return null;
    const type=row.sport==='soccer'?'HOME_DRAW_AWAY':(['tennis','esports'].includes(row.sport)||usSport(row)||(row.sport==='basketball'&&row.league_code==='wnba'))?'HOME_AWAY':null;
    return type?{...common,type,selection}:null;
  }
  // The confirmed 'Neither team to score first' proposition means 0-0 in regulation.
  // Its binary complement is at least one goal: use an actual 0.5-goals quote, never synthesize odds.
  if(row.sport==='soccer'&&row.market_type==='soccer_first_to_score'&&row.family==='first_score'&&row.period==='match'&&['yes','no'].includes(raw)){
    const m=String(row.question).match(/^(.+) vs\.? (.+): Neither team to score first\?$/i);
    if(m&&new Set(facts.participants.map(name)).size===2&&[m[1],m[2]].every(p=>facts.participants.some(t=>name(t)===name(p)))&&name(m[1])!==name(m[2]))
      return {...common,type:'OVER_UNDER',metric:'GOALS',selection:raw==='no'?'OVER':'UNDER',line:0.5};
  }
  const total=totalSelection(row);
  if(row.family==='totals'&&['totals','first_half_totals','second_half_totals'].includes(row.market_type)&&row.sport==='soccer'&&total)
    return {...common,type:'OVER_UNDER',metric:'GOALS',...total};
  if(usSport(row)&&row.family==='totals'&&total&&row.line===total.line&&HALF_LINE(total.line)&&((row.market_type==='totals'&&row.period==='match')||(row.sport==='american-football'&&((row.market_type==='first_half_totals'&&row.period==='half_1')||(row.market_type==='q1_totals'&&row.period==='quarter_1')))))
    return {...common,type:'OVER_UNDER',metric:row.sport==='baseball'?'RUNS':row.sport==='hockey'?'GOALS':'POINTS',...total};
  if(usSport(row)&&row.family==='handicap'&&side>=0&&((row.market_type==='spreads'&&row.period==='match')||(row.sport==='american-football'&&((row.market_type==='first_half_spreads'&&row.period==='half_1')||(row.market_type==='q1_spreads'&&row.period==='quarter_1'))))){
    const line=spreadLine(row,facts);if(line!==null)return {...common,type:'ASIAN_HANDICAP',metric:row.sport==='baseball'?'RUNS':row.sport==='hockey'?'GOALS':'POINTS',selection:side===0?'HOME':'AWAY',line};
  }
  if(row.sport==='tennis'&&total&&HALF_LINE(total.line)&&((row.family==='games_totals'&&['tennis_first_set_totals','tennis_match_totals'].includes(row.market_type))||(row.family==='sets_totals'&&row.market_type==='tennis_set_totals')))
    return {...common,type:'OVER_UNDER',metric:row.family==='sets_totals'?'SETS':'GAMES',...total};
  if(row.sport==='soccer'&&row.family==='both_score'&&['both_teams_to_score','both_teams_to_score_first_half','both_teams_to_score_second_half'].includes(row.market_type)&&['yes','no'].includes(raw))
    return {...common,type:'BOTH_TEAMS_TO_SCORE',selection:raw.toUpperCase()};
  if(row.sport==='soccer'&&row.family==='handicap'&&['spreads','first_half_spreads'].includes(row.market_type)&&side>=0){
    const line=row.outcome_line??spreadLine(row,facts);
    if(HALF_LINE(line))return {...common,type:'ASIAN_HANDICAP',metric:'GOALS',selection:side===0?'HOME':'AWAY',line};
  }
  if(row.sport==='tennis'&&row.family==='sets_handicap'&&row.market_type==='tennis_set_handicap'&&row.period==='match'&&side>=0){
    const line=setHandicapLine(row,facts);if(HALF_LINE(line))return {...common,type:'ASIAN_HANDICAP',metric:'SETS',selection:side===0?'HOME':'AWAY',line};
  }
  if(row.sport==='tennis'&&!facts.tennis_doubles&&row.family==='games_handicap'&&row.market_type==='tennis_game_handicap'&&row.period==='match'&&side>=0){
    const line=setHandicapLine(row,facts);if(HALF_LINE(line)&&Number.isFinite(row.line)&&Math.abs(row.line)===Math.abs(line)&&(row.outcome_line==null||row.outcome_line===line))return {...common,type:'ASIAN_HANDICAP',metric:'GAMES',selection:side===0?'HOME':'AWAY',line};
  }
  // Unsupported corners, team/player totals and settlement rules fail closed.
  return null;
}
const canonicalKey = key => key ? JSON.stringify([key.sport,key.discipline??null,key.type,key.period,key.metric??null,key.participant??null,key.selection,key.line??null]) : null;
function comparison(row,quotes,facts) {
  const key=canonicalKey(marketKey(row,facts));
  const quoteKey=q=>{
    if(q.event_participant_name&&['HOME_DRAW_AWAY','HOME_AWAY','ASIAN_HANDICAP','DOUBLE_CHANCE'].includes(q.canonical?.type)){
      const doubles=doublesIdentity(facts);
      const index=doubles?(q.event_id===doubles.event_id?doubles.participants.findIndex((p,i)=>p===q.event_participant_name&&doubles.participant_ids[i]===q.event_participant_id):-1):facts.participants.findIndex(p=>eventName(p,facts.competition)===eventName(q.event_participant_name,facts.competition)||(facts.sport==='tennis'&&q.event_participant_slug&&tennisTokens(p)===tennisTokens(q.event_participant_slug,true)));
      return index<0?null:canonicalKey({...q.canonical,selection:q.canonical.type==='DOUBLE_CHANCE'?(index===0?'HOME_DRAW':'AWAY_DRAW'):(index===0?'HOME':'AWAY')});
    }
    return canonicalKey(q.canonical);
  };
  const matching=key?quotes.filter(q=>quoteKey(q)===key&&q.active===true&&Number.isFinite(q.decimal_odds)&&q.decimal_odds>1):[];
  const groups=new Map();for(const q of matching){const id=String(q.bookmaker_id);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(q);}
  const bookmakers=[];for(const values of groups.values())if(values.length===1)bookmakers.push(values[0]);
  const bf=bookmakers.filter(q=>normalize(q.bookmaker_name)==='betfair');
  const betfair=bf.length===1?{matched:true,bookmaker:'Betfair',bookmaker_id:bf[0].bookmaker_id,decimal_odds:bf[0].decimal_odds,probability_percent:100/bf[0].decimal_odds,
    observed_at:bf[0].external_odds_observed_at,source_timestamp:bf[0].source_timestamp,match_method:'exact_semantic_key',match_confidence:1}:
    {matched:false,decimal_odds:null,probability_percent:null,reason:!key?'unsupported_or_unproven_market_semantics':bf.length>1?'ambiguous_betfair_quote':'betfair_selection_not_available'};
  return {betfair,bookmakers,comparison:{polymarket_probability_percent:row.probability_percent,betfair_probability_percent:betfair.probability_percent,
    probability_difference_pp:betfair.matched?row.probability_percent-betfair.probability_percent:null,method:'raw_implied_probability_no_margin_adjustment'}};
}
module.exports={normalize,name,discipline,isEsports,ROUTES,eventFacts,directUrl,matchEvent,analyticsFor,marketKey,canonicalKey,comparison,competition,participantOrder};
