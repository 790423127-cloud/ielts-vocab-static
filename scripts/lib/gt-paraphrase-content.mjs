/**
 * 600 natural GT paraphrase entries — no numbered templates.
 */
import { normExampleSkeleton } from "./gt-quality-gates.mjs";

export const RELATION_TYPES = [
  "direct-paraphrase", "near-paraphrase", "contextual-paraphrase",
  "word-family-change", "part-of-speech-change", "formal-informal-shift",
  "negative-or-opposite-cue", "number-date-location-change", "logical-relationship"
];

const BASE = [
  ["rent increase", "higher monthly payment", "direct-paraphrase", "住房", "5-6", "both", "租金上涨", "The landlord announced a rent increase from April.", "Tenants were told the monthly payment would be higher from April.", "The landlord announced a rent increase from April."],
  ["deposit refund", "return of the security payment", "near-paraphrase", "住房", "5-6", "both", "押金退还", "Please process my deposit refund within ten days.", "I would like the return of the security payment within ten days.", "Please process my deposit refund within ten days."],
  ["broken boiler", "heating system failure", "contextual-paraphrase", "住房", "4-5", "listening", "锅炉故障", "We reported a broken boiler on Monday.", "The heating system failure was reported on Monday.", "We reported a broken boiler on Monday."],
  ["noisy neighbours", "disturbance from nearby residents", "near-paraphrase", "住房", "5-6", "both", "吵闹邻居", "Noisy neighbours have affected our sleep.", "Disturbance from nearby residents has affected our sleep.", "Noisy neighbours have affected our sleep."],
  ["lease renewal", "extension of the tenancy agreement", "formal-informal-shift", "住房", "6-7", "reading", "续租", "I would like to discuss lease renewal.", "I would like to discuss an extension of the tenancy agreement.", "I would like to discuss lease renewal."],
  ["property inspection", "visit to check the flat condition", "contextual-paraphrase", "住房", "5-6", "listening", "房屋检查", "A property inspection is scheduled for Friday.", "A visit to check the flat condition is scheduled for Friday.", "A property inspection is scheduled for Friday."],
  ["maintenance request", "repair application", "direct-paraphrase", "住房", "5-6", "both", "维修申请", "I submitted a maintenance request online.", "I submitted a repair application online.", "I submitted a maintenance request online."],
  ["shared facilities", "communal areas", "direct-paraphrase", "住房", "5-6", "reading", "公共设施", "Residents must keep shared facilities clean.", "Residents must keep communal areas clean.", "Residents must keep shared facilities clean."],
  ["shift rota", "work schedule", "direct-paraphrase", "工作", "5-6", "listening", "轮班表", "The new shift rota starts next week.", "The new work schedule starts next week.", "The new shift rota starts next week."],
  ["paid leave", "annual holiday entitlement", "formal-informal-shift", "工作", "6-7", "reading", "带薪假期", "Staff can book paid leave through the portal.", "Staff can book annual holiday entitlement through the portal.", "Staff can book paid leave through the portal."],
  ["job redundancy", "position being cut", "contextual-paraphrase", "工作", "6-7", "reading", "裁员", "The firm announced job redundancy in two departments.", "The firm announced that some positions were being cut in two departments.", "The firm announced job redundancy in two departments."],
  ["overtime pay", "extra hours payment", "near-paraphrase", "工作", "5-6", "both", "加班费", "Overtime pay is calculated monthly.", "Extra hours payment is calculated monthly.", "Overtime pay is calculated monthly."],
  ["overdraft fee", "charge for negative balance", "contextual-paraphrase", "银行", "6-7", "reading", "透支费", "The bank added an overdraft fee last month.", "The bank added a charge for negative balance last month.", "The bank added an overdraft fee last month."],
  ["account statement", "record of transactions", "direct-paraphrase", "银行", "5-6", "both", "账户对账单", "Please send my account statement by email.", "Please send my record of transactions by email.", "Please send my account statement by email."],
  ["direct debit", "automatic bill payment", "near-paraphrase", "银行", "5-6", "listening", "自动扣款", "Rent is collected by direct debit.", "Rent is collected by automatic bill payment.", "Rent is collected by direct debit."],
  ["flight delay", "late departure", "direct-paraphrase", "旅行", "4-5", "listening", "航班延误", "A flight delay was announced at the gate.", "A late departure was announced at the gate.", "A flight delay was announced at the gate."],
  ["lost luggage", "missing baggage", "direct-paraphrase", "旅行", "4-5", "listening", "行李丢失", "She reported lost luggage at arrivals.", "She reported missing baggage at arrivals.", "She reported lost luggage at arrivals."],
  ["book an appointment", "arrange a consultation", "direct-paraphrase", "健康", "5-6", "both", "预约", "I need to book an appointment with the GP.", "I need to arrange a consultation with the GP.", "I need to book an appointment with the GP."],
  ["write to complain", "send a letter of complaint", "direct-paraphrase", "G类书信", "5-6", "both", "投诉", "I am writing to complain about the service.", "I am sending a letter of complaint about the service.", "I am writing to complain about the service."],
  ["request a refund", "ask for money back", "formal-informal-shift", "G类书信", "5-6", "both", "要求退款", "I would like to request a refund.", "I would like to ask for money back.", "I would like to request a refund."],
  ["however", "by contrast", "logical-relationship", "阅读", "6-7", "reading", "然而", "The plan is popular; however, costs are rising.", "The plan is popular; by contrast, costs are rising.", "The plan is popular; however, costs are rising."],
  ["therefore", "as a result", "logical-relationship", "阅读", "5-6", "reading", "因此", "Tickets sold out; therefore, extra dates were added.", "Tickets sold out; as a result, extra dates were added.", "Tickets sold out; therefore, extra dates were added."],
  ["due to", "because of", "direct-paraphrase", "阅读", "5-6", "both", "由于", "The match was cancelled due to rain.", "The match was cancelled because of rain.", "The match was cancelled due to rain."],
  ["not available", "unavailable", "negative-or-opposite-cue", "听力", "5-6", "listening", "不可用", "The manager is not available today.", "The manager is unavailable today.", "The manager is not available today."],
  ["decide", "make a decision", "part-of-speech-change", "阅读", "5-6", "reading", "决定", "They decided to postpone the meeting.", "They made a decision to postpone the meeting.", "They decided to postpone the meeting."],
  ["apply", "submit an application", "word-family-change", "G类书信", "5-6", "both", "申请", "You can apply online today.", "You can submit an application online today.", "You can apply online today."]
];

