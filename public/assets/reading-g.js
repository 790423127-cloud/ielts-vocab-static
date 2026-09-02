/* Static 便携版 · G类阅读提升 — vocab + paraphrases MCQ + separated status (v4 keys) */
(function () {
  "use strict";

  var STATUS_KEY = "ielts_reading_g_status_v3";
  var PARA_KEY = "ielts_reading_g_paraphrase_status_v3";
  var COVERAGE_KEY = "ielts_reading_g_para_coverage_v1";
  var REVIEW_KEY = "ielts_reading_g_paraphrase_review_v1";
  var PARA_SESSION_KEY = "ielts_reading_g_paraphrase_session_v1";
  var SESSION_KEY = "ielts_reading_g_session_v3";
  var POSITIONS_KEY = "ielts_reading_g_positions_v3";
  var TOP_TOOLS_KEY = "ielts_static_reading_g_tools_collapsed_v1";
  var ORDER_PREFS_KEY = "ielts_static_reading_g_order_preferences_v1";
  var MIG_V4 = "ielts_reading_g_migration_v4";
  var MIG_V5 = "ielts_reading_g_migration_v5";
  var DATA_URL = "./data/reading-g-vocab.json?v=20260826_logic_rule_v1";
  var PARA_URL = "./data/reading-g-paraphrases.json";
  var QUESTION_EVIDENCE_URL = "./data/reading-g-question-evidence.json";
  var DATA_VERSION = "20260830_system_safety_v80";
  var READING_G_BASIC_ZERO_KEYS = {"a":1,"about":1,"accept":1,"account":1,"across":1,"actor":1,"actress":1,"add":1,"address":1,"adult":1,"afraid":1,"after":1,"afternoon":1,"again":1,"against":1,"age":1,"ago":1,"agree":1,"airport":1,"alarm":1,"all":1,"allow":1,"almost":1,"alone":1,"along":1,"alphabet":1,"already":1,"also":1,"although":1,"always":1,"am":1,"ambulance":1,"america":1,"american":1,"among":1,"an":1,"and":1,"angry":1,"animal":1,"anniversary":1,"another":1,"answer":1,"ant":1,"any":1,"anybody":1,"anyone":1,"anything":1,"apart":1,"apartment":1,"app":1,"appear":1,"apple":1,"appointment":1,"april":1,"are":1,"arm":1,"armchair":1,"around":1,"arrive":1,"art":1,"artist":1,"as":1,"ask":1,"at":1,"atm":1,"august":1,"aunt":1,"australia":1,"australian":1,"autumn":1,"away":1,"baby":1,"back":1,"backpack":1,"bad":1,"badly":1,"badminton":1,"bag":1,"bake":1,"balcony":1,"ball":1,"banana":1,"bandage":1,"bank":1,"barber":1,"bargain":1,"baseball":1,"basketball":1,"bath":1,"bathroom":1,"battery":1,"be":1,"beach":1,"bean":1,"beans":1,"bear":1,"beard":1,"beautiful":1,"because":1,"become":1,"bed":1,"bedroom":1,"bee":1,"beef":1,"beer":1,"before":1,"begin":1,"behind":1,"believe":1,"bell":1,"belong":1,"belt":1,"beside":1,"between":1,"big":1,"bike":1,"bill":1,"bin":1,"bird":1,"birthday":1,"biscuit":1,"bitter":1,"black":1,"blackboard":1,"blanket":1,"blind":1,"blood":1,"blouse":1,"blue":1,"blueberry":1,"boat":1,"body":1,"boil":1,"boiled":1,"bone":1,"book":1,"bookshelf":1,"bookstore":1,"boot":1,"boots":1,"bored":1,"borrow":1,"boss":1,"both":1,"bottle":1,"bottom":1,"bowl":1,"box":1,"boy":1,"brain":1,"branch":1,"brave":1,"bread":1,"break":1,"breakfast":1,"bridge":1,"bright":1,"bring":1,"britain":1,"british":1,"brother":1,"brown":1,"brush":1,"build":1,"builder":1,"building":1,"burger":1,"bus":1,"businessman":1,"busy":1,"but":1,"butter":1,"butterfly":1,"button":1,"buy":1,"bye":1,"cabbage":1,"cable":1,"cafe":1,"cage":1,"cake":1,"calendar":1,"call":1,"calm":1,"camel":1,"camera":1,"camping":1,"can":1,"canada":1,"candy":1,"cap":1,"capital":1,"car":1,"card":1,"career":1,"careful":1,"carefully":1,"careless":1,"carpenter":1,"carpet":1,"carrot":1,"carry":1,"cash":1,"cashier":1,"cat":1,"catch":1,"cause":1,"celebrate":1,"cellphone":1,"center":1,"centre":1,"cereal":1,"chair":1,"chalk":1,"change":1,"charger":1,"chat":1,"cheap":1,"check":1,"cheek":1,"cheese":1,"chef":1,"cherry":1,"chess":1,"chest":1,"chicken":1,"child":1,"children":1,"chili":1,"chin":1,"china":1,"chinese":1,"chocolate":1,"choose":1,"chopsticks":1,"christmas":1,"church":1,"cinema":1,"circle":1,"city":1,"class":1,"classmate":1,"classroom":1,"clean":1,"cleaner":1,"clear":1,"clever":1,"click":1,"climb":1,"climbing":1,"clinic":1,"clock":1,"close":1,"closed":1,"clothes":1,"cloud":1,"cloudy":1,"club":1,"coat":1,"coconut":1,"coffee":1,"coin":1,"cola":1,"cold":1,"colleague":1,"collect":1,"color":1,"colour":1,"comb":1,"come":1,"company":1,"compare":1,"compete":1,"complain":1,"complete":1,"computer":1,"confused":1,"continue":1,"control":1,"cook":1,"cookie":1,"cooking":1,"cool":1,"copy":1,"corn":1,"corner":1,"correct":1,"cost":1,"couch":1,"cough":1,"count":1,"country":1,"countryside":1,"couple":1,"cousin":1,"cover":1,"cow":1,"crab":1,"crayon":1,"create":1,"credit card":1,"cross":1,"crossing":1,"crosswalk":1,"cry":1,"cucumber":1,"cup":1,"cupboard":1,"curtain":1,"customer":1,"cut":1,"cute":1,"cycling":1,"dad":1,"dance":1,"dangerous":1,"dark":1,"date":1,"daughter":1,"dawn":1,"day":1,"deadline":1,"deaf":1,"debit card":1,"december":1,"decide":1,"deep":1,"deer":1,"degree":1,"delay":1,"delicious":1,"delivery":1,"dentist":1,"describe":1,"desk":1,"dessert":1,"diary":1,"dictionary":1,"die":1,"different":1,"dining room":1,"dinner":1,"dirty":1,"disagree":1,"disappear":1,"discount":1,"discover":1,"discuss":1,"do":1,"doctor":1,"does":1,"dog":1,"doll":1,"dolphin":1,"donkey":1,"door":1,"doorbell":1,"down":1,"download":1,"downstairs":1,"dozen":1,"draw":1,"drawer":1,"drawing":1,"dream":1,"dress":1,"dress up":1,"drink":1,"drive":1,"driver":1,"drop":1,"dry":1,"duck":1,"dumpling":1,"during":1,"dusk":1,"each":1,"eagle":1,"ear":1,"early":1,"earn":1,"earth":1,"easily":1,"east":1,"easy":1,"eat":1,"egg":1,"eight":1,"eighteen":1,"eighth":1,"eighty":1,"either":1,"electrician":1,"elephant":1,"elevator":1,"eleven":1,"else":1,"email":1,"emergency":1,"employee":1,"empty":1,"end":1,"engineer":1,"england":1,"english":1,"enjoy":1,"enough":1,"enter":1,"environment":1,"eraser":1,"even":1,"evening":1,"every":1,"everybody":1,"everyone":1,"everything":1,"exam":1,"examine":1,"example":1,"except":1,"exchange":1,"excited":1,"excuse":1,"exercise":1,"expensive":1,"explain":1,"eye":1,"eyebrow":1,"face":1,"factory":1,"fail":1,"fall":1,"false":1,"family":1,"famous":1,"far":1,"farm":1,"farmer":1,"fashion":1,"fast":1,"fat":1,"father":1,"faucet":1,"fear":1,"feather":1,"february":1,"feed":1,"feel":1,"feet":1,"ferry":1,"festival":1,"fever":1,"few":1,"field":1,"fifteen":1,"fifth":1,"fifty":1,"fill":1,"film":1,"find":1,"fine":1,"finger":1,"finish":1,"fire":1,"fire station":1,"firefighter":1,"first":1,"fish":1,"fishing":1,"five":1,"fix":1,"flag":1,"flat":1,"floor":1,"flour":1,"flower":1,"flu":1,"fly":1,"fog":1,"foggy":1,"follow":1,"following":1,"food":1,"foot":1,"football":1,"for":1,"forehead":1,"forest":1,"forget":1,"fork":1,"form":1,"forty":1,"forward":1,"four":1,"fourteen":1,"fourth":1,"fox":1,"free":1,"freezer":1,"fresh":1,"friday":1,"fridge":1,"fried":1,"friend":1,"friendly":1,"frog":1,"from":1,"front":1,"fruit":1,"fry":1,"full":1,"fun":1,"funny":1,"fur":1,"future":1,"gallery":1,"game":1,"garage":1,"garden":1,"gardening":1,"garlic":1,"gas station":1,"get":1,"giraffe":1,"girl":1,"give":1,"glass":1,"globe":1,"glove":1,"gloves":1,"glue":1,"go":1,"goat":1,"golf":1,"good":1,"goodbye":1,"goose":1,"grade":1,"grandfather":1,"grandma":1,"grandmother":1,"grandpa":1,"grape":1,"grass":1,"gray":1,"great":1,"green":1,"grey":1,"ground":1,"group":1,"grow":1,"guess":1,"guest":1,"gym":1,"hair":1,"hairdresser":1,"half":1,"hamster":1,"hand":1,"handsome":1,"happen":1,"happily":1,"happy":1,"hard":1,"hardworking":1,"has":1,"hat":1,"hate":1,"have":1,"he":1,"head":1,"headache":1,"headteacher":1,"health":1,"healthy":1,"hear":1,"heart":1,"heavy":1,"helicopter":1,"hello":1,"help":1,"hen":1,"her":1,"here":1,"hers":1,"herself":1,"hi":1,"hide":1,"high":1,"hiking":1,"hill":1,"him":1,"himself":1,"hire":1,"his":1,"history":1,"hit":1,"hobby":1,"hold":1,"holiday":1,"home":1,"homework":1,"honey":1,"hoodie":1,"hope":1,"horse":1,"hospital":1,"hostel":1,"hot":1,"hotel":1,"hour":1,"house":1,"how":1,"how far":1,"how long":1,"how many":1,"how much":1,"how often":1,"how old":1,"however":1,"humid":1,"hundred":1,"hungry":1,"hurry":1,"hurt":1,"husband":1,"i":1,"ice":1,"ice cream":1,"icy":1,"idea":1,"if":1,"ill":1,"imagine":1,"important":1,"improve":1,"in":1,"in time":1,"include":1,"including":1,"injury":1,"inside":1,"interested":1,"internet":1,"interview":1,"into":1,"invite":1,"is":1,"island":1,"it":1,"its":1,"itself":1,"jacket":1,"jam":1,"january":1,"japan":1,"jeans":1,"job":1,"jogging":1,"join":1,"joke":1,"joy":1,"judge":1,"juice":1,"july":1,"jump":1,"jumper":1,"june":1,"just":1,"kangaroo":1,"keep":1,"kettle":1,"key":1,"keyboard":1,"kick":1,"kid":1,"kill":1,"kind":1,"kitchen":1,"kitten":1,"knee":1,"knife":1,"knock":1,"know":1,"lake":1,"lamb":1,"lamp":1,"laptop":1,"last":1,"late":1,"later":1,"laugh":1,"lawyer":1,"lazy":1,"lead":1,"leaf":1,"learn":1,"leave":1,"leaves":1,"left":1,"leg":1,"lemon":1,"lend":1,"lesson":1,"let":1,"letter":1,"lettuce":1,"library":1,"lie":1,"life":1,"lift":1,"light":1,"lightning":1,"like":1,"lime":1,"line":1,"lion":1,"lip":1,"listen":1,"little":1,"live":1,"living room":1,"lock":1,"login":1,"lonely":1,"long":1,"look":1,"lorry":1,"lose":1,"lot":1,"loud":1,"loudly":1,"love":1,"low":1,"lucky":1,"luggage":1,"lunch":1,"machine":1,"madam":1,"mailbox":1,"make":1,"mall":1,"man":1,"manager":1,"mango":1,"many":1,"map":1,"march":1,"mark":1,"marker":1,"market":1,"marry":1,"match":1,"math":1,"maths":1,"may":1,"maybe":1,"me":1,"meal":1,"mean":1,"measure":1,"meat":1,"medicine":1,"meet":1,"mention":1,"menu":1,"message":1,"messy":1,"metro":1,"mice":1,"microwave":1,"middle":1,"midnight":1,"milk":1,"million":1,"mind":1,"mine":1,"minute":1,"mirror":1,"miss":1,"mix":1,"mobile":1,"mom":1,"moment":1,"monday":1,"money":1,"monkey":1,"month":1,"moon":1,"more":1,"morning":1,"mosquito":1,"mother":1,"motorbike":1,"mountain":1,"mouse":1,"moustache":1,"mouth":1,"move":1,"movie":1,"mr":1,"mrs":1,"ms":1,"much":1,"mug":1,"mum":1,"museum":1,"mushroom":1,"music":1,"my":1,"myself":1,"nail":1,"name":1,"narrow":1,"nation":1,"nature":1,"near":1,"neck":1,"need":1,"neighbor":1,"neighbour":1,"neither":1,"nephew":1,"nervous":1,"never":1,"new":1,"new year":1,"next":1,"next to":1,"nice":1,"niece":1,"night":1,"nine":1,"nineteen":1,"ninety":1,"ninth":1,"no":1,"no one":1,"nobody":1,"noisy":1,"none":1,"noodle":1,"noodles":1,"noon":1,"normal":1,"north":1,"nose":1,"not":1,"note":1,"notebook":1,"nothing":1,"notice":1,"november":1,"now":1,"number":1,"nurse":1,"nut":1,"o'clock":1,"october":1,"octopus":1,"of":1,"off":1,"offer":1,"office":1,"often":1,"oil":1,"ok":1,"okay":1,"old":1,"on":1,"on time":1,"one":1,"onion":1,"online":1,"only":1,"onto":1,"open":1,"opposite":1,"or":1,"orange":1,"order":1,"other":1,"our":1,"ours":1,"ourselves":1,"out of":1,"outside":1,"oven":1,"over":1,"owl":1,"own":1,"pack":1,"package":1,"page":1,"pain":1,"paint":1,"painting":1,"pair":1,"pan":1,"pancake":1,"panda":1,"pants":1,"paper":1,"parent":1,"park":1,"parking":1,"parrot":1,"partner":1,"party":1,"pass":1,"passport":1,"password":1,"past":1,"pavement":1,"pay":1,"pe":1,"pea":1,"peach":1,"peanut":1,"pear":1,"pen":1,"pencil":1,"penguin":1,"people":1,"pepper":1,"per":1,"period":1,"person":1,"pet":1,"petrol station":1,"pharmacy":1,"phone":1,"photo":1,"pick":1,"picture":1,"pie":1,"pig":1,"pill":1,"pillow":1,"pilot":1,"pineapple":1,"pink":1,"pizza":1,"place":1,"plan":1,"plane":1,"plant":1,"plate":1,"play":1,"playground":1,"please":1,"plumber":1,"pocket":1,"point":1,"police":1,"police station":1,"policeman":1,"policewoman":1,"polite":1,"pollution":1,"pool":1,"poor":1,"popular":1,"pork":1,"porridge":1,"post office":1,"postman":1,"pot":1,"potato":1,"pour":1,"practice":1,"prefer":1,"prepare":1,"present":1,"press":1,"pretty":1,"previous":1,"price":1,"principal":1,"print":1,"printer":1,"problem":1,"project":1,"promise":1,"protect":1,"proud":1,"pull":1,"puppy":1,"purple":1,"purse":1,"push":1,"put":1,"put on":1,"puzzle":1,"quarter":1,"question":1,"queue":1,"quickly":1,"quiet":1,"quietly":1,"quite":1,"rabbit":1,"radio":1,"rain":1,"rainbow":1,"rainy":1,"raise":1,"rat":1,"rather":1,"raw":1,"reach":1,"read":1,"reading":1,"ready":1,"really":1,"receipt":1,"receive":1,"recess":1,"recover":1,"recycle":1,"red":1,"refrigerator":1,"refund":1,"refuse":1,"relax":1,"remain":1,"remember":1,"remind":1,"remove":1,"rent":1,"repair":1,"repeat":1,"reply":1,"report":1,"reporter":1,"rest":1,"restaurant":1,"resume":1,"retire":1,"return":1,"review":1,"rice":1,"rich":1,"ride":1,"right":1,"ring":1,"rise":1,"river":1,"road":1,"robot":1,"rock":1,"roll":1,"roof":1,"room":1,"roommate":1,"rooster":1,"root":1,"rough":1,"round":1,"rubbish":1,"rude":1,"rug":1,"ruler":1,"run":1,"running":1,"rush":1,"sad":1,"safe":1,"salad":1,"salary":1,"sale":1,"salesperson":1,"salt":1,"salty":1,"same":1,"sand":1,"sandal":1,"sandwich":1,"saturday":1,"sauce":1,"save":1,"say":1,"scared":1,"scarf":1,"schedule":1,"school":1,"science":1,"scientist":1,"scissors":1,"scooter":1,"score":1,"screen":1,"sea":1,"seafood":1,"season":1,"second":1,"secretary":1,"see":1,"seed":1,"seem":1,"sell":1,"send":1,"sentence":1,"september":1,"serious":1,"serve":1,"set":1,"seven":1,"seventeen":1,"seventh":1,"seventy":1,"several":1,"shadow":1,"shake":1,"shampoo":1,"share":1,"shark":1,"sharp":1,"she":1,"sheep":1,"sheet":1,"shelf":1,"shine":1,"ship":1,"shirt":1,"shoes":1,"shop":1,"short":1,"shorts":1,"shoulder":1,"shout":1,"show":1,"shower":1,"shrimp":1,"shut":1,"shy":1,"sick":1,"side":1,"sidewalk":1,"sign":1,"signal":1,"since":1,"sing":1,"singer":1,"singing":1,"sink":1,"sir":1,"sister":1,"sit":1,"six":1,"sixteen":1,"sixth":1,"sixty":1,"size":1,"skating":1,"skiing":1,"skin":1,"skirt":1,"sky":1,"sleep":1,"slippers":1,"slow":1,"slowly":1,"small":1,"smart":1,"smartphone":1,"smell":1,"smile":1,"smooth":1,"smoothie":1,"snack":1,"snake":1,"sneakers":1,"snow":1,"snowy":1,"so":1,"soap":1,"soccer":1,"socks":1,"soda":1,"sofa":1,"soft":1,"soil":1,"soldier":1,"some":1,"somebody":1,"someone":1,"something":1,"sometimes":1,"son":1,"song":1,"soon":1,"sorry":1,"sound":1,"soup":1,"sour":1,"south":1,"soy sauce":1,"speak":1,"special":1,"spell":1,"spend":1,"spicy":1,"spider":1,"spoon":1,"sport":1,"spring":1,"spring festival":1,"square":1,"stadium":1,"staff":1,"stairs":1,"stand":1,"star":1,"start":1,"starve":1,"station":1,"stay":1,"steal":1,"stick":1,"still":1,"stomach":1,"stomachache":1,"stone":1,"stop":1,"store":1,"storm":1,"stove":1,"strange":1,"stranger":1,"strawberry":1,"street":1,"strong":1,"student":1,"study":1,"stupid":1,"subject":1,"subway":1,"succeed":1,"such":1,"sugar":1,"suggest":1,"suit":1,"suitcase":1,"summer":1,"sun":1,"sunday":1,"sunny":1,"sunrise":1,"sunset":1,"supermarket":1,"support":1,"suppose":1,"sure":1,"surprise":1,"surprised":1,"sweater":1,"sweet":1,"swim":1,"swimming":1,"switch":1,"t-shirt":1,"table":1,"table tennis":1,"tablet":1,"tail":1,"take":1,"take off":1,"talk":1,"tall":1,"tame":1,"tap":1,"taste":1,"taxi":1,"tea":1,"teach":1,"teacher":1,"team":1,"tear":1,"teenager":1,"teeth":1,"tell":1,"temperature":1,"temple":1,"ten":1,"tennis":1,"tenth":1,"test":1,"text":1,"than":1,"thank":1,"thanks":1,"that":1,"the":1,"theater":1,"theatre":1,"their":1,"theirs":1,"them":1,"themselves":1,"then":1,"there":1,"therefore":1,"these":1,"they":1,"thick":1,"thin":1,"thing":1,"think":1,"third":1,"thirsty":1,"thirteen":1,"thirty":1,"this":1,"those":1,"though":1,"thousand":1,"three":1,"through":1,"throw":1,"thumb":1,"thunder":1,"thursday":1,"ticket":1,"tidy":1,"tie":1,"tiger":1,"time":1,"tired":1,"to":1,"toast":1,"today":1,"toe":1,"tofu":1,"together":1,"toilet":1,"tomato":1,"tomorrow":1,"tongue":1,"tonight":1,"too":1,"tool":1,"tooth":1,"toothache":1,"toothbrush":1,"toothpaste":1,"top":1,"touch":1,"tour":1,"towards":1,"towel":1,"town":1,"toy":1,"traffic light":1,"train":1,"trainers":1,"tram":1,"trash":1,"travel":1,"treat":1,"tree":1,"trip":1,"trousers":1,"truck":1,"true":1,"try":1,"try on":1,"tuesday":1,"turkey":1,"turn":1,"turtle":1,"tv":1,"twelve":1,"twenty":1,"two":1,"type":1,"ugly":1,"umbrella":1,"uncle":1,"under":1,"underground":1,"understand":1,"uniform":1,"unless":1,"unlucky":1,"until":1,"up":1,"upload":1,"upstairs":1,"us":1,"use":1,"useful":1,"useless":1,"vacation":1,"van":1,"vegetable":1,"very":1,"via":1,"video":1,"village":1,"vinegar":1,"visit":1,"voice":1,"volleyball":1,"vowel":1,"wage":1,"wait":1,"waiter":1,"waitress":1,"wake":1,"walk":1,"wall":1,"wallet":1,"want":1,"warm":1,"warn":1,"wash":1,"waste":1,"watch":1,"water":1,"watermelon":1,"wave":1,"way":1,"we":1,"weak":1,"wear":1,"weather":1,"website":1,"wednesday":1,"week":1,"weekday":1,"weekend":1,"weigh":1,"welcome":1,"well":1,"west":1,"wet":1,"whale":1,"what":1,"wheat":1,"when":1,"where":1,"whether":1,"which":1,"while":1,"white":1,"whiteboard":1,"who":1,"whole":1,"whom":1,"whose":1,"why":1,"wide":1,"wife":1,"wifi":1,"wild":1,"win":1,"wind":1,"window":1,"windy":1,"wine":1,"wing":1,"winter":1,"wish":1,"with":1,"within":1,"without":1,"wolf":1,"woman":1,"wonder":1,"word":1,"work":1,"worker":1,"world":1,"worm":1,"worried":1,"worry":1,"write":1,"writer":1,"writing":1,"wrong":1,"yard":1,"year":1,"yellow":1,"yes":1,"yesterday":1,"yet":1,"yoga":1,"yogurt":1,"you":1,"young":1,"your":1,"yours":1,"yourself":1,"yucky":1,"yummy":1,"zebra":1,"zero":1,"zip":1,"zoo":1};
  var ORDERING_MODULE_ROOT = "./study-ordering-v64/";
  var SESSION_SIZES = { guided: 10, quick: 20, full: 80 };
  var sharedWordStudyOrdering = null;
  var sharedWordDifficulty = null;

  function versionedDataUrl(url) {
    return url + (url.indexOf("?") >= 0 ? "&" : "?") + "v=" + encodeURIComponent(DATA_VERSION);
  }

  var words = [];
  var groups = [];
  var filter = { type: "pathStage", value: "1" };
  var statusMap = {};
  var paraMap = {};
  var index = 0;
  var study = [];
  var quizQueue = [];
  var quizPos = 0;
  var quizRevealed = false;
  var quizSelected = null;
  var quizSessionMode = "guided";
  var paraReview = { version: 1, groups: {}, updatedAt: 0 };
  var paraSession = null;
  var recallRevealed = false;
  var resumePending = false;
  var wordOrderMode = "current";
  var difficultyOrderMode = "default";
  var randomOrderSeed = Date.now();
  var coverage = {
    version: 1,
    seenGroupIds: [],
    currentCycleOrder: [],
    currentCycleIndex: 0,
    cycleNumber: 1,
    lastSessionGroupIds: [],
    sessionMode: "guided",
    sessionSize: 10
  };

  var els = {
    word: document.getElementById("word"),
    basic: document.getElementById("basic"),
    meaningDetail: document.getElementById("meaningDetail"),
    meaningDetailText: document.getElementById("meaningDetailText"),
    example: document.getElementById("example"),
    exampleCn: document.getElementById("exampleCn"),
    count: document.getElementById("count"),
    progressFill: document.getElementById("progressFill"),
    progressSeek: document.getElementById("progressSeek"),
    progressJumpBtn: document.getElementById("progressJumpBtn"),
    progressJump: document.getElementById("progressJump"),
    progressJumpInput: document.getElementById("progressJumpInput"),
    progressJumpTotal: document.getElementById("progressJumpTotal"),
    progressJumpCancel: document.getElementById("progressJumpCancel"),
    progressPreview: document.getElementById("progressPreview"),
    favoriteBtn: document.getElementById("favoriteBtn"),
    unfamiliarAlert: document.getElementById("unfamiliarAlert"),
    bankMeta: document.getElementById("bankMeta"),
    topicBar: document.getElementById("topicBar"),
    toast: document.getElementById("toast"),
    knownBtn: document.getElementById("knownBtn"),
    unknownBtn: document.getElementById("unknownBtn"),
    loadInfo: document.getElementById("loadInfo"),
    quizBox: document.getElementById("quizBox"),
    quizOptions: document.getElementById("quizOptions"),
    quizExplain: document.getElementById("quizExplain"),
    swipeArea: document.getElementById("swipeArea"),
    exampleCard: document.querySelector(".example-card"),
    relationBlocks: document.getElementById("relationBlocks"),
    readingTopbar: document.getElementById("readingTopbar"),
    topToolsToggle: document.getElementById("topToolsToggle"),
    hfQuickEntryBtn: document.getElementById("hfQuickEntryBtn"),
    hfQuickEntryCount: document.getElementById("hfQuickEntryCount"),
    part12OnlyHfQuickEntryBtn: document.getElementById("part12OnlyHfQuickEntryBtn"),
    part12OnlyHfQuickEntryCount: document.getElementById("part12OnlyHfQuickEntryCount"),
    unfamiliarQuickEntryBtn: document.getElementById("unfamiliarQuickEntryBtn"),
    unfamiliarQuickEntryCount: document.getElementById("unfamiliarQuickEntryCount"),
    readingEntryBtn: document.getElementById("readingEntryBtn"),
    readingControlsClose: document.getElementById("readingControlsClose"),
    wordOrderSelect: document.getElementById("wordOrderSelect"),
    difficultyOrderSelect: document.getElementById("difficultyOrderSelect"),
    entrySelect: document.getElementById("entrySelect"),
    readingControls: document.getElementById("readingControls"),
    readingControlsSummary: document.getElementById("readingControlsSummary"),
    articleFrequencyPanel: document.getElementById("articleFrequencyPanel"),
    articleFrequencyTier: document.getElementById("articleFrequencyTier"),
    articleFrequencyWord: document.getElementById("articleFrequencyWord"),
    articleFrequencyStats: document.getElementById("articleFrequencyStats"),
    articleFrequencySurfaces: document.getElementById("articleFrequencySurfaces"),
    articleFrequencyRestartBtn: document.getElementById("articleFrequencyRestartBtn"),
    articleFrequencyRangesBtn: document.getElementById("articleFrequencyRangesBtn")
  };

  var autoPlayActive = false;
  var autoPlaySeconds = 6;
  var autoPlayTimer = null;
  var pendingArticleHighFrequency = false;
  var ARTICLE_HF_FILTER = { type: "layer", value: "part12ArticleHighFrequency" };
  var ARTICLE_HF_LABEL = "剑雅5–21文章高频（Part 1–3）";
  var PART12_ONLY_HF_FILTER = { type: "part12OnlyHighFrequency", value: "" };
  var PART12_ONLY_HF_LABEL = "剑雅5–21文章高频（Part 1–2）";
  var ARTICLE_REST_FILTER = { type: "articleNonHighFrequency", value: "" };
  var ARTICLE_REST_LABEL = "其余词汇（非文章高频）";
  var UNFAMILIAR_FILTER = { type: "status", value: "不熟" };
  var UNFAMILIAR_LABEL = "不熟复习";

  function requestedStudyEntry() {
    try {
      return new URLSearchParams(window.location.search).get("entry") || "";
    } catch (error) {
      return "";
    }
  }

  function requestedArticleHighFrequency() {
    return requestedStudyEntry() === "part12ArticleHighFrequency";
  }

  function requestedPart12OnlyHighFrequency() {
    return requestedStudyEntry() === "part12OnlyHighFrequency";
  }

  function requestedArticleRest() {
    return requestedStudyEntry() === "articleNonHighFrequency";
  }

  function requestedUnfamiliar() {
    return requestedStudyEntry() === "unfamiliar" || requestedStudyEntry() === "不熟";
  }

  function openArticleHighFrequency() {
    if (!words.length) {
      pendingArticleHighFrequency = true;
      toast("正在载入词库，载入后进入文章高频");
      return;
    }
    pendingArticleHighFrequency = false;
    setEntryPanelOpen(false);
    setFilter(ARTICLE_HF_FILTER);
    toast("已进入文章高频 · " + study.length + " 个词条");
  }
  window.openReadingGArticleHighFrequency = openArticleHighFrequency;

  function openPart12OnlyHighFrequency() {
    if (!words.length) {
      pendingArticleHighFrequency = "part12Only";
      toast("正在载入词库，载入后进入 Part 1+2 文章高频");
      return;
    }
    pendingArticleHighFrequency = false;
    setEntryPanelOpen(false);
    setFilter(PART12_ONLY_HF_FILTER);
    toast("已进入 Part 1+2 文章高频 · " + study.length + " 个词条");
  }
  window.openReadingGPart12OnlyHighFrequency = openPart12OnlyHighFrequency;

  function openArticleRest() {
    if (!words.length) {
      pendingArticleHighFrequency = "rest";
      toast("正在载入词库，载入后进入其余词汇");
      return;
    }
    pendingArticleHighFrequency = false;
    setEntryPanelOpen(false);
    setFilter(ARTICLE_REST_FILTER);
    toast("已进入其余词汇 · " + study.length + " 个词条");
  }
  window.openReadingGArticleRest = openArticleRest;

  function openUnfamiliar() {
    if (!words.length) {
      pendingArticleHighFrequency = "unfamiliar";
      toast("正在载入词库，载入后进入不熟复习");
      return;
    }
    pendingArticleHighFrequency = false;
    setEntryPanelOpen(false);
    setFilter(UNFAMILIAR_FILTER);
    toast("已进入不熟复习 · " + study.length + " 个词条");
  }
  window.openReadingGUnfamiliar = openUnfamiliar;

  function filterSummaryLabel() {
    if (filter.type === "paraphraseQuiz") {
      if (filter.sessionMode === "quick") return "快速测验 · 本轮20题";
      if (filter.sessionMode === "full") return "完整测验 · 本轮80题";
      return "引导学习 · 本轮10组";
    }
    if (filter.type === "learnMode") return filter.value === "phrase" ? "短语学习" : "词义学习";
    if (filter.type === "pathStage") {
      var stageLabels = { "1": "基础保分", "2": "扩大覆盖", "3": "文章强化", "4": "参考查阅" };
      return "阶段" + (filter.value || "1") + "：" + (stageLabels[filter.value || "1"] || "阅读路线");
    }
    if (filter.type === "status") {
      if (filter.value === "不熟") return UNFAMILIAR_LABEL;
      return filter.value || "学习状态";
    }
    if (filter.type === "contentIncomplete") return "资料待修复";
    if (filter.type === "synonymPending") return "同义替换待补全";
    if (filter.type === "synonymReviewedNone") return "同义替换：已核查无结果";
    if (filter.type === "articleNonHighFrequency") return ARTICLE_REST_LABEL;
    if (filter.type === "part12OnlyHighFrequency") return PART12_ONLY_HF_LABEL;
    if (filter.type === "layer") {
      var layerLabels = {
        logic120: "逻辑转换（完整词书）",
        gtPart12Phrases150: "G4-G21 Part1-2考试短语150",
        part12ArticleHighFrequency: ARTICLE_HF_LABEL,
        paraCore600: "表达识别核心",
        paraExt500: "表达识别扩展",
        questionBankActive: "全题库补充（已有资料）",
        questionBankAiCompleted: "全题库补充（AI已补全）",
        questionBankPending: "全题库待补资料"
      };
      return layerLabels[filter.value] || "专项分层";
    }
    if (filter.type === "active") return "全部待学";
    return "当前学习范围";
  }

  function updateControlsSummary() {
    if (!els.readingControlsSummary) return;
    var total = isQuiz() ? eligibleGroups().length + "组安全题库" : study.length + "个词条";
    els.readingControlsSummary.innerHTML =
      "<strong>当前范围</strong> · " + filterSummaryLabel() + " · " + total;
  }

  function setEntryPanelOpen(open) {
    if (!els.readingControls) return;
    els.readingControls.classList.toggle("hidden", !open);
    if (els.readingEntryBtn) els.readingEntryBtn.setAttribute("aria-expanded", String(open));
  }

  function setTopToolsCollapsed(collapsed, persist) {
    if (els.readingTopbar) els.readingTopbar.classList.toggle("is-tools-collapsed", !!collapsed);
    if (els.topToolsToggle) {
      els.topToolsToggle.setAttribute("aria-expanded", String(!collapsed));
      els.topToolsToggle.textContent = "工具与词库";
    }
    if (persist) {
      try { localStorage.setItem(TOP_TOOLS_KEY, collapsed ? "1" : "0"); } catch (e) {}
    }
  }

  function toast(msg) {
    if (!els.toast) return;
    els.toast.textContent = msg || "";
    els.toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      els.toast.classList.remove("show");
    }, 1800);
  }

  function loadJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  function nk(word) {
    return String(word || "")
      .trim()
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/\s+/g, " ");
  }

  function entryKey(item) {
    if (!item) return "";
    if (item.id) return String(item.id);
    var t = item.entryType === "phrase" || /\s/.test(item.word || "") ? "phrase" : "word";
    return t + "::" + (item.normalizedKey || nk(item.word));
  }

  function questionEvidenceKey(source) {
    var book = String((source && source.book) || "").trim();
    var test = String((source && source.test) || "").trim();
    var part = String((source && source.part) || "").trim();
    var question = Number(source && source.question);
    if (!book || !test || !part || !Number.isInteger(question) || question < 1) return "";
    return [book, test, part, question].join("|");
  }

  function enrichQuestionSources(rawGroups, evidence) {
    var map = {};
    (evidence && evidence.questions ? evidence.questions : []).forEach(function (entry) {
      var key = questionEvidenceKey(entry);
      if (key && !map[key]) map[key] = entry;
    });
    return (rawGroups || []).map(function (group) {
      var seen = {};
      var sources = (group.sources || []).map(function (source) {
        var key = questionEvidenceKey(source);
        var detail = key ? map[key] : null;
        var answerSentence = String((detail && detail.answerSentence) || source.answerSentence || "").trim();
        return Object.assign({}, source, {
          key: key,
          questionType: String((detail && detail.questionType) || "").trim(),
          instructions: String((detail && detail.instructions) || "").trim(),
          answer: String((detail && detail.answer) || "").trim(),
          answerSentence: answerSentence,
          answerSentenceStatus: (detail && detail.answerSentenceStatus) || (answerSentence ? "available" : "needs_location"),
          evidenceStatus: detail ? "linked" : "unmapped"
        });
      }).filter(function (source) {
        var sourceKey = source.key || [source.book || "", source.test || "", source.part || "", source.question || "", source.answerSentence || ""].join("|");
        if (!sourceKey || seen[sourceKey]) return false;
        seen[sourceKey] = true;
        return true;
      });
      return Object.assign({}, group, { sources: sources });
    });
  }

  function questionEvidenceHtml(group) {
    var sources = group && Array.isArray(group.sources) ? group.sources : [];
    if (!sources.length) {
      return '<section class="para-evidence"><div class="para-evidence-head"><strong>原题证据</strong><span>未关联</span></div><p class="para-evidence-empty">当前是已审核同义关系，尚未关联具体题号。</p></section>';
    }
    return '<section class="para-evidence"><div class="para-evidence-head"><strong>原题答案句与题型</strong><span>' + sources.length + ' 条来源</span></div><div class="para-evidence-list">' + sources.map(function (source) {
      var location = [source.book, source.test, source.part, source.question ? '第 ' + source.question + ' 题' : ''].filter(Boolean).join(' · ');
      var type = source.questionType ? '题型：' + source.questionType : '题型：题源未映射';
      var detail = source.answerSentenceStatus === 'needs_location'
        ? '<p class="para-evidence-pending">原题已收录，答案句待人工定位。</p>'
        : source.answerSentence
          ? '<p class="para-evidence-sentence">' + esc(source.answerSentence) + '</p>'
          : '<p class="para-evidence-pending">当前关系的旧来源未提供答案句。</p>';
      return '<article class="para-evidence-item"><div class="para-evidence-meta"><span>' + esc(location) + '</span><strong>' + esc(type) + '</strong></div>' + (source.answer ? '<div class="para-evidence-answer">答案：' + esc(source.answer) + '</div>' : '') + detail + '</article>';
    }).join('') + '</div></section>';
  }

  function filterKey(value) {
    if (!value || typeof value !== "object") return "stage1";
    if (value.type === "all") return "all";
    if (value.type === "everything") return "everything";
    if (value.type === "stage1") return "stage1";
    if (value.type === "pathStage") return "pathStage:" + (value.value || "");
    if (value.type === "active") return "active";
    if (value.type === "reference") return "reference";
    if (value.type === "paraphrase") return "paraphrase";
    if (value.type === "paraphraseQuiz") return "paraphraseQuiz";
    if (value.type === "learnMode") return "learnMode:" + (value.value || "");
    return String(value.type || "stage1") + ":" + (value.value || "");
  }

  function findStudyIndexByKey(key) {
    var normalized = String(key || "");
    if (!normalized) return -1;
    for (var i = 0; i < study.length; i++) {
      var sourceIndex = study[i];
      var item = words[sourceIndex];
      var aliases = Array.isArray(item && item.mergedAliases) ? item.mergedAliases : [];
      if (
        entryKey(item) === normalized ||
        nk(item && item.word) === normalized ||
        aliases.some(function (alias) {
          return String(alias && alias.id || "") === normalized || nk(alias && (alias.key || alias.word)) === normalized;
        })
      ) {
        return sourceIndex;
      }
    }
    return -1;
  }

  function restoreStudyPosition(nextFilter) {
    var positions = loadJson(POSITIONS_KEY, {}) || {};
    var savedKey = positions[filterKey(nextFilter || filter)];
    var found = findStudyIndexByKey(savedKey);
    if (found < 0) return false;
    index = found;
    return true;
  }

  function saveSession() {
    if (isQuiz()) return;
    var item = words[index];
    var key = entryKey(item);
    if (!key) return;
    var positions = loadJson(POSITIONS_KEY, {}) || {};
    positions[filterKey(filter)] = key;
    saveJson(POSITIONS_KEY, positions);
    saveJson(SESSION_KEY, {
      wordKey: key,
      filter: filter,
      index: index,
      savedAt: new Date().toISOString()
    });
  }

  function restoreSession() {
    var saved = loadJson(SESSION_KEY, null);
    if (!saved || !saved.filter || saved.filter.type === "paraphraseQuiz") return false;
    filter = saved.filter;
    loadOrderPreferences();
    rebuildStudy();
    if (!study.length) return true;

    var key = String(saved.wordKey || "");
    var found = findStudyIndexByKey(key);
    if (found < 0 && restoreStudyPosition(filter)) found = index;
    if (found < 0 && Number.isInteger(saved.index) && study.indexOf(saved.index) >= 0) {
      found = saved.index;
    }
    index = found >= 0 ? found : study[0];
    return true;
  }

  function applyMergedCloudProgress() {
    statusMap = readStatusMap();
    paraMap = loadJson(PARA_KEY, {}) || {};
    paraReview = loadJson(REVIEW_KEY, { version: 1, groups: {}, updatedAt: 0 }) || { version: 1, groups: {}, updatedAt: 0 };
    loadCoverage();
    loadOrderPreferences();
    if (!words.length) return;

    var savedNavigation = loadJson(SESSION_KEY, null);
    var savedParaSession = loadJson(PARA_SESSION_KEY, null);
    var shouldResumeParaSession = savedNavigation
      && savedNavigation.filter
      && savedNavigation.filter.type === "paraphraseQuiz";
    if (shouldResumeParaSession && savedParaSession && !savedParaSession.completed && Array.isArray(savedParaSession.currentSessionGroupIds) && savedParaSession.currentSessionGroupIds.length) {
      filter = { type: "paraphraseQuiz", value: "", sessionMode: savedParaSession.mode === "wrongReview" ? "guided" : savedParaSession.mode };
      hydrateQuizSession(savedParaSession);
      resumePending = true;
    } else if (!restoreSession()) {
      rebuildStudy();
      restoreStudyPosition(filter);
    }
    if (requestedArticleHighFrequency()) {
      filter = ARTICLE_HF_FILTER;
      rebuildStudy();
      if (!restoreStudyPosition(filter)) resetStudyToStart();
    }
    renderTopics();
    render();
  }

  function normalizeEntry(entry, i) {
    if (!entry || typeof entry !== "object") return null;
    var word = String(entry.word || "").trim();
    if (!word) return null;
    var entryType =
      entry.entryType === "phrase" || /\s/.test(word) ? "phrase" : "word";
    var meaning = String(
      entry.primaryMeaningZh || entry.meaning || entry.meaningZh || entry.definition || ""
    ).trim();
    var layers = Array.isArray(entry.layers) ? entry.layers.slice() : [];
    var rawCategory = String(entry.category || "IELTS G类 · 阅读核心").trim();
    return {
      id: entry.id || "rg_" + entryType + "_" + i,
      entryType: entryType,
      word: word,
      normalizedKey: entry.normalizedKey || nk(word),
      phonetic: String(entry.phonetic || "").trim(),
      pos: String(entry.primaryPos || entry.pos || (entryType === "phrase" ? "phrase" : "")).trim(),
      primaryPos: String(entry.primaryPos || entry.pos || "").trim(),
      declaredPos: String(entry.declaredPos || entry.declaredPartOfSpeech || entry.pos || entry.primaryPos || "").trim(),
      rawPos: String(entry.pos || entry.primaryPos || "").trim(),
      primaryMeaningZh: meaning,
      meaning: meaning,
      meaningZh: meaning,
      meaningDetailZh: String(entry.meaningDetailZh || entry.meaningDetailedZh || "").trim(),
      definition: String(entry.definition || meaning).trim(),
      example: String(entry.example || "").trim(),
      exampleCn: String(entry.exampleCn || entry.exampleZh || "").trim(),
      exampleZh: String(entry.exampleZh || entry.exampleCn || "").trim(),
      layers: layers,
      primaryLayer: String(entry.primaryLayer || layers[0] || "").trim(),
      phraseStudyStage: Number(entry.phraseStudyStage) || 0,
      part12PhraseTier: String(entry.part12PhraseTier || "").trim(),
      part12ExamTag: String(entry.part12ExamTag || "").trim(),
      part12ExamSource: String(entry.part12ExamSource || "").trim(),
      part12SourcePhrase: String(entry.part12SourcePhrase || "").trim(),
      acceptedAnswers: Array.isArray(entry.acceptedAnswers) ? entry.acceptedAnswers : [],
      studyMode: entry.studyMode === "reference" ? "reference" : "active",
      senses: Array.isArray(entry.senses) ? entry.senses : [],
      otherMeanings: Array.isArray(entry.otherMeanings) ? entry.otherMeanings : [],
      meaningsZh: Array.isArray(entry.meaningsZh) ? entry.meaningsZh : [],
      forms: Array.isArray(entry.forms) ? entry.forms : [],
      wordFamily: Array.isArray(entry.wordFamily) ? entry.wordFamily : [],
      collocations: Array.isArray(entry.collocations) ? entry.collocations : [],
      phraseCollocations: Array.isArray(entry.phraseCollocations) ? entry.phraseCollocations : [],
      synonyms: Array.isArray(entry.synonyms) ? entry.synonyms : [],
      synonymDetails: Array.isArray(entry.synonymDetails) ? entry.synonymDetails : [],
      mergedAliases: Array.isArray(entry.mergedAliases) ? entry.mergedAliases : [],
      mergedEntries: Array.isArray(entry.mergedEntries) ? entry.mergedEntries : [],
      formsReviewed: entry.formsReviewed === true,
      wordFamilyReviewed: entry.wordFamilyReviewed === true,
      synonymsReviewed: entry.synonymsReviewed === true,
      synonymsReviewSource: String(entry.synonymsReviewSource || "").trim(),
      difficulty: String(entry.difficulty || "中级核心").trim() || "中级核心",
      category: rawCategory,
      studyDifficultyScore: entry.studyDifficultyScore !== null
        && entry.studyDifficultyScore !== undefined
        && String(entry.studyDifficultyScore).trim() !== ""
        && Number.isFinite(Number(entry.studyDifficultyScore))
        ? Number(entry.studyDifficultyScore)
        : null,
      topics: Array.isArray(entry.topics) ? entry.topics : [],
      part12ArticleFrequency: entry.part12ArticleFrequency && typeof entry.part12ArticleFrequency === "object"
        ? {
            articleCount: Number(entry.part12ArticleFrequency.articleCount) || 0,
            occurrenceCount: Number(entry.part12ArticleFrequency.occurrenceCount) || 0,
            part1ArticleCount: Number(entry.part12ArticleFrequency.part1ArticleCount) || 0,
            part2ArticleCount: Number(entry.part12ArticleFrequency.part2ArticleCount) || 0,
            part3ArticleCount: Number(entry.part12ArticleFrequency.part3ArticleCount) || 0,
            surfaces: Array.isArray(entry.part12ArticleFrequency.surfaces)
              ? entry.part12ArticleFrequency.surfaces.map(contentText).filter(Boolean)
              : []
          }
        : null,
      aiCoachQuestionFrequency: entry.aiCoachQuestionFrequency && typeof entry.aiCoachQuestionFrequency === "object"
        ? {
            occurrenceCount: Number(entry.aiCoachQuestionFrequency.occurrenceCount) || 0,
            questionCount: Number(entry.aiCoachQuestionFrequency.questionCount) || 0,
            testCount: Number(entry.aiCoachQuestionFrequency.testCount) || 0
          }
        : null
    };
  }

  var CONTENT_ISSUE_LABELS = {
    phonetic: "音标",
    pos: "词性",
    meaning: "释义",
    meaningDetail: "主释义详解",
    meaningTooShort: "释义过短",
    multiPosNeedsSplit: "多词性义项",
    definition: "释义说明",
    example: "英文例句",
    exampleZh: "例句翻译"
  };
  var CONTENT_SCORE_FIELDS = ["meaning", "phonetic", "example", "forms", "wordFamily", "synonyms", "difficulty"];
  var CONTENT_POS_ALIASES = {
    n: "noun", v: "verb", adj: "adjective", adv: "adverb", prep: "preposition",
    conj: "conjunction", pron: "pronoun", det: "determiner", art: "article",
    interj: "interjection", aux: "auxiliary", num: "numeral"
  };

  function contentText(value) {
    return String(value == null ? "" : value).trim();
  }

  function contentList(value) {
    return Array.isArray(value) ? value : [];
  }

  var STATIC_SYNONYM_VARIANTS = [
    ["encyclopaedia", "encyclopedia"], ["encyclopaedic", "encyclopedic"],
    ["paediatric", "pediatric"], ["paediatrics", "pediatrics"],
    ["aesthetic", "esthetic"], ["anaesthesia", "anesthesia"],
    ["anaesthetic", "anesthetic"], ["archaeology", "archeology"],
    ["foetus", "fetus"], ["haemoglobin", "hemoglobin"],
    ["diarrhoea", "diarrhea"], ["manoeuvre", "maneuver"],
    ["mediaeval", "medieval"], ["orthopaedic", "orthopedic"],
    ["oesophagus", "esophagus"], ["colour", "color"],
    ["favourite", "favorite"], ["honour", "honor"], ["labour", "labor"],
    ["neighbour", "neighbor"], ["behaviour", "behavior"], ["centre", "center"],
    ["metre", "meter"], ["theatre", "theater"], ["organise", "organize"],
    ["organisation", "organization"], ["analyse", "analyze"], ["defence", "defense"],
    ["licence", "license"], ["travelling", "traveling"], ["travelled", "traveled"],
    ["traveller", "traveler"], ["catalogue", "catalog"], ["dialogue", "dialog"],
    ["programme", "program"], ["grey", "gray"]
  ];
  var STATIC_SYNONYM_VARIANT_KEYS = {};
  STATIC_SYNONYM_VARIANTS.forEach(function (group) {
    group.forEach(function (word) { STATIC_SYNONYM_VARIANT_KEYS[word] = group[0]; });
  });

  function staticSynonymKey(value) {
    var compact = contentText(value)
      .toLowerCase()
      .replace(/[’‘`]/g, "'")
      .replace(/[^a-z0-9]+/g, "");
    return STATIC_SYNONYM_VARIANT_KEYS[compact] || compact;
  }

  function normalizeStaticSynonyms(value, headword) {
    var values = Array.isArray(value) ? value : String(value || "").split(/[,，;；|\n]+/);
    var headwordKey = staticSynonymKey(headword);
    var seen = {};
    var result = [];
    values.forEach(function (item) {
      if (result.length >= 5) return;
      var term = contentText(typeof item === "string" ? item : item && (item.word || item.replacement));
      var key = staticSynonymKey(term);
      if (!key || key === headwordKey || seen[key]) return;
      seen[key] = true;
      result.push(term);
    });
    return result.sort(function (left, right) {
      return Number(/\s/.test(left)) - Number(/\s/.test(right));
    });
  }

  function normalizeStaticSynonymDetails(value, headword, synonyms) {
    var words = normalizeStaticSynonyms(synonyms, headword);
    var detailsByWord = {};
    contentList(value).forEach(function (detail) {
      var word = contentText(typeof detail === "string" ? detail : detail && (detail.word || detail.replacement));
      var key = staticSynonymKey(word);
      if (key && !detailsByWord[key]) detailsByWord[key] = detail;
    });
    return words.map(function (word) {
      var detail = detailsByWord[staticSynonymKey(word)] || {};
      var normalized = {
        word: word,
        pos: contentText(detail.pos || detail.primaryPos),
        meaningZh: contentText(detail.meaningZh || detail.primaryMeaningZh || detail.meaning)
      };
      if (contentText(detail.replacementType || detail.replacement_type) === "phrase" || /\s/.test(word)) {
        normalized.replacementType = "phrase";
      }
      return normalized;
    });
  }

  function saveQuizNavigation() {
    saveJson(SESSION_KEY, {
      wordKey: "",
      filter: filter,
      index: index,
      savedAt: new Date().toISOString()
    });
  }

  function getStaticSynonymStatus(item) {
    var words = normalizeStaticSynonyms(item && item.synonyms, item && item.word);
    if (words.length) return {
      state: "available",
      words: words,
      details: normalizeStaticSynonymDetails(item && item.synonymDetails, item && item.word, words),
      source: contentText(item && item.synonymsReviewSource)
    };
    if (item && item.synonymsReviewed === true) return { state: "reviewed-none", words: [], details: [], source: contentText(item.synonymsReviewSource) };
    return { state: "pending", words: [], details: [], source: "" };
  }

  function isStaticSynonymSupportedEntry(item) {
    return Boolean(item && (item.entryType === "word" || item.entryType === "phrase"));
  }

  function contentUnique(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function isPlaceholderContent(value) {
    var normalized = contentText(value);
    return /(?:总词库待补|待补(?:充)?(?:释义|资料|内容)?|暂无(?:释义|例句|音标|词性)?|to be completed|waiting ai|not available)/i.test(normalized);
  }

  function hasUsableContent(values) {
    return values.some(function (value) {
      var normalized = contentText(value);
      return normalized && !isPlaceholderContent(normalized);
    });
  }

  function contentPosTokens(value) {
    var normalizedValue = contentText(value).toLowerCase()
      .replace(/(?:noun\s+phrase\s*名词|verb\s+phrase\s*动词|adjective\s+phrase\s*形容词|adverb\s+phrase\s*副词|prepositional\s+phrase\s*介词)/g, "phrase")
      .replace(/auxiliary\s+verb/g, "auxiliary")
      .replace(/modal\s+verb/g, "modal")
      .replace(/phrasal\s+verb/g, "phrase")
      .replace(/(?:noun|verb|adjective|adverb|prepositional)\s+phrase/g, "phrase");
    return contentUnique((normalizedValue.match(/\b(?:noun|verb|adjective|adverb|preposition|conjunction|pronoun|determiner|article|interjection|auxiliary|modal|numeral|number|phrase)\b|(?:^|[\s,;/，；])(?:n|v|adj|adv|prep|conj|pron|det|art|interj|aux|num)(?=$|[\s,;/，；.])/gi) || []).map(function (token) {
      var normalized = token.trim().toLowerCase().replace(/^[,;/，；]+/, "");
      return CONTENT_POS_ALIASES[normalized] || (normalized === "number" ? "numeral" : normalized);
    }));
  }

  function statusForItem(item) {
    if (!item) return null;
    var direct = statusMap[entryKey(item)] || statusMap[nk(item.word)];
    if (direct) return direct;
    var aliases = Array.isArray(item.mergedAliases) ? item.mergedAliases : [];
    for (var i = 0; i < aliases.length; i++) {
      var alias = aliases[i] || {};
      var aliasKey = nk(alias.key || alias.word);
      var aliasId = String(alias.id || "").trim();
      if (aliasId && statusMap[aliasId]) return statusMap[aliasId];
      if (aliasKey && statusMap[aliasKey]) return statusMap[aliasKey];
      if (aliasKey && statusMap["word::" + aliasKey]) return statusMap["word::" + aliasKey];
    }
    return null;
  }

  var STATIC_POS_ZH = {
    noun: "名词", verb: "动词", adjective: "形容词", adverb: "副词",
    preposition: "介词", conjunction: "连词", pronoun: "代词",
    determiner: "限定词", article: "冠词", phrase: "短语"
  };

  function staticPosDisplay(value) {
    var raw = contentText(value);
    if (!raw || /[\u3400-\u9fff]/.test(raw)) return raw;
    var tokens = contentPosTokens(raw);
    if (/\bphrase\b/i.test(raw)) tokens.push("phrase");
    tokens = contentUnique(tokens);
    var chinese = tokens.map(function (token) { return STATIC_POS_ZH[token] || ""; }).filter(Boolean);
    return chinese.length ? raw + " " + chinese.join("/") : raw;
  }

  function hasUsablePos(values) {
    return values.some(function (value) {
      var normalized = contentText(value);
      return normalized && !isPlaceholderContent(normalized) && !/^(?:word|phrase|pos|unknown|n\/?a|待补)$/i.test(normalized);
    });
  }

  function isStaticMeaningTooShort(item) {
    var meaning = [item.primaryMeaningZh, item.meaningZh, item.meaning]
      .concat(contentList(item.senses).map(function (sense) { return sense && (sense.meaningZh || sense.meaning); }))
      .map(contentText)
      .find(function (value) { return value && !isPlaceholderContent(value); });
    if (!meaning) return false;
    if ((meaning.match(/[\u3400-\u9fff]/g) || []).length >= 1) return false;
    var entryPos = contentUnique(contentPosTokens(item.primaryPos).concat(contentPosTokens(item.pos)));
    return !entryPos.length || !entryPos.every(function (pos) {
      return ["preposition", "conjunction", "article", "determiner", "pronoun", "interjection"].indexOf(pos) >= 0;
    });
  }

  function needsStaticMultiPosSplit(item) {
    var declaredPos = contentUnique(
      contentPosTokens(item.declaredPos)
        .concat(contentPosTokens(item.rawPos))
        .concat(contentPosTokens(item.primaryPos))
        .concat(contentPosTokens(item.pos))
    );
    var senses = contentList(item.senses).concat(contentList(item.otherMeanings), contentList(item.meaningsZh)).filter(function (sense) {
      return contentText(sense && (sense.meaningZh || sense.meaning)) && !isPlaceholderContent(sense && (sense.meaningZh || sense.meaning));
    });
    var markedPosCount = (contentText(item.primaryMeaningZh || item.meaningZh || item.meaning)
      .match(/\[(?:noun|verb|adjective|adverb|preposition|conjunction|pronoun|determiner|article|n|v|adj|adv)\]/gi) || []).length;
    if (declaredPos.length < 2) {
      return markedPosCount > 1 && senses.filter(function (sense) {
        return contentPosTokens(sense && sense.pos).length === 1;
      }).length < 2;
    }

    var primaryPos = contentPosTokens(item.primaryPos);
    if (primaryPos.length !== 1) {
      var explicitSenses = contentList(item.senses).filter(function (sense) {
        return contentText(sense && (sense.meaningZh || sense.meaning));
      });
      var primarySense = explicitSenses.find(function (sense) { return sense && sense.isPrimary === true; })
        || explicitSenses.find(function (sense) { return sense && sense.readingCommon === true; })
        || explicitSenses[0];
      primaryPos = contentPosTokens(primarySense && primarySense.pos);
    }
    if (primaryPos.length !== 1) primaryPos = contentPosTokens(item.pos);
    if (primaryPos.length !== 1 || declaredPos.indexOf(primaryPos[0]) < 0) return true;

    var coveredPos = contentUnique(primaryPos.concat(senses.reduce(function (all, sense) {
      var tokens = contentPosTokens(sense && sense.pos);
      return tokens.length === 1 ? all.concat(tokens) : all;
    }, [])));
    return declaredPos.some(function (pos) { return coveredPos.indexOf(pos) < 0; });
  }

  function staticDetailCompact(value) {
    return contentText(value).toLowerCase().replace(/[“”"'‘’；;，,。.!！?？、：:\s]/g, "");
  }

  function staticDetailChineseLength(value) {
    return (String(value || "").match(/[\u3400-\u9fff]/g) || []).length;
  }

  function staticDetailClauseOnlyMainGloss(clause, item) {
    var word = contentText(item && item.word);
    var meaning = contentText(item && (item.meaning || item.meaningZh || item.primaryMeaningZh));
    var wholeMeaningKey = staticDetailCompact(meaning);
    var primaryKeys = meaning.split(/[；;，,、/]+/).map(staticDetailCompact).filter(Boolean);
    var clauseKey = staticDetailCompact(clause);
    if (!clauseKey || clauseKey === wholeMeaningKey || primaryKeys.indexOf(clauseKey) >= 0) return true;
    if (/^(?:(?:“[A-Za-z][A-Za-z' -]*”|[A-Za-z][A-Za-z' -]*)(?:常见含义为|在雅思(?:听力|阅读)?中的常用含义是)[：:]|(?:“[A-Za-z][A-Za-z' -]*”|[A-Za-z][A-Za-z' -]*)(?:表示|的核心意思是)|(?:“[A-Za-z][A-Za-z' -]*”|[A-Za-z][A-Za-z' -]*|该词)在当前词条中(?:作.+?使用，?)?主要表示|[A-Za-z][A-Za-z' -]*\s*[：:])/.test(clause)) return true;
    if (/^(?:本词条|该词|“?[A-Za-z][A-Za-z' -]*”?)?(?:按|作).*(?:词|使用)$/.test(clause)) return true;
    if (!word) return false;
    var escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var remainder = contentText(clause.replace(new RegExp("^[“\\\"']?" + escapedWord + "[”\\\"']?\\s*[：:]\\s*", "i"), ""));
    var remainderKey = staticDetailCompact(remainder);
    return !remainderKey || remainderKey === wholeMeaningKey || primaryKeys.indexOf(remainderKey) >= 0;
  }

  function isStaticContextOnlyMeaningDetail(item) {
    return /^(?:在当前例句中|当前例句中|在本句中)/.test(contentText(item && (item.meaningDetailZh || item.meaningDetailedZh)));
  }

  function isStaticMeaningDetailInformative(item) {
    var raw = contentText(item && (item.meaningDetailZh || item.meaningDetailedZh));
    if (!raw || /(?:无中文释义|暂无释义|待补充|待完善|待审核|需要复核|IELTS\s*G类实用词\s*[：:]|专有名词，需结合原文识别|非标准词形或来源残留)/i.test(raw)) return false;
    var semantic = [];
    raw.split(/[。！？!?；;]+/).forEach(function (part) {
      var clause = contentText(part).replace(/^[，,：:\s]+|[，,：:\s]+$/g, "");
      if (!clause || staticDetailClauseOnlyMainGloss(clause, item)) return;
      if (/^(?:常见|固定|短语)?搭配(?:有|包括|如|例如)?[“"']?.+$/.test(clause)) return;
      if (/(?:复数(?:形式)?|第三人称单数(?:形式)?|过去式|过去分词|现在分词|动名词|比较级|最高级)(?:形式)?$/.test(clause)) return;
      if (/^(?:例句提示[：:]?|在当前例句中[，,:：]?)/.test(clause)) return;
      semantic.push(clause);
    });
    return staticDetailChineseLength(semantic.join("；")) >= 8;
  }

  function getStaticContentIssues(item) {
    if (!item || item.entryType !== "word") return [];
    var senses = contentList(item.senses);
    var meanings = [item.primaryMeaningZh, item.meaningZh, item.meaning].concat(senses.map(function (sense) { return sense && sense.meaningZh; }));
    var issues = [];
    if (!hasUsableContent([item.phonetic])) issues.push("phonetic");
    if (!hasUsablePos([item.primaryPos, item.pos].concat(senses.map(function (sense) { return sense && sense.pos; })))) issues.push("pos");
    if (!hasUsableContent(meanings)) issues.push("meaning");
    else if (isStaticMeaningTooShort(item)) issues.push("meaningTooShort");
    if (!isStaticMeaningDetailInformative(item) || isStaticContextOnlyMeaningDetail(item)) issues.push("meaningDetail");
    if (!hasUsableContent([item.definition].concat(senses.map(function (sense) { return sense && sense.definition; })))) issues.push("definition");
    if (!hasUsableContent([item.example].concat(senses.map(function (sense) { return sense && sense.example; })))) issues.push("example");
    if (!hasUsableContent([item.exampleCn, item.exampleZh].concat(senses.map(function (sense) { return sense && (sense.exampleZh || sense.exampleCn); })))) issues.push("exampleZh");
    if (needsStaticMultiPosSplit(item)) issues.push("multiPosNeedsSplit");
    return contentUnique(issues);
  }

  function staticRelatedParaphraseCount(item) {
    var key = nk(item && item.word);
    if (!key) return 0;
    return (groups || []).filter(function (group) {
      if (!group || group.confidence !== "high" || group.sourceType === "network" || !group.anchor || !(group.members || []).length) return false;
      return [group.anchor].concat(group.members || []).some(function (word) { return nk(word) === key; });
    }).length;
  }

  function getStaticContentQuality(item) {
    if (!item || item.entryType !== "word") {
      return {
        issues: [],
        issueLabels: [],
        fields: {},
        completedCount: 0,
        totalCount: CONTENT_SCORE_FIELDS.length,
        percent: 0,
        isScored: false,
        isLearningBlocked: false
      };
    }
    var issues = getStaticContentIssues(item);
    var fields = {
      meaning: ["meaning", "meaningDetail", "meaningTooShort", "multiPosNeedsSplit", "definition"].every(function (issue) { return issues.indexOf(issue) < 0; }),
      phonetic: issues.indexOf("phonetic") < 0,
      example: issues.indexOf("example") < 0 && issues.indexOf("exampleZh") < 0,
      forms: contentList(item && item.forms).length > 0 || item && item.formsReviewed === true,
      wordFamily: contentList(item && item.wordFamily).length > 0 || item && item.wordFamilyReviewed === true,
      synonyms: contentList(item && item.synonyms).length > 0 || item && item.synonymsReviewed === true || staticRelatedParaphraseCount(item) > 0,
      difficulty: Boolean(contentText(item && item.difficulty)) && !/(?:待补|待完善|unknown|n\/?a)/i.test(contentText(item && item.difficulty))
    };
    var completedCount = CONTENT_SCORE_FIELDS.filter(function (field) { return fields[field]; }).length;
    return {
      issues: issues,
      issueLabels: issues.map(function (issue) { return CONTENT_ISSUE_LABELS[issue] || issue; }),
      fields: fields,
      completedCount: completedCount,
      totalCount: CONTENT_SCORE_FIELDS.length,
      percent: Math.round((completedCount / CONTENT_SCORE_FIELDS.length) * 100),
      isScored: true,
      isLearningBlocked: issues.length > 0
    };
  }

  function isStaticContentIncomplete(item) {
    return getStaticContentIssues(item).length > 0;
  }

  function emptyStatus() {
    return {
      meaningStatus: "unlearned",
      phraseStatus: "unlearned",
      paraphraseStatus: "unlearned",
      status: "",
      favorite: false
    };
  }

  function normStatus(raw) {
    if (!raw) return emptyStatus();
    if (typeof raw === "string") {
      return {
        meaningStatus: raw === "熟悉" ? "familiar" : raw === "不熟" ? "unfamiliar" : "unlearned",
        phraseStatus: "unlearned",
        paraphraseStatus: "unlearned",
        status: raw,
        favorite: false
      };
    }
    return {
      meaningStatus: raw.meaningStatus || (raw.status === "熟悉" ? "familiar" : raw.status === "不熟" ? "unfamiliar" : "unlearned"),
      phraseStatus: raw.phraseStatus || "unlearned",
      paraphraseStatus: raw.paraphraseStatus || "unlearned",
      status: raw.status || "",
      favorite: !!raw.favorite
    };
  }

  function readStatusMap() {
    var raw = loadJson(STATUS_KEY, {});
    if (raw && raw.entries) return raw.entries;
    return raw && typeof raw === "object" ? raw : {};
  }

  function writeStatusMap(map) {
    var payload = {
      progressSchemaVersion: 4,
      entries: map || {},
      paraphrases: paraMap || {}
    };
    saveJson(STATUS_KEY, payload);
  }

  var statusWriteTimer = 0;
  function flushStatusWrite() {
    if (statusWriteTimer) {
      clearTimeout(statusWriteTimer);
      statusWriteTimer = 0;
    }
    writeStatusMap(statusMap);
  }
  function scheduleStatusWrite() {
    if (statusWriteTimer) clearTimeout(statusWriteTimer);
    statusWriteTimer = setTimeout(function () {
      statusWriteTimer = 0;
      writeStatusMap(statusMap);
    }, 0);
  }
  window.addEventListener("pagehide", flushStatusWrite);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flushStatusWrite();
  });

  function isQuiz() {
    return filter.type === "paraphraseQuiz";
  }

  function modeOf(item) {
    if (isQuiz()) return "paraphrase";
    if (filter.type === "learnMode" && filter.value === "phrase") return "phrase";
    if (filter.type === "learnMode" && filter.value === "meaning") return "meaning";
    if (item && (item.entryType === "phrase" || /\s/.test(item.word || ""))) return "phrase";
    return "meaning";
  }

  function getStatusCode(item) {
    var e = normStatus(statusForItem(item));
    var m = modeOf(item);
    if (m === "phrase") return e.phraseStatus || "unlearned";
    if (m === "paraphrase") return e.paraphraseStatus || "unlearned";
    return e.meaningStatus || "unlearned";
  }

  function getUiStatus(item) {
    var c = getStatusCode(item);
    if (c === "familiar") return "熟悉";
    if (c === "unfamiliar") return "不熟";
    return "";
  }

  function isFavorite(item) {
    return !!normStatus(statusForItem(item)).favorite;
  }

  function patchStatus(item, patch) {
    var key = entryKey(item);
    if (!key) return;
    var prev = normStatus(statusMap[key] || statusForItem(item));
    var next = Object.assign({}, prev);
    var m = modeOf(item);
    if (patch.favorite !== undefined) next.favorite = !!patch.favorite;
    if (patch.status !== undefined) {
      var code =
        patch.status === "熟悉" ? "familiar" : patch.status === "不熟" ? "unfamiliar" : "unlearned";
      if (m === "phrase") next.phraseStatus = code;
      else if (m === "paraphrase") next.paraphraseStatus = code;
      else {
        next.meaningStatus = code;
        next.status = patch.status;
      }
    }
    statusMap[key] = next;
    scheduleStatusWrite();
  }

  function matchStage(item, stage) {
    var layers = item.layers || [];
    if (stage === "4") return item.studyMode === "reference";
    if (item.studyMode !== "active") return false;
    var difficulty = String(item.difficulty || "").trim();
    var isBasic = difficulty === "基础高频";
    var isCore = difficulty === "中级核心";
    var isArticleExtension =
      difficulty === "高级加分" || difficulty === "阅读扩展" || difficulty === "低频认识即可";
    var hasCoreLayer =
      layers.indexOf("priority1500") >= 0 ||
      layers.indexOf("answerCore250") >= 0 ||
      layers.indexOf("logic120") >= 0;
    var hasArticleLayer =
      layers.indexOf("tierC800") >= 0 ||
      layers.indexOf("paraExt500") >= 0 ||
      layers.indexOf("questionBankActive") >= 0 ||
      layers.indexOf("questionBankAiCompleted") >= 0;
    var isPhrase = item.entryType === "phrase" || /\s/.test(item.word || "");
    var targetStage = "2";
    if (isBasic) targetStage = "1";
    else if (isPhrase) {
      if (layers.indexOf("logic120") >= 0 || (layers.indexOf("phrases400") >= 0 && Number(item.phraseStudyStage) === 1)) targetStage = "1";
      else if (layers.indexOf("phrases400") >= 0 && Number(item.phraseStudyStage) === 2) targetStage = "2";
      else if (layers.indexOf("gtPart12Phrases150") >= 0) targetStage = String(item.part12PhraseTier || "").toUpperCase() === "S" ? "1" : "2";
      else if (hasArticleLayer) targetStage = "3";
    } else if (isArticleExtension) targetStage = "3";
    else if (isCore && hasCoreLayer) targetStage = "1";
    else if (isCore && hasArticleLayer) targetStage = "3";
    if (stage === "1") return targetStage === "1";
    if (stage === "2") return targetStage === "2";
    if (stage === "3") return targetStage === "3";
    return false;
  }

  function matches(item) {
    if (!item) return false;
    if (item.entryType === "inflected-form" && item.studyMode === "reference") return false;
    var st = getUiStatus(item);
    var fav = isFavorite(item);
    var layers = item.layers || [];

    if (filter.type === "contentIncomplete") return isStaticContentIncomplete(item);
    if (filter.type === "synonymPending") return isStaticSynonymSupportedEntry(item) && getStaticSynonymStatus(item).state === "pending";
    if (filter.type === "synonymReviewedNone") return isStaticSynonymSupportedEntry(item) && getStaticSynonymStatus(item).state === "reviewed-none";

    var isExplicitCompletionQueue =
      filter.type === "layer" && filter.value === "questionBankPending";
    var isArticleHighFrequency =
      filter.type === "layer" && filter.value === "part12ArticleHighFrequency";
    var isPart12OnlyHighFrequency = filter.type === "part12OnlyHighFrequency";
    var isUnfamiliarQueue = filter.type === "status" && filter.value === "不熟";
    if (isStaticContentIncomplete(item) && !isExplicitCompletionQueue && !isArticleHighFrequency && !isPart12OnlyHighFrequency && !isUnfamiliarQueue) return false;

    if (filter.type === "everything") return true;
    if (filter.type === "status") {
      if (filter.value === "不熟") return st === "不熟";
      if (filter.value === "熟悉") return st === "熟悉";
      if (filter.value === "收藏") return fav && st !== "熟悉";
    }
    if (
      st === "熟悉" &&
      filter.type !== "status" &&
      filter.type !== "everything" &&
      filter.type !== "paraphrase" &&
      !(filter.type === "pathStage" && filter.value === "4") &&
      filter.type !== "reference" &&
      filter.type !== "synonymPending" &&
      filter.type !== "synonymReviewedNone"
    ) {
      return false;
    }
    if (filter.type === "active") return item.studyMode === "active";
    if (filter.type === "reference") return item.studyMode === "reference";
    if (filter.type === "stage1" || (filter.type === "pathStage" && filter.value === "1"))
      return matchStage(item, "1");
    if (filter.type === "pathStage") return matchStage(item, String(filter.value));
    if (filter.type === "learnMode") {
      if (filter.value === "meaning")
        return item.studyMode === "active" && item.entryType !== "phrase" && !/\s/.test(item.word);
      if (filter.value === "phrase")
        return item.studyMode === "active" && (item.entryType === "phrase" || /\s/.test(item.word));
    }
    if (filter.type === "articleNonHighFrequency") {
      return item.studyMode === "active" && layers.indexOf("part12ArticleHighFrequency") < 0;
    }
    if (filter.type === "part12OnlyHighFrequency") return isPart12OnlyHighFrequencyItem(item);
    if (filter.type === "layer") return layers.indexOf(filter.value) >= 0;
    if (filter.type === "entryType") return item.entryType === filter.value;
    if (filter.type === "all") return item.studyMode === "active";
    return item.studyMode === "active";
  }

  function rebuildStudy() {
    study = [];
    for (var i = 0; i < words.length; i++) {
      if (matches(words[i])) study.push(i);
    }
    study = sortDefaultFrequencyIndices(study);
    study = orderStudyIndices(study);
    if (study.indexOf(index) < 0) index = study[0] != null ? study[0] : 0;
  }

  function normalizeStaticHeadword(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function part12OnlyArticleCount(item) {
    return Number(item && item.part12ArticleFrequency && item.part12ArticleFrequency.articleCount) || 0;
  }

  function isPart12OnlyHighFrequencyItem(item) {
    if (!item) return false;
    var layers = item.layers || [];
    if (layers.indexOf("part12ArticleHighFrequency") < 0) return false;
    if (part12OnlyArticleCount(item) < 2) return false;
    var word = String(item.word || "");
    if (item.entryType === "phrase" || /\s/.test(word)) return false;
    var key = normalizeStaticHeadword(item.normalizedKey || word);
    return !READING_G_BASIC_ZERO_KEYS[key];
  }

  function logicFrequency(item) {
    var articleEvidence = item && item.part12ArticleFrequency;
    var questionEvidence = item && item.aiCoachQuestionFrequency;
    return {
      articleCount:
        (Number(articleEvidence && articleEvidence.articleCount) || 0)
        + (Number(articleEvidence && articleEvidence.part3ArticleCount) || 0),
      occurrenceCount: Number(articleEvidence && articleEvidence.occurrenceCount) || 0,
      questionOccurrenceCount: Number(questionEvidence && questionEvidence.occurrenceCount) || 0,
      questionCount: Number(questionEvidence && questionEvidence.questionCount) || 0
    };
  }

  function sortDefaultFrequencyIndices(indices) {
    if (
      !(
        filter.type === "articleNonHighFrequency"
        || filter.type === "part12OnlyHighFrequency"
        || (filter.type === "layer" && (filter.value === "logic120" || filter.value === "part12ArticleHighFrequency"))
      )
      || wordOrderMode !== "current"
      || difficultyOrderMode !== "default"
    ) return indices;
    var includeQuestionFrequency = filter.type === "layer" && filter.value === "logic120";
    var part12Only = filter.type === "part12OnlyHighFrequency";
    return indices.slice().sort(function (leftIndex, rightIndex) {
      if (part12Only) {
        var leftItem = words[leftIndex];
        var rightItem = words[rightIndex];
        return part12OnlyArticleCount(rightItem) - part12OnlyArticleCount(leftItem)
          || (Number(rightItem && rightItem.part12ArticleFrequency && rightItem.part12ArticleFrequency.occurrenceCount) || 0)
            - (Number(leftItem && leftItem.part12ArticleFrequency && leftItem.part12ArticleFrequency.occurrenceCount) || 0)
          || leftIndex - rightIndex;
      }
      var left = logicFrequency(words[leftIndex]);
      var right = logicFrequency(words[rightIndex]);
      return right.articleCount - left.articleCount
        || right.occurrenceCount - left.occurrenceCount
        || (includeQuestionFrequency ? right.questionOccurrenceCount - left.questionOccurrenceCount : 0)
        || (includeQuestionFrequency ? right.questionCount - left.questionCount : 0)
        || leftIndex - rightIndex;
    });
  }

  function resetStudyToStart() {
    index = study[0] != null ? study[0] : 0;
  }

  function difficultyProfile(indices) {
    if (!sharedWordDifficulty) return null;
    var profile = sharedWordDifficulty.createWordInternalDifficultyProfile(
      indices.map(function (sourceIndex) { return words[sourceIndex]; }).filter(Boolean)
    );
    return profile && profile.available ? profile : null;
  }

  function difficultyTier(item, profile) {
    return profile && sharedWordDifficulty
      ? sharedWordDifficulty.wordInternalDifficultyTier(item, profile)
      : "standard";
  }

  function orderStudyIndices(indices) {
    if (!sharedWordStudyOrdering) {
      throw new Error("共享单词排序模块尚未加载");
    }
    return sharedWordStudyOrdering.orderStudyWordIndices(indices, words, {
      mode: wordOrderMode,
      difficultyMode: difficultyOrderMode,
      difficultyEnabled: true,
      seed: randomOrderSeed
    });
  }

  function loadOrderPreferences() {
    var saved = loadJson(ORDER_PREFS_KEY, {}) || {};
    var entry = saved[filterKey(filter)];
    wordOrderMode = "current";
    difficultyOrderMode = "default";
    if (entry && typeof entry === "object") {
      if (["current", "random", "family", "association"].indexOf(entry.order) >= 0) wordOrderMode = entry.order;
      if (["default", "easy-to-hard", "hard-to-easy", "easier-only", "standard-only", "harder-only"].indexOf(entry.difficulty) >= 0) {
        difficultyOrderMode = entry.difficulty;
      }
      if (Number.isFinite(Number(entry.seed))) randomOrderSeed = Number(entry.seed);
    }
  }

  function saveOrderPreferences() {
    var saved = loadJson(ORDER_PREFS_KEY, {}) || {};
    if (typeof saved.order === "string") {
      delete saved.order;
      delete saved.difficulty;
      delete saved.seed;
    }
    saved[filterKey(filter)] = {
      order: wordOrderMode,
      difficulty: difficultyOrderMode,
      seed: randomOrderSeed
    };
    saveJson(ORDER_PREFS_KEY, saved);
  }

  function applyOrderPreference(nextOrder, nextDifficulty) {
    if (isQuiz()) return;
    if (nextOrder) {
      wordOrderMode = nextOrder;
      if (wordOrderMode === "random") randomOrderSeed = Date.now();
    }
    if (nextDifficulty) difficultyOrderMode = nextDifficulty;
    saveOrderPreferences();
    rebuildStudy();
    resetStudyToStart();
    saveSession();
    renderTopics();
    render();
  }

  function renderOrderControls() {
    if (els.wordOrderSelect) {
      els.wordOrderSelect.value = wordOrderMode;
      els.wordOrderSelect.disabled = isQuiz();
    }
    if (!els.difficultyOrderSelect) return;
    var rawIndices = [];
    if (!isQuiz()) {
      for (var sourceIndex = 0; sourceIndex < words.length; sourceIndex++) {
        if (matches(words[sourceIndex])) rawIndices.push(sourceIndex);
      }
    }
    var profile = difficultyProfile(rawIndices);
    var counts = { easier: 0, standard: 0, harder: 0 };
    rawIndices.forEach(function (sourceIndex) { counts[difficultyTier(words[sourceIndex], profile)] += 1; });
    var labels = {
      "default": "难度默认",
      "easy-to-hard": "简单→困难",
      "hard-to-easy": "困难→简单",
      "easier-only": "只刷相对较易 · " + counts.easier,
      "standard-only": "只刷常规 · " + counts.standard,
      "harder-only": "只刷相对较难 · " + counts.harder
    };
    Array.from(els.difficultyOrderSelect.options).forEach(function (option) {
      option.textContent = labels[option.value] || option.textContent;
    });
    els.difficultyOrderSelect.value = difficultyOrderMode;
    els.difficultyOrderSelect.disabled = isQuiz() || !profile;
    els.difficultyOrderSelect.title = profile
      ? "按当前入口内部的相对难度排序或筛选"
      : "当前入口词量太少或难度区分不足，暂时不能划分相对难度";
  }

  function eligibleGroups() {
    return (groups || []).filter(function (g) {
      return (
        g &&
        g.confidence === "high" &&
        g.canAutoQuiz === true &&
        String(g.commonMeaningZh || "").trim()
      );
    });
  }

  function loadCoverage() {
    var raw = loadJson(COVERAGE_KEY, null);
    if (!raw || typeof raw !== "object") return coverage;
    coverage = {
      version: 1,
      seenGroupIds: Array.isArray(raw.seenGroupIds) ? raw.seenGroupIds : [],
      currentCycleOrder: Array.isArray(raw.currentCycleOrder) ? raw.currentCycleOrder : [],
      currentCycleIndex: Number(raw.currentCycleIndex) || 0,
      cycleNumber: Number(raw.cycleNumber) || 1,
      lastSessionGroupIds: Array.isArray(raw.lastSessionGroupIds) ? raw.lastSessionGroupIds : [],
      sessionMode: raw.sessionMode || "guided",
      sessionSize: Number(raw.sessionSize) || SESSION_SIZES.guided,
      updatedAt: Number(raw.updatedAt) || 0
    };
    return coverage;
  }

  function saveCoverage() {
    saveJson(COVERAGE_KEY, coverage);
  }

  function emptyReviewEntry() {
    return { seenCount: 0, recallAttemptCount: 0, correctCount: 0, wrongCount: 0, correctStreak: 0, selfRating: "unknown", anchorToMemberCorrect: 0, memberToAnchorCorrect: 0, previewCompleted: false, lastReviewedAt: null, nextReviewAt: null, lastResult: null };
  }

  function reviewEntry(groupId) {
    return Object.assign(emptyReviewEntry(), (paraReview.groups || {})[groupId] || {});
  }

  function patchReview(groupId, patch) {
    var groupsNext = Object.assign({}, paraReview.groups || {});
    groupsNext[groupId] = Object.assign(reviewEntry(groupId), patch);
    paraReview = { version: 1, groups: groupsNext, updatedAt: Date.now() };
    saveJson(REVIEW_KEY, paraReview);
  }

  function saveParaSession() {
    if (!paraSession || paraSession.completed) {
      try { localStorage.removeItem(PARA_SESSION_KEY); } catch (e) {}
      return;
    }
    paraSession.updatedAt = Date.now();
    saveJson(PARA_SESSION_KEY, paraSession);
  }

  function shuffleArr(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function surfaceKey(s) {
    return nk(s);
  }

  function groupKeys(g) {
    var s = {};
    s[surfaceKey(g.anchor)] = 1;
    (g.members || []).forEach(function (m) {
      s[surfaceKey(m)] = 1;
    });
    return s;
  }

  function buildOneMcq(group, all) {
    var stem = String(group.anchor || "").trim();
    var stemK = surfaceKey(stem);
    var members = (group.members || [])
      .map(function (m) {
        return String(m || "").trim();
      })
      .filter(function (m) {
        return m && surfaceKey(m) !== stemK;
      });
    if (!members.length) return null;
    var correct = members[Math.floor(Math.random() * members.length)];
    var correctK = surfaceKey(correct);
    var own = groupKeys(group);
    var pos = String(group.posConstraint || "").trim().toLowerCase();
    var cMean = String(group.commonMeaningZh || "").trim().toLowerCase();
    var pool = [];
    for (var i = 0; i < all.length; i++) {
      var g = all[i];
      if (!g || g.groupId === group.groupId) continue;
      var gPos = String(g.posConstraint || "").trim().toLowerCase();
      if (pos && gPos && pos !== gPos) continue;
      if (pos && !gPos) continue;
      if (!pos && gPos) continue;
      var gMean = String(g.commonMeaningZh || "").trim().toLowerCase();
      if (cMean && gMean && cMean === gMean) continue;
      var gk = groupKeys(g);
      var hit = false;
      for (var k in gk) {
        if (own[k]) {
          hit = true;
          break;
        }
      }
      if (hit) continue;
      [g.anchor].concat(g.members || []).forEach(function (c) {
        var t = String(c || "").trim();
        var ck = surfaceKey(t);
        if (!t || ck === stemK || ck === correctK || own[ck]) return;
        pool.push(t);
      });
    }
    // shuffle
    for (var p = pool.length - 1; p > 0; p--) {
      var j = Math.floor(Math.random() * (p + 1));
      var tmp = pool[p];
      pool[p] = pool[j];
      pool[j] = tmp;
    }
    var d = [];
    var seen = {};
    seen[stemK] = 1;
    seen[correctK] = 1;
    for (var di = 0; di < pool.length && d.length < 3; di++) {
      var dk = surfaceKey(pool[di]);
      if (seen[dk]) continue;
      seen[dk] = 1;
      d.push(pool[di]);
    }
    if (d.length < 3) return null;
    var correctIndex = Math.floor(Math.random() * 4);
    var options = new Array(4);
    options[correctIndex] = correct;
    var oi = 0;
    for (var x = 0; x < 4; x++) {
      if (x === correctIndex) continue;
      options[x] = d[oi++];
    }
    return {
      groupId: group.groupId,
      stem: stem,
      correct: correct,
      options: options,
      correctIndex: correctIndex,
      meta: {
        relationType: group.relationType || "",
        commonMeaningZh: group.commonMeaningZh || "",
        differenceZh: group.differenceZh || "",
        posConstraint: group.posConstraint || ""
      }
    };
  }

  function groupById(groupId) {
    for (var i = 0; i < groups.length; i++) if (groups[i].groupId === groupId) return groups[i];
    return null;
  }

  function buildQuestions(ids) {
    var all = eligibleGroups();
    return (ids || []).map(function (id) { return buildOneMcq(groupById(id), all); }).filter(Boolean);
  }

  function rebuildQuiz(mode) {
    if (mode) quizSessionMode = mode;
    var size = SESSION_SIZES[quizSessionMode] || 10;
    var all = eligibleGroups();
    var ids = all.map(function (g) { return g.groupId; });
    var byId = {};
    all.forEach(function (g) { byId[g.groupId] = g; });
    loadCoverage();
    coverage.sessionMode = quizSessionMode;
    coverage.sessionSize = size;
    var order = (coverage.currentCycleOrder || []).filter(function (id) { return !!byId[id]; });
    var have = {};
    order.forEach(function (id) { have[id] = 1; });
    var missing = ids.filter(function (id) { return !have[id]; });
    if (!order.length) order = shuffleArr(ids);
    else if (missing.length) order = order.concat(shuffleArr(missing));
    var idx = Math.min(Number(coverage.currentCycleIndex) || 0, order.length);
    var sessionIds = [];
    var kinds = [];
    var used = {};
    var reviewLimit = Math.floor(size / 2);
    ids.forEach(function (id) {
      if (sessionIds.length >= reviewLimit || used[id]) return;
      var entry = reviewEntry(id);
      var legacy = paraMap[id] || {};
      if (entry.lastResult !== "wrong" && entry.selfRating !== "dontKnow" && legacy.paraphraseStatus !== "unfamiliar") return;
      sessionIds.push(id); kinds.push("wrong"); used[id] = 1;
    });
    var guard = 0;
    var crossedCycle = false;
    while (sessionIds.length < size && guard < ids.length * 3) {
      guard++;
      if (idx >= order.length) {
        crossedCycle = true;
        order = shuffleArr(ids);
        idx = 0;
        coverage.cycleNumber = (coverage.cycleNumber || 1) + 1;
      }
      var id = order[idx++];
      if (!id || used[id]) continue;
      sessionIds.push(id); kinds.push(crossedCycle ? "nextCycle" : "new"); used[id] = 1;
    }
    coverage.currentCycleOrder = order;
    coverage.currentCycleIndex = idx;
    coverage.lastSessionGroupIds = sessionIds;
    coverage.updatedAt = Date.now();
    saveCoverage();
    paraSession = {
      version: 1,
      mode: quizSessionMode,
      sessionId: "para-static-" + Date.now(),
      currentSessionGroupIds: sessionIds,
      sessionTaskKinds: kinds,
      baseGroupCount: sessionIds.length,
      currentIndex: 0,
      currentLearningStage: quizSessionMode === "guided" ? "preview" : "quiz",
      currentDirection: "anchorToMember",
      currentCycleIndex: idx,
      wrongReinsertQueue: [], uncertainReinsertQueue: [], sessionResults: [],
      startedAt: Date.now(), updatedAt: Date.now(), completed: false
    };
    quizQueue = buildQuestions(sessionIds);
    quizPos = 0; quizRevealed = false; quizSelected = null; recallRevealed = false;
    saveParaSession();
  }

  function hydrateQuizSession(saved) {
    paraSession = saved;
    quizSessionMode = saved.mode === "wrongReview" ? "guided" : saved.mode;
    quizPos = Math.min(Number(saved.currentIndex) || 0, saved.currentSessionGroupIds.length - 1);
    quizQueue = buildQuestions(saved.currentSessionGroupIds);
    if (saved.currentQuestion && quizQueue[quizPos]) quizQueue[quizPos] = saved.currentQuestion;
    quizSelected = saved.selectedIndex == null ? null : saved.selectedIndex;
    quizRevealed = saved.currentLearningStage === "feedback";
    recallRevealed = false;
  }

  function markCurrentSeen() {
    var q = quizQueue[quizPos];
    if (!q) return;
    var seen = {};
    (coverage.seenGroupIds || []).forEach(function (id) { seen[id] = 1; });
    if (!seen[q.groupId]) {
      seen[q.groupId] = 1;
      coverage.seenGroupIds = Object.keys(seen);
      coverage.updatedAt = Date.now();
      saveCoverage();
    }
  }

  function currentItem() {
    if (isQuiz()) {
      var q = quizQueue[quizPos];
      return {
        word: q ? q.stem : "—",
        meaning: q ? "选择最接近的替换表达" : "无可用题目",
        phonetic: "",
        pos: "",
        example: "",
        exampleCn: ""
      };
    }
    return words[index] || { word: "—", meaning: "", phonetic: "", pos: "", example: "", exampleCn: "" };
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function appendSessionResult(result) {
    paraSession.sessionResults.push(Object.assign({ at: Date.now() }, result));
  }

  function scheduleStaticReinsert(groupId, kind, offset) {
    var repeats = paraSession.sessionTaskKinds.filter(function (value) { return value === "wrong" || value === "uncertain"; }).length;
    if (repeats >= Math.floor(paraSession.baseGroupCount / 2)) return;
    var at = Math.min(paraSession.currentSessionGroupIds.length, paraSession.currentIndex + offset + 1);
    paraSession.currentSessionGroupIds.splice(at, 0, groupId);
    paraSession.sessionTaskKinds.splice(at, 0, kind);
    var queueName = kind === "uncertain" ? "uncertainReinsertQueue" : "wrongReinsertQueue";
    if (paraSession[queueName].indexOf(groupId) < 0) paraSession[queueName].push(groupId);
    quizQueue.splice(at, 0, buildOneMcq(groupById(groupId), eligibleGroups()));
  }

  function advanceStaticTask() {
    if (paraSession.currentIndex + 1 >= paraSession.currentSessionGroupIds.length) {
      paraSession.currentLearningStage = "summary";
      paraSession.completed = true;
      saveParaSession();
      render();
      return;
    }
    paraSession.currentIndex++;
    quizPos = paraSession.currentIndex;
    paraSession.currentLearningStage = paraSession.mode === "guided" ? "preview" : "quiz";
    quizRevealed = false; quizSelected = null; recallRevealed = false;
    saveParaSession();
    render();
  }

  function startStaticRecall() {
    var q = quizQueue[quizPos];
    var g = q && groupById(q.groupId);
    if (!g) return;
    var entry = reviewEntry(g.groupId);
    patchReview(g.groupId, { previewCompleted: true, seenCount: entry.seenCount + 1, lastReviewedAt: Date.now() });
    appendSessionResult({ type: "preview", groupId: g.groupId });
    paraSession.currentDirection = entry.seenCount % 2 ? "memberToAnchor" : "anchorToMember";
    paraSession.currentLearningStage = "recall";
    saveParaSession(); render();
  }

  function rateStaticRecall(rating) {
    var q = quizQueue[quizPos];
    if (!q) return;
    var entry = reviewEntry(q.groupId);
    patchReview(q.groupId, { recallAttemptCount: entry.recallAttemptCount + 1, selfRating: rating, lastReviewedAt: Date.now(), nextReviewAt: rating === "know" ? entry.nextReviewAt : Date.now() + 86400000 });
    appendSessionResult({ type: "recall", groupId: q.groupId, rating: rating });
    if (rating === "know") {
      paraSession.currentLearningStage = "quiz"; recallRevealed = false; saveParaSession(); render(); return;
    }
    scheduleStaticReinsert(q.groupId, rating === "uncertain" ? "uncertain" : "wrong", rating === "uncertain" ? 4 : 2);
    if (rating === "dontKnow") {
      paraMap[q.groupId] = { paraphraseStatus: "unfamiliar", mastered: false, at: new Date().toISOString() };
      saveJson(PARA_KEY, paraMap); writeStatusMap(statusMap);
    }
    saveParaSession(); advanceStaticTask();
  }

  function selectStaticQuiz(oi) {
    var q = quizQueue[quizPos];
    if (!q || quizRevealed) return;
    var correct = oi === q.correctIndex;
    var wasFamiliar = paraMap[q.groupId] && paraMap[q.groupId].paraphraseStatus === "familiar";
    var entry = reviewEntry(q.groupId);
    var streak = correct ? entry.correctStreak + 1 : 0;
    var days = !correct || streak <= 1 ? 1 : streak === 2 ? 3 : streak === 3 ? 7 : 14;
    patchReview(q.groupId, {
      correctCount: entry.correctCount + (correct ? 1 : 0), wrongCount: entry.wrongCount + (correct ? 0 : 1),
      correctStreak: streak, anchorToMemberCorrect: entry.anchorToMemberCorrect + (correct ? 1 : 0),
      lastResult: correct ? "correct" : "wrong", lastReviewedAt: Date.now(), nextReviewAt: Date.now() + days * 86400000
    });
    appendSessionResult({ type: "quiz", groupId: q.groupId, correct: correct, selectedIndex: oi, direction: "anchorToMember" });
    if (!correct) {
      scheduleStaticReinsert(q.groupId, "wrong", 2);
      paraMap[q.groupId] = { paraphraseStatus: "unfamiliar", mastered: false, at: new Date().toISOString() };
      saveJson(PARA_KEY, paraMap); writeStatusMap(statusMap);
    } else {
      var nextEntry = reviewEntry(q.groupId);
      var pending = paraSession.currentSessionGroupIds.slice(paraSession.currentIndex + 1).indexOf(q.groupId) >= 0;
      if (nextEntry.previewCompleted && nextEntry.recallAttemptCount > 0 && nextEntry.lastResult === "correct" && nextEntry.anchorToMemberCorrect > 0 && !pending) {
        paraMap[q.groupId] = { paraphraseStatus: "familiar", mastered: true, at: new Date().toISOString() };
        saveJson(PARA_KEY, paraMap); writeStatusMap(statusMap);
        appendSessionResult({ type: "mastery", groupId: q.groupId, firstMastered: !wasFamiliar, legalDirectionsCompleted: true });
      }
    }
    quizSelected = oi; quizRevealed = true;
    paraSession.currentLearningStage = "feedback";
    paraSession.currentQuestion = q; paraSession.selectedIndex = oi;
    saveParaSession(); render();
  }

  function staticSummary() {
    var results = paraSession.sessionResults || [];
    var correct = results.filter(function (row) { return row.type === "quiz" && row.correct; }).length;
    var wrong = results.filter(function (row) { return row.type === "quiz" && !row.correct; }).length;
    var uncertain = results.filter(function (row) { return row.type === "recall" && row.rating === "uncertain"; }).length;
    var firstMastered = new Set(results.filter(function (row) { return row.type === "mastery" && row.firstMastered; }).map(function (row) { return row.groupId; })).size;
    var legalDirectionsCompleted = new Set(results.filter(function (row) { return row.type === "mastery" && row.legalDirectionsCompleted; }).map(function (row) { return row.groupId; })).size;
    return { correct: correct, wrong: wrong, uncertain: uncertain, firstMastered: firstMastered, legalDirectionsCompleted: legalDirectionsCompleted, review: paraSession.wrongReinsertQueue.length + paraSession.uncertainReinsertQueue.length };
  }

  function renderQuiz() {
    var q = quizQueue[quizPos];
    if (!els.quizBox) return;
    if (!isQuiz() || !q || !paraSession) {
      els.quizBox.classList.add("hidden");
      if (els.exampleCard) els.exampleCard.classList.remove("hidden");
      return;
    }
    markCurrentSeen();
    els.quizBox.classList.remove("hidden");
    if (els.exampleCard) els.exampleCard.classList.add("hidden");
    var g = groupById(q.groupId);
    var stage = paraSession.currentLearningStage;
    var html = "";
    var evidenceHtml = questionEvidenceHtml(g);
    if (resumePending) {
      html = '<div class="para-stage">未完成的同义学习</div><h2>继续上次同义学习</h2><p>长期覆盖与旧掌握状态均已保留。</p><div class="para-actions"><button id="paraResume" class="topic-chip active">继续</button><button id="paraRestart" class="topic-chip">重新开始本轮</button></div>';
    } else if (stage === "summary") {
      var sum = staticSummary();
      html = '<div class="para-stage">本轮总结</div><h2>' + (paraSession.mode === "guided" ? "引导学习完成" : "测验完成") + '</h2>' +
        '<div class="para-summary"><span>本轮组数 <strong>' + paraSession.baseGroupCount + '</strong></span><span>正确 <strong>' + sum.correct + '</strong></span><span>错误 <strong>' + sum.wrong + '</strong></span><span>模糊 <strong>' + sum.uncertain + '</strong></span><span>首次掌握 <strong>' + sum.firstMastered + '</strong></span><span>合法方向完成 <strong>' + sum.legalDirectionsCompleted + '</strong></span><span>累计覆盖 <strong>' + coverage.seenGroupIds.length + '/233</strong></span></div>' +
        '<div class="para-actions"><button id="paraContinue" class="topic-chip active">继续下一轮</button>' + (sum.review ? '<button id="paraReviewWrong" class="topic-chip">复习本轮错题</button>' : '') + '<button id="paraBackMeaning" class="topic-chip">返回词义学习</button></div>';
    } else if (stage === "preview") {
      html = '<div class="para-stage">阶段 1 · 关系预览</div><div class="para-pair"><strong>' + esc(g.anchor) + '</strong><span>↔</span><strong>' + esc(g.members[0]) + '</strong></div>' +
        (g.commonMeaningZh ? '<div class="para-meaning">共同义：' + esc(g.commonMeaningZh) + '</div>' : '') +
        (g.differenceZh ? '<div class="para-note">区别：' + esc(g.differenceZh) + '</div>' : '') + '<div class="para-actions"><button id="paraStartRecall" class="topic-chip active">开始回忆</button></div>';
    } else if (stage === "recall") {
      var reverse = paraSession.currentDirection === "memberToAnchor";
      var prompt = reverse ? g.members[0] : g.anchor;
      var answer = reverse ? g.anchor : g.members[0];
      html = '<div class="para-stage">阶段 2 · 主动回忆</div><div class="para-recall"><strong>' + esc(prompt) + '</strong><span>→</span><strong>?</strong></div>' +
        (recallRevealed ? '<div class="para-answer">' + esc(answer) + '</div><div class="para-actions"><button data-rating="know" class="topic-chip active">会</button><button data-rating="uncertain" class="topic-chip">模糊</button><button data-rating="dontKnow" class="topic-chip danger">不会</button></div>' : '<div class="para-actions"><button id="paraReveal" class="topic-chip active">显示答案</button></div>');
    } else {
      html = '<div class="para-stage">' + (stage === "feedback" ? "阶段 3 · 验证反馈" : "阶段 3 · 四选一验证") + '</div><div class="para-stem">' + esc(q.stem) + '</div><div id="quizOptions"></div><div id="quizExplain" class="hidden para-note"></div>';
    }
    els.quizBox.innerHTML = evidenceHtml + html;
    els.quizOptions = document.getElementById("quizOptions");
    els.quizExplain = document.getElementById("quizExplain");
    if (els.quizOptions) q.options.forEach(function (opt, oi) {
      var btn = document.createElement("button"); btn.type = "button"; btn.className = "topic-chip para-option";
      if (quizRevealed && oi === q.correctIndex) btn.className += " correct";
      else if (quizRevealed && quizSelected === oi) btn.className += " wrong";
      btn.textContent = String.fromCharCode(65 + oi) + ". " + opt; btn.disabled = quizRevealed;
      btn.onclick = function () { selectStaticQuiz(oi); }; els.quizOptions.appendChild(btn);
    });
    if (quizRevealed && els.quizExplain) {
      els.quizExplain.classList.remove("hidden");
      els.quizExplain.innerHTML = '<div>正确答案：<strong>' + esc(q.correct) + '</strong></div><div>你选择：' + esc(q.options[quizSelected]) + '</div>' + (q.meta.commonMeaningZh ? '<div>共同义：' + esc(q.meta.commonMeaningZh) + '</div>' : '') + '<div>区别：' + esc(q.meta.differenceZh || "两者在本题语境中意义接近，使用场景可能不同。") + '</div><div class="para-actions"><button id="paraNext" class="topic-chip active">下一题</button></div>';
    }
    var start = document.getElementById("paraStartRecall"); if (start) start.onclick = startStaticRecall;
    var resume = document.getElementById("paraResume"); if (resume) resume.onclick = function () { resumePending = false; saveParaSession(); render(); };
    var restart = document.getElementById("paraRestart"); if (restart) restart.onclick = function () { paraSession.currentIndex = 0; quizPos = 0; paraSession.currentLearningStage = paraSession.mode === "guided" ? "preview" : "quiz"; paraSession.wrongReinsertQueue = []; paraSession.uncertainReinsertQueue = []; paraSession.sessionResults = []; quizRevealed = false; quizSelected = null; resumePending = false; saveParaSession(); render(); };
    var reveal = document.getElementById("paraReveal"); if (reveal) reveal.onclick = function () { recallRevealed = true; render(); };
    document.querySelectorAll("[data-rating]").forEach(function (button) { button.onclick = function () { rateStaticRecall(button.getAttribute("data-rating")); }; });
    var next = document.getElementById("paraNext"); if (next) next.onclick = advanceStaticTask;
    var cont = document.getElementById("paraContinue"); if (cont) cont.onclick = function () { rebuildQuiz(quizSessionMode); render(); };
    var reviewWrong = document.getElementById("paraReviewWrong"); if (reviewWrong) reviewWrong.onclick = function () { rebuildQuiz("guided"); render(); };
    var backMeaning = document.getElementById("paraBackMeaning"); if (backMeaning) backMeaning.onclick = function () { setFilter({ type: "learnMode", value: "meaning" }); };
  }

  function staticMeaningKey(value) {
    return contentText(value).normalize("NFKC").toLowerCase()
      .replace(/[\s，,。；;：:、（）()\[\]【】“”"'·/\\-]+/g, "");
  }

  function normalizeStaticSense(value) {
    if (!value) return null;
    if (typeof value === "string") {
      var stringMeaning = contentText(value);
      return stringMeaning && !isPlaceholderContent(stringMeaning) ? { pos: "", meaning: stringMeaning } : null;
    }
    var meaning = contentText(value.meaningZh || value.meaning_zh || value.gloss || value.meaning || value.chinese);
    if (!meaning || isPlaceholderContent(meaning)) return null;
    return {
      pos: contentText(value.pos || value.posFamily || value.partOfSpeech || value.part_of_speech),
      meaning: meaning,
      isPrimary: value.isPrimary === true,
      readingCommon: value.readingCommon === true
    };
  }

  function staticSenseDisplay(item) {
    var explicit = contentList(item && item.senses).map(normalizeStaticSense).filter(Boolean);
    var preferred = explicit.findIndex(function (sense) { return sense.isPrimary; });
    var reading = explicit.findIndex(function (sense) { return sense.readingCommon; });
    var primaryIndex = preferred >= 0 ? preferred : reading >= 0 ? reading : 0;
    return {
      explicit: explicit,
      primaryIndex: primaryIndex,
      primary: explicit[primaryIndex] || null
    };
  }

  function staticSupplementalSenses(item) {
    var display = staticSenseDisplay(item);
    var primaryMeaning = contentText(display.primary && display.primary.meaning)
      || contentText(item && (item.primaryMeaningZh || item.meaningZh || item.meaning));
    var primaryPos = contentText(display.primary && display.primary.pos)
      || contentText(item && (item.primaryPos || item.pos));
    var primaryMeaningKeys = {};
    var seen = {};
    primaryMeaning.split(/[；;，,、/]+/).map(staticMeaningKey).filter(Boolean).forEach(function (part) {
      primaryMeaningKeys[part] = true;
      seen[staticPosKey(primaryPos) + "::" + part] = true;
    });
    var candidates = display.explicit.filter(function (_, index) { return index !== display.primaryIndex; })
      .concat(contentList(item && item.otherMeanings).map(normalizeStaticSense).filter(Boolean))
      .concat(contentList(item && item.meaningsZh).filter(function (sense) {
        return !sense || !sense.confidence || String(sense.confidence).toLowerCase() === "high";
      }).map(normalizeStaticSense).filter(Boolean));
    return candidates.map(function (sense) {
      var parts = contentText(sense.meaning).split(/[；;，,、/]+/).map(contentText).filter(Boolean).filter(function (part) {
        var key = staticMeaningKey(part);
        var posKey = staticPosKey(sense.pos);
        var identityKey = posKey + "::" + key;
        if (!key || (!posKey && primaryMeaningKeys[key]) || seen[identityKey]) return false;
        seen[identityKey] = true;
        return true;
      });
      return parts.length ? Object.assign({}, sense, { meaning: parts.join("；") }) : null;
    }).filter(Boolean);
  }

  function staticPosKey(value) {
    return contentPosTokens(value).slice().sort().join("|");
  }

  function inlineStaticStudyMeaning(item) {
    var display = staticSenseDisplay(item);
    var primary = contentText(display.primary && display.primary.meaning)
      || contentText(item && (item.primaryMeaningZh || item.meaningZh || item.meaning))
      || "等待释义";
    var primaryPos = staticPosKey(display.primary && display.primary.pos || item && (item.primaryPos || item.pos));
    return [primary].concat(staticSupplementalSenses(item).map(function (sense) {
      var pos = contentText(sense.pos);
      var posLabel = pos && staticPosKey(pos) !== primaryPos ? staticPosDisplay(pos) + " " : "";
      return posLabel + sense.meaning;
    })).join("；");
  }

  function mainMeaningDetail(item, meaning) {
    var word = contentText(item && item.word);
    var primary = contentText(meaning || item && (item.primaryMeaningZh || item.meaningZh || item.meaning));
    var rawDetail = contentText(item && (item.meaningDetailZh || item.meaningDetailedZh));
    var compact = function (value) { return contentText(value).toLowerCase().replace(/[“”"'‘’；;，,。.!！?？、：:\s]/g, ""); };
    var primaryKeys = primary.split(/[；;，,、/]+/).map(compact).filter(Boolean);
    var wholePrimaryKey = compact(primary);
    var semantic = [];
    var support = [];
    var hasPlaceholder = /无中文释义|暂无释义|待补充|待完善|待审核|需要复核|专有名词，需结合原文识别/.test(rawDetail);
    if (rawDetail && !hasPlaceholder) {
      rawDetail.split(/[。！？!?；;]+/).forEach(function (part) {
        var clause = contentText(part).replace(/^[，,：:\s]+|[，,：:\s]+$/g, "");
        var clauseKey = compact(clause);
        if (!clauseKey || clauseKey === wholePrimaryKey || primaryKeys.indexOf(clauseKey) >= 0) return;
        var lower = clause.toLowerCase();
        var wordLower = word.toLowerCase();
        var headwordPrefix = word && (lower.indexOf(wordLower + ":") === 0 || lower.indexOf(wordLower + "：") === 0);
        var remainder = headwordPrefix ? contentText(clause.slice(word.length + 1)) : "";
        if (headwordPrefix && (compact(remainder) === wholePrimaryKey || primaryKeys.indexOf(compact(remainder)) >= 0)) return;
        if (/^(?:“?[a-z][a-z' -]*”?)(?:常见含义为|在雅思(?:听力|阅读)?中的常用含义是|的核心意思是|表示|在当前词条中)/i.test(clause)) return;
        if (/^(?:本词条|该词|“?[a-z][a-z' -]*”?)?(?:按|作).*(?:词|使用)$/i.test(clause)) return;
        if (/(?:复数(?:形式)?|第三人称单数(?:形式)?|过去式|过去分词|现在分词|动名词|比较级|最高级)(?:形式)?$/.test(clause)) support.push(clause);
        else semantic.push(clause.replace(/^例句提示[：:]\s*/, "在当前例句中，"));
      });
    }
    var verified = semantic.join("；");
    if ((verified.match(/[\u3400-\u9fff]/g) || []).length >= 8) return /[。！？!?]$/.test(verified) ? verified : verified + "。";

    var notes = [];
    var formMatch = support.join("；").match(/[“"']([a-z][a-z' -]*)[”"']\s*的\s*(复数(?:形式)?|第三人称单数(?:形式)?|过去式|过去分词|现在分词|动名词|比较级|最高级)/i);
    if (formMatch) notes.push("“" + word + "”是“" + formMatch[1] + "”的" + formMatch[2] + (formMatch[2].slice(-2) === "形式" ? "" : "形式"));
    var definition = contentText(item && item.definition);
    if (/[a-z]{3}/i.test(definition) && !/[\u3400-\u9fff]/.test(definition)) notes.push("英文定义为“" + definition + "”");
    var relationCandidates = (Array.isArray(item && item.collocations) ? item.collocations : []).concat(Array.isArray(item && item.phraseCollocations) ? item.phraseCollocations : []);
    var collocation = relationCandidates.find(function (candidate) {
      var phrase = contentText(typeof candidate === "string" ? candidate : candidate && (candidate.phrase || candidate.text || candidate.collocation));
      var chinese = contentText(typeof candidate === "string" ? "" : candidate && (candidate.chinese || candidate.meaningZh || candidate.meaning));
      return phrase && chinese && (!word || phrase.toLowerCase().indexOf(word.toLowerCase()) >= 0);
    });
    if (collocation) notes.push("常见搭配“" + contentText(collocation.phrase || collocation.text || collocation.collocation) + "”表示“" + contentText(collocation.chinese || collocation.meaningZh || collocation.meaning) + "”");
    var form = (Array.isArray(item && item.forms) ? item.forms : []).find(function (candidate) { return contentText(typeof candidate === "string" ? candidate : candidate && candidate.word); });
    if (form) notes.push(staticFormChineseType(item, form) + "为“" + contentText(typeof form === "string" ? form : form.word) + "”");
    var senseCandidates = (Array.isArray(item && item.otherMeanings) ? item.otherMeanings : []).concat(Array.isArray(item && item.meaningsZh) ? item.meaningsZh : [], Array.isArray(item && item.senses) ? item.senses : []);
    var otherSense = senseCandidates.map(function (candidate) { return contentText(typeof candidate === "string" ? candidate : candidate && (candidate.meaningZh || candidate.meaning || candidate.gloss)); }).find(function (value) { return value && !isPlaceholderContent(value) && compact(value) !== wholePrimaryKey; });
    if (otherSense) notes.push("另有常见义“" + otherSense + "”，需结合语境区分");
    var family = (Array.isArray(item && item.wordFamily) ? item.wordFamily : []).find(function (candidate) { return contentText(candidate && candidate.word) && contentText(candidate && (candidate.meaningZh || candidate.meaning)); });
    if (family) notes.push("相关词“" + contentText(family.word) + "”表示“" + contentText(family.meaningZh || family.meaning) + "”");
    if (notes.length) return notes.slice(0, 2).join("；") + "。";
    return primary ? "现有资料只确认了主释义，语义范围和实际用法仍待补充。" : "该词的主释义和详细说明均待补充。";
  }

  function relationText(value) {
    if (typeof value === "string") return value;
    return contentText(value && (value.word || value.form || value.phrase || value.value));
  }

  function relationDetail(value, fields, fallback) {
    if (typeof value === "string") return fallback || "";
    for (var index = 0; index < fields.length; index += 1) {
      var text = contentText(value && value[fields[index]]);
      if (text) return text;
    }
    return fallback || "";
  }

  function staticRegularFormKind(baseValue, formValue) {
    var base = nk(baseValue);
    var form = nk(formValue);
    if (!base || !form || base === form || /[^a-z'-]/.test(base) || base.indexOf(" ") >= 0) return "";
    var pluralForms = [base + "s"];
    if (/(?:s|x|z|ch|sh|o)$/.test(base)) pluralForms.push(base + "es");
    if (/[^aeiou]y$/.test(base)) pluralForms.push(base.slice(0, -1) + "ies");
    if (/fe$/.test(base)) pluralForms.push(base.slice(0, -2) + "ves");
    else if (/f$/.test(base)) pluralForms.push(base.slice(0, -1) + "ves");
    if (pluralForms.indexOf(form) >= 0) return "plural-or-third-person";
    if (form === base + "'s") return "possessive";

    var ingForms = [base + "ing"];
    if (/ie$/.test(base)) ingForms.push(base.slice(0, -2) + "ying");
    if (/e$/.test(base) && !/(?:ee|ye|oe)$/.test(base)) ingForms.push(base.slice(0, -1) + "ing");
    if (ingForms.indexOf(form) >= 0) return "present-participle";

    var pastForms = [base + "ed"];
    if (/e$/.test(base)) pastForms.push(base + "d");
    if (/[^aeiou]y$/.test(base)) pastForms.push(base.slice(0, -1) + "ied");
    if (pastForms.indexOf(form) >= 0) return "past-or-past-participle";
    return "";
  }

  function staticFormChineseType(item, value) {
    if (typeof value === "string") return "相关词形";
    var type = contentText(value && value.type);
    var lower = type.toLowerCase();
    if (/[㐀-鿿]/.test(type)) return type;
    if (lower.indexOf("irregular plural") >= 0) return "不规则复数";
    if (lower === "plural" || lower.indexOf("plural reminder") >= 0) return "复数形式";
    if (lower.indexOf("third-person") >= 0) return "第三人称单数";
    if (lower.indexOf("past tense / past participle") >= 0) return "过去式 / 过去分词";
    if (lower.indexOf("past tense") >= 0) return "过去式";
    if (lower.indexOf("past participle") >= 0) return "过去分词";
    if (lower.indexOf("present participle") >= 0 || lower.indexOf("gerund") >= 0) return "现在分词 / 动名词";
    if (lower.indexOf("comparative") >= 0) return "比较级";
    if (lower.indexOf("superlative") >= 0) return "最高级";
    if (lower.indexOf("possessive") >= 0) return "所有格";
    if (lower.indexOf("merged-form") >= 0 || lower.indexOf("corpus-observed-form") >= 0 || lower === "form") {
      var kind = staticRegularFormKind(item && item.word, value && value.word);
      var pos = contentPosTokens(item && (item.primaryPos || item.pos));
      var nounOnly = pos.indexOf("noun") >= 0 && pos.indexOf("verb") < 0;
      var verbOnly = pos.indexOf("verb") >= 0 && pos.indexOf("noun") < 0;
      if (kind === "plural-or-third-person" && nounOnly) return "复数形式";
      if (kind === "plural-or-third-person" && verbOnly) return "第三人称单数";
      if (kind === "past-or-past-participle" && verbOnly) return "过去式 / 过去分词";
      if (kind === "present-participle" && verbOnly) return "现在分词 / 动名词";
      if (kind === "possessive" && nounOnly) return "所有格";
      return "相关词形";
    }
    return type || "重要变形";
  }

  function appendRelationRow(list, word, detail, speakable) {
    var row = document.createElement("div");
    row.className = "item";
    if (speakable && word) {
      var sound = document.createElement("button");
      sound.type = "button";
      sound.className = "mini-sound";
      sound.title = "播放发音";
      sound.textContent = "🔊";
      sound.onclick = function () { speak(word); };
      row.appendChild(sound);
    } else {
      var spacer = document.createElement("span");
      spacer.setAttribute("aria-hidden", "true");
      row.appendChild(spacer);
    }
    var pair = document.createElement("div");
    pair.className = "pair-text";
    if (word) {
      var english = document.createElement("div");
      english.className = "en relation-en";
      english.textContent = word;
      pair.appendChild(english);
    }
    var chinese = document.createElement("div");
    chinese.className = "zh relation-zh";
    chinese.textContent = detail;
    pair.appendChild(chinese);
    row.appendChild(pair);
    list.appendChild(row);
  }

  function appendRelationBlock(title, rows) {
    if (!rows.length) return false;
    var block = document.createElement("div");
    block.className = "block";
    var heading = document.createElement("div");
    heading.className = "block-title";
    heading.textContent = title;
    block.appendChild(heading);
    var list = document.createElement("div");
    list.className = "list";
    rows.forEach(function (row) {
      appendRelationRow(list, row.word, row.detail, true);
    });
    block.appendChild(list);
    els.relationBlocks.appendChild(block);
    return true;
  }

  function renderRelationBlocks(item) {
    if (!els.relationBlocks) return;
    els.relationBlocks.replaceChildren();
    els.relationBlocks.classList.add("hidden");
    if (isQuiz() || !item) return;
    var forms = contentList(item.forms).map(function (value) {
      return {
        word: relationText(value),
        detail: relationDetail(value, ["meaning", "note"], "") || staticFormChineseType(item, value)
      };
    }).filter(function (row) { return row.word; });
    var formKeys = {};
    forms.forEach(function (row) { formKeys[row.word.toLowerCase()] = true; });
    var family = contentList(item.wordFamily).map(function (value) {
      var familyPos = typeof value === "object" && value ? staticPosDisplay(value.pos || value.primaryPos) : "";
      var familyMeaning = relationDetail(value, ["meaningZh", "meaning", "relation"], "");
      return {
        word: relationText(value),
        detail: [familyPos, familyMeaning].filter(Boolean).join(" · ") || "同词族词条"
      };
    }).filter(function (row) { return row.word && !formKeys[row.word.toLowerCase()]; });
    var synonymStatus = getStaticSynonymStatus(item);
    var sourceLabel = synonymStatus.source === "master-lexicon"
      ? " · 主词库"
      : synonymStatus.source === "ai-cache"
        ? " · AI缓存"
        : synonymStatus.source === "deepseek"
          ? " · AI核查"
          : "";
    var synonymRows = synonymStatus.state === "available"
      ? synonymStatus.words.map(function (word, index) {
        var detail = synonymStatus.details[index] || {};
        var values = [
          detail.replacementType === "phrase" ? "短语改写" : "同义",
          staticPosDisplay(detail.pos),
          detail.meaningZh
        ].filter(Boolean);
        return { word: word, detail: values.join(" · ") || "释义待补全" };
      })
      : [];
    var renderedCount = 0;
    if (appendRelationBlock("变形", forms)) renderedCount += 1;
    if (appendRelationBlock("词族", family)) renderedCount += 1;
    if (appendRelationBlock(
      "同义替换" + sourceLabel,
      synonymRows
    )) renderedCount += 1;
    els.relationBlocks.classList.toggle("hidden", renderedCount === 0);
  }

  function renderArticleFrequencyPanel(item) {
    if (!els.articleFrequencyPanel) return;
    var isHighFrequency = filter.type === "layer" && filter.value === "part12ArticleHighFrequency";
    var isPart12OnlyFrequency = filter.type === "part12OnlyHighFrequency";
    var isRestFrequency = filter.type === "articleNonHighFrequency";
    var active = !isQuiz() && (isHighFrequency || isPart12OnlyFrequency || isRestFrequency);
    els.articleFrequencyPanel.classList.toggle("hidden", !active);
    if (!active) return;

    var evidence = item && item.part12ArticleFrequency;
    var part1 = Number(evidence && evidence.part1ArticleCount) || 0;
    var part2 = Number(evidence && evidence.part2ArticleCount) || 0;
    var part3 = Number(evidence && evidence.part3ArticleCount) || 0;
    var part12Articles = Number(evidence && evidence.articleCount) || 0;
    var totalArticles = isPart12OnlyFrequency ? part12Articles : part12Articles + part3;
    var occurrences = Number(evidence && evidence.occurrenceCount) || totalArticles;
    var tier = totalArticles >= 10
      ? { key: "high", label: "高频 · 10篇以上" }
      : totalArticles >= 3
        ? { key: "multi", label: "多篇出现" }
        : totalArticles >= 2
          ? { key: "repeat", label: "重复出现" }
          : { key: "single", label: "单篇命中" };

    if (els.articleFrequencyTier) {
      els.articleFrequencyTier.dataset.tier = evidence ? tier.key : "unknown";
      els.articleFrequencyTier.textContent = evidence ? tier.label : "依据待补";
    }
    if (els.articleFrequencyWord) {
      els.articleFrequencyWord.textContent = (item && item.word ? item.word : "当前词")
        + (isRestFrequency
          ? " · 其余词汇共 "
          : isPart12OnlyFrequency
            ? " · Part 1+2 文章高频共 "
            : " · 文章高频词表共 ")
        + study.length + " 个词条";
    }
    if (els.articleFrequencyStats) {
      els.articleFrequencyStats.textContent = evidence
        ? "命中 " + totalArticles + " 篇 · 原文出现 " + occurrences + " 次 · Part 1 " + part1 + "篇 / Part 2 " + part2 + "篇 / Part 3 " + part3 + "篇"
        : "当前词缺少逐篇统计依据，请按普通词卡学习。";
    }
    if (els.articleFrequencySurfaces) {
      var surfaces = evidence && Array.isArray(evidence.surfaces)
        ? evidence.surfaces.slice(0, 6)
        : [];
      els.articleFrequencySurfaces.textContent = surfaces.length
        ? "原文命中形式：" + surfaces.join(" / ")
        : "";
    }
  }

  function render() {
    var item = currentItem();
    var contentQuality = isQuiz() ? null : getStaticContentQuality(item);
    var isContentPending = Boolean(contentQuality && contentQuality.isLearningBlocked);
    var st = isQuiz()
      ? (function () {
          var q = quizQueue[quizPos];
          if (!q) return "";
          var e = paraMap[q.groupId] || {};
          var code = e.paraphraseStatus || (e.mastered ? "familiar" : "");
          return code === "familiar" ? "熟悉" : code === "unfamiliar" ? "不熟" : "";
        })()
      : getUiStatus(item);

    if (els.word) els.word.textContent = item.word || "—";
    if (els.basic) {
      els.basic.textContent = isQuiz()
        ? item.meaning
        : isContentPending
          ? "已进入内容补全队列 · 待补：" + contentQuality.issueLabels.join("、")
          : (item.phonetic ? item.phonetic + " · " : "") +
            (staticPosDisplay(item.pos) || "词性待补") +
            " · " +
            inlineStaticStudyMeaning(item);
    }
    if (els.meaningDetail && els.meaningDetailText) {
      els.meaningDetail.classList.toggle("hidden", isQuiz());
      els.meaningDetailText.textContent = isQuiz()
        ? ""
        : mainMeaningDetail(item, item.meaning);
    }
    if (els.example) {
      var visibleExample = isQuiz()
        ? ""
        : isContentPending
          ? "该词已转入内容补全队列，补全后才会进入普通刷词。"
          : item.example || "—";
      if (!isQuiz() && !isContentPending) {
        window.IeltsExampleHighlight.render(els.example, visibleExample, item);
      } else {
        els.example.textContent = visibleExample;
      }
    }
    if (els.exampleCn) {
      els.exampleCn.textContent = isQuiz()
        ? ""
        : isContentPending
          ? "待补：" + contentQuality.issueLabels.join("、")
          : item.exampleCn || "";
    }
    if (els.loadInfo) {
      els.loadInfo.textContent = !isQuiz() && filter.type === "contentIncomplete" && contentQuality && contentQuality.isScored
        ? "资料完整度 " + contentQuality.completedCount + "/" + contentQuality.totalCount + " · " + contentQuality.percent + "%"
        : "";
    }
    renderArticleFrequencyPanel(item);
    var exampleSoundBtn = document.getElementById("exampleSoundBtn");
    if (exampleSoundBtn) exampleSoundBtn.disabled = isContentPending || isQuiz();
    renderRelationBlocks(item);

    var total = isQuiz() ? (paraSession ? paraSession.baseGroupCount : SESSION_SIZES[quizSessionMode]) : study.length;
    var pos = isQuiz() ? Math.min(quizPos + 1, total) : Math.max(1, study.indexOf(index) + 1);
    if (els.count) {
      if (isQuiz()) {
        var pool = eligibleGroups().length;
        var cov = (coverage.seenGroupIds || []).length;
        els.count.textContent =
          (total ? pos + " / " + total : "0 / 0") + " · 累计 " + cov + "/" + pool;
      } else {
        els.count.textContent = total ? pos + " / " + total : "0 / 0";
      }
    }
    if (els.progressFill) {
      els.progressFill.style.width = total ? Math.max(1, (pos / total) * 100) + "%" : "0%";
    }
    syncProgressControls(pos, total);
    if (els.favoriteBtn) {
      els.favoriteBtn.textContent = !isQuiz() && isFavorite(item) ? "★" : "☆";
    }
    if (els.unfamiliarAlert) {
      if (st === "不熟") els.unfamiliarAlert.classList.remove("hidden");
      else els.unfamiliarAlert.classList.add("hidden");
    }
    if (els.knownBtn) { els.knownBtn.textContent = "认识"; els.knownBtn.style.display = isQuiz() ? "none" : ""; }
    if (els.unknownBtn) { els.unknownBtn.textContent = st === "不熟" ? "取消不熟" : "不熟"; els.unknownBtn.style.display = isQuiz() ? "none" : ""; }

    updateAutoPlayUi();
    renderQuiz();
  }

  function go(delta, fromAutoPlay) {
    if (isQuiz()) {
      if (delta > 0 && paraSession && paraSession.currentLearningStage === "feedback") advanceStaticTask();
      return;
    }
    if (!study.length) return;
    var p = study.indexOf(index);
    if (p < 0) p = 0;
    p = (p + delta + study.length) % study.length;
    index = study[p];
    saveSession();
    render();
    if (autoPlayActive && !fromAutoPlay) runAutoPlayStep();
  }

  function clampStudyPosition(value) {
    var total = study.length;
    var numeric = Math.round(Number(value));
    if (!Number.isFinite(numeric)) numeric = 1;
    return Math.max(1, Math.min(total, numeric));
  }

  function previewStudyPosition(value) {
    if (isQuiz() || !study.length) return;
    var position = clampStudyPosition(value);
    var item = words[study[position - 1]];
    if (els.progressFill) els.progressFill.style.width = Math.max(1, (position / study.length) * 100) + "%";
    if (els.count) els.count.textContent = position + " / " + study.length;
    if (els.progressPreview) {
      els.progressPreview.textContent = item ? "第 " + position + " 个 · " + item.word : "第 " + position + " 个";
      els.progressPreview.classList.remove("hidden");
    }
  }

  function seekStudyPosition(value) {
    if (isQuiz() || !study.length) return;
    var position = clampStudyPosition(value);
    index = study[position - 1];
    if (els.progressJump) els.progressJump.classList.add("hidden");
    saveSession();
    render();
  }

  function toggleProgressJump() {
    if (!els.progressJump || isQuiz() || study.length < 2) return;
    var opening = els.progressJump.classList.contains("hidden");
    els.progressJump.classList.toggle("hidden", !opening);
    if (opening && els.progressJumpInput) {
      var position = study.indexOf(index) + 1;
      els.progressJumpInput.value = String(Math.max(1, position));
      els.progressJumpInput.focus();
      els.progressJumpInput.select();
    }
  }

  function syncProgressControls(position, total) {
    var canSeek = !isQuiz() && total > 1;
    if (els.progressSeek) {
      els.progressSeek.min = "1";
      els.progressSeek.max = String(Math.max(1, total));
      els.progressSeek.value = String(Math.max(1, position));
      els.progressSeek.disabled = !canSeek;
      els.progressSeek.classList.toggle("hidden", !canSeek);
    }
    if (els.progressJumpBtn) {
      els.progressJumpBtn.disabled = !canSeek;
      els.progressJumpBtn.setAttribute("aria-label", canSeek
        ? "精确跳转位置，当前第 " + position + " / " + total + " 个词"
        : "当前列表无法跳转");
    }
    if (els.progressJumpInput) {
      els.progressJumpInput.min = "1";
      els.progressJumpInput.max = String(Math.max(1, total));
    }
    if (els.progressJumpTotal) els.progressJumpTotal.textContent = "/ " + total;
    if (!canSeek && els.progressJump) els.progressJump.classList.add("hidden");
    if (els.progressPreview) els.progressPreview.classList.add("hidden");
  }

  function setFilter(next) {
    if (!isQuiz()) saveSession();
    filter = next;
    quizRevealed = false;
    quizSelected = null;
    if (filter.type === "paraphraseQuiz") stopAutoPlay();
    if (filter.type === "paraphraseQuiz") {
      quizSessionMode = filter.sessionMode || "guided";
      rebuildQuiz(quizSessionMode);
      saveQuizNavigation();
      toast(
        "同义替换训练 · 安全题库 " +
          eligibleGroups().length +
          " 组 · 本轮 " +
          (SESSION_SIZES[quizSessionMode] || 10) +
          " 题"
      );
    } else {
      loadOrderPreferences();
      rebuildStudy();
      if (!restoreStudyPosition(filter)) resetStudyToStart();
      saveSession();
    }
    renderTopics();
    render();
    if (autoPlayActive) runAutoPlayStep();
  }

  function entryFilterKey(value) {
    return filterKey(value) + (value && value.type === "paraphraseQuiz" ? ":" + (value.sessionMode || "guided") : "");
  }

  function learningEntryOptions() {
    return [
      { label: ARTICLE_HF_LABEL, desc: "覆盖 Part 1+2 的224篇短文和 Part 3 的56篇文章；词卡显示命中篇数、次数和原文形式", f: { type: "layer", value: "part12ArticleHighFrequency" }, featured: true },
      { label: PART12_ONLY_HF_LABEL, desc: "只统计 Part 1+2 的224篇短文，出现2篇及以上，并去掉零基础单词；默认按出现篇数从高到低", f: PART12_ONLY_HF_FILTER, featured: true },
      { label: ARTICLE_REST_LABEL, desc: "未列入文章高频的其余待学词；默认按280篇文章出现篇数排序", f: ARTICLE_REST_FILTER, featured: true },
      { label: UNFAMILIAR_LABEL, desc: "只看你标记为不熟的词，方便回头找", f: UNFAMILIAR_FILTER, featured: true },
      { label: "阶段1：基础保分", desc: "核心、高频和答题主线", f: { type: "pathStage", value: "1" } },
      { label: "逻辑转换（完整词书）", desc: "因果、条件、对比、数量程度、语气强度、时间与文章衔接逻辑词", f: { type: "layer", value: "logic120" } },
      { label: "G4-G21 Part1-2考试短语150", desc: "考试导向的规则、短语动词与场景表达", f: { type: "layer", value: "gtPart12Phrases150" } },
      { label: "阶段2：扩大覆盖", desc: "扩大常见阅读词汇覆盖", f: { type: "pathStage", value: "2" } },
      { label: "阶段3：文章强化", desc: "文章与题库扩展词汇", f: { type: "pathStage", value: "3" } },
      { label: "阶段4：参考查阅", desc: "低频词和参考词条", f: { type: "pathStage", value: "4" } },
      { label: "全部待学", desc: "所有可学习 active 词条", f: { type: "active", value: "" } },
      { label: "词义学习", desc: "单词释义、词性、词形和词族", f: { type: "learnMode", value: "meaning" } },
      { label: "短语学习", desc: "固定搭配与短语训练", f: { type: "learnMode", value: "phrase" } },
      { label: "同义引导·10组", desc: "预览、回忆，再做四选一", f: { type: "paraphraseQuiz", value: "", sessionMode: "guided" } },
      { label: "同义测验·20题", desc: "直接进行同义替换测验", f: { type: "paraphraseQuiz", value: "", sessionMode: "quick" } },
      { label: "资料待修复", desc: "查看资料字段不完整的词条", f: { type: "contentIncomplete", value: "" } },
      { label: "同义待补全", desc: "尚未核查安全同义替换", f: { type: "synonymPending", value: "" } },
      { label: "已核查无替换", desc: "已核查但没有安全常见替换", f: { type: "synonymReviewedNone", value: "" } }
    ];
  }

  function countForEntry(nextFilter) {
    if (nextFilter.type === "paraphraseQuiz") return eligibleGroups().length + " 组安全题库";
    var currentFilter = filter;
    filter = nextFilter;
    var count = words.filter(matches).length;
    filter = currentFilter;
    return count + " 个词条";
  }

  function renderTopics() {
    if (!els.topicBar) return;
    var entries = learningEntryOptions();
    var currentKey = entryFilterKey(filter);
    var hfCount = document.getElementById("hfPanelEntryCount");
    var hfFilter = ARTICLE_HF_FILTER;
    var hfCountText = countForEntry(hfFilter);
    if (hfCount) hfCount.textContent = hfCountText;
    var hfPanelBtn = document.getElementById("hfPanelEntryBtn");
    if (hfPanelBtn) {
      hfPanelBtn.classList.toggle("active", currentKey === entryFilterKey(hfFilter));
    }
    var restCount = document.getElementById("restPanelEntryCount");
    var restCountText = countForEntry(ARTICLE_REST_FILTER);
    if (restCount) restCount.textContent = restCountText;
    var restPanelBtn = document.getElementById("restPanelEntryBtn");
    if (restPanelBtn) {
      restPanelBtn.classList.toggle("active", currentKey === entryFilterKey(ARTICLE_REST_FILTER));
    }
    var part12OnlyCount = document.getElementById("part12OnlyHfPanelEntryCount");
    var part12OnlyCountText = countForEntry(PART12_ONLY_HF_FILTER);
    if (part12OnlyCount) part12OnlyCount.textContent = part12OnlyCountText;
    var part12OnlyPanelBtn = document.getElementById("part12OnlyHfPanelEntryBtn");
    if (part12OnlyPanelBtn) {
      part12OnlyPanelBtn.classList.toggle("active", currentKey === entryFilterKey(PART12_ONLY_HF_FILTER));
    }
    if (els.part12OnlyHfQuickEntryBtn) {
      var part12OnlyActive = currentKey === entryFilterKey(PART12_ONLY_HF_FILTER);
      els.part12OnlyHfQuickEntryBtn.classList.toggle("active", part12OnlyActive);
      els.part12OnlyHfQuickEntryBtn.setAttribute("aria-pressed", String(part12OnlyActive));
    }
    if (els.part12OnlyHfQuickEntryCount) {
      els.part12OnlyHfQuickEntryCount.textContent = part12OnlyCountText.replace(" 个词条", "词");
    }
    var unfamiliarCount = document.getElementById("unfamiliarPanelEntryCount");
    var unfamiliarCountText = countForEntry(UNFAMILIAR_FILTER);
    if (unfamiliarCount) unfamiliarCount.textContent = unfamiliarCountText;
    var unfamiliarPanelBtn = document.getElementById("unfamiliarPanelEntryBtn");
    if (unfamiliarPanelBtn) {
      unfamiliarPanelBtn.classList.toggle("active", currentKey === entryFilterKey(UNFAMILIAR_FILTER));
    }
    if (els.unfamiliarQuickEntryBtn) {
      var unfamiliarActive = currentKey === entryFilterKey(UNFAMILIAR_FILTER);
      els.unfamiliarQuickEntryBtn.classList.toggle("active", unfamiliarActive);
      els.unfamiliarQuickEntryBtn.setAttribute("aria-pressed", String(unfamiliarActive));
    }
    if (els.unfamiliarQuickEntryCount) {
      els.unfamiliarQuickEntryCount.textContent = unfamiliarCountText.replace(" 个词条", "词");
    }
    if (els.hfQuickEntryBtn) {
      var hfActive = currentKey === entryFilterKey(hfFilter);
      els.hfQuickEntryBtn.classList.toggle("active", hfActive);
      els.hfQuickEntryBtn.setAttribute("aria-pressed", String(hfActive));
    }
    if (els.hfQuickEntryCount) {
      els.hfQuickEntryCount.textContent = hfCountText.replace(" 个词条", "词");
    }
    els.topicBar.replaceChildren();
    entries.filter(function (entry) { return !entry.featured; }).forEach(function (entry) {
      var key = entryFilterKey(entry.f);
      var button = document.createElement("button");
      button.type = "button";
      button.className = "entry-btn" + (key === currentKey ? " active" : "") + (entry.featured ? " entry-btn-featured" : "");
      var title = document.createElement("span");
      title.className = "entry-title";
      if (entry.featured) {
        var tag = document.createElement("span");
        tag.className = "entry-featured-tag";
        tag.textContent = "常用";
        title.append(tag, document.createTextNode(entry.label));
      } else {
        title.textContent = entry.label;
      }
      var desc = document.createElement("span");
      desc.className = "entry-desc";
      desc.textContent = entry.desc;
      var meta = document.createElement("span");
      meta.className = "entry-meta";
      meta.textContent = countForEntry(entry.f);
      button.append(title, desc, meta);
      button.onclick = function () {
        setEntryPanelOpen(false);
        setFilter(entry.f);
        if (entry.featured) toast("已进入" + entry.label + " · " + study.length + " 个词条");
      };
      els.topicBar.appendChild(button);
    });
    if (els.entrySelect) {
      els.entrySelect.replaceChildren();
      entries.forEach(function (entry) {
        var option = document.createElement("option");
        option.value = entryFilterKey(entry.f);
        option.textContent = entry.label + " · " + countForEntry(entry.f);
        els.entrySelect.appendChild(option);
      });
      if (Array.from(els.entrySelect.options).some(function (option) { return option.value === currentKey; })) {
        els.entrySelect.value = currentKey;
      }
      els.entrySelect.onchange = function () {
        var selected = entries.find(function (entry) { return entryFilterKey(entry.f) === els.entrySelect.value; });
        if (!selected) return;
        setFilter(selected.f);
        if (selected.featured) toast("已进入" + selected.label + " · " + study.length + " 个词条");
      };
    }
    updateControlsSummary();
    renderOrderControls();
  }

  function mark(kind) {
    if (isQuiz()) {
      toast("请按预览、回忆和验证流程完成当前关系");
      return;
    }
    var item = words[index];
    if (!item) return;
    var previousStudy = study.slice();
    var previousStudyPosition = previousStudy.indexOf(index);
    var currentIndex = index;
    var cur = getUiStatus(item);
    var next = kind;
    if (kind === "不熟" && cur === "不熟") next = "";
    patchStatus(item, { status: next });
    toast(next === "熟悉" ? "已熟悉" : next === "不熟" ? "已不熟" : "已取消");
    var leavesQueue = (filter.type === "status" && filter.value === "不熟" && next !== "不熟")
      || (filter.type === "status" && filter.value === "熟悉" && next !== "熟悉")
      || (next === "熟悉"
        && filter.type !== "everything"
        && filter.type !== "reference"
        && filter.type !== "paraphrase"
        && filter.type !== "paraphraseQuiz"
        && !(filter.type === "pathStage" && filter.value === "4"));
    if (leavesQueue) {
      rebuildStudy();
      if (study.length) {
        var remaining = {};
        for (var i = 0; i < study.length; i += 1) remaining[study[i]] = true;
        var landed = false;
        for (var offset = 1; offset <= previousStudy.length; offset += 1) {
          var candidate = previousStudy[(Math.max(0, previousStudyPosition) + offset) % previousStudy.length];
          if (remaining[candidate]) {
            index = candidate;
            landed = true;
            break;
          }
        }
        if (!landed) {
          var currentPosition = study.indexOf(currentIndex);
          index = study[currentPosition >= 0 ? (currentPosition + 1) % study.length : 0];
        }
      }
    } else if (previousStudy.length) {
      var stayPos = Math.max(0, previousStudyPosition);
      index = previousStudy[(stayPos + 1) % previousStudy.length];
    }
    saveSession();
    render();
    if (autoPlayActive) runAutoPlayStep();
  }

  function migrateV4Once() {
    var flag = loadJson(MIG_V4, null);
    if (flag && flag.completed) return;
    var raw = loadJson(STATUS_KEY, {});
    var flat = raw && raw.entries ? raw.entries : raw || {};
    var next = {};
    var matched = 0;
    Object.keys(flat).forEach(function (k) {
      if (k === "progressSchemaVersion" || k === "entries" || k === "paraphrases") return;
      var val = flat[k];
      // Try the current id, then historic ids merged into a canonical entry.
      var item = null;
      for (var i = 0; i < words.length; i++) {
        if (words[i].id === k) {
          item = words[i];
          break;
        }
        var merged = Array.isArray(words[i].mergedAliases) ? words[i].mergedAliases : [];
        if (merged.some(function (alias) {
          return String(alias && alias.id || "") === k || nk(alias && (alias.key || alias.word)) === nk(k);
        })) {
          item = words[i];
          break;
        }
      }
      if (!item && k.indexOf("::") >= 0) {
        for (var j = 0; j < words.length; j++) {
          if (entryKey(words[j]) === k) {
            item = words[j];
            break;
          }
        }
      }
      if (!item) {
        var candidates = words.filter(function (w) {
          return nk(w.word) === nk(k) || w.normalizedKey === nk(k);
        });
        if (candidates.length === 1) item = candidates[0];
        else return; // ambiguous or missing
      }
      next[entryKey(item)] = normStatus(val);
      matched++;
    });
    statusMap = next;
    paraMap = (raw && raw.paraphrases) || loadJson(PARA_KEY, {}) || {};
    writeStatusMap(statusMap);
    saveJson(PARA_KEY, paraMap);
    saveJson(MIG_V4, { completed: true, matchedCount: matched, at: new Date().toISOString() });
  }

  // v5 deliberately runs after an already-completed v4: the data may have
  // since compacted a standalone plural/tense form into its real headword.
  function migrateV5ReferenceFormsOnce() {
    var flag = loadJson(MIG_V5, null);
    if (flag && flag.completed) return;
    var raw = loadJson(STATUS_KEY, {});
    var flat = raw && raw.entries ? raw.entries : raw || {};
    var next = {};
    var matched = 0;
    Object.keys(flat).forEach(function (k) {
      if (k === "progressSchemaVersion" || k === "entries" || k === "paraphrases") return;
      var item = null;
      for (var i = 0; i < words.length; i++) {
        var candidate = words[i];
        var aliases = Array.isArray(candidate.mergedAliases) ? candidate.mergedAliases : [];
        if (
          candidate.id === k
          || entryKey(candidate) === k
          || nk(candidate.word) === nk(k)
          || aliases.some(function (alias) {
            return String(alias && alias.id || "") === k || nk(alias && (alias.key || alias.word)) === nk(k);
          })
        ) {
          item = candidate;
          break;
        }
      }
      if (!item) return;
      var key = entryKey(item);
      var incoming = normStatus(flat[k]);
      var previous = normStatus(next[key]);
      next[key] = {
        meaningStatus: previous.meaningStatus !== "unlearned" ? previous.meaningStatus : incoming.meaningStatus,
        phraseStatus: previous.phraseStatus !== "unlearned" ? previous.phraseStatus : incoming.phraseStatus,
        paraphraseStatus: previous.paraphraseStatus !== "unlearned" ? previous.paraphraseStatus : incoming.paraphraseStatus,
        status: previous.status || incoming.status,
        favorite: previous.favorite || incoming.favorite
      };
      matched++;
    });
    statusMap = next;
    paraMap = (raw && raw.paraphrases) || loadJson(PARA_KEY, {}) || {};
    writeStatusMap(statusMap);
    saveJson(PARA_KEY, paraMap);
    saveJson(MIG_V5, { completed: true, matchedCount: matched, at: new Date().toISOString() });
  }

  function speak(text) {
    var value = String(text || "").trim();
    if (!value) return;
    try {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(value);
        u.lang = "en-US";
        u.rate = 0.9;
        window.speechSynthesis.speak(u);
      }
    } catch (e) {}
  }

  function canAutoPlay() {
    return !isQuiz() && study.length >= 2;
  }

  function updateAutoPlayUi() {
    var btn = document.getElementById("autoPlayBtn");
    var speed = document.getElementById("autoPlaySpeed");
    if (btn) {
      btn.disabled = !canAutoPlay();
      btn.textContent = autoPlayActive ? "暂停播放 · " + autoPlaySeconds + "s" : "自动播放 · A";
    }
    if (speed) {
      speed.disabled = !canAutoPlay();
      speed.value = String(autoPlaySeconds);
    }
  }

  function stopAutoPlay() {
    autoPlayActive = false;
    if (autoPlayTimer) {
      window.clearTimeout(autoPlayTimer);
      autoPlayTimer = null;
    }
    updateAutoPlayUi();
  }

  function scheduleAutoPlayAdvance() {
    if (!autoPlayActive) return;
    if (!canAutoPlay() || document.hidden) {
      stopAutoPlay();
      return;
    }
    if (autoPlayTimer) window.clearTimeout(autoPlayTimer);
    autoPlayTimer = window.setTimeout(function () {
      autoPlayTimer = null;
      if (!autoPlayActive) return;
      if (!canAutoPlay() || document.hidden) {
        stopAutoPlay();
        return;
      }
      go(1, true);
      runAutoPlayStep();
    }, autoPlaySeconds * 1000);
  }

  function runAutoPlayStep() {
    if (!autoPlayActive) return;
    if (!canAutoPlay() || document.hidden) {
      stopAutoPlay();
      return;
    }
    speak(currentItem() && currentItem().word);
    scheduleAutoPlayAdvance();
  }

  function startAutoPlay() {
    if (!canAutoPlay()) {
      updateAutoPlayUi();
      return;
    }
    autoPlayActive = true;
    if (autoPlayTimer) window.clearTimeout(autoPlayTimer);
    updateAutoPlayUi();
    runAutoPlayStep();
  }

  function toggleAutoPlay() {
    if (autoPlayActive) stopAutoPlay();
    else startAutoPlay();
  }

  function bind() {
    var prev = document.getElementById("prevBtn");
    var prevTop = document.getElementById("prevTopBtn");
    var next = document.getElementById("nextBtn");
    var shuffle = document.getElementById("shuffleBtn");
    var autoPlay = document.getElementById("autoPlayBtn");
    var autoPlaySpeed = document.getElementById("autoPlaySpeed");
    var wordSound = document.getElementById("wordSoundBtn");
    var exampleSound = document.getElementById("exampleSoundBtn");
    if (prev) prev.onclick = function () { go(-1); };
    if (prevTop) prevTop.onclick = function () { go(-1); };
    if (next) next.onclick = function () { go(1); };
    if (autoPlay) autoPlay.onclick = toggleAutoPlay;
    if (autoPlaySpeed)
      autoPlaySpeed.onchange = function () {
        autoPlaySeconds = Number(autoPlaySpeed.value) || 6;
        if (autoPlayActive) startAutoPlay();
        else updateAutoPlayUi();
      };
    if (shuffle)
      shuffle.onclick = function () {
        if (isQuiz()) {
          if (!paraSession) return;
          var start = paraSession.currentIndex + 1;
          var tail = paraSession.currentSessionGroupIds.slice(start).map(function (id, offset) {
            return { id: id, kind: paraSession.sessionTaskKinds[start + offset], question: quizQueue[start + offset] };
          });
          tail = shuffleArr(tail);
          paraSession.currentSessionGroupIds = paraSession.currentSessionGroupIds.slice(0, start).concat(tail.map(function (row) { return row.id; }));
          paraSession.sessionTaskKinds = paraSession.sessionTaskKinds.slice(0, start).concat(tail.map(function (row) { return row.kind; }));
          quizQueue = quizQueue.slice(0, start).concat(tail.map(function (row) { return row.question; }));
          var cycleStart = Math.min(coverage.currentCycleIndex, coverage.currentCycleOrder.length);
          coverage.currentCycleOrder = coverage.currentCycleOrder.slice(0, cycleStart).concat(shuffleArr(coverage.currentCycleOrder.slice(cycleStart)));
          saveCoverage(); saveParaSession();
          render();
          toast("已重排本轮未完成任务，覆盖周期未重置");
          return;
        }
        if (!study.length) return;
        index = study[Math.floor(Math.random() * study.length)];
        saveSession();
        render();
        if (autoPlayActive) runAutoPlayStep();
      };
    if (els.knownBtn) els.knownBtn.onclick = function () { mark("熟悉"); };
    if (els.unknownBtn) els.unknownBtn.onclick = function () { mark("不熟"); };
    if (els.favoriteBtn)
      els.favoriteBtn.onclick = function () {
        if (isQuiz()) return;
        var item = words[index];
        patchStatus(item, { favorite: !isFavorite(item) });
        render();
      };
    if (wordSound)
      wordSound.onclick = function () {
        var item = currentItem();
        speak(item && item.word);
      };
    if (exampleSound)
      exampleSound.onclick = function () {
        var item = currentItem();
        speak(item && item.example);
      };

    if (!bind._controlsBound) {
      bind._controlsBound = true;
      var savedTools = null;
      try { savedTools = localStorage.getItem(TOP_TOOLS_KEY); } catch (e) {}
      setTopToolsCollapsed(
        window.innerHeight <= 900 || savedTools === "1",
        false
      );
      if (els.topToolsToggle) els.topToolsToggle.addEventListener("click", function () {
        var collapsed = !els.readingTopbar.classList.contains("is-tools-collapsed");
        setTopToolsCollapsed(collapsed, true);
      });
      if (els.hfQuickEntryBtn) els.hfQuickEntryBtn.addEventListener("click", openArticleHighFrequency);
      if (els.part12OnlyHfQuickEntryBtn) els.part12OnlyHfQuickEntryBtn.addEventListener("click", openPart12OnlyHighFrequency);
      if (els.unfamiliarQuickEntryBtn) els.unfamiliarQuickEntryBtn.addEventListener("click", openUnfamiliar);
      if (els.readingEntryBtn) els.readingEntryBtn.addEventListener("click", function () { setEntryPanelOpen(true); });
      if (els.readingControlsClose) els.readingControlsClose.addEventListener("click", function () { setEntryPanelOpen(false); });
      if (els.articleFrequencyRangesBtn) els.articleFrequencyRangesBtn.addEventListener("click", function () { setEntryPanelOpen(true); });
      if (els.articleFrequencyRestartBtn) els.articleFrequencyRestartBtn.addEventListener("click", function () {
        if (!study.length) return;
        resetStudyToStart();
        saveSession();
        render();
        toast("已从第1个词重新开始");
      });
      if (els.readingControls) els.readingControls.addEventListener("click", function (event) {
        if (event.target === els.readingControls) setEntryPanelOpen(false);
      });
      if (els.wordOrderSelect) els.wordOrderSelect.addEventListener("change", function () {
        applyOrderPreference(els.wordOrderSelect.value, "");
      });
      if (els.difficultyOrderSelect) els.difficultyOrderSelect.addEventListener("change", function () {
        applyOrderPreference("", els.difficultyOrderSelect.value);
      });
      if (els.progressSeek) {
        els.progressSeek.addEventListener("input", function () {
          previewStudyPosition(els.progressSeek.value);
        });
        els.progressSeek.addEventListener("change", function () {
          seekStudyPosition(els.progressSeek.value);
        });
        els.progressSeek.addEventListener("pointercancel", function () {
          render();
        });
        els.progressSeek.addEventListener("keyup", function (event) {
          if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
            seekStudyPosition(els.progressSeek.value);
          }
        });
      }
      if (els.progressJumpBtn) els.progressJumpBtn.addEventListener("click", toggleProgressJump);
      if (els.progressJump) els.progressJump.addEventListener("submit", function (event) {
        event.preventDefault();
        seekStudyPosition(els.progressJumpInput && els.progressJumpInput.value);
      });
      if (els.progressJumpCancel) els.progressJumpCancel.addEventListener("click", function () {
        if (els.progressJump) els.progressJump.classList.add("hidden");
      });
    }

    if (!bind._lifecycleBound) {
      bind._lifecycleBound = true;
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden) return;
        saveSession();
        if (autoPlayActive) stopAutoPlay();
      });
      window.addEventListener("pagehide", saveSession);
      window.addEventListener("beforeunload", saveSession);
    }

    // Align with Next /reading-g + static basic.js: keyboard navigation
    if (!bind._keysBound) {
      bind._keysBound = true;
      window.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && els.readingControls && !els.readingControls.classList.contains("hidden")) {
          e.preventDefault();
          setEntryPanelOpen(false);
          return;
        }
        var tag = (document.activeElement && document.activeElement.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;

        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          go(1);
          return;
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          go(-1);
          return;
        }

        if (!isQuiz()) {
          if (e.key === "Escape" && autoPlayActive) {
            e.preventDefault();
            stopAutoPlay();
            return;
          }
          if (e.code === "KeyA") {
            e.preventDefault();
            toggleAutoPlay();
            return;
          }
          if (e.code === "BracketLeft" || e.key === "[") {
            e.preventDefault();
            autoPlaySeconds = autoPlaySeconds === 10 ? 6 : autoPlaySeconds === 6 ? 4 : autoPlaySeconds === 4 ? 2 : 10;
            if (autoPlayActive) startAutoPlay();
            else updateAutoPlayUi();
            return;
          }
          if (e.code === "BracketRight" || e.key === "]") {
            e.preventDefault();
            autoPlaySeconds = autoPlaySeconds === 2 ? 4 : autoPlaySeconds === 4 ? 6 : autoPlaySeconds === 6 ? 10 : 2;
            if (autoPlayActive) startAutoPlay();
            else updateAutoPlayUi();
            return;
          }
          if (e.key === "Tab") {
            e.preventDefault();
            var c = currentItem();
            if (c) speak(c.word);
            return;
          }
          if (e.code === "Space" || e.key === " ") {
            e.preventDefault();
            var c2 = currentItem();
            if (c2) speak(c2.example);
            return;
          }
          if (e.key === "1") {
            e.preventDefault();
            if (els.knownBtn) els.knownBtn.click();
            return;
          }
          if (e.key === "3") {
            e.preventDefault();
            if (els.unknownBtn) els.unknownBtn.click();
            return;
          }
        } else if (!quizRevealed) {
          // 同义四选一：A-D 选选项（与正式站一致；数字键留给熟悉/不熟）
          var map = { a: 0, b: 1, c: 2, d: 3, A: 0, B: 1, C: 2, D: 3 };
          if (map[e.key] != null && typeof selectStaticQuiz === "function") {
            e.preventDefault();
            selectStaticQuiz(map[e.key]);
          }
        } else if (quizRevealed && (e.key === "Enter" || e.key === "ArrowRight" || e.key === "ArrowDown")) {
          // already handled ArrowRight above via go(1) which advances feedback
        }
      });
    }
  }

  function boot() {
    if (els.loadInfo) {
      els.loadInfo.textContent =
        "静态便携版 · 词库、同义关系与真题证据独立加载 · 进度本机 · 与正式站核心能力对齐";
    }
    Promise.all([
      Promise.all([
        import(ORDERING_MODULE_ROOT + "word-study-ordering.mjs"),
        import(ORDERING_MODULE_ROOT + "word-internal-difficulty.mjs")
      ]).then(function (modules) {
        sharedWordStudyOrdering = modules[0];
        sharedWordDifficulty = modules[1];
      }),
      fetch(versionedDataUrl(DATA_URL), { cache: "default" }).then(function (r) {
        if (!r.ok) throw new Error("vocab " + r.status);
        return r.json();
      }),
      fetch(versionedDataUrl(PARA_URL), { cache: "default" }).then(function (r) {
        if (!r.ok) throw new Error("paraphrases " + r.status);
        return r.json();
      }),
      fetch(versionedDataUrl(QUESTION_EVIDENCE_URL), { cache: "default" }).then(function (r) {
        if (!r.ok) throw new Error("question evidence " + r.status);
        return r.json();
      })
    ])
      .then(function (pair) {
        var data = pair[1];
        var para = pair[2];
        var questionEvidence = pair[3];
        words = (data.items || data.words || [])
          .map(normalizeEntry)
          .filter(Boolean);
        groups = enrichQuestionSources(para.groups || [], questionEvidence);
        statusMap = readStatusMap();
        paraMap = loadJson(PARA_KEY, {}) || {};
        paraReview = loadJson(REVIEW_KEY, { version: 1, groups: {}, updatedAt: 0 }) || { version: 1, groups: {}, updatedAt: 0 };
        migrateV4Once();
        migrateV5ReferenceFormsOnce();
        loadOrderPreferences();
        var savedNavigation = loadJson(SESSION_KEY, null);
        if (!restoreSession()) {
          rebuildStudy();
          restoreStudyPosition(filter);
        }
        if (requestedUnfamiliar() || pendingArticleHighFrequency === "unfamiliar") {
          filter = UNFAMILIAR_FILTER;
          loadOrderPreferences();
          rebuildStudy();
          if (!restoreStudyPosition(filter)) resetStudyToStart();
          pendingArticleHighFrequency = false;
        } else if (requestedArticleRest() || pendingArticleHighFrequency === "rest") {
          filter = ARTICLE_REST_FILTER;
          loadOrderPreferences();
          rebuildStudy();
          if (!restoreStudyPosition(filter)) resetStudyToStart();
          pendingArticleHighFrequency = false;
        } else if (requestedPart12OnlyHighFrequency() || pendingArticleHighFrequency === "part12Only") {
          filter = PART12_ONLY_HF_FILTER;
          loadOrderPreferences();
          rebuildStudy();
          if (!restoreStudyPosition(filter)) resetStudyToStart();
          pendingArticleHighFrequency = false;
        } else if (requestedArticleHighFrequency() || pendingArticleHighFrequency) {
          filter = ARTICLE_HF_FILTER;
          loadOrderPreferences();
          rebuildStudy();
          if (!restoreStudyPosition(filter)) resetStudyToStart();
          pendingArticleHighFrequency = false;
        }
        loadCoverage();
        var savedParaSession = loadJson(PARA_SESSION_KEY, null);
        var shouldResumeParaSession = savedNavigation
          && savedNavigation.filter
          && savedNavigation.filter.type === "paraphraseQuiz";
        if (shouldResumeParaSession && savedParaSession && !savedParaSession.completed && Array.isArray(savedParaSession.currentSessionGroupIds) && savedParaSession.currentSessionGroupIds.length) {
          filter = { type: "paraphraseQuiz", value: "", sessionMode: savedParaSession.mode === "wrongReview" ? "guided" : savedParaSession.mode };
          hydrateQuizSession(savedParaSession);
          resumePending = true;
        }
        if (els.bankMeta) {
          els.bankMeta.textContent =
            "G类阅读提升 · 静态便携版 · " +
            words.length +
            " 词 · 安全同义题库 " +
            eligibleGroups().length +
            " 组 · 真题证据 " +
            Number(questionEvidence.count || 0).toLocaleString() +
            " 题";
        }
        renderTopics();
        bind();
        render();
        if (pendingArticleHighFrequency === "unfamiliar") openUnfamiliar();
        else if (pendingArticleHighFrequency === "rest") openArticleRest();
        else if (pendingArticleHighFrequency) openArticleHighFrequency();
      })
      .catch(function (err) {
        if (els.bankMeta) els.bankMeta.textContent = "加载失败：" + (err && err.message);
        if (els.word) els.word.textContent = "Error";
        if (els.basic) els.basic.textContent = String(err && err.message);
      });
  }

  boot();
  if (window.StaticCloudSync) {
    window.StaticCloudSync.register("reading-g", [
      STATUS_KEY,
      PARA_KEY,
      COVERAGE_KEY,
      REVIEW_KEY,
      PARA_SESSION_KEY,
      SESSION_KEY,
      POSITIONS_KEY,
      ORDER_PREFS_KEY
    ], {
      onMerged: applyMergedCloudProgress
    });
  }
})();
