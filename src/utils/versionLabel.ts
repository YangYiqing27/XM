const COLLECTION_TAG: Record<string, string> = {
  "《戏考》": "戏考",
  "《京剧汇编》": "汇编",
  "《国剧大成》": "大成",
  "《京剧丛刊》": "丛刊",
  "《京剧选编》": "选编",
  "《传统剧目汇编》": "传统汇编",
  "《戏剧丛刊》": "戏丛",
  "《京剧流派剧目荟萃》": "流派荟萃",
  "《名家剧本选》": "名家选",
  "《京剧曲谱集》": "曲谱",
  "《京剧丛书》": "丛书",
  "《戏典》": "戏典",
  "录音、唱片本": "录音",
  "录音、唱片整理本": "录音",
  "《梅兰芳演出剧本选集》": "梅兰芳本",
  "《程砚秋演出剧本选集》": "程砚秋本",
  "《翁偶虹剧作选》": "翁偶虹本",
  "梅兰芳剧本选": "梅兰芳本",
  "程砚秋剧本选": "程砚秋本",
  "尚小云剧本选": "尚小云本",
  "荀慧生剧本选": "荀慧生本",
  "马连良剧本选": "马连良本",
  "周信芳剧本选": "周信芳本",
  "余叔岩剧本选": "余叔岩本",
  "言菊朋剧本选": "言菊朋本",
  "高庆奎剧本选": "高庆奎本",
  "谭富英剧本选": "谭富英本",
  "金少山剧本选": "金少山本",
  "郝寿臣剧本选": "郝寿臣本",
  "侯喜瑞剧本选": "侯喜瑞本",
  "裘盛戎剧本选": "裘盛戎本",
  "李洪春剧本选": "李洪春本",
  "唐韵笙剧本选": "唐韵笙本",
  "汪笑侬剧本选": "汪笑侬本",
  "萧长华剧本选": "萧长华本",
  "翁偶虹剧本选": "翁偶虹本",
};

const SPECIAL_LABEL: Record<string, string> = {
  "80000001": "百代",
  "80000028": "实况",
};

export function shortCollectionTag(sourceCollection?: string): string {
  if (!sourceCollection) return "未知";
  return COLLECTION_TAG[sourceCollection] ?? sourceCollection.replace(/[《》]/g, "");
}

export function prettyVersionLabel(
  versionId: string,
  sourceCollection?: string,
  premiereYear?: number | null,
): string {
  const tag = SPECIAL_LABEL[versionId] ?? shortCollectionTag(sourceCollection);
  return premiereYear ? `${premiereYear} ${tag}` : tag;
}