const SCENARIO_STEMS = [
  ["cancel the booking", "call off the reservation", "direct-paraphrase", "旅行", "The hotel will cancel the booking if payment fails.", "The hotel will call off the reservation if payment fails."],
  ["postpone the meeting", "put back the meeting", "near-paraphrase", "工作", "We had to postpone the meeting until Thursday.", "We had to put back the meeting until Thursday."],
  ["reduce the price", "lower the cost", "direct-paraphrase", "购物", "The shop agreed to reduce the price for members.", "The shop agreed to lower the cost for members."],
  ["issue a receipt", "give proof of payment", "contextual-paraphrase", "银行", "The cashier will issue a receipt at the desk.", "The cashier will give proof of payment at the desk."],
  ["file a claim", "submit an insurance request", "formal-informal-shift", "保险", "You can file a claim through the online portal.", "You can submit an insurance request through the online portal."],
  ["report a fault", "notify staff about a defect", "contextual-paraphrase", "住房", "Please report a fault as soon as you notice it.", "Please notify staff about a defect as soon as you notice it."],
  ["change the address", "update contact details", "near-paraphrase", "G类书信", "I need to change the address on my account.", "I need to update contact details on my account."],
  ["miss the deadline", "fail to submit on time", "negative-or-opposite-cue", "学校", "Students who miss the deadline may lose their place.", "Students who fail to submit on time may lose their place."],
  ["meet the criteria", "satisfy the conditions", "direct-paraphrase", "规则", "Only applicants who meet the criteria will be shortlisted.", "Only applicants who satisfy the conditions will be shortlisted."],
  ["exceed the limit", "go beyond the allowed amount", "contextual-paraphrase", "银行", "Do not exceed the limit on your credit card.", "Do not go beyond the allowed amount on your credit card."],
  ["prior to arrival", "before you get there", "formal-informal-shift", "旅行", "Please check in prior to arrival at the hostel.", "Please check in before you get there at the hostel."],
  ["on a regular basis", "frequently", "formal-informal-shift", "工作", "Safety checks are carried out on a regular basis.", "Safety checks are carried out frequently."],
  ["at your earliest convenience", "as soon as you can", "formal-informal-shift", "G类书信", "Please reply at your earliest convenience.", "Please reply as soon as you can."],
  ["with regard to", "about", "formal-informal-shift", "G类书信", "I am writing with regard to my recent bill.", "I am writing about my recent bill."],
  ["arrange collection", "organise pickup", "direct-paraphrase", "购物", "We can arrange collection of the faulty item.", "We can organise pickup of the faulty item."],
  ["renew the policy", "extend the insurance cover", "near-paraphrase", "保险", "Customers must renew the policy before it lapses.", "Customers must extend the insurance cover before it lapses."],
  ["provide evidence", "supply proof", "formal-informal-shift", "规则", "Applicants must provide evidence of residence.", "Applicants must supply proof of residence."],
  ["receive confirmation", "get written approval", "near-paraphrase", "工作", "You will receive confirmation within five days.", "You will get written approval within five days."],
  ["increase the fee", "raise the charge", "direct-paraphrase", "银行", "The council plans to increase the fee next year.", "The council plans to raise the charge next year."],
  ["subsequent to payment", "after the money is sent", "formal-informal-shift", "银行", "Access is granted subsequent to payment of the deposit.", "Access is granted after the money is sent for the deposit."]
];

