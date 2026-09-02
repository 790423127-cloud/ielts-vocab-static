/**
 * Editorial repairs that cannot safely be inferred from a truncated sentence.
 * Every entry keeps the original source text so the write script refuses to
 * overwrite a later manual correction.
 */
export const MANUAL_READING_G_EXAMPLE_REPAIRS = Object.freeze({
  rg_word_bay: {
    from: "The ship anchored in .",
    example: "The ship anchored in the bay.",
    exampleCn: "那艘船停泊在海湾里。"
  },
  rg_word_lid: {
    from: "I can't get the lid off .",
    example: "I can't get the lid off the jar.",
    exampleCn: "我打不开这个罐子的盖子。"
  },
  rg_word_oak: {
    from: "The table is made .",
    example: "The table is made of oak.",
    exampleCn: "这张桌子是用橡木做的。"
  },
  rg_word_eighteenth: {
    from: "His eighteenth birthday party .",
    example: "His eighteenth birthday party was a lot of fun.",
    exampleCn: "他的十八岁生日派对很有趣。"
  },
  rg_word_fungi: {
    from: "The bread has fungi growing .",
    example: "Fungi are growing on the bread.",
    exampleCn: "面包上正在长霉菌。"
  },
  rg_word_tooth: {
    from: "Brush your teeth every.",
    example: "Brush your teeth every day.",
    exampleCn: "每天刷牙。"
  },
  rg_word_up_to_date: {
    from: "He keeps his knowledge up-to-date by reading news every.",
    example: "He reads the news to stay up-to-date.",
    exampleCn: "他每天读新闻以保持知识更新。"
  },
  rg_word_boxing: {
    from: "He trains in boxing every.",
    example: "He trains in boxing every day.",
    exampleCn: "他每天练习拳击。"
  },
  rg_word_refectory: {
    from: "Students line up in the refectory for lunch at 12:30 every.",
    example: "Students line up in the refectory for lunch at 12:30 every day.",
    exampleCn: "学生们每天12:30在食堂排队吃午饭。"
  },
  rg_word_shirts: {
    from: "He wears clean shirts every.",
    example: "He wears clean shirts every day.",
    exampleCn: "他每天都穿干净的衬衫。"
  },
  rg_word_breeder: {
    from: "The breeder takes care of dogs every.",
    example: "The breeder takes care of the dogs every day.",
    exampleCn: "这名繁育者每天照顾这些狗。"
  },
  rg_word_ambitions: {
    from: "His ambitions drive him to work hard every.",
    example: "His ambitions drive him to work hard every day.",
    exampleCn: "他的抱负驱使他每天努力工作。"
  },
  rg_word_opportunities: {
    from: "He looks for new opportunities every.",
    example: "He looks for new opportunities every day.",
    exampleCn: "他每天都在寻找新的机会。"
  },
  rg_word_discussions: {
    from: "We had discussions about homework every.",
    example: "We have discussions about homework every day.",
    exampleCn: "我们每天都会讨论作业。"
  },
  rg_word_cycling: {
    from: "I enjoy cycling to work every.",
    example: "I enjoy cycling to work every day.",
    exampleCn: "我喜欢每天骑车上班。"
  },
  rg_word_seemed: {
    from: "The movie seemed longer than it actually.",
    example: "The movie seemed longer than it actually was.",
    exampleCn: "这部电影似乎比实际时长更长。"
  },
  rg_word_showing: {
    from: "The museum is showing a new exhibition of modern.",
    example: "The museum is showing a new exhibition of modern art.",
    exampleCn: "博物馆正在展出一个现代艺术新展览。"
  },
  rg_phrase_cope_with: {
    from: "He tries to cope with stress by walking every.",
    example: "He tries to cope with stress by walking every day.",
    exampleCn: "他每天散步来应对压力。"
  },
  rg_word_assemble: {
    from: "He will assemble the toy for .",
    example: "He will assemble the toy for his son.",
    exampleCn: "他会为儿子组装这个玩具。"
  },
  rg_word_imperative: {
    from: "It is imperative to drink water every.",
    example: "It is imperative to drink water every day.",
    exampleCn: "每天喝水很有必要。"
  },
  rg_word_municipal: {
    from: "The municipal library is open every.",
    example: "The municipal library is open every day.",
    exampleCn: "市立图书馆每天开放。"
  },
  rg_word_oppose: {
    from: "He opposes the .",
    example: "He opposes the new law.",
    exampleCn: "他反对这项新法律。"
  },
  rg_word_patience: {
    from: "He showed patience while waiting for .",
    example: "He showed patience while waiting for the bus.",
    exampleCn: "他等公交车时表现得很有耐心。"
  },
  rg_word_practitioner: {
    from: "He is a medical practitioner who helps patients every.",
    example: "He is a medical practitioner who helps patients every day.",
    exampleCn: "他是一名每天为患者提供帮助的医务从业者。"
  },
  rg_word_refine: {
    from: "He refines his writing every.",
    example: "He refines his writing every day.",
    exampleCn: "他每天打磨自己的写作。"
  },
  rg_word_robot: {
    from: "The robot cleans the floor every.",
    example: "The robot cleans the floor every day.",
    exampleCn: "机器人每天清洁地板。"
  },
  rg_word_supersede: {
    from: "The new law will supersede the .",
    example: "The new law will supersede the old one.",
    exampleCn: "新法律将取代旧法律。"
  }
});
