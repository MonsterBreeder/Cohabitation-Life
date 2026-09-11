<template>
  <!-- 邀请摘要卡片：受控的展示，不持有任何邀请原文或内部编号。 -->
  <view v-if="invitation" class="invitation-summary" data-testid="invitation-summary">
    <view class="invitation-summary__avatar">
      <image
        v-if="invitation.inviterAvatar?.kind === 'temp' && !avatarLoadFailed"
        class="invitation-summary__avatar-image"
        :src="invitation.inviterAvatar.url"
        mode="aspectFill"
        lazy-load
        :aria-label="`${invitation.inviterNickname} 头像`"
        @error="handleAvatarError"
      />
      <view v-else class="invitation-summary__avatar-fallback" :data-avatar-id="invitation.inviterAvatar?.id || 'person-neutral'">
        <text class="invitation-summary__avatar-initial">{{ initial }}</text>
      </view>
    </view>
    <text class="invitation-summary__inviter" data-testid="invitation-summary-inviter">{{ invitation.inviterNickname }}</text>
    <text class="invitation-summary__divider">邀请你加入</text>
    <text class="invitation-summary__household" data-testid="invitation-summary-household">{{ invitation.householdName }}</text>
    <text class="invitation-summary__meta" data-testid="invitation-summary-meta">目前有 {{ invitation.memberCount }} 位成员</text>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { WelcomeInvitationCard } from '../welcome-view'

interface Props {
  invitation: WelcomeInvitationCard | null
}

const props = defineProps<Props>()

/** 默认头像 fallback：取昵称首字；中文取首字符，英文取首字母。 */
const initial = computed(() => {
  const nickname = props.invitation?.inviterNickname ?? ''
  const trimmed = nickname.trim()
  if (!trimmed) return '·'
  const first = Array.from(trimmed)[0] ?? ''
  return first.toUpperCase()
})

/** 临时头像加载失败时降级为本地 fallback，避免暴露不存在的资源或长时间转圈。 */
const avatarLoadFailed = ref(false)
function handleAvatarError(): void {
  avatarLoadFailed.value = true
}
</script>

<style lang="scss" scoped>
.invitation-summary {
  /* 邀请摘要卡片：头像 + 邀请人 + 家庭名 + 成员数。 */
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 36rpx 28rpx;
  margin-top: 28rpx;
  border: 2rpx solid $brand-color-border;
  border-radius: $brand-radius-card;
  background: $brand-color-surface;

  &__avatar {
    width: 120rpx;
    height: 120rpx;
    border-radius: 50%;
    overflow: hidden;
    background: $brand-color-background;
  }
  &__avatar-image {
    width: 100%;
    height: 100%;
  }
  &__avatar-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: rgba($brand-color-primary, .15);
  }
  &__avatar-initial {
    color: $brand-color-action;
    font-size: 44rpx;
    font-weight: 700;
  }
  &__inviter {
    margin-top: 18rpx;
    color: $brand-color-text;
    font-size: 32rpx;
    font-weight: 700;
  }
  &__divider {
    margin-top: 8rpx;
    color: $brand-color-text-secondary;
    font-size: 24rpx;
  }
  &__household {
    margin-top: 6rpx;
    color: $brand-color-text;
    font-size: 36rpx;
    font-weight: 700;
  }
  &__meta {
    margin-top: 12rpx;
    color: $brand-color-text-secondary;
    font-size: 24rpx;
  }
}
</style>