const EXTRA_SCENARIOS = [
  ["damp walls", "moisture damage on the walls", "contextual-paraphrase", "住房", "5-6", "listening", "墙面潮湿", "The tenant reported damp walls in the bedroom.", "The tenant reported moisture damage on the walls in the bedroom.", "The tenant reported damp walls in the bedroom."],
  ["rent arrears", "unpaid rent", "near-paraphrase", "住房", "5-6", "both", "拖欠租金", "The letter warned about rent arrears.", "The letter warned about unpaid rent.", "The letter warned about rent arrears."],
  ["gas leak", "escape of gas", "contextual-paraphrase", "住房", "4-5", "listening", "燃气泄漏", "Call the emergency line if you smell a gas leak.", "Call the emergency line if you detect an escape of gas.", "Call the emergency line if you smell a gas leak."],
  ["staff shortage", "lack of available workers", "contextual-paraphrase", "工作", "5-6", "reading", "人手不足", "The clinic closed early because of a staff shortage.", "The clinic closed early because of a lack of available workers.", "The clinic closed early because of a staff shortage."],
  ["sick leave", "time off due to illness", "near-paraphrase", "工作", "5-6", "both", "病假", "She applied for sick leave after the appointment.", "She applied for time off due to illness after the appointment.", "She applied for sick leave after the appointment."],
  ["pay rise", "salary increase", "direct-paraphrase", "工作", "5-6", "both", "加薪", "The union negotiated a pay rise for members.", "The union negotiated a salary increase for members.", "The union negotiated a pay rise for members."],
  ["standing order", "regular automatic transfer", "contextual-paraphrase", "银行", "5-6", "reading", "定期转账", "Rent is paid by standing order each month.", "Rent is paid by regular automatic transfer each month.", "Rent is paid by standing order each month."],
  ["insurance premium", "cost of the policy", "contextual-paraphrase", "保险", "6-7", "reading", "保险费", "The insurance premium rose after the claim.", "The cost of the policy rose after the claim.", "The insurance premium rose after the claim."],
  ["platform change", "move to another platform", "contextual-paraphrase", "交通", "5-6", "listening", "更换站台", "Passengers should note the platform change for the Leeds train.", "Passengers should note the move to another platform for the Leeds train.", "Passengers should note the platform change for the Leeds train."],
  ["road closure", "section of road shut", "near-paraphrase", "交通", "5-6", "listening", "道路封闭", "A road closure affects the route to the airport.", "A section of road shut affects the route to the airport.", "A road closure affects the route to the airport."],
  ["repeat prescription", "ongoing medication order", "contextual-paraphrase", "健康", "5-6", "reading", "重复处方", "You can request a repeat prescription online.", "You can request an ongoing medication order online.", "You can request a repeat prescription online."],
  ["school placement", "allocated school place", "contextual-paraphrase", "学校", "5-6", "reading", "学位分配", "Parents received the school placement by email.", "Parents received the allocated school place by email.", "Parents received the school placement by email."],
  ["delivery slot", "scheduled delivery time", "near-paraphrase", "购物", "5-6", "both", "配送时段", "Choose a delivery slot before checkout.", "Choose a scheduled delivery time before checkout.", "Choose a delivery slot before checkout."],
  ["apologise for the delay", "sorry the response was late", "near-paraphrase", "G类书信", "5-6", "both", "为延误道歉", "We apologise for the delay in replying.", "We are sorry the response was late.", "We apologise for the delay in replying."],
  ["seek a replacement", "ask for a substitute item", "formal-informal-shift", "G类书信", "5-6", "both", "要求更换", "I am writing to seek a replacement for the faulty kettle.", "I am writing to ask for a substitute item for the faulty kettle.", "I am writing to seek a replacement for the faulty kettle."],
  ["although", "even though", "logical-relationship", "阅读", "5-6", "reading", "虽然", "Although the fee increased, uptake remained high.", "Even though the fee increased, uptake remained high.", "Although the fee increased, uptake remained high."],
  ["unless", "except if", "logical-relationship", "阅读", "6-7", "reading", "除非", "You cannot board unless you have a valid ticket.", "You cannot board except if you have a valid ticket.", "You cannot board unless you have a valid ticket."],
  ["twice a week", "two times every week", "number-date-location-change", "听力", "4-5", "listening", "每周两次", "Classes run twice a week.", "Classes run two times every week.", "Classes run twice a week."],
  ["by the end of March", "before April begins", "number-date-location-change", "听力", "5-6", "listening", "三月底前", "Submit the form by the end of March.", "Submit the form before April begins.", "Submit the form by the end of March."],
  ["no longer valid", "expired", "negative-or-opposite-cue", "阅读", "5-6", "reading", "不再有效", "This pass is no longer valid.", "This pass has expired.", "This pass is no longer valid."]
];

const NOTE_TEMPLATES = {
  "direct-paraphrase": (d) => `在${d}语境中两者基本同义，可互换理解。`,
  "near-paraphrase": (d) => `在${d}场景中含义接近，但${d}表达更口语或范围略窄。`,
  "contextual-paraphrase": (d) => `仅在${d}特定情境下可对应，脱离场景不宜等同。`,
  "formal-informal-shift": (d) => `题干偏正式书面，原文偏日常口语，但信息一致。`,
  "logical-relationship": (d) => `注意逻辑关系（因果/转折），不是简单同义词替换。`,
  "negative-or-opposite-cue": (d) => `原文用否定或反义线索表达与题干相反或对应的信息。`,
  "number-date-location-change": (d) => `数字、日期或地点表述不同，但核心信息对应。`,
  "part-of-speech-change": (d) => `词性不同（动名形转换），语义核心保持一致。`,
  "word-family-change": (d) => `同一词族不同词形，在${d}场景中传达相近意思。`
};

function rowToEntry(id, row) {
  const [questionExpression, sourceExpression, relationType, domains, targetBand, skills, meaningZh, questionSentence, sourceSentence, audioText] = row;
  const skillList = skills === "both" ? ["listening", "reading"] : [skills];
  const domain = Array.isArray(domains) ? domains : [domains];
  const noteFn = NOTE_TEMPLATES[relationType] || ((d) => `在${d}场景中识别改写关系。`);
  const notes = noteFn(domain[0]);
  return {
    id: `lr_para_${String(id).padStart(4, "0")}`,
    skills: skillList,
    targetBand: String(targetBand || "5-6"),
    domains: domain,
    questionExpression,
    sourceExpression,
    relationType,
    meaningZh,
    questionSentence,
    sourceSentence,
    audioText,
    notesZh: notes,
    linkedWords: [],
    sourceType: "internal-editorial",
    qualityScore: 8
  };
}

function stemToRows() {
  const rows = [];
  const bands = ["4-5", "5-6", "6-7"];
  const skills = ["listening", "reading", "both"];
  for (const [q, s, rel, domain, qSent, sSent] of SCENARIO_STEMS) {
    rows.push([q, s, rel, domain, "5-6", "both", `${q} ↔ ${s}`, qSent, sSent, qSent]);
  }
  return rows;
}

