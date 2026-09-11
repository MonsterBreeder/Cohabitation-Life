<template>
  <!-- 协议 / 隐私政策正文页：从开始使用页进入，返回时回到原入口。 -->
  <view class="legal-page">
    <view class="legal-page__header">
      <text class="legal-page__eyebrow" data-testid="legal-eyebrow">{{ document.eyebrow }}</text>
      <text class="legal-page__effective" data-testid="legal-effective">生效日期：{{ document.effectiveDate }}</text>
    </view>

    <view v-if="isPlaceholder" class="legal-page__placeholder" data-testid="legal-placeholder">
      <text class="legal-page__placeholder-title">本页正文待运营者确认</text>
      <text class="legal-page__placeholder-copy">结构与说明已就绪；运营者名称、联系渠道与保存期限等内容需由项目实际运营方提供后才能提审。</text>
    </view>

    <scroll-view class="legal-page__scroll" scroll-y>
      <view v-for="section in document.sections" :key="section.title" class="legal-page__section" data-testid="legal-section">
        <text class="legal-page__section-title">{{ section.title }}</text>
        <text v-for="(paragraph, idx) in section.paragraphs" :key="idx" class="legal-page__paragraph">{{ paragraph }}</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { formatLegalContent, type LegalDocumentKind } from './legal-content'

const kind = shallowRef<LegalDocumentKind>('agreement')

/** 加载时按 URL 参数决定当前展示的文档类型。 */
onLoad((query) => {
  if (query?.kind === 'privacy') kind.value = 'privacy'
  else kind.value = 'agreement'
  // uni-app 默认不动态修改 navigationBarTitleText；这里交给 pages.json 静态配置
})

const document = computed(() => formatLegalContent(kind.value))

/** 当前是否仍包含占位文本——用于在页面顶部提示"待运营者提供"。 */
const isPlaceholder = computed(() => {
  const placeholders = document.value.placeholders
  return [placeholders.operatorName, placeholders.contactEmail, placeholders.contactAddress, placeholders.retentionPeriod]
    .some((value) => value.includes('待运营者'))
})
</script>

<style lang="scss" scoped>
.legal-page {
  /* 法律正文页：顶部元信息 + 可滚动正文，保证小屏可完整查看。 */
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 32rpx 40rpx 64rpx;
  box-sizing: border-box;
  background: $brand-color-background;

  &__header {
    padding: 16rpx 0 24rpx;
  }
  &__eyebrow {
    display: block;
    color: $brand-color-primary;
    font-size: 24rpx;
    font-weight: 700;
    letter-spacing: 4rpx;
  }
  &__effective {
    display: block;
    margin-top: 8rpx;
    color: $brand-color-text-secondary;
    font-size: 22rpx;
  }
  &__placeholder {
    margin-bottom: 20rpx;
    padding: 24rpx 28rpx;
    border: 2rpx dashed $brand-color-accent;
    border-radius: $brand-radius-card;
    background: rgba($brand-color-accent, .08);
  }
  &__placeholder-title {
    display: block;
    color: $brand-color-text;
    font-size: 28rpx;
    font-weight: 700;
  }
  &__placeholder-copy {
    display: block;
    margin-top: 12rpx;
    color: $brand-color-text-secondary;
    font-size: 24rpx;
    line-height: 1.6;
  }
  &__scroll {
    flex: 1;
    max-height: 80vh;
  }
  &__section {
    margin-top: 28rpx;
  }
  &__section-title {
    display: block;
    color: $brand-color-text;
    font-size: 30rpx;
    font-weight: 700;
    line-height: 1.5;
  }
  &__paragraph {
    display: block;
    margin-top: 12rpx;
    color: $brand-color-text;
    font-size: 26rpx;
    line-height: 1.7;
  }
}
</style>
