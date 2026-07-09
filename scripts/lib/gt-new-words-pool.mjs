/**
 * Curated IELTS GT new-word pool (591+ high-value headwords).
 * Tuple: [word, pos, meaningZh, example, topics, category, gTUseCase, difficulty, targetBand]
 */
export const KEEP_NEW_WORDS = new Set([
  "electrician", "workload", "overdraft", "unsatisfactory", "rectify",
  "tenancy", "boiler", "redundancy", "policyholder", "ineligible",
  "verification", "rota", "arrears", "clarification", "roadworks", "takeaway", "owing"
]);

export const FORCE_REPLACE = new Set([
  "hadrosaur", "platypus", "agiotage", "booby", "duckbill",
  "abreact", "distrain", "distraint", "emolument", "honorarium", "potentate", "quayage",
  "headwaiter", "druggist", "floater", "migrator", "pacer", "infract", "overawe",
  "amoeba", "boondoggle", "beaver", "blowfish", "archduke", "canonic", "canonical", "pedant",
  "allotope", "allophone", "amorphous", "apologist", "banger", "billet", "blaster", "brainchild"
]);

const DOMAIN_ROWS = [
  // Housing / rental / community
  ["landlord", "noun", "房东", "The landlord promised to repair the broken window by Friday.", "住房", "IELTS G类 · 住房", "租房沟通", "基础高频", "4-5"],
  ["tenant", "noun", "租户；房客", "The tenant reported damp walls in the bedroom.", "住房", "IELTS G类 · 住房", "租赁纠纷", "基础高频", "4-5"],
  ["deposit", "noun", "押金；定金", "You must pay a deposit before moving in.", "住房", "IELTS G类 · 住房", "租房合同", "基础高频", "4-5"],
  ["leasehold", "noun", "租赁产权", "The flat is sold as leasehold, not freehold.", "住房", "IELTS G类 · 住房", "房产阅读", "中级核心", "6-7"],
  ["freehold", "noun", "永久产权", "They prefer a freehold house with no ground rent.", "住房", "IELTS G类 · 住房", "房产阅读", "中级核心", "6-7"],
  ["damp", "noun", "潮湿；湿气", "There is damp behind the kitchen cupboards.", "住房", "IELTS G类 · 住房维修", "维修投诉", "中级核心", "5-6"],
  ["mould", "noun", "霉菌", "Black mould appeared after the flood.", "住房", "IELTS G类 · 住房维修", "健康隐患", "中级核心", "5-6"],
  ["insulation", "noun", "隔热；绝缘", "Better insulation reduced our heating bills.", "住房", "IELTS G类 · 住房", "节能改造", "中级核心", "5-6"],
  ["plumber", "noun", "水管工", "A plumber fixed the leaking pipe under the sink.", "住房", "IELTS G类 · 住房维修", "维修预约", "基础高频", "4-5"],
  ["carpenter", "noun", "木工", "The carpenter fitted new kitchen cupboards.", "住房", "IELTS G类 · 住房维修", "装修服务", "中级核心", "5-6"],
  ["handyman", "noun", "杂务工；勤杂工", "We hired a handyman to assemble the flat-pack furniture.", "住房", "IELTS G类 · 住房维修", "日常维修", "中级核心", "5-6"],
  ["council", "noun", "市政委员会；地方议会", "The council issued a noise warning to neighbours.", "住房", "IELTS G类 · 社区", "社区通知", "中级核心", "5-6"],
  ["neighbourhood", "noun", "社区；街区", "The neighbourhood scheme offers free recycling bins.", "住房", "IELTS G类 · 社区", "社区服务", "中级核心", "5-6"],
  ["communal", "adjective", "公共的；共用的", "Residents must keep communal areas tidy.", "住房", "IELTS G类 · 住房", "公寓规则", "中级核心", "5-6"],
  ["eviction", "noun", "驱逐；收回房屋", "Eviction can follow repeated late rent payments.", "住房", "IELTS G类 · 住房", "租赁纠纷", "高级加分", "6-7"],
  ["inventory", "noun", "物品清单", "Check the inventory before you sign the contract.", "住房", "IELTS G类 · 住房", "入住检查", "中级核心", "5-6"],
  ["fixture", "noun", "固定装置", "Light fittings are included as fixtures.", "住房", "IELTS G类 · 住房", "合同条款", "中级核心", "5-6"],
  ["groundwork", "noun", "基础工程；准备工作", "Groundwork for the extension starts on Monday.", "住房", "IELTS G类 · 住房维修", "施工通知", "中级核心", "5-6"],
  ["refurbish", "verb", "翻新；整修", "The landlord will refurbish the bathroom next month.", "住房", "IELTS G类 · 住房维修", "装修计划", "中级核心", "5-6"],
  ["renovate", "verb", "翻新；修缮", "They plan to renovate the kitchen during the break.", "住房", "IELTS G类 · 住房维修", "装修申请", "中级核心", "5-6"],
  // Work / employment
  ["employer", "noun", "雇主", "Your employer must provide a written contract.", "工作", "IELTS G类 · 工作职场", "入职手续", "基础高频", "4-5"],
  ["employee", "noun", "雇员", "Every employee receives safety training.", "工作", "IELTS G类 · 工作职场", "职场规定", "基础高频", "4-5"],
  ["payroll", "noun", "工资单；薪资发放", "Payroll is processed on the last Friday each month.", "工作", "IELTS G类 · 工作职场", "薪资通知", "中级核心", "5-6"],
  ["payslip", "noun", "工资条", "Check your payslip for overtime hours.", "工作", "IELTS G类 · 工作职场", "薪资核对", "中级核心", "5-6"],
  ["probation", "noun", "试用期", "Probation lasts three months for new staff.", "工作", "IELTS G类 · 工作职场", "雇佣条款", "中级核心", "5-6"],
  ["resignation", "noun", "辞职", "Please submit your resignation in writing.", "工作", "IELTS G类 · 工作职场", "离职流程", "中级核心", "5-6"],
  ["dismissal", "noun", "解雇", "Unfair dismissal can be challenged at a tribunal.", "工作", "IELTS G类 · 工作职场", "劳动纠纷", "高级加分", "6-7"],
  ["timetable", "noun", "时间表；课程表", "The revised timetable starts after the holiday.", "工作", "IELTS G类 · 工作职场", "排班变更", "基础高频", "4-5"],
  ["supervisor", "noun", "主管；监督人", "Speak to your supervisor about shift swaps.", "工作", "IELTS G类 · 工作职场", "职场沟通", "中级核心", "5-6"],
  ["colleague", "noun", "同事", "A colleague covered my shift while I was ill.", "工作", "IELTS G类 · 工作职场", "职场互助", "基础高频", "4-5"],
  ["appraisal", "noun", "绩效评估", "Annual appraisal meetings are held in March.", "工作", "IELTS G类 · 工作职场", "绩效面谈", "中级核心", "6-7"],
  ["induction", "noun", "入职培训", "Induction includes a tour of the building.", "工作", "IELTS G类 · 工作职场", "新员工培训", "中级核心", "5-6"],
  ["freelance", "adjective", "自由职业的", "She works as a freelance designer from home.", "工作", "IELTS G类 · 工作职场", "工作安排", "中级核心", "5-6"],
  ["part-time", "adjective", "兼职的", "The café is hiring part-time staff for summer.", "工作", "IELTS G类 · 工作职场", "招聘广告", "基础高频", "4-5"],
  ["full-time", "adjective", "全职的", "The role is full-time with flexible start times.", "工作", "IELTS G类 · 工作职场", "招聘广告", "基础高频", "4-5"],
  ["maternity", "noun", "产假；产假相关", "Maternity leave policy is explained in the handbook.", "工作", "IELTS G类 · 工作职场", "请假政策", "中级核心", "5-6"],
  ["paternity", "noun", "陪产假", "He applied for two weeks of paternity leave.", "工作", "IELTS G类 · 工作职场", "家庭请假", "中级核心", "5-6"],
  ["sicknote", "noun", "病假条", "Upload your sicknote within three days.", "工作", "IELTS G类 · 工作职场", "病假申请", "中级核心", "5-6"],
  ["union", "noun", "工会", "The union negotiated better break allowances.", "工作", "IELTS G类 · 工作职场", "劳工权益", "中级核心", "6-7"],
  ["strike", "noun", "罢工", "Bus services were cancelled due to a strike.", "工作", "IELTS G类 · 工作职场", "服务中断", "中级核心", "5-6"],
  // Banking / finance / insurance
  ["overdrawn", "adjective", "透支的", "Your account is overdrawn by fifty pounds.", "银行", "IELTS G类 · 金融合同", "账户状态", "中级核心", "5-6"],
  ["transaction", "noun", "交易", "Each transaction appears on your monthly statement.", "银行", "IELTS G类 · 金融合同", "账单核对", "中级核心", "5-6"],
  ["standingorder", "noun", "定期转账指令", "Rent is paid by standing order on the first.", "银行", "IELTS G类 · 金融合同", "自动付款", "中级核心", "5-6"],
  ["directdebit", "noun", "直接借记", "Set up a direct debit for the gym membership.", "银行", "IELTS G类 · 金融合同", "自动扣款", "中级核心", "5-6"],
  ["interest", "noun", "利息", "Savings accounts earn a small rate of interest.", "银行", "IELTS G类 · 金融合同", "理财阅读", "基础高频", "4-5"],
  ["mortgage", "noun", "抵押贷款", "They applied for a mortgage with a fixed rate.", "银行", "IELTS G类 · 金融合同", "购房贷款", "中级核心", "5-6"],
  ["instalment", "noun", "分期付款", "Pay the balance in six monthly instalments.", "银行", "IELTS G类 · 金融合同", "付款计划", "中级核心", "5-6"],
  ["reimburse", "verb", "报销；补偿", "The firm will reimburse your travel expenses.", "银行", "IELTS G类 · 金融合同", "费用报销", "中级核心", "5-6"],
  ["premium", "noun", "保险费；溢价", "The insurance premium increased this year.", "保险", "IELTS G类 · 金融合同", "保单续费", "中级核心", "5-6"],
  ["excess", "noun", "免赔额", "You must pay the excess before the claim is settled.", "保险", "IELTS G类 · 金融合同", "保险索赔", "中级核心", "6-7"],
  ["claimant", "noun", "索赔人", "The claimant submitted photos of the damage.", "保险", "IELTS G类 · 金融合同", "理赔流程", "中级核心", "6-7"],
  ["broker", "noun", "经纪人", "An insurance broker compared three policies for us.", "保险", "IELTS G类 · 金融合同", "保险咨询", "中级核心", "6-7"],
  ["invoice", "noun", "发票", "Please attach the invoice to your expense form.", "银行", "IELTS G类 · 金融合同", "报销凭证", "中级核心", "5-6"],
  ["receipt", "noun", "收据", "Keep the receipt in case you need a refund.", "银行", "IELTS G类 · 金融合同", "消费记录", "基础高频", "4-5"],
  ["VAT", "noun", "增值税", "Prices shown include VAT at the standard rate.", "银行", "IELTS G类 · 金融合同", "购物账单", "中级核心", "5-6"],
  ["currency", "noun", "货币", "The hotel accepts payment in local currency only.", "银行", "IELTS G类 · 金融合同", "旅行消费", "基础高频", "4-5"],
  ["exchange", "noun", "兑换；汇率", "Check the exchange rate before you travel.", "银行", "IELTS G类 · 金融合同", "换汇服务", "中级核心", "5-6"],
  ["penalty", "noun", "罚金；处罚", "A late payment penalty was added to the bill.", "银行", "IELTS G类 · 金融合同", "逾期费用", "中级核心", "5-6"],
  ["subsidy", "noun", "补贴", "A government subsidy reduced childcare costs.", "银行", "IELTS G类 · 政府公共服务", "福利政策", "高级加分", "6-7"],
  ["pension", "noun", "养老金", "Staff can join the workplace pension scheme.", "银行", "IELTS G类 · 金融合同", "退休福利", "中级核心", "5-6"],
  // Travel / transport / services
  ["itinerary", "noun", "行程；旅行计划", "Your itinerary includes a hotel transfer on arrival.", "交通", "IELTS G类 · 交通旅行", "行程安排", "中级核心", "5-6"],
  ["departure", "noun", "出发；离港", "Departure gates close twenty minutes before take-off.", "交通", "IELTS G类 · 交通旅行", "机场通知", "基础高频", "4-5"],
  ["arrival", "noun", "到达；进港", "Arrival times may change due to weather.", "交通", "IELTS G类 · 交通旅行", "航班信息", "基础高频", "4-5"],
  ["baggage", "noun", "行李", "Excess baggage fees apply over twenty kilos.", "交通", "IELTS G类 · 交通旅行", "行李规定", "基础高频", "4-5"],
  ["platform", "noun", "站台；平台", "The train to Leeds leaves from platform four.", "交通", "IELTS G类 · 交通旅行", "铁路广播", "基础高频", "4-5"],
  ["timetable", "noun", "时刻表", "Download the bus timetable from the council website.", "交通", "IELTS G类 · 交通旅行", "公交查询", "基础高频", "4-5"],
  ["diversion", "noun", "绕行；改道", "A diversion is in place because of roadworks.", "交通", "IELTS G类 · 交通旅行", "路况通知", "中级核心", "5-6"],
  ["concession", "noun", "优惠票价；特许", "Students qualify for a travel concession.", "交通", "IELTS G类 · 交通旅行", "票务优惠", "中级核心", "5-6"],
  ["reschedule", "verb", "改期；重新安排", "We can reschedule your appointment online.", "交通", "IELTS G类 · 交通旅行", "预约变更", "中级核心", "5-6"],
  ["cancellation", "noun", "取消", "Cancellation fees apply within twenty-four hours.", "交通", "IELTS G类 · 交通旅行", "退改政策", "中级核心", "5-6"],
  ["commute", "verb", "通勤", "She commutes by train three days a week.", "交通", "IELTS G类 · 交通旅行", "日常出行", "中级核心", "5-6"],
  ["pedestrian", "noun", "行人", "Pedestrians should use the marked crossing.", "交通", "IELTS G类 · 交通旅行", "道路安全", "中级核心", "5-6"],
  ["parking", "noun", "停车", "Visitor parking is available behind the clinic.", "交通", "IELTS G类 · 交通旅行", "停车指引", "基础高频", "4-5"],
  ["toll", "noun", "通行费；过路费", "The bridge toll can be paid online.", "交通", "IELTS G类 · 交通旅行", "收费道路", "中级核心", "5-6"],
  ["visa", "noun", "签证", "Apply for a visa at least six weeks before travel.", "交通", "IELTS G类 · 交通旅行", "出境手续", "中级核心", "5-6"],
  ["customs", "noun", "海关", "Declare goods when you pass through customs.", "交通", "IELTS G类 · 交通旅行", "入境检查", "中级核心", "5-6"],
  ["immigration", "noun", "入境管理；移民局", "Immigration officers checked our passports.", "交通", "IELTS G类 · 交通旅行", "边境检查", "中级核心", "6-7"],
  ["shuttle", "noun", "穿梭巴士", "A free shuttle runs between the hotel and airport.", "交通", "IELTS G类 · 交通旅行", "机场接送", "中级核心", "5-6"],
  ["ferry", "noun", "渡轮", "The ferry to the island leaves hourly.", "交通", "IELTS G类 · 交通旅行", "海岛交通", "中级核心", "5-6"],
  ["terminal", "noun", "航站楼；终点站", "Meet us outside terminal two arrivals.", "交通", "IELTS G类 · 交通旅行", "机场会合", "中级核心", "5-6"],
  // Health / school / daily services
  ["prescription", "noun", "处方", "Collect your prescription from the pharmacy counter.", "健康", "IELTS G类 · 健康医疗", "取药流程", "中级核心", "5-6"],
  ["pharmacy", "noun", "药房", "The pharmacy opens late on weekdays.", "健康", "IELTS G类 · 健康医疗", "医疗服务", "基础高频", "4-5"],
  ["symptom", "noun", "症状", "Report any new symptoms to the nurse.", "健康", "IELTS G类 · 健康医疗", "就诊沟通", "中级核心", "5-6"],
  ["vaccination", "noun", "疫苗接种", "Vaccination records are required for school entry.", "健康", "IELTS G类 · 健康医疗", "入学要求", "中级核心", "5-6"],
  ["referral", "noun", "转诊", "Your GP will send a referral to the specialist.", "健康", "IELTS G类 · 健康医疗", "专科预约", "中级核心", "6-7"],
  ["enrol", "verb", "注册；入学", "Enrol your child before the term starts.", "学校", "IELTS G类 · 教育", "入学注册", "中级核心", "5-6"],
  ["enrollment", "noun", "注册；入学人数", "Enrollment closes on the fifteenth of August.", "学校", "IELTS G类 · 教育", "招生截止", "中级核心", "5-6"],
  ["curriculum", "noun", "课程；课程体系", "The curriculum includes practical workplace skills.", "学校", "IELTS G类 · 教育", "课程说明", "中级核心", "6-7"],
  ["timetabling", "noun", "排课", "Timetabling changes were emailed to parents.", "学校", "IELTS G类 · 教育", "课程调整", "中级核心", "5-6"],
  ["nursery", "noun", "托儿所；幼儿园", "The nursery offers funded places for three-year-olds.", "学校", "IELTS G类 · 教育", "幼教服务", "中级核心", "5-6"],
  ["childcare", "noun", "托儿服务", "Childcare vouchers can reduce monthly costs.", "学校", "IELTS G类 · 教育", "育儿补贴", "中级核心", "5-6"],
  ["groceries", "noun", "食品杂货", "Online groceries arrive in reusable bags.", "购物", "IELTS G类 · 日常生活", "网购配送", "基础高频", "4-5"],
  ["refundpolicy", "noun", "退款政策", "Read the refund policy before you buy.", "购物", "IELTS G类 · 日常生活", "消费权益", "中级核心", "5-6"],
  ["warranty", "noun", "保修", "The warranty covers parts for two years.", "购物", "IELTS G类 · 日常生活", "售后保障", "中级核心", "5-6"],
  ["replacement", "noun", "替换品；更换", "A replacement kettle was sent within five days.", "购物", "IELTS G类 · 日常生活", "换货服务", "中级核心", "5-6"],
  ["deliver", "verb", "递送；交付", "They deliver furniture on Saturday mornings.", "购物", "IELTS G类 · 日常生活", "配送安排", "基础高频", "4-5"],
  ["catering", "noun", "餐饮服务", "Office catering includes vegetarian options.", "餐饮", "IELTS G类 · 日常生活", "活动订餐", "中级核心", "5-6"],
  ["reservation", "noun", "预订", "I made a reservation for eight people.", "餐饮", "IELTS G类 · 日常生活", "餐厅预约", "基础高频", "4-5"],
  ["allergy", "noun", "过敏", "Tell staff about any food allergy before ordering.", "餐饮", "IELTS G类 · 日常生活", "点餐说明", "中级核心", "5-6"],
  ["dietary", "adjective", "饮食相关的", "Dietary requirements are noted on the booking.", "餐饮", "IELTS G类 · 日常生活", "特殊饮食", "中级核心", "5-6"],
  // Letters / formal communication / abstract
  ["acknowledge", "verb", "确认收到；承认", "Please acknowledge receipt of this letter.", "G类书信", "IELTS G类 · G类书信表达", "收信确认", "中级核心", "5-6"],
  ["apologise", "verb", "道歉", "We apologise for the delay in replying.", "G类书信", "IELTS G类 · G类书信表达", "致歉信", "中级核心", "5-6"],
  ["enquire", "verb", "询问", "I am writing to enquire about membership fees.", "G类书信", "IELTS G类 · G类书信表达", "咨询信", "中级核心", "5-6"],
  ["complaint", "noun", "投诉", "Your complaint has been forwarded to the manager.", "G类书信", "IELTS G类 · G类书信表达", "投诉跟进", "基础高频", "4-5"],
  ["reminder", "noun", "提醒", "This is a reminder that payment is due tomorrow.", "G类书信", "IELTS G类 · G类书信表达", "付款提醒", "中级核心", "5-6"],
  ["deadline", "noun", "截止日期", "The deadline for applications is 30 April.", "G类书信", "IELTS G类 · G类书信表达", "申请截止", "基础高频", "4-5"],
  ["extension", "noun", "延期；延长", "She requested an extension for the coursework.", "G类书信", "IELTS G类 · G类书信表达", "延期申请", "中级核心", "5-6"],
  ["feedback", "noun", "反馈", "We welcome feedback on our customer service.", "G类书信", "IELTS G类 · G类书信表达", "服务评价", "中级核心", "5-6"],
  ["follow-up", "noun", "后续跟进", "A follow-up email will confirm the booking.", "G类书信", "IELTS G类 · G类书信表达", "跟进通知", "中级核心", "5-6"],
  ["attachment", "noun", "附件", "See the attachment for the completed form.", "G类书信", "IELTS G类 · G类书信表达", "邮件附件", "中级核心", "5-6"],
  ["accordingly", "adverb", "相应地；因此", "Prices rose and demand fell accordingly.", "阅读", "IELTS G类 · 抽象实用词", "逻辑衔接", "高级加分", "6-7"],
  ["nevertheless", "adverb", "尽管如此", "Nevertheless, the service improved after the review.", "阅读", "IELTS G类 · 抽象实用词", "转折逻辑", "高级加分", "6-7"],
  ["furthermore", "adverb", "此外", "Furthermore, the policy covers accidental damage.", "阅读", "IELTS G类 · 抽象实用词", "补充说明", "高级加分", "6-7"],
  ["whereas", "conjunction", "然而；鉴于", "Whereas last year demand fell, sales have now recovered.", "阅读", "IELTS G类 · 抽象实用词", "对比逻辑", "高级加分", "6-7"],
  ["provided", "conjunction", "只要；如果", "Refunds are offered provided you keep the receipt.", "阅读", "IELTS G类 · 抽象实用词", "条件句", "中级核心", "6-7"],
  ["unless", "conjunction", "除非", "You cannot enter unless you show a ticket.", "阅读", "IELTS G类 · 抽象实用词", "条件限制", "中级核心", "5-6"],
  ["eligible", "adjective", "有资格的", "Only eligible residents may apply for the grant.", "规则", "IELTS G类 · 政府公共服务", "资格说明", "中级核心", "5-6"],
  ["mandatory", "adjective", "强制性的", "Attendance is mandatory for all new recruits.", "规则", "IELTS G类 · 政府公共服务", "规定要求", "中级核心", "6-7"],
  ["voluntary", "adjective", "自愿的", "Participation in the survey is voluntary.", "规则", "IELTS G类 · 政府公共服务", "参与说明", "中级核心", "5-6"],
  ["compliance", "noun", "合规；遵守", "Tenants must ensure compliance with fire rules.", "规则", "IELTS G类 · 政府公共服务", "安全规定", "高级加分", "6-7"],
  ["liability", "noun", "责任；法律责任", "The contract explains your liability for damage.", "规则", "IELTS G类 · 金融合同", "合同责任", "高级加分", "6-7"],
  ["discretion", "noun", "酌情决定权", "Refunds are granted at the manager's discretion.", "规则", "IELTS G类 · 政府公共服务", "处理弹性", "高级加分", "6-7"],
  ["provision", "noun", "规定；条款", "The agreement includes a provision for early exit.", "规则", "IELTS G类 · 金融合同", "合同条款", "高级加分", "6-7"],
  ["notwithstanding", "preposition", "尽管", "Notwithstanding the delay, the event went ahead.", "阅读", "IELTS G类 · 抽象实用词", "正式表达", "高级加分", "6-7"],
  ["henceforth", "adverb", "此后", "Henceforth, bookings must be made online.", "阅读", "IELTS G类 · 抽象实用词", "政策变更", "高级加分", "6-7"],
  ["promptly", "adverb", "迅速地；及时地", "Please respond promptly to the safety notice.", "G类书信", "IELTS G类 · G类书信表达", "催促回复", "中级核心", "5-6"],
  ["gratitude", "noun", "感激", "I write to express my gratitude for your help.", "G类书信", "IELTS G类 · G类书信表达", "感谢信", "中级核心", "5-6"],
  ["inconvenience", "noun", "不便", "We regret any inconvenience caused by the outage.", "G类书信", "IELTS G类 · G类书信表达", "致歉说明", "中级核心", "5-6"]
];