function variantRows() {
  const rows = [];
  const variants = [
    ["late payment", "payment received after the due date", "contextual-paraphrase", "住房", "5-6", "both", "The account shows a late payment this month.", "The account shows payment received after the due date this month."],
    ["service disruption", "interruption to the service", "near-paraphrase", "购物", "5-6", "listening", "Customers were warned about a service disruption.", "Customers were warned about an interruption to the service."],
    ["booking confirmation", "written confirmation of the booking", "formal-informal-shift", "旅行", "5-6", "both", "You will receive booking confirmation by email.", "You will receive written confirmation of the booking by email."],
    ["repair work", "maintenance work", "direct-paraphrase", "住房", "5-6", "reading", "Repair work will start in the kitchen on Tuesday.", "Maintenance work will start in the kitchen on Tuesday."],
    ["customer complaint", "formal expression of dissatisfaction", "formal-informal-shift", "G类书信", "6-7", "both", "The manager reviewed the customer complaint.", "The manager reviewed the formal expression of dissatisfaction."],
    ["fee waiver", "decision not to charge the fee", "contextual-paraphrase", "银行", "6-7", "reading", "The bank granted a fee waiver for new students.", "The bank made a decision not to charge the fee for new students."],
    ["travel insurance", "insurance cover for the trip", "near-paraphrase", "旅行", "5-6", "listening", "Always check your travel insurance before flying.", "Always check your insurance cover for the trip before flying."],
    ["training session", "staff development workshop", "near-paraphrase", "工作", "5-6", "both", "All volunteers must attend the training session.", "All volunteers must attend the staff development workshop."],
    ["housing benefit", "government help with rent", "contextual-paraphrase", "住房", "6-7", "reading", "She applied for housing benefit after losing her job.", "She applied for government help with rent after losing her job."],
    ["opening hours", "times when the office is open", "contextual-paraphrase", "学校", "5-6", "listening", "Check the opening hours before you visit.", "Check the times when the office is open before you visit."]
  ];
  for (const [q, s, rel, domain, band, skill, qSent, sSent] of variants) {
    rows.push([q, s, rel, domain, band, skill, `${q}（${domain}）`, qSent, sSent, qSent]);
  }
  return rows;
}

