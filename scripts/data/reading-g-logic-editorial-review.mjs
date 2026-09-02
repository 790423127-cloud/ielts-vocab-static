/**
 * Human editorial review for the G-reading logic120 layer.
 *
 * The explanations follow the same common-sense-first standard as the main
 * lexicon's manual meaning review: explain the semantic scope first, then add
 * the grammatical frame, register, common alternative sense or a high-risk
 * distinction where it materially helps the learner. A paraphrased gloss,
 * morphology label, collocation list or example restatement is not sufficient.
 * Sources used for the review are recorded by the applying script in the
 * vocabulary metadata.
 */

export const LOGIC_DETAIL_PATCHES = Object.freeze({
  "according to": "用于标明信息、规则或观点的来源，结构是 according to + 人、文件或资料。它只表示“来源如此说”，不自动表示作者赞同；正式表达个人观点时一般不用 according to me。",
  "account for": "在逻辑链中可表示“解释……的原因”，也可表示某部分“占”整体的比例，后接名词、代词或数量。阅读时要根据宾语判断是在说明原因，还是在说明构成比例。",
  "along with": "用于补充与前项一起出现的人或事物，后接名词或 -ing 形式。它是附加关系而非完全并列；当 along with 插入主语后时，谓语通常仍与前面的主语保持一致。",
  "apart from": "可表示排除关系“除……以外”，也可表示补充关系“除了……还”，具体含义取决于上下文。后面通常接名词、代词或 -ing 形式，阅读时要判断它是在缩小范围还是增加信息。",
  "arise from": "表示某个问题、结果或情况“由……产生”，逻辑方向是结果 arise from 原因。arise 是不及物动词，通常不用于被动语态；不要与表示“导致”的 result in 混淆。",
  "as a consequence": "用于从前文原因推出后果，属于连接副词短语。连接两个完整句时，前面宜用句号或分号，短语后通常加逗号；后句必须是前文能够合理导致的结果。",
  "as a result": "用于明确标记“前因→后果”，后面引出结果而不是原因。连接两个完整句时不能只靠逗号，宜写成前句句号或分号 + as a result, + 后句。",
  "as long as": "主要引出充分条件，表示“只要某条件成立，结果就成立”，后接完整从句。它也可以表示时间长度“和……一样久”，需要根据是否在谈条件或持续时间来判断。",
  "as well as": "表示在前项基础上再补充一项，后接与前项平行的名词、短语或 -ing 形式。它不总等同于 and；连接主语时，谓语通常由前面的主语决定。",
  "at least": "表示数量或程度的下限“至少”，也可用于让判断更保守，表示“无论其他方面如何，最低可以确认这一点”。阅读数字和结论时，它提示实际值可能更高。",
  "at most": "表示数量、时间或程度的上限“至多”，提示实际值不会超过所给范围。它与 at least 的逻辑方向相反，做信息匹配时要特别注意上下界。",
  "at the same time": "既可表示两个事件同时发生，也可引出与前句并存的另一面，近似“与此同时／但同时”。用于平衡观点时常置于句首并加逗号，后句不是推翻前句，而是补充一个需要同时考虑的事实。",
  "because of": "引出原因，后接名词、代词或 -ing 形式，而不是直接接完整的主谓从句。若后面是完整从句，应使用 because；逻辑方向是结果 because of 原因。",
  "by contrast": "用于把前后两个对象或情况作鲜明对比，通常置于新句句首并加逗号。前文应有清楚的比较对象，后句突出相反或明显不同的特征。",
  "by the time": "引出一个作为截止点的时间从句，表示“到……的时候，另一动作已经或将已经发生”。主句常使用完成时，阅读时它提示两个事件的先后关系而非简单同时发生。",
  "compared to": "用于建立比较关系，后接比较对象；既可以强调相似，也可以一般性比较差异。句首的 Compared to ... 是省略结构，后面通常加逗号，主句主语必须能与该对象合理比较。",
  "compared with": "用于把一个对象与另一对象进行较明确的对照，现代用法中与 compared to 多有重叠。置于句首时后面通常加逗号，并应避免比较对象不对等。",
  "depending on": "表示结果会随某个条件、因素或选择而变化，结构是 depending on + 名词、疑问从句等。它强调“不是固定答案”，而是由后接因素决定。",
  "due to": "引出原因，通常后接名词、代词或 -ing 形式，正式语境中常见于 be due to 结构。它不能像 because 那样直接接完整从句；阅读时逻辑方向是结果 due to 原因。",
  "even if": "引出假设性的让步条件，意思是“即使这种情况发生，主句结果仍不改变”。它关注尚未确定的可能情况；与说明已知事实的 even though 不同。",
  "even though": "引出已经成立或被视为事实的让步信息，随后主句给出与通常预期相反的结果。它本身已包含让步关系，主句前不要再叠加 but。",
  "except for": "用于排除某个人或事物，也可在总体判断后补充一个例外，后接名词、代词或 -ing 形式。它常把绝对结论限定为“除这一点外都成立”。",
  "for example": "用于从前面的概括中引出一个能证明该观点的具体实例，不用于推出结论。置于句首时通常写 For example,；插入句中时要用逗号清楚隔开。",
  "for instance": "与 for example 一样，用于把抽象类别或观点落实为一个代表性实例。例子必须直接属于前述范围；它是举例关系，不等于原因或结果关系。",
  "for this reason": "回指前文已经说明的原因，并据此引出结果、判断或建议。通常置于新句句首并加逗号；如果前文没有明确理由，this 的指向就会不清楚。",
  "in addition": "用于在同一论点下补充并列信息，置于句首时后加逗号。in addition to 后接名词或 -ing 形式，而单独的 In addition, 后面接完整句，两种结构不要混用。",
  "in case": "引出为了防备某种可能情况而采取的措施，逻辑是“先做 A，以防 B”，不等同于普通条件 if。后接完整从句，常见于通知、安全说明和安排。",
  "in comparison with": "明确给出比较标准，结构是 in comparison with + 名词或名词短语。置于句首时后面通常加逗号，主句说明相对于该标准更高、更低或不同。",
  "in contrast": "用于引出与前文相反或明显不同的情况，单独作句子连接语时常写 In contrast,。若直接带比较对象，可用 in contrast to/with + 名词。",
  "in general": "用于概括大多数情况或总体趋势，同时保留可能存在例外的空间。它不是绝对判断；置于句首时通常加逗号，适合总结一组事实后的普遍结论。",
  "in other words": "用于重述、简化或澄清刚才的信息，后句应与前句含义基本等值，而不是增加一个新论点。通常置于新句句首并加逗号。",
  "in particular": "从前述较大范围中突出一个尤其重要或相关的成员，表示“尤其是”。它强调子集或重点，不能在没有上位范围时随意引入无关信息。",
  "in spite of": "引出让步背景，后接名词、代词或 -ing 形式，表示该阻碍没有改变主句结果。若后面是完整从句，应使用 in spite of the fact that 或 although，而不是直接接主谓句。",
  "in summary": "用于压缩并重述前文的主要信息，常见于段落或全文收束处。后面不应突然加入尚未论证的新理由，而应概括已经出现的要点。",
  "in terms of": "把判断限制在某一个维度，表示“就……方面而言”，后接名词或 -ing 形式。它帮助读者明确比较标准，但如果后接内容过于笼统，会使论述显得空泛。",
  "in the absence of": "表示在缺少某人、事物、证据或条件时出现的情况，后接名词或名词短语。它建立的是“缺失条件→结果”的背景关系。",
  "in the event of": "正式地表示“如果发生某事”，后接名词或名词短语，常见于规则、保险和紧急通知。若要接完整从句，通常改用 if；它不表示该事件已经发生。",
  "lead to": "表示某个原因、行为或趋势导致某种结果，结构是 cause leads to result，to 后接名词或 -ing 形式。阅读时不要与“道路通向某地”的空间义混淆。",
  "no less than": "可表示数量下限“不少于”，也可用来强调数量之大，近似“竟有……之多”。语境决定它是客观边界还是强调语气，不要与 no more than 方向混淆。",
  "no more than": "可表示数量上限“不超过”，也可表示“仅仅”，带有数量少的强调。阅读时要结合语气判断是客观限制还是作者认为该数量不大。",
  "not only but also": "把两个同方向信息组成递进关系，强调后项，规范结构是 not only A but also B。A 与 B 应保持语法平行；Not only 置于句首连接分句时，前一分句通常需要倒装。",
  "on condition that": "正式地引出必要条件，后接完整从句，表示只有满足该条件，主句承诺或结果才成立。常见于合同、许可和规则说明。",
  "on the contrary": "用于直接纠正或反驳前面的否定或判断，意思是“事实恰好相反”。它不是普通的“另一方面”；只是补充另一面时应使用 on the other hand。",
  "on the other hand": "用于呈现同一问题的另一面或另一种权衡，并不一定否定前句。常与 on the one hand 呼应，也可单独使用；置于句首时后面通常加逗号。",
  "only if": "引出结果成立所必需的条件，A only if B 表示“没有 B 就没有 A”。它比 if 的限制更强，阅读时要分清必要条件与充分条件的方向。",
  "owing to": "较正式地引出原因，后接名词、代词或 -ing 形式，功能接近 because of。它不能直接接完整主谓从句，逻辑方向是结果 owing to 原因。",
  "prior to": "正式地表示“在……之前”，后接名词、时间或 -ing 形式，常见于通知和程序说明。它标记时间先后，日常表达通常可用 before。",
  "provided that": "引出主句成立的明确条件，后接完整从句，语气较正式，近似“只要／前提是”。它常用于许可、规则或带条件的判断。",
  "providing that": "与 provided that 基本同义，用于引出主句成立的条件，后接完整从句。语气通常比 provided that 稍自然，但两者在多数语境中可以互换。",
  "rather than": "表示选择、偏好或替代，意思是“而不是”，连接的两部分应尽量保持语法平行。它可以连接名词、动词原形或 -ing 形式，具体形式取决于前面的结构。",
  "regardless of": "表示后接因素不会改变主句结果，后接名词、代词、疑问词从句或 -ing 形式。它建立“无论该条件如何，结果仍成立”的让步关系。",
  "result from": "表示“结果由某原因造成”，逻辑方向是 result results from cause。它与 result in 正好相反，阅读因果句时应看清 from 后面是原因。",
  "result in": "表示“原因导致某结果”，逻辑方向是 cause results in result，后接名词或 -ing 形式。它与 result from 正好相反。",
  "so that": "主要引出目的，表示采取前项行动是为了实现后项结果，后接完整从句，常与 can、could、will 等情态动词连用。部分语境也可表示实际结果，要结合上下文判断。",
  "subject to": "表示某事受条件、批准、规则或可用情况限制，后接名词或 -ing 形式。它提示前面的承诺并非绝对成立，而要看后接条件是否满足。",
  "such as": "用于列举前述类别中的代表成员，后接名词或短语，通常不引出完整句。它给的是例子而非完整清单，也不承担因果关系。",
  "that is": "用于把前文说得更准确、具体或易懂，近似“也就是说”，常用逗号把它与两侧内容隔开。后面应是说明或具体化，而不是新的独立论点。",
  "this means that": "把前文事实转换成直接含义或可推出的判断，that 后接完整从句。this 必须有清楚的前文指向，后面的推论也要有足够依据。",
  "to sum up": "用于在结尾概括已经讨论的主要内容并给出收束判断。它不适合在总结时添加新证据，正式文章中也不应在每一段机械重复使用。",
  "under no circumstances": "表示强烈、无例外的否定条件，常见于规则和警告。置于句首时，后面的助动词或情态动词要放到主语前形成部分倒装。",
  "up to": "表示数量、时间或程度的最高上限，实际值可以低于该数字；也可表示“由某人负责决定”。阅读时要根据后接数字还是人物判断含义。",
  "with regard to": "用于限定或切换讨论主题，结构是 with regard to + 名词或 -ing 形式，近似“关于／就……而言”。它标记话题范围，不表示因果关系。"
});

