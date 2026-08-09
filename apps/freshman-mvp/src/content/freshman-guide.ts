import type { SourceRef } from '../domain/models.js';

export type FreshmanGuideSectionId = 'preparation' | 'dormitory' | 'life' | 'campus' | 'aid';

export interface FreshmanGuideSection {
  id: FreshmanGuideSectionId;
  title: string;
  summary: string;
  topics: readonly string[];
  href: string;
  headingTerms: readonly string[];
}

export const FRESHMAN_GUIDE_URL =
  'https://rcncolp2ehkb.feishu.cn/wiki/J7o6wBiJVi36wJk2VSTcyyb1nDd';

export const FRESHMAN_GUIDE_UPDATED_AT = '2026-07-30';

export const FRESHMAN_GUIDE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  '学号班级号获取': ['学号怎么查', '学号在哪看', '班级号在哪看'],
  '钉钉杭州电子科技大学认证': ['航电钉', '杭电钉', '学校钉钉', '钉钉认证'],
  '宿舍类型': ['宿舍大小', '寝室多大', '几人间'],
};

export const FRESHMAN_GUIDE_SECTIONS: readonly FreshmanGuideSection[] = [
  {
    id: 'preparation',
    title: '开学准备',
    summary: '完成学号获取、智慧杭电、钉钉认证、迎新报到、缴费、到校与医保等入学准备。',
    topics: ['智慧杭电与钉钉认证', '迎新报到与缴费', '到校、户口与医保'],
    href: `${FRESHMAN_GUIDE_URL}#JDfOd4Qt1o5MirxLrh5cI4Z8nud`,
    headingTerms: ['智慧杭电', '钉钉', '报到码', '户口迁移', '大学生医保'],
  },
  {
    id: 'dormitory',
    title: '宿舍',
    summary: '了解宿舍位置、房型、环境、宽带、费用、生活规则与入住物品。',
    topics: ['宿舍位置与房型', '宽带、费用与生活规则', '入住物品'],
    href: `${FRESHMAN_GUIDE_URL}#SF3vdsZU3o6FouxCXabcyTnUnTb`,
    headingTerms: ['寝室', '宿舍', '宽带', '入住好物'],
  },
  {
    id: 'life',
    title: '生活与地图',
    summary: '快速查找校园地图、食堂、超市、快递、自习与健身信息。',
    topics: ['校园地图', '食堂、超市与快递', '自习与健身'],
    href: `${FRESHMAN_GUIDE_URL}#Hx6JdvF58ob5DJx1mgfc93sqnyg`,
    headingTerms: ['地图', '食堂', '超市', '快递', '自习', '健身'],
  },
  {
    id: 'campus',
    title: '教学区与校园设施',
    summary: '定位图书馆、教学楼、体育场和月雅湖等常用校园空间。',
    topics: ['图书馆', '教学楼', '体育场与月雅湖'],
    href: `${FRESHMAN_GUIDE_URL}#F5hHdXMamok8Eux3E84cPWn1nQg`,
    headingTerms: ['图书馆', '教学楼', '体育场', '月雅湖'],
  },
  {
    id: 'aid',
    title: '助学政策',
    summary: '了解奖助学金、助学贷款和困难补助等助学政策。',
    topics: ['奖助学金', '助学贷款', '困难补助'],
    href: FRESHMAN_GUIDE_URL,
    headingTerms: ['助学', '助学金', '助学贷款', '奖学金'],
  },
] as const;

export function sourceForGuideHeading(sectionId: FreshmanGuideSectionId, displayTitle: string): SourceRef {
  const section = FRESHMAN_GUIDE_SECTIONS.find((candidate) => candidate.id === sectionId);
  return {
    type: 'community',
    title: `杭电新生指北 · ${displayTitle}`,
    url: section?.href ?? FRESHMAN_GUIDE_URL,
    updatedAt: FRESHMAN_GUIDE_UPDATED_AT,
  };
}

export function resolveFreshmanGuideSource(title: string, content: string): SourceRef | null {
  if (title.trim() !== '杭电新生指北') {
    return null;
  }
  const section = FRESHMAN_GUIDE_SECTIONS.find((candidate) => (
    candidate.headingTerms.some((term) => content.includes(term))
  ));
  if (!section) {
    return {
      type: 'community',
      title: '杭电新生指北',
      url: FRESHMAN_GUIDE_URL,
      updatedAt: FRESHMAN_GUIDE_UPDATED_AT,
    };
  }
  return {
    type: 'community',
    title: `杭电新生指北 · ${section.title}`,
    url: section.href,
    updatedAt: FRESHMAN_GUIDE_UPDATED_AT,
  };
}