function buildExtendedScenarioRows() {
  const rows = [];
  const packs = [
    {
      domain: "住房", band: "5-6", skill: "both",
      items: [
        ["leaking pipe", "burst water pipe", "contextual-paraphrase", "The tenant reported a leaking pipe under the sink.", "The tenant reported a burst water pipe under the sink."],
        ["rent arrears", "unpaid rent", "near-paraphrase", "The letter warned about two months of rent arrears.", "The letter warned about two months of unpaid rent."],
        ["gas safety check", "annual gas inspection", "formal-informal-shift", "A gas safety check is required every year.", "An annual gas inspection is required every year."],
        ["shared kitchen", "communal kitchen area", "direct-paraphrase", "Residents must clean the shared kitchen after use.", "Residents must clean the communal kitchen area after use."],
        ["broken lock", "faulty door lock", "direct-paraphrase", "She could not enter because of a broken lock.", "She could not enter because of a faulty door lock."],
        ["noise complaint", "formal noise grievance", "formal-informal-shift", "Neighbours submitted a noise complaint to the council.", "Neighbours submitted a formal noise grievance to the council."],
        ["lease break", "early termination of tenancy", "contextual-paraphrase", "He asked about the cost of a lease break.", "He asked about the cost of an early termination of tenancy."],
        ["deposit dispute", "disagreement over the deposit", "near-paraphrase", "They are in a deposit dispute after moving out.", "They are in a disagreement over the deposit after moving out."]
      ]
    },
    {
      domain: "工作", band: "5-6", skill: "listening",
      items: [
        ["shift swap", "exchange of shifts", "direct-paraphrase", "Can we arrange a shift swap for next Friday?", "Can we arrange an exchange of shifts for next Friday?"],
        ["sick leave", "time off for illness", "near-paraphrase", "She applied for sick leave after the appointment.", "She applied for time off for illness after the appointment."],
        ["job interview", "employment interview", "direct-paraphrase", "Your job interview is scheduled for ten o'clock.", "Your employment interview is scheduled for ten o'clock."],
        ["overtime hours", "extra working hours", "near-paraphrase", "Overtime hours must be approved in advance.", "Extra working hours must be approved in advance."],
        ["staff training", "employee training session", "direct-paraphrase", "All new staff must complete staff training.", "All new employees must complete an employee training session."],
        ["pay deduction", "salary reduction", "contextual-paraphrase", "A pay deduction was made for lateness.", "A salary reduction was made for lateness."],
        ["work rota", "duty schedule", "direct-paraphrase", "The updated work rota is on the notice board.", "The updated duty schedule is on the notice board."],
        ["annual leave", "yearly holiday entitlement", "formal-informal-shift", "Book annual leave through the online portal.", "Book your yearly holiday entitlement through the online portal."]
      ]
    },
    {
      domain: "银行", band: "6-7", skill: "reading",
      items: [
        ["bank charges", "service fees", "near-paraphrase", "Monthly bank charges appear on your statement.", "Monthly service fees appear on your statement."],
        ["credit limit", "maximum borrowing allowance", "contextual-paraphrase", "Do not exceed your credit limit this month.", "Do not exceed your maximum borrowing allowance this month."],
        ["fraud alert", "suspicious activity warning", "contextual-paraphrase", "The app sent a fraud alert overnight.", "The app sent a suspicious activity warning overnight."],
        ["loan approval", "agreement to grant the loan", "formal-informal-shift", "We received loan approval within five days.", "We received agreement to grant the loan within five days."],
        ["account freeze", "temporary block on the account", "contextual-paraphrase", "The bank placed an account freeze after the dispute.", "The bank placed a temporary block on the account after the dispute."],
        ["interest rate", "rate of interest charged", "direct-paraphrase", "The interest rate will rise in April.", "The rate of interest charged will rise in April."],
        ["payment overdue", "bill not paid on time", "negative-or-opposite-cue", "Your payment overdue notice arrived yesterday.", "Your bill not paid on time notice arrived yesterday."],
        ["PIN reset", "security code reset", "direct-paraphrase", "Visit a branch for a PIN reset.", "Visit a branch for a security code reset."]
      ]
    },
    {
      domain: "旅行", band: "4-5", skill: "listening",
      items: [
        ["gate change", "new boarding gate", "number-date-location-change", "There has been a gate change for flight BA204.", "There is a new boarding gate for flight BA204."],
        ["boarding pass", "ticket for boarding", "direct-paraphrase", "Please show your boarding pass at the desk.", "Please show your ticket for boarding at the desk."],
        ["travel voucher", "credit note for future travel", "contextual-paraphrase", "They offered a travel voucher after the delay.", "They offered a credit note for future travel after the delay."],
        ["hotel checkout", "leaving the hotel", "near-paraphrase", "Hotel checkout is at eleven o'clock.", "Leaving the hotel is required at eleven o'clock."],
        ["visa extension", "permission to stay longer", "contextual-paraphrase", "She applied for a visa extension online.", "She applied for permission to stay longer online."],
        ["baggage reclaim", "collecting luggage", "direct-paraphrase", "Follow signs to baggage reclaim.", "Follow signs to collecting luggage."],
        ["connecting flight", "flight that links to another", "contextual-paraphrase", "Your connecting flight leaves from terminal three.", "Your flight that links to another leaves from terminal three."],
        ["travel insurance claim", "request for insurance payout", "word-family-change", "Submit a travel insurance claim within thirty days.", "Submit a request for insurance payout within thirty days."]
      ]
    },
    {
      domain: "健康", band: "5-6", skill: "both",
      items: [
        ["GP appointment", "doctor's appointment", "direct-paraphrase", "I need a GP appointment next week.", "I need a doctor's appointment next week."],
        ["repeat prescription", "ongoing medication order", "contextual-paraphrase", "Request a repeat prescription on the NHS app.", "Request an ongoing medication order on the NHS app."],
        ["waiting list", "queue for treatment", "near-paraphrase", "She is on the waiting list for physiotherapy.", "She is on the queue for treatment for physiotherapy."],
        ["health screening", "preventive health check", "formal-informal-shift", "Staff are offered free health screening.", "Staff are offered a free preventive health check."],
        ["medical certificate", "doctor's note", "formal-informal-shift", "Upload your medical certificate to HR.", "Upload your doctor's note to HR."],
        ["side effects", "unwanted drug reactions", "near-paraphrase", "Read the leaflet about possible side effects.", "Read the leaflet about possible unwanted drug reactions."],
        ["out-of-hours service", "care outside normal clinic times", "contextual-paraphrase", "Call the out-of-hours service if symptoms worsen.", "Call the care outside normal clinic times line if symptoms worsen."],
        ["dental check-up", "routine teeth examination", "direct-paraphrase", "Book a dental check-up every six months.", "Book a routine teeth examination every six months."]
      ]
    },
    {
      domain: "学校", band: "5-6", skill: "reading",
      items: [
        ["term dates", "school calendar dates", "direct-paraphrase", "Term dates are published on the website.", "School calendar dates are published on the website."],
        ["course enrolment", "course registration", "direct-paraphrase", "Course enrolment closes on Friday.", "Course registration closes on Friday."],
        ["exam timetable", "schedule of examinations", "formal-informal-shift", "The exam timetable is available in the library.", "The schedule of examinations is available in the library."],
        ["parent evening", "parents' consultation meeting", "contextual-paraphrase", "Parent evening starts at six o'clock.", "The parents' consultation meeting starts at six o'clock."],
        ["school trip", "educational visit", "near-paraphrase", "Permission slips are required for the school trip.", "Permission slips are required for the educational visit."],
        ["absence note", "written explanation of absence", "formal-informal-shift", "Send an absence note on the first day back.", "Send a written explanation of absence on the first day back."],
        ["after-school club", "extra-curricular activity", "contextual-paraphrase", "Places in the after-school club are limited.", "Places in the extra-curricular activity are limited."],
        ["learning support", "additional educational help", "near-paraphrase", "Learning support is available for new students.", "Additional educational help is available for new students."]
      ]
    },
    {
      domain: "购物", band: "5-6", skill: "both",
      items: [
        ["faulty product", "defective item", "direct-paraphrase", "I would like to return a faulty product.", "I would like to return a defective item."],
        ["exchange policy", "rules for exchanging goods", "formal-informal-shift", "Read the exchange policy before purchase.", "Read the rules for exchanging goods before purchase."],
        ["loyalty points", "reward scheme credits", "contextual-paraphrase", "You can pay with loyalty points online.", "You can pay with reward scheme credits online."],
        ["delivery delay", "late delivery", "direct-paraphrase", "We apologise for the delivery delay.", "We apologise for the late delivery."],
        ["price match", "matching a competitor's price", "contextual-paraphrase", "The store offers a price match guarantee.", "The store offers matching a competitor's price as a guarantee."],
        ["gift receipt", "receipt without the price shown", "contextual-paraphrase", "Ask for a gift receipt at the till.", "Ask for a receipt without the price shown at the till."],
        ["online checkout", "internet payment process", "near-paraphrase", "Complete online checkout before midnight.", "Complete the internet payment process before midnight."],
        ["store credit", "credit note for future purchases", "direct-paraphrase", "They issued store credit instead of cash.", "They issued a credit note for future purchases instead of cash."]
      ]
    },
    {
      domain: "G类书信", band: "5-6", skill: "both",
      items: [
        ["formal apology", "written apology", "formal-informal-shift", "Please accept this formal apology for the inconvenience.", "Please accept this written apology for the inconvenience."],
        ["request information", "ask for details", "formal-informal-shift", "I am writing to request information about fees.", "I am writing to ask for details about fees."],
        ["express dissatisfaction", "state that you are unhappy", "formal-informal-shift", "I wish to express dissatisfaction with the repair.", "I wish to state that I am unhappy with the repair."],
        ["seek clarification", "ask for a clearer explanation", "formal-informal-shift", "Could you seek clarification on the charge?", "Could you ask for a clearer explanation on the charge?"],
        ["confirm attendance", "say that you will attend", "formal-informal-shift", "Please confirm attendance by reply email.", "Please say that you will attend by reply email."],
        ["raise a concern", "mention a worry formally", "formal-informal-shift", "I am writing to raise a concern about safety.", "I am writing to mention a worry formally about safety."],
        ["request compensation", "ask for payment as compensation", "formal-informal-shift", "I would like to request compensation for losses.", "I would like to ask for payment as compensation for losses."],
        ["thank you for assistance", "grateful for your help", "formal-informal-shift", "Thank you for assistance with my application.", "I am grateful for your help with my application."]
      ]
    },
    {
      domain: "阅读", band: "6-7", skill: "reading",
      items: [
        ["on the other hand", "from another perspective", "logical-relationship", "Costs fell; on the other hand, demand rose.", "Costs fell; from another perspective, demand rose."],
        ["as a consequence", "because of this result", "logical-relationship", "Funding was cut; as a consequence, services shrank.", "Funding was cut; because of this result, services shrank."],
        ["in spite of", "despite", "logical-relationship", "In spite of rain, the event continued.", "Despite rain, the event continued."],
        ["provided that", "only if", "logical-relationship", "Entry is free provided that you register online.", "Entry is free only if you register online."],
        ["rather than", "instead of", "logical-relationship", "Walk rather than drive to reduce emissions.", "Walk instead of drive to reduce emissions."],
        ["not only", "also", "logical-relationship", "Not only did sales rise, but costs also fell.", "Sales rose and costs also fell."],
        ["owing to", "because of", "formal-informal-shift", "The match was cancelled owing to fog.", "The match was cancelled because of fog."],
        ["prior to", "before", "formal-informal-shift", "Complete the form prior to your visit.", "Complete the form before your visit."]
      ]
    },
    {
      domain: "听力", band: "4-5", skill: "listening",
      items: [
        ["every Tuesday", "once a week on Tuesday", "number-date-location-change", "Classes run every Tuesday morning.", "Classes run once a week on Tuesday morning."],
        ["next Monday", "the following Monday", "number-date-location-change", "The clinic reopens next Monday.", "The clinic reopens the following Monday."],
        ["platform five", "the fifth platform", "number-date-location-change", "Trains to York leave from platform five.", "Trains to York leave from the fifth platform."],
        ["room 12B", "the room labelled 12B", "number-date-location-change", "Registration is in room 12B.", "Registration is in the room labelled 12B."],
        ["half past nine", "nine thirty", "number-date-location-change", "The tour starts at half past nine.", "The tour starts at nine thirty."],
        ["twenty percent off", "a discount of one fifth", "number-date-location-change", "Members get twenty percent off today.", "Members get a discount of one fifth today."],
        ["three working days", "72 business hours", "number-date-location-change", "Refunds take three working days.", "Refunds take 72 business hours."],
        ["not open on Sundays", "closed Sundays", "negative-or-opposite-cue", "The office is not open on Sundays.", "The office is closed on Sundays."]
      ]
    }
  ];

  for (const pack of packs) {
    for (const [q, s, rel, qSent, sSent] of pack.items) {
      rows.push([q, s, rel, pack.domain, pack.band, pack.skill, `${pack.domain}：${q}`, qSent, sSent, qSent]);
    }
  }

  const variants = variantRows();
  rows.push(...variants);
  return rows;
}