// Priority keep words with full metadata
const PRIORITY_KEEP = [
  ["electrician", "noun", "电工", "The landlord sent an electrician to fix the wiring.", "住房", "IELTS G类 · 住房维修", "住房维修投诉", "基础高频", "4-5"],
  ["workload", "noun", "工作量", "My manager reduced my workload during training.", "工作", "IELTS G类 · 工作职场", "职场沟通", "中级核心", "5-6"],
  ["overdraft", "noun", "透支；透支额度", "The bank charged a fee for exceeding the overdraft limit.", "银行", "IELTS G类 · 金融合同", "银行账单", "中级核心", "5-6"],
  ["unsatisfactory", "adjective", "不能令人满意的", "The repair was unsatisfactory, so I requested a refund.", "G类书信", "IELTS G类 · G类书信表达", "投诉信", "中级核心", "5-6"],
  ["rectify", "verb", "纠正；整改", "Please rectify the billing error before payment is due.", "G类书信", "IELTS G类 · G类书信表达", "正式投诉", "中级核心", "6-7"],
  ["tenancy", "noun", "租赁期；租约关系", "The tenancy agreement requires one month of notice.", "住房", "IELTS G类 · 住房", "租房合同", "中级核心", "5-6"],
  ["boiler", "noun", "锅炉；热水炉", "The boiler stopped working during winter.", "住房", "IELTS G类 · 住房", "住房维修", "基础高频", "4-5"],
  ["redundancy", "noun", "裁员；冗余", "The company offered training to staff facing redundancy.", "工作", "IELTS G类 · 工作职场", "职场通知", "中级核心", "5-6"],
  ["policyholder", "noun", "投保人；保单持有人", "The policyholder must report damage within fourteen days.", "保险", "IELTS G类 · 金融合同", "保险索赔", "中级核心", "5-6"],
  ["ineligible", "adjective", "不符合资格的", "Applicants without a permit are ineligible.", "规则", "IELTS G类 · 政府公共服务", "资格通知", "中级核心", "5-6"],
  ["verification", "noun", "核验；验证", "Identity verification takes two working days.", "银行", "IELTS G类 · 金融合同", "账户安全", "中级核心", "5-6"],
  ["rota", "noun", "值班表；轮班表", "The new rota gives everyone one free weekend.", "工作", "IELTS G类 · 工作职场", "排班通知", "中级核心", "5-6"],
  ["arrears", "noun", "欠款；拖欠款项", "The tenant arranged to pay the rent arrears.", "住房", "IELTS G类 · 住房", "租房账单", "中级核心", "5-6"],
  ["clarification", "noun", "澄清；说明", "I am writing to request clarification of the charge.", "G类书信", "IELTS G类 · G类书信表达", "询问信", "中级核心", "5-6"],
  ["roadworks", "noun", "道路施工", "Roadworks are causing delays on the airport route.", "交通", "IELTS G类 · 交通旅行", "交通通知", "中级核心", "5-6"],
  ["takeaway", "noun", "外卖；外卖店", "The takeaway replaced our missing meal.", "餐饮", "IELTS G类 · 日常生活", "餐饮服务", "中级核心", "5-6"],
  ["owing", "preposition", "由于；因为", "The event was cancelled owing to bad weather.", "阅读", "IELTS G类 · 抽象实用词", "正式通知", "高级加分", "6-7"]
];