export const LOGIC_DETAIL_OVERRIDES = Object.freeze({
  additionally: "作为连接副词用于补充同方向的信息，常置于新句句首并加逗号。后句应继续支持当前论点，而不是突然切换到无关主题。",
  alternatively: "作为连接副词提出与前述方案不同的另一种选择，常置于新句句首并加逗号。它表示“或者、换一种办法”，不要与 alternately“交替地、轮流地”混淆。",
  afterwards: "作副词表示某件事发生之后的较晚时间，强调前后顺序但不表示因果。它不直接带宾语；需要接名词或从句时，应使用 after，而英式英语中 afterwards 比 afterward 更常见。",
  also: "用于在原有信息上再增加同类内容，表示“也、还”。通常放在主要动词前、be 动词或第一个助动词后；它只表示补充，不自动表示递进、对比或因果。",
  although: "引导让步从句，表示从句事实成立，但主句结果与通常预期不同。although 从句在前时末尾通常加逗号；它本身已表示让步，主句前不再加 but。",
  approximate: "作形容词表示数值、时间或数量接近真实值但并不精确；作动词表示接近某数值或与某物近似。阅读时应把它理解为估算范围，而不是经过精确测量的结果。",
  approximately: "作副词修饰数字、时间、距离或比例，表示所给数值是接近真实值的估计。它不改变数量关系的方向，只提示存在合理误差，语气通常比 about 更正式。",
  beforehand: "作副词表示在某个事件或截止时间以前预先完成某事，常见于预约、准备和通知语境。它不能像 before 一样直接接名词或从句，通常放在句末或主要动作之前。",
  besides: "作副词时表示“此外”，补充新的理由；作介词时表示“除……之外还”，后接名词或 -ing 形式。不要与表示位置“在旁边”的 beside 混淆。",
  consequently: "作为连接副词从前文原因推出直接后果，通常置于新句句首并加逗号。连接两个完整句时，前面宜用句号或分号，不能只用逗号。",
  despite: "引出让步背景，后接名词、代词或 -ing 形式，表示阻碍存在但主句结果仍发生。despite 后不能直接接完整主谓从句，除非使用 despite the fact that。",
  during: "作介词表示某事发生在一个事件或时期的持续过程之中，后接名词或名词短语。它不能直接接完整主谓从句；强调持续多久时通常使用 for，而不是 during。",
  either: "可构成 either A or B，表示两个选项中任一，A 与 B 应保持语法平行；在否定句末还可表示“也不”。阅读时要根据位置区分选择结构、限定词和副词用法。",
  especially: "用于从较大范围中突出最值得注意的人、事物或情况，表示“尤其、特别”。它强调某一成员而非改变逻辑方向；表示为特定目的专门做某事时，通常用 specially。",
  eventual: "形容经过一段时间、变化或困难后最后出现的结果，表示“最终的”。它描述结局而不是“可能发生的”，因此不能按中文形近联想误解为 possible。",
  eventually: "表示经过一段时间、若干步骤或延迟后某事最终发生，重点是过程之后的结局。它不保证结局理想；与 finally 相比，通常较少带“终于松一口气”或列举最后一点的语气。",
  except: "核心作用是把某人、某物或某种情况排除在总体之外，可作介词或连词。它给出不适用的例外；在完整总体判断后补充局部例外时，except for 往往更自然。",
  finally: "可表示经过等待或努力后某事终于发生，也可在列举中引出最后一点。前一种用法常带结束拖延的语气，后一种只标记顺序；句首作连接语时通常加逗号。",
  first: "可作序数词表示顺序中的第一，也可作副词引出第一步或第一个论点。作为篇章连接语时 First/Firstly 后通常加逗号；at first 表示“起初但后来改变”，两者不能随意互换。",
  firstly: "用于有顺序地列举论点或步骤，并明确标记第一项，句首后通常加逗号。它常与 secondly、finally/lastly 呼应；现代普通表达也常直接使用 first。",
  furthermore: "作为较正式的连接副词，在已有理由上继续补充同方向论据。常置于新句句首并加逗号；一段中不要与 moreover、in addition 机械堆叠。",
  generally: "可表示大多数情况下通常如此，也可从总体角度作概括。它保留例外，不能把趋势写成绝对事实；Generally speaking 常用于给出有依据的概括性判断。",
  however: "作为连接副词引出与前文对照或出人意料的信息，通常写成前句句号或分号 + However, + 后句。它不是并列连词，不能像 but 一样只用逗号连接两个完整句。",
  include: "作动词表示把某人或某物作为整体的一部分计算或列入，主语通常是整体、宾语是其中的成员。include 后列出的往往只是部分内容，并不自动表示清单已经穷尽。",
  including: "作介词使用时引出整体中包含的成员或实例，表示“包括……在内”，后接名词、代词或 -ing 形式。它通常给出非穷尽列举；是否用逗号取决于该信息是补充说明还是句意必需部分。",
  initial: "作形容词表示发生在过程、计划或时期的开始阶段，后续情况可能改变；作名词可指姓名首字母。阅读程序或研究结果时，initial 只说明最初状态，不等于最终结论。",
  initially: "表示某事在开始阶段成立，并常暗示后来出现了变化或补充情况。它描述时间起点而不是列举中的“第一点”；句首作连接语时通常加逗号。",
  instead: "表示采用替代方案或出现相反结果；单独作副词时可置于句首或句末。instead of 后接名词或 -ing 形式，不能直接按 instead 的句法使用。",
  likewise: "用于说明后一个人、事物或情况与前一个相似，表示“同样地、也如此”。作为句子连接副词时常用逗号隔开；它标记相似关系，而不是因果或简单的时间并列。",
  mainly: "表示某事主要由某部分构成、主要出于某原因或重点集中在某方面，但不排除次要部分。它回答“主要是哪一项”，而 mostly 更常强调数量上的大部分或大多数时候。",
  meanwhile: "可表示另一件事在同一时间发生，也可表示在等待某结果的间隔期间发生。置于句首时常加逗号；有时它还并列两种形成对照的情况，但本身不表示因果。",
  moreover: "作为较正式的连接副词补充并加强同一论点，后项通常不弱于前项。常置于新句句首并加逗号，避免与 furthermore 连续堆砌。",
  mostly: "表示一个群体或总量中的大部分，或某情况在大多数时候成立，但仍允许少量例外。它常强调比例；mainly 更偏向主要成分、原因或关注重点。",
  namely: "用于准确说明前文所指的人、事物或项目，后面给出具体身份或完整列项，近似“也就是”。它不是随意举例；只列代表成员时应使用 for example 或 such as。",
  neither: "可构成 neither A nor B，表示两项都不，A 与 B 应保持语法平行；neither + 助动词 + 主语还可表示“也不”。谓语单复数需根据完整结构判断。",
  nevertheless: "作为连接副词表示前述阻碍并未改变后句结果，语气比 but 更正式。通常置于新句句首并加逗号，前面连接完整句时宜用句号或分号。",
  nonetheless: "意义和用法接近 nevertheless，表示“尽管如此，结果仍然成立”。通常作为连接副词置于句首并加逗号，不要用单个逗号连接两个完整句。",
  only: "核心作用是限制数量、范围或所指对象，作形容词还可表示“唯一的”。only 在句中的位置决定它限制哪一部分；放在句首限制状语时，主句有时需要部分倒装。",
  overall: "作形容词表示把各部分合在一起考虑的总体情况，作副词表示“总的来说”。它适合概括全部证据后的整体判断，不能用一个局部细节直接代替 overall 结论。",
  otherwise: "可表示“否则”，引出不满足前述条件时的结果；也可表示“在其他方面”。作结果连接语时，前句通常先给要求或条件，后句说明违背后的后果。",
  particular: "首先表示从同类中明确指出的某一个，即特定的、具体的；in particular 用于突出其中最相关的一项。形容人时还可表示挑剔、讲究，需根据宾语和语境区分。",
  particularly: "用于从一组人、事物或情况中突出尤其值得注意的一项，表示“尤其、特别地”。它强调程度或关注重点；若要把概括缩小到精确对象，通常使用 specifically。",
  respectively: "表示前后两个或多个人、数字、项目按出现顺序一一对应，常放在句末。使用时两组项目的数量和顺序必须清楚；它不是普通的“各自”，也不表示时间先后。",
  since: "既可标记从过去某时间点延续至今，也可作连词表示“因为／既然”。阅读时要看后面是时间点还是原因从句；表示原因时通常用于理由已知或较次要的情况。",
  similarly: "作为连接副词说明后一句与前一句具有相似模式、结果或特点，常置于句首并加逗号。相似关系必须有可对应的比较点；它不表示两件事完全相同，也不表示因果。",
  specific: "表示对象、要求或信息明确限定在某一点，而不是笼统的一般情况；specific to 还可表示某特征为某对象所特有。它常提示答案必须精确对应原文范围。",
  specifically: "用于把较宽泛的陈述缩小到一个准确对象、目的或细节，表示“具体来说、明确地”。句首作连接语时可引出精确说明；它不同于表示“尤其突出”的 particularly。",
  subsequent: "较正式地表示在某个事件之后发生的，结构 subsequent to 可表示“在……之后”。它只确认先后顺序，不自动证明后项由前项导致。",
  subsequently: "较正式地表示后一事件在前一事件之后发生，常用于程序、报告和叙事。它建立时间顺序，但除非上下文另有证据，并不自动表示前一事件造成后一事件。",
  therefore: "作为连接副词从前文证据推出结论或结果，通常置于新句句首并加逗号。连接两个完整句时前面应使用句号或分号，不能只用逗号。",
  though: "作连词时引出让步从句，功能接近 although；让步从句在前时末尾通常加逗号。非正式语境中 though 还可置于句末，表示“不过”。",
  thus: "作为较正式的连接副词表示“因此／从而”，也可在 thus + -ing 结构中说明前项造成的结果。连接两个完整句时宜使用句号或分号，不能只用逗号。",
  typical: "表示具有某一类人或事物的代表性特征，或某情况通常会出现；typical of 后接被代表的类别。它描述常见模式而不是无例外规则，口语中也可带“果然又这样”的评价语气。",
  typically: "可表示某事在通常情况下如此，也可表示以最能代表某一类别的方式发生。句首作概括连接语时通常加逗号，并应理解为一般趋势而不是每次都成立。",
  lastly: "用于列举中引出最后一个论点、步骤或项目，句首后通常加逗号。它只标记清单位置，不一定表示事情最终发生；表示经过过程后的结果时应使用 finally 或 eventually。",
  unless: "引出否定条件，A unless B 通常相当于“如果不 B，就 A”。unless 已含“如果不”的意思，从句中一般不再重复 not。",
  unlike: "作介词表示某人与某物不同，或两个对象在所比较方面不相似，后接名词或代词。它直接建立对比；不要与 dislike“厌恶”混淆，也不能像 whereas 一样直接连接两个完整分句。",
  whenever: "可表示“每当”，说明某事每次发生都会出现同一结果；也可表示“无论何时”，表示时间不受限制。后接完整从句，具体含义取决于是在说重复规律还是开放条件。",
  whereas: "连接两个完整分句并突出差异，常置于两个分句之间，前面通常加逗号。它表示对比而不是先后关系；正式法律文本中的“鉴于”是另一用法。",
  whether: "引出不确定性或两个以上可能选项，常见 whether ... or (not)。它可用于介词后和 whether to do 结构；这些位置通常不能用 if 替代，阅读时也可能表示“无论哪一种情况”。",
  while: "可引出让步或对比分句，表示“虽然／而”，也可表示两件事同时发生。阅读时要根据前后内容判断是逻辑对比还是时间关系；让步用法中主句不再加 but。"
});