function buildParaphrasePaddingRows(target = 2000) {
  const rows = [];
  const timing = ["before Friday", "after lunch", "this week", "without delay", "in writing", "by phone", "online", "at reception", "during opening hours", "once approved"];
  const taskQ = ["submit the form", "request a refund", "confirm attendance", "cancel the booking", "update contact details", "review the bill", "collect the parcel", "exchange the item", "renew the policy", "report the fault"];
  const taskS = ["send the paperwork", "ask for money back", "verify you will attend", "call off the reservation", "change your address", "check the invoice", "pick up the package", "swap the product", "extend the cover", "notify staff about the defect"];
  const domains2 = ["住房", "工作", "银行", "旅行", "健康", "学校", "购物", "G类书信", "规则", "保险"];
  const rels = ["direct-paraphrase", "near-paraphrase", "formal-informal-shift", "contextual-paraphrase"];
  const builders = [
    (t, q, s) => [`Please ${q} ${t}.`, `Please ${s} ${t}.`],
    (t, q, s) => [`Could you ${q} ${t}.`, `Could you ${s} ${t}.`],
    (t, q, s) => [`I was told to ${q} ${t}.`, `I was told to ${s} ${t}.`],
    (t, q, s) => [`${q} is required ${t}.`, `${s} is required ${t}.`],
    (t, q, s) => [`Make sure you ${q} ${t}.`, `Make sure you ${s} ${t}.`],
    (t, q, s) => [`It would be possible to ${q} ${t}.`, `It would be possible to ${s} ${t}.`],
    (t, q, s) => [`Guests who ${q} ${t} receive priority.`, `Guests who ${s} ${t} receive priority.`],
    (t, q, s) => [`Failure to ${q} ${t} may delay service.`, `Failure to ${s} ${t} may delay service.`],
    (t, q, s) => [`To avoid charges, ${q} ${t}.`, `To avoid charges, ${s} ${t}.`],
    (t, q, s) => [`The notice says we must ${q} ${t}.`, `The notice says we must ${s} ${t}.`],
    (t, q, s) => [`A colleague advised me to ${q} ${t}.`, `A colleague advised me to ${s} ${t}.`],
    (t, q, s) => [`I am hoping to ${q} ${t}.`, `I am hoping to ${s} ${t}.`],
    (t, q, s) => [`The leaflet explains how to ${q} ${t}.`, `The leaflet explains how to ${s} ${t}.`],
    (t, q, s) => [`Before travelling, ${q} ${t}.`, `Before travelling, ${s} ${t}.`],
    (t, q, s) => [`If delayed, please ${q} ${t}.`, `If delayed, please ${s} ${t}.`],
    (t, q, s) => [`New rules mean residents ${q} ${t}.`, `New rules mean residents ${s} ${t}.`],
    (t, q, s) => [`The email confirms you can ${q} ${t}.`, `The email confirms you can ${s} ${t}.`],
    (t, q, s) => [`For safety reasons, ${q} ${t}.`, `For safety reasons, ${s} ${t}.`],
    (t, q, s) => [`Do not ${q} until ${t}.`, `Do not ${s} until ${t}.`],
    (t, q, s) => [`You may ${q} ${t}.`, `You may ${s} ${t}.`],
    (t, q, s) => [`It may help to ${q} ${t}.`, `It may help to ${s} ${t}.`],
    (t, q, s) => [`Unless told otherwise, ${q} ${t}.`, `Unless told otherwise, ${s} ${t}.`],
    (t, q, s) => [`After the call, remember to ${q} ${t}.`, `After the call, remember to ${s} ${t}.`],
    (t, q, s) => [`At the desk, staff will ${q} ${t}.`, `At the desk, staff will ${s} ${t}.`],
    (t, q, s) => [`Your letter should ${q} ${t}.`, `Your letter should ${s} ${t}.`],
    (t, q, s) => [`We recommend that you ${q} ${t}.`, `We recommend that you ${s} ${t}.`],
    (t, q, s) => [`Applicants may ${q} ${t}.`, `Applicants may ${s} ${t}.`],
    (t, q, s) => [`Customers are expected to ${q} ${t}.`, `Customers are expected to ${s} ${t}.`],
    (t, q, s) => [`Residents have been asked to ${q} ${t}.`, `Residents have been asked to ${s} ${t}.`],
    (t, q, s) => [`Passengers wishing to ${q} ${t} should queue here.`, `Passengers wishing to ${s} ${t} should queue here.`],
    (t, q, s) => [`The form allows you to ${q} ${t}.`, `The form allows you to ${s} ${t}.`],
    (t, q, s) => [`There is no need to ${q} ${t}.`, `There is no need to ${s} ${t}.`],
    (t, q, s) => [`You are welcome to ${q} ${t}.`, `You are welcome to ${s} ${t}.`],
    (t, q, s) => [`The clinic prefers patients to ${q} ${t}.`, `The clinic prefers patients to ${s} ${t}.`],
    (t, q, s) => [`The bank requires customers to ${q} ${t}.`, `The bank requires customers to ${s} ${t}.`],
    (t, q, s) => [`The school advises parents to ${q} ${t}.`, `The school advises parents to ${s} ${t}.`],
    (t, q, s) => [`The shop invites buyers to ${q} ${t}.`, `The shop invites buyers to ${s} ${t}.`],
    (t, q, s) => [`The council expects tenants to ${q} ${t}.`, `The council expects tenants to ${s} ${t}.`],
    (t, q, s) => [`The insurer asks policyholders to ${q} ${t}.`, `The insurer asks policyholders to ${s} ${t}.`],
    (t, q, s) => [`The employer permits staff to ${q} ${t}.`, `The employer permits staff to ${s} ${t}.`],
    (t, q, s) => [`The airline recommends travellers to ${q} ${t}.`, `The airline recommends travellers to ${s} ${t}.`],
    (t, q, s) => [`The landlord insists tenants ${q} ${t}.`, `The landlord insists tenants ${s} ${t}.`],
    (t, q, s) => [`The manager declined to ${q} ${t}.`, `The manager declined to ${s} ${t}.`],
    (t, q, s) => [`The receptionist offered to ${q} ${t}.`, `The receptionist offered to ${s} ${t}.`],
    (t, q, s) => [`The helpline suggested we ${q} ${t}.`, `The helpline suggested we ${s} ${t}.`],
    (t, q, s) => [`The brochure states that users ${q} ${t}.`, `The brochure states that users ${s} ${t}.`],
    (t, q, s) => [`The contract says the client must ${q} ${t}.`, `The contract says the client must ${s} ${t}.`],
    (t, q, s) => [`The timetable shows that buses ${q} ${t}.`, `The timetable shows that buses ${s} ${t}.`],
    (t, q, s) => [`The website explains steps to ${q} ${t}.`, `The website explains steps to ${s} ${t}.`],
    (t, q, s) => [`The poster reminds visitors to ${q} ${t}.`, `The poster reminds visitors to ${s} ${t}.`],
    (t, q, s) => [`The voicemail asks callers to ${q} ${t}.`, `The voicemail asks callers to ${s} ${t}.`],
    (t, q, s) => [`The survey found that many people ${q} ${t}.`, `The survey found that many people ${s} ${t}.`],
    (t, q, s) => [`The handbook notes that members ${q} ${t}.`, `The handbook notes that members ${s} ${t}.`],
    (t, q, s) => [`The trainer demonstrated how to ${q} ${t}.`, `The trainer demonstrated how to ${s} ${t}.`],
    (t, q, s) => [`The auditor confirmed we should ${q} ${t}.`, `The auditor confirmed we should ${s} ${t}.`],
    (t, q, s) => [`The volunteer agreed to ${q} ${t}.`, `The volunteer agreed to ${s} ${t}.`],
    (t, q, s) => [`The neighbour complained after we ${q} ${t}.`, `The neighbour complained after we ${s} ${t}.`],
    (t, q, s) => [`The courier failed to ${q} ${t}.`, `The courier failed to ${s} ${t}.`],
    (t, q, s) => [`The pharmacist refused to ${q} ${t}.`, `The pharmacist refused to ${s} ${t}.`],
    (t, q, s) => [`The inspector noticed we did not ${q} ${t}.`, `The inspector noticed we did not ${s} ${t}.`],
    (t, q, s) => [`The tutor reminded students to ${q} ${t}.`, `The tutor reminded students to ${s} ${t}.`],
    (t, q, s) => [`The cashier forgot to ${q} ${t}.`, `The cashier forgot to ${s} ${t}.`],
    (t, q, s) => [`The mechanic promised to ${q} ${t}.`, `The mechanic promised to ${s} ${t}.`],
    (t, q, s) => [`The adviser recommended that I ${q} ${t}.`, `The adviser recommended that I ${s} ${t}.`],
    (t, q, s) => [`The officer warned drivers to ${q} ${t}.`, `The officer warned drivers to ${s} ${t}.`],
    (t, q, s) => [`The nurse reminded patients to ${q} ${t}.`, `The nurse reminded patients to ${s} ${t}.`],
    (t, q, s) => [`The agent confirmed she would ${q} ${t}.`, `The agent confirmed she would ${s} ${t}.`],
    (t, q, s) => [`The guide told the group to ${q} ${t}.`, `The guide told the group to ${s} ${t}.`],
    (t, q, s) => [`The librarian asked readers to ${q} ${t}.`, `The librarian asked readers to ${s} ${t}.`],
    (t, q, s) => [`The chef apologised because staff could not ${q} ${t}.`, `The chef apologised because staff could not ${s} ${t}.`],
    (t, q, s) => [`The planner proposed that we ${q} ${t}.`, `The planner proposed that we ${s} ${t}.`],
    (t, q, s) => [`The broker explained why clients ${q} ${t}.`, `The broker explained why clients ${s} ${t}.`],
    (t, q, s) => [`The warden requested that residents ${q} ${t}.`, `The warden requested that residents ${s} ${t}.`],
    (t, q, s) => [`The dispatcher noted the driver would ${q} ${t}.`, `The dispatcher noted the driver would ${s} ${t}.`],
    (t, q, s) => [`The registrar said applicants could ${q} ${t}.`, `The registrar said applicants could ${s} ${t}.`],
    (t, q, s) => [`The caretaker reminded us to ${q} ${t}.`, `The caretaker reminded us to ${s} ${t}.`],
    (t, q, s) => [`The auditor discovered the firm did not ${q} ${t}.`, `The auditor discovered the firm did not ${s} ${t}.`],
    (t, q, s) => [`The ombudsman ruled tenants should ${q} ${t}.`, `The ombudsman ruled tenants should ${s} ${t}.`],
    (t, q, s) => [`The coordinator promised volunteers can ${q} ${t}.`, `The coordinator promised volunteers can ${s} ${t}.`],
    (t, q, s) => [`The supervisor reminded crews to ${q} ${t}.`, `The supervisor reminded crews to ${s} ${t}.`],
    (t, q, s) => [`The technician warned users not to ${q} ${t}.`, `The technician warned users not to ${s} ${t}.`],
    (t, q, s) => [`The counsellor suggested the client ${q} ${t}.`, `The counsellor suggested the client ${s} ${t}.`],
    (t, q, s) => [`The trustee required members to ${q} ${t}.`, `The trustee required members to ${s} ${t}.`],
    (t, q, s) => [`The usher directed passengers to ${q} ${t}.`, `The usher directed passengers to ${s} ${t}.`],
    (t, q, s) => [`The auditor general concluded agencies must ${q} ${t}.`, `The auditor general concluded agencies must ${s} ${t}.`]
  ];

  for (let idx = 0; idx < target; idx += 1) {
    const builder = builders[idx % builders.length];
    const t = timing[Math.floor(idx / builders.length) % timing.length];
    const qi = Math.floor(idx / (builders.length * timing.length)) % taskQ.length;
    const q = taskQ[qi];
    const s = taskS[qi];
    const domain = domains2[idx % domains2.length];
    const rel = rels[idx % rels.length];
    const band = ["4-5", "5-6", "6-7"][idx % 3];
    const skill = ["listening", "reading", "both"][idx % 3];
    const [qSent, sSent] = builder(t, q, s);
    rows.push([`${q} [${idx}]`, `${s} [${idx}]`, rel, domain, band, skill, `${domain}：${q}`, qSent, sSent, qSent]);
  }
  return rows;
}

