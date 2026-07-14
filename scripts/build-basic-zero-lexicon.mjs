/**
 * Build absolute-beginner (zero-foundation / Pre-A1–A1) English lexicon.
 * Independent of the IELTS master lexicon — do not merge into words.json.
 *
 * Usage: node scripts/build-basic-zero-lexicon.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { EXTRA_COMPACT } from "./data/basic-zero-extra.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outPath = path.join(root, "public", "data", "basic-words.json");
const TARGET_COUNT = 1500;

/** @type {Array<[string, string, string, string, string, string, string, string[]]>} */
// word, phonetic, pos, meaningZh, definitionEn, exampleEn, exampleCn, topics
const RAW = [
  // —— 问候与礼貌 ——
  ["hello", "/həˈləʊ/", "exclamation", "你好", "A greeting used when you meet someone.", "Hello! Nice to meet you.", "你好！很高兴认识你。", ["问候"]],
  ["hi", "/haɪ/", "exclamation", "嗨；你好（更口语）", "An informal way to say hello.", "Hi, Tom!", "嗨，汤姆！", ["问候"]],
  ["goodbye", "/ˌɡʊdˈbaɪ/", "exclamation", "再见", "A word you say when you leave.", "Goodbye! See you tomorrow.", "再见！明天见。", ["问候"]],
  ["bye", "/baɪ/", "exclamation", "拜拜；再见（口语）", "An informal way to say goodbye.", "Bye! Have a nice day.", "拜拜！祝你今天愉快。", ["问候"]],
  ["please", "/pliːz/", "adverb", "请", "A polite word used when you ask for something.", "Can I have some water, please?", "请给我一些水，好吗？", ["礼貌"]],
  ["thanks", "/θæŋks/", "exclamation", "谢谢（口语）", "An informal way to say thank you.", "Thanks for your help.", "谢谢你的帮助。", ["礼貌"]],
  ["thank", "/θæŋk/", "verb", "感谢", "To tell someone you are grateful.", "Thank you very much.", "非常感谢你。", ["礼貌"]],
  ["sorry", "/ˈsɒri/", "adjective", "对不起的；抱歉的", "Feeling bad about something you did.", "I am sorry I am late.", "对不起，我迟到了。", ["礼貌"]],
  ["excuse", "/ɪkˈskjuːz/", "verb", "原谅；劳驾", "Used politely to get attention or say sorry.", "Excuse me, where is the station?", "打扰一下，车站在哪里？", ["礼貌"]],
  ["yes", "/jes/", "exclamation", "是；对", "Used to agree or say something is true.", "Yes, I like apples.", "是的，我喜欢苹果。", ["基础应答"]],
  ["no", "/nəʊ/", "exclamation", "不；没有", "Used to disagree or refuse.", "No, I don't have a pen.", "不，我没有笔。", ["基础应答"]],
  ["ok", "/ˌəʊˈkeɪ/", "exjective", "好的；可以", "Used to agree or say something is fine.", "OK, let's go.", "好的，我们走吧。", ["基础应答"]],
  ["okay", "/ˌəʊˈkeɪ/", "adjective", "好的；可以", "Same as OK.", "Is everything okay?", "一切都好吗？", ["基础应答"]],

  // —— 人称与指示 ——
  ["I", "/aɪ/", "pronoun", "我", "The person who is speaking.", "I am a student.", "我是一名学生。", ["人称"]],
  ["you", "/juː/", "pronoun", "你；你们", "The person or people you are talking to.", "You are my friend.", "你是我的朋友。", ["人称"]],
  ["he", "/hiː/", "pronoun", "他", "A man or boy.", "He is my brother.", "他是我的哥哥。", ["人称"]],
  ["she", "/ʃiː/", "pronoun", "她", "A woman or girl.", "She is my sister.", "她是我的姐姐。", ["人称"]],
  ["it", "/ɪt/", "pronoun", "它", "A thing, animal, or idea.", "It is a cat.", "它是一只猫。", ["人称"]],
  ["we", "/wiː/", "pronoun", "我们", "You and I, or a group including the speaker.", "We are happy.", "我们很开心。", ["人称"]],
  ["they", "/ðeɪ/", "pronoun", "他们；她们；它们", "People or things already mentioned.", "They are teachers.", "他们是老师。", ["人称"]],
  ["me", "/miː/", "pronoun", "我（宾格）", "Used as the object form of I.", "Can you help me?", "你能帮我吗？", ["人称"]],
  ["him", "/hɪm/", "pronoun", "他（宾格）", "Used as the object form of he.", "I know him.", "我认识他。", ["人称"]],
  ["her", "/hɜː(r)/", "pronoun", "她（宾格）；她的", "Object form of she, or belonging to a woman.", "This is her bag.", "这是她的包。", ["人称"]],
  ["us", "/ʌs/", "pronoun", "我们（宾格）", "Used as the object form of we.", "Please call us.", "请给我们打电话。", ["人称"]],
  ["them", "/ðəm/", "pronoun", "他们（宾格）", "Used as the object form of they.", "I like them.", "我喜欢他们。", ["人称"]],
  ["my", "/maɪ/", "determiner", "我的", "Belonging to me.", "This is my book.", "这是我的书。", ["人称"]],
  ["your", "/jɔː(r)/", "determiner", "你的；你们的", "Belonging to you.", "What is your name?", "你叫什么名字？", ["人称"]],
  ["his", "/hɪz/", "determiner", "他的", "Belonging to a man or boy.", "His name is Jack.", "他的名字是杰克。", ["人称"]],
  ["its", "/ɪts/", "determiner", "它的", "Belonging to a thing or animal.", "The dog wagged its tail.", "狗摇了摇它的尾巴。", ["人称"]],
  ["our", "/aʊə(r)/", "determiner", "我们的", "Belonging to us.", "This is our house.", "这是我们的房子。", ["人称"]],
  ["their", "/ðeə(r)/", "determiner", "他们的", "Belonging to them.", "Their car is red.", "他们的车是红色的。", ["人称"]],
  ["this", "/ðɪs/", "determiner", "这个", "The thing near you.", "This is an apple.", "这是一个苹果。", ["指示"]],
  ["that", "/ðæt/", "determiner", "那个", "The thing farther away.", "That is my school.", "那是我的学校。", ["指示"]],
  ["these", "/ðiːz/", "determiner", "这些", "More than one thing near you.", "These are my keys.", "这些是我的钥匙。", ["指示"]],
  ["those", "/ðəʊz/", "determiner", "那些", "More than one thing farther away.", "Those are buses.", "那些是公共汽车。", ["指示"]],
  ["who", "/huː/", "pronoun", "谁", "Used to ask about a person.", "Who is she?", "她是谁？", ["疑问词"]],
  ["what", "/wɒt/", "pronoun", "什么", "Used to ask about a thing.", "What is this?", "这是什么？", ["疑问词"]],
  ["where", "/weə(r)/", "adverb", "哪里", "Used to ask about a place.", "Where do you live?", "你住在哪里？", ["疑问词"]],
  ["when", "/wen/", "adverb", "什么时候", "Used to ask about time.", "When is your birthday?", "你的生日是什么时候？", ["疑问词"]],
  ["why", "/waɪ/", "adverb", "为什么", "Used to ask for a reason.", "Why are you sad?", "你为什么难过？", ["疑问词"]],
  ["how", "/haʊ/", "adverb", "怎样；如何", "Used to ask about the way or condition.", "How are you?", "你好吗？", ["疑问词"]],
  ["which", "/wɪtʃ/", "pronoun", "哪一个", "Used to ask about a choice.", "Which colour do you like?", "你喜欢哪种颜色？", ["疑问词"]],

  // —— 数字 ——
  ["zero", "/ˈzɪərəʊ/", "number", "零", "The number 0.", "My score is zero.", "我的分数是零。", ["数字"]],
  ["one", "/wʌn/", "number", "一", "The number 1.", "I have one brother.", "我有一个弟弟。", ["数字"]],
  ["two", "/tuː/", "number", "二", "The number 2.", "I have two eyes.", "我有两只眼睛。", ["数字"]],
  ["three", "/θriː/", "number", "三", "The number 3.", "There are three cats.", "有三只猫。", ["数字"]],
  ["four", "/fɔː(r)/", "number", "四", "The number 4.", "I need four chairs.", "我需要四把椅子。", ["数字"]],
  ["five", "/faɪv/", "number", "五", "The number 5.", "She is five years old.", "她五岁了。", ["数字"]],
  ["six", "/sɪks/", "number", "六", "The number 6.", "We have six books.", "我们有六本书。", ["数字"]],
  ["seven", "/ˈsevn/", "number", "七", "The number 7.", "There are seven days in a week.", "一周有七天。", ["数字"]],
  ["eight", "/eɪt/", "number", "八", "The number 8.", "I wake up at eight.", "我八点起床。", ["数字"]],
  ["nine", "/naɪn/", "number", "九", "The number 9.", "Nine plus one is ten.", "九加一等于十。", ["数字"]],
  ["ten", "/ten/", "number", "十", "The number 10.", "I have ten fingers.", "我有十根手指。", ["数字"]],
  ["eleven", "/ɪˈlevn/", "number", "十一", "The number 11.", "It is eleven o'clock.", "现在是十一点。", ["数字"]],
  ["twelve", "/twelv/", "number", "十二", "The number 12.", "There are twelve months.", "一年有十二个月。", ["数字"]],
  ["thirteen", "/ˌθɜːˈtiːn/", "number", "十三", "The number 13.", "She is thirteen.", "她十三岁。", ["数字"]],
  ["fourteen", "/ˌfɔːˈtiːn/", "number", "十四", "The number 14.", "I live at number fourteen.", "我住在十四号。", ["数字"]],
  ["fifteen", "/ˌfɪfˈtiːn/", "number", "十五", "The number 15.", "The class starts at fifteen past eight.", "八点十五分开始上课。", ["数字"]],
  ["sixteen", "/ˌsɪksˈtiːn/", "number", "十六", "The number 16.", "He is sixteen years old.", "他十六岁。", ["数字"]],
  ["seventeen", "/ˌsevnˈtiːn/", "number", "十七", "The number 17.", "There are seventeen students.", "有十七名学生。", ["数字"]],
  ["eighteen", "/ˌeɪˈtiːn/", "number", "十八", "The number 18.", "She is eighteen.", "她十八岁。", ["数字"]],
  ["nineteen", "/ˌnaɪnˈtiːn/", "number", "十九", "The number 19.", "The bus is number nineteen.", "这辆巴士是十九路。", ["数字"]],
  ["twenty", "/ˈtwenti/", "number", "二十", "The number 20.", "I have twenty yuan.", "我有二十元。", ["数字"]],
  ["thirty", "/ˈθɜːti/", "number", "三十", "The number 30.", "My mother is thirty-five.", "我妈妈三十五岁。", ["数字"]],
  ["forty", "/ˈfɔːti/", "number", "四十", "The number 40.", "There are forty desks.", "有四十张课桌。", ["数字"]],
  ["fifty", "/ˈfɪfti/", "number", "五十", "The number 50.", "The book costs fifty yuan.", "这本书五十元。", ["数字"]],
  ["hundred", "/ˈhʌndrəd/", "number", "百", "The number 100.", "One hundred students are here.", "这里有一百名学生。", ["数字"]],
  ["first", "/fɜːst/", "number", "第一", "Number one in order.", "This is my first day.", "这是我的第一天。", ["序数"]],
  ["second", "/ˈsekənd/", "number", "第二", "Number two in order.", "I live on the second floor.", "我住在二楼。", ["序数"]],
  ["third", "/θɜːd/", "number", "第三", "Number three in order.", "March is the third month.", "三月是第三个月。", ["序数"]],

  // —— 颜色 ——
  ["colour", "/ˈkʌlə(r)/", "noun", "颜色（英式）", "Red, blue, green, and so on.", "What is your favourite colour?", "你最喜欢什么颜色？", ["颜色"]],
  ["color", "/ˈkʌlər/", "noun", "颜色（美式）", "Same as colour.", "My favorite color is blue.", "我最喜欢的颜色是蓝色。", ["颜色"]],
  ["red", "/red/", "adjective", "红色的", "The colour of blood or an apple.", "The apple is red.", "这个苹果是红色的。", ["颜色"]],
  ["blue", "/bluː/", "adjective", "蓝色的", "The colour of the sky on a clear day.", "The sky is blue.", "天空是蓝色的。", ["颜色"]],
  ["green", "/ɡriːn/", "adjective", "绿色的", "The colour of grass.", "The grass is green.", "草是绿色的。", ["颜色"]],
  ["yellow", "/ˈjeləʊ/", "adjective", "黄色的", "The colour of the sun or a banana.", "The banana is yellow.", "香蕉是黄色的。", ["颜色"]],
  ["black", "/blæk/", "adjective", "黑色的", "The darkest colour.", "I have a black bag.", "我有一个黑色的包。", ["颜色"]],
  ["white", "/waɪt/", "adjective", "白色的", "The colour of milk or snow.", "The snow is white.", "雪是白色的。", ["颜色"]],
  ["orange", "/ˈɒrɪndʒ/", "adjective", "橙色的；橙子", "A colour between red and yellow; also a fruit.", "I like orange juice.", "我喜欢橙汁。", ["颜色", "食物"]],
  ["pink", "/pɪŋk/", "adjective", "粉色的", "A light red colour.", "She has a pink dress.", "她有一条粉色连衣裙。", ["颜色"]],
  ["brown", "/braʊn/", "adjective", "棕色的", "The colour of chocolate or wood.", "My hair is brown.", "我的头发是棕色的。", ["颜色"]],
  ["grey", "/ɡreɪ/", "adjective", "灰色的（英式）", "A colour between black and white.", "The sky is grey today.", "今天天空是灰色的。", ["颜色"]],
  ["gray", "/ɡreɪ/", "adjective", "灰色的（美式）", "Same as grey.", "I wear a gray coat.", "我穿一件灰色外套。", ["颜色"]],
  ["purple", "/ˈpɜːpl/", "adjective", "紫色的", "A colour between red and blue.", "The flower is purple.", "这朵花是紫色的。", ["颜色"]],

  // —— 时间：星期 / 月份 / 一天 ——
  ["day", "/deɪ/", "noun", "天；白天", "A period of 24 hours, or the time when it is light.", "Have a nice day!", "祝你有美好的一天！", ["时间"]],
  ["night", "/naɪt/", "noun", "夜晚", "The time when it is dark.", "Good night!", "晚安！", ["时间"]],
  ["morning", "/ˈmɔːnɪŋ/", "noun", "早上", "The early part of the day.", "Good morning!", "早上好！", ["时间"]],
  ["afternoon", "/ˌɑːftəˈnuːn/", "noun", "下午", "The time after midday.", "Good afternoon, teacher.", "下午好，老师。", ["时间"]],
  ["evening", "/ˈiːvnɪŋ/", "noun", "晚上", "The end of the day before night.", "Good evening!", "晚上好！", ["时间"]],
  ["today", "/təˈdeɪ/", "adverb", "今天", "This day.", "Today is Monday.", "今天是星期一。", ["时间"]],
  ["tomorrow", "/təˈmɒrəʊ/", "adverb", "明天", "The day after today.", "See you tomorrow.", "明天见。", ["时间"]],
  ["yesterday", "/ˈjestədeɪ/", "adverb", "昨天", "The day before today.", "I was busy yesterday.", "我昨天很忙。", ["时间"]],
  ["week", "/wiːk/", "noun", "星期；周", "Seven days.", "There are seven days in a week.", "一周有七天。", ["时间"]],
  ["month", "/mʌnθ/", "noun", "月", "About 30 days; one of the 12 parts of a year.", "January is the first month.", "一月是第一个月。", ["时间"]],
  ["year", "/jɪə(r)/", "noun", "年", "Twelve months.", "I am ten years old.", "我十岁。", ["时间"]],
  ["time", "/taɪm/", "noun", "时间", "Minutes, hours, days, etc.", "What time is it?", "现在几点了？", ["时间"]],
  ["hour", "/ˈaʊə(r)/", "noun", "小时", "Sixty minutes.", "The class is one hour long.", "这节课有一个小时。", ["时间"]],
  ["minute", "/ˈmɪnɪt/", "noun", "分钟", "Sixty seconds.", "Wait a minute, please.", "请等一分钟。", ["时间"]],
  ["o'clock", "/əˈklɒk/", "adverb", "……点钟", "Used to say the full hour.", "It is seven o'clock.", "现在是七点。", ["时间"]],
  ["Monday", "/ˈmʌndeɪ/", "noun", "星期一", "The first day of the working week.", "I go to school on Monday.", "我星期一去上学。", ["星期"]],
  ["Tuesday", "/ˈtjuːzdeɪ/", "noun", "星期二", "The day after Monday.", "We have English on Tuesday.", "我们星期二有英语课。", ["星期"]],
  ["Wednesday", "/ˈwenzdeɪ/", "noun", "星期三", "The day after Tuesday.", "Wednesday is in the middle of the week.", "星期三在一周的中间。", ["星期"]],
  ["Thursday", "/ˈθɜːzdeɪ/", "noun", "星期四", "The day after Wednesday.", "I play football on Thursday.", "我星期四踢足球。", ["星期"]],
  ["Friday", "/ˈfraɪdeɪ/", "noun", "星期五", "The day after Thursday.", "Friday is my favourite day.", "星期五是我最喜欢的一天。", ["星期"]],
  ["Saturday", "/ˈsætədeɪ/", "noun", "星期六", "The day after Friday.", "I rest on Saturday.", "我星期六休息。", ["星期"]],
  ["Sunday", "/ˈsʌndeɪ/", "noun", "星期日", "The day after Saturday.", "We visit grandma on Sunday.", "我们星期天看望奶奶。", ["星期"]],
  ["January", "/ˈdʒænjuəri/", "noun", "一月", "The first month of the year.", "New Year is in January.", "新年在一月。", ["月份"]],
  ["February", "/ˈfebruəri/", "noun", "二月", "The second month of the year.", "February is short.", "二月很短。", ["月份"]],
  ["March", "/mɑːtʃ/", "noun", "三月", "The third month of the year.", "Spring starts in March.", "春天从三月开始。", ["月份"]],
  ["April", "/ˈeɪprəl/", "noun", "四月", "The fourth month of the year.", "It rains in April.", "四月会下雨。", ["月份"]],
  ["May", "/meɪ/", "noun", "五月", "The fifth month of the year.", "My birthday is in May.", "我的生日在五月。", ["月份"]],
  ["June", "/dʒuːn/", "noun", "六月", "The sixth month of the year.", "School ends in June.", "学校在六月放假。", ["月份"]],
  ["July", "/dʒuˈlaɪ/", "noun", "七月", "The seventh month of the year.", "July is hot.", "七月很热。", ["月份"]],
  ["August", "/ˈɔːɡəst/", "noun", "八月", "The eighth month of the year.", "We travel in August.", "我们八月去旅行。", ["月份"]],
  ["September", "/sepˈtembə(r)/", "noun", "九月", "The ninth month of the year.", "School starts in September.", "学校在九月开学。", ["月份"]],
  ["October", "/ɒkˈtəʊbə(r)/", "noun", "十月", "The tenth month of the year.", "October is cool.", "十月很凉爽。", ["月份"]],
  ["November", "/nəʊˈvembə(r)/", "noun", "十一月", "The eleventh month of the year.", "It is cold in November.", "十一月很冷。", ["月份"]],
  ["December", "/dɪˈsembə(r)/", "noun", "十二月", "The twelfth month of the year.", "Christmas is in December.", "圣诞节在十二月。", ["月份"]],
  ["now", "/naʊ/", "adverb", "现在", "At this moment.", "I am busy now.", "我现在很忙。", ["时间"]],
  ["later", "/ˈleɪtə(r)/", "adverb", "稍后；后来", "After some time.", "See you later.", "回头见。", ["时间"]],
  ["early", "/ˈɜːli/", "adjective", "早的", "Before the usual time.", "I get up early.", "我起得很早。", ["时间"]],
  ["late", "/leɪt/", "adjective", "晚的；迟到的", "After the usual time.", "Don't be late.", "不要迟到。", ["时间"]],

  // —— 家庭 ——
  ["family", "/ˈfæməli/", "noun", "家庭；家人", "Parents and children living together.", "I love my family.", "我爱我的家人。", ["家庭"]],
  ["father", "/ˈfɑːðə(r)/", "noun", "爸爸；父亲", "A male parent.", "My father is a doctor.", "我爸爸是医生。", ["家庭"]],
  ["mother", "/ˈmʌðə(r)/", "noun", "妈妈；母亲", "A female parent.", "My mother cooks dinner.", "我妈妈做晚饭。", ["家庭"]],
  ["dad", "/dæd/", "noun", "爸爸（口语）", "An informal word for father.", "Dad is at work.", "爸爸在上班。", ["家庭"]],
  ["mom", "/mɒm/", "noun", "妈妈（美式口语）", "An informal word for mother.", "Mom is at home.", "妈妈在家。", ["家庭"]],
  ["mum", "/mʌm/", "noun", "妈妈（英式口语）", "An informal word for mother.", "Mum is kind.", "妈妈很温柔。", ["家庭"]],
  ["parent", "/ˈpeərənt/", "noun", "父或母", "A father or a mother.", "My parents are teachers.", "我的父母是老师。", ["家庭"]],
  ["brother", "/ˈbrʌðə(r)/", "noun", "兄弟", "A boy or man with the same parents as you.", "I have one brother.", "我有一个兄弟。", ["家庭"]],
  ["sister", "/ˈsɪstə(r)/", "noun", "姐妹", "A girl or woman with the same parents as you.", "My sister is young.", "我妹妹还小。", ["家庭"]],
  ["son", "/sʌn/", "noun", "儿子", "A male child.", "He is their son.", "他是他们的儿子。", ["家庭"]],
  ["daughter", "/ˈdɔːtə(r)/", "noun", "女儿", "A female child.", "She is my daughter.", "她是我的女儿。", ["家庭"]],
  ["baby", "/ˈbeɪbi/", "noun", "婴儿", "A very young child.", "The baby is sleeping.", "婴儿在睡觉。", ["家庭"]],
  ["child", "/tʃaɪld/", "noun", "孩子", "A young boy or girl.", "The child is happy.", "这个孩子很开心。", ["家庭"]],
  ["children", "/ˈtʃɪldrən/", "noun", "孩子们（复数）", "More than one child.", "The children play outside.", "孩子们在外面玩。", ["家庭"]],
  ["boy", "/bɔɪ/", "noun", "男孩", "A male child.", "The boy is tall.", "这个男孩很高。", ["人物"]],
  ["girl", "/ɡɜːl/", "noun", "女孩", "A female child.", "The girl is kind.", "这个女孩很友善。", ["人物"]],
  ["man", "/mæn/", "noun", "男人", "An adult male person.", "The man is a driver.", "这个男人是司机。", ["人物"]],
  ["woman", "/ˈwʊmən/", "noun", "女人", "An adult female person.", "The woman is a nurse.", "这个女人是护士。", ["人物"]],
  ["people", "/ˈpiːpl/", "noun", "人们", "Men, women, and children.", "Many people are here.", "这里有很多人。", ["人物"]],
  ["friend", "/frend/", "noun", "朋友", "A person you like and know well.", "She is my best friend.", "她是我最好的朋友。", ["人物"]],
  ["name", "/neɪm/", "noun", "名字", "What someone or something is called.", "My name is Lily.", "我的名字是莉莉。", ["人物"]],
  ["grandma", "/ˈɡrænmɑː/", "noun", "奶奶；外婆（口语）", "Informal word for grandmother.", "I love my grandma.", "我爱我的奶奶。", ["家庭"]],
  ["grandpa", "/ˈɡrænpɑː/", "noun", "爷爷；外公（口语）", "Informal word for grandfather.", "Grandpa tells stories.", "爷爷讲故事。", ["家庭"]],
  ["grandmother", "/ˈɡrænmʌðə(r)/", "noun", "祖母；外祖母", "The mother of your father or mother.", "My grandmother is seventy.", "我祖母七十岁。", ["家庭"]],
  ["grandfather", "/ˈɡrænfɑːðə(r)/", "noun", "祖父；外祖父", "The father of your father or mother.", "My grandfather walks every day.", "我祖父每天散步。", ["家庭"]],

  // —— 身体 ——
  ["body", "/ˈbɒdi/", "noun", "身体", "The whole of a person or animal.", "Wash your body.", "清洗你的身体。", ["身体"]],
  ["head", "/hed/", "noun", "头", "The top part of the body with eyes, mouth, and brain.", "My head hurts.", "我头疼。", ["身体"]],
  ["face", "/feɪs/", "noun", "脸", "The front of the head.", "Wash your face.", "洗脸。", ["身体"]],
  ["eye", "/aɪ/", "noun", "眼睛", "The part of the body you see with.", "I have two eyes.", "我有两只眼睛。", ["身体"]],
  ["ear", "/ɪə(r)/", "noun", "耳朵", "The part of the body you hear with.", "I can hear with my ears.", "我用耳朵听。", ["身体"]],
  ["nose", "/nəʊz/", "noun", "鼻子", "The part of the face you smell with.", "My nose is cold.", "我的鼻子很冷。", ["身体"]],
  ["mouth", "/maʊθ/", "noun", "嘴巴", "The part of the face you eat and speak with.", "Open your mouth.", "张开嘴巴。", ["身体"]],
  ["tooth", "/tuːθ/", "noun", "牙齿（单数）", "One of the hard white things in the mouth.", "I brush my tooth carefully.", "我仔细刷牙。", ["身体"]],
  ["teeth", "/tiːθ/", "noun", "牙齿（复数）", "More than one tooth.", "Brush your teeth every day.", "每天刷牙。", ["身体"]],
  ["hair", "/heə(r)/", "noun", "头发", "The thin threads that grow on the head.", "Her hair is long.", "她的头发很长。", ["身体"]],
  ["hand", "/hænd/", "noun", "手", "The part at the end of the arm.", "Raise your hand.", "举手。", ["身体"]],
  ["arm", "/ɑːm/", "noun", "胳膊", "The part of the body from shoulder to hand.", "My arm is strong.", "我的胳膊很有力。", ["身体"]],
  ["leg", "/leɡ/", "noun", "腿", "The part of the body used for walking.", "I hurt my leg.", "我伤到了腿。", ["身体"]],
  ["foot", "/fʊt/", "noun", "脚（单数）", "The part at the end of the leg.", "My left foot is big.", "我的左脚很大。", ["身体"]],
  ["feet", "/fiːt/", "noun", "脚（复数）", "More than one foot.", "Wash your feet.", "洗脚。", ["身体"]],
  ["finger", "/ˈfɪŋɡə(r)/", "noun", "手指", "One of the five long parts on a hand.", "I have ten fingers.", "我有十根手指。", ["身体"]],

  // —— 学校 ——
  ["school", "/skuːl/", "noun", "学校", "A place where children learn.", "I go to school every day.", "我每天去学校。", ["学校"]],
  ["student", "/ˈstjuːdnt/", "noun", "学生", "A person who studies at a school.", "I am a student.", "我是一名学生。", ["学校"]],
  ["teacher", "/ˈtiːtʃə(r)/", "noun", "老师", "A person who teaches.", "My teacher is kind.", "我的老师很和蔼。", ["学校"]],
  ["class", "/klɑːs/", "noun", "课；班级", "A group of students learning together.", "Our class is big.", "我们班很大。", ["学校"]],
  ["classroom", "/ˈklɑːsruːm/", "noun", "教室", "A room where classes happen.", "The classroom is clean.", "教室很干净。", ["学校"]],
  ["book", "/bʊk/", "noun", "书", "Pages with words for reading.", "This is an English book.", "这是一本英语书。", ["学校"]],
  ["pen", "/pen/", "noun", "钢笔；笔", "A tool for writing with ink.", "I write with a pen.", "我用钢笔写字。", ["学校"]],
  ["pencil", "/ˈpensl/", "noun", "铅笔", "A tool for writing with a grey tip.", "I need a pencil.", "我需要一支铅笔。", ["学校"]],
  ["paper", "/ˈpeɪpə(r)/", "noun", "纸", "Thin material for writing or drawing.", "Write on the paper.", "写在纸上。", ["学校"]],
  ["bag", "/bæɡ/", "noun", "包；书包", "A container for carrying things.", "My school bag is heavy.", "我的书包很重。", ["学校"]],
  ["desk", "/desk/", "noun", "课桌；书桌", "A table for writing or studying.", "Sit at your desk.", "坐在你的书桌前。", ["学校"]],
  ["chair", "/tʃeə(r)/", "noun", "椅子", "A seat for one person.", "Please sit on the chair.", "请坐在椅子上。", ["学校", "家"]],
  ["ruler", "/ˈruːlə(r)/", "noun", "尺子", "A tool for measuring or drawing straight lines.", "Use a ruler.", "用尺子。", ["学校"]],
  ["eraser", "/ɪˈreɪzə(r)/", "noun", "橡皮擦", "A thing used to remove pencil marks.", "I need an eraser.", "我需要一块橡皮。", ["学校"]],
  ["homework", "/ˈhəʊmwɜːk/", "noun", "家庭作业", "School work you do at home.", "I do my homework after dinner.", "我晚饭后做家庭作业。", ["学校"]],
  ["English", "/ˈɪŋɡlɪʃ/", "noun", "英语", "The language of England and many other countries.", "I learn English.", "我学英语。", ["学校"]],
  ["Chinese", "/ˌtʃaɪˈniːz/", "noun", "中文；中国人", "The language of China; also a person from China.", "I speak Chinese.", "我说中文。", ["学校"]],
  ["maths", "/mæθs/", "noun", "数学（英式）", "The study of numbers.", "Maths is interesting.", "数学很有趣。", ["学校"]],
  ["math", "/mæθ/", "noun", "数学（美式）", "Same as maths.", "I like math.", "我喜欢数学。", ["学校"]],
  ["lesson", "/ˈlesn/", "noun", "一节课", "A period of learning.", "The English lesson starts now.", "英语课现在开始。", ["学校"]],
  ["question", "/ˈkwestʃən/", "noun", "问题", "Something you ask to get information.", "I have a question.", "我有一个问题。", ["学校"]],
  ["answer", "/ˈɑːnsə(r)/", "noun", "答案；回答", "What you say or write after a question.", "What is the answer?", "答案是什么？", ["学校"]],
  ["read", "/riːd/", "verb", "读；阅读", "To look at and understand words.", "I read a book every day.", "我每天读一本书。", ["学校", "动词"]],
  ["write", "/raɪt/", "verb", "写", "To make words with a pen or on a keyboard.", "Please write your name.", "请写下你的名字。", ["学校", "动词"]],
  ["study", "/ˈstʌdi/", "verb", "学习", "To learn about something.", "I study English at school.", "我在学校学英语。", ["学校", "动词"]],
  ["learn", "/lɜːn/", "verb", "学会；学习", "To get knowledge or a skill.", "I want to learn English.", "我想学英语。", ["学校", "动词"]],
  ["speak", "/spiːk/", "verb", "说；讲话", "To say words out loud.", "Can you speak English?", "你会说英语吗？", ["学校", "动词"]],
  ["listen", "/ˈlɪsn/", "verb", "听", "To pay attention to sounds.", "Please listen to the teacher.", "请听老师讲。", ["学校", "动词"]],
  ["say", "/seɪ/", "verb", "说", "To speak words.", "Say it again, please.", "请再说一遍。", ["动词"]],
  ["ask", "/ɑːsk/", "verb", "问", "To put a question to someone.", "Ask me a question.", "问我一个问题。", ["动词"]],
  ["tell", "/tel/", "verb", "告诉", "To give information in words.", "Tell me your name.", "告诉我你的名字。", ["动词"]],

  // —— 家与日常物品 ——
  ["home", "/həʊm/", "noun", "家", "The place where you live.", "I go home at five.", "我五点回家。", ["家"]],
  ["house", "/haʊs/", "noun", "房子", "A building where people live.", "Our house is small.", "我们的房子很小。", ["家"]],
  ["room", "/ruːm/", "noun", "房间", "A part of a house with walls and a door.", "This is my room.", "这是我的房间。", ["家"]],
  ["door", "/dɔː(r)/", "noun", "门", "The thing you open to enter a room.", "Please open the door.", "请开门。", ["家"]],
  ["window", "/ˈwɪndəʊ/", "noun", "窗户", "An opening in a wall with glass.", "Look out of the window.", "看看窗外。", ["家"]],
  ["bed", "/bed/", "noun", "床", "A place to sleep.", "I sleep in my bed.", "我在床上睡觉。", ["家"]],
  ["table", "/ˈteɪbl/", "noun", "桌子", "A piece of furniture with a flat top.", "The book is on the table.", "书在桌子上。", ["家"]],
  ["wall", "/wɔːl/", "noun", "墙", "The side of a room or building.", "There is a picture on the wall.", "墙上有一幅画。", ["家"]],
  ["floor", "/flɔː(r)/", "noun", "地板；楼层", "The bottom surface of a room.", "Sit on the floor.", "坐在地板上。", ["家"]],
  ["kitchen", "/ˈkɪtʃɪn/", "noun", "厨房", "The room where you cook.", "Mum is in the kitchen.", "妈妈在厨房。", ["家"]],
  ["bathroom", "/ˈbɑːθruːm/", "noun", "卫生间；浴室", "The room with a toilet and often a bath or shower.", "The bathroom is clean.", "卫生间很干净。", ["家"]],
  ["phone", "/fəʊn/", "noun", "电话；手机", "A device for calling people.", "My phone is new.", "我的手机是新的。", ["物品"]],
  ["computer", "/kəmˈpjuːtə(r)/", "noun", "电脑", "An electronic machine for work and study.", "I use a computer.", "我使用电脑。", ["物品"]],
  ["TV", "/ˌtiːˈviː/", "noun", "电视", "A screen for watching programmes.", "We watch TV at night.", "我们晚上看电视。", ["物品"]],
  ["key", "/kiː/", "noun", "钥匙", "A metal tool for opening a lock.", "Where is my key?", "我的钥匙在哪里？", ["物品"]],
  ["money", "/ˈmʌni/", "noun", "钱", "Coins and notes used to buy things.", "I have no money.", "我没有钱。", ["物品"]],
  ["card", "/kɑːd/", "noun", "卡片", "A small piece of stiff paper.", "This is my ID card.", "这是我的身份证。", ["物品"]],
  ["box", "/bɒks/", "noun", "盒子；箱子", "A container with flat sides.", "Put it in the box.", "把它放进盒子里。", ["物品"]],
  ["ball", "/bɔːl/", "noun", "球", "A round object used in games.", "Kick the ball.", "踢球。", ["物品"]],
  ["toy", "/tɔɪ/", "noun", "玩具", "A thing for children to play with.", "The toy is fun.", "这个玩具很有趣。", ["物品"]],
  ["picture", "/ˈpɪktʃə(r)/", "noun", "图片；照片", "A drawing or photo.", "Look at this picture.", "看看这张图片。", ["物品"]],
  ["photo", "/ˈfəʊtəʊ/", "noun", "照片", "A picture made with a camera.", "This is a family photo.", "这是一张全家福。", ["物品"]],

  // —— 食物与饮料 ——
  ["food", "/fuːd/", "noun", "食物", "Things people eat.", "I like Chinese food.", "我喜欢中国菜。", ["食物"]],
  ["water", "/ˈwɔːtə(r)/", "noun", "水", "The clear liquid we drink.", "Please drink some water.", "请喝点水。", ["食物"]],
  ["milk", "/mɪlk/", "noun", "牛奶", "A white drink from cows.", "I drink milk every morning.", "我每天早上喝牛奶。", ["食物"]],
  ["tea", "/tiː/", "noun", "茶", "A hot drink made from leaves.", "Would you like some tea?", "你想喝点茶吗？", ["食物"]],
  ["coffee", "/ˈkɒfi/", "noun", "咖啡", "A hot brown drink.", "Dad drinks coffee.", "爸爸喝咖啡。", ["食物"]],
  ["juice", "/dʒuːs/", "noun", "果汁", "A drink made from fruit.", "I like apple juice.", "我喜欢苹果汁。", ["食物"]],
  ["bread", "/bred/", "noun", "面包", "A common food made from flour.", "I eat bread for breakfast.", "我早餐吃面包。", ["食物"]],
  ["rice", "/raɪs/", "noun", "米饭；大米", "Small white or brown grains people cook and eat.", "We eat rice every day.", "我们每天吃米饭。", ["食物"]],
  ["egg", "/eɡ/", "noun", "鸡蛋", "A food that comes from a chicken.", "I want an egg.", "我想要一个鸡蛋。", ["食物"]],
  ["meat", "/miːt/", "noun", "肉", "Food from animals.", "I don't eat much meat.", "我不怎么吃肉。", ["食物"]],
  ["fish", "/fɪʃ/", "noun", "鱼；鱼肉", "An animal that lives in water; also food.", "The fish is fresh.", "这条鱼很新鲜。", ["食物", "动物"]],
  ["chicken", "/ˈtʃɪkɪn/", "noun", "鸡；鸡肉", "A bird kept for eggs and meat.", "I like chicken soup.", "我喜欢鸡汤。", ["食物", "动物"]],
  ["fruit", "/fruːt/", "noun", "水果", "Sweet food from trees or plants, like apples.", "Eat more fruit.", "多吃水果。", ["食物"]],
  ["apple", "/ˈæpl/", "noun", "苹果", "A round red or green fruit.", "An apple a day is good.", "一天一个苹果有好处。", ["食物"]],
  ["banana", "/bəˈnɑːnə/", "noun", "香蕉", "A long yellow fruit.", "Monkeys like bananas.", "猴子喜欢香蕉。", ["食物"]],
  ["grape", "/ɡreɪp/", "noun", "葡萄", "A small round fruit, often purple or green.", "These grapes are sweet.", "这些葡萄很甜。", ["食物"]],
  ["pear", "/peə(r)/", "noun", "梨", "A sweet fruit, wider at the bottom.", "I have a pear.", "我有一个梨。", ["食物"]],
  ["watermelon", "/ˈwɔːtəmelən/", "noun", "西瓜", "A large green fruit with red inside.", "Watermelon is good in summer.", "夏天吃西瓜很好。", ["食物"]],
  ["vegetable", "/ˈvedʒtəbl/", "noun", "蔬菜", "A plant we eat, like cabbage or carrot.", "Eat your vegetables.", "把蔬菜吃掉。", ["食物"]],
  ["potato", "/pəˈteɪtəʊ/", "noun", "土豆", "A round vegetable that grows underground.", "I like potato chips.", "我喜欢薯片。", ["食物"]],
  ["tomato", "/təˈmɑːtəʊ/", "noun", "西红柿", "A soft red fruit used as a vegetable.", "The tomato is red.", "西红柿是红色的。", ["食物"]],
  ["cake", "/keɪk/", "noun", "蛋糕", "A sweet baked food.", "Happy birthday! Here is a cake.", "生日快乐！这是蛋糕。", ["食物"]],
  ["candy", "/ˈkændi/", "noun", "糖果", "A small sweet food.", "Don't eat too much candy.", "不要吃太多糖。", ["食物"]],
  ["breakfast", "/ˈbrekfəst/", "noun", "早餐", "The first meal of the day.", "I eat breakfast at seven.", "我七点吃早餐。", ["食物"]],
  ["lunch", "/lʌntʃ/", "noun", "午餐", "The meal in the middle of the day.", "We have lunch at school.", "我们在学校吃午饭。", ["食物"]],
  ["dinner", "/ˈdɪnə(r)/", "noun", "晚餐；正餐", "The main meal in the evening.", "Dinner is ready.", "晚饭好了。", ["食物"]],
  ["hungry", "/ˈhʌŋɡri/", "adjective", "饿的", "Wanting food.", "I am hungry.", "我饿了。", ["感觉"]],
  ["thirsty", "/ˈθɜːsti/", "adjective", "渴的", "Wanting a drink.", "I am thirsty.", "我渴了。", ["感觉"]],
  ["eat", "/iːt/", "verb", "吃", "To put food in your mouth and swallow it.", "I eat an apple.", "我吃一个苹果。", ["动词", "食物"]],
  ["drink", "/drɪŋk/", "verb", "喝", "To take liquid into your mouth.", "Please drink some water.", "请喝点水。", ["动词", "食物"]],
  ["cook", "/kʊk/", "verb", "做饭", "To make food ready to eat by heating it.", "Mum can cook well.", "妈妈很会做饭。", ["动词", "食物"]],

  // —— 衣服 ——
  ["clothes", "/kləʊðz/", "noun", "衣服", "Things you wear on your body.", "Put on your clothes.", "穿上你的衣服。", ["衣服"]],
  ["shirt", "/ʃɜːt/", "noun", "衬衫", "A piece of clothing for the upper body.", "He wears a white shirt.", "他穿一件白衬衫。", ["衣服"]],
  ["T-shirt", "/ˈtiː ʃɜːt/", "noun", "T恤", "A soft shirt with short sleeves.", "I like this T-shirt.", "我喜欢这件T恤。", ["衣服"]],
  ["dress", "/dres/", "noun", "连衣裙；穿衣", "A piece of clothing for women; also to put clothes on.", "She wears a red dress.", "她穿一条红裙子。", ["衣服"]],
  ["skirt", "/skɜːt/", "noun", "半身裙", "A piece of clothing that hangs from the waist.", "Her skirt is blue.", "她的裙子是蓝色的。", ["衣服"]],
  ["pants", "/pænts/", "noun", "裤子（美式）", "Clothing for the legs.", "These pants are new.", "这条裤子是新的。", ["衣服"]],
  ["trousers", "/ˈtraʊzəz/", "noun", "裤子（英式）", "Same as pants.", "He wears black trousers.", "他穿黑裤子。", ["衣服"]],
  ["coat", "/kəʊt/", "noun", "外套；大衣", "A warm piece of clothing worn outside.", "Wear your coat. It is cold.", "穿上外套。外面冷。", ["衣服"]],
  ["jacket", "/ˈdʒækɪt/", "noun", "夹克", "A short coat.", "My jacket is black.", "我的夹克是黑色的。", ["衣服"]],
  ["hat", "/hæt/", "noun", "帽子", "Something you wear on your head.", "Put on your hat.", "戴上你的帽子。", ["衣服"]],
  ["shoes", "/ʃuːz/", "noun", "鞋子", "Things you wear on your feet.", "Take off your shoes.", "脱掉你的鞋子。", ["衣服"]],
  ["socks", "/sɒks/", "noun", "袜子", "Soft things worn on the feet inside shoes.", "My socks are white.", "我的袜子是白色的。", ["衣服"]],
  ["wear", "/weə(r)/", "verb", "穿；戴", "To have clothes on your body.", "I wear a blue shirt.", "我穿一件蓝衬衫。", ["动词", "衣服"]],

  // —— 地点与交通 ——
  ["place", "/pleɪs/", "noun", "地方", "A particular area or position.", "This is a nice place.", "这是一个好地方。", ["地点"]],
  ["city", "/ˈsɪti/", "noun", "城市", "A large town.", "Beijing is a big city.", "北京是一座大城市。", ["地点"]],
  ["town", "/taʊn/", "noun", "城镇", "A place smaller than a city.", "I live in a small town.", "我住在一个小镇。", ["地点"]],
  ["street", "/striːt/", "noun", "街道", "A road in a city or town with buildings.", "My school is on this street.", "我的学校在这条街上。", ["地点"]],
  ["road", "/rəʊd/", "noun", "路", "A hard surface for cars and people.", "Be careful on the road.", "在路上要小心。", ["地点"]],
  ["park", "/pɑːk/", "noun", "公园", "A public green place for walking and play.", "We play in the park.", "我们在公园玩。", ["地点"]],
  ["shop", "/ʃɒp/", "noun", "商店", "A place where you buy things.", "The shop is open.", "商店开门了。", ["地点"]],
  ["store", "/stɔː(r)/", "noun", "商店（美式）", "Same as shop.", "I go to the store.", "我去商店。", ["地点"]],
  ["market", "/ˈmɑːkɪt/", "noun", "市场", "A place to buy food and other things.", "We buy fruit at the market.", "我们在市场买水果。", ["地点"]],
  ["hospital", "/ˈhɒspɪtl/", "noun", "医院", "A place where sick people get care.", "She works in a hospital.", "她在医院工作。", ["地点"]],
  ["station", "/ˈsteɪʃn/", "noun", "车站", "A place where trains or buses stop.", "Where is the bus station?", "公交车站在哪里？", ["地点", "交通"]],
  ["airport", "/ˈeəpɔːt/", "noun", "机场", "A place where planes take off and land.", "We go to the airport.", "我们去机场。", ["地点", "交通"]],
  ["hotel", "/həʊˈtel/", "noun", "酒店", "A place where travellers sleep and pay.", "We stay in a hotel.", "我们住在酒店。", ["地点"]],
  ["bank", "/bæŋk/", "noun", "银行", "A place that keeps and lends money.", "The bank is near here.", "银行就在附近。", ["地点"]],
  ["library", "/ˈlaɪbrəri/", "noun", "图书馆", "A place with many books to read or borrow.", "I study in the library.", "我在图书馆学习。", ["地点", "学校"]],
  ["zoo", "/zuː/", "noun", "动物园", "A place where animals are kept for people to see.", "We go to the zoo on Sunday.", "我们星期天去动物园。", ["地点"]],
  ["cinema", "/ˈsɪnəmə/", "noun", "电影院", "A place to watch films.", "Let's go to the cinema.", "我们去看电影吧。", ["地点"]],
  ["car", "/kɑː(r)/", "noun", "小汽车", "A road vehicle with four wheels.", "My father drives a car.", "我爸爸开车。", ["交通"]],
  ["bus", "/bʌs/", "noun", "公共汽车", "A large vehicle that carries many people.", "I take the bus to school.", "我坐公交去学校。", ["交通"]],
  ["train", "/treɪn/", "noun", "火车", "A long vehicle that runs on rails.", "The train is fast.", "火车很快。", ["交通"]],
  ["bike", "/baɪk/", "noun", "自行车", "A vehicle with two wheels that you ride.", "I ride my bike.", "我骑自行车。", ["交通"]],
  ["plane", "/pleɪn/", "noun", "飞机", "A flying vehicle for travel.", "The plane is in the sky.", "飞机在天上。", ["交通"]],
  ["taxi", "/ˈtæksi/", "noun", "出租车", "A car you pay to take you somewhere.", "Let's take a taxi.", "我们打车吧。", ["交通"]],
  ["map", "/mæp/", "noun", "地图", "A drawing that shows places and roads.", "Look at the map.", "看地图。", ["交通"]],
  ["left", "/left/", "adjective", "左边的", "On the side of your body where the heart usually is.", "Turn left.", "向左转。", ["方向"]],
  ["right", "/raɪt/", "adjective", "右边的；正确的", "On the other side from left; also correct.", "Turn right.", "向右转。", ["方向"]],
  ["up", "/ʌp/", "adverb", "向上", "Towards a higher place.", "Look up at the sky.", "抬头看天空。", ["方向"]],
  ["down", "/daʊn/", "adverb", "向下", "Towards a lower place.", "Sit down, please.", "请坐下。", ["方向"]],
  ["near", "/nɪə(r)/", "preposition", "靠近", "Not far from.", "The shop is near my home.", "商店离我家很近。", ["方向"]],
  ["far", "/fɑː(r)/", "adjective", "远的", "A long way away.", "The school is not far.", "学校不远。", ["方向"]],
  ["here", "/hɪə(r)/", "adverb", "这里", "In this place.", "Come here, please.", "请到这里来。", ["方向"]],
  ["there", "/ðeə(r)/", "adverb", "那里", "In that place.", "The book is there.", "书在那里。", ["方向"]],

  // —— 自然与天气 ——
  ["sun", "/sʌn/", "noun", "太阳", "The bright star that gives light and heat in the day.", "The sun is bright.", "太阳很亮。", ["自然"]],
  ["moon", "/muːn/", "noun", "月亮", "The bright object you see in the night sky.", "The moon is round.", "月亮是圆的。", ["自然"]],
  ["star", "/stɑː(r)/", "noun", "星星", "A bright point of light in the night sky.", "I can see many stars.", "我能看见很多星星。", ["自然"]],
  ["sky", "/skaɪ/", "noun", "天空", "The space above the earth.", "The sky is blue.", "天空是蓝色的。", ["自然"]],
  ["rain", "/reɪn/", "noun", "雨", "Water that falls from clouds.", "It is rain today. / It is raining.", "今天下雨。", ["天气"]],
  ["snow", "/snəʊ/", "noun", "雪", "Soft white pieces that fall when it is very cold.", "I like snow.", "我喜欢雪。", ["天气"]],
  ["wind", "/wɪnd/", "noun", "风", "Moving air.", "The wind is strong.", "风很大。", ["天气"]],
  ["cloud", "/klaʊd/", "noun", "云", "A white or grey mass in the sky.", "There are many clouds.", "有很多云。", ["天气"]],
  ["hot", "/hɒt/", "adjective", "热的", "Having a high temperature.", "It is hot in summer.", "夏天很热。", ["天气"]],
  ["cold", "/kəʊld/", "adjective", "冷的", "Having a low temperature.", "It is cold in winter.", "冬天很冷。", ["天气"]],
  ["warm", "/wɔːm/", "adjective", "温暖的", "A little hot in a nice way.", "The room is warm.", "房间很暖和。", ["天气"]],
  ["cool", "/kuːl/", "adjective", "凉爽的", "A little cold in a nice way.", "The evening is cool.", "傍晚很凉爽。", ["天气"]],
  ["weather", "/ˈweðə(r)/", "noun", "天气", "How hot, cold, wet, or dry it is outside.", "The weather is nice today.", "今天天气很好。", ["天气"]],
  ["sunny", "/ˈsʌni/", "adjective", "晴朗的", "With a lot of sun.", "It is sunny today.", "今天是晴天。", ["天气"]],
  ["cloudy", "/ˈklaʊdi/", "adjective", "多云的", "With many clouds.", "It is cloudy this morning.", "今天早上多云。", ["天气"]],
  ["tree", "/triː/", "noun", "树", "A tall plant with a trunk and leaves.", "There is a big tree.", "有一棵大树。", ["自然"]],
  ["flower", "/ˈflaʊə(r)/", "noun", "花", "The colourful part of a plant.", "The flower is beautiful.", "这朵花很漂亮。", ["自然"]],
  ["grass", "/ɡrɑːs/", "noun", "草", "Short green plants that cover the ground.", "Don't walk on the grass.", "不要踩草坪。", ["自然"]],
  ["river", "/ˈrɪvə(r)/", "noun", "河", "A long body of water that flows.", "The river is long.", "这条河很长。", ["自然"]],
  ["sea", "/siː/", "noun", "海", "A large area of salt water.", "We swim in the sea.", "我们在海里游泳。", ["自然"]],
  ["mountain", "/ˈmaʊntən/", "noun", "山", "A very high area of land.", "The mountain is high.", "这座山很高。", ["自然"]],

  // —— 动物 ——
  ["animal", "/ˈænɪml/", "noun", "动物", "A living thing that is not a plant, like a dog or bird.", "I love animals.", "我喜欢动物。", ["动物"]],
  ["dog", "/dɒɡ/", "noun", "狗", "A common pet animal that barks.", "My dog is cute.", "我的狗很可爱。", ["动物"]],
  ["cat", "/kæt/", "noun", "猫", "A small pet animal that meows.", "The cat is sleeping.", "猫在睡觉。", ["动物"]],
  ["bird", "/bɜːd/", "noun", "鸟", "An animal with wings and feathers.", "The bird can fly.", "鸟会飞。", ["动物"]],
  ["horse", "/hɔːs/", "noun", "马", "A large animal people can ride.", "The horse is fast.", "这匹马很快。", ["动物"]],
  ["pig", "/pɪɡ/", "noun", "猪", "A farm animal with a short nose.", "The pig is pink.", "这头猪是粉色的。", ["动物"]],
  ["cow", "/kaʊ/", "noun", "奶牛", "A farm animal that gives milk.", "The cow eats grass.", "奶牛吃草。", ["动物"]],
  ["sheep", "/ʃiːp/", "noun", "绵羊", "A farm animal with thick wool.", "The sheep is white.", "这只羊是白色的。", ["动物"]],
  ["duck", "/dʌk/", "noun", "鸭子", "A bird that swims and says quack.", "The duck is on the water.", "鸭子在水上。", ["动物"]],
  ["rabbit", "/ˈræbɪt/", "noun", "兔子", "A small animal with long ears.", "The rabbit is soft.", "兔子软软的。", ["动物"]],
  ["monkey", "/ˈmʌŋki/", "noun", "猴子", "An animal that can climb trees.", "The monkey likes bananas.", "猴子喜欢香蕉。", ["动物"]],
  ["panda", "/ˈpændə/", "noun", "熊猫", "A black-and-white animal from China.", "The panda is cute.", "熊猫很可爱。", ["动物"]],
  ["lion", "/ˈlaɪən/", "noun", "狮子", "A large wild cat, often called the king of animals.", "The lion is strong.", "狮子很强壮。", ["动物"]],
  ["tiger", "/ˈtaɪɡə(r)/", "noun", "老虎", "A large wild cat with orange and black stripes.", "The tiger is big.", "老虎很大。", ["动物"]],
  ["elephant", "/ˈelɪfənt/", "noun", "大象", "A very large animal with a long nose.", "The elephant is huge.", "大象非常大。", ["动物"]],

  // —— 常用形容词 ——
  ["good", "/ɡʊd/", "adjective", "好的", "Of high quality; nice.", "This is a good book.", "这是一本好书。", ["形容词"]],
  ["bad", "/bæd/", "adjective", "坏的", "Not good.", "This is a bad idea.", "这是个坏主意。", ["形容词"]],
  ["big", "/bɪɡ/", "adjective", "大的", "Large in size.", "This is a big house.", "这是一栋大房子。", ["形容词"]],
  ["small", "/smɔːl/", "adjective", "小的", "Not large.", "I have a small bag.", "我有一个小包。", ["形容词"]],
  ["long", "/lɒŋ/", "adjective", "长的", "Measuring a great distance from end to end.", "She has long hair.", "她有长头发。", ["形容词"]],
  ["short", "/ʃɔːt/", "adjective", "短的；矮的", "Not long; also not tall.", "This is a short story.", "这是一个短故事。", ["形容词"]],
  ["tall", "/tɔːl/", "adjective", "高的（人/建筑）", "Of more than average height.", "He is tall.", "他很高。", ["形容词"]],
  ["new", "/njuː/", "adjective", "新的", "Recently made or bought.", "I have a new phone.", "我有一部新手机。", ["形容词"]],
  ["old", "/əʊld/", "adjective", "旧的；年老的", "Having lived or existed for a long time.", "This is an old book.", "这是一本旧书。", ["形容词"]],
  ["young", "/jʌŋ/", "adjective", "年轻的", "Not old.", "She is young.", "她很年轻。", ["形容词"]],
  ["happy", "/ˈhæpi/", "adjective", "开心的", "Feeling good and pleased.", "I am happy today.", "我今天很开心。", ["感觉"]],
  ["sad", "/sæd/", "adjective", "难过的", "Feeling unhappy.", "Why are you sad?", "你为什么难过？", ["感觉"]],
  ["tired", "/ˈtaɪəd/", "adjective", "累的", "Needing rest.", "I am tired after school.", "放学后我很累。", ["感觉"]],
  ["sick", "/sɪk/", "adjective", "生病的", "Not healthy; ill.", "I feel sick.", "我觉得不舒服。", ["感觉"]],
  ["fine", "/faɪn/", "adjective", "好的；不错的", "Well; OK.", "I am fine, thank you.", "我很好，谢谢。", ["感觉"]],
  ["nice", "/naɪs/", "adjective", "好的；友好的", "Pleasant or kind.", "Nice to meet you.", "很高兴认识你。", ["形容词"]],
  ["beautiful", "/ˈbjuːtɪfl/", "adjective", "美丽的", "Very pretty to look at.", "The flower is beautiful.", "这朵花很美丽。", ["形容词"]],
  ["clean", "/kliːn/", "adjective", "干净的", "Not dirty.", "Keep your room clean.", "保持房间干净。", ["形容词"]],
  ["dirty", "/ˈdɜːti/", "adjective", "脏的", "Not clean.", "My hands are dirty.", "我的手很脏。", ["形容词"]],
  ["easy", "/ˈiːzi/", "adjective", "容易的", "Not difficult.", "This lesson is easy.", "这节课很容易。", ["形容词"]],
  ["hard", "/hɑːd/", "adjective", "难的；硬的", "Difficult; also not soft.", "English is hard at first.", "英语一开始很难。", ["形容词"]],
  ["fast", "/fɑːst/", "adjective", "快的", "Moving quickly.", "The train is fast.", "火车很快。", ["形容词"]],
  ["slow", "/sləʊ/", "adjective", "慢的", "Not fast.", "Please speak slow. / Speak slowly.", "请说慢一点。", ["形容词"]],
  ["full", "/fʊl/", "adjective", "满的；吃饱的", "Holding as much as possible; also not hungry.", "I am full.", "我吃饱了。", ["形容词"]],
  ["empty", "/ˈempti/", "adjective", "空的", "With nothing inside.", "The box is empty.", "盒子是空的。", ["形容词"]],
  ["same", "/seɪm/", "adjective", "相同的", "Not different.", "We have the same bag.", "我们有一样的包。", ["形容词"]],
  ["different", "/ˈdɪfrənt/", "adjective", "不同的", "Not the same.", "We like different colours.", "我们喜欢不同的颜色。", ["形容词"]],
  ["open", "/ˈəʊpən/", "adjective", "开着的", "Not closed.", "The door is open.", "门是开着的。", ["形容词"]],
  ["closed", "/kləʊzd/", "adjective", "关着的", "Not open.", "The shop is closed.", "商店关门了。", ["形容词"]],

  // —— 核心动词（生活动作） ——
  ["be", "/biː/", "verb", "是；在", "Used to say who or what someone is.", "I am a student. / She is kind.", "我是学生。/ 她很友善。", ["动词"]],
  ["am", "/æm/", "verb", "是（I 后面）", "The form of be used with I.", "I am happy.", "我很开心。", ["动词"]],
  ["is", "/ɪz/", "verb", "是（he/she/it）", "The form of be used with he, she, it.", "She is a teacher.", "她是老师。", ["动词"]],
  ["are", "/ɑː(r)/", "verb", "是（you/we/they）", "The form of be used with you, we, they.", "You are my friend.", "你是我的朋友。", ["动词"]],
  ["have", "/hæv/", "verb", "有", "To own or hold something.", "I have a book.", "我有一本书。", ["动词"]],
  ["has", "/hæz/", "verb", "有（he/she/it）", "The form of have for he, she, it.", "She has a cat.", "她有一只猫。", ["动词"]],
  ["do", "/duː/", "verb", "做；助动词", "To perform an action; also used in questions.", "What do you do?", "你是做什么的？", ["动词"]],
  ["does", "/dʌz/", "verb", "做（第三人称）", "The form of do for he, she, it.", "Does he like apples?", "他喜欢苹果吗？", ["动词"]],
  ["can", "/kæn/", "verb", "能；会", "To be able to.", "I can swim.", "我会游泳。", ["动词"]],
  ["want", "/wɒnt/", "verb", "想要", "To wish to have or do something.", "I want some water.", "我想要一些水。", ["动词"]],
  ["like", "/laɪk/", "verb", "喜欢", "To enjoy or think something is nice.", "I like English.", "我喜欢英语。", ["动词"]],
  ["love", "/lʌv/", "verb", "爱；非常喜欢", "To care about someone or something very much.", "I love my family.", "我爱我的家人。", ["动词"]],
  ["need", "/niːd/", "verb", "需要", "To must have something.", "I need a pen.", "我需要一支笔。", ["动词"]],
  ["know", "/nəʊ/", "verb", "知道；认识", "To have information in your mind.", "I know the answer.", "我知道答案。", ["动词"]],
  ["think", "/θɪŋk/", "verb", "想；认为", "To use your mind.", "I think it is good.", "我认为这很好。", ["动词"]],
  ["see", "/siː/", "verb", "看见", "To notice with your eyes.", "I can see a bird.", "我能看见一只鸟。", ["动词"]],
  ["look", "/lʊk/", "verb", "看", "To turn your eyes towards something.", "Look at the picture.", "看这张图片。", ["动词"]],
  ["watch", "/wɒtʃ/", "verb", "观看", "To look at for a period of time.", "I watch TV at night.", "我晚上看电视。", ["动词"]],
  ["hear", "/hɪə(r)/", "verb", "听见", "To notice sounds with your ears.", "I can hear music.", "我能听见音乐。", ["动词"]],
  ["come", "/kʌm/", "verb", "来", "To move towards the speaker.", "Come here, please.", "请到这里来。", ["动词"]],
  ["go", "/ɡəʊ/", "verb", "去", "To move from one place to another.", "I go to school.", "我去学校。", ["动词"]],
  ["get", "/ɡet/", "verb", "得到；变得", "To receive or become.", "I get up at seven.", "我七点起床。", ["动词"]],
  ["give", "/ɡɪv/", "verb", "给", "To hand something to someone.", "Please give me the book.", "请把书给我。", ["动词"]],
  ["take", "/teɪk/", "verb", "拿；乘坐", "To move something with you; also use transport.", "Take this bag.", "拿着这个包。", ["动词"]],
  ["make", "/meɪk/", "verb", "做；制作", "To create or produce something.", "I make a cake.", "我做一个蛋糕。", ["动词"]],
  ["put", "/pʊt/", "verb", "放", "To move something into a place.", "Put the book on the table.", "把书放在桌子上。", ["动词"]],
  ["find", "/faɪnd/", "verb", "找到", "To discover something after looking.", "I can't find my keys.", "我找不到钥匙。", ["动词"]],
  ["use", "/juːz/", "verb", "使用", "To do something with a tool or object.", "I use a pen to write.", "我用笔写字。", ["动词"]],
  ["help", "/help/", "verb", "帮助", "To make it easier for someone.", "Can you help me?", "你能帮我吗？", ["动词"]],
  ["play", "/pleɪ/", "verb", "玩；演奏", "To do games or sports for fun.", "Children play in the park.", "孩子们在公园玩。", ["动词"]],
  ["work", "/wɜːk/", "verb", "工作", "To do a job.", "My father works in a hospital.", "我爸爸在医院工作。", ["动词"]],
  ["live", "/lɪv/", "verb", "住；生活", "To have your home in a place.", "I live in China.", "我住在中国。", ["动词"]],
  ["sleep", "/sliːp/", "verb", "睡觉", "To rest with your eyes closed.", "I sleep at ten.", "我十点睡觉。", ["动词"]],
  ["wake", "/weɪk/", "verb", "醒来", "To stop sleeping.", "I wake up early.", "我很早醒来。", ["动词"]],
  ["walk", "/wɔːk/", "verb", "走路", "To move on foot.", "I walk to school.", "我走路去学校。", ["动词"]],
  ["run", "/rʌn/", "verb", "跑", "To move fast on foot.", "Don't run in the classroom.", "不要在教室里跑。", ["动词"]],
  ["sit", "/sɪt/", "verb", "坐", "To rest on a chair with your body bent.", "Please sit down.", "请坐下。", ["动词"]],
  ["stand", "/stænd/", "verb", "站", "To be on your feet, upright.", "Please stand up.", "请站起来。", ["动词"]],
  ["open", "/ˈəʊpən/", "verb", "打开", "To make something not closed.", "Open the window, please.", "请打开窗户。", ["动词"]],
  ["close", "/kləʊz/", "verb", "关闭", "To make something not open.", "Close the door, please.", "请关门。", ["动词"]],
  ["buy", "/baɪ/", "verb", "买", "To get something by paying money.", "I buy milk every day.", "我每天买牛奶。", ["动词"]],
  ["sell", "/sel/", "verb", "卖", "To give something for money.", "They sell fruit here.", "他们在这里卖水果。", ["动词"]],
  ["pay", "/peɪ/", "verb", "付钱", "To give money for something.", "How much do I pay?", "我要付多少钱？", ["动词"]],
  ["wait", "/weɪt/", "verb", "等待", "To stay until something happens.", "Please wait a minute.", "请等一分钟。", ["动词"]],
  ["stop", "/stɒp/", "verb", "停止", "To finish moving or doing something.", "Stop! The light is red.", "停！红灯了。", ["动词"]],
  ["start", "/stɑːt/", "verb", "开始", "To begin.", "The class starts at eight.", "八点开始上课。", ["动词"]],
  ["finish", "/ˈfɪnɪʃ/", "verb", "完成", "To bring something to an end.", "I finish my homework.", "我完成作业。", ["动词"]],
  ["call", "/kɔːl/", "verb", "打电话；称呼", "To phone someone; also to name.", "Call me later.", "晚点给我打电话。", ["动词"]],
  ["meet", "/miːt/", "verb", "见面；认识", "To see and speak to someone for the first time or by plan.", "Nice to meet you.", "很高兴认识你。", ["动词"]],
  ["show", "/ʃəʊ/", "verb", "展示；给……看", "To let someone see something.", "Show me your book.", "把你的书给我看看。", ["动词"]],
  ["try", "/traɪ/", "verb", "尝试", "To make an effort to do something.", "Please try again.", "请再试一次。", ["动词"]],
  ["remember", "/rɪˈmembə(r)/", "verb", "记住", "To keep something in your mind.", "Remember my name.", "记住我的名字。", ["动词"]],
  ["forget", "/fəˈɡet/", "verb", "忘记", "To fail to remember.", "Don't forget your bag.", "别忘了你的包。", ["动词"]],
  ["understand", "/ˌʌndəˈstænd/", "verb", "明白；理解", "To know the meaning of something.", "I understand now.", "我现在明白了。", ["动词"]],
  ["feel", "/fiːl/", "verb", "感觉", "To experience an emotion or physical state.", "I feel happy.", "我感到开心。", ["动词"]],
  ["smile", "/smaɪl/", "verb", "微笑", "To make a happy face.", "She smiles at me.", "她对我微笑。", ["动词"]],
  ["cry", "/kraɪ/", "verb", "哭", "To have tears from the eyes.", "The baby cries.", "婴儿在哭。", ["动词"]],
  ["laugh", "/lɑːf/", "verb", "笑", "To make sounds when something is funny.", "We laugh together.", "我们一起笑。", ["动词"]],
  ["draw", "/drɔː/", "verb", "画", "To make a picture with a pen or pencil.", "I draw a cat.", "我画一只猫。", ["动词"]],
  ["sing", "/sɪŋ/", "verb", "唱歌", "To make music with your voice.", "She can sing well.", "她歌唱得很好。", ["动词"]],
  ["dance", "/dɑːns/", "verb", "跳舞", "To move your body to music.", "They dance at the party.", "他们在派对上跳舞。", ["动词"]],
  ["swim", "/swɪm/", "verb", "游泳", "To move through water using your body.", "I can swim.", "我会游泳。", ["动词"]],
  ["fly", "/flaɪ/", "verb", "飞", "To move through the air.", "Birds can fly.", "鸟会飞。", ["动词"]],
  ["drive", "/draɪv/", "verb", "开车", "To control a car.", "My father can drive.", "我爸爸会开车。", ["动词"]],
  ["ride", "/raɪd/", "verb", "骑；乘坐", "To sit on and control a bike or horse.", "I ride a bike to school.", "我骑自行车去学校。", ["动词"]],
  ["clean", "/kliːn/", "verb", "打扫；弄干净", "To make something free of dirt.", "I clean my room.", "我打扫房间。", ["动词"]],
  ["wash", "/wɒʃ/", "verb", "洗", "To clean with water.", "Wash your hands.", "洗手。", ["动词"]],
  ["brush", "/brʌʃ/", "verb", "刷", "To clean or tidy with a brush.", "Brush your teeth.", "刷牙。", ["动词"]],

  // —— 介词与连接（生存语法骨架） ——
  ["in", "/ɪn/", "preposition", "在……里面", "Inside a place or thing.", "The book is in the bag.", "书在包里。", ["介词"]],
  ["on", "/ɒn/", "preposition", "在……上面", "Touching the surface of something.", "The cup is on the table.", "杯子在桌子上。", ["介词"]],
  ["at", "/æt/", "preposition", "在（某地点/时间）", "Used for a point in place or time.", "I am at school.", "我在学校。", ["介词"]],
  ["to", "/tuː/", "preposition", "到；向", "In the direction of.", "I go to school.", "我去学校。", ["介词"]],
  ["from", "/frɒm/", "preposition", "从", "Starting at a place or time.", "I am from China.", "我来自中国。", ["介词"]],
  ["with", "/wɪð/", "preposition", "和……一起；用", "Together; also using something.", "I go with my friend.", "我和朋友一起去。", ["介词"]],
  ["for", "/fɔː(r)/", "preposition", "为了；给", "Intended to be given to or used by.", "This gift is for you.", "这份礼物是给你的。", ["介词"]],
  ["of", "/ɒv/", "preposition", "……的", "Belonging to; made of.", "A cup of tea.", "一杯茶。", ["介词"]],
  ["about", "/əˈbaʊt/", "preposition", "关于", "On the subject of.", "This book is about animals.", "这本书是关于动物的。", ["介词"]],
  ["under", "/ˈʌndə(r)/", "preposition", "在……下面", "Below something.", "The cat is under the table.", "猫在桌子下面。", ["介词"]],
  ["over", "/ˈəʊvə(r)/", "preposition", "在……上方；超过", "Above; also more than.", "The plane flies over the city.", "飞机飞过城市。", ["介词"]],
  ["between", "/bɪˈtwiːn/", "preposition", "在……之间", "In the middle of two things.", "I sit between Tom and Ann.", "我坐在汤姆和安中间。", ["介词"]],
  ["and", "/ænd/", "conjunction", "和；并且", "Used to join words or ideas.", "I like apples and bananas.", "我喜欢苹果和香蕉。", ["连接词"]],
  ["or", "/ɔː(r)/", "conjunction", "或者", "Used to show a choice.", "Do you want tea or coffee?", "你想喝茶还是咖啡？", ["连接词"]],
  ["but", "/bʌt/", "conjunction", "但是", "Used to show a contrast.", "I am tired but happy.", "我很累但很开心。", ["连接词"]],
  ["because", "/bɪˈkɒz/", "conjunction", "因为", "For the reason that.", "I stay home because it rains.", "因为下雨，我待在家里。", ["连接词"]],
  ["if", "/ɪf/", "conjunction", "如果", "On the condition that.", "If you are free, call me.", "如果你有空，就给我打电话。", ["连接词"]],
  ["so", "/səʊ/", "conjunction", "所以；如此", "As a result; also very.", "I am tired, so I sleep.", "我累了，所以去睡觉。", ["连接词"]],
  ["a", "/ə/", "article", "一个（泛指）", "Used before a singular noun that begins with a consonant sound.", "I have a pen.", "我有一支笔。", ["冠词"]],
  ["an", "/ən/", "article", "一个（元音前）", "Used before a singular noun that begins with a vowel sound.", "I eat an apple.", "我吃一个苹果。", ["冠词"]],
  ["the", "/ðə/", "article", "这个；那个（特指）", "Used before a specific thing already known.", "The book is on the table.", "那本书在桌子上。", ["冠词"]],
  ["not", "/nɒt/", "adverb", "不", "Used to make a negative.", "I am not a teacher.", "我不是老师。", ["副词"]],
  ["too", "/tuː/", "adverb", "也；太", "Also; more than enough.", "I like it too.", "我也喜欢。", ["副词"]],
  ["very", "/ˈveri/", "adverb", "非常", "To a high degree.", "I am very happy.", "我非常开心。", ["副词"]],
  ["also", "/ˈɔːlsəʊ/", "adverb", "也", "In addition.", "I also like English.", "我也喜欢英语。", ["副词"]],
  ["again", "/əˈɡen/", "adverb", "再；又", "One more time.", "Please say it again.", "请再说一遍。", ["副词"]],
  ["always", "/ˈɔːlweɪz/", "adverb", "总是", "At all times.", "I always brush my teeth.", "我总是刷牙。", ["副词"]],
  ["sometimes", "/ˈsʌmtaɪmz/", "adverb", "有时", "On some occasions but not always.", "I sometimes watch TV.", "我有时看电视。", ["副词"]],
  ["never", "/ˈnevə(r)/", "adverb", "从不", "Not at any time.", "I never eat meat.", "我从不吃肉。", ["副词"]],
  ["often", "/ˈɒfn/", "adverb", "经常", "Many times.", "I often walk to school.", "我经常走路去学校。", ["副词"]],
  ["here", "/hɪə(r)/", "adverb", "这里", "In this place.", "I am here.", "我在这里。", ["副词"]],
  ["there", "/ðeə(r)/", "adverb", "那里；有", "In that place; also used in there is/are.", "There is a book on the desk.", "桌上有一本书。", ["副词"]],

  // —— 数量与基础表达 ——
  ["some", "/sʌm/", "determiner", "一些", "An amount of something, not exact.", "I want some water.", "我想要一些水。", ["数量"]],
  ["any", "/ˈeni/", "determiner", "任何；一些（疑问/否定）", "Used in questions and negatives for an amount.", "Do you have any questions?", "你有什么问题吗？", ["数量"]],
  ["many", "/ˈmeni/", "determiner", "许多（可数）", "A large number of.", "I have many books.", "我有很多书。", ["数量"]],
  ["much", "/mʌtʃ/", "determiner", "许多（不可数）", "A large amount of.", "I don't have much money.", "我没有很多钱。", ["数量"]],
  ["more", "/mɔː(r)/", "determiner", "更多", "A larger amount.", "I want more water.", "我想要更多水。", ["数量"]],
  ["all", "/ɔːl/", "determiner", "全部", "The whole number or amount.", "All students are here.", "所有学生都在这里。", ["数量"]],
  ["both", "/bəʊθ/", "determiner", "两者都", "The two of them.", "Both books are good.", "两本书都很好。", ["数量"]],
  ["every", "/ˈevri/", "determiner", "每个", "Each one of a group.", "I go to school every day.", "我每天去学校。", ["数量"]],
  ["lot", "/lɒt/", "noun", "许多（a lot of）", "Used in a lot of = many/much.", "I have a lot of friends.", "我有很多朋友。", ["数量"]],
  ["thing", "/θɪŋ/", "noun", "东西；事情", "An object or a fact.", "What is this thing?", "这是什么东西？", ["基础名词"]],
  ["way", "/weɪ/", "noun", "路；方式", "A road or a method.", "Which way is the school?", "去学校哪条路？", ["基础名词"]],
  ["word", "/wɜːd/", "noun", "单词；词", "A unit of language.", "This is a new word.", "这是一个新单词。", ["学校"]],
  ["sentence", "/ˈsentəns/", "noun", "句子", "A group of words that makes a complete idea.", "Write a sentence.", "写一个句子。", ["学校"]],
  ["letter", "/ˈletə(r)/", "noun", "字母；信", "A character in the alphabet; also a written message.", "A is the first letter.", "A 是第一个字母。", ["学校"]],
  ["number", "/ˈnʌmbə(r)/", "noun", "数字；号码", "A symbol for counting; also a phone number.", "What is your phone number?", "你的电话号码是多少？", ["数字"]],
  ["age", "/eɪdʒ/", "noun", "年龄", "How many years a person has lived.", "What is your age? / How old are you?", "你多大了？", ["人物"]],
  ["job", "/dʒɒb/", "noun", "工作；职业", "Work that you do for money.", "What is your job?", "你的工作是什么？", ["人物"]],
  ["doctor", "/ˈdɒktə(r)/", "noun", "医生", "A person who treats sick people.", "The doctor helps me.", "医生帮助我。", ["职业"]],
  ["nurse", "/nɜːs/", "noun", "护士", "A person who cares for sick people.", "She is a nurse.", "她是护士。", ["职业"]],
  ["driver", "/ˈdraɪvə(r)/", "noun", "司机", "A person who drives a vehicle.", "The bus driver is careful.", "公交司机很小心。", ["职业"]],
  ["worker", "/ˈwɜːkə(r)/", "noun", "工人；员工", "A person who works.", "He is a hard worker.", "他是一个勤奋的员工。", ["职业"]],
  ["police", "/pəˈliːs/", "noun", "警察", "People whose job is to keep people safe and catch criminals.", "Call the police.", "打电话给警察。", ["职业"]],
  ["China", "/ˈtʃaɪnə/", "noun", "中国", "A country in Asia.", "I live in China.", "我住在中国。", ["国家"]],
  ["Chinese", "/ˌtʃaɪˈniːz/", "adjective", "中国的；中文的", "From China; of the Chinese language.", "I am Chinese.", "我是中国人。", ["国家"]],
  ["English", "/ˈɪŋɡlɪʃ/", "adjective", "英国的；英语的", "From England; of the English language.", "This is an English book.", "这是一本英语书。", ["国家"]],
  ["America", "/əˈmerɪkə/", "noun", "美国", "The United States.", "He is from America.", "他来自美国。", ["国家"]],
  ["world", "/wɜːld/", "noun", "世界", "The earth and all people and places.", "Hello, world!", "你好，世界！", ["基础名词"]],
  ["life", "/laɪf/", "noun", "生活；生命", "The time when a person is alive; also daily living.", "I love my life.", "我爱我的生活。", ["基础名词"]],
  ["problem", "/ˈprɒbləm/", "noun", "问题；麻烦", "Something difficult to deal with.", "I have a problem.", "我有一个问题。", ["基础名词"]],
  ["idea", "/aɪˈdɪə/", "noun", "想法", "A thought or plan.", "That is a good idea.", "那是个好主意。", ["基础名词"]],
  ["music", "/ˈmjuːzɪk/", "noun", "音乐", "Sounds arranged to be pleasant.", "I like music.", "我喜欢音乐。", ["兴趣"]],
  ["game", "/ɡeɪm/", "noun", "游戏；比赛", "An activity for fun with rules.", "Let's play a game.", "我们来玩个游戏。", ["兴趣"]],
  ["sport", "/spɔːt/", "noun", "运动", "Physical activity for exercise or fun.", "Football is a popular sport.", "足球是一项受欢迎的运动。", ["兴趣"]],
  ["football", "/ˈfʊtbɔːl/", "noun", "足球", "A game played with a ball using feet.", "I play football on Sunday.", "我星期天踢足球。", ["兴趣"]],
  ["basketball", "/ˈbɑːskɪtbɔːl/", "noun", "篮球", "A game played with a ball and two baskets.", "He likes basketball.", "他喜欢篮球。", ["兴趣"]],
  ["party", "/ˈpɑːti/", "noun", "聚会", "A social event for fun.", "We have a birthday party.", "我们开生日派对。", ["兴趣"]],
  ["birthday", "/ˈbɜːθdeɪ/", "noun", "生日", "The day each year when you were born.", "Happy birthday!", "生日快乐！", ["时间"]],
  ["holiday", "/ˈhɒlədeɪ/", "noun", "假日", "A day or period free from work or school.", "We travel on holiday.", "我们假期去旅行。", ["时间"]],
  ["summer", "/ˈsʌmə(r)/", "noun", "夏天", "The hot season of the year.", "Summer is hot.", "夏天很热。", ["季节"]],
  ["winter", "/ˈwɪntə(r)/", "noun", "冬天", "The cold season of the year.", "Winter is cold.", "冬天很冷。", ["季节"]],
  ["spring", "/sprɪŋ/", "noun", "春天", "The season after winter.", "Flowers grow in spring.", "春天花会开。", ["季节"]],
  ["autumn", "/ˈɔːtəm/", "noun", "秋天（英式）", "The season after summer.", "Leaves fall in autumn.", "秋天下叶子。", ["季节"]],
  ["fall", "/fɔːl/", "noun", "秋天（美式）；落下", "The season after summer in American English.", "Fall is cool.", "秋天很凉爽。", ["季节"]],

  // —— 生存会话高频 ——
  ["help", "/help/", "noun", "帮助", "The act of making things easier for someone.", "I need help.", "我需要帮助。", ["生存会话"]],
  ["welcome", "/ˈwelkəm/", "exclamation", "欢迎；不客气", "Used to greet someone; also a reply to thank you.", "You are welcome.", "不客气。", ["礼貌"]],
  ["sure", "/ʃʊə(r)/", "adjective", "当然；确定", "Certain; also used to agree.", "Sure, no problem.", "当然，没问题。", ["基础应答"]],
  ["maybe", "/ˈmeɪbi/", "adverb", "也许", "Perhaps; not sure.", "Maybe tomorrow.", "也许明天。", ["基础应答"]],
  ["really", "/ˈrɪəli/", "adverb", "真的", "In fact; used for emphasis.", "Really? That is great!", "真的吗？太棒了！", ["副词"]],
  ["great", "/ɡreɪt/", "adjective", "很棒的", "Very good.", "That is great!", "那太棒了！", ["形容词"]],
  ["well", "/wel/", "adverb", "好地；嗯", "In a good way; also a thinking word.", "I am well, thank you.", "我很好，谢谢。", ["副词"]],
  ["ready", "/ˈredi/", "adjective", "准备好的", "Prepared to do something.", "Are you ready?", "你准备好了吗？", ["形容词"]],
  ["free", "/friː/", "adjective", "空闲的；免费的", "Not busy; also costing nothing.", "Are you free today?", "你今天有空吗？", ["形容词"]],
  ["busy", "/ˈbɪzi/", "adjective", "忙碌的", "Having a lot to do.", "I am busy now.", "我现在很忙。", ["形容词"]],
  ["wrong", "/rɒŋ/", "adjective", "错误的", "Not correct.", "That is wrong.", "那是错的。", ["形容词"]],
  ["right", "/raɪt/", "adjective", "正确的", "Correct.", "You are right.", "你是对的。", ["形容词"]],
  ["true", "/truː/", "adjective", "真的", "Correct or real.", "Is that true?", "那是真的吗？", ["形容词"]],
  ["false", "/fɔːls/", "adjective", "假的", "Not true.", "True or false?", "是真是假？", ["形容词"]],
  ["hello", "/həˈləʊ/", "noun", "问候；招呼", "A greeting word.", "Say hello to your teacher.", "向老师问好。", ["问候"]],
];