export const LOGIC_EXAMPLE_PATCHES = Object.freeze({
  alternatively: {
    example: "We could take the train. Alternatively, we could drive.",
    exampleCn: "我们可以乘火车；或者也可以开车。"
  },
  unlike: {
    example: "Unlike his brother, he is quiet and prefers to work alone.",
    exampleCn: "与哥哥不同，他很安静，更喜欢独自工作。"
  },
  approximately: {
    example: "Approximately 120 applicants attended the information session.",
    exampleCn: "大约有120名申请者参加了说明会。"
  },
  "as a result": {
    example: "The final bus was cancelled; as a result, several passengers had to take a taxi.",
    exampleCn: "末班公交车被取消，因此几名乘客只好乘出租车。"
  },
  "as well as": {
    example: "The centre offers language classes as well as computer training.",
    exampleCn: "该中心既提供语言课程，也提供计算机培训。"
  },
  "because of": {
    example: "The interview started late because of a problem with the booking system.",
    exampleCn: "由于预约系统出现问题，面试开始得较晚。"
  },
  "for example": {
    example: "Some public services, for example libraries, remain free to use.",
    exampleCn: "一些公共服务（例如图书馆）仍可免费使用。"
  },
  "for instance": {
    example: "Several documents are accepted; for instance, you may provide a recent bank statement.",
    exampleCn: "多种文件都可接受，例如你可以提供近期的银行对账单。"
  },
  furthermore: {
    example: "The course is affordable; furthermore, all essential materials are included in the fee.",
    exampleCn: "这门课程价格合理，而且费用已包含所有必需材料。"
  },
  "in addition": {
    example: "The course covers first aid. In addition, it includes practical safety training.",
    exampleCn: "该课程涵盖急救知识，此外还包括实用安全培训。"
  },
  "lead to": {
    example: "Poor ventilation can lead to health problems in crowded offices.",
    exampleCn: "通风不良可能导致拥挤办公室中的健康问题。"
  },
  moreover: {
    example: "The new route is faster; moreover, it serves two additional residential areas.",
    exampleCn: "新路线速度更快，而且还覆盖了另外两个住宅区。"
  },
  similarly: {
    example: "The first route is heavily used; similarly, the second carries many commuters.",
    exampleCn: "第一条路线使用率很高；同样，第二条路线也承载许多通勤者。"
  },
  "rather than": {
    example: "He chose to walk rather than take the bus.",
    exampleCn: "他选择步行，而不是乘公交车。"
  },
  therefore: {
    example: "The office is closed today; therefore, applications must be submitted online.",
    exampleCn: "办公室今天关闭，因此申请必须在线提交。"
  },
  thus: {
    example: "The form was incomplete; thus, the application could not be processed.",
    exampleCn: "表格填写不完整，因此申请无法处理。"
  },
  whereas: {
    example: "The morning service runs every ten minutes, whereas the evening service is less frequent.",
    exampleCn: "早班服务每十分钟一班，而晚班服务的班次较少。"
  },
  including: {
    example: "The fee is $50, including all taxes and booking charges.",
    exampleCn: "费用为50美元，其中包括所有税费和预订费。"
  },
  subsequently: {
    example: "He completed the training and subsequently found a full-time job.",
    exampleCn: "他完成培训后，随后找到了一份全职工作。"
  }
});

