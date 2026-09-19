/** 生活页固定应用清单：首版不允许动态添加或排序，避免形成公开应用市场。 */
export interface LifeAppCard {
  id: 'hiking' | 'weight' | 'cycling' | 'star'
  name: string
  description: string
  icon: string
  tone: 'green' | 'peach' | 'sky' | 'lilac'
  enabled: boolean
}

export const LIFE_APPS: LifeAppCard[] = [
  {
    id: 'hiking',
    name: '徒步',
    description: '把一起走过的山路和回忆留住',
    icon: 'location',
    tone: 'green',
    enabled: true,
  },
  {
    id: 'weight',
    name: '减肥记录',
    description: '一起照顾好生活节奏',
    icon: 'heart',
    tone: 'peach',
    enabled: false,
  },
  {
    id: 'cycling',
    name: '骑行记录',
    description: '收藏并肩吹过的风',
    icon: 'mind-mapping',
    tone: 'sky',
    enabled: false,
  },
  {
    id: 'star',
    name: '追星记录',
    description: '记下共同喜欢的闪光时刻',
    icon: 'star',
    tone: 'lilac',
    enabled: false,
  },
]

export function lifeAppDestination(id: LifeAppCard['id']): string | null {
  return id === 'hiking' ? '/subpackages/hiking/hiking-home/index' : null
}