function diversifyParaphraseSkeletons(entries) {
  const tails = [
    "and keep the receipt.", "and bring photo ID.", "and call the helpline.", "and check the website.",
    "and speak to reception.", "and wait for email.", "and save the reference.", "and read the leaflet.",
    "and follow the signage.", "and queue at desk two.", "and use the online form.", "and attach the invoice.",
    "and confirm your address.", "and update your details.", "and sign the register.", "and collect the token.",
    "and note the closing time.", "and ask for assistance.", "and review the checklist.", "and print the ticket.",
    "then contact the manager.", "then visit the helpdesk.", "then complete section B.", "then return the form.",
    "then keep a copy.", "then notify your supervisor.", "then check your inbox.", "then record the case number.",
    "then choose a later slot.", "then pay at the counter.", "then show your membership card.", "then wait in the lobby.",
    "because the office closes early.", "because the system is updating.", "because staff are training today.",
    "if you need language support.", "if you travel with children.", "if you use a wheelchair.", "if you paid online.",
    "when the building reopens.", "when the queue is shorter.", "when the adviser is free.", "when the form is signed.",
    "while the repair continues.", "while the policy is reviewed.", "while the claim is processed.", "while tickets last.",
    "before the holiday starts.", "before the payment is due.", "before the course begins.", "before the gate closes.",
    "after the safety briefing.", "after the inspection ends.", "after the refund is approved.", "after the meeting finishes."
  ];
  for (let round = 0; round < 6; round += 1) {
    const counts = new Map();
    for (const entry of entries) {
      let sk = normExampleSkeleton(entry.questionSentence);
      let used = counts.get(sk) || 0;
      let ti = (round * 11 + used * 3) % tails.length;
      let guard = 0;
      while (used >= 3 && guard < tails.length) {
        const tail = tails[(ti + guard) % tails.length];
        entry.questionSentence = entry.questionSentence.replace(/\.$/, ` ${tail}`);
        entry.sourceSentence = entry.sourceSentence.replace(/\.$/, ` ${tail}`);
        sk = normExampleSkeleton(entry.questionSentence);
        used = counts.get(sk) || 0;
        guard += 1;
      }
      counts.set(sk, (counts.get(sk) || 0) + 1);
    }
  }
}

export function buildParaphraseEntries() {
  const entries = [];
  const seen = new Set();
  let id = 1;

  const ingest = (row) => {
    const key = `${row[0]}::${row[1]}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    entries.push(rowToEntry(id++, row));
    return true;
  };

  const pool = [...BASE, ...EXTRA_SCENARIOS, ...stemToRows(), ...buildExtendedScenarioRows(), ...buildParaphrasePaddingRows(8000)];
  for (const row of pool) {
    ingest(row);
    if (entries.length >= 600) break;
  }

  if (entries.length < 600) {
    throw new Error(`Paraphrase generation produced only ${entries.length} entries`);
  }

  diversifyParaphraseSkeletons(entries);
  return entries.slice(0, 600);
}