export const LOGIC_REVIEW_SOURCES = Object.freeze([
  "https://ielts.org/cdn/ielts-guides/ielts-writing-band-descriptors.pdf",
  "https://ielts.org/news-and-insights/how-to-teach-paragraph-level-cohesion",
  "https://dictionary.cambridge.org/grammar/british-grammar/adverbs-linking-adverbs",
  "https://dictionary.cambridge.org/grammar/british-grammar/linking-words",
  "https://dictionary.cambridge.org/grammar/british-grammar/conjunctions-contrasting",
  "https://dictionary.cambridge.org/grammar/british-grammar/conjunctions-causes-reasons-results-and-purpose",
  "https://dictionary.cambridge.org/grammar/british-grammar/although",
  "https://dictionary.cambridge.org/grammar/british-grammar/alternate-ly-alternative-ly"
]);

/**
 * These existing active entries belong in the learning range but lost the
 * logic120 layer during later merges. The first six are present in the formal
 * 120-row source package and are not in the retirement ledger. Alternatively
 * is an editorial addition confirmed by Cambridge Grammar.
 */
export const LOGIC_LAYER_ADDITIONS = Object.freeze({
  rg_word_particularly: "particularly",
  rg_word_specifically: "specifically",
  rg_word_similarly: "similarly",
  rg_word_firstly: "firstly",
  rg_word_initially: "initially",
  rg_word_lastly: "lastly",
  rg_word_alternatively: "alternatively"
});
