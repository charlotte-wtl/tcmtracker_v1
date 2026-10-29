// Daily-log question schema. Started as a port of Sprint 1 (app/daily-log.html);
// questions have changed since (scored answers, photo, pulse guide). Answers to
// questions that were replaced are kept as `retired` fields so earlier days
// still read out. Every user-facing string is "中文||English";
// T() in i18n.js splits on the active language at render time.

export const YESNO = ["有||Yes", "無||No"];
export const SEV3 = ["輕||Mild", "中||Moderate", "重||Severe"];
export const SKIN_AREAS = ["額頭||Forehead","眉間||Between brows","鼻||Nose","左臉頰||Left cheek","右臉頰||Right cheek","嘴周||Around mouth","下巴||Chin","下顎線||Jawline","頸||Neck","胸口||Chest","背||Back","手||Hands"];
export const SEV4 = ["輕度||Mild", "中度||Moderate", "明顯||Noticeable", "超級腫||Very heavy"];
// Scored answers (the number leads, so days can be compared and averaged).
// PUFF keeps the old four puffiness words, with 0 for none.
export const PUFF = ["0 無||0 None", "1 輕度||1 Mild", "2 中度||2 Moderate", "3 明顯||3 Noticeable", "4 超級腫||4 Very heavy"];
export const SCORE03 = ["0 沒有||0 None", "1 輕微||1 Slight", "2 中等||2 Moderate", "3 明顯||3 Strong"];
export const BRISTOL = [
  "1型：一粒粒硬塊，像堅果||Type 1: separate hard lumps",
  "2型：香腸狀但凹凸成塊||Type 2: lumpy sausage",
  "3型：香腸狀，表面有裂紋||Type 3: sausage with cracks",
  "4型：光滑柔軟像香蕉（正常）||Type 4: smooth and soft (normal)",
  "5型：軟塊，邊緣清楚||Type 5: soft blobs, clear edges",
  "6型：糊狀，邊緣不清||Type 6: mushy, ragged edges",
  "7型：水樣，沒有固體||Type 7: watery, no solid pieces",
];
const STOOL_COLOUR = ["正常黃褐||Normal brown","偏黑||Dark","偏綠||Greenish","偏淡／灰白||Pale/grey"];
const OLD_STOOL_SHAPE = ["偏硬顆粒狀||Hard/pellet","成形但偏乾||Formed, dry","正常香蕉狀||Normal","偏軟不成形||Soft, unformed","稀溏水便||Watery"];
const PULSE_POSITIONS = ["左寸(心)||L-cun (Heart)","左關(肝)||L-guan (Liver)","左尺(腎)||L-chi (Kidney)","右寸(肺)||R-cun (Lung)","右關(脾)||R-guan (Spleen)","右尺(腎命門)||R-chi (Kidney/Mingmen)"];

