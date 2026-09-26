export const SEASONS = ['spring', 'summer', 'fall', 'winter'];
export const LIFECYCLES = ['sapling', 'adult', 'dead'];
export const isLivingType = type => !['rock', 'boulder', 'scree', 'basalt', 'sandstone'].includes(type);
export const objectSeason = o => o.season ?? (o.type === 'autumn' ? 'fall' : 'summer');
export const objectLife = o => o.type === 'dead-tree' ? 'dead' : (o.lifecycle ?? 'adult');
export const lifeScale = o => isLivingType(o.type) && objectLife(o) === 'sapling' ? .42 : 1;
export const variantKey = o => o.type + ':' + objectSeason(o) + ':' + objectLife(o);
export function mapVariantColor(o, fallback) {
  if (!isLivingType(o.type)) return objectSeason(o) === 'winter' ? '#c1c7c4' : fallback;
  if (objectLife(o) === 'dead') return '#86745b';
  const evergreen = ['pine', 'spruce', 'palm', 'cactus', 'yucca'].includes(o.type);
  if (objectSeason(o) === 'winter') return evergreen ? '#829b93' : '#aaa99c';
  if (objectSeason(o) === 'fall') return evergreen ? fallback : '#bb793d';
  return objectSeason(o) === 'spring' ? '#8ba960' : fallback;
}