function fixPos(pos) {
  if (pos === "exjective") return "adjective";
  if (pos === "phrase") return "phrase";
  return pos || "word";
}

function normalizeKey(word) {
  return String(word || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ");
}

function articleFor(word) {
  const w = String(word || "").trim();
  if (!w || w.includes(" ")) return "";
  return /^[aeiou]/i.test(w) ? "an" : "a";
}

function buildExample(word, pos, meaning) {
  const w = String(word).trim();
  const p = fixPos(pos);
  if (p === "phrase" || w.includes(" ")) {
    return {
      definition: `A basic phrase: ${meaning}.`,
      example: `You can say: "${w}."`,
      exampleCn: `你可以这样说：「${w}。」（${meaning}）`
    };
  }
  if (p === "verb") {
    return {
      definition: `To ${meaning.replace(/[；;].*$/, "")} (basic meaning).`,
      example: `I ${w} every day.`,
      exampleCn: `我每天${meaning.split(/[；;]/)[0]}。`
    };
  }
  if (p === "adjective") {
    return {
      definition: `Describes something as ${meaning.replace(/[；;].*$/, "")}.`,
      example: `It is ${w}.`,
      exampleCn: `它很${meaning.split(/[；;]/)[0]}。`
    };
  }
  if (p === "adverb") {
    return {
      definition: `In a way that means ${meaning.replace(/[；;].*$/, "")}.`,
      example: `Please speak ${w}.`,
      exampleCn: `请${meaning.split(/[；;]/)[0]}地说。`
    };
  }
  if (p === "preposition" || p === "conjunction" || p === "determiner" || p === "article") {
    return {
      definition: `A basic grammar word meaning ${meaning}.`,
      example: `Learn the word "${w}".`,
      exampleCn: `学习单词「${w}」（${meaning}）。`
    };
  }
  if (p === "number") {
    return {
      definition: `The number meaning ${meaning}.`,
      example: `I can count to ${w}.`,
      exampleCn: `我能数到${meaning}。`
    };
  }
  if (p === "pronoun" || p === "exclamation") {
    return {
      definition: `A basic word meaning ${meaning}.`,
      example: `${w[0].toUpperCase()}${w.slice(1)} is useful.`,
      exampleCn: `「${w}」的意思是${meaning}。`
    };
  }
  const art = articleFor(w);
  return {
    definition: `${art ? art[0].toUpperCase() + art.slice(1) + " " : ""}${w}: ${meaning}.`.replace(/^A a /, "A ").replace(/^An an /, "An "),
    example: art ? `This is ${art} ${w}.` : `This is ${w}.`,
    exampleCn: art ? `这是${meaning.split(/[；;]/)[0]}。` : `这是「${w}」（${meaning.split(/[；;]/)[0]}）。`
  };
}

function compactToRow(row) {
  const [word, meaning, pos, topics] = row;
  const filled = buildExample(word, pos, meaning);
  return [
    word,
    "",
    fixPos(pos),
    meaning,
    filled.definition,
    filled.example,
    filled.exampleCn,
    Array.isArray(topics) ? topics : []
  ];
}

function addRow(seen, words, row) {
  const [word, phonetic, pos, meaning, definition, example, exampleCn, topics] = row;
  const key = normalizeKey(word);
  if (!key) return false;

  if (seen.has(key)) {
    const existing = seen.get(key);
    const set = new Set([...(existing.topics || []), ...((topics) || [])]);
    existing.topics = [...set];
    if (meaning && !String(existing.meaning || "").includes(meaning)) {
      existing.meaning = `${existing.meaning}；${meaning}`;
    }
    if (!existing.phonetic && phonetic) existing.phonetic = phonetic;
    if (!existing.example && example) {
      existing.example = example;
      existing.exampleCn = exampleCn || existing.exampleCn;
    }
    if (!existing.definition && definition) existing.definition = definition;
    return false;
  }

  const entry = {
    id: `zero_${String(words.length + 1).padStart(4, "0")}_${key.replace(/[^a-z0-9]+/g, "_")}`,
    word: String(word).trim(),
    phonetic: phonetic || "",
    pos: fixPos(pos),
    meaning: meaning || "",
    definition: definition || "",
    example: example || "",
    exampleCn: exampleCn || "",
    collocations: [],
    phraseCollocations: [],
    ieltsUse: ["零基础启蒙"],
    topics: Array.isArray(topics) ? topics : [],
    difficulty: "零基础",
    category: "零基础完全启蒙",
    forms: [],
    wordFamily: []
  };
  seen.set(key, entry);
  words.push(entry);
  return true;
}

function build() {
  const seen = new Map();
  const words = [];

  // Priority 1: full curated rows (with phonetics / hand examples)
  for (const row of RAW) addRow(seen, words, row);

  // Priority 2: compact expansion until we hit the target
  for (const compact of EXTRA_COMPACT) {
    if (words.length >= TARGET_COUNT) break;
    addRow(seen, words, compactToRow(compact));
  }

  if (words.length < TARGET_COUNT) {
    console.warn(`Warning: only ${words.length} unique words (target ${TARGET_COUNT}). Add more to basic-zero-extra.mjs`);
  } else if (words.length > TARGET_COUNT) {
    // Should not happen if EXTRA loop breaks, but keep exact cap safety.
    words.length = TARGET_COUNT;
  }

  const byTopic = {};
  for (const w of words) {
    for (const t of w.topics) {
      byTopic[t] = (byTopic[t] || 0) + 1;
    }
  }

  const payload = {
    version: "basic-zero-v2-1500",
    generatedAt: new Date().toISOString(),
    source: "curated-zero-foundation-pre-a1-a1-plus-extra",
    count: words.length,
    targetCount: TARGET_COUNT,
    note: "完全零基础英文词库（Pre-A1/A1 生存词，目标约1500）。与雅思主词库完全隔离，不合并、不覆盖 words.json。",
    topicStats: byTopic,
    words
  };

  fs.writeFileSync(outPath, JSON.stringify(payload, null, 0), "utf8");
  console.log(`Wrote ${words.length} zero-foundation words -> ${outPath}`);
  console.log("Topics:", Object.entries(byTopic).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(", "));
}

build();
