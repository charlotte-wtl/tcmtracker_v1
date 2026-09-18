// Daily-log question schema — ported verbatim (clinical content unchanged) from
// Sprint 1 (app/daily-log.html). Every user-facing string is "中文||English";
// T() in i18n.js splits on the active language at render time.

export const YESNO = ["有||Yes", "無||No"];
export const SEV3 = ["輕||Mild", "中||Moderate", "重||Severe"];
export const SEV4 = ["輕度||Mild", "中度||Moderate", "明顯||Noticeable", "超級腫||Very heavy"];

export const SCHEMA = {
  sleep: {
    title: "1. 睡眠||1. Sleep",
    fields: [
      { id:"onsetEase", type:"single", label:"入睡難易度||Sleep onset ease",
        options:["很快入睡（15分鐘內）||Fell asleep quickly (<15 min)","稍有困難（15–30分）||Somewhat difficult (15–30 min)","輾轉難眠（超過30分）||Tossed and turned (30+ min)","幾乎整夜難眠||Almost no sleep"] },
      { id:"sleepTime", type:"text", label:"入睡時間||Sleep time" },
      { id:"wakeTime", type:"text", label:"起床時間||Wake time" },
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
      { id:"energy", type:"single", label:"精力||Energy",
        options:["精疲力盡||Exhausted","疲倦||Tired","還好||OK","有活力||Energetic","精力充沛||Fully energised"] },
      { id:"mind", type:"multi", label:"心智狀態||Mind",
        options:["健忘||Forgetful","腦霧||Brain fog","平靜||Calm","有壓力||Stressed","專注||Focused","分心||Distracted","有動力||Motivated","沒動力||Unmotivated","有創意||Creative","有效率||Productive","沒效率||Unproductive"] },
      { id:"eyePuffiness", type:"yesno", label:"眼睛浮腫||Eye puffiness", options:YESNO,
        detailsTrigger:"有||Yes", details:[{ id:"sev", type:"single", label:"程度||Severity", options:SEV4 }] },
      { id:"facePuffiness", type:"yesno", label:"臉部浮腫||Face puffiness", options:YESNO,
        detailsTrigger:"有||Yes", details:[{ id:"sev", type:"single", label:"程度||Severity", options:SEV4 }] },
      { id:"nosePuffiness", type:"yesno", label:"鼻部浮腫或鼻塞||Nose puffiness/congestion", options:YESNO,
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
        ] }
    ]
  },
  tongue: {
    title: "3. 舌診||3. Tongue Diagnosis",
    fields: [
      { id:"bodyColor", type:"single", label:"舌質顏色||Tongue body colour",
        options:["淡白||Pale white","淡紅（正常）||Pale red (normal)","紅||Red","絳紅（深紅）||Crimson","暗紅或紫暗||Dark red/purplish","淡紫／青紫||Pale/bluish purple"] },
      { id:"shape", type:"multi", label:"舌形||Tongue shape",
        options:["正常大小||Normal","胖大有齒痕||Swollen, tooth-marked","瘦薄||Thin","裂紋||Cracked","芒刺||Prickles","舌尖偏紅||Red tip"] },
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
            { id:"shape", type:"single", label:"大便性狀||Stool shape", options:["偏硬顆粒狀||Hard/pellet","成形但偏乾||Formed, dry","正常香蕉狀||Normal","偏軟不成形||Soft, unformed","稀溏水便||Watery"] },
            { id:"colour", type:"single", label:"大便顏色||Stool colour", options:["正常黃褐||Normal brown","偏黑||Dark","偏綠||Greenish","偏淡／灰白||Pale/grey"] }
          ],
          "無||No": [
            { id:"status", type:"single", label:"排便狀況||Bowel status", options:["有便意但無力氣||Urge, but no strength to push","無便意||No urge at all"] }
          ]
        } },
      { id:"prevDayBowelMovement", type:"yesno", label:"昨天有解便嗎（如昨天忘記記錄，會補記到昨天的日誌）||Did you have a bowel movement yesterday? (if you forgot to log it, this adds it to yesterday's entry)", options:YESNO,
        detailsByValue: {
          "有||Yes": [
            { id:"shape", type:"single", label:"大便性狀||Stool shape", options:["偏硬顆粒狀||Hard/pellet","成形但偏乾||Formed, dry","正常香蕉狀||Normal","偏軟不成形||Soft, unformed","稀溏水便||Watery"] },
            { id:"colour", type:"single", label:"大便顏色||Stool colour", options:["正常黃褐||Normal brown","偏黑||Dark","偏綠||Greenish","偏淡／灰白||Pale/grey"] }
          ],
          "無||No": [
            { id:"status", type:"single", label:"排便狀況||Bowel status", options:["有便意但無力氣||Urge, but no strength to push","無便意||No urge at all"] }
          ]
        } },
      { id:"urineColor", type:"single", label:"小便顏色||Urine colour",
        options:["淺清||Pale/clear","正常淡黃||Normal","深黃||Dark yellow","偏紅或有灼熱感||Reddish/burning"] },
      { id:"emotions", type:"multi", label:"情緒||Emotions",
        options:["平靜||Calm","煩躁易怒||Irritable","焦慮不安||Anxious","情緒低落||Low mood","容易哭泣||Tearful","胸悶嘆氣||Chest tightness/sighing","太專注於工作||Too focused on work","思緒混亂||Chaotic thoughts"] },
      { id:"energyScore", type:"scale", label:"精力自評||Self-rated energy", min:1, max:5, minLabel:"低||Low", maxLabel:"高||High" },
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
        options:["無明顯||None","四肢沈重乏力||Heavy/weak limbs","容易瘀青||Easy bruising","唇色淡白或脫皮||Pale/peeling lips","思慮過多難以放鬆||Overthinking","大便黏膩沖不乾淨||Sticky stool"] },
      { id:"kidneySigns", type:"multi", perItemSeverity:true, label:"腎相關徵象||Kidney signs",
        options:["無明顯||None","腰膝酸軟||Sore back/knees","夜尿頻繁||Frequent night urination","畏寒下肢尤甚||Cold intolerance (legs)","耳鳴||Tinnitus","頭髮易脫落或早白||Hair loss/greying","精神疲憊腿軟無力||Fatigue, weak legs"] },
      { id:"stressSigns", type:"multi", perItemSeverity:true, label:"壓力身體徵象||Stress signs",
        options:["無明顯||None","咬牙或夜間磨牙||Jaw clenching/grinding","肩頸緊繃||Tense shoulders/neck","胸悶||Chest tightness"] },
      { id:"notes", type:"text", multiline:true, label:"備註||Notes" }
    ]
  },
  pulse: {
    title: "6. 脈診||6. Pulse Diagnosis",
    fields: [
      { id:"position", type:"single", label:"脈位||Pulse position",
        options:["浮||Floating","中取可得（正常）||Moderate (normal)","沉||Sunken"] },
      { id:"rate", type:"number", label:"脈率（次/分）||Pulse rate (beats/min)",
        detailsTrigger:"always", details:[{ id:"interp", type:"single", label:"判讀||Interpretation", options:["遲（寒）||Slow","正常||Normal","數（熱）||Rapid"] }] },
      { id:"strengthForm", type:"multi", label:"脈力與脈形||Pulse strength & form",
        options:["和緩有力（正常）||Moderate & strong","虛軟無力||Weak/soft","細如絲||Thin as thread","弦||Wiry","滑||Slippery","澀||Choppy","洪大有力||Surging","緊||Tight"] },
      { id:"sideDiff", type:"single", label:"左右手差異||L/R hand difference",
        options:["無明顯差異||None","左手較弱||Left weaker","右手較弱||Right weaker","其他||Other"] },
      { id:"weakerPosition", type:"multi", label:"較弱部位||Weaker position(s)",
        options:["左寸(心)||L-cun (Heart)","左關(肝)||L-guan (Liver)","左尺(腎)||L-chi (Kidney)","右寸(肺)||R-cun (Lung)","右關(脾)||R-guan (Spleen)","右尺(腎命門)||R-chi (Kidney/Mingmen)"] },
      { id:"strongerPosition", type:"multi", label:"較強部位||Stronger position(s)",
        options:["左寸(心)||L-cun (Heart)","左關(肝)||L-guan (Liver)","左尺(腎)||L-chi (Kidney)","右寸(肺)||R-cun (Lung)","右關(脾)||R-guan (Spleen)","右尺(腎命門)||R-chi (Kidney/Mingmen)"] }
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
  // Rendered by the daily log itself, not from `fields`: the choices are the
  // user's own cabinet items, which live in cabinet.json.
  cabinet: {
    title: "9. 藥櫃||9. Cabinet",
    dynamic: "cabinet",
    fields: [],
  },
  regularday: {
    title: "10. 平日觀察||10. Regular day",
    condition: p => p === "平日||Regular day",
    fields: [
      { id:"discharge", type:"multi", label:"分泌物型態||Discharge type",
        options:["乾燥||Dry","黏稠||Sticky","乳霜狀||Creamy","蛋清狀透明拉絲||Egg-white","黃色分泌物||Yellow discharge"] },
      { id:"spotting", type:"yesno", label:"點滴出血||Spotting", options:YESNO,
        detailsTrigger:"有||Yes", details:[{ id:"colour", type:"single", label:"顏色||Colour", options:["淡紅||Pale red","褐色||Brown","鮮紅||Bright red"] }] }
    ]
  },
  preperiod: {
    title: "10. 經前狀態||10. Pre-period",
    condition: p => p === "經前||Pre-period",
    fields: [
      { id:"breastTenderness", type:"yesno", label:"乳房脹痛||Breast tenderness", options:YESNO,
        detailsTrigger:"有||Yes", details:[{ id:"sev", type:"multi", label:"程度／性質||Severity / quality", options:["輕||Mild","中||Moderate","重||Severe","乳頭敏感||Sensitive nipples"] }] },
      { id:"abdomenPain", type:"yesno", label:"下腹或腰部脹痛||Lower abdomen/back distension", options:YESNO,
        detailsTrigger:"有||Yes", details:[{ id:"sev", type:"single", label:"程度||Severity", options:SEV3 }] },
      { id:"moodSwing", type:"single", label:"情緒波動型態||Mood swing pattern",
        options:["無明顯||None","易怒為主||Mainly irritable","易哭為主||Mainly tearful","兩者皆有||Both"] },
      { id:"edema", type:"single", label:"水腫||Fluid retention",
        options:["無||None","輕微||Mild","明顯||Noticeable"] },
      { id:"skinChange", type:"multi", label:"皮膚變化||Skin changes",
        options:["無||None","長痘||Breakouts","出油增加||Oilier","泛紅刺激||Irritated","脫皮||Flaky"] },
      { id:"discharge", type:"multi", label:"分泌物型態||Discharge type",
        options:["乾燥||Dry","黏稠||Sticky","乳霜狀||Creamy","蛋清狀透明拉絲||Egg-white","黃色分泌物||Yellow discharge"] },
      { id:"spotting", type:"yesno", label:"點滴出血||Spotting", options:YESNO,
        detailsTrigger:"有||Yes", details:[{ id:"colour", type:"single", label:"顏色||Colour", options:["淡紅||Pale red","褐色||Brown","鮮紅||Bright red"] }] },
      { id:"notes", type:"text", multiline:true, label:"睡眠或食慾變化／其他||Sleep or appetite changes / other" }
    ]
  },
  period: {
    title: "11. 經期狀態||11. Period",
    condition: p => p === "經期||Period",
    fields: [
      { id:"flow", type:"single", label:"經量||Flow",
        options:["很少||Very light","正常||Normal","偏多||Heavy","大量||Very heavy"] },
      { id:"colour", type:"single", label:"經色||Colour",
        options:["淡紅||Pale red","正紅||Bright red","暗紅||Dark red","紫黑帶血塊||Purplish-black with clots"] },
      { id:"clots", type:"single", label:"血塊||Clots",
        options:["無||None","少量細小||Small/few","大血塊||Large"] },
      { id:"texture", type:"single", label:"經質||Texture",
        options:["清稀||Thin","正常||Normal","黏稠||Thick"] },
      { id:"painType", type:"multi", label:"經期腹痛||Pain type",
        options:["冷痛喜按喜溫||Cold, relieved by warmth","脹痛||Distending","刺痛拒按||Stabbing","墜痛||Bearing-down"],
        detailsTrigger:"any", details:[{ id:"sev", type:"single", label:"程度||Severity", options:["輕度||Mild","中度||Moderate","強烈||Severe","無法忍受||Unbearable"] }] },
      { id:"backache", type:"yesno", label:"腰痠||Back soreness", options:YESNO,
        detailsTrigger:"有||Yes", details:[{ id:"sev", type:"single", label:"程度||Severity", options:SEV3 }] },
      { id:"symptoms", type:"multi", label:"伴隨症狀||Accompanying symptoms",
        options:["畏寒||Chills","噁心嘔吐||Nausea/vomiting","頭痛||Headache","乳房脹痛持續||Persistent breast pain","腹瀉||Diarrhoea","疲憊嗜睡||Fatigue","腦霧||Brain fog","潮熱||Hot flashes"] },
      { id:"notes", type:"text", multiline:true, label:"備註||Notes" }
    ]
  },
  postperiod: {
    title: "12. 經後狀態||12. Post-period",
    condition: p => p === "經後||Post-period",
    fields: [
      { id:"recoverySpeed", type:"single", label:"精力恢復速度||Energy recovery speed",
        options:["1–2天內||Within 1–2 days","3天以上||3+ days","持續疲憊未恢復||Ongoing fatigue"] },
      { id:"lingering", type:"multi", label:"是否有延續的不適||Lingering discomfort",
        options:["無||None","腰痠||Back soreness","頭暈||Dizziness","情緒低落||Low mood","持續||Ongoing"] },
      { id:"dischargeRecovery", type:"single", label:"分泌物恢復情況||Discharge recovery",
        options:["恢復正常||Normal","偏乾||Drier","偏黏稠||Thicker"] },
      { id:"moodStability", type:"single", label:"整體情緒穩定度||Overall mood stability",
        options:["穩定||Stable","仍有波動||Still fluctuating"] }
    ]
  }
};

export const CYCLE_FIELD = { id:"cyclePhase", type:"single", label:"今天週期狀態||Cycle phase today",
  options:["平日||Regular day","經前||Pre-period","經期||Period","經後||Post-period"] };
export const MOOD_WORDS = ["很差||Awful","不太好||Not great","普通||Okay","不錯||Good","很好||Great"];

export const ALWAYS_ON = ["sleep","morning","tongue","general","organs","pulse","exercise","diet","cabinet"];

// Sections outside the sequential "Done, next section" flow: shown, but never
// auto-opened and not counted as something to finish each day.
export const OUT_OF_FLOW = ["cabinet"];
export const CONDITIONAL = ["regularday","preperiod","period","postperiod"];

export const NONE_MARKERS = ["無明顯||None","無醒轉||None"];

// Japandi-muted per-section accent tokens — used sparingly (a thin top rule, never a block fill).
export const SECTION_COLORS = {
  sleep:"mauve", morning:"ochre", tongue:"clay", general:"slate",
  organs:"moss", pulse:"stone-blue", exercise:"moss", diet:"rose", cabinet:"ochre",
  regularday:"mauve", preperiod:"rose", period:"clay", postperiod:"moss"
};