function rowToCandidate(row) {
  const [word, pos, meaningZh, example, topic, category, gTUseCase, difficulty, targetBand] = row;
  const topics = topic.includes(",") ? topic.split(",").map((t) => t.trim()) : [topic];
  return {
    word,
    normalizedHeadword: word.toLowerCase(),
    pos,
    meaningZh,
    definition: example.replace(/^The |^I |^We |^A /, "").slice(0, 80),
    example,
    exampleCn: `与${topics[0]}相关的实用例句。`,
    difficulty,
    category,
    topics,
    targetBand,
    gTUseCase,
    utilityScore: difficulty === "基础高频" ? 9 : difficulty === "高级加分" ? 8 : 7,
    candidateSource: "gt-quality-recovery-v1",
    sourceType: "internal-editorial",
    duplicateCheckResult: "pass"
  };
}

export function buildCuratedPool(existingHeadwords = new Set()) {
  const pool = [];
  const seen = new Set(existingHeadwords);
  const add = (row) => {
    const w = row[0].toLowerCase();
    if (seen.has(w)) return;
    seen.add(w);
    pool.push(rowToCandidate(row));
  };
  for (const row of PRIORITY_KEEP) add(row);
  for (const row of DOMAIN_ROWS) add(row);
  return pool;
}

export function classifyNewWord(entry) {
  const w = String(entry.word || "").toLowerCase();
  if (FORCE_REPLACE.has(w)) return "替换";
  const meaning = String(entry.meaning || "");
  const example = String(entry.example || "");
  if (/^与日常交流相关的词/i.test(meaning)) return "替换";
  if (/^Understanding .+ helps/i.test(example)) return "替换";
  if (/^This word is useful/i.test(example)) return "替换";
  if (/^In daily notices/i.test(example)) return "替换";
  if (/^It is important to know/i.test(example)) return "替换";
  if (/^【/.test(meaning)) return "替换";
  if (/(osaur|platypus|agiotage|booby|duckbill|ornith|monotreme|amoeba|boondoggle)/i.test(w)) return "替换";
  if (/^(banks|billed|billings|busted|editing)$/i.test(w)) return "替换";
  if (KEEP_NEW_WORDS.has(w)) return "保留但重写释义/例句";
  if (/^与日常交流相关的词/i.test(meaning)) return "替换";
  return "保留但重写释义/例句";
}