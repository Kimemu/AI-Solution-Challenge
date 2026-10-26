/** 탐색 범위·주요 매체·단계 기준. 화면과 Node 서버가 함께 사용합니다. */
(function (root) {
  const continents = [
    ["all", "전 세계"],
    ["asia", "아시아"],
    ["europe", "유럽"],
    ["north-america", "북아메리카"],
    ["south-america", "남아메리카"],
    ["africa", "아프리카"],
    ["oceania", "오세아니아"],
  ].map(([id, name]) => ({ id, name }));
  // 통계상 1~5위라는 뜻이 아닌, 검색에 포함하는 주요 매체 5곳입니다.
  // code | 한국어 | 지도 이름 | 대륙 | 경도 | 위도 | 검색 별칭 | 언어 | 매체@도메인
  const rows = [
    "KR|대한민국|South Korea|asia|128|36|Korea,한국,서울,Seoul,Hanwha,한화|ko|연합뉴스@yna.co.kr;KBS@kbs.co.kr;조선일보@chosun.com;중앙일보@joongang.co.kr;한겨레@hani.co.kr",
    "JP|일본|Japan|asia|138|37|Tokyo,도쿄,일본,日本|ja|NHK@news.web.nhk;아사히신문@asahi.com;요미우리신문@yomiuri.co.jp;니혼게이자이신문@nikkei.com;마이니치신문@mainichi.jp",
    "CN|중국|China|asia|104|35|Chinese,Beijing,중국,中国,中國|zh-CN|신화통신@xinhuanet.com;인민일보@people.com.cn;CCTV@cctv.com;China Daily@chinadaily.com.cn;차이신@caixin.com",
    "IN|인도|India|asia|79|22|Indian,New Delhi,인도,ISRO|en|The Hindu@thehindu.com;Times of India@timesofindia.indiatimes.com;Indian Express@indianexpress.com;Hindustan Times@hindustantimes.com;NDTV@ndtv.com",
    "SG|싱가포르|Singapore|asia|103.8|1.3|싱가포르|en|CNA@channelnewsasia.com;The Straits Times@straitstimes.com;The Business Times@businesstimes.com.sg;Mothership@mothership.sg;Lianhe Zaobao@zaobao.com.sg",
    "ID|인도네시아|Indonesia|asia|118|-3|Indonesian,Jakarta,인도네시아|id|Kompas@kompas.com;Detik@detik.com;Tempo@tempo.co;The Jakarta Post@thejakartapost.com;Antara@antaranews.com",
    "VN|베트남|Vietnam|asia|108|16|Viet Nam,Hanoi,베트남|vi|VnExpress@vnexpress.net;Tuoi Tre@tuoitre.vn;Thanh Nien@thanhnien.vn;VietNamNet@vietnamnet.vn;Nhan Dan@nhandan.vn",
    "TH|태국|Thailand|asia|101|15|Thai,Bangkok,태국|th|Bangkok Post@bangkokpost.com;The Nation@nationthailand.com;Thai PBS@thaipbs.or.th;Thairath@thairath.co.th;Khaosod@khaosod.co.th",
    "MY|말레이시아|Malaysia|asia|102|4|Malaysian,Kuala Lumpur,말레이시아|en|The Star@thestar.com.my;New Straits Times@nst.com.my;Malaysiakini@malaysiakini.com;Bernama@bernama.com;Malay Mail@malaymail.com",
    "PH|필리핀|Philippines|asia|122|12|Philippine,Manila,필리핀|en|Philippine Daily Inquirer@inquirer.net;Philstar@philstar.com;ABS-CBN@abs-cbn.com;GMA News@gmanetwork.com;Rappler@rappler.com",
    "TW|대만|Taiwan|asia|121|24|Taiwanese,Taipei,대만,台灣,台湾|zh-Hant|중앙통신@cna.com.tw;자유시보@ltn.com.tw;연합신문@udn.com;중국시보@chinatimes.com;Taipei Times@taipeitimes.com",
    "KZ|카자흐스탄|Kazakhstan|asia|67|48|Kazakh,Astana,카자흐스탄|ru|Kazinform@inform.kz;Tengrinews@tengrinews.kz;Kazakhstanskaya Pravda@kazpravda.kz;The Astana Times@astanatimes.com;Kursiv@kz.kursiv.media",
    "AE|아랍에미리트|United Arab Emirates|asia|54|24|UAE,Emirati,Dubai,아랍에미리트,두바이|en|The National@thenationalnews.com;Gulf News@gulfnews.com;Khaleej Times@khaleejtimes.com;Emirates News Agency@wam.ae;Al Bayan@albayan.ae",
    "SA|사우디아라비아|Saudi Arabia|asia|45|24|Saudi,사우디,Riyadh|ar|Arab News@arabnews.com;Saudi Gazette@saudigazette.com.sa;Al Riyadh@alriyadh.com;Asharq Al-Awsat@aawsat.com;SPA@spa.gov.sa",
    "QA|카타르|Qatar|asia|51.2|25.3|Qatari,Doha,카타르|en|Al Jazeera@aljazeera.com;The Peninsula@thepeninsulaqatar.com;Gulf Times@gulf-times.com;QNA@qna.org.qa;Al Sharq@al-sharq.com",
    "IL|이스라엘|Israel|asia|35|31|Israeli,이스라엘|en|Haaretz@haaretz.com;The Jerusalem Post@jpost.com;The Times of Israel@timesofisrael.com;Ynet@ynetnews.com;Globes@globes.co.il",
    "GB|영국|United Kingdom|europe|-2|54|Britain,British,United Kingdom,영국,London|en|BBC@bbc.com;The Guardian@theguardian.com;Financial Times@ft.com;The Times@thetimes.com;Sky News@news.sky.com",
    "DE|독일|Germany|europe|10|51|German,Deutschland,독일,Berlin|de|ARD@tagesschau.de;ZDF@zdfheute.de;Der Spiegel@spiegel.de;Frankfurter Allgemeine@faz.net;Die Zeit@zeit.de",
    "FR|프랑스|France|europe|2|46|French,Paris,프랑스,CNES|fr|Le Monde@lemonde.fr;Le Figaro@lefigaro.fr;Franceinfo@francetvinfo.fr;France 24@france24.com;Les Echos@lesechos.fr",
    "ES|스페인|Spain|europe|-4|40|Spanish,España,스페인|es|El Pais@elpais.com;El Mundo@elmundo.es;RTVE@rtve.es;La Vanguardia@lavanguardia.com;ABC@abc.es",
    "IT|이탈리아|Italy|europe|12.5|42|Italian,Italia,이탈리아|it|Corriere della Sera@corriere.it;La Repubblica@repubblica.it;ANSA@ansa.it;Il Sole 24 Ore@ilsole24ore.com;RAI@rainews.it",
    "NL|네덜란드|Netherlands|europe|5|52|Dutch,네덜란드|nl|NOS@nos.nl;NU.nl@nu.nl;De Telegraaf@telegraaf.nl;de Volkskrant@volkskrant.nl;NRC@nrc.nl",
    "BE|벨기에|Belgium|europe|4.5|50.7|Belgian,벨기에,Brussels|fr|VRT@vrt.be;RTBF@rtbf.be;Le Soir@lesoir.be;De Standaard@standaard.be;La Libre@lalibre.be",
    "CH|스위스|Switzerland|europe|8|47|Swiss,스위스|de|SRF@srf.ch;Neue Zurcher Zeitung@nzz.ch;Tages-Anzeiger@tagesanzeiger.ch;Le Temps@letemps.ch;SWI@swissinfo.ch",
    "AT|오스트리아|Austria|europe|14|48|Austrian,오스트리아|de|ORF@orf.at;Der Standard@derstandard.at;Die Presse@diepresse.com;Kurier@kurier.at;Kronen Zeitung@krone.at",
    "PL|폴란드|Poland|europe|19|52|Polish,Polska,폴란드|pl|Onet@onet.pl;WP@wp.pl;Gazeta Wyborcza@wyborcza.pl;Rzeczpospolita@rp.pl;TVN24@tvn24.pl",
    "SE|스웨덴|Sweden|europe|16|62|Swedish,스웨덴|sv|SVT@svt.se;Sveriges Radio@sverigesradio.se;Dagens Nyheter@dn.se;Aftonbladet@aftonbladet.se;Svenska Dagbladet@svd.se",
    "NO|노르웨이|Norway|europe|9|62|Norwegian,노르웨이|no|NRK@nrk.no;VG@vg.no;Aftenposten@aftenposten.no;TV 2@tv2.no;Dagbladet@dagbladet.no",
    "FI|핀란드|Finland|europe|26|64|Finnish,핀란드|fi|Yle@yle.fi;Helsingin Sanomat@hs.fi;Ilta-Sanomat@is.fi;Iltalehti@iltalehti.fi;MTV@mtvuutiset.fi",
    "DK|덴마크|Denmark|europe|10|56|Danish,덴마크|da|DR@dr.dk;TV 2@tv2.dk;Politiken@politiken.dk;Berlingske@berlingske.dk;Jyllands-Posten@jyllands-posten.dk",
    "PT|포르투갈|Portugal|europe|-8|40|Portuguese,포르투갈|pt-PT|RTP@rtp.pt;SIC Noticias@sicnoticias.pt;Publico@publico.pt;Expresso@expresso.pt;Diario de Noticias@dn.pt",
    "GR|그리스|Greece|europe|23|39|Greek,그리스|el|Kathimerini@ekathimerini.com;ERT@ertnews.gr;To Vima@tovima.gr;Ta Nea@tanea.gr;Proto Thema@protothema.gr",
    "TR|튀르키예|Turkey|europe|35|39|Turkiye,Turkish,터키,튀르키예|tr|Anadolu@aa.com.tr;TRT@trtworld.com;Hurriyet@hurriyet.com.tr;Sozcu@sozcu.com.tr;Daily Sabah@dailysabah.com",
    "RU|러시아|Russia|europe|90|60|Russian,러시아,Росси|ru|TASS@tass.com;RIA Novosti@ria.ru;RBC@rbc.ru;Kommersant@kommersant.ru;The Moscow Times@themoscowtimes.com",
    "UA|우크라이나|Ukraine|europe|32|49|Ukrainian,Kyiv,우크라이나|uk|Ukrinform@ukrinform.net;Ukrainska Pravda@pravda.com.ua;The Kyiv Independent@kyivindependent.com;Interfax Ukraine@interfax.com.ua;NV@nv.ua",
    "CZ|체코|Czechia|europe|15|50|Czech,Czech Republic,체코|cs|CT24@ct24.ceskatelevize.cz;Seznam Zpravy@seznamzpravy.cz;iDNES@idnes.cz;Novinky@novinky.cz;Hospodarske Noviny@hn.cz",
    "IE|아일랜드|Ireland|europe|-8|53|Irish,아일랜드|en|RTE@rte.ie;The Irish Times@irishtimes.com;Irish Independent@independent.ie;The Journal@thejournal.ie;Irish Examiner@irishexaminer.com",
    "US|미국|United States of America|north-america|-101|38|United States,U.S.,U.S.A.,American,미국,NASA,SpaceX|en|AP@apnews.com;The New York Times@nytimes.com;The Washington Post@washingtonpost.com;CNN@cnn.com;The Wall Street Journal@wsj.com",
    "CA|캐나다|Canada|north-america|-106|56|Canadian,캐나다|en|CBC@cbc.ca;CTV@ctvnews.ca;Global News@globalnews.ca;The Globe and Mail@theglobeandmail.com;Toronto Star@thestar.com",
    "MX|멕시코|Mexico|north-america|-102|24|Mexican,멕시코|es|El Universal@eluniversal.com.mx;Milenio@milenio.com;Reforma@reforma.com;La Jornada@jornada.com.mx;El Financiero@elfinanciero.com.mx",
    "BR|브라질|Brazil|south-america|-52|-13|Brazilian,Brasil,브라질|pt-BR|G1@g1.globo.com;Folha de S.Paulo@folha.uol.com.br;O Globo@oglobo.globo.com;Estadao@estadao.com.br;UOL@uol.com.br",
    "AR|아르헨티나|Argentina|south-america|-64|-35|Argentine,아르헨티나|es|Clarin@clarin.com;La Nacion@lanacion.com.ar;Infobae@infobae.com;Pagina 12@pagina12.com.ar;TN@tn.com.ar",
    "CL|칠레|Chile|south-america|-71|-30|Chilean,칠레|es|La Tercera@latercera.com;Emol@emol.com;BioBioChile@biobiochile.cl;Cooperativa@cooperativa.cl;CNN Chile@cnnchile.com",
    "CO|콜롬비아|Colombia|south-america|-74|4|Colombian,콜롬비아|es|El Tiempo@eltiempo.com;El Espectador@elespectador.com;Semana@semana.com;Caracol@caracol.com.co;RCN@rcnradio.com",
    "PE|페루|Peru|south-america|-75|-10|Peruvian,페루|es|El Comercio@elcomercio.pe;La Republica@larepublica.pe;RPP@rpp.pe;Gestion@gestion.pe;Peru21@peru21.pe",
    "ZA|남아프리카공화국|South Africa|africa|25|-29|South African,남아공,남아프리카|en|News24@news24.com;SABC@sabcnews.com;TimesLIVE@timeslive.co.za;Daily Maverick@dailymaverick.co.za;Mail and Guardian@mg.co.za",
    "NG|나이지리아|Nigeria|africa|8|9|Nigerian,나이지리아|en|Punch@punchng.com;Vanguard@vanguardngr.com;Premium Times@premiumtimesng.com;Channels TV@channelstv.com;The Guardian Nigeria@guardian.ng",
    "KE|케냐|Kenya|africa|38|1|Kenyan,케냐|en|Daily Nation@nation.africa;The Standard@standardmedia.co.ke;Citizen Digital@citizen.digital;The Star@the-star.co.ke;Capital FM@capitalfm.co.ke",
    "EG|이집트|Egypt|africa|30|27|Egyptian,이집트|ar|Al-Ahram@ahram.org.eg;Al Masry Al Youm@almasryalyoum.com;Youm7@youm7.com;Daily News Egypt@dailynewsegypt.com;Egypt Today@egypttoday.com",
    "MA|모로코|Morocco|africa|-7|32|Moroccan,모로코|fr|Hespress@hespress.com;Le360@le360.ma;Le Matin@lematin.ma;Medias24@medias24.com;Morocco World News@moroccoworldnews.com",
    "AU|호주|Australia|oceania|134|-25|Australian,호주|en|ABC@abc.net.au;SBS@sbs.com.au;The Sydney Morning Herald@smh.com.au;The Australian@theaustralian.com.au;The Age@theage.com.au",
    "NZ|뉴질랜드|New Zealand|oceania|173|-41|뉴질랜드|en|RNZ@rnz.co.nz;Stuff@stuff.co.nz;NZ Herald@nzherald.co.nz;1News@1news.co.nz;The Post@thepost.co.nz",
  ];
  const countries = rows.map((row) => {
    const [
      code,
      name,
      mapName,
      continent,
      lon,
      lat,
      aliases,
      language,
      outlets,
    ] = row.split("|");
    return {
      code,
      name,
      mapName,
      continent,
      lon: +lon,
      lat: +lat,
      language,
      aliases: [name, mapName, ...aliases.split(",")],
      outlets: outlets.split(";").map((item) => {
        const [name, domain] = item.split("@");
        return { name, domain };
      }),
    };
  });
  const topics = [
    ["위성", "satellite,satellites,위성,衛星,卫星,satélite,satellit"],
    ["태양광", "solar,photovoltaic,Qcells,태양광,태양전지,solaire,太陽光"],
    [
      "인공지능",
      "artificial intelligence,machine learning,인공지능, AI ,人工智能",
    ],
    ["발사체", "launch,rocket,발사,로켓,launch vehicle,打ち上げ,火箭"],
    [
      "지구관측",
      "earth observation,remote sensing,지구관측,원격탐사,遥感,지구 관측",
    ],
    ["메탄", "methane,GHGSat,메탄,甲烷"],
    ["농업", "agriculture,agricultural,crop,crops,농업,작황,農業,agricultura"],
    ["해양·항만", "maritime,shipping,vessel,port,해양,선박,항만,海洋"],
    [
      "인프라",
      "infrastructure,InSAR,subsidence,ground motion,인프라,지반,지반변위",
    ],
    ["탄소·환경", "emission,emissions,carbon,climate,탄소,배출,기후,carbone"],
    [
      "에너지",
      "energy,renewable,battery,power,electricity,에너지,배터리,재생에너지,énergie,energia",
    ],
    [
      "투자·계약",
      "funding,investment,contract,acquisition,투자,계약,인수,자금조달",
    ],
    ["우주", "space,우주,宇宙,espacio,espace"],
    ["안보·방산", "defense,defence,security,안보,방산,국방,防衛"],
    ["통신", "telecom,broadband,Starlink,통신,communications,通信"],
    ["비용·예산", "cost,costs,budget,price,pricing,비용,예산,가격"],
    ["재난·산불", "wildfire,disaster,flood,산불,재난,홍수"],
  ].map(([word, aliases]) => ({ word, aliases: aliases.split(",") }));
  const gates = { diligence: 60, pilot: 75, approved: 85 };
  const templateSources = [
    {
      name: "HM Treasury · Five Case Model",
      url: "https://www.gov.uk/government/publications/the-green-book-appraisal-and-evaluation-in-central-government/the-green-book-2026",
    },
    {
      name: "Welsh Government · 사업제안서 템플릿",
      url: "https://www.gov.wales/five-case-model-templates",
    },
    {
      name: "SBA · 사업계획 및 초기 비용",
      url: "https://www.sba.gov/counseling/plan-your-business/",
    },
  ];
  const config = {
    countries,
    continents,
    topics,
    gates,
    templateSources,
    mediaReference:
      "https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2025/country-and-market-data",
  };
  if (typeof module === "object" && module.exports) module.exports = config;
  else root.OrbitalResearchConfig = config;
})(typeof window === "undefined" ? globalThis : window);
