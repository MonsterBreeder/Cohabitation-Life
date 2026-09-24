<template>
  <view class="family-cover" data-testid="household-profile">
    <image class="family-cover__decoration" src="/static/warm-life/objects/home-cups.png" mode="aspectFit" />
    <view class="family-cover__heading" @click="emit('edit')">
      <view class="family-cover__copy">
        <text class="family-cover__eyebrow">我们的家</text>
        <text class="family-cover__name">{{ name }}</text>
        <text class="family-cover__note">一起把普通日子，好好收进睦录</text>
      </view>
      <wd-icon name="arrow-right" size="32rpx" color="#74847D" />
    </view>

    <view class="family-cover__members">
      <view
        v-for="member in members"
        :key="`${member.nickname}-${member.isSelf}`"
        class="family-cover__member"
        data-testid="family-member-real"
      >
        <view class="family-cover__avatar">
          <wd-loading v-if="isAvatarLoading(member)" color="#43C89A" size="30rpx" />
          <wd-avatar
            v-else-if="avatarSource(member)"
            :src="avatarSource(member)"
            :alt="`${member.nickname}的头像`"
            size="76rpx"
          />
          <wd-avatar v-else icon="user" bg-color="#FFFFFF" color="#267A5A" size="76rpx" />
        </view>
        <view class="family-cover__member-copy">
          <text class="family-cover__member-name">{{ member.nickname }}</text>
          <text class="family-cover__member-role">{{ member.isSelf ? '是我' : '家人' }}</text>
        </view>
      </view>

      <view
        v-if="members.length === 1"
        class="family-cover__member family-cover__member--waiting"
        data-testid="family-member-waiting"
      >
        <view class="family-cover__waiting-avatar">
          <wd-icon name="user-add" size="38rpx" color="#9DAAA4" />
        </view>
        <view class="family-cover__member-copy">
          <text class="family-cover__member-name">留一个位置</text>
          <text class="family-cover__member-role">等另一位加入</text>
        </view>
      </view>
    </view>

    <view class="family-cover__footer">
      <view class="family-cover__status">
        <view class="family-cover__status-mark" aria-hidden="true">
          <view class="family-cover__status-dot" />
          <view class="family-cover__status-dot family-cover__status-dot--peach" />
        </view>
        <text class="family-cover__status-copy">{{ familyStatus }}</text>
      </view>
      <wd-button v-if="members.length === 1 && canInvite" size="small" round plain @click="emit('invite')">
        邀请另一位
      </wd-button>
      <text v-else class="family-cover__privacy">仅家人共同可见</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { HouseholdMemberDisplay } from '../../../types/household'
import { profileAvatarSource } from '../home-view'

interface Props {
  name: string
  members: HouseholdMemberDisplay[]
  memberAvatarUrls: Record<string, string>
  memberAvatarLoading: Record<string, boolean>
  canInvite: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{ edit: []; invite: [] }>()

/** 成员状态只来自真实家庭人数，不用虚构统计填补卡片空间。 */
const familyStatus = computed(() =>
  props.members.length > 1 ? '两个人的日子，正在一起记录' : '先把自己的日子好好记下',
)

/** 内置头像直接显示；自定义头像仅使用云端签发后的临时地址。 */
function avatarSource(member: HouseholdMemberDisplay): string {
  return member.avatar.kind === 'builtin'
    ? profileAvatarSource(member.avatar.id)
    : props.memberAvatarUrls[member.avatar.resourceId] || ''
}

/** 每位成员独立显示头像加载态，避免一个地址变更让整张封面闪动。 */
function isAvatarLoading(member: HouseholdMemberDisplay): boolean {
  return member.avatar.kind === 'custom' && Boolean(props.memberAvatarLoading[member.avatar.resourceId])
}
</script>

<style lang="scss" scoped>
.family-cover {
  // 家庭封面以真实成员为主体，成对杯子只作背景装饰且不承载点击。
  position: relative;
  display: flex;
  overflow: hidden;
  flex-direction: column;
  padding: 30rpx;
  border: 1rpx solid rgba($brand-color-primary, 0.12);
  border-radius: 36rpx;
  background: #effbf5;
  box-shadow: 0 14rpx 34rpx rgba(41, 68, 58, 0.07);

  &__decoration {
    position: absolute;
    top: 16rpx;
    right: 12rpx;
    width: 176rpx;
    height: 138rpx;
    opacity: 0.86;
    pointer-events: none;
  }

  &__heading {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  // 标题区限制可用宽度，为右上角插画和进入箭头留出稳定空间。
  &__copy {
    display: flex;
    min-width: 0;
    max-width: 420rpx;
    flex-direction: column;
  }

  &__eyebrow {
    color: $brand-color-action;
    font-size: 22rpx;
    font-weight: 700;
    letter-spacing: 3rpx;
  }

  &__name {
    margin-top: 10rpx;
    overflow: hidden;
    color: $brand-color-text;
    font-size: 42rpx;
    font-weight: 800;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__note {
    margin-top: 10rpx;
    color: $brand-color-text-secondary;
    font-size: 23rpx;
  }

  &__members {
    position: relative;
    z-index: 1;
    display: flex;
    gap: 16rpx;
    margin-top: 30rpx;
  }

  // 成员改为并列的生活名牌，均匀占满横向空间，避免头像聚在左侧造成视觉失衡。
  &__member {
    display: flex;
    min-width: 0;
    flex: 1;
    align-items: center;
    gap: 12rpx;
    padding: 14rpx;
    border: 1rpx solid rgba($brand-color-primary, 0.1);
    border-radius: 22rpx;
    background: rgba(255, 255, 255, 0.68);

    &--waiting {
      opacity: 0.66;
      border-style: dashed;
    }
  }

  &__avatar,
  &__waiting-avatar {
    display: flex;
    width: 76rpx;
    height: 76rpx;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border: 4rpx solid rgba(255, 255, 255, 0.9);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.78);
  }

  &__waiting-avatar {
    border-style: dashed;
  }

  &__member-copy {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 5rpx;
  }

  &__member-name {
    overflow: hidden;
    color: $brand-color-text;
    font-size: 23rpx;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__member-role {
    overflow: hidden;
    color: $brand-color-text-secondary;
    font-size: 19rpx;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  // 底部状态条把成员区和卡片边缘收住，同时明确这里是私密的共同空间。
  &__footer {
    position: relative;
    z-index: 1;
    display: flex;
    min-height: 58rpx;
    align-items: center;
    justify-content: space-between;
    gap: 16rpx;
    margin-top: 18rpx;
    padding-top: 18rpx;
    border-top: 2rpx dashed rgba($brand-color-primary, 0.14);
  }

  &__status {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 12rpx;
  }

  &__status-mark {
    display: flex;
    align-items: center;
  }

  &__status-dot {
    width: 20rpx;
    height: 20rpx;
    border: 4rpx solid rgba(255, 255, 255, 0.9);
    border-radius: 50%;
    background: $brand-color-primary;

    &--peach {
      margin-left: -8rpx;
      background: $brand-color-accent;
    }
  }

  &__status-copy {
    overflow: hidden;
    color: $brand-color-text-secondary;
    font-size: 20rpx;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__privacy {
    flex: 0 0 auto;
    color: $brand-color-action;
    font-size: 19rpx;
  }
}
</style>