export const SCHEMA = {
  sleep: {
    title: "1. 睡眠||1. Sleep",
    fields: [
      { id:"onsetEase", type:"single", label:"入睡難易度||Sleep onset ease",
        options:["很快入睡（15分鐘內）||Fell asleep quickly (<15 min)","稍有困難（15–30分）||Somewhat difficult (15–30 min)","輾轉難眠（超過30分）||Tossed and turned (30+ min)","幾乎整夜難眠||Almost no sleep"] },
      { id:"sleepTime", type:"time", label:"入睡時間||Sleep time" },
      { id:"wakeTime", type:"time", label:"起床時間||Wake time" },
      { id:"depth", type:"single", label:"睡眠深淺||Sleep depth",
        options:["深沉安穩||Deep & stable","淺眠易醒||Light, easily woken","多夢紛擾||Restless, many dreams","似睡非睡||Barely asleep","被外界環境吵醒||Woken by external environment"] },
      { id:"nightWaking", type:"multi", label:"半夜醒轉時辰||Middle-of-night waking",
        options:["無醒轉||None","子時23–1點||Zi 11pm–1am","丑時1–3點||Chou 1–3am","寅時3–5點||Yin 3–5am","卯時5–7點||Mao 5–7am","其他||Other"],
        detailsTrigger:"any", excludeValues:["無醒轉||None"],
        details:[{ id:"wakeCount", type:"single", label:"醒轉次數||Number of wakings", options:["1次||1 time","2次||2 times","3次以上||3+ times"] }] },
      { id:"dreamQuality", type:"single", label:"夢境性質||Dream quality",
        options:["不記得或無夢||No memory/none","平淡夢境||Mundane","情緒強烈（焦慮/憤怒/悲傷）||Emotionally intense","噩夢||Nightmares","清晰難忘（非負面）||Vivid & memorable (not negative)"] },
      { id:"sleepQuality", type:"slider", label:"睡眠品質自評||Self-rated sleep quality", min:1, max:5, minLabel:"很差||Poor", maxLabel:"很好||Great" },
      { id:"notes", type:"text", multiline:true, label:"備註||Notes" }
    ]
  },
  morning: {
    title: "2. 晨起徵象||2. Morning Signs",
    fields: [
      { id:"alertness", type:"single", label:"醒來精神||Waking alertness",
        options:["清爽有精神||Refreshed","尚可||OK","昏沉遲鈍||Groggy","極度疲憊像沒睡||Exhausted, as if didn't sleep"] },
      { id:"riseSpeed", type:"single", label:"起床速度||Getting-up speed",
        options:["一醒即起身||Up immediately","賴床5–10分||Lingered 5–10 min","賴床15分以上||Lingered 15+ min","起身時頭暈||Dizzy on standing"] },
      { id:"mood", type:"multi", label:"晨起心情||Morning mood",
        options:["平靜||Calm","煩躁||Irritable","低落||Low","焦慮||Anxious","情緒起伏||Mood swings","失控感||Not in control","還好||Fine","開心||Happy","難過||Sad","敏感||Sensitive","生氣||Angry","自信||Confident","興奮||Excited","不安||Insecure","感恩||Grateful","無感||Indifferent","無力||Lacking energy","防禦性||Defensive"] },
      // Retired: energy is now one 1–5 score (精力自評 in section 4).
      { id:"energy", retired:true, type:"single", label:"精力||Energy",
        options:["精疲力盡||Exhausted","疲倦||Tired","還好||OK","有活力||Energetic","精力充沛||Fully energised"] },
      { id:"mind", type:"multi", label:"心智狀態||Mind",
        options:["健忘||Forgetful","腦霧||Brain fog","平靜||Calm","有壓力||Stressed","專注||Focused","分心||Distracted","有動力||Motivated","沒動力||Unmotivated","有創意||Creative","有效率||Productive","沒效率||Unproductive"] },
      { id:"eyePuff", type:"single", label:"眼睛浮腫（0–4）||Eye puffiness (0–4)", options:PUFF, allowOther:false },
      { id:"facePuff", type:"single", label:"臉部浮腫（0–4）||Face puffiness (0–4)", options:PUFF, allowOther:false },
      { id:"nosePuff", type:"single", label:"鼻部浮腫或鼻塞（0–4）||Nose puffiness/congestion (0–4)", options:PUFF, allowOther:false },
      { id:"eyePuffiness", retired:true, type:"yesno", label:"眼睛浮腫||Eye puffiness", options:YESNO,
        detailsTrigger:"有||Yes", details:[{ id:"sev", type:"single", label:"程度||Severity", options:SEV4 }] },
      { id:"facePuffiness", retired:true, type:"yesno", label:"臉部浮腫||Face puffiness", options:YESNO,
        detailsTrigger:"有||Yes", details:[{ id:"sev", type:"single", label:"程度||Severity", options:SEV4 }] },
      { id:"nosePuffiness", retired:true, type:"yesno", label:"鼻部浮腫或鼻塞||Nose puffiness/congestion", options:YESNO,
        detailsTrigger:"有||Yes", details:[{ id:"sev", type:"single", label:"程度||Severity", options:SEV4 }] },
      { id:"mouthTaste", type:"multi", label:"晨起口感||Morning mouth taste",
        options:["口淡無異||Normal","口苦||Bitter","口乾||Dry","口黏膩||Sticky","口酸||Sour"] },
      { id:"throat", type:"multi", label:"喉嚨狀況||Throat condition",
        options:["正常||Normal","乾燥||Dry","上火（腫痛,異物感）||Inflamed","搔癢||Itchy"] },
      { id:"coughPhlegm", type:"multi", label:"咳嗽／痰||Cough/Phlegm",
        options:["無||None","有咳嗽||Cough","有痰||Phlegm"],
        detailsTrigger:"有痰||Phlegm",
        details:[
          { id:"colour", type:"single", label:"痰色||Colour", options:["白||White","黃||Yellow","透明||Clear"] },
          { id:"texture", type:"single", label:"痰質||Texture", options:["清稀||Thin","黏稠||Thick"] }
        ] },
      { id:"phoneMinutes", type:"single", label:"起床後滑手機多久||Phone time after waking", allowOther:false,
        options:["沒有||None","15分鐘內||Under 15 min","15–30分鐘||15–30 min","30–60分鐘||30–60 min","60分鐘以上||Over 60 min"] },
      { id:"breakfastDelay", type:"single", label:"起床後多久吃早餐||Time from waking to breakfast", allowOther:false,
        options:["1小時內||Within 1 hour","1–2小時||1–2 hours","2小時以上||Over 2 hours","沒吃早餐||Skipped"] },
      { id:"breakfastTemp", type:"single", label:"早餐是熱的還是凍的||Was breakfast warm or cold?", allowOther:false,
        options:["溫熱||Warm","室溫||Room temperature","凍||Cold"] }
    ]
  },
  tongue: {
    title: "3. 舌診||3. Tongue Diagnosis",
    fields: [
      // A guided photo plus an on-device colour reading (see tongue-photo.js).
      { id:"photo", type:"photo", label:"舌照||Tongue photo" },
      { id:"observeWhen", type:"single", label:"甚麼時候看舌||When you looked", allowOther:false,
        options:["起床後未刷牙、未飲食||On waking, before brushing, eating or drinking","刷牙後、未飲食||After brushing, before food or drink","飲食之後||After eating or drinking"] },
      { id:"stainFood", type:"yesno", label:"昨晚或今早吃過會染色的食物嗎（咖喱、咖啡、芋頭、紫薯、莓果、深色醬汁）||Any staining food last night or this morning (curry, coffee, taro, purple sweet potato, berries, dark sauce)?", options:YESNO, allowOther:false },
      { id:"bodyColor", type:"single", label:"舌質顏色||Tongue body colour",
        options:["淡白||Pale white","淡紅（正常）||Pale red (normal)","紅||Red","絳紅（深紅）||Crimson","暗紅或紫暗||Dark red/purplish","淡紫／青紫||Pale/bluish purple"] },
      { id:"shape", type:"multi", label:"舌形||Tongue shape",
        options:["正常大小||Normal","胖大有齒痕||Swollen, tooth-marked","瘦薄||Thin","裂紋||Cracked","芒刺||Prickles","舌尖偏紅||Red tip"] },
      { id:"localSigns", type:"multi", label:"局部顏色變化||Colour in one area",
        options:["無||None","舌邊紅||Red sides","舌中偏紫||Purple in the centre","舌邊偏紫||Purple sides","瘀點或瘀斑||Dark spots"] },
      { id:"coatingColor", type:"single", label:"舌苔顏色||Coating colour",
        options:["無苔||None","白苔||White","黃苔||Yellow","灰黑苔||Grey-black","剝苔／地圖舌||Peeled/map tongue"] },
      { id:"coatingThickness", type:"single", label:"舌苔厚薄||Coating thickness",
        options:["薄||Thin","中等||Medium","厚||Thick","厚膩||Thick & greasy"] },
      { id:"moisture", type:"single", label:"舌苔濕潤度||Coating moisture",
        options:["濕潤||Moist","偏乾||Slightly dry","乾燥少津||Dry","過度濕滑||Overly wet"] },
      { id:"sublingual", type:"single", label:"舌下絡脈（進階）||Sublingual veins (advanced)",
        options:["未觀察||Not observed","淡紅細小（正常）||Pale, thin (normal)","稍怒張變深||Slightly distended","明顯紫暗怒張||Markedly distended"] },
      { id:"notes", type:"text", multiline:true, label:"備註||Notes" }
    ]
  },
  general: {
    title: "4. 全身狀況問診||4. General / Systemic",
    fields: [
      { id:"coldHeat", type:"single", label:"寒熱||Cold/Heat",
        options:["怕冷||Cold-averse","怕熱||Heat-averse","忽冷忽熱||Alternating","無明顯||None notable"] },
      { id:"sweat", type:"multi", label:"汗||Sweating",
        options:["無異常||None","自汗||Spontaneous (daytime)","盜汗||Night sweats","手心腳心易汗||Sweaty palms/soles","該熱不出汗，反而面赤||Heat response without perspiring, flushing instead"] },
      { id:"thirst", type:"single", label:"口渴||Thirst",
        options:["不渴||Not thirsty","渴喜熱飲||Prefers warm","渴喜冷飲||Prefers cold","渴但喝不多||Thirsty but doesn't drink much","渴亦喝得多||Thirsty and drinks a lot"] },
      { id:"appetite", type:"multi", label:"食慾||Appetite",
        options:["正常||Normal","食慾不振||Poor","多食易飢||Easily hungry","食後腹脹||Bloating after eating"] },
      { id:"giSymptoms", type:"multi", label:"腸胃症狀||GI symptoms",
        options:["無明顯||None","脹氣||Bloating","排氣多||Excess gas","火燒心反酸||Heartburn","噁心||Nausea","嘔吐||Vomiting","飯後腹脹嗜睡||Post-meal bloat & sleepy","口氣重||Bad breath"] },
      { id:"bowelMovement", type:"yesno", label:"今天有解便嗎||Did you have a bowel movement today?", options:YESNO,
        detailsByValue: {
          "有||Yes": [
            { id:"bristol", type:"single", label:"大便類型（Bristol 1–7）||Stool type (Bristol 1–7)", options:BRISTOL },
            { id:"colour", type:"single", label:"大便顏色||Stool colour", options:STOOL_COLOUR },
            { id:"shape", retired:true, type:"single", label:"大便性狀||Stool shape", options:OLD_STOOL_SHAPE }
          ],
          "無||No": [
            { id:"status", type:"single", label:"排便狀況||Bowel status", options:["有便意但無力氣||Urge, but no strength to push","無便意||No urge at all"] }
          ]
        } },
      { id:"prevDayBowelMovement", type:"yesno", label:"昨天有解便嗎（如昨天忘記記錄，會補記到昨天的日誌）||Did you have a bowel movement yesterday? (if you forgot to log it, this adds it to yesterday's entry)", options:YESNO,
        detailsByValue: {
          "有||Yes": [
            { id:"bristol", type:"single", label:"大便類型（Bristol 1–7）||Stool type (Bristol 1–7)", options:BRISTOL },
            { id:"colour", type:"single", label:"大便顏色||Stool colour", options:STOOL_COLOUR },
            { id:"shape", retired:true, type:"single", label:"大便性狀||Stool shape", options:OLD_STOOL_SHAPE }
          ],
          "無||No": [
            { id:"status", type:"single", label:"排便狀況||Bowel status", options:["有便意但無力氣||Urge, but no strength to push","無便意||No urge at all"] }
          ]
        } },
      { id:"urineColor", type:"single", label:"小便顏色||Urine colour",
        options:["淺清||Pale/clear","正常淡黃||Normal","深黃||Dark yellow","偏紅或有灼熱感||Reddish/burning"] },
      { id:"emotions", type:"multi", label:"情緒||Emotions",
        options:["平靜||Calm","煩躁易怒||Irritable","焦慮不安||Anxious","情緒低落||Low mood","容易哭泣||Tearful","胸悶嘆氣||Chest tightness/sighing","太專注於工作||Too focused on work","思緒混亂||Chaotic thoughts"] },
      { id:"energyScore", type:"scale", label:"精力自評（1–5）||Self-rated energy (1–5)", min:1, max:5, minLabel:"低||Low", maxLabel:"高||High" },
      { id:"anxietyScore", type:"single", label:"焦慮程度（0–3）||Anxiety (0–3)", options:SCORE03, allowOther:false },
      { id:"irritabilityScore", type:"single", label:"煩躁程度（0–3）||Irritability (0–3)", options:SCORE03, allowOther:false },
      { id:"coldFeet", type:"single", label:"雙腳冷（0–3）||Cold feet (0–3)", options:SCORE03, allowOther:false },
      { id:"lipColour", type:"single", label:"唇色（自然光下，未塗唇膏）||Lip colour (daylight, no lipstick)",
        options:["淡白||Pale","淡紅（正常）||Pale pink (normal)","紅||Red","暗紫||Dark or purplish"] },
      { id:"complexion", type:"multi", label:"面色／皮膚||Complexion/Skin",
        options:["正常||Normal","蒼白||Pale","萎黃||Sallow","潮紅||Flushed","暗沉無光||Dull","新增痘痘||New breakouts"] },
      { id:"notes", type:"text", multiline:true, label:"備註||Notes" }
    ]
  },
  organs: {
    title: "5. 肝脾腎相關觀察與壓力||5. Liver / Spleen / Kidney + Stress",
    fields: [
      { id:"liverSigns", type:"multi", perItemSeverity:true, label:"肝相關徵象||Liver signs",
        options:["無明顯||None","脅肋脹痛||Rib-side pain","頭部兩側或頭頂痛||Temple/vertex headache","容易嘆氣||Frequent sighing","眼睛乾澀或視力模糊||Dry eyes/blurred vision","指甲易脆裂||Brittle nails"] },
      { id:"spleenSigns", type:"multi", perItemSeverity:true, label:"脾相關徵象||Spleen signs",
        options:["無明顯||None","四肢沈重乏力||Heavy/weak limbs","容易瘀青||Easy bruising","嘴唇乾或脫皮||Dry or peeling lips","思慮過多難以放鬆||Overthinking","大便黏膩沖不乾淨||Sticky stool"] },
      { id:"kidneySigns", type:"multi", perItemSeverity:true, label:"腎相關徵象||Kidney signs",
        options:["無明顯||None","腰膝酸軟||Sore back/knees","夜尿頻繁||Frequent night urination","畏寒下肢尤甚||Cold intolerance (legs)","耳鳴||Tinnitus","頭髮易脫落或早白||Hair loss/greying","精神疲憊腿軟無力||Fatigue, weak legs"] },
      { id:"stressSigns", type:"multi", perItemSeverity:true, label:"壓力身體徵象||Stress signs",
        options:["無明顯||None","咬牙或夜間磨牙||Jaw clenching/grinding","肩頸緊繃||Tense shoulders/neck","胸悶||Chest tightness"] },
      { id:"notes", type:"text", multiline:true, label:"備註||Notes" }
    ]
  },
  pulse: {
    title: "6. 脈診||6. Pulse Diagnosis",
    intro: "脈診是最難自學的一項，不肯定就跳過，或者在「把握程度」選「不確定」。初學只需做兩件事：數脈率，以及比較左右手哪邊較弱。||Pulse reading is the hardest thing to learn on your own. Skip anything you're unsure of, or pick \"Not sure\" under Confidence. As a beginner, just do two things: count the rate, and compare which wrist feels weaker.",
    help: "【怎樣把脈】\n1. 坐好休息5分鐘，手心向上，手腕放在桌上，大約跟心臟同高。\n2. 用另一隻手的食指、中指、無名指，平放在手腕拇指那一邊。\n3. 先找手腕內側那粒突起的骨（拇指那邊）。中指放在骨的內側，那是「關」；食指在它前面、靠手掌，是「寸」；無名指在後面、靠手肘，是「尺」。\n4. 先輕輕放（浮取），再中等力度（中取），最後按到接近骨頭（沉取），感覺哪一層跳得最清楚。\n5. 每次在同一時間把脈，例如起床坐好之後，不要在運動、咖啡或熱水澡之後。||How to take your pulse\n1. Sit and rest for 5 minutes. Palm up, wrist resting on a table at about heart height.\n2. Lay the index, middle and ring fingers of your other hand flat on the thumb side of the wrist.\n3. Find the bony bump on the thumb side of the wrist. Your middle finger sits just inside it: that is guan. The index finger, nearer the palm, is cun. The ring finger, nearer the elbow, is chi.\n4. Rest lightly first (surface), then press medium, then press down almost to the bone (deep). Notice at which depth the beat is clearest.\n5. Check at the same time each day, e.g. sitting up after waking, not after exercise, coffee or a hot shower.",
    fields: [
      { id:"rate", type:"number", label:"脈率（次/分）||Pulse rate (beats/min)",
        help:"數30秒內跳幾下，再乘2。用手錶或手機的心率也可以。60以下屬「遲」，60–90屬正常，90以上屬「數」。||Count the beats for 30 seconds and double it. A watch or phone heart-rate reading is fine too. Under 60 is slow (遲), 60–90 normal, over 90 rapid (數).",
        detailsTrigger:"always", details:[{ id:"interp", type:"single", label:"判讀||Interpretation", options:["遲（寒）||Slow","正常||Normal","數（熱）||Rapid"] }] },
      { id:"sideDiff", type:"single", label:"左右手差異||L/R hand difference",
        help:"兩隻手各摸30秒，用同樣的力度，比較哪一邊跳得較弱、較難摸到。分不出就選「無明顯差異」。||Feel each wrist for 30 seconds with the same pressure and compare which side is weaker or harder to find. If you can't tell, pick \"None\".",
        options:["無明顯差異||None","左手較弱||Left weaker","右手較弱||Right weaker","其他||Other"] },
      { id:"weakerPosition", type:"multi", label:"較弱部位（可略過）||Weaker position(s) (optional)",
        help:"三隻手指同時放好，感覺哪一隻手指下面跳得最弱。左寸看心、左關看肝、左尺看腎；右寸看肺、右關看脾、右尺看腎（命門）。初學時這一題最容易出錯，不肯定就略過。||With all three fingers in place, notice which finger feels the weakest beat. Left: cun = heart, guan = liver, chi = kidney. Right: cun = lung, guan = spleen, chi = kidney (mingmen). This is the easiest one to get wrong as a beginner, so skip it if unsure.",
        options:PULSE_POSITIONS },
      { id:"strongerPosition", type:"multi", label:"較強部位（可略過）||Stronger position(s) (optional)", options:PULSE_POSITIONS },
      { id:"position", type:"single", label:"脈位（深淺）||Pulse depth",
        help:"浮：輕輕一放就摸到，用力按反而變弱。中取：中等力度最清楚（正常）。沉：要用力按到接近骨頭才摸到。||Floating: you feel it as soon as you touch lightly; pressing harder makes it fainter. Middle: clearest at medium pressure (normal). Sunken: you only find it pressing down near the bone.",
        options:["浮||Floating","中取可得（正常）||Moderate (normal)","沉||Sunken"] },
      { id:"strengthForm", type:"multi", label:"脈力與脈形（進階）||Pulse strength & form (advanced)",
        help:"和緩有力：跳得均勻、有彈性。虛軟無力：軟，一按就沒了。細：像一條幼線。弦：像按在繃緊的結他弦上，硬而直。滑：像圓珠在指下滾過。澀：跳得不順，像刀刮竹。洪大：又大又有力，來勢猛。緊：像拉緊的繩，左右彈手。分不出就略過，這一題要有老師當面教才準。||Moderate & strong: even and springy. Weak/soft: soft, disappears when pressed. Thin: like a fine thread. Wiry: like pressing a taut guitar string, hard and straight. Slippery: like a bead rolling under the finger. Choppy: uneven, like a knife scraping bamboo. Surging: big and forceful. Tight: like a taut rope that flicks side to side. Skip it if you can't tell; this one really needs a teacher in person.",
        options:["和緩有力（正常）||Moderate & strong","虛軟無力||Weak/soft","細如絲||Thin as thread","弦||Wiry","滑||Slippery","澀||Choppy","洪大有力||Surging","緊||Tight"] },
      { id:"confidence", type:"single", label:"把握程度||Confidence", allowOther:false,
        help:"分析時會按這一項決定脈象要佔多少份量。||The analysis uses this to decide how much weight to give the pulse.",
        options:["不確定||Not sure","有點把握||Fairly sure","很有把握||Confident"] }
      ]
  },
  exercise: {
    title: "7. 運動||7. Exercise",
    fields: [
      { id:"type", type:"single", label:"運動類型||Type",
        options:["無運動||None","有氧||Cardio","重量訓練||Strength","散步||Walking","瑜伽伸展||Yoga/stretch","混合||Mixed"] },
      { id:"intensity", type:"single", label:"運動強度自評||Self-rated intensity",
        options:["輕鬆||Light","適中||Moderate","吃力||Hard","過度||Excessive"] },
      { id:"postResponse", type:"multi", label:"運動後身體反應||Post-exercise response",
        options:["有活力||Energetic","正向||Positive","無異常||None","輕微頭暈||Mild dizziness","心悸||Palpitations","延遲性痠痛||Delayed soreness","異常疲憊||Unusual fatigue"] },
      { id:"stretchTiming", type:"single", label:"晨起或睡前瑜伽伸展||Morning or bedtime stretch",
        options:["是（晨起）||Morning","是（前一天睡前）||Yes (previous night before bed)","兩者皆是||Both","皆無||Neither"] },
      { id:"stretchArea", type:"multi", label:"伸展部位||Stretch area",
        options:["頸肩||Neck/shoulders","上背||Upper back","下背腰部||Lower back","髖部||Hips","大腿後側||Hamstrings","腿外側||Outer leg (IT band)","小腿||Calves","手臂||Arms","腋下||Armpit","全身||Full body"],
        detailsTrigger:"any", details:[{ id:"sensation", type:"single", label:"該部位感受||Sensation", options:["無不適||None","輕微緊繃||Mild tightness","中度痠痛||Moderate soreness","明顯疼痛||Noticeable pain"] }] },
      { id:"notes", type:"text", multiline:true, label:"備註||Notes" }
    ]
  },
  diet: {
    title: "8. 飲食||8. Diet",
    fields: [
      // Ticked from your cabinet, not from a fixed list of options: you take
      // these with a meal, so they belong here rather than in a section of
      // their own. Rendered by the daily log itself.
      { id:"supplements", type:"cabinet", label:"保健品||Supplements" },
      // Yesterday's exposures, asked the next morning: compared with this
      // morning's puffiness, stool, tongue and energy, they give the
      // one-day lag the analysis looks for.
      { id:"yesterdayExposures", type:"multi", label:"昨天有沒有以下情況（可多選）||Yesterday, did you have any of these? (pick all)", allowOther:false,
        options:["都沒有||None of these","炸物||Fried food","辣||Spicy food","咖喱或重香料||Curry or heavy spices","鹹零食（紫菜、薯片等）||Salty snacks (seaweed, chips)","生冷（沙律、凍飲、大量水果）||Raw or cold food (salad, iced drinks, lots of fruit)","甜品或甜飲||Dessert or sweet drinks","奶類（牛奶、芝士、乳酪）||Dairy (milk, cheese, yoghurt)","酒精||Alcohol","哭過或吵架||Cried or argued","晚上處理工作或稅務||Worked or did admin late"] },
      { id:"yesterdayCaffeine", type:"single", label:"昨天的咖啡因||Caffeine yesterday", allowOther:false,
        options:["沒有||None","茶1至2杯||1–2 cups of tea","咖啡1杯||1 coffee","咖啡2杯或以上，或咖啡加茶||2+ coffees, or coffee and tea"] },
      { id:"morning", type:"text", label:"早餐||Morning" },
      // Teas you own are offered here as you type: a drink belongs in the diet
      // section, not in the cabinet's tick list.
      { id:"beverage", type:"text", label:"飲品||Beverage", suggest:"tea" },
      { id:"lunch", type:"text", label:"午餐||Lunch" },
      { id:"snack", type:"text", label:"點心||Snack" },
      { id:"dinner", type:"text", label:"晚餐||Dinner" },
      { id:"prevDayLateMeal", type:"text", multiline:true, label:"昨天最後一餐之後吃的東西（如宵夜，如有會補記到昨天的日誌）||Anything eaten after yesterday's last logged meal (e.g. a late snack — if any, this adds it to yesterday's entry)" },
      { id:"notes", type:"text", multiline:true, label:"備註||Notes" }
    ]
  },
  // Skin, asked daily. Where a breakout sits matters to the reading (cheeks
  // left/right, forehead, chin map to different organs), so locations are
  // kept apart rather than lumped as "face".
  skin: {
    title: "9. 皮膚||9. Skin",
    fields: [
      { id:"dryness", type:"slider", label:"皮膚乾燥程度||Skin dryness", min:0, max:5, minLabel:"不乾||Not dry", maxLabel:"非常乾||Very dry" },
      { id:"peeling", type:"yesno", label:"脫皮||Peeling", options:YESNO, allowOther:false,
        detailsTrigger:"有||Yes", details:[
          { id:"location", type:"multi", label:"位置||Where", options:SKIN_AREAS },
          { id:"otherLocation", type:"text", label:"其他位置||Other location" }
        ] },
      { id:"breakouts", type:"yesno", label:"長痘||Breakouts", options:YESNO, allowOther:false,
        detailsTrigger:"有||Yes", details:[
          { id:"location", type:"multi", label:"位置||Where", options:SKIN_AREAS },
          { id:"otherLocation", type:"text", label:"其他位置||Other location" }
        ] },
      // Picked from the cabinet's skincare the way teas are under 飲品. Asked
      // about yesterday: the log is filled first thing, and this morning's
      // skin reflects what went on last night.
      { id:"skincareYesterday", type:"text", label:"昨天（包括昨晚）用的護膚品||Skincare used yesterday (including last night)", suggest:"skincare" },
      // Retired: before 10/29 this meant the same day's skincare.
      { id:"skincare", retired:true, type:"text", label:"護膚品（當天）||Skincare (same day)" },
      { id:"notes", type:"text", multiline:true, label:"備註||Notes" }
    ]
  },
  // Asked every day except period days, so discharge and one-sided pain can
  // be followed across the whole cycle (the 經間期 is read from these).
  cyclesigns: {
    title: "10. 婦科觀察||10. Cycle signs",
    condition: p => p !== "經期||Period",
    fields: [
      { id:"dischargeTexture", type:"single", label:"分泌物質地||Discharge texture",
        options:["乾燥或幾乎沒有||Dry / almost none","黏稠||Sticky","乳霜狀||Creamy","蛋清狀透明拉絲||Egg-white, stretchy","水樣||Watery"] },
      { id:"dischargeColour", type:"single", label:"分泌物顏色||Discharge colour",
        options:["透明||Clear","白色||White","淡黃||Pale yellow","黃色||Yellow","黃綠||Yellow-green"] },
      { id:"dischargeAmount", type:"single", label:"分泌物量||Discharge amount",
        options:["少||Little","正常||Normal","多||A lot"] },
      { id:"dischargeOther", type:"multi", label:"異味或搔癢||Odour or itching",
        options:["無明顯||None","有異味||Odour","外陰癢||Itching"] },
      { id:"spotting", type:"yesno", label:"點滴出血||Spotting", options:YESNO,
        detailsTrigger:"有||Yes", details:[{ id:"colour", type:"single", label:"顏色||Colour", options:["淡紅||Pale red","褐色||Brown","鮮紅||Bright red"] }] },
      { id:"sidePain", type:"yesno", label:"單側下腹痛||One-sided lower belly pain", options:YESNO,
        detailsTrigger:"有||Yes", details:[
          { id:"side", type:"single", label:"哪一側||Which side", options:["左||Left","右||Right"] },
          { id:"quality", type:"single", label:"性質||Quality", options:["刺痛||Stabbing","悶痛||Dull","抽痛||Cramping"] }
        ] },
      { id:"breastTenderness", type:"yesno", label:"乳房脹痛||Breast tenderness", options:YESNO,
        detailsTrigger:"有||Yes", details:[{ id:"sev", type:"multi", label:"程度／性質||Severity / quality", options:["輕||Mild","中||Moderate","重||Severe","乳頭敏感||Sensitive nipples"] }] },
      { id:"bbt", type:"number", step:"0.01", label:"基礎體溫（°C，可選）||Basal body temperature (°C, optional)",
        help:"起床後、未起身未說話之前，用兩位小數的體溫計量口腔溫度。排卵後體溫會升高約0.2至0.5°C並維持到經前，所以可以知道黃體期有多長。||Take it in your mouth on waking, before getting up or talking, with a thermometer that shows two decimals. It rises about 0.2–0.5°C after ovulation and stays up until your period, which shows how long your luteal phase is." },
      { id:"lhTest", type:"single", label:"排卵試紙（可選）||Ovulation (LH) test (optional)", allowOther:false,
        options:["今天沒有測||Not tested today","陰性||Negative","陽性||Positive"] }
    ]
  },
  preperiod: {
    title: "11. 經前狀態||11. Pre-period",
    condition: p => p === "經前||Pre-period",
    fields: [
      { id:"bellyPain", type:"yesno", label:"小腹不適||Lower belly discomfort", options:YESNO,
        detailsTrigger:"有||Yes", details:[
          { id:"nature", type:"multi", label:"感覺||Feels", options:["脹||Bloated","痠||Aching","冷||Cold"] },
          { id:"sev", type:"single", label:"程度||Severity", options:SEV3 }
        ] },
      { id:"backPain", type:"yesno", label:"腰部不適||Lower back discomfort", options:YESNO,
        detailsTrigger:"有||Yes", details:[
          { id:"nature", type:"multi", label:"感覺||Feels", options:["脹||Bloated","痠||Aching","冷||Cold"] },
          { id:"sev", type:"single", label:"程度||Severity", options:SEV3 }
        ] },
      { id:"headache", type:"yesno", label:"頭痛||Headache", options:YESNO,
        detailsTrigger:"有||Yes", details:[
          { id:"where", type:"multi", label:"部位||Where", options:["頭頂||Top of head","兩側||Sides","前額||Forehead","後腦||Back of head"] },
          { id:"quality", type:"single", label:"性質||Quality", options:["脹痛||Distending","空痛伴頭暈||Empty ache with dizziness","刺痛||Stabbing"] }
        ] },
      { id:"moodSwing", type:"single", label:"情緒波動型態||Mood swing pattern",
        options:["無明顯||None","易怒為主||Mainly irritable","易哭為主||Mainly tearful","兩者皆有||Both"] },
      { id:"edema", type:"single", label:"水腫||Fluid retention",
        options:["無||None","輕微||Mild","明顯||Noticeable"] },
      { id:"skinChange", type:"multi", label:"皮膚變化||Skin changes",
        options:["無||None","長痘||Breakouts","出油增加||Oilier","泛紅刺激||Irritated","脫皮||Flaky"],
        detailsTrigger:"長痘||Breakouts", details:[
          { id:"where", type:"multi", label:"長痘部位||Where", options:["下巴||Jaw / chin","口周||Around the mouth","額頭||Forehead","臉頰||Cheeks"] },
          { id:"kind", type:"single", label:"痘的樣子||What they look like", options:["紅腫有膿頭||Red, with pus heads","暗沉無頭||Dull, no head"] }
        ] },
      { id:"notes", type:"text", multiline:true, label:"睡眠或食慾變化／其他||Sleep or appetite changes / other" },
      // Retired — kept so days logged before the split still read out.
      { id:"abdomenPain", retired:true, type:"yesno", label:"下腹或腰部脹痛||Lower abdomen/back distension", options:YESNO,
        detailsTrigger:"有||Yes", details:[{ id:"sev", type:"single", label:"程度||Severity", options:SEV3 }] },
      { id:"breastTenderness", retired:true, type:"yesno", label:"乳房脹痛||Breast tenderness", options:YESNO,
        detailsTrigger:"有||Yes", details:[{ id:"sev", type:"multi", label:"程度／性質||Severity / quality", options:["輕||Mild","中||Moderate","重||Severe","乳頭敏感||Sensitive nipples"] }] },
      { id:"discharge", retired:true, type:"multi", label:"分泌物型態||Discharge type",
        options:["乾燥||Dry","黏稠||Sticky","乳霜狀||Creamy","蛋清狀透明拉絲||Egg-white","黃色分泌物||Yellow discharge"] },
      { id:"spotting", retired:true, type:"yesno", label:"點滴出血||Spotting", options:YESNO,
        detailsTrigger:"有||Yes", details:[{ id:"colour", type:"single", label:"顏色||Colour", options:["淡紅||Pale red","褐色||Brown","鮮紅||Bright red"] }] }
    ]
  },
  period: {
    title: "10. 經期狀態||10. Period",
    condition: p => p === "經期||Period",
    fields: [
      { id:"flow", type:"single", label:"經量||Flow",
        help:"如果只剩少量啡色、不用衛生巾，經期一般已經結束：在首頁或「修改」把經期結束日定在最後一天有紅色出血的日子，啡色記錄在「婦科觀察」的點滴出血。||If there is only a little brown and no pad is needed, the period has normally ended: set the end date (Home, or Adjust) to the last day with red bleeding, and log the brown as spotting under Cycle signs.",
        options:["很少||Very light","正常||Normal","偏多||Heavy","大量||Very heavy"] },
      { id:"padChanges", type:"single", label:"今天更換衛生用品次數||Pads / cups changed today",
        options:["1–2次||1–2","3–4次||3–4","5–6次||5–6","7次以上||7+"] },
      { id:"soaked", type:"single", label:"是否浸透||Soaked through",
        options:["沒有||No","接近浸透||Nearly","浸透或外漏||Soaked or leaked"] },
      { id:"colour", type:"single", label:"經色||Colour",
        options:["淡紅||Pale red","正紅||Bright red","鮮紅||Vivid red","深紅||Deep red","暗紅||Dark red","紫黑帶血塊||Purplish-black with clots","褐色||Brown"] },
      { id:"clots", type:"single", label:"血塊||Clots",
        options:["無||None","少量細小||Small/few","大血塊||Large"],
        detailsTrigger:"any", excludeValues:["無||None"], details:[
          { id:"relief", type:"single", label:"血塊排出後腹痛||Pain after passing a clot", options:["減輕||Eases","沒變||No change","本來就不痛||No pain to begin with"] }
        ] },
      { id:"texture", type:"single", label:"經質||Texture",
        options:["清稀||Thin","正常||Normal","黏稠||Thick"] },
      { id:"painType", type:"multi", label:"經期腹痛||Pain type",
        options:["冷痛喜按喜溫||Cold, relieved by warmth","脹痛||Distending","刺痛拒按||Stabbing","墜痛||Bearing-down"],
        detailsTrigger:"any", details:[
          { id:"score", type:"single", label:"最痛時幾分（0–10）||Worst pain today (0–10)", options:["0","1","2","3","4","5","6","7","8","9","10"] },
          { id:"onset", type:"single", label:"這次從何時開始痛||When this period's pain started", options:["經前就開始||Before the period","經期頭1–2天||First 1–2 days","經期後段或經後||Late in or after the period"] },
          { id:"sev", retired:true, type:"single", label:"程度||Severity", options:["輕度||Mild","中度||Moderate","強烈||Severe","無法忍受||Unbearable"] }
        ] },
      { id:"painkiller", type:"single", label:"止痛藥||Painkillers today",
        options:["沒吃||None","1次||Once","2次||Twice","3次以上||3+ times"],
        detailsTrigger:"any", excludeValues:["沒吃||None"], details:[
          { id:"name", type:"text", label:"哪一種||Which one" }
        ] },
      { id:"backache", type:"yesno", label:"腰痠||Back soreness", options:YESNO,
        detailsTrigger:"有||Yes", details:[{ id:"sev", type:"single", label:"程度||Severity", options:SEV3 }] },
      { id:"symptoms", type:"multi", label:"伴隨症狀||Accompanying symptoms",
        options:["畏寒||Chills","噁心嘔吐||Nausea/vomiting","頭痛||Headache","乳房脹痛持續||Persistent breast pain","腹瀉||Diarrhoea","疲憊嗜睡||Fatigue","腦霧||Brain fog","潮熱||Hot flashes"] },
      { id:"notes", type:"text", multiline:true, label:"備註||Notes" }
    ]
  },
  // 經後: the days after bleeding stops, when TCM reads how well 血 is
  // rebuilt (血海空虛). Discharge, spotting and breast signs are asked in
  // 婦科觀察 above, so they are not repeated here.
  postperiod: {
    title: "11. 經後狀態||11. Post-period",
    condition: p => p === "經後||Post-period",
    fields: [
      { id:"bleedingStatus", type:"single", label:"經血停了嗎||Has the bleeding stopped?", allowOther:false,
        help:"只剩少量啡色、要用護墊或者只沾到內褲的，是經血尾段的舊血，一般當作經期已經結束，在「婦科觀察」的點滴出血記錄「褐色」就可以。仍然要用衛生巾、有紅色血，就未算完，回到經期記錄。經期連尾段超過7天、褐色點滴超過3天仍未停，或者每次都這樣，就要跟醫生提。||A little brown that only needs a liner or just marks your underwear is old blood from the tail end; it is normally counted as the period having ended. Log it as brown spotting under Cycle signs. If you still need a pad or it is red, the period isn't over. If bleeding including the tail lasts over 7 days, brown spotting goes on more than 3 days, or it happens every cycle, mention it to your doctor.",
        options:["已完全停止||Fully stopped","只有少量啡色（舊血）||Only a little brown (old blood)","仍有紅色出血||Still some red bleeding"] },
      { id:"lingering", type:"multi", label:"經後不適||Discomfort since the period",
        options:["無||None","小腹隱痛，按著舒服||Dull belly ache, better with pressure","小腹脹痛或刺痛||Distending or stabbing belly pain","腰痠||Back soreness","頭暈或站起來眼黑||Dizzy, or vision dims on standing","眼花或眼乾||Blurry or dry eyes","心悸||Palpitations","手腳發麻||Numb hands or feet","情緒低落||Low mood"] },
      { id:"energyRecovery", type:"single", label:"精力恢復得怎樣||How is your energy coming back?", allowOther:false,
        options:["已經恢復||Back to normal","慢慢恢復中||Coming back slowly","仍然好累||Still very tired"] },
      { id:"cravings", type:"multi", label:"經後想吃甚麼||Cravings since the period",
        options:["沒有特別||Nothing in particular","甜食||Sweets","肉類||Meat","鹹的||Salty food","冰凍的||Something cold"] },
      // Retired — now read from the daily energy, mood and cycle-signs answers.
      { id:"recoverySpeed", retired:true, type:"single", label:"精力恢復速度||Energy recovery speed",
        options:["1–2天內||Within 1–2 days","3天以上||3+ days","持續疲憊未恢復||Ongoing fatigue"] },
      { id:"dischargeRecovery", retired:true, type:"single", label:"分泌物恢復情況||Discharge recovery",
        options:["恢復正常||Normal","偏乾||Drier","偏黏稠||Thicker"] },
      { id:"moodStability", retired:true, type:"single", label:"整體情緒穩定度||Overall mood stability",
        options:["穩定||Stable","仍有波動||Still fluctuating"] }
    ]
  },
  // Retired section: its questions moved into 婦科觀察. Kept so earlier days
  // still read out in the calendar and analysis.
  regularday: {
    title: "平日觀察||Regular day",
    retired: true,
    condition: p => p === "平日||Regular day",
    fields: [
      { id:"discharge", retired:true, type:"multi", label:"分泌物型態||Discharge type",
        options:["乾燥||Dry","黏稠||Sticky","乳霜狀||Creamy","蛋清狀透明拉絲||Egg-white","黃色分泌物||Yellow discharge"] },
      { id:"spotting", retired:true, type:"yesno", label:"點滴出血||Spotting", options:YESNO,
        detailsTrigger:"有||Yes", details:[{ id:"colour", type:"single", label:"顏色||Colour", options:["淡紅||Pale red","褐色||Brown","鮮紅||Bright red"] }] }
    ]
  }
};

export const CYCLE_FIELD = { id:"cyclePhase", type:"single", label:"今天週期狀態||Cycle phase today",
  options:["平日||Regular day","經前||Pre-period","經期||Period","經後||Post-period"] };
export const MOOD_WORDS = ["很差||Awful","不太好||Not great","普通||Okay","不錯||Good","很好||Great"];

export const ALWAYS_ON = ["sleep","morning","tongue","general","organs","pulse","exercise","diet","skin"];
export const CONDITIONAL = ["cyclesigns","preperiod","period","postperiod"];
// Sections no longer asked, read out only when an old day has answers in them.
export const RETIRED = ["regularday"];

export const NONE_MARKERS = ["無明顯||None","無醒轉||None"];

// Japandi-muted per-section accent tokens — used sparingly (a thin top rule, never a block fill).
export const SECTION_COLORS = {
  sleep:"mauve", morning:"ochre", tongue:"clay", general:"slate",
  organs:"moss", pulse:"stone-blue", exercise:"moss", diet:"rose", skin:"ochre",
  cyclesigns:"mauve", regularday:"mauve", preperiod:"rose", period:"clay", postperiod:"moss"
};
